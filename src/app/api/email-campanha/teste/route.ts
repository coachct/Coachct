import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { htmlEmailCampanha, textoEmailCampanha, primeiroNome } from '@/lib/email/campanha'

// Manda UM e-mail de teste, para o endereço que o admin digitar.
//
// Não encosta na fila: ninguém sai de 'pendente', nada é marcado como enviado.
// Serve pra ver a arte chegando numa caixa de entrada de verdade antes de
// disparar pra 44 mil — Gmail e Outlook renderizam diferente da prévia.
//
// Usa a mesma chave, o mesmo remetente e o mesmo link da campanha, então o que
// chegar aqui é exatamente o que o cliente vai receber.
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://justclub.com.br'

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Banco não configurado no servidor' }, { status: 500 })
    }

    const supabase = supabaseAdmin()
    const { erro: erroAuth } = await exigirAdmin(req, supabase)
    if (erroAuth) return erroAuth

    const chaveResend = process.env.RESEND_API_KEY_MARKETING || process.env.RESEND_API_KEY
    if (!chaveResend) {
      return NextResponse.json(
        { error: 'Falta a RESEND_API_KEY_MARKETING no servidor.' }, { status: 500 }
      )
    }

    const body = await req.json()
    const campanhaId = String(body.campanha_id || '').trim()
    const para = String(body.email || '').trim().toLowerCase()

    if (!campanhaId) return NextResponse.json({ error: 'campanha_id é obrigatório' }, { status: 400 })
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) {
      return NextResponse.json({ error: 'Digite um e-mail válido para o teste.' }, { status: 400 })
    }

    const { data: campanha } = await supabase
      .from('email_campanhas').select('*').eq('id', campanhaId).maybeSingle()
    if (!campanha) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })

    // Se o e-mail for de um cliente, usa o primeiro nome dele — assim o teste
    // mostra também a saudação personalizada, do jeito que vai sair.
    const { data: cliente } = await supabase
      .from('clientes').select('nome').ilike('email', para).limit(1).maybeSingle()

    const dados = {
      link: campanha.link as string,
      // Token de teste de propósito: o link existe e abre a página, mas não
      // descadastra ninguém de verdade.
      linkDescadastro: `${BASE_URL}/descadastro?t=teste`,
      nome: primeiroNome(cliente?.nome),
    }

    const resend = new Resend(chaveResend)
    const { data, error } = await resend.emails.send({
      from: campanha.remetente as string,
      to: para,
      subject: `[TESTE] ${campanha.assunto}`,
      html: htmlEmailCampanha(dados),
      text: textoEmailCampanha(dados),
    })

    if (error) {
      console.error('Falha no e-mail de teste:', error)
      return NextResponse.json({ error: error.message || 'O Resend recusou o envio.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, id: (data as any)?.id || null, para })
  } catch (err) {
    console.error('Erro inesperado em /api/email-campanha/teste:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
