// src/app/api/instagram/teste-responder/route.ts
//
// Rota TEMPORÁRIA para demonstrar o uso da API de mensagens do Instagram em
// modo de teste (o webhook de entrada não dispara enquanto o app não é
// publicado). Ela LÊ a conversa mais recente do @justclub.ct, roda o agente
// na última mensagem do usuário e RESPONDE pela API (graph.instagram.com).
//
// Serve para: (1) gerar uma chamada de API bem-sucedida com a permissão; e
// (2) fazer a resposta do agente aparecer na DM → material para o screencast
// do App Review. APAGAR após a aprovação.
//
// Uso: GET /api/instagram/teste-responder?token=WHATSAPP_TEST_TOKEN

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/whatsapp/consultas'
import { responderInstagram } from '@/lib/instagram/agente-info'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const V = 'v21.0'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  // Usa o INSTAGRAM_VERIFY_TOKEN (já configurado no Vercel) como senha da rota,
  // com fallback pro WHATSAPP_TEST_TOKEN.
  const esperado = process.env.INSTAGRAM_VERIFY_TOKEN ?? process.env.WHATSAPP_TEST_TOKEN
  if (!esperado || token !== esperado) {
    return NextResponse.json({ error: 'token inválido' }, { status: 403 })
  }

  const igToken = process.env.INSTAGRAM_TOKEN
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID
  if (!igToken || !accountId) {
    return NextResponse.json({ error: 'INSTAGRAM_TOKEN ou INSTAGRAM_ACCOUNT_ID ausente' }, { status: 500 })
  }

  const diag: any = { passos: [] }

  try {
    // 1) Lê as conversas (chamada de API usando a permissão de mensagens).
    const convUrl = `https://graph.instagram.com/${V}/me/conversations?platform=instagram&fields=participants,messages{message,from,created_time}&access_token=${encodeURIComponent(igToken)}`
    const convResp = await fetch(convUrl, { cache: 'no-store' })
    const convData = await convResp.json().catch(() => ({}))
    diag.passos.push({ passo: 'GET conversations', status: convResp.status, ok: convResp.ok })
    if (!convResp.ok) { diag.conversationsError = convData; return NextResponse.json(diag, { status: 200 }) }

    const conversas = convData?.data ?? []
    if (!conversas.length) { diag.aviso = 'nenhuma conversa encontrada'; diag.raw = convData; return NextResponse.json(diag, { status: 200 }) }

    // 2) Acha o usuário (participante que não é a conta) e a última msg dele.
    const conv = conversas[0]
    const parts = conv?.participants?.data ?? []
    const usuario = parts.find((p: any) => String(p.id) !== String(accountId)) ?? parts[0]
    const igsid = usuario?.id
    const msgs = conv?.messages?.data ?? []
    const ultimaDoUsuario = msgs.find((m: any) => String(m?.from?.id) === String(igsid))
    const texto = (ultimaDoUsuario?.message || searchParams.get('texto') || 'Olá!').toString()
    diag.usuario = usuario?.username ?? null
    diag.igsid = igsid ?? null
    diag.textoUsuario = texto

    if (!igsid) { diag.erro = 'não consegui identificar o IGSID do usuário'; return NextResponse.json(diag, { status: 200 }) }

    // 3) Roda o agente e responde pela API.
    const supabase = createServiceSupabase()
    const resposta = await responderInstagram({ supabase, mensagem: texto })
    diag.resposta = resposta

    const sendResp = await fetch(`https://graph.instagram.com/${V}/${accountId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${igToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: igsid }, message: { text: resposta } }),
    })
    const sendBody = await sendResp.json().catch(() => ({}))
    diag.passos.push({ passo: 'POST messages', status: sendResp.status, ok: sendResp.ok })
    diag.sendBody = sendBody

    return NextResponse.json(diag, { status: 200 })
  } catch (e: any) {
    diag.erroGeral = e?.message ?? 'erro'
    return NextResponse.json(diag, { status: 200 })
  }
}
