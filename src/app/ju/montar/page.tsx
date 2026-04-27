'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Categoria, Exercicio } from '@/types'
import { PageHeader, Spinner } from '@/components/ui'
import { Plus, X, Save, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface ExercicioComSeries extends Exercicio {
  series: string
  reps: string
  descanso: string
  obs_treino: string
}

interface Slot {
  nome: string
  descricao: string
  exercicios: ExercicioComSeries[]
}

const LETRAS = ['A','B','C','D','E','F','G','H']

export default function JuMontarPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [catFiltro, setCatFiltro] = useState<string>('todos')
  const [slots, setSlots] = useState<Slot[]>([{ nome: 'Treino A', descricao: '', exercicios: [] }])
  const [slotAtivo, setSlotAtivo] = useState(0)
  const [exExpandido, setExExpandido] = useState<string | null>(null)
  const [mes, setMes] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1)
    return d.getMonth() + 1
  })
  const [ano, setAno] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1)
    return d.getFullYear()
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<number[]>([])
  const [msgSucesso, setMsgSucesso] = useState('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: exs }] = await Promise.all([
        supabase.from('categorias').select('*').order('ordem'),
        supabase.from('exercicios').select('*, categorias(nome)').eq('ativo', true).order('nome'),
      ])
      setCategorias(cats || [])
      setExercicios(exs || [])
      setLoading(false)
    }
    load()
  }, [])

  function addExToSlot(ex: Exercicio) {
    setSlots(prev => prev.map((s, i) => {
      if (i !== slotAtivo) return s
      if (s.exercicios.find(e => e.id === ex.id)) return s
      const novoEx: ExercicioComSeries = {
        ...ex,
        series: '3',
        reps: '12',
        descanso: '60',
        obs_treino: ''
      }
      return { ...s, exercicios: [...s.exercicios, novoEx] }
    }))
    setExExpandido(ex.id + '-' + slotAtivo)
  }

  function updateExSlot(slotIdx: number, exId: string, field: string, value: string) {
    setSlots(prev => prev.map((s, i) => {
      if (i !== slotIdx) return s
      return {
        ...s,
        exercicios: s.exercicios.map(e =>
          e.id === exId ? { ...e, [field]: value } : e
        )
      }
    }))
  }

  function removeExFromSlot(slotIdx: number, exId: string) {
    setSlots(prev => prev.map((s, i) =>
      i !== slotIdx ? s : { ...s, exercicios: s.exercicios.filter(e => e.id !== exId) }
    ))
  }

  function addSlot() {
    const idx = slots.length
    setSlots(prev => [...prev, { nome: `Treino ${LETRAS[idx] || idx+1}`, descricao: '', exercicios: [] }])
    setSlotAtivo(slots.length)
  }

  async function publicarSlot(slotIdx: number) {
    const slot = slots[slotIdx]
    if (slot.exercicios.length === 0) {
      alert('Adicione pelo menos um exercício antes de publicar.')
      return
    }
    setSaving(true)
    setMsgSucesso('')
    try {
      const { data: treino, error } = await supabase.from('treinos').insert({
        nome: slot.nome,
        descricao: slot.descricao || null,
        mes, ano,
        publicado: true,
      }).select().single()

      if (error) {
        alert('Erro ao publicar: ' + error.message)
        setSaving(false)
        return
      }

      if (treino) {
        const rows = slot.exercicios.map((ex, ordem) => ({
          treino_id: treino.id,
          exercicio_id: ex.id,
          ordem,
          series_override: parseInt(ex.series) || 3,
          reps_override: ex.reps || '12',
          descanso_override: parseInt(ex.descanso) || 60,
          observacoes_override: ex.obs_treino || null,
        }))
        await supabase.from('treino_exercicios').insert(rows)
        setSaved(prev => [...prev, slotIdx])
        setMsgSucesso(`✅ ${slot.nome} publicado com sucesso!`)
        setTimeout(() => setMsgSucesso(''), 4000)
      }
    } catch (e: any) {
      alert('Erro: ' + e.message)
    }
    setSaving(false)
  }

  const exsFiltrados = catFiltro === 'todos'
    ? exercicios
    : exercicios.filter(e => e.categoria_id === catFiltro)

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Montar treinos do mês"
        subtitle="Selecione os exercícios, defina séries, reps e descanso para este mês"
      />

      {msgSucesso && (
        <div className="bg-green-50 text-green-800 px-4 py-3 rounded-xl text-sm font-medium mb-4">
          {msgSucesso} Veja em <a href="/ju/treinos" className="underline">Treinos do mês</a>.
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        {/* Biblioteca lateral */}
        <div className="w-full md:w-60 flex-shrink-0">
          <div className="card p-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">Grupos musculares</div>
            <div className="flex flex-wrap gap-1 mb-3">
              <button onClick={() => setCatFiltro('todos')}
                className={`px-2 py-1 rounded-full text-xs border transition-colors ${catFiltro==='todos'?'bg-blue-100 text-blue-700 border-blue-300':'text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                Todos
              </button>
              {categorias.map(c => (
                <button key={c.id} onClick={() => setCatFiltro(c.id)}
                  className={`px-2 py-1 rounded-full text-xs border transition-colors ${catFiltro===c.id?'bg-blue-100 text-blue-700 border-blue-300':'text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                  {c.nome}
                </button>
              ))}
            </div>
            <div className="max-h-96 md:max-h-[600px] overflow-y-auto divide-y divide-gray-100">
              {exsFiltrados.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-4">Nenhum exercício cadastrado.</div>
              )}
              {exsFiltrados.map(ex => {
                const jaAdicionado = slots[slotAtivo]?.exercicios.find(e => e.id === ex.id)
                return (
                  <div key={ex.id} className="py-2 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 leading-tight">{ex.nome}</div>
                      {ex.numero_maquina && (
                        <div className="text-xs text-blue-600 mt-0.5">{ex.numero_maquina}</div>
                      )}
                    </div>
                    <button
                      onClick={() => !jaAdicionado && addExToSlot(ex)}
                      disabled={!!jaAdicionado}
                      className={`w-6 h-6 rounded-full border flex items-center justify-center text-base flex-shrink-0 leading-none transition-colors ${jaAdicionado ? 'bg-primary-100 border-primary-300 text-primary-600 cursor-default' : 'border-primary-200 text-primary-600 hover:bg-primary-50'}`}>
                      {jaAdicionado ? '✓' : '+'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Slots de treinos */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select className="input w-auto" value={`${mes}-${ano}`} onChange={e => {
              const [m,a] = e.target.value.split('-')
              setMes(+m); setAno(+a)
            }}>
              {Array.from({length: 6}, (_,i) => {
                const d = new Date()
                d.setMonth(d.getMonth() + i)
                const m = d.getMonth()+1
                const a = d.getFullYear()
                return <option key={i} value={`${m}-${a}`}>{meses[m-1]} {a}</option>
              })}
            </select>
            <button onClick={addSlot} className="btn btn-sm gap-1"><Plus size={12} />Novo treino</button>
          </div>

          {/* Tabs dos slots */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {slots.map((slot, si) => (
              <button key={si} onClick={() => setSlotAtivo(si)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${slotAtivo === si ? 'bg-primary-400 text-white border-primary-400' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
                {slot.nome}
                {slot.exercicios.length > 0 && (
                  <span className="ml-1 text-xs opacity-70">({slot.exercicios.length})</span>
                )}
                {saved.includes(si) && <span className="ml-1">✓</span>}
              </button>
            ))}
          </div>

          {/* Slot ativo */}
          {slots[slotAtivo] && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <input
                  className="text-base font-semibold text-gray-900 border-none outline-none bg-transparent flex-1 min-w-0"
                  value={slots[slotAtivo].nome}
                  onChange={e => setSlots(prev => prev.map((s,i) => i===slotAtivo ? {...s, nome:e.target.value} : s))}
                  placeholder="Nome do treino..."
                />
                <input
                  className="text-xs text-gray-400 border-none outline-none bg-transparent flex-1 min-w-0"
                  value={slots[slotAtivo].descricao}
                  onChange={e => setSlots(prev => prev.map((s,i) => i===slotAtivo ? {...s, descricao:e.target.value} : s))}
                  placeholder="Grupos musculares... ex: Peito + Tríceps"
                />
                <div className="flex gap-2 flex-shrink-0">
                  {saved.includes(slotAtivo) ? (
                    <span className="flex items-center gap-1 text-xs text-primary-600 font-medium">
                      <CheckCircle size={14} />Publicado
                    </span>
                  ) : (
                    <button onClick={() => publicarSlot(slotAtivo)} disabled={saving} className="btn btn-primary btn-sm gap-1">
                      <Save size={12} />{saving ? 'Publicando...' : 'Publicar'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (slots.length === 1) return
                      setSlots(prev => prev.filter((_,i) => i !== slotAtivo))
                      setSlotAtivo(Math.max(0, slotAtivo - 1))
                    }}
                    className="btn btn-sm text-red-400 hover:bg-red-50 p-1.5">
                    <X size={14} />
                  </button>
                </div>
              </div>

              {slots[slotAtivo].exercicios.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8 italic">
                  ← Selecione exercícios na biblioteca ao lado
                </div>
              ) : (
                <div className="space-y-2">
                  {slots[slotAtivo].exercicios.map((ex, ei) => {
                    const expandKey = ex.id + '-' + slotAtivo
                    const isOpen = exExpandido === expandKey
                    return (
                      <div key={ex.id} className="border border-gray-100 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
                          <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                            {ei + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{ex.nome}</div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {ex.numero_maquina && (
                                <span className="text-xs text-blue-600">{ex.numero_maquina}</span>
                              )}
                              {!isOpen && (
                                <span className="text-xs text-gray-400">
                                  {ex.series}× · {ex.reps} reps · {ex.descanso}s
                                  {ex.obs_treino && ` · "${ex.obs_treino.slice(0,25)}${ex.obs_treino.length>25?'...':''}"`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => setExExpandido(isOpen ? null : expandKey)}
                              className="btn btn-sm p-1.5 text-gray-400">
                              {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <button onClick={() => removeExFromSlot(slotAtivo, ex.id)}
                              className="btn btn-sm p-1.5 text-red-400 hover:bg-red-50">
                              <X size={14} />
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div>
                              <label className="label">Séries</label>
                              <input className="input text-center" placeholder="3" value={ex.series}
                                onChange={e => updateExSlot(slotAtivo, ex.id, 'series', e.target.value)} />
                            </div>
                            <div>
                              <label className="label">Reps</label>
                              <input className="input text-center" placeholder="12 ou 8-12 ou Falha" value={ex.reps}
                                onChange={e => updateExSlot(slotAtivo, ex.id, 'reps', e.target.value)} />
                            </div>
                            <div>
                              <label className="label">Descanso (seg)</label>
                              <input className="input text-center" placeholder="60" value={ex.descanso}
                                onChange={e => updateExSlot(slotAtivo, ex.id, 'descanso', e.target.value)} />
                            </div>
                            <div className="col-span-2 md:col-span-3">
                              <label className="label">Observação deste exercício neste mês</label>
                              <textarea className="input resize-none" rows={2}
                                placeholder="Ex: atenção ao ângulo do banco, aumentar carga progressivamente..."
                                value={ex.obs_treino}
                                onChange={e => updateExSlot(slotAtivo, ex.id, 'obs_treino', e.target.value)} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
