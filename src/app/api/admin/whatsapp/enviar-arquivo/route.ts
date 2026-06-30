// src/app/api/admin/whatsapp/enviar-arquivo/route.ts
//
// Envio MANUAL de um ARQUIVO (documento/imagem/áudio/vídeo) por um atendente
// (admin/coordenadora) numa conversa assumida no painel. Sobe pra Meta, envia
// pelo WhatsApp, guarda uma cópia no Storage e registra em whatsapp_mensagens.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enviarMidiaWhatsApp } from '@/lib/whatsapp/canal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'whatsapp-midia'
const MAX_BYTES = 16 * 1024 * 1024 // 16MB

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

    const form = await req.formData()
    const telefone = String(form.get('telefone') ?? '').replace(/\D/g, '')
    const caption = String(form.get('caption') ?? '').trim()
    const file = form.get('file') as File | null
    if (telefone.length < 10 || telefone.length > 11)
      return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })
    if (!file) return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 })
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: 'Arquivo muito grande (máx 16MB).' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const mime = file.type || 'application/octet-stream'
    const nome = file.name || 'arquivo'

    // 1) Envia pelo WhatsApp (sobe pra Meta + manda). Brasil = 55 + DDD + número.
    const env = await enviarMidiaWhatsApp(`55${telefone}`, { bytes, mime, filename: nome, caption })
    if (!env.ok)
      return NextResponse.json(
        { error: 'Não consegui enviar pelo WhatsApp. Verifique se a conversa está dentro da janela de 24h.' },
        { status: 502 },
      )

    // 2) Guarda uma cópia no Storage (para aparecer no painel). Não fatal se falhar.
    const safe = nome.replace(/[^\w.\-]+/g, '_').slice(0, 80)
    const path = `${telefone}/out-${Date.now()}-${safe}`
    try {
      await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
    } catch (e) { console.error('[enviar-arquivo] storage:', e) }

    // 3) Registra no histórico (autor = humano). Não fatal se a coluna ainda não existir.
    const { data: ult } = await supabase
      .from('whatsapp_mensagens').select('cliente_id')
      .eq('telefone', telefone).not('cliente_id', 'is', null)
      .order('criado_em', { ascending: false }).limit(1)
    const clienteId = (ult as any)?.[0]?.cliente_id ?? null
    const { error: insErr } = await supabase.from('whatsapp_mensagens').insert({
      telefone, cliente_id: clienteId, role: 'assistant', autor: 'humano',
      conteudo: caption || '', midia_tipo: env.tipo, midia_path: path, midia_nome: nome, midia_mime: mime,
    })
    if (insErr) console.error('[enviar-arquivo] insert msg:', insErr.message)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro ao enviar arquivo' }, { status: 500 })
  }
}
