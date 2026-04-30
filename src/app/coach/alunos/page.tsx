'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Search, Plus, Save, History } from 'lucide-react'

export default function CoachAlunosPage() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [coach, setCoach] = useState<any>(null)
  const [alunos, setAlunos] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', observacoes: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (perfil?.id) loadData()
  }, [perfil])

  async function loadData() {
    const { data: coachData } = await supabase
      .from('coaches').select('*').eq('user_id', perfil!.id).single()
    if (!coachData) { setLoading(false); return }
    setCoach(coachData)

    const { data } = await supabase
      .from('alunos').select('*').order('nome')
    setAlunos(data || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.nome.trim()) return
    setSaving(true)
    if (editId) {
      await supabase.from('alunos').update({
        nome: form.nome, cpf: form.cpf || null,
        telefone: form.telefone || null, observacoes: form.observacoes || null,
      }).eq('id', editId)
    } else {
      await supabase.from('alunos').insert({
        nome: form.nome, cpf: form.cpf || null,
        telefone: form.telefone || null, observacoes: form.observacoes || null,
        cadastrado_por: coach?.id,
      })
    }
    setForm({ nome: '', cpf: '', telefone: '', observacoes: '' })
    setEditId(null)
    setShowForm(false)
    setSaving(false)
    loadData()
  }

  const alunosFiltrados = busca
    ? alunos.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()) || a.cpf?.includes(busca))
    : alunos

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Alunos" subtitle="Gerencie seus alunos e veja o histórico de cada um" />

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-3 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por nome ou CPF..."
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ nome: '', cpf: '', telefone: '', observacoes: '' }) }}
          className="btn btn-primary btn-sm gap-1">
          <Plus size={13} /> Novo
        </button>
      </div>

      {showForm && (
        <div className="card mb-4 max-w-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {editId ? 'Editar aluno' : 'Novo aluno'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Nome completo *</label>
              <input className="input" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label className="label">CPF</label>
              <input className="input" value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="label">Observações</label>
              <input className="input" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Limitações, lesões..." />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={salvar} disabled={saving || !form.nome.trim()} className="btn btn-primary btn-sm gap-1">
              <Save size={12} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="btn btn-sm">Cancelar</button>
          </div>
        </div>
      )}

      {alunosFiltrados.length === 0 && <EmptyState message="Nenhum aluno encontrado." />}

      <div className="space-y-2 max-w-2xl">
        {alunosFiltrados.map(aluno => (
          <div key={aluno.id} className="card flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-800 text-sm font-semibold flex items-center justify-center flex-shrink-0">
              {aluno.nome.slice(0,2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900">{aluno.nome}</div>
              <div className="text-xs text-gray-400">
                {aluno.cpf && <span>{aluno.cpf} · </span>}
                {aluno.telefone && <span>{aluno.telefone} · </span>}
                {aluno.observacoes && <span className="italic">{aluno.observacoes}</span>}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => router.push(`/coach/alunos/${aluno.id}`)}
                className="btn btn-sm gap-1 text-primary-600 border-primary-200">
                <History size={12} /> Histórico
              </button>
              <button onClick={() => {
                setEditId(aluno.id)
                setForm({ nome: aluno.nome, cpf: aluno.cpf || '', telefone: aluno.telefone || '', observacoes: aluno.observacoes || '' })
                setShowForm(true)
                window.scrollTo(0, 0)
              }} className="btn btn-sm">Editar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
