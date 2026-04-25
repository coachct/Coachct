'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Coach } from '@/types'
import { fmt, calcCoachMetrics, perfLabel, DIAS_SEMANA, HORARIOS } from '@/lib/utils'
import { OccBar, Badge, PageHeader, Spinner, EmptyState } from '@/components/ui'
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
      const [dia, hora] = key.split('-').map(Number)
      return { coach_id: coachId, dia_semana: dia, hora, ativo: true }
    })
    if (rows.length > 0) await supabase.from('coach_horarios').insert(rows)
    setMsg('Grade salva!')
    setTimeout(() => setMsg(''), 2000)
  }

  async function handleCreate() {
    if (!form.nome || !form.email || !form.senha || !form.cpf) {
      setMsg('Preencha nome, CPF, email e senha.')
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
        <div className={`px-4 py-2 rounded-lg text-sm mb-4 ${msg.startsWith('Erro') ? 'bg-danger-50 text-danger-700' : 'bg-primary-50 text-primary-800'}`}>
          {msg}
        </div>
      )}

      <button onClick={() => { setShowForm(!showForm); setEditForm(null) }} className="btn btn-primary mb-4 gap-2">
        <Plus size={14} /> Novo coach
      </button>

      {/* Form novo coach */}
      {showForm && (
        <div className="card border-primary-200 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Novo coach</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div><label className="label">Nome completo</label><input className="input" value={form.nome} onChange={e => setForm(f=>({...f,nome:e.target.value}))} /></div>
            <div><label className="label">CPF</label><input className="input" value={form.cpf} onChange={e => setForm(f=>({...f,cpf:e.target.value}))} placeholder="000.000.000-00" /></div>
            <div><label className="label">Email de acesso</label><input className="input" type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} /></div>
            <div><label className="label">Senha inicial</label><input className="input" type="password" value={form.senha} onChange={e => setForm(f=>({...f,senha:e.target.value}))} placeholder="Mínimo 6 caracteres" /></div>
            <div><label className="label">Tipo de contrato</label>
              <select className="input" value={form.contrato} onChange={e => setForm(f=>({...f,contrato:e.target.value as any}))}>
                <option>CLT</option><option>PJ</option><option>Autônomo</option>
              </select>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Estrutura de custo</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Salário fixo/mês (R$)</label>
                <input className="input" type="number" value={form.salario_fixo} onChange={e => setForm(f=>({...f,salario_fixo:+e.target.value}))} />
                <p className="text-xs text-gray-400 mt-1">Pago todo mês, independe de aulas</p>
              </div>
              <div>
                <label className="label">Adicional por aula (R$)</label>
                <input className="input" type="number" value={form.adicional_por_aula} onChange={e => setForm(f=>({...f,adicional_por_aula:+e.target.value}))} />
                <p className="text-xs text-gray-400 mt-1">Pago por cada aula dada</p>
              </div>
              <div>
                <label className="label">Valor cobrado do cliente (R$)</label>
                <input className="input" type="number" value={form.valor_cliente_aula} onChange={e => setForm(f=>({...f,valor_cliente_aula:+e.target.value}))} />
                <p className="text-xs text-gray-400 mt-1">Receita da academia por aula</p>
              </div>
            </div>

            {(fixo > 0 || vaula > 0 || cliente > 0) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-3 border-t border-gray-200">
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">Margem/aula</div>
                  <div className={`text-sm font-semibold ${mrgUnit >= 0 ? 'text-primary-700' : 'text-danger-600'}`}>{mrgUnit >= 0 ? '+' : ''}R${mrgUnit.toFixed(0)}</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">Custo real/aula</div>
                  <div className="text-sm font-semibold text-gray-800">R${custoReal.toFixed(2)}</div>
                  <div className="text-xs text-gray-400">c/ fixo diluído</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">Margem real/aula</div>
                  <div className={`text-sm font-semibold ${mrgReal >= 0 ? 'text-primary-700' : 'text-danger-600'}`}>{mrgReal >= 0 ? '+' : ''}R${mrgReal.toFixed(2)}</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">Ponto de equilíbrio</div>
                  <div className="text-sm font-semibold text-warning-700">{be !== null ? `${be} aulas` : '—'}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving} className="btn btn-primary gap-2">
              <Save size={14} /> {saving ? 'Criando...' : 'Criar coach'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn">Cancelar</button>
          </div>
        </div>
      )}

      {/* Edit form */}
      {editForm && (
        <div className="card border-warning-400 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Editar — {editForm.nome}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div><label className="label">Nome</label><input className="input" value={editForm.nome} onChange={e => setEditForm(f=>({...f!,nome:e.target.value}))} /></div>
            <div><label className="label">CPF</label><input className="input" value={editForm.cpf} onChange={e => setEditForm(f=>({...f!,cpf:e.target.value}))} /></div>
            <div><label className="label">Contrato</label>
              <select className="input" value={editForm.contrato} onChange={e => setEditForm(f=>({...f!,contrato:e.target.value as any}))}>
                <option>CLT</option><option>PJ</option><option>Autônomo</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div><label className="label">Salário fixo/mês (R$)</label><input className="input" type="number" value={editForm.salario_fixo} onChange={e => setEditForm(f=>({...f!,salario_fixo:+e.target.value}))} /></div>
            <div><label className="label">Adicional por aula (R$)</label><input className="input" type="number" value={editForm.adicional_por_aula} onChange={e => setEditForm(f=>({...f!,adicional_por_aula:+e.target.value}))} /></div>
            <div><label className="label">Valor cliente/aula (R$)</label><input className="input" type="number" value={editForm.valor_cliente_aula} onChange={e => setEditForm(f=>({...f!,valor_cliente_aula:+e.target.value}))} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleEdit} disabled={saving} className="btn btn-primary gap-2"><Save size={14} />{saving ? 'Salvando...' : 'Salvar'}</button>
            <button onClick={() => setEditForm(null)} className="btn">Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista coaches */}
      <div className="space-y-3">
        {coaches.length === 0 && <EmptyState message="Nenhum coach cadastrado ainda." />}
        {coaches.map(coach => {
          const expanded = expandedId === coach.id
          const slots = horarios[coach.id]?.size || 0
          const mUnit = coach.valor_cliente_aula - coach.adicional_por_aula
          const beC = mUnit > 0 ? Math.ceil(coach.salario_fixo / mUnit) : null

          return (
            <div key={coach.id} className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-800 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                  {coach.nome.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{coach.nome}</div>
                  <div className="text-xs text-gray-400">{coach.contrato} · Fixo {fmt(coach.salario_fixo)} + R${coach.adicional_por_aula}/aula · Cliente R${coach.valor_cliente_aula}/aula</div>
                  {beC && <div className="text-xs text-gray-400">Equilíbrio: {beC} aulas/mês</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => { setEditForm(coach); setShowForm(false); window.scrollTo(0,0) }} className="btn btn-sm">Editar</button>
                  <button onClick={() => {
                    if (!expanded) loadHorarios(coach.id)
                    setExpandedId(expanded ? null : coach.id)
                  }} className="btn btn-sm gap-1">
                    Grade {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-gray-700">Grade de horários</span>
                    <span className="text-xs text-gray-400">{slots} slots/semana</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead>
                        <tr>
                          <th className="text-gray-400 font-normal w-12 text-left pb-2">Hora</th>
                          {DIAS_SEMANA.slice(1).map(d => (
                            <th key={d} className="text-gray-400 font-normal text-center pb-2 px-1">{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {HORARIOS.map(hora => (
                          <tr key={hora}>
                            <td className="text-gray-400 py-0.5 pr-2">{hora}h</td>
                            {[1,2,3,4,5,6].map(dia => {
                              const key = `${dia}-${hora}`
                              const on = horarios[coach.id]?.has(key)
                              return (
                                <td key={dia} className="px-0.5 py-0.5">
                                  <button
                                    onClick={() => toggleHorario(coach.id, key)}
                                    className={`w-full h-7 rounded text-xs transition-colors ${on ? 'bg-primary-100 text-primary-800 border border-primary-300' : 'bg-gray-50 text-gray-300 border border-gray-100 hover:bg-gray-100'}`}
                                  >
                                    {on ? '✓' : ''}
                                  </button>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => saveHorarios(coach.id)} className="btn btn-primary btn-sm gap-1"><Save size={12} />Salvar grade</button>
                    <button onClick={() => {
                      const all = new Set<string>()
                      HORARIOS.forEach(h => [1,2,3,4,5,6].forEach(d => all.add(`${d}-${h}`)))
                      setHorarios(prev => ({ ...prev, [coach.id]: all }))
                    }} className="btn btn-sm">Marcar todos</button>
                    <button onClick={() => setHorarios(prev => ({ ...prev, [coach.id]: new Set() }))} className="btn btn-sm">Limpar</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
