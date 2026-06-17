// src/app/api/admin/whatsapp/enviar/route.ts
//
// Envio MANUAL de mensagem por um atendente (admin/coordenadora) numa conversa
// que foi "assumida" no painel /admin/conversas. Manda pelo WhatsApp (Graph API)
// e registra em whatsapp_mensagens com autor='humano'.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarTexto } from '@/lib/whatsapp/canal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Auth: Bearer token do usuário logado + checagem de papel.
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
    const telefone = String(body?.telefone ?? '').replace(/\D/g, '')
    const texto = String(body?.texto ?? '').trim()
    if (telefone.length < 10 || telefone.length > 11)
      return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })
    if (!texto) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

    // Envia pelo WhatsApp. O destinatário no Brasil é 55 + DDD + número.
    await enviarTexto(`55${telefone}`, texto)

    // Resolve o cliente vinculado a esse telefone (última mensagem com cliente_id).
    const { data: ult } = await supabase
      .from('whatsapp_mensagens')
      .select('cliente_id')
      .eq('telefone', telefone)
      .not('cliente_id', 'is', null)
      .order('criado_em', { ascending: false })
      .limit(1)
    const clienteId = (ult as any)?.[0]?.cliente_id ?? null

    // Registra a mensagem enviada (autor = humano) para aparecer no painel/contexto.
    await supabase.from('whatsapp_mensagens').insert({
      telefone,
      cliente_id: clienteId,
      role: 'assistant',
      conteudo: texto,
      autor: 'humano',
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro ao enviar' }, { status: 500 })
  }
}
