import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ---- Helpers ----------------------------------------------------------------

async function autenticar(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { erro: NextResponse.json({ error: 'Token inválido' }, { status: 401 }) }
  const { data: cliente } = await supabase
    .from('clientes').select('id, avaliacoes_optout').eq('user_id', user.id).maybeSingle()
  if (!cliente) return { erro: NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 }) }
  return { user, cliente }
}

// Re-deriva o contexto da sessão a partir da própria base (autoritativo).
// Valida que a sessão é do cliente e tem presença. Retorna snapshot ou null.
async function derivarSessao(origem: string, referenciaId: string, clienteId: string) {
  if (origem === 'ct') {
    const { data: ag } = await supabase
      .from('agendamentos')
      .select('id, data, horario, coach_id, unidade_id, unidades(nome)')
      .eq('id', referenciaId).eq('cliente_id', clienteId).eq('status', 'realizado')
      .maybeSingle()
    if (!ag) return null
    let coachNome: string | null = null
    if (ag.coach_id) {
      const { data: c } = await supabase.from('coaches').select('nome').eq('id', ag.coach_id).maybeSingle()
      coachNome = c?.nome || null
    }
    return {
      origem: 'ct', referencia_id: ag.id, ocorrencia_id: null,
      coach_id: ag.coach_id || null, coach_nome: coachNome,
      unidade_id: ag.unidade_id, unidade_nome: (ag as any).unidades?.nome || 'Just CT',
      data_aula: ag.data, horario: (ag.horario || '').slice(0, 5), tipo_aula: 'ct',
    }
  }
  if (origem === 'club') {
    const { data: r } = await supabase
      .from('club_reservas')
      .select('id, status, club_ocorrencias(id, data, coach_escalado:coaches!coach_id(id, nome), club_aulas(tipo, horario, unidade_id, unidades(nome), coaches(id, nome)))')
      .eq('id', referenciaId).eq('cliente_id', clienteId).in('status', ['presente', 'realizado'])
      .maybeSingle()
    const oc: any = (r as any)?.club_ocorrencias
    if (!r || !oc) return null
    const esc = oc.coach_escalado
    const grade = oc.club_aulas?.coaches
    return {
      origem: 'club', referencia_id: r.id, ocorrencia_id: oc.id,
      coach_id: esc?.id || grade?.id || null, coach_nome: esc?.nome || grade?.nome || null,
      unidade_id: oc.club_aulas?.unidade_id || null, unidade_nome: oc.club_aulas?.unidades?.nome || 'JustClub',
      data_aula: oc.data, horario: (oc.club_aulas?.horario || '').slice(0, 5),
      tipo_aula: oc.club_aulas?.tipo || null,
    }
  }
  return null
}

function notaValida(n: any): number | null {
  if (n === null || n === undefined || n === '') return null
  const v = Number(n)
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null
}

// ---- GET: última aula pendente de avaliação ---------------------------------

export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req)
    if ('erro' in auth) return auth.erro
    const { cliente } = auth

    if (cliente.avaliacoes_optout) return NextResponse.json({ pendente: null })

    const [{ data: ct }, { data: club }] = await Promise.all([
      supabase.from('agendamentos')
        .select('id, data, horario, coach_id, unidade_id, unidades(nome)')
        .eq('cliente_id', cliente.id).eq('status', 'realizado')
        .order('data', { ascending: false }).order('horario', { ascending: false }).limit(20),
      supabase.from('club_reservas')
        .select('id, status, club_ocorrencias(id, data, coach_escalado:coaches!coach_id(id, nome), club_aulas(tipo, horario, unidade_id, unidades(nome), coaches(id, nome)))')
        .eq('cliente_id', cliente.id).in('status', ['presente', 'realizado']).limit(20),
    ])

    const candidatos: any[] = []
    for (const a of (ct || [])) {
      candidatos.push({
        origem: 'ct', referencia_id: a.id, ocorrencia_id: null,
        coach_id: a.coach_id || null, coach_nome: null,
        unidade_id: a.unidade_id, unidade_nome: (a as any).unidades?.nome || 'Just CT',
        data_aula: a.data, horario: (a.horario || '').slice(0, 5), tipo_aula: 'ct',
        dt: `${a.data}T${a.horario || ''}`,
      })
    }
    for (const r of (club || [])) {
      const oc: any = (r as any).club_ocorrencias
      if (!oc) continue
      const esc = oc.coach_escalado
      const grade = oc.club_aulas?.coaches
      candidatos.push({
        origem: 'club', referencia_id: r.id, ocorrencia_id: oc.id,
        coach_id: esc?.id || grade?.id || null, coach_nome: esc?.nome || grade?.nome || null,
        unidade_id: oc.club_aulas?.unidade_id || null, unidade_nome: oc.club_aulas?.unidades?.nome || 'JustClub',
        data_aula: oc.data, horario: (oc.club_aulas?.horario || '').slice(0, 5), tipo_aula: oc.club_aulas?.tipo || null,
        dt: `${oc.data}T${oc.club_aulas?.horario || ''}`,
      })
    }

    if (!candidatos.length) return NextResponse.json({ pendente: null })

    candidatos.sort((a, b) => b.dt.localeCompare(a.dt))

    const refs = candidatos.map(c => c.referencia_id)
    const { data: jaFeitas } = await supabase
      .from('avaliacoes_aula').select('origem, referencia_id')
      .eq('cliente_id', cliente.id).in('referencia_id', refs)
    const tratadas = new Set((jaFeitas || []).map((x: any) => `${x.origem}:${x.referencia_id}`))

    const pendente = candidatos.find(c => !tratadas.has(`${c.origem}:${c.referencia_id}`))
    if (!pendente) return NextResponse.json({ pendente: null })

    // Resolve nome do coach do CT escolhido (só pra exibir)
    if (pendente.origem === 'ct' && pendente.coach_id && !pendente.coach_nome) {
      const { data: c } = await supabase.from('coaches').select('nome').eq('id', pendente.coach_id).maybeSingle()
      pendente.coach_nome = c?.nome || null
    }

    delete pendente.dt
    return NextResponse.json({ pendente })
  } catch (err: any) {
    console.error('Erro em GET /api/cliente/avaliar-aula:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}

// ---- POST: avaliar / dispensar / optout -------------------------------------

export async function POST(req: NextRequest) {
  try {
    const auth = await autenticar(req)
    if ('erro' in auth) return auth.erro
    const { cliente } = auth

    const body = await req.json()
    const action = String(body?.action || '')

    if (action === 'optout') {
      await supabase.from('clientes').update({ avaliacoes_optout: true }).eq('id', cliente.id)
      return NextResponse.json({ ok: true })
    }

    const origem = String(body?.origem || '')
    const referenciaId = String(body?.referencia_id || '')
    if (!['ct', 'club'].includes(origem) || !referenciaId) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const sessao = await derivarSessao(origem, referenciaId, cliente.id)
    if (!sessao) return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })

    const base = {
      cliente_id: cliente.id,
      origem: sessao.origem,
      referencia_id: sessao.referencia_id,
      ocorrencia_id: sessao.ocorrencia_id,
      coach_id: sessao.coach_id,
      coach_nome: sessao.coach_nome,
      unidade_id: sessao.unidade_id,
      data_aula: sessao.data_aula,
      horario: sessao.horario,
      tipo_aula: sessao.tipo_aula,
    }

    let registro: any
    if (action === 'dispensar') {
      registro = { ...base, dispensado: true }
    } else if (action === 'avaliar') {
      registro = {
        ...base,
        dispensado: false,
        nota_aula: notaValida(body?.nota_aula),
        nota_professor: notaValida(body?.nota_professor),
        nota_musica: notaValida(body?.nota_musica),
        nota_ambiente: notaValida(body?.nota_ambiente),
        comentario: body?.comentario ? String(body.comentario).slice(0, 1000) : null,
      }
    } else {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }

    const { error } = await supabase.from('avaliacoes_aula').insert(registro)
    if (error) {
      // 23505 = já existe linha pra essa sessão (já avaliada/dispensada) → trata como ok
      if ((error as any).code === '23505') return NextResponse.json({ ok: true, ja_tratada: true })
      console.error('Erro ao gravar avaliação:', error)
      return NextResponse.json({ error: 'Erro ao salvar. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Erro em POST /api/cliente/avaliar-aula:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
