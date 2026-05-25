'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { useRouter } from 'next/navigation'
import {
  Plus, Save, X, Calendar, List, AlertCircle,
  Pencil, Power, Users, Clock, ChevronDown, ChevronUp
} from 'lucide-react'
import UnidadeSelector from '@/components/UnidadeSelector'

// ─────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────

const DIAS_ABREV  = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_FULL   = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const TIPOS = [
  { value: 'lift',              label: 'Lift' },
  { value: 'lift_for_girls',   label: 'Lift for Girls' },
  { value: 'running_funcional',label: 'Running + Funcional' },
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

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function tipoLabel(t: string) {
  return TIPOS.find(x => x.value === t)?.label ?? t
}

function tipoColor(t: string) {
  if (t === 'lift')              return 'bg-blue-100 text-blue-700'
  if (t === 'lift_for_girls')   return 'bg-pink-100 text-pink-700'
  return 'bg-cyan-100 text-cyan-700'
}

function capacidadePadrao(tipo: string) {
  return tipo === 'running_funcional' ? 30 : 24
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────

export default function JustClubAdminPage() {
  const { perfil, loading }                = useAuth()
  const { unidadeAtiva, loading: loadingU } = useUnidade()
  const router  = useRouter()
  const supabase = createClient()

  // Dados gerais
  const [aulas,   setAulas]   = useState<any[]>([])
  const [coaches, setCoaches] = useState<any[]>([])
  const [grupos,  setGrupos]  = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [msg, setMsg] = useState('')

  // Navegação
  const [abaAtiva, setAbaAtiva] = useState<'lista' | 'grade'>('lista')

  // Modal cadastro / edição
  const [modalAberto, setModalAberto] = useState(false)
  const [editando,    setEditando]    = useState<any | null>(null)
  const [form,        setForm]        = useState({ ...FORM_VAZIO })
  const [salvando,    setSalvando]    = useState(false)

  // Grade — controle de dias expandidos
  const [diasExpandidos, setDiasExpandidos] = useState<Set<number>>(new Set([1,2,3,4,5]))

  // ─── Auth guard ───
  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') {
      router.push('/')
    }
  }, [perfil, loading])

  // ─── Carrega coaches e grupos (independe de unidade) ───
  useEffect(() => {
    if (perfil) carregarCoachesEGrupos()
  }, [perfil])

  // ─── Carrega aulas ao trocar de unidade ───
  useEffect(() => {
    if (perfil && unidadeAtiva) carregarAulas()
  }, [perfil, unidadeAtiva?.id])

  async function carregarCoachesEGrupos() {
    const [{ data: cs }, { data: gs }] = await Promise.all([
      supabase.from('coaches').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('grupos_musculares').select('id, nome').eq('ativo', true).order('nome'),
    ])
    setCoaches(cs || [])
    setGrupos(gs || [])
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

  // ─── Modal helpers ───
  function abrirNovaAula() {
    setEditando(null)
    setForm({
      ...FORM_VAZIO,
      grupo_muscular_id: grupos[0]?.id || '',
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

  function fecharModal() {
    setModalAberto(false)
    setEditando(null)
  }

  // ─── Salvar (criar ou atualizar) ───
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

    let error: any = null

    if (editando) {
      ;({ error } = await supabase.from('club_aulas').update(payload).eq('id', editando.id))
    } else {
      ;({ error } = await supabase.from('club_aulas').insert(payload))
    }

    setSalvando(false)

    if (error) { showMsg('Erro: ' + error.message); return }

    showMsg(editando ? 'Aula atualizada com sucesso!' : 'Aula criada com sucesso!')
    fecharModal()
    await carregarAulas()
  }

  // ─── Ativar / desativar ───
  async function toggleAtivo(aula: any) {
    await supabase.from('club_aulas').update({ ativo: !aula.ativo }).eq('id', aula.id)
    await carregarAulas()
  }

  // ─── Msg temporária ───
  function showMsg(texto: string) {
    setMsg(texto)
    setTimeout(() => setMsg(''), 3500)
  }

  // ─── Dados para a grade ───
  const aulasAtivas = aulas.filter(a => a.ativo)
  const porDia = DIAS_ABREV.map((_, i) => aulasAtivas.filter(a => a.dia_semana === i))

  function toggleDia(idx: number) {
    setDiasExpandidos(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  // ─── Loading guards ───
  if (loading || loadingU) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!unidadeAtiva) return (
    <div className="flex items-center justify-center h-screen p-6 text-center">
      <AlertCircle size={32} className="text-orange-500 mx-auto mb-3" />
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Sem acesso a unidades</h2>
        <p className="text-sm text-gray-500 mt-2">Configure em /admin/permissoes.</p>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header fixo ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-gray-900">JustClub — Aulas</h1>
          <UnidadeSelector />
        </div>
        <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
          <span>✅ {aulas.filter(a => a.ativo).length} ativas</span>
          <span>⏸ {aulas.filter(a => !a.ativo).length} inativas</span>
          <span>📅 {new Set(aulas.filter(a=>a.ativo).map(a=>a.dia_semana)).size} dia(s)/semana</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5">

        {/* Mensagem de feedback */}
        {msg && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
            msg.startsWith('Erro') ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-800 border border-green-100'
          }`}>
            {msg}
          </div>
        )}

        {/* ── Tabs + botão nova aula ── */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <button
            onClick={() => setAbaAtiva('lista')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              abaAtiva === 'lista'
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
            }`}
          >
            <List size={14} /> Lista
            {aulas.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${abaAtiva === 'lista' ? 'bg-white text-primary-600' : 'bg-primary-100 text-primary-700'}`}>
                {aulas.filter(a => a.ativo).length}
              </span>
            )}
          </button>

          <button
            onClick={() => setAbaAtiva('grade')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              abaAtiva === 'grade'
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
            }`}
          >
            <Calendar size={14} /> Grade semanal
          </button>

          <button
            onClick={abrirNovaAula}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all"
          >
            <Plus size={14} /> Nova aula
          </button>
        </div>

        {/* ── Loading ── */}
        {loadingData ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ══════════ ABA: LISTA ══════════ */}
            {abaAtiva === 'lista' && (
              <div className="space-y-3">
                {aulas.length === 0 ? (
                  <div className="card text-center py-14">
                    <Calendar size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Nenhuma aula cadastrada para esta unidade.</p>
                    <button onClick={abrirNovaAula} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all">
                      <Plus size={14} /> Criar primeira aula
                    </button>
                  </div>
                ) : (
                  aulas.map(aula => (
                    <div
                      key={aula.id}
                      className={`card transition-opacity ${!aula.ativo ? 'opacity-50 border-dashed' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Ícone do dia */}
                        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 text-xs font-bold flex flex-col items-center justify-center flex-shrink-0 border border-primary-100">
                          <span>{DIAS_ABREV[aula.dia_semana]}</span>
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipoColor(aula.tipo)}`}>
                              {tipoLabel(aula.tipo)}
                            </span>
                            {aula.so_mulheres && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100">
                                👩 Só mulheres
                              </span>
                            )}
                            {!aula.ativo && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                Inativa
                              </span>
                            )}
                          </div>

                          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{DIAS_FULL[aula.dia_semana]}</span>
                            <span className="flex items-center gap-1 font-mono text-sm font-bold text-primary-700">
                              <Clock size={12} />
                              {(aula.horario || '').slice(0, 5)}
                            </span>
                            <span className="text-xs text-gray-400">{aula.duracao_min}min</span>
                          </div>

                          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span>🏋️ {aula.grupos_musculares?.nome || '—'}</span>
                            <span>👤 {aula.coaches?.nome?.split(' ')[0] || '—'}</span>
                            <span className="flex items-center gap-1"><Users size={10} /> {aula.capacidade} vagas</span>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                          <button
                            onClick={() => abrirEdicao(aula)}
                            className="btn btn-sm gap-1 text-gray-600 hover:bg-gray-100"
                          >
                            <Pencil size={12} /> Editar
                          </button>
                          <button
                            onClick={() => toggleAtivo(aula)}
                            className={`btn btn-sm gap-1 ${
                              aula.ativo
                                ? 'text-red-500 hover:bg-red-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                          >
                            <Power size={12} /> {aula.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ══════════ ABA: GRADE SEMANAL ══════════ */}
            {abaAtiva === 'grade' && (
              <div className="space-y-3">
                {aulasAtivas.length === 0 ? (
                  <div className="card text-center py-14">
                    <Calendar size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Nenhuma aula ativa cadastrada para montar a grade.</p>
                  </div>
                ) : (
                  DIAS_FULL.map((dia, idx) => {
                    const aulasNoDia = porDia[idx]
                    if (aulasNoDia.length === 0) return null
                    const expandido = diasExpandidos.has(idx)

                    return (
                      <div key={idx} className="card overflow-hidden">
                        {/* Cabeçalho do dia */}
                        <button
                          onClick={() => toggleDia(idx)}
                          className="w-full flex items-center gap-3 text-left"
                        >
                          <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {DIAS_ABREV[idx]}
                          </div>
                          <div className="flex-1">
                            <span className="font-semibold text-gray-900 text-sm">{dia}</span>
                            <span className="text-xs text-gray-400 ml-2">
                              {aulasNoDia.length} aula{aulasNoDia.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {expandido ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                        </button>

                        {/* Lista de aulas do dia */}
                        {expandido && (
                          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                            {aulasNoDia
                              .sort((a, b) => a.horario.localeCompare(b.horario))
                              .map(aula => (
                                <div
                                  key={aula.id}
                                  className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5"
                                >
                                  <span className="font-mono text-sm font-bold text-gray-900 w-12 flex-shrink-0">
                                    {(aula.horario || '').slice(0, 5)}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${tipoColor(aula.tipo)}`}>
                                    {tipoLabel(aula.tipo)}
                                  </span>
                                  <span className="text-xs text-gray-600 flex-1 truncate">
                                    {aula.grupos_musculares?.nome || '—'}
                                  </span>
                                  <span className="text-xs text-gray-400 flex-shrink-0">
                                    👤 {aula.coaches?.nome?.split(' ')[0] || '—'}
                                  </span>
                                  <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1">
                                    <Users size={10} /> {aula.capacidade}
                                  </span>
                                  <button
                                    onClick={() => abrirEdicao(aula)}
                                    className="text-gray-400 hover:text-primary-600 transition-colors flex-shrink-0"
                                  >
                                    <Pencil size={13} />
                                  </button>
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
          </>
        )}
      </div>

      {/* ══════════ MODAL: CADASTRO / EDIÇÃO ══════════ */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col shadow-xl">

            {/* Header modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900">
                  {editando ? 'Editar aula' : 'Nova aula'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{unidadeAtiva.nome}</p>
              </div>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={18} />
              </button>
            </div>

            {/* Corpo do modal (scrollável) */}
            <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">

              {/* Tipo de aula */}
              <div>
                <label className="label">Tipo de aula *</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIPOS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm(f => ({
                        ...f,
                        tipo:        t.value,
                        so_mulheres: t.value === 'lift_for_girls',
                        capacidade:  capacidadePadrao(t.value),
                      }))}
                      className={`py-2.5 px-2 rounded-xl text-xs font-medium text-center transition-all border ${
                        form.tipo === t.value
                          ? 'border-primary-400 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {form.tipo === 'lift_for_girls' && (
                  <div className="mt-2 bg-pink-50 border border-pink-100 rounded-xl px-3 py-2 text-xs text-pink-700">
                    👩 Lift for Girls é automaticamente restrita a mulheres.
                  </div>
                )}
              </div>

              {/* Grupo muscular */}
              <div>
                <label className="label">Grupo muscular *</label>
                <select
                  className="input"
                  value={form.grupo_muscular_id}
                  onChange={e => setForm(f => ({ ...f, grupo_muscular_id: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {grupos.map(g => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>
              </div>

              {/* Coach */}
              <div>
                <label className="label">Coach responsável *</label>
                <select
                  className="input"
                  value={form.coach_id}
                  onChange={e => setForm(f => ({ ...f, coach_id: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {coaches.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              {/* Dia da semana */}
              <div>
                <label className="label">Dia da semana *</label>
                <div className="grid grid-cols-7 gap-1">
                  {DIAS_ABREV.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, dia_semana: i }))}
                      className={`py-2 rounded-xl text-xs font-medium transition-all ${
                        form.dia_semana === i
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horário */}
              <div>
                <label className="label">Horário *</label>
                <select
                  className="input"
                  value={form.horario}
                  onChange={e => setForm(f => ({ ...f, horario: e.target.value }))}
                >
                  {HORARIOS.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Duração e capacidade */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Duração (min)</label>
                  <input
                    className="input"
                    type="number"
                    min={10}
                    max={180}
                    value={form.duracao_min}
                    onChange={e => setForm(f => ({ ...f, duracao_min: +e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Capacidade (vagas)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100}
                    value={form.capacidade}
                    onChange={e => setForm(f => ({ ...f, capacidade: +e.target.value }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {form.tipo === 'running_funcional' ? 'Padrão: 26–30 conforme unidade' : 'Padrão: 24'}
                  </p>
                </div>
              </div>

              {/* Toggle só mulheres (apenas se não for lift_for_girls) */}
              {form.tipo !== 'lift_for_girls' && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, so_mulheres: !f.so_mulheres }))}
                    className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${
                      form.so_mulheres ? 'bg-pink-500' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      form.so_mulheres ? 'translate-x-5' : ''
                    }`} />
                  </button>
                  <span className="text-sm text-gray-700">Somente mulheres</span>
                </div>
              )}
            </div>

            {/* Rodapé modal */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button onClick={fecharModal} className="btn flex-1 text-gray-500 border border-gray-200">
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700 gap-1 disabled:opacity-60"
              >
                <Save size={13} />
                {salvando ? 'Salvando...' : editando ? 'Atualizar aula' : 'Criar aula'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
