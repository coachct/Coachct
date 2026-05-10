import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cliente_id = searchParams.get('cliente_id') || searchParams.get('aluno_id')
  const cliente_info = searchParams.get('cliente_info') || searchParams.get('aluno_info')
  const lista_clientes = searchParams.get('lista_clientes') || searchParams.get('lista_alunos')
  const insights = searchParams.get('insights')
  const aula_id = searchParams.get('aula_id')
  const painel = searchParams.get('painel')
  const coach_id = searchParams.get('coach_id')
  const aula_detalhe = searchParams.get('aula_detalhe')

  // Busca uma aula específica com detalhes para edição
  if (aula_detalhe && aula_id) {
    const { data: aula, error } = await supabase
      .from('aulas')
      .select(`
        id, iniciada_em, finalizada_em, status, observacoes,
        clientes:cliente_id(id, nome),
        treinos(id, nome, descricao,
          treino_exercicios(id, exercicio_id, ordem, series_override, reps_override, observacoes_override, conjugado,
            exercicios(id, nome, numero_maquina))),
        registros_carga(id, exercicio_id, carga_kg, reps_realizadas, observacoes)
      `)
      .eq('id', aula_id)
      .maybeSingle()
    if (error) return NextResponse.json({ error }, { status: 400 })
    // Compatibilidade: retorna como "alunos" para o frontend antigo
    if (aula) {
      const aulaCompat: any = aula
      aulaCompat.alunos = aulaCompat.clientes
    }
    return NextResponse.json({ data: aula })
  }

  // Dashboard do coach
  if (painel && coach_id) {
    const hoje = new Date()
    const mes = hoje.getMonth() + 1
    const ano = hoje.getFullYear()
    const mesPassado = mes === 1 ? 12 : mes - 1
    const anoMesPassado = mes === 1 ? ano - 1 : ano

    const inicioMes = new Date(ano, mes - 1, 1).toISOString()
    const fimMes = new Date(ano, mes, 0, 23, 59, 59).toISOString()
    const inicioMesPassado = new Date(anoMesPassado, mesPassado - 1, 1).toISOString()
    const fimMesPassado = new Date(anoMesPassado, mesPassado, 0, 23, 59, 59).toISOString()
    const inicioHoje = new Date(ano, mes - 1, hoje.getDate()).toISOString()
    const fimHoje = new Date(ano, mes - 1, hoje.getDate(), 23, 59, 59).toISOString()

    const [
      { count: aulasHoje },
      { count: aulasMes },
      { count: aulasMesPassado },
      { data: horarios },
      { data: ultimas },
      { data: todasAulas },
      { data: aulaPendente },
    ] = await Promise.all([
      supabase.from('aulas').select('*', { count: 'exact', head: true })
        .eq('coach_id', coach_id).eq('status', 'finalizada')
        .gte('horario_agendado', inicioHoje).lte('horario_agendado', fimHoje),
      supabase.from('aulas').select('*', { count: 'exact', head: true })
        .eq('coach_id', coach_id).eq('status', 'finalizada')
        .gte('horario_agendado', inicioMes).lte('horario_agendado', fimMes),
      supabase.from('aulas').select('*', { count: 'exact', head: true })
        .eq('coach_id', coach_id).eq('status', 'finalizada')
        .gte('horario_agendado', inicioMesPassado).lte('horario_agendado', fimMesPassado),
      supabase.from('coach_horarios').select('*')
        .eq('coach_id', coach_id).eq('ativo', true),
      supabase.from('aulas').select('*, treinos(nome), clientes:cliente_id(nome)')
        .eq('coach_id', coach_id).eq('status', 'finalizada')
        .order('finalizada_em', { ascending: false }).limit(5),
      supabase.from('aulas').select('cliente_id, horario_agendado, finalizada_em')
        .eq('coach_id', coach_id).eq('status', 'finalizada')
        .order('horario_agendado', { ascending: false }),
      supabase.from('aulas').select('*, treinos(nome)')
        .eq('coach_id', coach_id).eq('status', 'em_andamento')
        .order('iniciada_em', { ascending: false }).limit(1).maybeSingle(),
    ])

    const todosIds = [...new Set([
      ...(ultimas || []).map((a: any) => a.cliente_id),
      ...(todasAulas || []).map((a: any) => a.cliente_id),
    ])]

    let alunosMap: Record<string, string> = {}
    if (todosIds.length > 0) {
      const { data: clientesData } = await supabase
        .from('clientes').select('id, nome').in('id', todosIds)
      for (const a of (clientesData || [])) alunosMap[a.id] = a.nome
    }

    let aulaPendenteComAluno = null
    if (aulaPendente) {
      // Busca o nome do cliente para a aula pendente
      const { data: clienteData } = await supabase
        .from('clientes').select('id, nome')
        .eq('id', (aulaPendente as any).cliente_id)
        .maybeSingle()
      const nomeAluno = clienteData?.nome || 'Cliente'
      aulaPendenteComAluno = { 
        ...aulaPendente, 
        aluno_id: (aulaPendente as any).cliente_id, // compat
        alunos: { nome: nomeAluno } 
      }
    }

    return NextResponse.json({
      data: {
        aulasHoje: aulasHoje || 0,
        aulasMes: aulasMes || 0,
        aulasMesPassado: aulasMesPassado || 0,
        horarios: horarios || [],
        ultimas: (ultimas || []).map((a: any) => ({
          ...a,
          aluno_id: a.cliente_id, // compat
          alunos: { nome: a.clientes?.nome || alunosMap[a.cliente_id] || 'Cliente' }
        })),
        todasAulas: (todasAulas || []).map((a: any) => ({
          ...a,
          aluno_id: a.cliente_id, // compat
        })),
        alunosMap,
        aulaPendente: aulaPendenteComAluno,
      }
    })
  }

  // Insights do cliente
  if (insights && cliente_id && aula_id) {
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
        .eq('cliente_id', cliente_id).eq('status', 'finalizada')
        .gte('finalizada_em', ha7dias.toISOString())
        .order('finalizada_em', { ascending: false }),
      supabase.from('aulas').select('id')
        .eq('cliente_id', cliente_id).eq('status', 'finalizada')
        .gte('finalizada_em', inicioMes.toISOString()),
      supabase.from('aulas').select('id')
        .eq('cliente_id', cliente_id).eq('status', 'finalizada')
        .gte('finalizada_em', inicioSemana.toISOString()),
      supabase.from('registros_carga').select('exercicio_id, carga_kg')
        .eq('aula_id', aula_id),
      supabase.from('registros_carga')
        .select('exercicio_id, carga_kg, aulas!inner(cliente_id, status)')
        .eq('aulas.cliente_id', cliente_id)
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

  // Lista todos os clientes que já tiveram aulas (ou todos)
  if (lista_clientes) {
    const { data: clientes, error: clientesError } = await supabase
      .from('clientes').select('id, nome').order('nome', { ascending: true })
    if (clientesError) return NextResponse.json({ error: clientesError }, { status: 400 })

    const { data: aulas, error: aulasError } = await supabase
      .from('aulas').select('cliente_id, finalizada_em, status').eq('status', 'finalizada')
    if (aulasError) return NextResponse.json({ error: aulasError }, { status: 400 })

    const resultado = (clientes || []).map((c: any) => {
      const aulasCliente = (aulas || []).filter(
        (au: any) => au.cliente_id === c.id && au.finalizada_em
      )
      aulasCliente.sort((x: any, y: any) =>
        new Date(y.finalizada_em).getTime() - new Date(x.finalizada_em).getTime()
      )
      return {
        id: c.id,
        nome: c.nome,
        ultima_aula: aulasCliente[0]?.finalizada_em ?? null,
        total_aulas: aulasCliente.length,
      }
    })
    return NextResponse.json({ data: resultado })
  }

  // Info do cliente
  if (cliente_info && cliente_id) {
    const { data, error } = await supabase
      .from('clientes').select('*').eq('id', cliente_id).single()
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ data })
  }

  // Histórico de aulas do cliente
  if (cliente_id) {
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
      .eq('cliente_id', cliente_id)
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
  // Aceita tanto cliente_id quanto aluno_id (compatibilidade)
  const cliente_id = body.cliente_id || body.aluno_id
  const { id, coach_id, treino_id, horario_agendado, iniciada_em, status } = body

  const { data, error } = await supabase.from('aulas').insert({
    id, coach_id, cliente_id, treino_id, horario_agendado, iniciada_em, status
  }).select().maybeSingle()

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, registros_carga, ...updates } = body

  // Se vier aluno_id, renomeia para cliente_id
  if (updates.aluno_id !== undefined) {
    updates.cliente_id = updates.aluno_id
    delete updates.aluno_id
  }

  // Atualiza dados da aula
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('aulas').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error }, { status: 400 })
  }

  // Atualiza registros de carga se fornecidos
  if (registros_carga && Array.isArray(registros_carga)) {
    for (const r of registros_carga) {
      await supabase.from('registros_carga').upsert({
        aula_id: id,
        exercicio_id: r.exercicio_id,
        carga_kg: r.carga_kg,
        reps_realizadas: r.reps_realizadas,
        observacoes: r.observacoes,
        maquina: r.maquina || '',
      }, { onConflict: 'aula_id,exercicio_id,observacoes' })
    }
  }

  return NextResponse.json({ ok: true })
}
