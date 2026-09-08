import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { htmlEmailCampanha, textoEmailCampanha, primeiroNome } from '@/lib/email/campanha'

// Manda UMA rodada da campanha e para. O teto por rodada é a rampa: subdomínio
// novo não tem reputação, então começa baixo e vai subindo ao longo dos dias.
//
// Dá pra chamar de dois jeitos:
//   - admin logado, pelo botão da tela (Authorization: Bearer <token do usuário>)
//   - cron, com Authorization: Bearer <CRON_SECRET>
//
// Nunca envia a campanha inteira de uma vez, mesmo que a fila tenha 44 mil.

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://justclub.com.br'
const CRON_SECRET = process.env.CRON_SECRET
const POR_LOTE = 100 // teto do endpoint de lote do Resend

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Banco não configurado no servidor' }, { status: 500 })
    }

    const supabase = supabaseAdmin()

    // Autenticação ANTES de qualquer outra checagem: quem não é admin nem cron
    // leva 401 e pronto, sem descobrir o que está ou não configurado aqui.
    // Cron entra pelo segredo; pessoa entra como admin.
    const auth = req.headers.get('authorization') || ''
    const ehCron = !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
    if (!ehCron) {
      const { erro: erroAuth } = await exigirAdmin(req, supabase)
      if (erroAuth) return erroAuth
    }

    // Chave PRÓPRIA do disparo, separada da transacional de propósito.
    //
    // A chave "Coach CT Produção" é restrita ao justct.com.br — mandar pelo
    // justclubct.com.br com ela volta "This API key is not authorized to send
    // emails from justclubct.com.br". E trocar aquela chave por uma de acesso
    // amplo mexeria justamente no que entrega reset de senha e confirmação de
    // reserva. Então a promoção ganha a sua, e a transacional não é tocada.
    const chaveResend = process.env.RESEND_API_KEY_MARKETING || process.env.RESEND_API_KEY
    if (!chaveResend) {
      return NextResponse.json(
        { error: 'Falta a RESEND_API_KEY_MARKETING no servidor (chave do Resend com acesso ao domínio da campanha).' },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const campanhaId = String(body.campanha_id || '').trim()
    if (!campanhaId) {
      return NextResponse.json({ error: 'campanha_id é obrigatório' }, { status: 400 })
    }

    const { data: campanha } = await supabase
      .from('email_campanhas').select('*').eq('id', campanhaId).maybeSingle()

    if (!campanha) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
    }
    if (campanha.status === 'pausada') {
      return NextResponse.json({ ok: true, pausada: true, enviados: 0 })
    }

    // Pega só o teto desta rodada, na ordem da fila: quem tem atividade mais
    // recente primeiro. Os primeiros lotes de um domínio novo são os que
    // constroem a reputação dele — têm que ir pra quem abre e não denuncia.
    const { data: fila } = await supabase
      .from('email_disparos')
      .select('id, email, token, cliente_id')
      .eq('campanha_id', campanhaId)
      .eq('status', 'pendente')
      .order('ordem', { ascending: true, nullsFirst: false })
      .limit(campanha.teto_por_rodada)

    if (!fila || fila.length === 0) {
      await supabase.from('email_campanhas')
        .update({ status: 'concluida' }).eq('id', campanhaId)
      return NextResponse.json({ ok: true, enviados: 0, restantes: 0, concluida: true })
    }

    if (campanha.status !== 'enviando') {
      await supabase.from('email_campanhas').update({ status: 'enviando' }).eq('id', campanhaId)
    }

    // Nome só pra saudação. Uma busca só, não uma por e-mail.
    const ids = fila.map(f => f.cliente_id).filter(Boolean) as string[]
    const nomePorCliente: Record<string, string> = {}
    if (ids.length) {
      const { data: clientes } = await supabase
        .from('clientes').select('id, nome').in('id', ids)
      for (const c of (clientes || [])) nomePorCliente[c.id] = c.nome
    }

    let enviados = 0
    let erros = 0
    const resend = new Resend(chaveResend)

    for (let i = 0; i < fila.length; i += POR_LOTE) {
      const lote = fila.slice(i, i + POR_LOTE)

      const mensagens = lote.map(d => {
        const dados = {
          link: campanha.link as string,
          linkDescadastro: `${BASE_URL}/descadastro?t=${d.token}`,
          nome: primeiroNome(d.cliente_id ? nomePorCliente[d.cliente_id] : ''),
        }
        return {
          from: campanha.remetente as string,
          to: d.email as string,
          subject: campanha.assunto as string,
          html: htmlEmailCampanha(dados),
          text: textoEmailCampanha(dados),
          // Descadastro em um clique, direto no cabeçalho: o Gmail mostra o
          // botão nativo e a pessoa sai sem precisar marcar como spam — que é
          // justamente o que derruba a reputação do domínio.
          //
          // Aqui vai a URL da API, não a da página: o Gmail faz POST nela. A
          // página (que abre no clique do rodapé) pede confirmação, senão
          // robô de antivírus que abre link acabaria descadastrando todo mundo.
          headers: {
            'List-Unsubscribe': `<${BASE_URL}/api/descadastro?t=${d.token}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      })

      const { data: resposta, error: errLote } = await resend.batch.send(mensagens)

      if (errLote) {
        console.error('Falha no lote do Resend:', errLote)
        await supabase.from('email_disparos')
          .update({ status: 'erro', erro: (errLote.message || 'erro do Resend').slice(0, 300), enviado_em: new Date().toISOString() })
          .in('id', lote.map(l => l.id))
        erros += lote.length
        continue
      }

      // A resposta vem na mesma ordem do que foi mandado.
      const idsResend: any[] = (resposta as any)?.data || []
      const agora = new Date().toISOString()
      await Promise.all(lote.map((d, idx) =>
        supabase.from('email_disparos').update({
          status: 'enviado',
          resend_id: idsResend[idx]?.id || null,
          enviado_em: agora,
        }).eq('id', d.id)
      ))
      enviados += lote.length
    }

    const { count: restantes } = await supabase
      .from('email_disparos')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', campanhaId)
      .eq('status', 'pendente')

    if ((restantes || 0) === 0) {
      await supabase.from('email_campanhas').update({ status: 'concluida' }).eq('id', campanhaId)
    }

    return NextResponse.json({ ok: true, enviados, erros, restantes: restantes || 0 })
  } catch (err: any) {
    console.error('Erro inesperado em /api/email-campanha/enviar:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
