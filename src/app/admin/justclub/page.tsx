'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import {
  Plus, Save, X, Calendar, List, AlertCircle,
  Pencil, Power, Users, Clock, ChevronDown, ChevronUp,
  Tag, RefreshCw, CheckCircle, CalendarDays, Filter
} from 'lucide-react'

const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_FULL  = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const TIPOS = [
  { value: 'lift',               label: 'Lift' },
  { value: 'lift_for_girls',    label: 'Lift for Girls' },
  { value: 'running_funcional', label: 'Running + Funcional' },
]
const HORARIOS = [
  '05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00',
  '12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00',
  '19:30','20:00',
]
const FORM_VAZIO = {
  tipo: 'lift', grupo_muscular_id: '', coach_id: '',
  dia_semana: 1, horario: '06:00', duracao_min: 50, capacidade: 24, so_mulheres: false,
}

function tipoLabel(t: string) { return TIPOS.find(x => x.value === t)?.label ?? t }
function tipoColor(t: string) {
  if (t === 'lift')            return 'bg-blue-100 text-blue-700'
  if (t === 'lift_for_girls') return 'bg-pink-100 text-pink-700'
  return 'bg-cyan-100 text-cyan-700'
}
function capacidadePadrao(tipo: string) { return tipo === 'running_funcional' ? 30 : 24 }
function dataLocalStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function gerarDatas(diaSemana: number, dataInicio: string, dataFim: string): string[] {
  const datas: string[] = []
  const fim = new Date(dataFim + 'T12:00:00')
  let cur = new Date(dataInicio + 'T12:00:00')
  while (cur.getDay() !== diaSemana) cur.setDate(cur.getDate() + 1)
  while (cur <= fim) { datas.push(dataLocalStr(cur)); cur.setDate(cur.getDate() + 7) }
  return datas
}
function dataFimPorMeses(meses: number): string {
  const d = new Date(); d.setMonth(d.getMonth() + meses); d.setDate(0)
  return dataLocalStr(d)
}

export default function JustClubAdminPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [unidades,        setUnidades]        = useState<any[]>([])
  const [unidadeAtiva,    setUnidadeAtiva]    = useState<any | null>(null)
  const [loadingUnidades, setLoadingUnidades] = useState(true)

  const [aulas,       setAulas]       = useState<any[]>([])
  const [coaches,     setCoaches]     = useState<any[]>([])
  const [grupos,      setGrupos]      = useState<any[]>([])
  const [ocorrencias, setOcorrencias] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [loadingOcs,  setLoadingOcs]  = useState(false)
  const [msg,         setMsg]         = useState('')

  const [abaAtiva, setAbaAtiva] = useState<'lista' | 'grade' | 'calendario' | 'grupos'>('lista')
  const [filtroTipo,  setFiltroTipo]  = useState('todos')
  const [filtroCoach, setFiltroCoach] = useState('todos')
  const [diasCalendario, setDiasCalendario] = useState<7|15|30>(7)
  const [diasExpandidos, setDiasExpandidos] = useState<Set<number>>(new Set([1,2,3,4,5]))

  const [modalAberto, setModalAberto] = useState(false)
  const [editando,    setEditando]    = useState<any | null>(null)
  const [form,        setForm]        = useState({ ...FORM_VAZIO })
  const [salvando,    setSalvando]    = useState(false)

  const [formReplicar, setFormReplicar] = useState(false)
  const [formMeses,    setFormMeses]    = useState(1)
  const [formInicio,   setFormInicio]   = useState(dataLocalStr(new Date()))

  const [modalReplicar,    setModalReplicar]    = useState<any | null>(null)
  const [replicarMeses,    setReplicarMeses]    = useState(1)
  const [replicarInicio,   setReplicarInicio]   = useState(dataLocalStr(new Date()))
  const [replicando,       setReplicando]        = useState(false)
  const [resultReplicacao, setResultReplicacao] = useState<{ criadas: number; existentes: number } | null>(null)

  const [novoGrupo,     setNovoGrupo]     = useState('')
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)
  const [editandoGrupo, setEditandoGrupo] = useState<any | null>(null)
  const [nomeGrupoEdit, setNomeGrupoEdit] = useState('')

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregarUnidades() }, [perfil])
  useEffect(() => { if (perfil) carregarGrupos() }, [perfil])
  useEffect(() => {
    if (unidadeAtiva) { carregarAulas(); carregarCoachesDaUnidade() }
  }, [unidadeAtiva?.id])
  useEffect(() => {
    if (unidadeAtiva && abaAtiva === 'calendario') carregarOcorrencias(diasCalendario)
  }, [unidadeAtiva?.id, diasCalendario, abaAtiva])

  async function carregarUnidades() {
    setLoadingUnidades(true)
    const { data } = await supabase.from('unidades').select('id, nome, tipo').eq('tipo', 'club').eq('ativo', true).order('nome')
    setUnidades(data || [])
    setLoadingUnidades(false)
  }

  async function carregarGrupos() {
    const { data } = await supabase.from('grupos_musculares').select('id, nome, ativo').order('nome')
    setGrupos(data || [])
  }

  async function carregarCoachesDaUnidade() {
    if (!unidadeAtiva) return
    const { data: cu } = await supabase.from('coach_unidades').select('coach_id').eq('unidade_id', unidadeAtiva.id).eq('ativo', true)
    const ids = (cu || []).map((u: any) => u.coach_id)
    if (ids.length === 0) { setCoaches([]); return }
    const { data: cs } = await supabase.from('coaches').select('id, nome').eq('ativo', true).in('id', ids).order('nome')
    setCoaches(cs || [])
  }

  async function carregarAulas() {
    if (!unidadeAtiva) return
    setLoadingData(true)
    const { data } = await supabase.from('club_aulas')
      .select('*, coaches(id, nome), grupos_musculares(nome)')
      .eq('unidade_id', unidadeAtiva.id).order('dia_semana').order('horario')
    setAulas(data || [])
    setLoadingData(false)
  }

  async function carregarOcorrencias(dias: 7|15|30) {
    if (!unidadeAtiva) return
    setLoadingOcs(true)
    const hoje = dataLocalStr(new Date())
    const fim  = dataLocalStr(new Date(Date.now() + dias * 86400000))
    const { data: ids_data } = await supabase.from('club_aulas').select('id').eq('unidade_id', unidadeAtiva.id).eq('ativo', true)
    const ids = (ids_data || []).map((a: any) => a.id)
    if (!ids.length) { setOcorrencias([]); setLoadingOcs(false); return }
    const { data } = await supabase.from('club_ocorrencias')
      .select('*, club_aulas(id, tipo, horario, capacidade, coaches(id, nome), grupos_musculares(nome))')
      .in('aula_id', ids).eq('status', 'ativa').gte('data', hoje).lte('data', fim).order('data')
    setOcorrencias(data || [])
    setLoadingOcs(false)
  }

  function aplicarFiltros(lista: any[]): any[] {
    return lista.filter(a => {
      const matchTipo  = filtroTipo  === 'todos' || a.tipo === filtroTipo
      const matchCoach = filtroCoach === 'todos' || (a.coaches?.id || a.coach_id) === filtroCoach
      return matchTipo && matchCoach
    })
  }
  function aplicarFiltrosOcs(lista: any[]): any[] {
    return lista.filter(oc => {
      const a = oc.club_aulas
      return (filtroTipo==='todos'||a?.tipo===filtroTipo) && (filtroCoach==='todos'||a?.coaches?.id===filtroCoach)
    })
  }

  function abrirNovaAula() {
    setEditando(null)
    setForm({ ...FORM_VAZIO, grupo_muscular_id: gruposAtivos[0]?.id||'', coach_id: coaches[0]?.id||'' })
    setFormReplicar(false); setFormMeses(1); setFormInicio(dataLocalStr(new Date()))
    setModalAberto(true)
  }
  function abrirEdicao(aula: any) {
    setEditando(aula)
    setForm({ tipo: aula.tipo, grupo_muscular_id: aula.grupo_muscular_id, coach_id: aula.coach_id,
      dia_semana: aula.dia_semana, horario: (aula.horario||'').slice(0,5),
      duracao_min: aula.duracao_min, capacidade: aula.capacidade, so_mulheres: aula.so_mulheres })
    setModalAberto(true)
  }

  async function salvar() {
    if (!unidadeAtiva) return
    if (!form.grupo_muscular_id) { showMsg('Selecione o grupo muscular.'); return }
    if (!form.coach_id)          { showMsg('Selecione o coach.');          return }
    setSalvando(true)
    const payload = {
      unidade_id: unidadeAtiva.id, tipo: form.tipo,
      grupo_muscular_id: form.grupo_muscular_id, coach_id: form.coach_id,
      dia_semana: form.dia_semana, horario: form.horario+':00',
      duracao_min: form.duracao_min, capacidade: form.capacidade,
      so_mulheres: form.tipo==='lift_for_girls'?true:form.so_mulheres, ativo: true,
    }
    let aulaId = editando?.id
    if (editando) {
      const { error } = await supabase.from('club_aulas').update(payload).eq('id', editando.id)
      if (error) { showMsg('Erro: '+error.message); setSalvando(false); return }
    } else {
      const { data: nova, error } = await supabase.from('club_aulas').insert(payload).select('id').maybeSingle()
      if (error) { showMsg('Erro: '+error.message); setSalvando(false); return }
      aulaId = nova?.id
    }
    if (!editando && formReplicar && aulaId) {
      const datas = gerarDatas(form.dia_semana, formInicio, dataFimPorMeses(formMeses))
      if (datas.length > 0) await supabase.from('club_ocorrencias').insert(datas.map(data => ({ aula_id: aulaId, data, status: 'ativa' })))
      showMsg(`Aula criada e ${datas.length} ocorrência${datas.length!==1?'s':''} gerada${datas.length!==1?'s':''}!`)
    } else { showMsg(editando?'Aula atualizada!':'Aula criada!') }
    setSalvando(false); setModalAberto(false); setEditando(null)
    await carregarAulas()
    if (abaAtiva==='calendario') carregarOcorrencias(diasCalendario)
  }

  async function toggleAtivo(aula: any) {
    await supabase.from('club_aulas').update({ ativo: !aula.ativo }).eq('id', aula.id)
    await carregarAulas()
  }

  function abrirReplicar(aula: any) {
    setModalReplicar(aula); setReplicarMeses(1)
    setReplicarInicio(dataLocalStr(new Date())); setResultReplicacao(null)
  }
  async function executarReplicacao() {
    if (!modalReplicar) return
    setReplicando(true)
    const datas = gerarDatas(modalReplicar.dia_semana, replicarInicio, dataFimPorMeses(replicarMeses))
    if (!datas.length) { showMsg('Nenhuma data no período.'); setReplicando(false); return }
    const { data: exist } = await supabase.from('club_ocorrencias').select('data').eq('aula_id', modalReplicar.id).in('data', datas)
    const existSet = new Set((exist||[]).map((e:any)=>e.data))
    const novas = datas.filter(d=>!existSet.has(d))
    if (novas.length > 0) {
      const { error } = await supabase.from('club_ocorrencias').insert(novas.map(data=>({ aula_id: modalReplicar.id, data, status: 'ativa' })))
      if (error) { showMsg('Erro: '+error.message); setReplicando(false); return }
    }
    setResultReplicacao({ criadas: novas.length, existentes: existSet.size })
    setReplicando(false)
    if (abaAtiva==='calendario') carregarOcorrencias(diasCalendario)
  }

  async function criarGrupo() {
    if (!novoGrupo.trim()) return
    setSalvandoGrupo(true)
    const { error } = await supabase.from('grupos_musculares').insert({ nome: novoGrupo.trim(), ativo: true })
    setSalvandoGrupo(false)
    if (error) { showMsg('Erro: '+error.message); return }
    setNovoGrupo(''); await carregarGrupos(); showMsg('Grupo criado!')
  }
  async function salvarEdicaoGrupo() {
    if (!editandoGrupo||!nomeGrupoEdit.trim()) return
    await supabase.from('grupos_musculares').update({ nome: nomeGrupoEdit.trim() }).eq('id', editandoGrupo.id)
    setEditandoGrupo(null); setNomeGrupoEdit(''); await carregarGrupos(); showMsg('Grupo atualizado!')
  }
  async function toggleGrupo(grupo: any) {
    await supabase.from('grupos_musculares').update({ ativo: grupo.ativo===false?true:false }).eq('id', grupo.id)
    await carregarGrupos()
  }

  function showMsg(texto: string) { setMsg(texto); setTimeout(()=>setMsg(''), 4000) }
  function toggleDia(idx: number) {
    setDiasExpandidos(prev=>{ const n=new Set(prev); n.has(idx)?n.delete(idx):n.add(idx); return n })
  }

  const todasAulas   = aplicarFiltros(aulas)
  const aulasAtivas  = aplicarFiltros(aulas.filter(a=>a.ativo))
  const porDia       = DIAS_ABREV.map((_,i)=>aulasAtivas.filter(a=>a.dia_semana===i))
  const gruposAtivos = grupos.filter(g=>g.ativo!==false)
  const ocsFiltered  = aplicarFiltrosOcs(ocorrencias)
  const ocsPorData: Record<string,any[]> = {}
  for (const oc of ocsFiltered) { if (!ocsPorData[oc.data]) ocsPorData[oc.data]=[]; ocsPorData[oc.data].push(oc) }
  const temFiltros = filtroTipo!=='todos'||filtroCoach!=='todos'
  const datasPreview = modalReplicar ? gerarDatas(modalReplicar.dia_semana, replicarInicio, dataFimPorMeses(replicarMeses)) : []

  if (loading || loadingUnidades) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header com abas de unidade ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 pt-4 pb-0">
          <h1 className="text-lg font-semibold text-gray-900 mb-4">JustClub — Aulas coletivas</h1>

          {/* Abas de unidade estilo tab */}
          <div className="flex gap-0">
            {unidades.map(u => {
              const ativa = unidadeAtiva?.id === u.id
              return (
                <button
                  key={u.id}
                  onClick={() => setUnidadeAtiva(u)}
                  className={`px-6 py-2.5 text-sm font-medium border-b-2 transition-all relative ${
                    ativa
                      ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {u.nome}
                  {ativa && unidadeAtiva && (
                    <span className="ml-2 text-xs text-primary-500 font-normal">
                      {aulas.filter(a=>a.ativo).length} aulas
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Conteúdo ── */}
      {!unidadeAtiva ? (
        /* Tela inicial — nenhuma aba selecionada */
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
            <CalendarDays size={30} className="text-gray-400"/>
          </div>
          <h3 className="font-semibold text-gray-700 text-lg mb-2">Selecione uma unidade</h3>
          <p className="text-sm text-gray-400 mb-6">Clique em uma das abas acima para gerenciar as aulas coletivas.</p>
          <div className="flex gap-3 justify-center">
            {unidades.map(u => (
              <button key={u.id} onClick={() => setUnidadeAtiva(u)}
                className="px-6 py-3 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all">
                {u.nome}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-6 py-5">

          {msg && (
            <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
              msg.startsWith('Erro')?'bg-red-50 text-red-700 border border-red-100':'bg-green-50 text-green-800 border border-green-100'
            }`}>{msg}</div>
          )}

          {/* Abas de conteúdo */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {(['lista','grade','calendario','grupos'] as const).map(aba => {
              const cfg = {
                lista:      { label: 'Lista',         icon: <List size={14}/> },
                grade:      { label: 'Grade semanal', icon: <Calendar size={14}/> },
                calendario: { label: 'Calendário',    icon: <CalendarDays size={14}/> },
                grupos:     { label: 'Grupos',        icon: <Tag size={14}/> },
              }
              const count = aba==='lista'?aulas.filter(a=>a.ativo).length:aba==='grupos'?gruposAtivos.length:aba==='calendario'?ocsFiltered.length:0
              return (
                <button key={aba}
                  onClick={() => { setAbaAtiva(aba); if (aba==='calendario') carregarOcorrencias(diasCalendario) }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    abaAtiva===aba?'bg-primary-600 text-white':'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
                  }`}>
                  {cfg[aba].icon} {cfg[aba].label}
                  {count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${abaAtiva===aba?'bg-white text-primary-600':'bg-primary-100 text-primary-700'}`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
            {abaAtiva!=='grupos' && (
              <button onClick={abrirNovaAula}
                className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all">
                <Plus size={14}/> Nova aula
              </button>
            )}
          </div>

          {/* Barra de filtros */}
          {abaAtiva!=='grupos' && (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
              <Filter size={13} className="text-gray-400 flex-shrink-0"/>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={()=>setFiltroTipo('todos')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${filtroTipo==='todos'?'bg-gray-800 text-white border-gray-800':'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  Todos
                </button>
                {TIPOS.map(t => (
                  <button key={t.value} onClick={()=>setFiltroTipo(filtroTipo===t.value?'todos':t.value)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${filtroTipo===t.value?tipoColor(t.value)+' border-transparent':'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-gray-200 flex-shrink-0"/>
              <select value={filtroCoach} onChange={e=>setFiltroCoach(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:border-primary-400">
                <option value="todos">Todos os coaches</option>
                {coaches.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              {temFiltros && (
                <button onClick={()=>{ setFiltroTipo('todos'); setFiltroCoach('todos') }}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 ml-auto">
                  <X size={11}/> Limpar
                </button>
              )}
            </div>
          )}

          {loadingData && (abaAtiva==='lista'||abaAtiva==='grade') ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : (
            <>
              {/* LISTA */}
              {abaAtiva==='lista' && (
                <div className="space-y-3">
                  {todasAulas.length===0 ? (
                    <div className="card text-center py-14">
                      <Calendar size={32} className="text-gray-300 mx-auto mb-3"/>
                      <p className="text-gray-400 text-sm">{temFiltros?'Nenhuma aula com os filtros selecionados.':`Nenhuma aula cadastrada para ${unidadeAtiva.nome}.`}</p>
                      {!temFiltros && <button onClick={abrirNovaAula} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700"><Plus size={14}/> Criar primeira aula</button>}
                    </div>
                  ) : todasAulas.map(aula => (
                    <div key={aula.id} className={`card transition-opacity ${!aula.ativo?'opacity-50 border-dashed':''}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0 border border-primary-100">
                          {DIAS_ABREV[aula.dia_semana]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipoColor(aula.tipo)}`}>{tipoLabel(aula.tipo)}</span>
                            {aula.so_mulheres && <span className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100">👩 Só mulheres</span>}
                            {!aula.ativo && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inativa</span>}
                          </div>
                          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{DIAS_FULL[aula.dia_semana]}</span>
                            <span className="flex items-center gap-1 font-mono text-sm font-bold text-primary-700"><Clock size={12}/> {(aula.horario||'').slice(0,5)}</span>
                            <span className="text-xs text-gray-400">{aula.duracao_min}min</span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span>🏋️ {aula.grupos_musculares?.nome||'—'}</span>
                            <span>👤 {aula.coaches?.nome?.split(' ')[0]||'—'}</span>
                            <span className="flex items-center gap-1"><Users size={10}/> {aula.capacidade} vagas</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <div className="flex gap-1.5">
                            <button onClick={()=>abrirEdicao(aula)} className="btn btn-sm gap-1 text-gray-600 hover:bg-gray-100"><Pencil size={12}/> Editar</button>
                            <button onClick={()=>toggleAtivo(aula)} className={`btn btn-sm gap-1 ${aula.ativo?'text-red-500 hover:bg-red-50':'text-green-600 hover:bg-green-50'}`}>
                              <Power size={12}/> {aula.ativo?'Desativar':'Ativar'}
                            </button>
                          </div>
                          {aula.ativo && (
                            <button onClick={()=>abrirReplicar(aula)} className="btn btn-sm gap-1 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 w-full justify-center">
                              <RefreshCw size={12}/> Replicar grade
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* GRADE */}
              {abaAtiva==='grade' && (
                <div className="space-y-3">
                  {aulasAtivas.length===0 ? (
                    <div className="card text-center py-14"><Calendar size={32} className="text-gray-300 mx-auto mb-3"/><p className="text-gray-400 text-sm">{temFiltros?'Nenhuma aula com os filtros.':'Nenhuma aula ativa.'}</p></div>
                  ) : DIAS_FULL.map((dia,idx) => {
                    const aulasNoDia = porDia[idx]
                    if (!aulasNoDia.length) return null
                    const expandido = diasExpandidos.has(idx)
                    return (
                      <div key={idx} className="card">
                        <button onClick={()=>toggleDia(idx)} className="w-full flex items-center gap-3 text-left">
                          <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{DIAS_ABREV[idx]}</div>
                          <div className="flex-1"><span className="font-semibold text-gray-900 text-sm">{dia}</span><span className="text-xs text-gray-400 ml-2">{aulasNoDia.length} aula{aulasNoDia.length!==1?'s':''}</span></div>
                          {expandido?<ChevronUp size={16} className="text-gray-400"/>:<ChevronDown size={16} className="text-gray-400"/>}
                        </button>
                        {expandido && (
                          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                            {aulasNoDia.sort((a,b)=>a.horario.localeCompare(b.horario)).map(aula => (
                              <div key={aula.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                                <span className="font-mono text-sm font-bold text-gray-900 w-12 flex-shrink-0">{(aula.horario||'').slice(0,5)}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${tipoColor(aula.tipo)}`}>{tipoLabel(aula.tipo)}</span>
                                <span className="text-xs text-gray-600 flex-1 truncate">{aula.grupos_musculares?.nome||'—'}</span>
                                <span className="text-xs text-gray-400 flex-shrink-0">👤 {aula.coaches?.nome?.split(' ')[0]||'—'}</span>
                                <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1"><Users size={10}/> {aula.capacidade}</span>
                                <button onClick={()=>abrirEdicao(aula)} className="text-gray-400 hover:text-primary-600 flex-shrink-0"><Pencil size={13}/></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* CALENDÁRIO */}
              {abaAtiva==='calendario' && (
                <div>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {([7,15,30] as const).map(d => (
                      <button key={d} onClick={()=>setDiasCalendario(d)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${diasCalendario===d?'bg-primary-600 text-white border-primary-600':'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
                        Próximos {d} dias
                      </button>
                    ))}
                    {!loadingOcs && <span className="text-xs text-gray-400 ml-auto">{ocsFiltered.length} ocorrência{ocsFiltered.length!==1?'s':''}{temFiltros?' (filtrado)':''}</span>}
                  </div>
                  {loadingOcs ? (
                    <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/></div>
                  ) : ocsFiltered.length===0 ? (
                    <div className="card text-center py-14">
                      <CalendarDays size={32} className="text-gray-300 mx-auto mb-3"/>
                      <p className="text-gray-400 text-sm">{temFiltros?'Nenhuma aula com os filtros.':'Nenhuma aula nos próximos '+diasCalendario+' dias.'}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(ocsPorData).sort().map(([data, ocs]) => {
                        const d = new Date(data+'T12:00:00')
                        const hoje  = dataLocalStr(new Date())
                        const amanha = dataLocalStr(new Date(Date.now()+86400000))
                        const ehHoje   = data===hoje
                        const ehAmanha = data===amanha
                        return (
                          <div key={data} className="card">
                            <div className="flex items-center gap-2 mb-3">
                              <div className={`w-9 h-9 rounded-xl text-xs font-bold flex items-center justify-center flex-shrink-0 ${ehHoje?'bg-primary-600 text-white':ehAmanha?'bg-primary-100 text-primary-700':'bg-gray-100 text-gray-600'}`}>
                                {DIAS_ABREV[d.getDay()]}
                              </div>
                              <div className="flex-1">
                                <span className="font-semibold text-gray-900 text-sm">{d.toLocaleDateString('pt-BR',{day:'2-digit',month:'long'})}</span>
                                {ehHoje   && <span className="ml-2 text-xs text-primary-600 font-semibold">Hoje</span>}
                                {ehAmanha && <span className="ml-2 text-xs text-primary-400 font-medium">Amanhã</span>}
                              </div>
                              <span className="text-xs text-gray-400">{(ocs as any[]).length} aula{(ocs as any[]).length!==1?'s':''}</span>
                            </div>
                            <div className="space-y-1.5">
                              {(ocs as any[]).sort((a,b)=>(a.club_aulas?.horario||'').localeCompare(b.club_aulas?.horario||'')).map(oc => (
                                <div key={oc.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                                  <span className="font-mono text-sm font-bold text-gray-900 w-12 flex-shrink-0">{(oc.club_aulas?.horario||'').slice(0,5)}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${tipoColor(oc.club_aulas?.tipo||'')}`}>{tipoLabel(oc.club_aulas?.tipo||'')}</span>
                                  <span className="text-xs text-gray-600 flex-1 truncate">{oc.club_aulas?.grupos_musculares?.nome||'—'}</span>
                                  <span className="text-xs text-gray-400 flex-shrink-0">👤 {oc.club_aulas?.coaches?.nome?.split(' ')[0]||'—'}</span>
                                  <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1"><Users size={10}/> {oc.club_aulas?.capacidade||'—'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* GRUPOS */}
              {abaAtiva==='grupos' && (
                <div className="space-y-4">
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Novo grupo muscular</h3>
                    <div className="flex gap-2">
                      <input className="input flex-1" placeholder="Ex: Inferiores, Full Body, HIIT & ABS..."
                        value={novoGrupo} onChange={e=>setNovoGrupo(e.target.value)} onKeyDown={e=>e.key==='Enter'&&criarGrupo()}/>
                      <button onClick={criarGrupo} disabled={salvandoGrupo||!novoGrupo.trim()} className="btn bg-primary-600 text-white hover:bg-primary-700 gap-1 disabled:opacity-50 flex-shrink-0">
                        <Plus size={14}/> {salvandoGrupo?'Criando...':'Criar'}
                      </button>
                    </div>
                  </div>
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Grupos cadastrados <span className="ml-1 text-xs font-normal text-gray-400">{grupos.length} total</span></h3>
                    {grupos.length===0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm"><Tag size={24} className="mx-auto mb-2 text-gray-300"/> Nenhum grupo.</div>
                    ) : (
                      <div className="space-y-2">
                        {grupos.map(grupo => (
                          <div key={grupo.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${grupo.ativo===false?'bg-gray-50 border-gray-100 opacity-60':'bg-white border-gray-100'}`}>
                            {editandoGrupo?.id===grupo.id ? (
                              <>
                                <input className="input flex-1 py-1 text-sm" value={nomeGrupoEdit} onChange={e=>setNomeGrupoEdit(e.target.value)} onKeyDown={e=>e.key==='Enter'&&salvarEdicaoGrupo()} autoFocus/>
                                <button onClick={salvarEdicaoGrupo} className="btn btn-sm bg-primary-600 text-white gap-1"><Save size={12}/> Salvar</button>
                                <button onClick={()=>setEditandoGrupo(null)} className="btn btn-sm text-gray-500"><X size={12}/></button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-sm font-medium text-gray-800">{grupo.nome}</span>
                                {grupo.ativo===false && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inativo</span>}
                                <button onClick={()=>{setEditandoGrupo(grupo);setNomeGrupoEdit(grupo.nome)}} className="btn btn-sm text-gray-500 hover:text-primary-600"><Pencil size={12}/></button>
                                <button onClick={()=>toggleGrupo(grupo)} className={`btn btn-sm ${grupo.ativo===false?'text-green-600 hover:bg-green-50':'text-red-400 hover:bg-red-50'}`}><Power size={12}/></button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                    💡 Grupos inativos não aparecem no cadastro de novas aulas, mas são preservados nas aulas já criadas.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* MODAL CADASTRO / EDIÇÃO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div><h2 className="font-semibold text-gray-900">{editando?'Editar aula':'Nova aula'}</h2><p className="text-xs text-gray-400 mt-0.5">{unidadeAtiva?.nome}</p></div>
              <button onClick={()=>{setModalAberto(false);setEditando(null)}} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
            </div>
            <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">
              <div>
                <label className="label">Tipo de aula *</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIPOS.map(t => (
                    <button key={t.value} type="button" onClick={()=>setForm(f=>({...f,tipo:t.value,so_mulheres:t.value==='lift_for_girls',capacidade:capacidadePadrao(t.value)}))}
                      className={`py-2.5 px-2 rounded-xl text-xs font-medium text-center transition-all border ${form.tipo===t.value?'border-primary-400 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {form.tipo==='lift_for_girls' && <div className="mt-2 bg-pink-50 border border-pink-100 rounded-xl px-3 py-2 text-xs text-pink-700">👩 Lift for Girls é automaticamente restrita a mulheres.</div>}
              </div>
              <div>
                <label className="label">Grupo muscular *</label>
                {gruposAtivos.length===0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-xs text-orange-700 flex items-center gap-2"><AlertCircle size={14}/> Nenhum grupo ativo. Cadastre na aba "Grupos".</div>
                ) : (
                  <select className="input" value={form.grupo_muscular_id} onChange={e=>setForm(f=>({...f,grupo_muscular_id:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {gruposAtivos.map(g=><option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="label">Coach responsável *</label>
                {coaches.length===0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-xs text-orange-700 flex items-center gap-2"><AlertCircle size={14}/> Nenhum coach para esta unidade. Configure em Coaches.</div>
                ) : (
                  <select className="input" value={form.coach_id} onChange={e=>setForm(f=>({...f,coach_id:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {coaches.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="label">Dia da semana *</label>
                <div className="grid grid-cols-7 gap-1">
                  {DIAS_ABREV.map((d,i)=>(
                    <button key={i} type="button" onClick={()=>setForm(f=>({...f,dia_semana:i}))}
                      className={`py-2 rounded-xl text-xs font-medium transition-all ${form.dia_semana===i?'bg-primary-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Horário *</label>
                <select className="input" value={form.horario} onChange={e=>setForm(f=>({...f,horario:e.target.value}))}>
                  {HORARIOS.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Duração (min)</label><input className="input" type="number" min={10} max={180} value={form.duracao_min} onChange={e=>setForm(f=>({...f,duracao_min:+e.target.value}))}/></div>
                <div>
                  <label className="label">Capacidade (vagas)</label>
                  <input className="input" type="number" min={1} max={100} value={form.capacidade} onChange={e=>setForm(f=>({...f,capacidade:+e.target.value}))}/>
                  <p className="text-xs text-gray-400 mt-1">{form.tipo==='running_funcional'?'Padrão: 26–30':'Padrão: 24'}</p>
                </div>
              </div>
              {form.tipo!=='lift_for_girls' && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={()=>setForm(f=>({...f,so_mulheres:!f.so_mulheres}))}
                    className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${form.so_mulheres?'bg-pink-500':'bg-gray-200'}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.so_mulheres?'translate-x-5':''}`}/>
                  </button>
                  <span className="text-sm text-gray-700">Somente mulheres</span>
                </div>
              )}
              {!editando && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <button type="button" onClick={()=>setFormReplicar(r=>!r)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${formReplicar?'bg-cyan-50':'bg-gray-50 hover:bg-gray-100'}`}>
                    <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${formReplicar?'bg-cyan-500':'bg-gray-300'}`}>
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formReplicar?'translate-x-4':''}`}/>
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-gray-800">Gerar recorrências agora</span>
                      <p className="text-xs text-gray-400 mt-0.5">Cria as datas automaticamente ao salvar</p>
                    </div>
                    <RefreshCw size={14} className={formReplicar?'text-cyan-600':'text-gray-400'}/>
                  </button>
                  {formReplicar && (
                    <div className="px-4 py-4 space-y-3 border-t border-gray-100 bg-white">
                      <div><label className="label">A partir de</label><input type="date" className="input" value={formInicio} onChange={e=>setFormInicio(e.target.value)}/></div>
                      <div>
                        <label className="label">Por quantos meses?</label>
                        <div className="grid grid-cols-4 gap-2">
                          {[1,2,3,6].map(m=>(
                            <button key={m} type="button" onClick={()=>setFormMeses(m)}
                              className={`py-2 rounded-xl text-sm font-semibold transition-all border ${formMeses===m?'border-cyan-400 bg-cyan-50 text-cyan-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                              {m}m
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="bg-cyan-50 rounded-xl px-3 py-2 text-xs text-cyan-700">
                        📅 {gerarDatas(form.dia_semana, formInicio, dataFimPorMeses(formMeses)).length} ocorrências serão criadas · até {dataFimPorMeses(formMeses)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button onClick={()=>{setModalAberto(false);setEditando(null)}} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700 gap-1 disabled:opacity-60">
                <Save size={13}/> {salvando?'Salvando...':editando?'Atualizar aula':'Criar aula'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REPLICAÇÃO */}
      {modalReplicar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2"><RefreshCw size={16} className="text-cyan-600"/> Replicar grade</h2>
                <p className="text-xs text-gray-400 mt-0.5">{tipoLabel(modalReplicar.tipo)} · {DIAS_FULL[modalReplicar.dia_semana]} às {(modalReplicar.horario||'').slice(0,5)}</p>
              </div>
              <button onClick={()=>{setModalReplicar(null);setResultReplicacao(null)}} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {resultReplicacao ? (
                <div className="text-center py-4">
                  <CheckCircle size={40} className="text-green-500 mx-auto mb-3"/>
                  <p className="font-semibold text-gray-900 text-lg">{resultReplicacao.criadas} aula{resultReplicacao.criadas!==1?'s':''} criada{resultReplicacao.criadas!==1?'s':''}</p>
                  {resultReplicacao.existentes>0 && <p className="text-xs text-gray-400 mt-1">{resultReplicacao.existentes} já existiam e foram mantidas</p>}
                  <button onClick={()=>{setModalReplicar(null);setResultReplicacao(null)}} className="mt-4 btn bg-primary-600 text-white hover:bg-primary-700 w-full">Concluir</button>
                </div>
              ) : (
                <>
                  <div><label className="label">A partir de</label><input type="date" className="input" value={replicarInicio} onChange={e=>setReplicarInicio(e.target.value)}/></div>
                  <div>
                    <label className="label">Por quantos meses?</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1,2,3,6].map(m=>(
                        <button key={m} type="button" onClick={()=>setReplicarMeses(m)}
                          className={`py-2.5 rounded-xl text-sm font-semibold transition-all border ${replicarMeses===m?'border-primary-400 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                          {m}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-cyan-50 border border-cyan-100 rounded-xl px-4 py-3">
                    <p className="text-xs text-cyan-800 font-medium">📅 {datasPreview.length} ocorrência{datasPreview.length!==1?'s':''} serão geradas</p>
                    <p className="text-xs text-cyan-500 mt-0.5">Datas já cadastradas serão mantidas sem duplicar.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>{setModalReplicar(null);setResultReplicacao(null)}} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
                    <button onClick={executarReplicacao} disabled={replicando||!datasPreview.length} className="btn flex-1 bg-cyan-600 text-white hover:bg-cyan-700 gap-1 disabled:opacity-60">
                      <RefreshCw size={13}/> {replicando?'Gerando...':'Replicar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
