// src/app/api/admin/instagram/enviar/route.ts
//
// Envio MANUAL de DM por um atendente (admin/coordenadora) numa conversa do
// Instagram que foi "assumida" no painel /admin/conversas-instagram.
// Manda pelo Instagram (Graph API) e registra com autor='humano'.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarTextoInstagram, salvarMensagemInstagram } from '@/lib/instagram/canal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer '))
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

    const { data: perfil } = await supabase.from('perfis').select('id, role').eq('id', user.id).maybeSingle()
    if (!perfil || !['admin', 'coordenadora'].includes(perfil.role))
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const igsid = String(body?.igsid ?? '').trim()
    const texto = String(body?.texto ?? '').trim()
    if (!igsid) return NextResponse.json({ error: 'Conversa inválida' }, { status: 400 })
    if (!texto) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

    await enviarTextoInstagram(igsid, texto)
    await salvarMensagemInstagram(supabase, { igsid, role: 'assistant', conteudo: texto, autor: 'humano' })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro ao enviar' }, { status: 500 })
  }
}
