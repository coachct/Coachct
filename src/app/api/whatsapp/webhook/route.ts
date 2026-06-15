// src/app/api/whatsapp/webhook/route.ts
//
// Webhook do WhatsApp (Meta Cloud API) — mesmo padrão do webhook Wellhub:
// valida assinatura, responde 200 rápido, processa em background (waitUntil).
//
// GET  = verificação da Meta (hub.challenge).
// POST = mensagem recebida → identifica cliente → agente → responde via Graph API.

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import crypto from 'crypto'
import {
  createServiceSupabase,
  identificarClientePorTelefone,
  normalizarTelefone,
  registrarAcessoLgpd,
} from '@/lib/whatsapp/consultas'
import { responderMensagem } from '@/lib/whatsapp/agente'
import { enviarTexto, carregarHistorico, salvarMensagem } from '@/lib/whatsapp/canal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AVISO_LGPD =
  'Olá! Sou o assistente virtual da Just CT. Para te atender, acesso seus dados cadastrais (nome, plano, agendamentos). Ao continuar, você concorda com nossa Política de Privacidade. Para parar de receber mensagens, envie PARAR.'

// ---------------------------------------------------------------------------
// GET — verificação do webhook (Meta)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// ---------------------------------------------------------------------------
// POST — mensagem recebida
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const raw = await req.text()

  // Valida a assinatura (HMAC SHA-256 com o App Secret).
  const assinatura = req.headers.get('x-hub-signature-256') ?? ''
  const appSecret = process.env.META_APP_SECRET
  if (appSecret) {
    const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex')
    const ok =
      assinatura.length === esperado.length &&
      crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado))
    if (!ok) return new NextResponse('Invalid signature', { status: 403 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return new NextResponse('OK', { status: 200 }) }

  const value = body?.entry?.[0]?.changes?.[0]?.value

  // DEBUG: registra status de entrega (sent/delivered/failed) pra diagnóstico.
  const statuses = value?.statuses
  if (Array.isArray(statuses) && statuses.length) {
    waitUntil((async () => {
      try {
        const supabase = createServiceSupabase()
        for (const s of statuses) {
          await registrarAcessoLgpd(supabase, { telefone: s?.recipient_id ?? null, acao: 'wa_status', detalhe: s })
        }
      } catch {}
    })())
    return new NextResponse('OK', { status: 200 })
  }

  // Extrai a primeira mensagem de texto.
  const msg = value?.messages?.[0]
  if (!msg || msg.type !== 'text') {
    return new NextResponse('OK', { status: 200 }) // nada a fazer
  }

  const de = String(msg.from ?? '')
  const texto = String(msg.text?.body ?? '').trim()

  // Responde 200 rápido e processa em segundo plano.
  waitUntil(processar(de, texto))
  return new NextResponse('OK', { status: 200 })
}

// ---------------------------------------------------------------------------
// Processamento em background
// ---------------------------------------------------------------------------
async function processar(de: string, texto: string): Promise<void> {
  try {
    const supabase = createServiceSupabase()
    const telefone = normalizarTelefone(de)

    // DEBUG: registra que a mensagem chegou no nosso webhook (antes de tudo).
    await registrarAcessoLgpd(supabase, { telefone, acao: 'wa_inbound', detalhe: { de, texto } })

    const ident = await identificarClientePorTelefone(supabase, de)

    // Número não cadastrado → orienta (cadastro por CPF fica como melhoria futura).
    if (ident.status === 'nao_encontrado') {
      await enviarTexto(de, 'Oi! Não encontrei seu número no nosso cadastro. Procure a recepção da Just CT para vincular seu WhatsApp e eu poder te atender por aqui. 😊')
      return
    }
    if (ident.status !== 'ok') {
      await enviarTexto(de, 'Tive um probleminha para te identificar agora. Pode tentar de novo em instantes?')
      return
    }
    const cliente = ident.cliente

    // Comando PARAR (opt-out) — para qualquer mensagem que seja só "parar".
    if (texto.toLowerCase().replace(/\W/g, '') === 'parar') {
      await supabase.from('clientes').update({ whatsapp_opt_out: true }).eq('id', cliente.id)
      await registrarAcessoLgpd(supabase, { clienteId: cliente.id, telefone, acao: 'opt_out_parar' })
      await enviarTexto(de, 'Pronto, você não receberá mais mensagens por aqui. Se mudar de ideia, é só falar com a recepção. 👋')
      return
    }

    // Respeita opt-out anterior.
    if (cliente.whatsapp_opt_out) return

    // Primeira interação → aviso de privacidade (LGPD) + registra consentimento.
    let prefixo = ''
    if (!cliente.lgpd_consentimento_em) {
      await supabase.from('clientes').update({ lgpd_consentimento_em: new Date().toISOString(), lgpd_canal: 'whatsapp' }).eq('id', cliente.id)
      prefixo = AVISO_LGPD + '\n\n'
    }

    // Histórico + agente.
    const historico = await carregarHistorico(supabase, telefone)
    await salvarMensagem(supabase, { telefone, clienteId: cliente.id, role: 'user', conteudo: texto })

    const resposta = await responderMensagem({ supabase, cliente, mensagem: texto, historico })
    const respostaFinal = prefixo + resposta

    await salvarMensagem(supabase, { telefone, clienteId: cliente.id, role: 'assistant', conteudo: resposta })
    await enviarTexto(de, respostaFinal)
  } catch (e: any) {
    console.error('[whatsapp/webhook] erro no processamento:', e?.message)
    try { await enviarTexto(de, 'Tive um erro aqui. Pode tentar de novo em instantes?') } catch {}
  }
}
