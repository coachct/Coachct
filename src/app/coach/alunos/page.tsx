'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Aluno } from '@/types'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Plus, Search, Pencil, X, Save } from 'lucide-react'

const EMPTY: Partial<Aluno> = { nome: '', cpf: '', telefone: '', data_nascimento: '', observacoes: '' }

export default function CoachAlunosPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState<Partial<Aluno>>(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
      if (coach) {
        setCoachId(coach.id)
        loadAlunos()
      }
      setLoading(false)
    }
    load()
  }, [user])

  async function loadAlunos() {
    const { data } = await supabase.from('alunos').select('*').eq('ativo', true).order('nome')
    setAlunos(data || [])
  }

  async function handleSave() {
    if (!form.nome || !form.cpf) { alert('Nome e CPF são obrigatórios.'); return }
    setSaving(true)
    if (editId) {
      await supabase.from('alunos').update({ ...form, atualizado_em: new Date().toISOString() }).eq('id', editId)
    } else {
      await supabase.from('alunos').insert({ ...form, cadastrado_por: coachId })
    }
    await loadAlunos()
    setForm(EMPTY); setShowForm(false); setEditId(null); setSaving(false)
  }

  function openEdit(aluno: Aluno) {
    setForm(aluno); setEditId(aluno.id); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filtrados = alunos.filter(a =>
    a.nome.toLowerCase().includes(busca.toLowerCase()) || a.cpf.replace(/\D/g,'').includes(busca.replace(/\D/g,''))
  )

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Alunos" subtitle="Cadastre, edite e busque alunos" />

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8" placeholder="Buscar por nome ou CPF..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <button onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(!showForm) }} className="btn btn-primary gap-1 flex-shrink-0">
          <Plus size={14} /> Novo
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="card border-primary-200 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">{editId ? 'Editar aluno' : 'Novo aluno'}</h2>
            <button onClick={() => { setShowForm(false); setForm(EMPTY); setEditId(null) }}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="label">Nome completo *</label>
              <input className="input" placeholder="Nome do aluno" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label className="label">CPF *</label>
              <input className="input" placeholder="000.000.000-00" value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" placeholder="(11) 99999-9999" value={form.telefone || ''} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
            </div>
            <div>
              <label className="label">Data de nascimento</label>
              <input className="input" type="date" value={form.data_nascimento || ''} onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Observações / Limitações físicas</label>
              <textarea className="input resize-none" rows={2} placeholder="Ex: dor lombar, restrição de joelho, gestante..." value={form.observacoes || ''} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm gap-1">
              <Save size={12} /> {saving ? 'Salvando...' : 'Salvar aluno'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY); setEditId(null) }} className="btn btn-sm">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {filtrados.length === 0 && <EmptyState message={busca ? 'Nenhum aluno encontrado para esta busca.' : 'Nenhum aluno cadastrado ainda.'} />}
        {filtrados.map(a => (
          <div key={a.id} className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-800 text-sm font-semibold flex items-center justify-center flex-shrink-0">
              {a.nome.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900">{a.nome}</div>
              <div className="text-xs text-gray-400 mt-0.5">CPF {a.cpf}{a.telefone ? ` · ${a.telefone}` : ''}</div>
              {a.observacoes && <div className="text-xs text-warning-700 mt-0.5 italic truncate">⚠ {a.observacoes}</div>}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => openEdit(a)} className="btn btn-sm p-2"><Pencil size={12} /></button>
              <a href="/coach/treino" className="btn btn-primary btn-sm">Treinar</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
