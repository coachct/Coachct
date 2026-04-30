import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const aluno_id = searchParams.get('aluno_id')
  const aluno_info = searchParams.get('aluno_info')

  if (aluno_info && aluno_id) {
    const { data, error } = await supabase
      .from('alunos').select('*').eq('id', aluno_id).single()
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ data })
  }

  if (aluno_id) {
    const { data, error } = await supabase
      .from('aulas')
      .select(`
        id, finalizada_em, observacoes,
        treinos ( nome, descricao ),
        registros_carga (
          id, carga_kg, reps_realizadas, observacoes,
          exercicios ( nome, numero_maquina )
        )
      `)
      .eq('aluno_id', aluno_id)
      .eq('status', 'finalizada')
      .order('finalizada_em', { ascending: false })
      .limit(30)
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { id, coach_id, aluno_id, treino_id, horario_agendado, iniciada_em, status } = body

  const { data, error } = await supabase.from('aulas').insert({
    id, coach_id, aluno_id, treino_id, horario_agendado, iniciada_em, status
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
