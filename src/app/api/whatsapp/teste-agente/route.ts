// src/app/api/whatsapp/teste-agente/route.ts
//
// Rota TEMPORÁRIA para conversar com o agente da Just CT antes de ter o número
// do WhatsApp. Identifica o cliente pelo telefone e responde via Claude.
//
// Uso:  GET /api/whatsapp/teste-agente?tel=11999998888&msg=quanto%20de%20credito%20eu%20tenho&token=SEU_TOKEN
//
// Protegida pela env WHATSAPP_TEST_TOKEN. Precisa também de ANTHROPIC_API_KEY.
// Apagar quando o agente estiver no ar.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase, identificarClientePorTelefone } from '@/lib/whatsapp/consultas'
import { responderMensagem, type TurnoConversa } from '@/lib/whatsapp/agente'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST: conversa multi-turno. Body: { tel, mensagem, historico:[{role,content}], token }
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const esperado = process.env.WHATSAPP_TEST_TOKEN
  if (!esperado) return NextResponse.json({ error: 'Rota desligada.' }, { status: 403 })
  if (body.token !== esperado) return NextResponse.json({ error: 'Token inválido.' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Falta ANTHROPIC_API_KEY.' }, { status: 500 })
  if (!body.tel || !body.mensagem) return NextResponse.json({ error: 'Informe tel e mensagem.' }, { status: 400 })

  try {
    const supabase = createServiceSupabase()
    const ident = await identificarClientePorTelefone(supabase, String(body.tel))
    if (ident.status !== 'ok') return NextResponse.json({ identificacao: ident })

    const historico: TurnoConversa[] = Array.isArray(body.historico) ? body.historico : []
    const registroTools: string[] = []
    const resposta = await responderMensagem({
      supabase,
      cliente: ident.cliente,
      mensagem: String(body.mensagem),
      historico,
      registroTools,
    })
    return NextResponse.json({ resposta, tools: registroTools })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') ?? req.headers.get('x-test-token')
  const esperado = process.env.WHATSAPP_TEST_TOKEN

  if (!esperado) {
    return NextResponse.json({ error: 'Rota de teste desligada — defina WHATSAPP_TEST_TOKEN.' }, { status: 403 })
  }
  if (token !== esperado) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 403 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Falta a ANTHROPIC_API_KEY no ambiente.' }, { status: 500 })
  }

  const tel = searchParams.get('tel')
  const msg = searchParams.get('msg')
  if (!tel || !msg) {
    return NextResponse.json({ error: 'Informe ?tel=DDD+numero&msg=sua+mensagem' }, { status: 400 })
  }

  try {
    const supabase = createServiceSupabase()
    const ident = await identificarClientePorTelefone(supabase, tel)
    if (ident.status !== 'ok') {
      return NextResponse.json({ identificacao: ident })
    }

    const registroTools: string[] = []
    const resposta = await responderMensagem({
      supabase,
      cliente: ident.cliente,
      mensagem: msg,
      registroTools,
    })

    return NextResponse.json({
      cliente: ident.cliente.nome,
      pergunta: msg,
      resposta,
      tools: registroTools,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
