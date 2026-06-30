// src/app/api/admin/whatsapp/midia/route.ts
//
// Devolve uma URL assinada (temporária) de um anexo guardado no bucket privado
// "whatsapp-midia", para o painel exibir imagem/baixar documento. Só admin/coordenadora.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'whatsapp-midia'

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

    const { path } = await req.json()
    const p = String(path ?? '').trim()
    if (!p) return NextResponse.json({ error: 'Caminho ausente' }, { status: 400 })

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(p, 3600)
    if (error || !data?.signedUrl) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })

    return NextResponse.json({ url: data.signedUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
