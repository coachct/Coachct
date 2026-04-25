'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Coach } from '@/types'
import { fmt, DIAS_SEMANA, HORARIOS } from '@/lib/utils'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Plus, ChevronDown, ChevronUp, Save } from 'lucide-react'

const EMPTY = {
  nome: '', cpf: '', email: '', senha: '',
  contrato: 'CLT' as 'CLT' | 'PJ' | 'Autônomo',
  salario_fixo: 0, adicional_por_aula: 0, valor_cliente_aula: 0
}

export default function CoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editForm, setEditForm] = useState<Partial<Coach> | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [horarios, setHorarios] = useState<Record<string, Set<string>>>({})
  const supabase = createClient()

  useEffect(() => { loadCoaches() }, [])

  async function loadCoaches() {
    const { data } = await supabase.from('coaches').select('*').order('nome')
    setCoaches(data || [])
    setLoading(false)
  }

  async function loadHorarios(coachId: string) {
    const { data } = await supabase.from('coach_horarios').select('*').eq('coach_id', coachId).eq('ativo', true)
    const set = new Set((data || []).map((h: any) => `${h.dia_semana}-${h.hora}`))
    setHorarios(prev => ({ ...prev, [coachId]: set }))
  }

  function toggleHorario(coachId: string, key: string) {
    setHorarios(prev => {
      const set = new Set(prev[coachId] || [])
      set.has(key) ? set.delete(key) : set.add(key)
      return { ...prev, [coachId]: set }
    })
  }

  async function saveHorarios(coachId: string) {
    const set = horarios[coachId] || new Set()
    await supabase.from('coach_horarios').delete().eq('coach_id', coachId)
    const rows = Array.from(set).map(key => {
      const idx = key.indexOf('-')
      const dia = parseInt(key.substring(0, idx))
      const hora = key.substring(idx + 1)
      return { coach_id: coachId, dia_semana: dia, hora, ativo: true }
    })
    if (rows.length > 0) await supabase.from('coach_horarios').insert(rows)
    setMsg('Grade salva!')
    setTimeout(() => setMsg(''), 2000)
  }

  async function handleCreate() {
    if (!form.nome || !form.email || !form.senha) {
      setMsg('Preencha nome, email e senha.')
      return
    }
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/criar-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) { setMsg('Erro: ' + data.error); setSaving(false); return }
      setMsg('Coach criado com sucesso!')
      setForm(EMPTY)
      setShowForm(false)
      loadCoaches()
    } catch (e: any) {
      setMsg('Erro: ' + e.message)
    }
    setSaving(false)
  }

  async function handleEdit() {
    if (!editForm?.id) return
    setSaving(true)
    const { error } = await supabase.from('coaches').update({
      nome: editForm.nome,
      cpf: editForm.cpf,
      contrato: editForm.contrato || 'CLT',
      salario_fixo: editForm.salario_fixo || 0,
      adicional_por_aula: editForm.adicional_por_aula || 0,
      valor_cliente_aula: editForm.valor_cliente_aula || 0,
    }).eq('id', editForm.id)
    if (error) setMsg('Erro: ' + error.message)
    else { setMsg('Coach atualizado!'); setEditForm(null); loadCoaches() }
    setSaving(false)
    setTimeout(() => setMsg(''), 2000)
  }

  const fixo = form.salario_fixo || 0
  const vaula = form.adicional_por_aula || 0
  const cliente = form.valor_cliente_aula || 0
  const mrgUnit = cliente - vaula
  const custoReal = vaula + (fixo / 30)
  const mrgReal = cliente - custoReal
  const be = mrgUnit > 0 ? Math.ceil(fixo / mrgUnit) : null

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Coaches" subtitle="Cadastro, custos e grade de horários" />

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm mb-4 ${msg.startsWith('Erro') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
          {msg}
        </div>
      )}

      <button onClick={() => { setShowForm(!showForm); setEditForm(null) }} className="btn btn-primary mb-4 gap-2">
        <Plus size={14} /> Novo coach
      </button>

      {showForm && (
        <div className="card border-primary-200 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Novo coach</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div><label className="label">Nome completo *</label><input className="input" value={form.nome} onChange={e => setForm(f=>({...f,nome:e.target.value}))} /></div>
            <div><label className="label">CPF</label><input className="input" value={form.cpf} onChange={e => setForm(f=>({...f,cpf:e.target.value}))} placeholder="000.000.000-00 (opcional)" /></div>
            <div><label className="label">Email de acesso *</label><input className="input" type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} /></div>
            <div><label className="label">Senha inicial *</label><input className="input" type="password" value={form.senha} onChange={e => setForm(f=>({...f,senha:e.target.value}))} placeholder="Mínimo 6 caracteres" /></div>
            <div><label className="label">Tipo de contrato</label>
              <select className="input" value={form.contrato} onChange={e => setForm(f=>({...f,contrato:e
