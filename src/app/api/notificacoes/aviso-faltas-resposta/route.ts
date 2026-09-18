import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Cliente com aviso de faltas respondeu "Não" ao popup em /agendar.
 * A reserva não foi feita; aqui só registramos em avisos_faltas_respostas,
 * que aparece no card do dashboard admin pra alguém falar com ela.
 * Fire-and-forget no front — sempre responde rápido e nunca trava a UX.
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, motivo: 'env_ausente' })
    }

    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token)
    if (errAuth || !user) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data: cliente } = await supabase
      .from('clientes').select('id').eq('user_id', user.id).maybeSingle()
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.data || '')) ? body.data : null
    const hora = String(body?.hora || '').slice(0, 5) || null
    const unidade = String(body?.unidade || '').slice(0, 80) || null

    const { error } = await supabase.from('avisos_faltas_respostas').insert({
      cliente_id: cliente.id, data_tentada: data, hora_tentada: hora, unidade,
    })
    if (error) return NextResponse.json({ ok: false, erro: error.message })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: String(e?.message || e) })
  }
}
