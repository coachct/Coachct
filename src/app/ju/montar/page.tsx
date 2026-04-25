'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Categoria, Exercicio, Treino, TreinoExercicio } from '@/types'
import { PageHeader, Spinner } from '@/components/ui'
import { Plus, X, Save, CheckCircle } from 'lucide-react'

interface Slot { nome: string; descricao: string; exercicios: Exercicio[] }
const LETRAS = ['A','B','C','D','E','F','G','H']

export default function JuMontarPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [catFiltro, setCatFiltro] = useState<string>('todos')
  const [slots, setSlots] = useState<Slot[]>([{ nome: 'Treino A', descricao: '', exercicios: [] }])
  const [slotAtivo, setSlotAtivo] = useState(0)
  const [mes, setMes] = useState(new Date().getMonth() + 2) // próximo mês padrão
  const [ano, setAno] = useState(new Date().getFullYear())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<number[]>([])
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

  function addSlot() {
    const idx = slots.length
    setSlots(prev => [...prev, { nome: `Treino ${LETRAS[idx] || idx+1}`, descricao: '', exercicios: [] }])
  }

  function addExToSlot(ex: Exercicio) {
    setSlots(prev => prev.map((s, i) => {
      if (i !== slotAtivo) return s
      if (s.exercicios.find(e => e.id === ex.id)) return s // já existe
      return { ...s, exercicios: [...s.exercicios, ex] }
    }))
  }

  function removeExFromSlot(slotIdx: number, exId: string) {
    setSlots(prev => prev.map((s, i) => i !== slotIdx ? s : { ...s, exercicios: s.exercicios.filter(e => e.id !== exId) }))
  }

  async function publicarSlot(slotIdx: number) {
    const slot = slots[slotIdx]
    if (slot.exercicios.length === 0) { alert('Adicione pelo menos um exercício.'); return }
    setSaving(true)

    // Criar treino
    const { data: treino } = await supabase.from('treinos').insert({
      nome: slot.nome,
      descricao: slot.descricao || null,
      mes, ano, publicado: true,
    }).select().single()

    if (treino) {
      // Inserir exercícios
      const rows = slot.exercicios.map((ex, ordem) => ({
        treino_id: treino.id,
        exercicio_id: ex.id,
        ordem,
      }))
      await supabase.from('treino_exercicios').insert(rows)
      setSaved(prev => [...prev, slotIdx])
    }
    setSaving(false)
  }

  const exsFiltrados = catFiltro === 'todos' ? exercicios : exercicios.filter(e => e.categoria_id === catFiltro)

  if (loading) return <Spinner />

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  return (
    <div>
      <PageHeader title="Montar treinos do mês" subtitle="Selecione exercícios da biblioteca e publique os treinos" />

      <div className="flex flex-col md:flex-row gap-4">
        {/* Biblioteca lateral */}
        <div className="w-full md:w-56 flex-shrink-0">
          <div className="card p-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">Filtrar por categoria</div>
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
              {exsFiltrados.map(ex => (
                <div key={ex.id} className="py-2 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 leading-tight">{ex.nome}</div>
                    {ex.numero_maquina && <div className="text-xs text-blue-600 mt-0.5">Máq. {ex.numero_maquina}</div>}
                  </div>
                  <button onClick={() => addExToSlot(ex)}
                    className="w-6 h-6 rounded-full border border-primary-200 text-primary-600 hover:bg-primary-50 flex items-center justify-center text-base flex-shrink-0 leading-none">
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Slots */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select className="input w-auto" value={`${mes}-${ano}`} onChange={e => { const [m,a] = e.target.value.split('-'); setMes(+m); setAno(+a) }}>
              {[0,1,2,3].map(i => {
                const d = new Date(); d.setMonth(d.getMonth() + i)
                const m = d.getMonth()+1; const a = d.getFullYear()
                return <option key={i} value={`${m}-${a}`}>{meses[m-1]} {a}</option>
              })}
            </select>
            <button onClick={addSlot} className="btn btn-sm gap-1"><Plus size={12} />Novo treino</button>
            <div className="text-xs text-gray-400">Clique no slot para receber exercícios da biblioteca →</div>
          </div>

          {slots.map((slot, si) => (
            <div key={si} onClick={() => setSlotAtivo(si)}
              className={`card mb-3 cursor-pointer transition-all ${slotAtivo === si ? 'border-primary-400 ring-1 ring-primary-200' : 'border-gray-100'} ${saved.includes(si) ? 'opacity-70' : ''}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold bg-primary-100 text-primary-800 px-2 py-0.5 rounded-full">{LETRAS[si] || si+1}</span>
                <input
                  className="flex-1 text-sm font-semibold text-gray-900 border-none outline-none bg-transparent"
                  value={slot.nome}
                  onChange={e => { e.stopPropagation(); setSlots(prev => prev.map((s,i)=>i===si?{...s,nome:e.target.value}:s)) }}
                  onClick={e => e.stopPropagation()}
                />
                <input
                  className="flex-1 text-xs text-gray-400 border-none outline-none bg-transparent"
                  placeholder="Grupos musculares..."
                  value={slot.descricao}
                  onChange={e => { e.stopPropagation(); setSlots(prev => prev.map((s,i)=>i===si?{...s,descricao:e.target.value}:s)) }}
                  onClick={e => e.stopPropagation()}
                />
                <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {saved.includes(si) ? (
                    <span className="flex items-center gap-1 text-xs text-primary-600"><CheckCircle size={12} />Publicado</span>
                  ) : (
                    <button onClick={() => publicarSlot(si)} disabled={saving} className="btn btn-primary btn-sm gap-1">
                      <Save size={11} />Publicar
                    </button>
                  )}
                  <button onClick={() => setSlots(prev => prev.filter((_,i)=>i!==si))} className="btn btn-sm p-1.5 text-gray-400"><X size={12} /></button>
                </div>
              </div>

              {slot.exercicios.length === 0 ? (
                <div className="text-xs text-gray-400 italic py-2">
                  {slotAtivo === si ? 'Clique no + ao lado de cada exercício na biblioteca para adicionar.' : 'Clique aqui e selecione exercícios.'}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {slot.exercicios.map(ex => (
                    <span key={ex.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                      {ex.nome}
                      {ex.numero_maquina && <span className="text-blue-500">· {ex.numero_maquina}</span>}
                      <button onClick={e => { e.stopPropagation(); removeExFromSlot(si, ex.id) }} className="text-gray-400 hover:text-gray-700 ml-0.5">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
