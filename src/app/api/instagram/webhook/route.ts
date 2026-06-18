// src/app/api/instagram/webhook/route.ts
//
// Webhook do Instagram (Direct). Mesmo padrão do WhatsApp:
// GET  = verificação da Meta (hub.challenge).
// POST = valida assinatura, responde 200 rápido, processa em background.
//
// IMPORTANTE (anti-automação indevida): só responde DM de TEXTO real.
// Ignora is_echo (msg que a própria conta enviou), reações, "visto", e
// mensagens sem texto (menção em story, anexos, figurinhas, etc.).

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import crypto from 'crypto'
import { createServiceSupabase, registrarAcessoLgpd } from '@/lib/whatsapp/consultas'
import { responderInstagram } from '@/lib/instagram/agente-info'
import { enviarTextoInstagram, carregarHistoricoInstagram, salvarMensagemInstagram } from '@/lib/instagram/canal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET — verificação do webhook (Meta)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// ---------------------------------------------------------------------------
// POST — evento recebido
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const raw = await req.text()

  // Valida a assinatura (HMAC SHA-256). No fluxo "login do Instagram" o payload
  // é assinado com a CHAVE SECRETA DO APP DO INSTAGRAM (fallback p/ o secret geral).
  const assinatura = req.headers.get('x-hub-signature-256') ?? ''
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET
  let assinaturaOk = false
  if (appSecret && assinatura) {
    const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex')
    assinaturaOk =
      assinatura.length === esperado.length &&
      crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado))
  }

  // DEBUG: registra QUALQUER POST que chega (antes de validar) p/ diagnóstico.
  waitUntil((async () => {
    try {
      const s = createServiceSupabase()
      await registrarAcessoLgpd(s, {
        telefone: 'instagram',
        acao: 'ig_inbound',
        detalhe: { temSecret: !!appSecret, temAssinatura: !!assinatura, assinaturaOk, body: raw.slice(0, 800) },
      })
    } catch {}
  })())

  if (appSecret && !assinaturaOk) return new NextResponse('Invalid signature', { status: 403 })

  let body: any
  try { body = JSON.parse(raw) } catch { return new NextResponse('OK', { status: 200 }) }

  // Coleta os eventos de mensagem (formato messaging do Instagram).
  const entries: any[] = Array.isArray(body?.entry) ? body.entry : []
  for (const entry of entries) {
    const eventos: any[] = Array.isArray(entry?.messaging) ? entry.messaging : []
    for (const ev of eventos) {
      const msg = ev?.message
      // Ignora: sem mensagem, echo (nós mesmos), reações/visto, e msg sem texto
      // (menção em story, anexos, figurinhas...).
      if (!msg || msg.is_echo) continue
      const texto = String(msg.text ?? '').trim()
      if (!texto) continue
      const igsid = String(ev?.sender?.id ?? '')
      if (!igsid) continue
      waitUntil(processar(igsid, texto))
    }
  }

  return new NextResponse('OK', { status: 200 })
}

// ---------------------------------------------------------------------------
// Processamento em background
// ---------------------------------------------------------------------------
async function processar(igsid: string, texto: string): Promise<void> {
  try {
    const supabase = createServiceSupabase()
    const historico = await carregarHistoricoInstagram(supabase, igsid)
    await salvarMensagemInstagram(supabase, { igsid, role: 'user', conteudo: texto })

    const resposta = await responderInstagram({ supabase, mensagem: texto, historico })

    await salvarMensagemInstagram(supabase, { igsid, role: 'assistant', conteudo: resposta })
    await enviarTextoInstagram(igsid, resposta)
  } catch (e: any) {
    console.error('[instagram/webhook] erro no processamento:', e?.message)
  }
}
