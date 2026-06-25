'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const ACCENT   = '#ff2d9b'
const CYAN     = '#00e5ff'
const VERDE    = '#2ddd8b'
const AMARELO  = '#ffaa00'
const VERMELHO = '#ff4444'

// Auto-escala (motor "Montar sugestão") — constantes de calibração, fáceis de ajustar.
const VARIETY_PEN = 30  // empurra a variar de tipo depois de 2+ aulas do mesmo tipo no dia
const DESEMPATE   = 1   // peso do equilíbrio de carga no desempate (ocupação continua dominando)

const DIAS_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function tipoLabel(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')    return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t
}
function tipoColor(t: string) {
  if (t === 'lift')              return CYAN
  if (t === 'lift_for_girls')    return ACCENT
  return VERDE
}

const TIPOS_CLUB = ['lift', 'lift_for_girls', 'running_funcional']

// Datas de fds (sáb/dom) de uma competência 'YYYY-MM', em data local.
function fdsDoMes(comp: string) {
  const [y, m] = comp.split('-').map(Number)
  const dias: { data: string; dow: number }[] = []
  const d = new Date(y, m - 1, 1)
  while (d.getMonth() === m - 1) {
    const dow = d.getDay()
    if (dow === 0 || dow === 6) dias.push({ data: dataLocalStr(d), dow })
    d.setDate(d.getDate() + 1)
  }
  return dias
}
function competenciaLabel(comp: string) {
  const [y, m] = comp.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}
function addMes(comp: string, delta: number) {
  const [y, m] = comp.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function mesSeguinte() {
  const h = new Date()
  const p = new Date(h.getFullYear(), h.getMonth() + 1, 1)
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`
}

export default function AdminEscalaClubPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [unidades,       setUnidades]       = useState<any[]>([])
  const [unidadeSel,     setUnidadeSel]     = useState<any>(null)
  const [coaches,        setCoaches]        = useState<any[]>([])
  const [ocorrenciasMap, setOcorrenciasMap] = useState<Record<string, any[]>>({}) // data -> ocorrências
  const [loadingDados,   setLoadingDados]   = useState(false)
  const [loadingUnidades,setLoadingUnidades]= useState(true)

  const [modalAula, setModalAula] = useState<any>(null)
  const [salvando,  setSalvando]  = useState(false)

  // NOVO: abas FDS / Montar / Resumo / Feriados / Capacidade / Disponibilidade
  const [aba, setAba] = useState<'fds' | 'montar' | 'resumo' | 'feriados' | 'capacidade' | 'disponibilidade'>('fds')
  const [feriados,              setFeriados]              = useState<any[]>([])
  const [ocorrenciasFeriadoMap, setOcorrenciasFeriadoMap] = useState<Record<string, any[]>>({}) // feriado_id -> ocorrências
  const [loadingFeriados,       setLoadingFeriados]       = useState(false)

  // NOVO: capacidade (coach_tipos) — matriz coach × tipo. coach_id = coaches.id.
  const [coachesClub, setCoachesClub] = useState<any[]>([])       // todos coaches Club ativos
  const [capMatrix,   setCapMatrix]   = useState<Record<string, Set<string>>>({}) // coachId -> Set<tipo>
  const [loadingCap,  setLoadingCap]  = useState(false)
  const [salvandoCap, setSalvandoCap] = useState<string | null>(null) // `${coachId}-${tipo}`

  // NOVO: disponibilidade (club_disponibilidade_fds) — grade coach × datas de fds do mês.
  const [competencia,  setCompetencia]  = useState<string>(mesSeguinte()) // 'YYYY-MM', default mês seguinte
  const [dispSet,      setDispSet]      = useState<Set<string>>(new Set()) // `${coachId}|${data}`
  const [loadingDisp,  setLoadingDisp]  = useState(false)
  const [salvandoDisp, setSalvandoDisp] = useState<string | null>(null)    // `${coachId}|${data}`

  // NOVO Fase 3 (montagem): elegibilidade (disponibilidade + capacidade + férias) e conflito de horário.
  const [dispFds,     setDispFds]     = useState<Set<string>>(new Set())          // `${coachId}|${data}`
  const [tiposFds,    setTiposFds]    = useState<Record<string, Set<string>>>({}) // coachId -> Set<tipo>
  const [feriasFds,   setFeriasFds]   = useState<Record<string, { ini: string; fim: string }[]>>({})
  const [conflitoSet, setConflitoSet] = useState<Set<string>>(new Set())          // coachIds ocupados no slot aberto

  // NOVO Fase 4: ocupação histórica (RPC). Chave: `${coachId}|${tipo}|${unidadeId}|${dow}` -> { media, n }.
  const [ocupMap, setOcupMap] = useState<Record<string, { media: number; n: number }>>({})

  // NOVO (montagem inteligente do dia): visão das 2 unidades juntas + auto-escala.
  const [mesMontar,     setMesMontar]     = useState<string>(mesSeguinte()) // default mês seguinte
  const [diaMontar,     setDiaMontar]     = useState<string | null>(null)    // fds selecionado
  const [coachesMontar, setCoachesMontar] = useState<any[]>([])              // todos coaches Club
  const [ocsMontarMap,  setOcsMontarMap]  = useState<Record<string, any[]>>({}) // data -> ocorrências (ambas unidades)
  const [dispMontar,    setDispMontar]    = useState<Set<string>>(new Set())            // `${coachId}|${data}`
  const [tiposMontar,   setTiposMontar]   = useState<Record<string, Set<string>>>({})   // coachId -> Set<tipo>
  const [feriasMontar,  setFeriasMontar]  = useState<Record<string, { ini: string; fim: string }[]>>({})
  const [loadingMontar, setLoadingMontar] = useState(false)
  const [montando,      setMontando]      = useState(false)

  // NOVO: Resumo do mês (copiável p/ WhatsApp) — só FDS de escala (sáb/dom), nunca a grade da semana.
  // Três grupos, cada bloco com cópia individual: por unidade, por fim de semana e por coach.
  const [mesResumo,     setMesResumo]     = useState<string>(mesSeguinte()) // default mês seguinte
  const [blocosUni,     setBlocosUni]     = useState<any[]>([]) // { id, titulo, sub, texto }
  const [blocosFds,     setBlocosFds]     = useState<any[]>([])
  const [blocosCoach,   setBlocosCoach]   = useState<any[]>([])
  const [loadingResumo, setLoadingResumo] = useState(false)
  const [copiado,       setCopiado]       = useState<string | null>(null)   // qual bloco foi copiado

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  // Carrega unidades uma vez quando o usuário entra (não refaz em re-renders do perfil)
  useEffect(() => { if (perfil?.id) carregarUnidades() }, [perfil?.id])
  // Quando muda a unidade, recarrega coaches dela e ocorrências
  useEffect(() => {
    if (unidadeSel?.id) {
      carregarCoachesDaUnidade(unidadeSel.id)
      carregarOcorrencias()
      carregarFeriados()
    }
  }, [unidadeSel?.id])
  // Capacidade, Disponibilidade e Montar não dependem da unidade selecionada (valem pra todo o Club).
  useEffect(() => {
    if (aba === 'capacidade'      && unidades.length > 0) carregarCapacidade()
    if (aba === 'disponibilidade' && unidades.length > 0) carregarDisponibilidade()
    if (aba === 'fds'             && unidades.length > 0) carregarElegibilidadeFds()
    if (aba === 'montar'          && unidades.length > 0) carregarMontar()
    if (aba === 'resumo'          && unidades.length > 0) carregarResumo()
  }, [aba, unidades.length, competencia, mesMontar, mesResumo])

  // Próximos 6 fins de semana (12 datas)
  const proximosFDS = (() => {
    const datas: { data: string; nome: string }[] = []
    const hoje = new Date()
    hoje.setHours(12, 0, 0, 0)
    let count = 0
    const cursor = new Date(hoje)
    while (count < 12) {
      const diaSem = cursor.getDay()
      if (diaSem === 0 || diaSem === 6) {
        datas.push({ data: dataLocalStr(cursor), nome: DIAS_SEMANA_LABEL[diaSem] })
        count++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return datas
  })()

  async function carregarUnidades() {
    const { data: uns } = await supabase.from('unidades')
      .select('id, nome, tipo').eq('tipo', 'club').eq('ativo', true).order('nome')
    setUnidades(uns || [])
    // Só seta unidade inicial se ainda não houver uma selecionada
    // (evita resetar a seleção do usuário em re-renders)
    if (uns && uns.length > 0) {
      setUnidadeSel(prev => prev ?? uns[0])
    }
    setLoadingUnidades(false)
  }

  async function carregarCoachesDaUnidade(unidadeId: string) {
    // Puxa só os coaches habilitados pra esta unidade (via coach_unidades)
    const { data: cu } = await supabase.from('coach_unidades')
      .select('coach_id').eq('unidade_id', unidadeId).eq('ativo', true)
    const ids = (cu || []).map((u: any) => u.coach_id)
    if (ids.length === 0) { setCoaches([]); return }
    const { data: cs } = await supabase.from('coaches')
      .select('id, nome').eq('ativo', true).in('id', ids).order('nome')
    setCoaches(cs || [])
  }

  async function carregarOcorrencias() {
    if (!unidadeSel) return
    setLoadingDados(true)
    const datas = proximosFDS.map(p => p.data)
    if (datas.length === 0) { setOcorrenciasMap({}); setLoadingDados(false); return }

    // Busca aulas (grade fixa) da unidade
    const { data: aulasIds } = await supabase.from('club_aulas').select('id')
      .eq('unidade_id', unidadeSel.id).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    if (!ids.length) { setOcorrenciasMap({}); setLoadingDados(false); return }

    // Busca ocorrências do FDS pra essas aulas
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id, data, coach_id, club_aulas(id, tipo, horario, capacidade, coach_id, coaches(id, nome), grupos_musculares(nome))')
      .in('aula_id', ids)
      .in('data', datas)
      .eq('status', 'ativa')
      .order('data')

    // Agrupa por data
    const mapa: Record<string, any[]> = {}
    for (const d of datas) mapa[d] = []
    for (const oc of (ocs || [])) {
      if (!mapa[oc.data]) mapa[oc.data] = []
      mapa[oc.data].push(oc)
    }
    // Ordena cada lista por horário
    for (const d of Object.keys(mapa)) {
      mapa[d].sort((a: any, b: any) =>
        (a.club_aulas?.horario || '').localeCompare(b.club_aulas?.horario || ''))
    }
    setOcorrenciasMap(mapa)
    setLoadingDados(false)
  }

  // NOVO: carrega os feriados da unidade + as ocorrências das aulas de cada feriado.
  // As aulas de feriado são club_aulas com feriado_id, criadas em "Cadastrar Aulas".
  // Cada uma já tem 1 ocorrência em club_ocorrencias na data do feriado.
  async function carregarFeriados() {
    if (!unidadeSel) return
    setLoadingFeriados(true)
    const hojeStr = dataLocalStr(new Date())

    const { data: fer } = await supabase.from('feriados')
      .select('id, data, descricao, ativo')
      .eq('unidade_id', unidadeSel.id)
      .gte('data', hojeStr)
      .order('data')
    const feriadosList = fer || []
    setFeriados(feriadosList)

    if (feriadosList.length === 0) { setOcorrenciasFeriadoMap({}); setLoadingFeriados(false); return }

    const ferIds = feriadosList.map((f: any) => f.id)
    const { data: aulasFer } = await supabase.from('club_aulas')
      .select('id, feriado_id')
      .in('feriado_id', ferIds)
    const aulaIds = (aulasFer || []).map((a: any) => a.id)
    if (aulaIds.length === 0) {
      const vazio: Record<string, any[]> = {}
      for (const f of feriadosList) vazio[f.id] = []
      setOcorrenciasFeriadoMap(vazio); setLoadingFeriados(false); return
    }
    const aulaToFeriado: Record<string, string> = {}
    for (const a of (aulasFer || [])) aulaToFeriado[a.id] = a.feriado_id

    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id, data, coach_id, aula_id, club_aulas(id, tipo, horario, capacidade, coach_id, coaches(id, nome), grupos_musculares(nome))')
      .in('aula_id', aulaIds)
      .eq('status', 'ativa')
      .order('data')

    const mapa: Record<string, any[]> = {}
    for (const f of feriadosList) mapa[f.id] = []
    for (const oc of (ocs || [])) {
      const fid = aulaToFeriado[oc.aula_id]
      if (fid && mapa[fid]) mapa[fid].push(oc)
    }
    for (const fid of Object.keys(mapa)) {
      mapa[fid].sort((a: any, b: any) =>
        (a.club_aulas?.horario || '').localeCompare(b.club_aulas?.horario || ''))
    }
    setOcorrenciasFeriadoMap(mapa)
    setLoadingFeriados(false)
  }

  function coachEfetivo(oc: any): { id: string | null; nome: string; origem: 'escalado' | 'grade' | 'indefinido' } {
    if (oc.coach_id) {
      const c = coaches.find((x: any) => x.id === oc.coach_id)
      return { id: oc.coach_id, nome: c?.nome || 'Coach', origem: 'escalado' }
    }
    const gradeCoach = oc.club_aulas?.coaches
    if (gradeCoach?.id) {
      return { id: gradeCoach.id, nome: gradeCoach.nome || 'Coach', origem: 'grade' }
    }
    return { id: null, nome: 'Coach a definir', origem: 'indefinido' }
  }

  async function salvarCoach(coachId: string | null) {
    if (!modalAula) return
    setSalvando(true)
    const { error } = await supabase.from('club_ocorrencias')
      .update({ coach_id: coachId })
      .eq('id', modalAula.id)
    if (!error) {
      setModalAula(null)
      if (aba === 'feriados') await carregarFeriados()
      else if (aba === 'montar') await carregarMontar()
      else await carregarOcorrencias()
    }
    setSalvando(false)
  }

  // ─── Coaches Club (compartilhado por Capacidade, Disponibilidade e Montar) ───
  // Coach Club = ativo e com ≥1 unidade Club em coach_unidades. Independe da unidade selecionada.
  async function fetchCoachesClub(): Promise<any[]> {
    const clubIds = unidades.map((u: any) => u.id) // 'unidades' já vem filtrado pra tipo='club'
    if (clubIds.length === 0) return []
    const { data: cu } = await supabase.from('coach_unidades')
      .select('coach_id').in('unidade_id', clubIds).eq('ativo', true)
    const ids = Array.from(new Set((cu || []).map((u: any) => u.coach_id)))
    if (ids.length === 0) return []
    const { data: cs } = await supabase.from('coaches')
      .select('id, nome').eq('ativo', true).in('id', ids).order('nome')
    return cs || []
  }

  // ─── Capacidade (coach_tipos) ───
  async function carregarCapacidade() {
    setLoadingCap(true)
    const cs = await fetchCoachesClub()
    setCoachesClub(cs)
    if (cs.length === 0) { setCapMatrix({}); setLoadingCap(false); return }
    const ids = cs.map((c: any) => c.id)
    const { data: ts } = await supabase.from('coach_tipos')
      .select('coach_id, tipo').in('coach_id', ids).eq('ativo', true)
    const mapa: Record<string, Set<string>> = {}
    for (const c of cs) mapa[c.id] = new Set<string>()
    for (const t of (ts || [])) { if (mapa[t.coach_id]) mapa[t.coach_id].add(t.tipo) }
    setCapMatrix(mapa)
    setLoadingCap(false)
  }

  async function toggleCap(coachId: string, tipo: string) {
    const key = `${coachId}-${tipo}`
    setSalvandoCap(key)
    const set = new Set(capMatrix[coachId] || [])
    const removendo = set.has(tipo)
    if (removendo) {
      const { error } = await supabase.from('coach_tipos').delete().eq('coach_id', coachId).eq('tipo', tipo)
      if (error) { setSalvandoCap(null); return }
      set.delete(tipo)
    } else {
      const { error } = await supabase.from('coach_tipos')
        .upsert({ coach_id: coachId, tipo, ativo: true }, { onConflict: 'coach_id,tipo' })
      if (error) { setSalvandoCap(null); return }
      set.add(tipo)
    }
    setCapMatrix(prev => ({ ...prev, [coachId]: new Set(set) }))
    setSalvandoCap(null)
  }

  // ─── Disponibilidade (club_disponibilidade_fds) ───
  async function carregarDisponibilidade() {
    setLoadingDisp(true)
    const cs = await fetchCoachesClub()
    setCoachesClub(cs)
    const datas = fdsDoMes(competencia).map(f => f.data)
    if (cs.length === 0 || datas.length === 0) { setDispSet(new Set()); setLoadingDisp(false); return }
    const { data: disp } = await supabase.from('club_disponibilidade_fds')
      .select('coach_id, data').in('data', datas)
    const s = new Set<string>()
    for (const d of (disp || [])) s.add(`${d.coach_id}|${d.data}`)
    setDispSet(s)
    setLoadingDisp(false)
  }

  async function toggleDisp(coachId: string, data: string) {
    const key = `${coachId}|${data}`
    setSalvandoDisp(key)
    const marcado = dispSet.has(key)
    if (marcado) {
      const { error } = await supabase.from('club_disponibilidade_fds')
        .delete().eq('coach_id', coachId).eq('data', data)
      if (error) { setSalvandoDisp(null); return }
    } else {
      const { error } = await supabase.from('club_disponibilidade_fds')
        .upsert({ competencia, coach_id: coachId, data, criado_por: perfil?.id || null }, { onConflict: 'coach_id,data' })
      if (error) { setSalvandoDisp(null); return }
    }
    setDispSet(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
    setSalvandoDisp(null)
  }

  // ─── Montagem: elegibilidade + conflito (Fase 3) ───
  // Carrega disponibilidade, capacidade e férias pras datas de fds exibidas.
  async function carregarElegibilidadeFds() {
    const datas = proximosFDS.map(p => p.data)
    if (datas.length === 0) return
    const minD = datas.reduce((a, b) => (a < b ? a : b))
    const maxD = datas.reduce((a, b) => (a > b ? a : b))
    const [{ data: disp }, { data: tipos }, { data: fer }, { data: ocup }] = await Promise.all([
      supabase.from('club_disponibilidade_fds').select('coach_id, data').in('data', datas),
      supabase.from('coach_tipos').select('coach_id, tipo').eq('ativo', true),
      supabase.from('coach_ferias').select('coach_id, data_inicio, data_fim').lte('data_inicio', maxD).gte('data_fim', minD),
      supabase.rpc('coach_ocupacao_historica', { p_meses: 3 }),
    ])
    const ds = new Set<string>()
    for (const d of (disp || [])) ds.add(`${d.coach_id}|${d.data}`)
    setDispFds(ds)
    const tm: Record<string, Set<string>> = {}
    for (const t of (tipos || [])) { if (!tm[t.coach_id]) tm[t.coach_id] = new Set<string>(); tm[t.coach_id].add(t.tipo) }
    setTiposFds(tm)
    const fm: Record<string, { ini: string; fim: string }[]> = {}
    for (const f of (fer || [])) { if (!fm[f.coach_id]) fm[f.coach_id] = []; fm[f.coach_id].push({ ini: f.data_inicio, fim: f.data_fim }) }
    setFeriasFds(fm)
    const om: Record<string, { media: number; n: number }> = {}
    for (const o of (ocup || [])) { om[`${o.coach_id}|${o.tipo}|${o.unidade_id}|${o.dia_semana}`] = { media: Number(o.ocupacao_media), n: o.n_aulas } }
    setOcupMap(om)
  }

  // Elegibilidade de um coach pra uma ocorrência (data + tipo). Motivo prioriza: férias > tipo > disponibilidade.
  function elegibilidade(oc: any, coachId: string): { ok: boolean; motivo: string } {
    const data = oc?.data
    const tipo = oc?.club_aulas?.tipo
    const deFerias = (feriasFds[coachId] || []).some(p => p.ini <= data && data <= p.fim)
    if (deFerias) return { ok: false, motivo: 'de férias' }
    if (!(tiposFds[coachId]?.has(tipo))) return { ok: false, motivo: 'não dá esse tipo' }
    if (!dispFds.has(`${coachId}|${data}`)) return { ok: false, motivo: 'sem disponibilidade' }
    return { ok: true, motivo: '' }
  }

  // ─── Montagem inteligente do dia: visão 2 unidades + auto-escala ───
  // Elegibilidade própria (escopo do mês alvo), estende a da aba FDS com as 2 regras novas:
  // unidade única no dia e teto de 4 aulas no dia. Não toca o `elegibilidade` da aba FDS.
  function nomeUnidade(id: string | null | undefined) {
    return unidades.find((u: any) => u.id === id)?.nome || 'outra unidade'
  }
  // Coach efetivo da ocorrência no contexto Montar (resolve nome em coachesMontar).
  function efetivoMontar(oc: any): { id: string | null; nome: string; origem: 'escalado' | 'grade' | 'indefinido' } {
    const id = oc.coach_id || oc.club_aulas?.coaches?.id || null
    if (!id) return { id: null, nome: 'Coach a definir', origem: 'indefinido' }
    const nome = coachesMontar.find((c: any) => c.id === id)?.nome || oc.club_aulas?.coaches?.nome || 'Coach'
    return { id, nome, origem: oc.coach_id ? 'escalado' : 'grade' }
  }
  function deFeriasMontar(coachId: string, data: string) {
    return (feriasMontar[coachId] || []).some(p => p.ini <= data && data <= p.fim)
  }
  // Atribuições efetivas do dia (ambas unidades), derivadas das ocorrências carregadas.
  function assignmentsDoDia(dia: string) {
    return (ocsMontarMap[dia] || []).map((o: any) => {
      const ef = efetivoMontar(o)
      return { ocId: o.id, unidadeId: o.club_aulas?.unidade_id, tipo: o.club_aulas?.tipo, horario: o.club_aulas?.horario, coachId: ef.id }
    })
  }
  function aulasNoDia(coachId: string, asg: any[]) { return asg.filter(a => a.coachId === coachId).length }
  function unidadeDoCoachNoDia(coachId: string, asg: any[]) { const a = asg.find(x => x.coachId === coachId); return a ? a.unidadeId : null }
  function tipoCountNoDia(coachId: string, tipo: string, asg: any[]) { return asg.filter(a => a.coachId === coachId && a.tipo === tipo).length }

  // asg = atribuições já feitas no dia, EXCLUINDO a própria ocorrência sendo avaliada.
  function elegibilidadeMontar(oc: any, coachId: string, asg: any[]): { ok: boolean; motivo: string } {
    const data = oc?.data, tipo = oc?.club_aulas?.tipo, uId = oc?.club_aulas?.unidade_id, horario = oc?.club_aulas?.horario
    if (deFeriasMontar(coachId, data))                                 return { ok: false, motivo: 'de férias' }
    if (!(tiposMontar[coachId]?.has(tipo)))                            return { ok: false, motivo: 'não dá esse tipo' }
    if (!dispMontar.has(`${coachId}|${data}`))                         return { ok: false, motivo: 'sem disponibilidade' }
    if (asg.some(a => a.coachId === coachId && a.horario === horario)) return { ok: false, motivo: 'já escalado neste horário' }
    const u = unidadeDoCoachNoDia(coachId, asg)
    if (u && u !== uId)                                                return { ok: false, motivo: `já está em ${nomeUnidade(u)}` }
    if (aulasNoDia(coachId, asg) >= 4)                                 return { ok: false, motivo: 'limite de 4 aulas no dia' }
    return { ok: true, motivo: '' }
  }

  async function carregarMontar() {
    setLoadingMontar(true)
    const cs = await fetchCoachesClub()
    setCoachesMontar(cs)
    const datas = fdsDoMes(mesMontar).map(f => f.data)
    setDiaMontar(prev => (prev && datas.includes(prev)) ? prev : (datas[0] || null))
    if (cs.length === 0 || datas.length === 0) {
      setOcsMontarMap({}); setDispMontar(new Set()); setTiposMontar({}); setFeriasMontar({}); setLoadingMontar(false); return
    }
    const clubIds = unidades.map((u: any) => u.id)
    const { data: aulasIds } = await supabase.from('club_aulas').select('id').in('unidade_id', clubIds).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    const mapa: Record<string, any[]> = {}
    for (const d of datas) mapa[d] = []
    if (ids.length > 0) {
      const { data: ocs } = await supabase.from('club_ocorrencias')
        .select('id, data, coach_id, club_aulas(id, tipo, horario, capacidade, unidade_id, coach_id, coaches(id, nome), grupos_musculares(nome))')
        .in('aula_id', ids).in('data', datas).eq('status', 'ativa').order('data')
      for (const oc of (ocs || [])) { if (!mapa[oc.data]) mapa[oc.data] = []; mapa[oc.data].push(oc) }
      for (const d of Object.keys(mapa)) {
        mapa[d].sort((a: any, b: any) => {
          const ha = a.club_aulas?.horario || '', hb = b.club_aulas?.horario || ''
          if (ha !== hb) return ha.localeCompare(hb)
          return (a.club_aulas?.unidade_id || '').localeCompare(b.club_aulas?.unidade_id || '')
        })
      }
    }
    setOcsMontarMap(mapa)
    const minD = datas[0], maxD = datas[datas.length - 1]
    const [{ data: disp }, { data: tipos }, { data: fer }, { data: ocup }] = await Promise.all([
      supabase.from('club_disponibilidade_fds').select('coach_id, data').in('data', datas),
      supabase.from('coach_tipos').select('coach_id, tipo').eq('ativo', true),
      supabase.from('coach_ferias').select('coach_id, data_inicio, data_fim').lte('data_inicio', maxD).gte('data_fim', minD),
      supabase.rpc('coach_ocupacao_historica', { p_meses: 3 }),
    ])
    const ds = new Set<string>()
    for (const d of (disp || [])) ds.add(`${d.coach_id}|${d.data}`)
    setDispMontar(ds)
    const tm: Record<string, Set<string>> = {}
    for (const t of (tipos || [])) { if (!tm[t.coach_id]) tm[t.coach_id] = new Set<string>(); tm[t.coach_id].add(t.tipo) }
    setTiposMontar(tm)
    const fm: Record<string, { ini: string; fim: string }[]> = {}
    for (const f of (fer || [])) { if (!fm[f.coach_id]) fm[f.coach_id] = []; fm[f.coach_id].push({ ini: f.data_inicio, fim: f.data_fim }) }
    setFeriasMontar(fm)
    const om: Record<string, { media: number; n: number }> = {}
    for (const o of (ocup || [])) { om[`${o.coach_id}|${o.tipo}|${o.unidade_id}|${o.dia_semana}`] = { media: Number(o.ocupacao_media), n: o.n_aulas } }
    setOcupMap(om)
    setLoadingMontar(false)
  }

  // Motor "Montar sugestão" (auto-escala do dia visível). Greedy, idempotente.
  // Ocupação manda; variar é o padrão pra quem dá 2+ tipos; equilíbrio só desempata.
  async function montarSugestao() {
    if (!diaMontar) return
    const dia = diaMontar
    setMontando(true)
    const ocs = ocsMontarMap[dia] || []
    const dow = new Date(dia + 'T12:00:00').getDay()
    const assign: Record<string, string> = {} // ocId -> coachId (estado parcial do dia, começa vazio = limpo)
    const asgList = () => ocs
      .map((o: any) => ({ ocId: o.id, unidadeId: o.club_aulas?.unidade_id, tipo: o.club_aulas?.tipo, horario: o.club_aulas?.horario, coachId: assign[o.id] || null }))
      .filter((a: any) => a.coachId)
    // bolso estrutural = nº de coaches que dão o tipo E estão disponíveis na data (ataca os mais escassos primeiro)
    const bolso = (oc: any) => coachesMontar.filter((c: any) =>
      tiposMontar[c.id]?.has(oc.club_aulas?.tipo) &&
      dispMontar.has(`${c.id}|${dia}`) &&
      !deFeriasMontar(c.id, dia)).length
    const slots = [...ocs].sort((a: any, b: any) => {
      const ba = bolso(a), bb = bolso(b)
      if (ba !== bb) return ba - bb
      const ha = a.club_aulas?.horario || '', hb = b.club_aulas?.horario || ''
      if (ha !== hb) return ha.localeCompare(hb)
      return (a.club_aulas?.unidade_id || '').localeCompare(b.club_aulas?.unidade_id || '')
    })
    for (const oc of slots) {
      const tipo = oc.club_aulas?.tipo, uId = oc.club_aulas?.unidade_id
      const asg = asgList().filter((a: any) => a.ocId !== oc.id)
      const cands = coachesMontar.filter((c: any) => elegibilidadeMontar(oc, c.id, asg).ok)
      if (cands.length === 0) continue // deixa "Coach a definir"
      const best = cands.map((c: any) => {
        const o = ocupMap[`${c.id}|${tipo}|${uId}|${dow}`]
        const base = (o && o.n >= 3) ? o.media * 100 : -1
        const daVarios = (tiposMontar[c.id]?.size || 0) >= 2
        const tc = tipoCountNoDia(c.id, tipo, asg)
        const varietyPen = (daVarios && tc >= 2) ? VARIETY_PEN * (tc - 1) : 0
        const score = base - varietyPen - DESEMPATE * aulasNoDia(c.id, asg)
        return { id: c.id, score }
      }).sort((a: any, b: any) => b.score - a.score)[0]
      assign[oc.id] = best.id
    }
    // Persiste: cada ocorrência recebe o coach escolhido (ou null = "a definir").
    await Promise.all(ocs.map((o: any) =>
      supabase.from('club_ocorrencias').update({ coach_id: assign[o.id] || null }).eq('id', o.id)))
    await carregarMontar()
    setMontando(false)
  }

  // Zera as atribuições do dia visível (volta tudo à grade / "a definir").
  async function limparDia() {
    if (!diaMontar) return
    setMontando(true)
    const ocs = ocsMontarMap[diaMontar] || []
    await Promise.all(ocs.map((o: any) =>
      supabase.from('club_ocorrencias').update({ coach_id: null }).eq('id', o.id)))
    await carregarMontar()
    setMontando(false)
  }

  // Limpa um slot específico (volta à grade) sem abrir o modal.
  async function limparSlot(ocId: string) {
    await supabase.from('club_ocorrencias').update({ coach_id: null }).eq('id', ocId)
    await carregarMontar()
  }

  // ─── Resumo do mês (copiável p/ WhatsApp): só FDS de escala (sáb/dom) ───
  // Nome de unidade enxuto p/ o resumo por coach (tira o prefixo "JustClub").
  function unidadeCurta(id: string | null | undefined) {
    const n = nomeUnidade(id)
    return n.replace(/justclub/i, '').trim() || n
  }
  function rotuloDia(dataStr: string) {
    const d = new Date(dataStr + 'T12:00:00')
    const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()]
    return `${wd} ${dataStr.slice(8, 10)}/${dataStr.slice(5, 7)}`
  }
  // Sábado de referência do fim de semana de uma data (domingo agrupa com o sábado anterior).
  function sabadoDoFds(dataStr: string) {
    const d = new Date(dataStr + 'T12:00:00')
    if (d.getDay() === 0) d.setDate(d.getDate() - 1)
    return dataLocalStr(d)
  }

  // Carrega só as ocorrências de SÁBADO/DOMINGO do mês (escala de FDS, nunca a grade da semana),
  // das duas unidades, e monta os blocos copiáveis por unidade, por fim de semana e por coach.
  // Coach efetivo = escalado (coach_id) ou, na falta, o coach da grade. Reflete a escala já salva.
  async function carregarResumo() {
    setLoadingResumo(true)
    const clubIds = unidades.map((u: any) => u.id)
    const datas = fdsDoMes(mesResumo).map(f => f.data) // só sáb/dom do mês
    if (clubIds.length === 0 || datas.length === 0) {
      setBlocosUni([]); setBlocosFds([]); setBlocosCoach([]); setLoadingResumo(false); return
    }
    const cs = await fetchCoachesClub()
    const nomeById: Record<string, string> = {}
    for (const c of cs) nomeById[c.id] = c.nome

    const { data: aulasIds } = await supabase.from('club_aulas').select('id').in('unidade_id', clubIds).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    let ocs: any[] = []
    if (ids.length > 0) {
      const r = await supabase.from('club_ocorrencias')
        .select('id, data, coach_id, club_aulas(tipo, horario, unidade_id, coach_id, coaches(id, nome))')
        .in('aula_id', ids).in('data', datas).eq('status', 'ativa').order('data')
      ocs = r.data || []
    }

    const itens = ocs.map((o: any) => {
      const id = o.coach_id || o.club_aulas?.coaches?.id || null
      return {
        data: o.data,
        horario: (o.club_aulas?.horario || '').slice(0, 5),
        tipo: o.club_aulas?.tipo,
        unidadeId: o.club_aulas?.unidade_id,
        coachId: id,
        coachNome: id ? (nomeById[id] || o.club_aulas?.coaches?.nome || 'Coach') : null,
      }
    }).sort((a: any, b: any) => {
      if (a.data !== b.data)       return a.data.localeCompare(b.data)
      if (a.horario !== b.horario) return a.horario.localeCompare(b.horario)
      return (a.unidadeId || '').localeCompare(b.unidadeId || '')
    })

    const mesTxt = competenciaLabel(mesResumo)
    const plural = (n: number) => `${n} aula${n === 1 ? '' : 's'}`
    // Linhas de "• HH:MM Tipo — sufixo" agrupadas por dia, pra uma lista de itens.
    const linhasPorDia = (its: any[], sufixo: (it: any) => string) => {
      const out: string[] = []
      let last = ''
      for (const it of its) {
        if (it.data !== last) { out.push(rotuloDia(it.data)); last = it.data }
        out.push(`• ${it.horario} ${tipoLabel(it.tipo)} ${sufixo(it)}`)
      }
      return out
    }

    // ── Por unidade (mês todo) ──
    const bUni = unidades.map((u: any) => {
      const its = itens.filter((it: any) => it.unidadeId === u.id)
      const linhas = [`*ESCALA FDS — ${u.nome.toUpperCase()}*`, mesTxt, '']
      if (its.length === 0) linhas.push('_(sem aulas de fim de semana no mês)_')
      else linhas.push(...linhasPorDia(its, it => `— ${it.coachNome || 'A definir'}`))
      return { id: `uni:${u.id}`, titulo: u.nome, sub: plural(its.length), texto: linhas.join('\n').trim() }
    })

    // ── Por fim de semana (sáb + dom juntos), as duas unidades ──
    const sabKeys = Array.from(new Set(datas.map(sabadoDoFds))).sort()
    const bFds = sabKeys.map((sab: string) => {
      const diasWk = datas.filter(d => sabadoDoFds(d) === sab).sort()
      const itsWk = itens.filter((it: any) => diasWk.includes(it.data))
      const titulo = diasWk.map(rotuloDia).join(' + ')
      const linhas = [`*ESCALA FDS — ${titulo}*`, '']
      for (const u of unidades) {
        const itsU = itsWk.filter((it: any) => it.unidadeId === u.id)
        if (itsU.length === 0) continue
        linhas.push(`*${u.nome.toUpperCase()}*`)
        linhas.push(...linhasPorDia(itsU, it => `— ${it.coachNome || 'A definir'}`))
        linhas.push('')
      }
      return { id: `fds:${sab}`, titulo, sub: plural(itsWk.length), texto: linhas.join('\n').trim() }
    })

    // ── Por coach (mês todo) ──
    const porCoach: Record<string, any[]> = {}
    const semCoach: any[] = []
    for (const it of itens) {
      if (!it.coachId) { semCoach.push(it); continue }
      if (!porCoach[it.coachId]) porCoach[it.coachId] = []
      porCoach[it.coachId].push(it)
    }
    const mkCoach = (titulo: string, its: any[], id: string) => {
      const linhas = [`*${titulo} — ${mesTxt}*`, '']
      linhas.push(...linhasPorDia(its, it => `· ${unidadeCurta(it.unidadeId)}`))
      linhas.push('', `Total: ${plural(its.length)}`)
      return { id, titulo, sub: plural(its.length), texto: linhas.join('\n').trim() }
    }
    const bCoach = Object.keys(porCoach)
      .sort((a, b) => (porCoach[a][0].coachNome || '').localeCompare(porCoach[b][0].coachNome || ''))
      .map(cid => mkCoach(porCoach[cid][0].coachNome, porCoach[cid], `coach:${cid}`))
    if (semCoach.length > 0) bCoach.push(mkCoach('A definir', semCoach, 'coach:_indef'))

    setBlocosUni(bUni)
    setBlocosFds(bFds)
    setBlocosCoach(bCoach)
    setLoadingResumo(false)
  }

  async function copiarResumo(texto: string, qual: string) {
    try { await navigator.clipboard.writeText(texto) } catch (e) {}
    setCopiado(qual)
    setTimeout(() => setCopiado(c => (c === qual ? null : c)), 2000)
  }

  // Abre o modal e, no FDS/Montar, carrega quem já está ocupado no mesmo dia+horário (qualquer unidade Club).
  async function abrirModal(oc: any) {
    setModalAula(oc)
    setConflitoSet(new Set())
    if (aba !== 'fds' && aba !== 'montar') return
    const horario = oc?.club_aulas?.horario || ''
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id, coach_id, club_aulas(horario, coach_id)')
      .eq('data', oc.data).eq('status', 'ativa')
    const ocup = new Set<string>()
    for (const o of (ocs || [])) {
      if (o.id === oc.id) continue
      if (((o.club_aulas as any)?.horario || '') !== horario) continue
      const eff = o.coach_id || (o.club_aulas as any)?.coach_id
      if (eff) ocup.add(eff)
    }
    setConflitoSet(ocup)
  }

  if (loading || loadingUnidades) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ width:32, height:32, border:`4px solid ${ACCENT}`, borderTopColor:'transparent',
        borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding:'2rem', fontFamily:"'DM Sans', sans-serif", maxWidth:1100 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* Header */}
      <div style={{ marginBottom:'1.5rem' }}>
        <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:28, color:'#111', letterSpacing:1 }}>
          Escala Club
        </div>
        <div style={{ fontSize:13, color:'#888', marginTop:2 }}>
          Coaches escalados pontualmente — fins de semana e feriados, sobrescreve a grade fixa
        </div>
      </div>

      {/* Banner explicativo */}
      {aba === 'capacidade' ? (
        <div style={{ background:`${VERDE}10`, border:`1px solid ${VERDE}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#0f766e' }}>
          💡 Marque <strong>quais tipos cada coach sabe dar</strong>. Isso define quem aparece como elegível na montagem da escala — vale em qualquer unidade Club.
        </div>
      ) : aba === 'disponibilidade' ? (
        <div style={{ background:`${AMARELO}12`, border:`1px solid ${AMARELO}50`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#a16207' }}>
          💡 Marque <strong>quem está disponível</strong> em cada sábado/domingo do mês, conforme cada coach avisar. É o que filtra os coaches elegíveis na montagem.
        </div>
      ) : aba === 'montar' ? (
        <div style={{ background:`${ACCENT}0d`, border:`1px solid ${ACCENT}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#b91c6b' }}>
          💡 Monte o dia inteiro com as <strong>duas unidades lado a lado</strong>. O coach é recurso do dia: trava numa unidade e tem teto de 4 aulas. Use <strong>Montar sugestão</strong> pra auto-escalar e ajuste à mão.
        </div>
      ) : aba === 'resumo' ? (
        <div style={{ background:`${VERDE}10`, border:`1px solid ${VERDE}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#0f766e' }}>
          💡 Só a escala de <strong>fim de semana (sáb/dom)</strong>, nunca a grade da semana. Cada bloco tem seu <strong>Copiar</strong> — por unidade, por fim de semana e por coach — pronto pro WhatsApp (com os <code>*negritos*</code> que ele formata). Reflete a escala já salva (sugestão + ajustes).
        </div>
      ) : aba === 'fds' ? (
        <div style={{ background:`${CYAN}10`, border:`1px solid ${CYAN}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#0e7490' }}>
          💡 A escala aqui <strong>sobrescreve</strong> o coach da grade fixa só para o dia específico. Para limpar, clique no coach atual e escolha "Voltar à grade".
        </div>
      ) : (
        <div style={{ background:`${ACCENT}10`, border:`1px solid ${ACCENT}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:'#b91c6b' }}>
          💡 Os feriados e suas aulas são criados em <strong>Cadastrar Aulas</strong>. Aqui você só escala o coach de cada aula — clique na aula pra escolher.
        </div>
      )}

      {/* Seletor de unidade (Montar mostra as 2 juntas, não precisa de seletor) */}
      {aba !== 'capacidade' && aba !== 'disponibilidade' && aba !== 'montar' && aba !== 'resumo' && unidades.length > 1 && (
        <div style={{ display:'flex', gap:8, marginBottom:'1.5rem', flexWrap:'wrap' }}>
          {unidades.map((u: any) => (
            <button key={u.id} onClick={() => setUnidadeSel(u)}
              style={{ padding:'0.5rem 1.25rem', borderRadius:10,
                border:`1.5px solid ${unidadeSel?.id===u.id?CYAN:'#e5e7eb'}`,
                background: unidadeSel?.id===u.id?`${CYAN}15`:'#fff',
                color: unidadeSel?.id===u.id?CYAN:'#555',
                fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
              {u.nome}
            </button>
          ))}
        </div>
      )}

      {/* Abas: FDS / Montar / Feriados / Capacidade / Disponibilidade */}
      <div style={{ display:'flex', gap:8, borderBottom:'1px solid #e5e7eb', marginBottom:'1.5rem' }}>
        {[
          { key:'fds',             label:'Final de Semana' },
          { key:'montar',          label:'Montar' },
          { key:'resumo',          label:'Resumo' },
          { key:'feriados',        label:'Feriados' },
          { key:'capacidade',      label:'Capacidade' },
          { key:'disponibilidade', label:'Disponibilidade' },
        ].map(t => (
          <button key={t.key} onClick={() => setAba(t.key as any)}
            style={{ padding:'0.6rem 1rem', fontSize:14, fontWeight:600,
              borderBottom:`2px solid ${aba===t.key ? ACCENT : 'transparent'}`,
              color: aba===t.key ? ACCENT : '#888', background:'transparent',
              cursor:'pointer', marginBottom:-1, fontFamily:"'DM Sans', sans-serif" }}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'capacidade' ? (
        loadingCap ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Carregando capacidade...</div>
        ) : coachesClub.length === 0 ? (
          <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
            Nenhum coach Club ativo.<br/>
            <span style={{ fontSize:12 }}>Habilite uma unidade Club no coach em <strong>Coaches → Unidades</strong>.</span>
          </div>
        ) : (
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:'1.25rem', overflowX:'auto' }}>
            <table style={{ borderCollapse:'collapse', width:'100%', fontFamily:"'DM Sans', sans-serif" }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left', padding:'0.5rem 0.75rem', fontSize:11, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5, borderBottom:'1px solid #f0f0f0' }}>Coach</th>
                  {TIPOS_CLUB.map(t => (
                    <th key={t} style={{ padding:'0.5rem', fontSize:11, fontWeight:700, color:tipoColor(t), textTransform:'uppercase', letterSpacing:0.5, borderBottom:'1px solid #f0f0f0', minWidth:120 }}>
                      {tipoLabel(t)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coachesClub.map((c: any) => (
                  <tr key={c.id} style={{ borderBottom:'1px solid #f7f7f7' }}>
                    <td style={{ padding:'0.6rem 0.75rem', fontSize:13, fontWeight:600, color:'#111', whiteSpace:'nowrap' }}>{c.nome}</td>
                    {TIPOS_CLUB.map(t => {
                      const ativo      = capMatrix[c.id]?.has(t) || false
                      const carregando = salvandoCap === `${c.id}-${t}`
                      const cor        = tipoColor(t)
                      return (
                        <td key={t} style={{ padding:'0.4rem', textAlign:'center' }}>
                          <button onClick={() => toggleCap(c.id, t)} disabled={carregando}
                            style={{ width:30, height:30, borderRadius:8, cursor: carregando ? 'default' : 'pointer',
                              border:`1.5px solid ${ativo ? cor : '#e5e7eb'}`, background: ativo ? `${cor}18` : '#fff',
                              color: ativo ? cor : '#ddd', fontSize:15, fontWeight:700,
                              display:'inline-flex', alignItems:'center', justifyContent:'center',
                              opacity: carregando ? 0.5 : 1, fontFamily:"'DM Sans', sans-serif" }}>
                            {carregando ? '·' : ativo ? '✓' : ''}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : aba === 'disponibilidade' ? (
        (() => {
          const fds = fdsDoMes(competencia)
          return (
          <div>
            {/* Seletor de mês */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:'1.25rem' }}>
              <button onClick={() => setCompetencia(c => addMes(c, -1))}
                style={{ width:34, height:34, borderRadius:10, border:'1.5px solid #e5e7eb', background:'#fff', cursor:'pointer', fontSize:14, color:'#555' }}>◀</button>
              <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#111', letterSpacing:0.5, textTransform:'capitalize', minWidth:200, textAlign:'center' }}>
                {competenciaLabel(competencia)}
              </div>
              <button onClick={() => setCompetencia(c => addMes(c, 1))}
                style={{ width:34, height:34, borderRadius:10, border:'1.5px solid #e5e7eb', background:'#fff', cursor:'pointer', fontSize:14, color:'#555' }}>▶</button>
            </div>

            {loadingDisp ? (
              <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Carregando disponibilidade...</div>
            ) : coachesClub.length === 0 ? (
              <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
                Nenhum coach Club ativo.<br/>
                <span style={{ fontSize:12 }}>Habilite uma unidade Club no coach em <strong>Coaches → Unidades</strong>.</span>
              </div>
            ) : fds.length === 0 ? (
              <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
                Sem fins de semana nesta competência.
              </div>
            ) : (
              <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:'1.25rem', overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', width:'100%', fontFamily:"'DM Sans', sans-serif" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:'left', padding:'0.5rem 0.75rem', fontSize:11, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5, borderBottom:'1px solid #f0f0f0', position:'sticky', left:0, background:'#fff' }}>Coach</th>
                      {fds.map(f => {
                        const dia = f.data.slice(8, 10)
                        return (
                          <th key={f.data} style={{ padding:'0.4rem 0.3rem', borderBottom:'1px solid #f0f0f0', minWidth:48 }}>
                            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:18, color:'#111', lineHeight:1 }}>{dia}</div>
                            <div style={{ fontSize:10, fontWeight:700, color: f.dow === 6 ? CYAN : ACCENT, textTransform:'uppercase', letterSpacing:0.5 }}>
                              {f.dow === 6 ? 'Sáb' : 'Dom'}
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {coachesClub.map((c: any) => (
                      <tr key={c.id} style={{ borderBottom:'1px solid #f7f7f7' }}>
                        <td style={{ padding:'0.5rem 0.75rem', fontSize:13, fontWeight:600, color:'#111', whiteSpace:'nowrap', position:'sticky', left:0, background:'#fff' }}>{c.nome}</td>
                        {fds.map(f => {
                          const key = `${c.id}|${f.data}`
                          const on = dispSet.has(key)
                          const carregando = salvandoDisp === key
                          return (
                            <td key={f.data} style={{ padding:'0.3rem', textAlign:'center' }}>
                              <button onClick={() => toggleDisp(c.id, f.data)} disabled={carregando}
                                style={{ width:30, height:30, borderRadius:8, cursor: carregando ? 'default' : 'pointer',
                                  border:`1.5px solid ${on ? VERDE : '#e5e7eb'}`, background: on ? `${VERDE}18` : '#fff',
                                  color: on ? VERDE : '#ddd', fontSize:15, fontWeight:700,
                                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                                  opacity: carregando ? 0.5 : 1, fontFamily:"'DM Sans', sans-serif" }}>
                                {carregando ? '·' : on ? '✓' : ''}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )
        })()
      ) : aba === 'montar' ? (
        /* ===== ABA MONTAR (visão 2 unidades + auto-escala) ===== */
        (() => {
          const fdsMes   = fdsDoMes(mesMontar)
          const datasMes = fdsMes.map(f => f.data)
          const dia      = diaMontar
          const idx      = dia ? datasMes.indexOf(dia) : -1
          const dow      = dia ? new Date(dia + 'T12:00:00').getDay() : 0
          const dayAssignments = dia ? assignmentsDoDia(dia) : []
          // Ocupação histórica do coach pra um slot (tipo+unidade+dia). Mín. 3 aulas pra ranquear.
          const ocupDe = (coachId: string, tipo: string, uId: string) => {
            const o = ocupMap[`${coachId}|${tipo}|${uId}|${dow}`]
            return (o && o.n >= 3) ? o : null
          }
          const disponiveisHoje = dia ? coachesMontar.filter((c: any) => dispMontar.has(`${c.id}|${dia}`) && !deFeriasMontar(c.id, dia)) : []
          const semDispHoje      = dia ? coachesMontar.filter((c: any) => !dispMontar.has(`${c.id}|${dia}`) && (tiposMontar[c.id]?.size || 0) > 0) : []
          const totalOcsDia      = dia ? (ocsMontarMap[dia] || []).length : 0

          return (
          <div>
            {/* Seletor de mês */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:'1rem' }}>
              <button onClick={() => setMesMontar(c => addMes(c, -1))}
                style={{ width:34, height:34, borderRadius:10, border:'1.5px solid #e5e7eb', background:'#fff', cursor:'pointer', fontSize:14, color:'#555' }}>◀</button>
              <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#111', letterSpacing:0.5, textTransform:'capitalize', minWidth:200, textAlign:'center' }}>
                {competenciaLabel(mesMontar)}
              </div>
              <button onClick={() => setMesMontar(c => addMes(c, 1))}
                style={{ width:34, height:34, borderRadius:10, border:'1.5px solid #e5e7eb', background:'#fff', cursor:'pointer', fontSize:14, color:'#555' }}>▶</button>
            </div>

            {loadingMontar ? (
              <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Carregando o dia...</div>
            ) : coachesMontar.length === 0 ? (
              <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
                Nenhum coach Club ativo.<br/>
                <span style={{ fontSize:12 }}>Habilite uma unidade Club no coach em <strong>Coaches → Unidades</strong>.</span>
              </div>
            ) : datasMes.length === 0 ? (
              <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
                Sem fins de semana neste mês.
              </div>
            ) : (
              <>
                {/* Navegação por dia */}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'1rem' }}>
                  <button disabled={idx <= 0} onClick={() => idx > 0 && setDiaMontar(datasMes[idx - 1])}
                    style={{ width:32, height:32, borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff',
                      cursor: idx <= 0 ? 'default' : 'pointer', fontSize:16, color:'#555', opacity: idx <= 0 ? 0.4 : 1, flexShrink:0 }}>‹</button>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', flex:1 }}>
                    {fdsMes.map(f => {
                      const sel = f.data === dia
                      return (
                        <button key={f.data} onClick={() => setDiaMontar(f.data)}
                          style={{ padding:'0.35rem 0.7rem', borderRadius:10,
                            border:`1.5px solid ${sel ? ACCENT : '#e5e7eb'}`, background: sel ? `${ACCENT}12` : '#fff',
                            color: sel ? ACCENT : '#555', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                          {f.data.slice(8, 10)} <span style={{ fontSize:10, fontWeight:700, opacity:0.8 }}>{f.dow === 6 ? 'Sáb' : 'Dom'}</span>
                        </button>
                      )
                    })}
                  </div>
                  <button disabled={idx >= datasMes.length - 1} onClick={() => idx < datasMes.length - 1 && setDiaMontar(datasMes[idx + 1])}
                    style={{ width:32, height:32, borderRadius:8, border:'1.5px solid #e5e7eb', background:'#fff',
                      cursor: idx >= datasMes.length - 1 ? 'default' : 'pointer', fontSize:16, color:'#555', opacity: idx >= datasMes.length - 1 ? 0.4 : 1, flexShrink:0 }}>›</button>
                </div>

                {/* Ações */}
                <div style={{ display:'flex', gap:8, marginBottom:'1rem' }}>
                  <button onClick={montarSugestao} disabled={montando || totalOcsDia === 0}
                    style={{ padding:'0.6rem 1.25rem', borderRadius:10, border:'none', background:ACCENT, color:'#fff',
                      fontSize:13, fontWeight:700, cursor: (montando || totalOcsDia === 0) ? 'default' : 'pointer',
                      opacity: (montando || totalOcsDia === 0) ? 0.5 : 1, fontFamily:"'DM Sans', sans-serif" }}>
                    {montando ? 'Montando…' : '⚡ Montar sugestão'}
                  </button>
                  <button onClick={limparDia} disabled={montando || totalOcsDia === 0}
                    style={{ padding:'0.6rem 1.25rem', borderRadius:10, border:'1.5px solid #e5e7eb', background:'#fff', color:'#555',
                      fontSize:13, fontWeight:600, cursor: (montando || totalOcsDia === 0) ? 'default' : 'pointer',
                      opacity: (montando || totalOcsDia === 0) ? 0.5 : 1, fontFamily:"'DM Sans', sans-serif" }}>
                    Limpar dia
                  </button>
                </div>

                {/* Painel: Disponíveis nesse dia */}
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:'1rem 1.25rem', marginBottom:'1rem' }}>
                  <div style={{ fontSize:11, color:'#aaa', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Disponíveis nesse dia</div>
                  {disponiveisHoje.length === 0 ? (
                    <div style={{ fontSize:12, color:'#aaa', fontStyle:'italic' }}>Ninguém marcou disponibilidade nesse dia.</div>
                  ) : (
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {disponiveisHoje.map((c: any) => {
                        const n      = aulasNoDia(c.id, dayAssignments)
                        const uTrava = unidadeDoCoachNoDia(c.id, dayAssignments)
                        const cheio  = n >= 4
                        return (
                          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'0.4rem 0.7rem', borderRadius:12,
                            border:`1.5px solid ${cheio ? `${AMARELO}80` : '#eee'}`, background: cheio ? `${AMARELO}12` : '#fafafa' }}>
                            <span style={{ fontSize:13, fontWeight:600, color:'#111' }}>{c.nome}</span>
                            <span style={{ fontSize:10, fontWeight:700, color: cheio ? '#a16207' : '#888',
                              background: cheio ? `${AMARELO}25` : '#eee', padding:'1px 7px', borderRadius:10 }}>
                              {n}/4{cheio ? ' · cheio' : ''}
                            </span>
                            {uTrava && (
                              <span style={{ fontSize:10, fontWeight:700, color:CYAN, background:`${CYAN}18`, padding:'1px 7px', borderRadius:10 }}>
                                {nomeUnidade(uTrava)}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {semDispHoje.length > 0 && (
                    <div style={{ marginTop:10, fontSize:11, color:'#bbb' }}>
                      <strong style={{ color:'#aaa' }}>Sem disponibilidade:</strong> {semDispHoje.map((c: any) => c.nome).join(', ')}
                    </div>
                  )}
                </div>

                {/* Aviso: dia sem ocorrências geradas */}
                {totalOcsDia === 0 && (
                  <div style={{ background:`${VERMELHO}0d`, border:`1px solid ${VERMELHO}40`, borderRadius:12, padding:'0.75rem 1rem', marginBottom:'1rem', fontSize:13, color:'#b91c1c' }}>
                    Nenhuma aula gerada para este dia nas unidades Club. Confirme a geração das ocorrências do mês.
                  </div>
                )}

                {/* Quadro: 2 unidades lado a lado */}
                {totalOcsDia > 0 && dia && (
                  <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.max(unidades.length, 1)}, 1fr)`, gap:'1rem' }}>
                    {unidades.map((u: any) => {
                      const ocsU = (ocsMontarMap[dia] || []).filter((o: any) => o.club_aulas?.unidade_id === u.id)
                      return (
                        <div key={u.id} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:'1.25rem' }}>
                          <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#111', letterSpacing:0.5, marginBottom:'1rem', paddingBottom:'0.6rem', borderBottom:'1px solid #f3f4f6' }}>
                            {u.nome}
                          </div>
                          {ocsU.length === 0 ? (
                            <div style={{ fontSize:12, color:'#aaa', fontStyle:'italic', padding:'0.5rem 0' }}>Nenhuma aula neste dia</div>
                          ) : (
                            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                              {ocsU.map((oc: any) => {
                                const aula = oc.club_aulas
                                const ef   = efetivoMontar(oc)
                                const cor  = tipoColor(aula?.tipo)
                                const corOrigem = ef.origem === 'escalado' ? ACCENT : ef.origem === 'grade' ? '#888' : VERMELHO
                                const asgEx = dayAssignments.filter(a => a.ocId !== oc.id)
                                const livres = coachesMontar.filter((c: any) => elegibilidadeMontar(oc, c.id, asgEx).ok)
                                const ranked = livres
                                  .map((c: any) => ({ c, o: ocupDe(c.id, aula?.tipo, u.id) }))
                                  .sort((a: any, b: any) => ((b.o?.media ?? -1) - (a.o?.media ?? -1)))
                                const ghost  = ranked[0]
                                const ocupEf = ef.id ? ocupDe(ef.id, aula?.tipo, u.id) : null
                                const escassezCor = livres.length <= 1 ? VERMELHO : livres.length === 2 ? AMARELO : null

                                return (
                                  <div key={oc.id} onClick={() => abrirModal(oc)}
                                    style={{ display:'flex', alignItems:'center', gap:10, padding:'0.6rem 0.75rem',
                                      background:'#fafafa', border:'1px solid #f0f0f0', borderRadius:10, cursor:'pointer', transition:'all .15s' }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = ACCENT)}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}>

                                    <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, fontWeight:700, color:'#111', minWidth:46 }}>
                                      {(aula?.horario || '').slice(0, 5)}
                                    </div>

                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                                        <span style={{ fontSize:10, fontWeight:700, color:cor, background:`${cor}18`, padding:'1px 7px', borderRadius:14 }}>{tipoLabel(aula?.tipo)}</span>
                                        <span style={{ fontSize:11, color:'#aaa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                          {aula?.grupos_musculares?.nome || ''}
                                        </span>
                                      </div>
                                      {ef.origem === 'indefinido' ? (
                                        ghost ? (
                                          <div style={{ fontSize:12, color:'#999', fontStyle:'italic' }}>
                                            sugerido: <span style={{ fontWeight:600, fontStyle:'normal', color:'#555' }}>{ghost.c.nome}</span>
                                            {ghost.o ? <span style={{ color:VERDE, fontStyle:'normal', fontWeight:700 }}> · {Math.round(ghost.o.media * 100)}%</span> : null}
                                          </div>
                                        ) : (
                                          <div style={{ fontSize:12, color:VERMELHO, fontWeight:600 }}>nenhum elegível livre</div>
                                        )
                                      ) : (
                                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                          <span style={{ fontSize:12, fontWeight:600, color:'#111' }}>{ef.nome}</span>
                                          <span style={{ fontSize:9, fontWeight:700, color:corOrigem, background:`${corOrigem}15`, padding:'1px 6px', borderRadius:8, textTransform:'uppercase', letterSpacing:0.5 }}>
                                            {ef.origem === 'escalado' ? 'escalado' : 'padrão'}
                                          </span>
                                          {ocupEf && (
                                            <span style={{ fontSize:10, fontWeight:700, color:VERDE, background:`${VERDE}18`, padding:'1px 7px', borderRadius:10 }}>
                                              {Math.round(ocupEf.media * 100)}% ocup.
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {ef.origem === 'indefinido' ? (
                                      <span style={{ fontSize:10, fontWeight:700, flexShrink:0,
                                        color: escassezCor || '#bbb', background: escassezCor ? `${escassezCor}18` : '#f0f0f0', padding:'2px 8px', borderRadius:10 }}>
                                        {livres.length} livre{livres.length === 1 ? '' : 's'}
                                      </span>
                                    ) : ef.origem === 'escalado' ? (
                                      <button onClick={(e) => { e.stopPropagation(); limparSlot(oc.id) }}
                                        title="Voltar à grade"
                                        style={{ flexShrink:0, width:24, height:24, borderRadius:8, border:'1px solid #eee', background:'#fff',
                                          color:'#aaa', fontSize:13, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                                        ×
                                      </button>
                                    ) : (
                                      <div style={{ fontSize:14, color:'#ccc', flexShrink:0 }}>›</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          )
        })()
      ) : aba === 'resumo' ? (
        /* ===== ABA RESUMO (copiável p/ WhatsApp) ===== */
        <div>
          {/* Seletor de mês */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:'1.25rem' }}>
            <button onClick={() => setMesResumo(c => addMes(c, -1))}
              style={{ width:34, height:34, borderRadius:10, border:'1.5px solid #e5e7eb', background:'#fff', cursor:'pointer', fontSize:14, color:'#555' }}>◀</button>
            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#111', letterSpacing:0.5, textTransform:'capitalize', minWidth:200, textAlign:'center' }}>
              {competenciaLabel(mesResumo)}
            </div>
            <button onClick={() => setMesResumo(c => addMes(c, 1))}
              style={{ width:34, height:34, borderRadius:10, border:'1.5px solid #e5e7eb', background:'#fff', cursor:'pointer', fontSize:14, color:'#555' }}>▶</button>
          </div>

          {loadingResumo ? (
            <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Gerando resumo...</div>
          ) : (() => {
            // Card de um bloco copiável (título + Copiar + prévia do texto).
            const card = (b: any) => (
              <div key={b.id} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:'1rem 1.1rem', display:'flex', flexDirection:'column' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:8 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#111', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{b.titulo}</div>
                    <div style={{ fontSize:11, color:'#aaa', marginTop:1 }}>{b.sub}</div>
                  </div>
                  <button onClick={() => copiarResumo(b.texto, b.id)}
                    style={{ flexShrink:0, padding:'0.4rem 0.85rem', borderRadius:10, border:'none',
                      background: copiado === b.id ? VERDE : ACCENT, color:'#fff', fontSize:12, fontWeight:700,
                      cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    {copiado === b.id ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <pre style={{ margin:0, maxHeight:220, overflow:'auto', borderRadius:10, border:'1px solid #eee',
                  background:'#fafafa', padding:'0.7rem', fontFamily:"'DM Mono', monospace", fontSize:11.5,
                  color:'#333', lineHeight:1.5, whiteSpace:'pre-wrap' }}>{b.texto}</pre>
              </div>
            )
            // Uma seção (título + descrição + grade de cards).
            const secao = (titulo: string, desc: string, blocos: any[], cols: number) => (
              <div style={{ marginBottom:'1.75rem' }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:'0.75rem' }}>
                  <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:18, color:'#111', letterSpacing:0.5 }}>{titulo}</div>
                  <div style={{ fontSize:12, color:'#aaa' }}>{desc}</div>
                </div>
                {blocos.length === 0 ? (
                  <div style={{ fontSize:13, color:'#aaa', fontStyle:'italic' }}>Sem aulas de fim de semana neste mês.</div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:'0.85rem' }}>
                    {blocos.map(card)}
                  </div>
                )}
              </div>
            )
            return (
              <>
                {secao('Por unidade', 'cada unidade, mês todo', blocosUni, 2)}
                {secao('Por fim de semana', 'cada FDS, as duas unidades', blocosFds, 2)}
                {secao('Por coach', 'cada coach, mês todo — mandar individual', blocosCoach, 3)}
              </>
            )
          })()}
        </div>
      ) : !unidadeSel ? (
        <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa' }}>
          Nenhuma unidade Club encontrada.
        </div>
      ) : aba === 'fds' ? (
        loadingDados ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Carregando aulas...</div>
        ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          {proximosFDS.map(({ data, nome }) => {
            const ocs = ocorrenciasMap[data] || []
            const dataObj = new Date(data + 'T12:00:00')
            const diaNum = dataObj.getDate()
            const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })

            return (
              <div key={data} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, padding:'1.25rem' }}>
                {/* Header do card de data */}
                <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:'1rem', paddingBottom:'0.75rem', borderBottom:'1px solid #f3f4f6' }}>
                  <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:32, color:'#111', lineHeight:1 }}>{diaNum}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>{nome}</div>
                    <div style={{ fontSize:11, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5 }}>{mesNome}</div>
                  </div>
                </div>

                {/* Lista de aulas do dia */}
                {ocs.length === 0 ? (
                  <div style={{ fontSize:12, color:'#aaa', fontStyle:'italic', padding:'0.5rem 0' }}>
                    Nenhuma aula cadastrada
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {ocs.map((oc: any) => {
                      const aula = oc.club_aulas
                      const ef = coachEfetivo(oc)
                      const cor = tipoColor(aula?.tipo)
                      const corOrigem = ef.origem === 'escalado' ? ACCENT : ef.origem === 'grade' ? '#888' : VERMELHO

                      return (
                        <div key={oc.id} onClick={() => abrirModal(oc)}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'0.6rem 0.75rem',
                            background:'#fafafa', border:'1px solid #f0f0f0', borderRadius:10, cursor:'pointer',
                            transition:'all .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = ACCENT)}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}>

                          <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, fontWeight:700, color:'#111', minWidth:46 }}>
                            {(aula?.horario||'').slice(0,5)}
                          </div>

                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                              <span style={{ fontSize:10, fontWeight:700, color:cor, background:`${cor}18`,
                                padding:'1px 7px', borderRadius:14 }}>{tipoLabel(aula?.tipo)}</span>
                              <span style={{ fontSize:11, color:'#aaa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {aula?.grupos_musculares?.nome || ''}
                              </span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ fontSize:12, fontWeight:600, color: ef.origem==='indefinido' ? VERMELHO : '#111' }}>
                                {ef.nome}
                              </span>
                              <span style={{ fontSize:9, fontWeight:700, color:corOrigem, background:`${corOrigem}15`,
                                padding:'1px 6px', borderRadius:8, textTransform:'uppercase', letterSpacing:0.5 }}>
                                {ef.origem === 'escalado' ? 'escalado' : ef.origem === 'grade' ? 'padrão' : 'definir'}
                              </span>
                            </div>
                          </div>

                          <div style={{ fontSize:14, color:'#ccc' }}>›</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        )
      ) : (
        /* ===== ABA FERIADOS ===== */
        loadingFeriados ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#aaa', fontSize:14 }}>Carregando feriados...</div>
        ) : feriados.length === 0 ? (
          <div style={{ background:'#f9fafb', border:'1px dashed #e5e7eb', borderRadius:16, padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
            Nenhum feriado cadastrado para esta unidade.<br/>
            <span style={{ fontSize:12 }}>Crie em <strong>Cadastrar Aulas → Feriados</strong>.</span>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {feriados.map((f: any) => {
              const ocs = ocorrenciasFeriadoMap[f.id] || []
              const dataObj = new Date(f.data + 'T12:00:00')
              const diaNum = dataObj.getDate()
              const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })
              const diaSem = dataObj.toLocaleDateString('pt-BR', { weekday: 'long' })
              return (
                <div key={f.id} style={{ background:'#fff', border:'1px solid #fed7aa', borderRadius:16, padding:'1.25rem' }}>
                  {/* Header do feriado */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:'1rem', paddingBottom:'0.75rem', borderBottom:'1px solid #f3f4f6' }}>
                    <div style={{ textAlign:'center', flexShrink:0, width:46 }}>
                      <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:32, color:'#f97316', lineHeight:1 }}>{diaNum}</div>
                      <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5 }}>{mesNome}</div>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'#111' }}>{f.descricao}</div>
                      <div style={{ fontSize:12, color:'#aaa', textTransform:'capitalize', marginTop:1 }}>{diaSem}</div>
                      <div style={{ fontSize:11, fontWeight:600, marginTop:4, color: f.ativo ? '#ea580c' : '#9ca3af' }}>
                        {f.ativo ? '● Feriado ativo · grade regular cancelada' : '○ Feriado inativo'}
                      </div>
                    </div>
                  </div>

                  {/* Aulas do feriado */}
                  {ocs.length === 0 ? (
                    <div style={{ fontSize:12, color:'#aaa', fontStyle:'italic', padding:'0.5rem 0' }}>
                      Nenhuma aula cadastrada para este feriado. Adicione em Cadastrar Aulas.
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {ocs.map((oc: any) => {
                        const aula = oc.club_aulas
                        const ef = coachEfetivo(oc)
                        const cor = tipoColor(aula?.tipo)
                        const corOrigem = ef.origem === 'escalado' ? ACCENT : ef.origem === 'grade' ? '#888' : VERMELHO
                        return (
                          <div key={oc.id} onClick={() => abrirModal(oc)}
                            style={{ display:'flex', alignItems:'center', gap:10, padding:'0.6rem 0.75rem',
                              background:'#fafafa', border:'1px solid #f0f0f0', borderRadius:10, cursor:'pointer',
                              transition:'all .15s' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = ACCENT)}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}>

                            <div style={{ fontFamily:"'DM Mono', monospace", fontSize:14, fontWeight:700, color:'#111', minWidth:46 }}>
                              {(aula?.horario||'').slice(0,5)}
                            </div>

                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                                <span style={{ fontSize:10, fontWeight:700, color:cor, background:`${cor}18`,
                                  padding:'1px 7px', borderRadius:14 }}>{tipoLabel(aula?.tipo)}</span>
                                <span style={{ fontSize:11, color:'#aaa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {aula?.grupos_musculares?.nome || ''}
                                </span>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ fontSize:12, fontWeight:600, color: ef.origem==='indefinido' ? VERMELHO : '#111' }}>
                                  {ef.nome}
                                </span>
                                <span style={{ fontSize:9, fontWeight:700, color:corOrigem, background:`${corOrigem}15`,
                                  padding:'1px 6px', borderRadius:8, textTransform:'uppercase', letterSpacing:0.5 }}>
                                  {ef.origem === 'escalado' ? 'escalado' : ef.origem === 'grade' ? 'padrão' : 'definir'}
                                </span>
                              </div>
                            </div>

                            <div style={{ fontSize:14, color:'#ccc' }}>›</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Modal de escalar coach */}
      {modalAula && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:440, padding:'1.5rem', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ marginBottom:'1rem' }}>
              <div style={{ fontSize:11, color:'#aaa', textTransform:'uppercase', letterSpacing:1 }}>
                {new Date(modalAula.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })}
              </div>
              <div style={{ fontSize:18, fontWeight:600, color:'#111', marginTop:2 }}>
                {tipoLabel(modalAula.club_aulas?.tipo)} — {(modalAula.club_aulas?.horario||'').slice(0,5)}
              </div>
              <div style={{ fontSize:12, color:'#888', marginTop:4 }}>
                {modalAula.club_aulas?.grupos_musculares?.nome || ''}
                {aba === 'montar' && modalAula.club_aulas?.unidade_id && (
                  <span style={{ marginLeft:8, color:CYAN, fontWeight:600 }}>· {nomeUnidade(modalAula.club_aulas.unidade_id)}</span>
                )}
              </div>
            </div>

            <div style={{ fontSize:12, color:'#888', marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>
              Escolher coach
            </div>

            {/* Opção: voltar à grade */}
            <button
              onClick={() => salvarCoach(null)}
              disabled={salvando}
              style={{ display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left' as const,
                padding:'0.75rem 1rem', borderRadius:10, border:'1.5px dashed #ccc', background:'#fff',
                cursor:'pointer', marginBottom:8, fontFamily:"'DM Sans', sans-serif", opacity: salvando ? 0.5 : 1 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'#f3f4f6',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#888' }}>
                ↺
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#555' }}>Voltar à grade</div>
                <div style={{ fontSize:11, color:'#aaa' }}>Usa o coach padrão da aula recorrente</div>
              </div>
            </button>

            {/* Lista de coaches */}
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:'1rem' }}>
              {(() => {
                const modoFds    = aba === 'fds'
                const modoMontar = aba === 'montar'
                const modoEleg   = modoFds || modoMontar
                const dow  = new Date(modalAula.data + 'T12:00:00').getDay()
                const tipo = modalAula?.club_aulas?.tipo
                const uId  = modoMontar ? modalAula?.club_aulas?.unidade_id : unidadeSel?.id
                const baseCoaches = modoMontar ? coachesMontar : coaches
                // Atribuições do dia (montar), excluindo a própria ocorrência sendo escalada.
                const asgManual = modoMontar ? assignmentsDoDia(modalAula.data).filter(a => a.ocId !== modalAula.id) : []
                const elegFn = (cid: string) =>
                  modoMontar ? elegibilidadeMontar(modalAula, cid, asgManual)
                  : modoFds   ? elegibilidade(modalAula, cid)
                  :             { ok: true, motivo: '' }
                // Ocupação histórica do coach pra ESTE slot (tipo+unidade+dia). Mín. 3 aulas pra ranquear.
                const ocupDe = (coachId: string) => {
                  const o = ocupMap[`${coachId}|${tipo}|${uId}|${dow}`]
                  return (o && o.n >= 3) ? o : null
                }
                // Ordena: elegíveis (sem conflito) primeiro; dentro, por ocupação desc; depois nome.
                const lista = modoEleg
                  ? [...baseCoaches].sort((a: any, b: any) => {
                      const ea = elegFn(a.id).ok && !conflitoSet.has(a.id)
                      const eb = elegFn(b.id).ok && !conflitoSet.has(b.id)
                      if (ea !== eb) return (eb ? 1 : 0) - (ea ? 1 : 0)
                      const oa = ocupDe(a.id)?.media ?? -1
                      const ob = ocupDe(b.id)?.media ?? -1
                      if (ob !== oa) return ob - oa
                      return (a.nome || '').localeCompare(b.nome || '')
                    })
                  : baseCoaches
                return lista.map((c: any) => {
                  const selecionado = modalAula.coach_id === c.id
                  const el        = modoEleg ? elegFn(c.id) : { ok: true, motivo: '' }
                  const conflito  = modoEleg && conflitoSet.has(c.id)
                  const bloqueado = modoEleg && (!el.ok || conflito) && !selecionado
                  const motivo    = conflito ? 'já escalado neste horário' : el.motivo
                  return (
                    <button key={c.id}
                      onClick={() => { if (!bloqueado) salvarCoach(c.id) }}
                      disabled={salvando || bloqueado}
                      title={bloqueado ? motivo : ''}
                      style={{ display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left' as const,
                        padding:'0.75rem 1rem', borderRadius:10,
                        border:`1.5px solid ${selecionado ? ACCENT : conflito ? `${VERMELHO}66` : '#e5e7eb'}`,
                        background: selecionado ? `${ACCENT}10` : '#fff',
                        cursor: bloqueado ? 'not-allowed' : 'pointer', fontFamily:"'DM Sans', sans-serif",
                        opacity: salvando ? 0.5 : bloqueado ? 0.45 : 1 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:`${ACCENT}20`,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:ACCENT }}>
                        {c.nome?.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color: bloqueado ? '#999' : '#111' }}>{c.nome}</div>
                        {bloqueado && (
                          <div style={{ fontSize:10, fontWeight:600, color: conflito ? VERMELHO : '#aaa', marginTop:1 }}>{motivo}</div>
                        )}
                      </div>
                      {selecionado ? (
                        <span style={{ fontSize:11, fontWeight:700, color:ACCENT, flexShrink:0 }}>✓ escalado</span>
                      ) : modoEleg && el.ok && !conflito ? (
                        (() => {
                          const o = ocupDe(c.id)
                          return o ? (
                            <span title={`Ocupação média · ${o.n} aulas nos últimos 3 meses`}
                              style={{ fontSize:10, fontWeight:700, color:VERDE, background:`${VERDE}18`, padding:'2px 8px', borderRadius:10, flexShrink:0 }}>
                              {Math.round(o.media * 100)}% ocup.
                            </span>
                          ) : (
                            <span style={{ fontSize:10, fontWeight:600, color:'#bbb', flexShrink:0 }}>sem dados</span>
                          )
                        })()
                      ) : null}
                    </button>
                  )
                })
              })()}
            </div>

            <button onClick={() => setModalAula(null)} disabled={salvando}
              style={{ width:'100%', background:'#f3f4f6', border:'none', borderRadius:10,
                padding:'0.75rem', fontSize:13, color:'#555', cursor:'pointer',
                fontFamily:"'DM Sans', sans-serif" }}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
