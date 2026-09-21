import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { randomBytes } from 'crypto'
import { horaAgoraSP } from '@/lib/tempo'
import {
  htmlEmailCarrinho, textoEmailCarrinho, assuntoEmailCarrinho,
  primeiroNomeCarrinho, type DadosEmailCarrinho, type EtapaCarrinho,
} from '@/lib/email/carrinho'

// Carrinho abandonado: e-mail pra quem abriu o checkout e não comprou.
//
// Roda de hora em hora e pega quem parou entre HORAS_MIN e HORAS_MAX atrás.
// Carrinho de 20 dias não recebe "esqueceu algo?" — isso é spam, não resgate.
//
// Chamadas aceitas:
//   - cron da Vercel: GET com Authorization: Bearer CRON_SECRET
//   - admin logado:   POST com Authorization: Bearer <token do usuário>
//     (aceita { simular: true } pra conferir a fila sem mandar nada,
//      { horas_min, horas_max } e { ignorar_horario: true })
//
// Freio de mão: a campanha 'carrinho_abandonado' em email_campanhas. Enquanto
// o status não for 'recorrente', nada sai — e voltar pra 'pausada' desliga
// tudo sem deploy.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://justclub.com.br'
const CRON_SECRET = process.env.CRON_SECRET
const POR_LOTE = 100 // teto do endpoint de lote do Resend

// Quanto tempo esperar antes de cutucar. Menos que isso é atropelar quem só
// foi buscar o cartão na carteira.
const HORAS_MIN = 3
const HORAS_MAX = 48

// Nada de e-mail às 4 da manhã: o horário em que chega é o que decide se a
// pessoa abre ou arquiva.
const HORA_INICIO = 9
const HORA_FIM = 21

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type Candidato = {
  visita_em: string
  cliente_id: string
  cliente_nome: string
  email: string | null
  telefone: string | null
  produto_id: string
  produto_nome: string
  valor: number
  unidade_nome: string | null
  etapa: EtapaCarrinho
  ja_recebeu: boolean
  descadastrado: boolean
  bloqueado: boolean
}

/** Link de volta pro checkout daquele produto, marcado pra dar pra medir. */
function linkCheckout(produtoId: string): string {
  return `${BASE_URL}/comprar/checkout?produto=${produtoId}` +
    '&utm_source=email&utm_medium=automacao&utm_campaign=carrinho_abandonado'
}

async function disparar(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Banco não configurado no servidor' }, { status: 500 })
  }

  const supabase = supabaseAdmin()

  // Cron entra pelo segredo; pessoa entra como admin. Nada acontece antes disso.
  const auth = req.headers.get('authorization') || ''
  const ehCron = !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
  if (!ehCron) {
    const { erro: erroAuth } = await exigirAdmin(req, supabase)
    if (erroAuth) return erroAuth
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({} as any)) : ({} as any)
  const simular = !!body.simular

  const { data: campanha } = await supabase
    .from('email_campanhas')
    .select('id, status, remetente')
    .eq('campanha', 'carrinho_abandonado')
    .maybeSingle()

  if (!campanha) {
    return NextResponse.json({ error: 'Campanha de carrinho abandonado não encontrada' }, { status: 404 })
  }
  // Simular continua funcionando com a campanha pausada: é como se confere a
  // fila antes de ligar.
  if (campanha.status !== 'recorrente' && !simular) {
    console.log('[carrinho-abandonado] campanha não está recorrente, nada a fazer:', campanha.status)
    return NextResponse.json({ ok: true, pausada: true, status: campanha.status, enviados: 0 })
  }

  // Fora do horário civilizado o cron não manda — mas guarda pra próxima
  // rodada, porque a janela de horas continua valendo.
  const hora = Number((horaAgoraSP() || '12:00').slice(0, 2))
  if (!body.ignorar_horario && !simular && (hora < HORA_INICIO || hora >= HORA_FIM)) {
    return NextResponse.json({ ok: true, fora_do_horario: true, hora, enviados: 0 })
  }

  const chaveResend = process.env.RESEND_API_KEY_MARKETING || process.env.RESEND_API_KEY
  if (!chaveResend && !simular) {
    return NextResponse.json(
      { error: 'Falta a RESEND_API_KEY_MARKETING no servidor (chave do Resend com acesso ao domínio da campanha).' },
      { status: 500 }
    )
  }

  const horasMin = Number.isFinite(Number(body.horas_min)) ? Number(body.horas_min) : HORAS_MIN
  const horasMax = Number.isFinite(Number(body.horas_max)) ? Number(body.horas_max) : HORAS_MAX

  const { data: linhas, error: errRpc } = await supabase
    .rpc('carrinhos_abandonados_email', { p_horas_min: horasMin, p_horas_max: horasMax })

  if (errRpc) {
    console.error('[carrinho-abandonado] erro ao buscar candidatos:', errRpc)
    return NextResponse.json({ error: 'Erro ao buscar carrinhos: ' + errRpc.message }, { status: 500 })
  }

  const candidatos = (linhas || []) as Candidato[]

  // Supressões, nesta ordem. Contadas pra conferir a fila depois.
  const pulados = { ja_recebeu: 0, descadastrado: 0, sem_email: 0, bloqueado: 0 }
  const aprovados: Candidato[] = []

  for (const c of candidatos) {
    if (c.ja_recebeu) { pulados.ja_recebeu++; continue }
    if (c.descadastrado) { pulados.descadastrado++; continue }
    if (!c.email || !EMAIL_VALIDO.test(c.email.trim())) { pulados.sem_email++; continue }
    // Quem está bloqueado por cobrança não recebe convite pra comprar de novo.
    if (c.bloqueado) { pulados.bloqueado++; continue }
    aprovados.push(c)
  }

  const resumo = {
    ok: true,
    horas_min: horasMin,
    horas_max: horasMax,
    carrinhos: candidatos.length,
    aprovados: aprovados.length,
    pulados,
  }

  if (simular) {
    return NextResponse.json({
      ...resumo,
      simulacao: true,
      status_campanha: campanha.status,
      fila: aprovados.map(a => ({
        nome: a.cliente_nome, email: a.email, produto: a.produto_nome,
        valor: a.valor, etapa: a.etapa, unidade: a.unidade_nome, visita_em: a.visita_em,
      })),
    })
  }

  if (aprovados.length === 0) {
    return NextResponse.json({ ...resumo, enviados: 0 })
  }

  // ── Grava antes de mandar: token, disparo e a linha do carrinho ────────────
  type Pronto = { c: Candidato; token: string; disparoId: string; carrinhoId: string }
  const prontos: Pronto[] = []

  for (const c of aprovados) {
    // 32 hex minúsculos: é o formato que o /api/descadastro valida.
    const token = randomBytes(16).toString('hex')

    const { data: disparo, error: errDisparo } = await supabase
      .from('email_disparos')
      .insert({
        campanha_id: campanha.id,
        cliente_id: c.cliente_id,
        email: c.email!.trim(),
        token,
        status: 'pendente',
      })
      .select('id')
      .single()

    if (errDisparo || !disparo) {
      // Acontece quando o e-mail já tem disparo nesta campanha (dois cadastros
      // com o mesmo e-mail, ou a pessoa já foi cutucada uma vez). Pula e segue.
      console.error('[carrinho-abandonado] não gravou o disparo de', c.email, errDisparo?.message)
      continue
    }

    const { data: reg, error: errReg } = await supabase
      .from('carrinho_emails')
      .insert({
        cliente_id: c.cliente_id,
        produto_id: c.produto_id,
        disparo_id: disparo.id,
        token,
        etapa: c.etapa,
        visita_em: c.visita_em,
      })
      .select('id')
      .single()

    if (errReg || !reg) {
      // Índice único por cliente+produto: se chegou aqui é corrida entre duas
      // rodadas. Marca o disparo como pulado pra não sair e-mail repetido.
      console.error('[carrinho-abandonado] não gravou o registro de', c.email, errReg?.message)
      await supabase.from('email_disparos')
        .update({ status: 'pulado', erro: 'carrinho_emails duplicado' }).eq('id', disparo.id)
      continue
    }

    prontos.push({ c, token, disparoId: disparo.id, carrinhoId: reg.id })
  }

  // ── Envia em lotes de 100 ─────────────────────────────────────────────────
  const resend = new Resend(chaveResend)
  let enviados = 0
  let erros = 0

  for (let i = 0; i < prontos.length; i += POR_LOTE) {
    const lote = prontos.slice(i, i + POR_LOTE)

    const mensagens = lote.map(p => {
      const dados: DadosEmailCarrinho = {
        nome: primeiroNomeCarrinho(p.c.cliente_nome),
        etapa: p.c.etapa,
        produtoNome: p.c.produto_nome,
        valor: p.c.valor,
        unidadeNome: p.c.unidade_nome,
        linkCheckout: linkCheckout(p.c.produto_id),
        linkDescadastro: `${BASE_URL}/descadastro?t=${p.token}`,
      }
      return {
        from: campanha.remetente as string,
        to: p.c.email!.trim(),
        subject: assuntoEmailCarrinho(p.c.etapa),
        html: htmlEmailCarrinho(dados),
        text: textoEmailCarrinho(dados),
        // Descadastro em um clique no cabeçalho: a pessoa sai sem marcar como
        // spam, que é o que derruba a reputação do domínio. Aqui vai a URL da
        // API (o Gmail faz POST), não a da página.
        headers: {
          'List-Unsubscribe': `<${BASE_URL}/api/descadastro?t=${p.token}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
    })

    const { data: resposta, error: errLote } = await resend.batch.send(mensagens)

    if (errLote) {
      // A linha de carrinho_emails FICA, sem enviado_em: é justamente esse o
      // sinal de que houve falha. Não reenvia sozinho.
      console.error('[carrinho-abandonado] falha no lote do Resend:', errLote)
      await supabase.from('email_disparos')
        .update({
          status: 'erro',
          erro: (errLote.message || 'erro do Resend').slice(0, 300),
          enviado_em: new Date().toISOString(),
        })
        .in('id', lote.map(l => l.disparoId))
      erros += lote.length
      continue
    }

    // A resposta vem na mesma ordem do que foi mandado.
    const idsResend: any[] = (resposta as any)?.data || []
    const agora = new Date().toISOString()
    await Promise.all(lote.flatMap((p, idx) => [
      supabase.from('email_disparos').update({
        status: 'enviado',
        resend_id: idsResend[idx]?.id || null,
        enviado_em: agora,
      }).eq('id', p.disparoId),
      supabase.from('carrinho_emails').update({ enviado_em: agora }).eq('id', p.carrinhoId),
    ]))
    enviados += lote.length
  }

  console.log(`[carrinho-abandonado] ${candidatos.length} carrinhos, ${enviados} enviados, ${erros} com erro`, pulados)
  return NextResponse.json({ ...resumo, enviados, erros })
}

export async function GET(req: NextRequest) {
  try {
    return await disparar(req)
  } catch (err: any) {
    console.error('Erro inesperado em /api/carrinho-abandonado/disparar:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    return await disparar(req)
  } catch (err: any) {
    console.error('Erro inesperado em /api/carrinho-abandonado/disparar:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
