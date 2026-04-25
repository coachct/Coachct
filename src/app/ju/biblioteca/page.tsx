'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Categoria, Exercicio } from '@/types'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Plus, Save, Pencil, Trash2 } from 'lucide-react'

const EMPTY_EX: Partial<Exercicio> = {
  nome: '', numero_maquina: '', series_padrao: 3,
  reps_padrao: '12', descanso_segundos: 60, observacoes: ''
}

export default function JuBibliotecaPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [catSel, setCatSel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Partial<Exercicio>>(EMPTY_EX)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: exs }] = await Promise.all([
        supabase.from('categorias').select('*').order('ordem'),
        supabase.from('exercicios').select('*, categorias(nome)').eq('ativo', true).order('nome'),
      ])
      setCategorias(cats || [])
      setExercicios(exs || [])
      if (cats && cats.length > 0) setCatSel(cats[0].id)
      setLoading(false)
    }
    load()
  }, [])

  async function saveExercicio() {
    if (!catSel || !form.nome) return
    setSaving(true)
    const payload = { ...form, categoria_id: catSel }

    if (editId) {
      await supabase.from('exercicios').update(payload).eq('id', editId)
    } else {
      await supabase.from('exercicios').insert(payload)
    }

    // Reload
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
      <PageHeader title="Biblioteca de exercícios" subtitle="Organize por categoria, defina máquina e instruções" />

      <div className="flex flex-col md:flex-row gap-4">
        {/* Sidebar categorias */}
        <div className="w-full md:w-44 flex-shrink-0">
          <div className="card p-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1 mb-1">Categorias</div>
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
          {/* Form novo/editar */}
          <div className="card mb-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              {editId ? 'Editar exercício' : `Novo exercício — ${catAtual?.nome}`}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="md:col-span-2">
                <label className="label">Nome do exercício</label>
                <input className="input" placeholder="Ex: Supino reto com barra" value={form.nome} onChange={e => setForm(f=>({...f,nome:e.target.value}))} />
              </div>
              <div>
                <label className="label">Número / nome da máquina</label>
                <input className="input" placeholder="Ex: 03 · Polia alta · Rack" value={form.numero_maquina || ''} onChange={e => setForm(f=>({...f,numero_maquina:e.target.value}))} />
              </div>
              <div>
                <label className="label">Descanso (segundos)</label>
                <input className="input" type="number" value={form.descanso_segundos} onChange={e => setForm(f=>({...f,descanso_segundos:+e.target.value}))} />
              </div>
              <div>
                <label className="label">Séries padrão</label>
                <input className="input" type="number" value={form.series_padrao} onChange={e => setForm(f=>({...f,series_padrao:+e.target.value}))} />
              </div>
              <div>
                <label className="label">Reps padrão</label>
                <input className="input" placeholder="12 ou 8-12 ou Falha" value={form.reps_padrao} onChange={e => setForm(f=>({...f,reps_padrao:e.target.value}))} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Observações / Instruções para coaches</label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Ex: manter escápulas retraídas, controlar descida em 3s, cotovelos fixos..."
                  value={form.observacoes || ''} onChange={e => setForm(f=>({...f,observacoes:e.target.value}))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveExercicio} disabled={saving || !form.nome} className="btn btn-primary btn-sm gap-1">
                <Save size={12} /> {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Adicionar à biblioteca'}
              </button>
              {editId && <button onClick={() => { setForm(EMPTY_EX); setEditId(null) }} className="btn btn-sm">Cancelar</button>}
            </div>
          </div>

          {/* Lista exercícios da categoria */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Exercícios — {catAtual?.nome}</h2>
            {exsFiltrados.length === 0 && <EmptyState message="Nenhum exercício nesta categoria." />}
            <div className="divide-y divide-gray-100">
              {exsFiltrados.map(ex => (
                <div key={ex.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900">{ex.nome}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {ex.series_padrao}× · {ex.reps_padrao} reps · {ex.descanso_segundos}s
                      {ex.numero_maquina && <span className="ml-2 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Máq. {ex.numero_maquina}</span>}
                    </div>
                    {ex.observacoes && (
                      <div className="text-xs text-gray-500 italic mt-1">📌 {ex.observacoes}</div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => { setForm(ex); setEditId(ex.id) }} className="btn btn-sm p-1.5"><Pencil size={12} /></button>
                    <button onClick={() => deleteExercicio(ex.id)} className="btn btn-sm p-1.5 text-danger-600 hover:bg-danger-50"><Trash2 size={12} /></button>
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
