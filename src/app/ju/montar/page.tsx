'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Categoria, Exercicio, Treino } from '@/types'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Plus, X, Save, ChevronDown, ChevronUp, Copy, Pencil, Calendar } from 'lucide-react'

interface ExercicioComSeries extends Exercicio {
  series: string
  reps: string
  descanso: string
  obs_treino: string
  te_id?: string
}

interface TreinoCompleto extends Treino {
  treino_exercicios?: any[]
}

const LETRAS = ['A','B','C','D','E','F','G','H','I','J']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default function JuMontarPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [treinos, setTreinos] = useState<TreinoCompleto[]>([])
  const [catFiltro, setCatFiltro] = useState('todos')
  const [exExpandido, setExExpandido] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Treino em edição
  const [editando, setEditando] = useState<string | null>(null) // id do treino sendo editado
  const [nomeEdit, setNomeEdit] = useState('')
  const [descEdit, setDescEdit] = useState('')
  const [exsEdit, setExsEdit] = useState<ExercicioComSeries[]>([])

  // Modal publicar
  const [modalPublicar, setModalPublicar] = useState<string | null>(null)
  const [pubMes, setPubMes] = useState(new Date().getMonth() + 1)
  const [pubAno, setPubAno] = useState(new Date().getFullYear())

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: cats }, { data: exs }, { data: tr }] = await Promise.all([
      supabase.from('categorias').select('*').order('ordem'),
      supabase.from('exercicios').select('*, categorias(nome)').eq('ativo', true).order('nome'),
      supabase.from('treinos').select('*, treino_exercicios(*, exercicios(nome, numero_maquina))').order('nome'),
    ])
    setCategorias(cats || [])
    setExercicios(exs || [])
    setTreinos(tr || [])
    setLoading(false)
  }

  // ---- Criar novo treino ----
  async function criarNovo() {
    const idx = treinos.length
    const nome = `Treino ${LETRAS[idx] || idx+1}`
    const { data } = await supabase.from('treinos').insert({
      nome, descricao: '', mes: 1, ano: 2025, publicado: false
    }).select().single()
    if (data) {
      setTreinos(prev => [...prev, { ...data, treino_exercicios: [] }])
      abrirEdicao({ ...data, treino_exercicios: [] })
    }
  }

  // ---- Duplicar treino ----
  async function duplicar(treino: TreinoCompleto) {
    const { data: novo } = await supabase.from('treinos').insert({
      nome: treino.nome + ' (cópia)',
      descricao: treino.descricao,
      mes: 1, ano: 2025, publicado: false
    }).select().single()
    if (novo && treino.treino_exercicios) {
      const rows = treino.treino_exercicios.map((te: any, i: number) => ({
        treino_id: novo.id,
        exercicio_id: te.exercicio_id,
        ordem: te.ordem ?? i,
        series_override: te.series_override,
        reps_override: te.reps_override,
        descanso_override: te.descanso_override,
        observacoes_override: te.observacoes_override,
      }))
      if (rows.length > 0) await supabase.from('treino_exercicios').insert(rows)
    }
    setMsg('Treino duplicado!')
    setTimeout(() => setMsg(''), 2000)
    load()
  }

  // ---- Abrir edição ----
  function abrirEdicao(treino: TreinoCompleto) {
    setEditando(treino.id)
    setNomeEdit(treino.nome)
    setDescEdit(treino.descricao || '')
    setExsEdit((treino.treino_exercicios || []).map((te: any) => ({
      ...te.exercicios,
      te_id: te.id,
      series: String(te.series_override || 3),
      reps: te.reps_override || '12',
      descanso: String(te.descanso_override || 60),
      obs_treino: te.observacoes_override || '',
    })))
    setExExpandido(null)
  }

  // ---- Salvar edição ----
  async function salvarEdicao() {
    if (!editando) return
    setSaving(true)
    await supabase.from('treinos').update({ nome: nomeEdit, descricao: descEdit }).eq('id', editando)
    await supabase.from('treino_exercicios').delete().eq('treino_id', editando)
    if (exsEdit.length > 0) {
      const rows = exsEdit.map((ex, i) => ({
        treino_id: editando,
        exercicio_id: ex.id,
        ordem: i,
        series_override: parseInt(ex.series) || 3,
        reps_override: ex.reps || '12',
        descanso_override: parseInt(ex.descanso) || 60,
        observacoes_override: ex.obs_treino || null,
      }))
      await supabase.from('treino_exercicios').insert(rows)
    }
    setMsg('Treino salvo!')
    setTimeout(() => setMsg(''), 2000)
    setEditando(null)
    load()
    setSaving(false)
  }

  // ---- Deletar treino ----
  async function deletarTreino(id: string) {
    if (!confirm('Remover este treino da biblioteca?')) return
    await supabase.from('treinos').delete().eq('id', id)
    setTreinos(prev => prev.filter(t => t.id !== id))
    if (editando === id) setEditando(null)
  }

  // ---- Exercícios no editor ----
  function addEx(ex: Exercicio) {
    if (exsEdit.find(e => e.id === ex.id)) return
    const novo: ExercicioComSeries = { ...ex, series: '3', reps: '12', descanso: '60', obs_treino: '' }
    setExsEdit(prev => [...prev, novo])
    setExExpandido(ex.id)
  }

  function updateEx(exId: string, field: string, value: string) {
    setExsEdit(prev => prev.map(e => e.id === exId ? { ...e, [field]: value } : e))
  }

  function removeEx(exId: string) {
    setExsEdit(prev => prev.filter(e => e.id !== exId))
  }

  // ---- Publicar treino ----
  async function publicarTreino() {
    if (!modalPublicar) return
    setSaving(true)
    const { error } = await supabase.from('treino_publicacoes').upsert({
      treino_id: modalPublicar,
      mes: pubMes,
      ano: pubAno,
      publicado: true,
    }, { onConflict: 'treino_id,mes,ano' })
    if (error) { alert('Erro: ' + error.message) }
    else {
      setMsg(`Treino publicado em ${MESES[pubMes-1]} ${pubAno}!`)
      setTimeout(() => setMsg(''), 3000)
    }
    setModalPublicar(null)
    setSaving(false)
  }

  const exsFiltrados = catFiltro === 'todos' ? exercicios : exercicios.filter(e => e.categoria_id === catFiltro)

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Biblioteca de treinos" subtitle="Crie, edite e publique os treinos por mês" />

      {msg && (
        <div className="bg-green-50 text-green-800 px-4 py-3 rounded-xl text-sm font-medium mb-4">{msg}</div>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        {/* Lista de treinos */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">Treinos ({treinos.length})</span>
            <button onClick={criarNovo} className="btn btn-primary btn-sm gap-1"><Plus size={12} />Novo</button>
          </div>
          <div className="space-y-2">
            {treinos.length === 0 && <EmptyState message="Nenhum treino criado ainda." />}
            {treinos.map(t => (
              <div key={t.id} className={`card p-3 cursor-pointer transition-all ${editando === t.id ? 'border-primary-400 ring-1 ring-primary-200' : 'hover:border-gray-200'}`}
                onClick={() => abrirEdicao(t)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{t.nome}</div>
                    {t.descricao && <div className="text-xs text-gray-400 truncate">{t.descricao}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {(t.treino_exercicios?.length || 0)} exercícios
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setModalPublicar(t.id) }} className="btn btn-sm p-1.5 text-primary-600" title="Publicar">
                      <Calendar size={13} />
                    </button>
                    <button onClick={() => duplicar(t)} className="btn btn-sm p-1.5 text-gray-400" title="Duplicar">
                      <Copy size={13} />
                    </button>
                    <button onClick={() => deletarTreino(t.id)} className="btn btn-sm p-1.5 text-red-400 hover:bg-red-50" title="Remover">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor do treino */}
        <div className="flex-1 min-w-0">
          {!editando ? (
            <div className="card flex items-center justify-center py-16 text-gray-400 text-sm italic">
              ← Selecione um treino para editar ou crie um novo
            </div>
          ) : (
            <div className="card">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <input className="text-base font-semibold text-gray-900 border-none outline-none bg-transparent flex-1 min-w-0"
                  value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} placeholder="Nome do treino..." />
                <input className="text-xs text-gray-400 border-none outline-none bg-transparent flex-1 min-w-0"
                  value={descEdit} onChange={e => setDescEdit(e.target.value)} placeholder="Grupos musculares... ex: Peito + Tríceps" />
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={salvarEdicao} disabled={saving} className="btn btn-primary btn-sm gap-1">
                    <Save size={12} />{saving ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button onClick={() => { setModalPublicar(editando) }} className="btn btn-sm gap-1 text-primary-600 border-primary-200">
                    <Calendar size={12} />Publicar
                  </button>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4">
                {/* Biblioteca de exercícios */}
                <div className="w-full md:w-52 flex-shrink-0">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs font-semibold text-gray-500 mb-2">Adicionar exercício</div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      <button onClick={() => setCatFiltro('todos')}
                        className={`px-2 py-0.5 rounded-full text-xs border ${catFiltro==='todos'?'bg-blue-100 text-blue-700 border-blue-300':'text-gray-500 border-gray-200'}`}>
                        Todos
                      </button>
                      {categorias.map(c => (
                        <button key={c.id} onClick={() => setCatFiltro(c.id)}
                          className={`px-2 py-0.5 rounded-full text-xs border ${catFiltro===c.id?'bg-blue-100 text-blue-700 border-blue-300':'text-gray-500 border-gray-200'}`}>
                          {c.nome}
                        </button>
                      ))}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                      {exsFiltrados.map(ex => {
                        const ja = exsEdit.find(e => e.id === ex.id)
                        return (
                          <div key={ex.id} className="py-1.5 flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-gray-800 truncate">{ex.nome}</div>
                              {ex.numero_maquina && <div className="text-xs text-blue-500">{ex.numero_maquina}</div>}
                            </div>
                            <button onClick={() => !ja && addEx(ex)} disabled={!!ja}
                              className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs flex-shrink-0 ${ja?'bg-primary-100 border-primary-300 text-primary-600':'border-primary-200 text-primary-600 hover:bg-primary-50'}`}>
                              {ja ? '✓' : '+'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Exercícios do treino */}
                <div className="flex-1 min-w-0">
                  {exsEdit.length === 0 ? (
                    <div className="text-sm text-gray-400 text-center py-8 italic">← Adicione exercícios da biblioteca</div>
                  ) : (
                    <div className="space-y-2">
                      {exsEdit.map((ex, ei) => {
                        const isOpen = exExpandido === ex.id
                        return (
                          <div key={ex.id} className="border border-gray-100 rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
                              <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">{ei+1}</div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">{ex.nome}</div>
                                <div className="text-xs text-gray-400">
                                  {ex.numero_maquina && <span className="text-blue-500 mr-2">{ex.numero_maquina}</span>}
                                  {!isOpen && `${ex.series}× · ${ex.reps} reps · ${ex.descanso}s`}
                                </div>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <button onClick={() => setExExpandido(isOpen ? null : ex.id)} className="btn btn-sm p-1 text-gray-400">
                                  {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                                <button onClick={() => removeEx(ex.id)} className="btn btn-sm p-1 text-red-400 hover:bg-red-50">
                                  <X size={13} />
                                </button>
                              </div>
                            </div>
                            {isOpen && (
                              <div className="px-3 py-3 grid grid-cols-3 gap-2">
                                <div>
                                  <label className="label">Séries</label>
                                  <input className="input text-center" value={ex.series} onChange={e => updateEx(ex.id, 'series', e.target.value)} />
                                </div>
                                <div>
                                  <label className="label">Reps</label>
                                  <input className="input text-center" value={ex.reps} onChange={e => updateEx(ex.id, 'reps', e.target.value)} />
                                </div>
                                <div>
                                  <label className="label">Descanso (s)</label>
                                  <input className="input text-center" value={ex.descanso} onChange={e => updateEx(ex.id, 'descanso', e.target.value)} />
                                </div>
                                <div className="col-span-3">
                                  <label className="label">Observação</label>
                                  <textarea className="input resize-none" rows={2} value={ex.obs_treino}
                                    placeholder="Ex: atenção ao ângulo, aumentar carga progressivamente..."
                                    onChange={e => updateEx(ex.id, 'obs_treino', e.target.value)} />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal publicar */}
      {modalPublicar && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Publicar treino</h2>
            <p className="text-sm text-gray-500 mb-4">Escolha o mês em que este treino ficará disponível para os coaches.</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="label">Mês</label>
                <select className="input" value={pubMes} onChange={e => setPubMes(+e.target.value)}>
                  {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Ano</label>
                <select className="input" value={pubAno} onChange={e => setPubAno(+e.target.value)}>
                  {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={publicarTreino} disabled={saving} className="btn btn-primary flex-1">
                {saving ? 'Publicando...' : 'Publicar'}
              </button>
              <button onClick={() => setModalPublicar(null)} className="btn flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
