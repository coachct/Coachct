import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { coach_id, user_id } = await req.json()

  if (!coach_id || !user_id) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  // 1. Desativa o coach (preserva histórico)
  await supabase.from('coaches').update({ ativo: false }).eq('id', coach_id)

  // 2. Remove os horários (não são mais necessários)
  await supabase.from('coach_horarios').delete().eq('coach_id', coach_id)

  // 3. Bloqueia o acesso no Auth (ban = sem login, mas dados preservados)
  const { error } = await supabase.auth.admin.updateUserById(user_id, {
    ban_duration: '87600h' // 10 anos = bloqueio permanente na prática
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
