'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import {
  Plus, Save, X, Calendar, List, AlertCircle,
  Pencil, Power, Users, Clock, ChevronDown, ChevronUp, Tag
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
  tipo:               'lift',
  grupo_muscular_id:  '',
  coach_id:           '',
  dia_semana:         1,
  horario:            '06:00',
  duracao_min:        50,
  capacidade:         24,
  so_mulheres:        false,
}

function tipoLabel(t: string) { return TIPOS.find(x => x.value === t)?.label ?? t }
function tipoColor(t: string) {
  if (t === 'lift')            return 'bg-blue-100 text-blue-700'
  if (t === 'lift_for_girls') return 'bg-pink-100 text-pink-700'
  return 'bg-cyan-100 text-cyan-700'
}
function capacidadePadrao(tipo: string) { return tipo === 'running_funcional' ? 30 : 24 }

export default function JustClubAdminPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  // Unidades club
  const [unidades,       setUnidades]       = useState<any[]>([])
  const [unidadeAtiva,   setUnidadeAtiva]   = useState<any | null>(null)
  const [loadingUnidades, setLoadingUnidades] = useState(true)

  // Dados da unidade selecionada
  const [aulas,   setAulas]   = useState<any[]>([])
  const [coaches, setCoaches] = useState<any[]>([])
  const [grupos,  setGrupos]  = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [msg, setMsg] = useState('')

  // Navegação
  const [abaAtiva, setAbaAtiva] = useState<'lista' | 'grade' | 'grupos'>('lista')

  // Modal aula
  const [modalAberto, setModalAberto] = useState(false)
  const [editando,    setEditando]    = useState<any | null>(null)
  const [form,        setForm]        = useState({ ...FORM_VAZIO })
  const [salvando,    setSalvando]    = useState(false)

  // Grade
  const [diasExpandidos, setDiasExpandidos] = useState<Set<number>>(new Set([1,2,3,4,5]))

  // Grupos musculares CRUD
  const [novoGrupo,     setNovoGrupo]     = useState('')
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)
  const [editandoGrupo, setEditandoGrupo] = useState<any | null>(null)
  const [nomeGrupoEdit, setNomeGrupoEdit] = useState('')

  // ─── Auth guard ───
  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') {
      router.push('/')
    }
  }, [perfil, loading])

  // ─── Carrega unidades club ───
  useEffect(() => {
    if (perfil) carregarUnidades()
  }, [perfil])

  async function carregarUnidades() {
    setLoadingUnidades(true)
    const { data } = await supabase
      .from('unidades')
      .select('id, nome, tipo')
      .eq('tipo', 'club')
      .eq('ativo', true)
      .order('nome')
    setUnidades(data || [])
    if (data && data.length > 0) setUnidadeAtiva(data[0])
    setLoadingUnidades(false)
  }

  // ─── Recarrega ao trocar unidade ───
  useEffect(() => {
    if (unidadeAtiva) {
      carregarAulas()
      carregarCoachesDaUnidade()
    }
  }, [unidadeAtiva?.id])

  // ─── Grupos (independente de unidade) ───
  useEffect(() => {
    if (perfil) carregarGrupos()
  }, [perfil])

  // ─────────────────────────────────────────────
  // Carregamento
  // ─────────────────────────────────────────────

  async function carregarGrupos() {
    const { data } = await supabase
      .from('grupos_musculares')
      .select('id, nome, ativo')
      .order('nome')
    setGrupos(data || [])
  }

  async function carregarCoachesDaUnidade() {
    if (!unidadeAtiva) return
    const { data: horarios } = await supabase
      .from('coach_horarios')
      .select('coach_id')
      .eq('unidade_id', unidadeAtiva.id)
      .eq('ativo', true)

    const ids = [...new Set((horarios || []).map((h: any) => h.coach_id))]

    const query = supabase.from('coaches').select('id, nome').eq('ativo', true).order('nome')
    const { data: cs } = ids.length > 0 ? await query.in('id', ids) : await query
    setCoaches(cs || [])
  }

  async function carregarAulas() {
    if (!unidadeAtiva) return
    setLoadingData(true)
    const { data } = await supabase
      .from('club_aulas')
      .select('*, coaches(nome), grupos_musculares(nome)')
      .eq('unidade_id', unidadeAtiva.id)
      .order('dia_semana')
      .order('horario')
    setAulas(data || [])
    setLoadingData(false)
  }

  // ─────────────────────────────────────────────
  // Modal aula
  // ─────────────────────────────────────────────

  function abrirNovaAula() {
    setEditando(null)
    setForm({
      ...FORM_VAZIO,
      grupo_muscular_id: gruposAtivos[0]?.id || '',
      coach_id:          coaches[0]?.id || '',
    })
    setModalAberto(true)
  }

  function abrirEdicao(aula: any) {
    setEditando(aula)
    setForm({
      tipo:              aula.tipo,
      grupo_muscular_id: aula.grupo_muscular_id,
      coach_id:          aula.coach_id,
      dia_semana:        aula.dia_semana,
      horario:           (aula.horario || '').slice(0, 5),
      duracao_min:       aula.duracao_min,
      capacidade:        aula.capacidade,
      so_mulheres:       aula.so_mulheres,
    })
    setModalAberto(true)
  }

  async function salvar() {
    if (!unidadeAtiva) return
    if (!form.grupo_muscular_id) { showMsg('Selecione o grupo muscular.'); return }
    if (!form.coach_id)          { showMsg('Selecione o coach.');          return }
    setSalvando(true)

    const payload = {
      unidade_id:        unidadeAtiva.id,
      tipo:              form.tipo,
      grupo_muscular_id: form.grupo_muscular_id,
      coach_id:          form.coach_id,
      dia_semana:        form.dia_semana,
      horario:           form.horario + ':00',
      duracao_min:       form.duracao_min,
      capacidade:        form.capacidade,
      so_mulheres:       form.tipo === 'lift_for_girls' ? true : form.so_mulheres,
      ativo:             true,
    }

    const { error } = editando
      ? await supabase.from('club_aulas').update(payload).eq('id', editando.id)
      : await supabase.from('club_aulas').insert(payload)

    setSalvando(false)
    if (error) { showMsg('Erro: ' + error.message); return }
    showMsg(editando ? 'Aula atualizada!' : 'Aula criada!')
    setModalAberto(false)
    setEditando(null)
    await carregarAulas()
  }

  async function toggleAtivo(aula: any) {
    await supabase.from('club_aulas').update({ ativo: !aula.ativo }).eq('id', aula.id)
    await carregarAulas()
  }

  // ─────────────────────────────────────────────
  // CRUD Grupos musculares
  // ─────────────────────────────────────────────

  async function criarGrupo() {
    if (!novoGrupo.trim()) return
    setSalvandoGrupo(true)
    const { error } = await supabase.from('grupos_musculares').insert({ nome: novoGrupo.trim(), ativo: true })
    setSalvandoGrupo(false)
    if (error) { showMsg('Erro: ' + error.message); return }
    setNovoGrupo('')
    await carregarGrupos()
    showMsg('Grupo criado!')
  }

  async function salvarEdicaoGrupo() {
    if (!editandoGrupo || !nomeGrupoEdit.trim()) return
    await supabase.from('grupos_musculares').update({ nome: nomeGrupoEdit.trim() }).eq('id', editandoGrupo.id)
    setEditandoGrupo(null); setNomeGrupoEdit('')
    await carregarGrupos()
    showMsg('Grupo atualizado!')
  }

  async function toggleGrupo(grupo: any) {
    await supabase.from('grupos_musculares').update({ ativo: grupo.ativo === false ? true : false }).eq('id', grupo.id)
    await carregarGrupos()
  }

  function showMsg(texto: string) { setMsg(texto); setTimeout(() => setMsg(''), 3500) }
  function toggleDia(idx: number) {
    setDiasExpandidos(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }

  const aulasAtivas  = aulas.filter(a => a.ativo)
  const porDia       = DIAS_ABREV.map((_, i) => aulasAtivas.filter(a => a.dia_semana === i))
  const gruposAtivos = grupos.filter(g => g.ativo !== false)

  // ─────────────────────────────────────────────
  // Loading guards
  // ─────────────────────────────────────────────

  if (loading || loadingUnidades) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (unidades.length === 0) return (
    <div className="flex items-center justify-center h-screen p-6 text-center">
      <div>
        <AlertCircle size={32} className="text-orange-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Nenhuma unidade JustClub ativa</h2>
        <p className="text-sm text-gray-500 mt-2">Ative as unidades em <strong>Admin → Unidades</strong>.</p>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-gray-900 mb-3">JustClub — Aulas coletivas</h1>

        {/* Seletor de unidade inline */}
        <div className="flex gap-2 flex-wrap">
          {unidades.map(u => (
            <button
              key={u.id}
              onClick={() => setUnidadeAtiva(u)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                unidadeAtiva?.id === u.id
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-700'
              }`}
            >
              {u.nome}
            </button>
          ))}
        </div>

        {/* Resumo da unidade */}
        {unidadeAtiva && (
          <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
            <span>✅ {aulas.filter(a => a.ativo).length} aulas ativas</span>
            <span>⏸ {aulas.filter(a => !a.ativo).length} inativas</span>
            <span>🏋️ {gruposAtivos.length} grupos</span>
            <span>👤 {coaches.length} coaches</span>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5">

        {/* Feedback */}
        {msg && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
            msg.startsWith('Erro')
              ? 'bg-red-50 text-red-700 border border-red-100'
              : 'bg-green-50 text-green-800 border border-green-100'
          }`}>
            {msg}
          </div>
        )}

        {/* ── Tabs + botão ── */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {(['lista', 'grade', 'grupos'] as const).map(aba => {
            const labels = { lista: 'Lista', grade: 'Grade semanal', grupos: 'Grupos musculares' }
            const icons  = { lista: <List size={14} />, grade: <Calendar size={14} />, grupos: <Tag size={14} /> }
            return (
              <button
                key={aba}
                onClick={() => setAbaAtiva(aba)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  abaAtiva === aba
                    ? 'bg-primary-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
                }`}
              >
                {icons[aba]} {labels[aba]}
                {aba === 'lista' && aulasAtivas.length > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${abaAtiva === 'lista' ? 'bg-white text-primary-600' : 'bg-primary-100 text-primary-700'}`}>
                    {aulasAtivas.length}
                  </span>
                )}
                {aba === 'grupos' && gruposAtivos.length > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${abaAtiva === 'grupos' ? 'bg-white text-primary-600' : 'bg-primary-100 text-primary-700'}`}>
                    {gruposAtivos.length}
                  </span>
                )}
              </button>
            )
          })}

          {abaAtiva !== 'grupos' && (
            <button
              onClick={abrirNovaAula}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all"
            >
              <Plus size={14} /> Nova aula
            </button>
          )}
        </div>

        {/* Loading */}
        {loadingData && abaAtiva !== 'grupos' ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ══ LISTA ══ */}
            {abaAtiva === 'lista' && (
              <div className="space-y-3">
                {aulas.length === 0 ? (
                  <div className="card text-center py-14">
                    <Calendar size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Nenhuma aula cadastrada para {unidadeAtiva?.nome}.</p>
                    <button onClick={abrirNovaAula} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700">
                      <Plus size={14} /> Criar primeira aula
                    </button>
                  </div>
                ) : (
                  aulas.map(aula => (
                    <div key={aula.id} className={`card transition-opacity ${!aula.ativo ? 'opacity-50 border-dashed' : ''}`}>
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
                            <span className="flex items-center gap-1 font-mono text-sm font-bold text-primary-700"><Clock size={12} /> {(aula.horario||'').slice(0,5)}</span>
                            <span className="text-xs text-gray-400">{aula.duracao_min}min</span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span>🏋️ {aula.grupos_musculares?.nome||'—'}</span>
                            <span>👤 {aula.coaches?.nome?.split(' ')[0]||'—'}</span>
                            <span className="flex items-center gap-1"><Users size={10}/> {aula.capacidade} vagas</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => abrirEdicao(aula)} className="btn btn-sm gap-1 text-gray-600 hover:bg-gray-100"><Pencil size={12}/> Editar</button>
                          <button onClick={() => toggleAtivo(aula)} className={`btn btn-sm gap-1 ${aula.ativo ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                            <Power size={12}/> {aula.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ══ GRADE SEMANAL ══ */}
            {abaAtiva === 'grade' && (
              <div className="space-y-3">
                {aulasAtivas.length === 0 ? (
                  <div className="card text-center py-14">
                    <Calendar size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Nenhuma aula ativa para montar a grade.</p>
                  </div>
                ) : (
                  DIAS_FULL.map((dia, idx) => {
                    const aulasNoDia = porDia[idx]
                    if (aulasNoDia.length === 0) return null
                    const expandido = diasExpandidos.has(idx)
                    return (
                      <div key={idx} className="card">
                        <button onClick={() => toggleDia(idx)} className="w-full flex items-center gap-3 text-left">
                          <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{DIAS_ABREV[idx]}</div>
                          <div className="flex-1">
                            <span className="font-semibold text-gray-900 text-sm">{dia}</span>
                            <span className="text-xs text-gray-400 ml-2">{aulasNoDia.length} aula{aulasNoDia.length!==1?'s':''}</span>
                          </div>
                          {expandido ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
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
                                <button onClick={() => abrirEdicao(aula)} className="text-gray-400 hover:text-primary-600 flex-shrink-0"><Pencil size={13}/></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* ══ GRUPOS MUSCULARES ══ */}
            {abaAtiva === 'grupos' && (
              <div className="space-y-4">
                <div className="card">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Novo grupo muscular</h3>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      placeholder="Ex: Inferiores, Full Body, HIIT & ABS..."
                      value={novoGrupo}
                      onChange={e => setNovoGrupo(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && criarGrupo()}
                    />
                    <button onClick={criarGrupo} disabled={salvandoGrupo || !novoGrupo.trim()} className="btn bg-primary-600 text-white hover:bg-primary-700 gap-1 disabled:opacity-50 flex-shrink-0">
                      <Plus size={14}/> {salvandoGrupo ? 'Criando...' : 'Criar'}
                    </button>
                  </div>
                </div>

                <div className="card">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Grupos cadastrados <span className="ml-2 text-xs font-normal text-gray-400">{grupos.length} total</span>
                  </h3>
                  {grupos.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm"><Tag size={24} className="mx-auto mb-2 text-gray-300"/> Nenhum grupo ainda.</div>
                  ) : (
                    <div className="space-y-2">
                      {grupos.map(grupo => (
                        <div key={grupo.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${grupo.ativo===false?'bg-gray-50 border-gray-100 opacity-60':'bg-white border-gray-100'}`}>
                          {editandoGrupo?.id === grupo.id ? (
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
                              <button onClick={()=>toggleGrupo(grupo)} className={`btn btn-sm ${grupo.ativo===false?'text-green-600 hover:bg-green-50':'text-red-400 hover:bg-red-50'}`} title={grupo.ativo===false?'Ativar':'Desativar'}><Power size={12}/></button>
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

      {/* ══ MODAL CADASTRO / EDIÇÃO ══ */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900">{editando ? 'Editar aula' : 'Nova aula'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{unidadeAtiva?.nome}</p>
              </div>
              <button onClick={()=>{setModalAberto(false);setEditando(null)}} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
            </div>

            <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">

              {/* Tipo */}
              <div>
                <label className="label">Tipo de aula *</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIPOS.map(t => (
                    <button key={t.value} type="button"
                      onClick={() => setForm(f => ({ ...f, tipo: t.value, so_mulheres: t.value==='lift_for_girls', capacidade: capacidadePadrao(t.value) }))}
                      className={`py-2.5 px-2 rounded-xl text-xs font-medium text-center transition-all border ${form.tipo===t.value?'border-primary-400 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {form.tipo==='lift_for_girls' && (
                  <div className="mt-2 bg-pink-50 border border-pink-100 rounded-xl px-3 py-2 text-xs text-pink-700">👩 Lift for Girls é automaticamente restrita a mulheres.</div>
                )}
              </div>

              {/* Grupo muscular */}
              <div>
                <label className="label">Grupo muscular *</label>
                {gruposAtivos.length === 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-xs text-orange-700 flex items-center gap-2">
                    <AlertCircle size={14}/> Nenhum grupo ativo. Cadastre na aba "Grupos musculares".
                  </div>
                ) : (
                  <select className="input" value={form.grupo_muscular_id} onChange={e=>setForm(f=>({...f,grupo_muscular_id:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {gruposAtivos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                )}
              </div>

              {/* Coach */}
              <div>
                <label className="label">Coach responsável *</label>
                {coaches.length === 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-xs text-orange-700 flex items-center gap-2">
                    <AlertCircle size={14}/> Nenhum coach para esta unidade. Verifique a Escala.
                  </div>
                ) : (
                  <select className="input" value={form.coach_id} onChange={e=>setForm(f=>({...f,coach_id:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {coaches.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                )}
              </div>

              {/* Dia da semana */}
              <div>
                <label className="label">Dia da semana *</label>
                <div className="grid grid-cols-7 gap-1">
                  {DIAS_ABREV.map((d,i) => (
                    <button key={i} type="button" onClick={()=>setForm(f=>({...f,dia_semana:i}))}
                      className={`py-2 rounded-xl text-xs font-medium transition-all ${form.dia_semana===i?'bg-primary-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horário */}
              <div>
                <label className="label">Horário *</label>
                <select className="input" value={form.horario} onChange={e=>setForm(f=>({...f,horario:e.target.value}))}>
                  {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {/* Duração e capacidade */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Duração (min)</label>
                  <input className="input" type="number" min={10} max={180} value={form.duracao_min} onChange={e=>setForm(f=>({...f,duracao_min:+e.target.value}))}/>
                </div>
                <div>
                  <label className="label">Capacidade (vagas)</label>
                  <input className="input" type="number" min={1} max={100} value={form.capacidade} onChange={e=>setForm(f=>({...f,capacidade:+e.target.value}))}/>
                  <p className="text-xs text-gray-400 mt-1">{form.tipo==='running_funcional'?'Padrão: 26–30':'Padrão: 24'}</p>
                </div>
              </div>

              {/* Toggle só mulheres */}
              {form.tipo !== 'lift_for_girls' && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={()=>setForm(f=>({...f,so_mulheres:!f.so_mulheres}))}
                    className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${form.so_mulheres?'bg-pink-500':'bg-gray-200'}`}>
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.so_mulheres?'translate-x-5':''}`}/>
                  </button>
                  <span className="text-sm text-gray-700">Somente mulheres</span>
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
    </div>
  )
}
