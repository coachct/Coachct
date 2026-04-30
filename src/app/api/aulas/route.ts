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
  const lista_alunos = searchParams.get('lista_alunos')
  const insights = searchParams.get('insights')
  const aula_id = searchParams.get('aula_id')

  // Insights do aluno
  if (insights && aluno_id && aula_id) {
    const hoje = new Date()
    const ha7dias = new Date(hoje); ha7dias.setDate(hoje.getDate() - 7)
    const inicioSemana = new Date(hoje); inicioSemana.setDate(hoje.getDate() - hoje.getDay())
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

    const [
      { data: aulasRecentes },
      { data: aulasMes },
      { data: aulasSemana },
      { data: cargasHoje },
      { data: cargasAnteriores },
    ] = await Promise.all([
      supabase.from('aulas').select('*, treinos(nome, descricao)')
        .eq('aluno_id', aluno_id).eq('status', 'finalizada')
        .gte('finalizada_em', ha7dias.toISOString())
        .order('finalizada_em', { ascending: false }),
      supabase.from('aulas').select('id')
        .eq('aluno_id', aluno_id).eq('status', 'finalizada')
        .gte('finalizada_em', inicioMes.toISOString()),
      supabase.from('aulas').select('id')
        .eq('aluno_id', aluno_id).eq('status', 'finalizada')
        .gte('finalizada_em', inicioSemana.toISOString()),
      supabase.from('registros_carga').select('exercicio_id, carga_kg')
        .eq('aula_id', aula_id),
      supabase.from('registros_carga')
        .select('exercicio_id, carga_kg, aulas!inner(aluno_id, status)')
        .eq('aulas.aluno_id', aluno_id)
        .eq('aulas.status', 'finalizada')
        .neq('aula_id', aula_id),
    ])

    return NextResponse.json({
      data: {
        aulasRecentes: aulasRecentes || [],
        aulasMes: aulasMes || [],
        aulasSemana: aulasSemana || [],
        cargasHoje: cargasHoje || [],
        cargasAnteriores: cargasAnteriores || [],
      }
    })
  }

  // Lista todos os alunos com suas aulas
  if (lista_alunos) {
    const { data: alunos, error: alunosError } = await supabase
      .from('alunos')
      .select('id, nome')
      .order('nome', { ascending: true })

    if (alunosError) return NextResponse.json({ error: alunosError }, { status: 400 })

    const { data: aulas, error: aulasError } = await supabase
      .from('aulas')
      .select('aluno_id, finalizada_em, status')
      .eq('status', 'finalizada')

    if (aulasError) return NextResponse.json({ error: aulasError }, { status: 400 })

    const resultado = (alunos || []).map((a: any) => {
      const aulasAluno = (aulas || []).filter(
        (au: any) => au.aluno_id === a.id && au.finalizada_em
      )
      aulasAluno.sort(
        (x: any, y: any) =>
          new Date(y.finalizada_em).getTime() - new Date(x.finalizada_em).getTime()
      )
      return {
        id: a.id,
        nome: a.nome,
        ultima_aula: aulasAluno[0]?.finalizada_em ?? null,
        total_aulas: aulasAluno.length,
      }
    })

    return NextResponse.json({ data: resultado })
  }

  // Info do aluno
  if (aluno_info && aluno_id) {
    const { data, error } = await supabase
      .from('alunos').select('*').eq('id', aluno_id).single()
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ data })
  }

  // Histórico de aulas do aluno
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
  const body = await
