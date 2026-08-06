// POST /api/conta/wellhub-email  { email }  + Authorization: Bearer <token>
// Cliente logado informa o email que usa no Wellhub (pro Check-in Express).
// Guarda em clientes.wellhub_email — NÃO sobrescreve o email da conta.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { totemService } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ ok: false, motivo: 'sem_sessao' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const email = String(body?.email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, motivo: 'email_invalido' })

    const { data: { user } } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ).auth.getUser(token)
    if (!user) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 })

    const sb = totemService()
    const { data: cliente } = await sb.from('clientes').select('id').eq('user_id', user.id).maybeSingle()
    if (!cliente) return NextResponse.json({ ok: false, motivo: 'cliente_nao_encontrado' })

    const { error } = await sb.from('clientes').update({ wellhub_email: email }).eq('id', cliente.id)
    if (error) return NextResponse.json({ ok: false, motivo: 'falha', detalhe: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, motivo: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
