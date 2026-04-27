'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Categoria, Exercicio } from '@/types'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Save, Pencil, Trash2 } from 'lucide-react'

const EMPTY_EX = {
  nome: '', numero_maquina: '', observacoes: ''
}

interface Maquina { id: string; numero: number; nome: string }

export default function JuBibliotecaPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [catSel, setCatSel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>(EMPTY_EX)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: exs }, { data: maqs }] = await Promise.all([
        supabase.from('categorias').select('*').order('ordem'),
        supabase.from('exercicios').select('*, categorias(nome)').eq('ativo', true).order('nome'),
        supabase.from('maquinas').select('*').eq('ativo', true).order('numero'),
      ])
      setCategorias(cats || [])
      setExercicios(exs || [])
      setMaquinas(maqs || [])
      if (cats && cats.length > 0) setCatSel(cats[0].id)
      setLoading(false)
    }
    load()
  }, [])

  async function saveExercicio() {
    if (!catSel || !form.nome) return
    setSaving(true)
    const payload = {
      nome: form.nome,
      numero_maquina: form.numero_maquina || null,
      observacoes: form.observacoes || null,
      categoria_id: catSel,
      series_padrao: 3,
      reps_padrao: '12',
      descanso_segundos: 60,
    }
    if (editId) {
      await supabase.from('exercicios').update(payload).eq('id', editId)
    } else {
      await supabase.from('exercicios').insert(payload)
    }
    const { data } = await supabase.from('exercicios').select('*, categorias(nome)').eq('ativo', true).order('nome')
    setExercicios(data || [])
    setForm(EMPTY_EX)
    setEditId(null)
    setSaving(false)
  }

  async function deleteExercicio(id: string) {
    if (!confirm('Remover este exercício?')) return
    await supabase.from('exercicios').update({ ativo: false }).eq('id', id)
    setExercicios(prev => prev.filter(e => e.id !== id))
  }

  const exsFiltrados = exercicios.filter(e => e.categoria_id === catSel)
  const catAtual = categorias.find(c => c.id === catSel)

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Biblioteca de exercícios"
        subtitle="Cadastre os exercícios por grupo muscular. As séries são definidas ao montar o treino do mês."
      />

      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-44 flex-shrink-0">
          <div className="card p-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1 mb-1">Grupos musculares</div>
            {categorias.map(cat => {
              const count = exercicios.filter(e => e.categoria_id === cat.id).length
              return (
                <button key={cat.id} onClick={() => { setCatSel(cat.id); setForm(EMPTY_EX); setEditId(null) }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${catSel === cat.id ? 'bg-primary-50 text-primary-800 font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>
                  <span>{cat.nome}</span>
                  <span className="text-xs text-gray-400">{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="card mb-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">
              {editId ? 'Editar exercício' : `Novo exercício — ${catAtual?.nome}`}
            </h2>
            <p className="text-xs text-gray-400 mb-3">Séries, reps e descanso são definidos ao montar o treino do mês.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="md:col-span-2">
                <label className="label">Nome do exercício *</label>
                <input className="input" placeholder="Ex: Supino reto com barra" value={form.nome} onChange={e => setForm((f: any) => ({...f, nome: e.target.value}))} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Máquina</label>
                <select className="input" value={form.numero_maquina} onChange={e => setForm((f: any) => ({...f, numero_maquina: e.target.value}))}>
                  <option value="">Selecionar máquina...</option>
                  <option value="Livre">Livre (sem máquina)</option>
                  {maquinas.map(m => (
                    <option key={m.id} value={`${m.numero} - ${m.nome}`}>
                      {m.numero} - {m.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label">Observações / Instruções para coaches</label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Ex: manter escápulas retraídas, controlar descida em 3s..."
                  value={form.observacoes || ''} onChange={e => setForm((f: any) => ({...f, observacoes: e.target.value}))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveExercicio} disabled={saving || !form.nome} className="btn btn-primary btn-sm gap-1">
                <Save size={12} /> {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Adicionar à biblioteca'}
              </button>
              {editId && <button onClick={() => { setForm(EMPTY_EX); setEditId(null) }} className="btn btn-sm">Cancelar</button>}
            </div>
          </div>

          <div className="card">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              {catAtual?.nome} — {exsFiltrados.length} exercício{exsFiltrados.length !== 1 ? 's' : ''}
            </h2>
            {exsFiltrados.length === 0 && <EmptyState message="Nenhum exercício nesta categoria ainda." />}
            <div className="divide-y divide-gray-100">
              {exsFiltrados.map(ex => (
                <div key={ex.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900">{ex.nome}</div>
                    {ex.numero_maquina && (
                      <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {ex.numero_maquina}
                      </span>
                    )}
                    {ex.observacoes && (
                      <div className="text-xs text-gray-500 italic mt-1">📌 {ex.observacoes}</div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => { setForm(ex); setEditId(ex.id) }} className="btn btn-sm p-1.5"><Pencil size={12} /></button>
                    <button onClick={() => deleteExercicio(ex.id)} className="btn btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
