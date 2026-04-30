import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { coach_id, aluno_id, treino_id, horario_agendado, iniciada_em, status } = body

  const { data, error } = await supabase.from('aulas').insert({
    coach_id, aluno_id, treino_id, horario_agendado, iniciada_em, status
  }).select().maybeSingle()

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body

  const { data, error } = await supabase.from('aulas').update(updates).eq('id', id).select().maybeSingle()

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ data })
}
