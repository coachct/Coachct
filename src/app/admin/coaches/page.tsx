'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Coach } from '@/types'
import { fmt, DIAS_SEMANA, HORARIOS } from '@/lib/utils'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Plus, ChevronDown, ChevronUp, Save, Trash2, X, ClipboardList, KeyRound } from 'lucide-react'

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

  const [aulaModal, setAulaModal] = useState<{ coach: Coach; aulas: any[] } | null>(null)
  const [loadingAulas, setLoadingAulas] = useState(false)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [mesAulas, setMesAulas] = useState(new Date().getMonth() + 1)
  const [anoAulas, setAnoAulas] = useState(new Date().getFullYear())

  const [senhaModal, setSenhaModal] = useState<Coach | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [msgSenha, setMsgSenha] = useState('')

  // ✅ estado para exclusão de coach
  const [excluindoCoach, setExcluindoCoach] = useState<string | null>(null)

  const supabase = createClient()
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

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

  async function abrirAulas(coach: Coach) {
    setAulaModal({ coach, aulas: [] })
    setLoadingAulas(true)
    await buscarAulas(coach, mesAulas, anoAulas)
  }

  async function buscarAulas(coach: Coach, mes: number, ano: number) {
    setLoadingAulas(true)
    const inicio = new Date(ano, mes - 1, 1).toISOString()
    const fim = new Date(ano, mes, 0, 23, 59, 59).toISOString()
    const { data } = await supabase
      .from('aulas')
      .select('*, alunos(nome), treinos(nome)')
      .eq('coach_id', coach.id)
      .in('status', ['finalizada', 'em_andamento'])
      .gte('horario_agendado', inicio)
      .lte('horario_agendado', fim)
      .order('horario_agendado', { ascending: false })
    setAulaModal({ coach, aulas: data || [] })
    setLoadingAulas(false)
  }

  async function excluirAula(aulaId: string) {
    if (!confirm('Excluir esta aula permanentemente?')) return
    setExcluindo(aulaId)
    await supabase.from('registros_carga').delete().eq('aula_id', aulaId)
    await supabase.from('aulas').delete().eq('id', aulaId)
    setAulaModal(prev => prev ? { ...prev, aulas: prev.aulas.filter(a => a.id !== aulaId) } : null)
    setExcluindo(null)
  }

  async function salvarSenha() {
    if (!senhaModal) return
    if (!novaSenha || novaSenha.length < 6) {
      setMsgSenha('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    setSalvandoSenha(true)
    setMsgSenha('')
    const res = await fetch('/api/admin/reset-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: senhaModal.user_id, nova_senha: novaSenha })
    })
    const json = await res.json()
    setSalvandoSenha(false)
    if (json.ok) {
      setMsgSenha('✅ Senha alterada com sucesso!')
      setNovaSenha('')
      setTimeout(() => { setSenhaModal(null); setMsgSenha('') }, 1500)
    } else {
      setMsgSenha('Erro: ' + json.error)
    }
  }

  // ✅ função de exclusão de coach
  async function excluirCoach(coach: Coach) {
    if (!confirm(
      `Desativar ${coach.nome}?\n\n` +
      `O histórico de aulas e registros serão preservados para fins de faturamento e estatísticas. ` +
      `O acesso ao sistema será bloqueado imediatamente.`
    )) return

    setExcluindoCoach(coach.id)
    const res = await fetch('/api/admin/excluir-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_id: coach.id, user_id: coach.user_id })
    })
    const json = await res.json()
    setExcluindoCoach(null)

    if (json.ok) {
      setMsg(`${coach.nome} foi desativado com sucesso.`)
      loadCoaches()
    } else {
      setMsg('Erro: ' + json.error)
    }
    setTimeout(() => setMsg(''), 3000)
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
                  <div className={`text-sm font-semibold ${mrgUnit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{mrgUnit >= 0 ? '+' : ''}R${mrgUnit.toFixed(0)}</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">Custo real/aula</div>
                  <div className="text-sm font-semibold text-gray-800">R${custoReal.toFixed(2)}</div>
                  <div className="text-xs text-gray-400">c/ fixo diluído</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">Margem real/aula</div>
                  <div className={`text-sm font-semibold ${mrgReal >= 0 ? 'text-green-700' : 'text-red-600'}`}>{mrgReal >= 0 ? '+' : ''}R${mrgReal.toFixed(2)}</div>
                </div>
                <div className="bg-white rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">Ponto de equilíbrio</div>
                  <div className="text-sm font-semibold text-yellow-700">{be !== null ? `${be} aulas` : '—'}</div>
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

      {editForm && (
        <div className="card mb-6" style={{borderColor:'#EF9F27'}}>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Editar — {editForm.nome}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div><label className="label">Nome</label><input className="input" value={editForm.nome} onChange={e => setEditForm(f=>({...f!,nome:e.target.value}))} /></div>
            <div><label className="label">CPF</label><input className="input" value={editForm.cpf || ''} onChange={e => setEditForm(f=>({...f!,cpf:e.target.value}))} /></div>
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
            <button onClick={handleEdit} disabled={saving} className="btn btn-primary gap-2"><Save size={12} />{saving ? 'Salvando...' : 'Salvar'}</button>
            <button onClick={() => setEditForm(null)} className="btn">Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {coaches.length === 0 && <EmptyState message="Nenhum coach cadastrado ainda." />}
        {coaches.map(coach => {
          const expanded = expandedId === coach.id
          const slots = horarios[coach.id]?.size || 0
          const mUnit = coach.valor_cliente_aula - coach.adicional_por_aula
          const beC = mUnit > 0 ? Math.ceil(coach.salario_fixo / mUnit) : null
          const inativo = !coach.ativo

          return (
            <div key={coach.id} className={`card ${inativo ? 'opacity-60 border-dashed' : ''}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${inativo ? 'bg-gray-100 text-gray-400' : 'bg-primary-100 text-primary-800'}`}>
                  {coach.nome.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-gray-900 text-sm">{coach.nome}</div>
                    {inativo && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inativo</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{coach.contrato} · Fixo {fmt(coach.salario_fixo)} + R${coach.adicional_por_aula}/aula · Cliente R${coach.valor_cliente_aula}/aula</div>
                  {beC && <div className="text-xs text-gray-400">Equilíbrio: {beC} aulas/mês</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  <button onClick={() => abrirAulas(coach)} className="btn btn-sm gap-1">
                    <ClipboardList size={12} /> Aulas
                  </button>
                  {!inativo && (
                    <>
                      <button onClick={() => { setSenhaModal(coach); setNovaSenha(''); setMsgSenha('') }} className="btn btn-sm gap-1">
                        <KeyRound size={12} /> Senha
                      </button>
                      <button onClick={() => { setEditForm(coach); setShowForm(false); window.scrollTo(0,0) }} className="btn btn-sm">Editar</button>
                      <button onClick={() => {
                        if (!expanded) loadHorarios(coach.id)
                        setExpandedId(expanded ? null : coach.id)
                      }} className="btn btn-sm gap-1">
                        Grade {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </>
                  )}
                  {/* ✅ botão desativar — só aparece se ativo */}
                  {!inativo && (
                    <button
                      onClick={() => excluirCoach(coach)}
                      disabled={excluindoCoach === coach.id}
                      className="btn btn-sm text-red-500 hover:bg-red-50 gap-1 disabled:opacity-50"
                      title="Desativar coach"
                    >
                      {excluindoCoach === coach.id
                        ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        : <Trash2 size={12} />}
                    </button>
                  )}
                </div>
              </div>

              {expanded && !inativo && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-gray-700">Grade de horários — clique para marcar</span>
                    <span className="text-xs text-gray-400">{slots} slots/semana selecionados</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead>
                        <tr>
                          <th className="text-gray-400 font-normal w-14 text-left pb-2 pr-2">Hora</th>
                          {DIAS_SEMANA.map(d => (
                            <th key={d} className="text-gray-400 font-normal text-center pb-2 px-0.5 min-w-[32px]">{d}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {HORARIOS.map(hora => (
                          <tr key={hora}>
                            <td className="text-gray-400 py-0.5 pr-2 whitespace-nowrap">{hora}</td>
                            {[0,1,2,3,4,5,6].map(dia => {
                              const key = `${dia}-${hora}`
                              const on = horarios[coach.id]?.has(key)
                              return (
                                <td key={dia} className="px-0.5 py-0.5">
                                  <button
                                    onClick={() => toggleHorario(coach.id, key)}
                                    className={`w-full h-6 rounded text-xs transition-colors ${on ? 'bg-primary-100 text-primary-800 border border-primary-300' : 'bg-gray-50 border border-gray-100 hover:bg-gray-100'}`}
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
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button onClick={() => saveHorarios(coach.id)} className="btn btn-primary btn-sm gap-1"><Save size={12} />Salvar grade</button>
                    <button onClick={() => {
                      const all = new Set<string>()
                      HORARIOS.forEach(h => [0,1,2,3,4,5,6].forEach(d => all.add(`${d}-${h}`)))
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

      {/* ─── Modal de aulas ─── */}
      {aulaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">Aulas — {aulaModal.coach.nome}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Selecione o mês para filtrar</p>
              </div>
              <button onClick={() => setAulaModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="flex gap-2 px-5 py-3 border-b border-gray-100">
              <select className="input w-auto" value={mesAulas} onChange={e => { const m = +e.target.value; setMesAulas(m); buscarAulas(aulaModal.coach, m, anoAulas) }}>
                {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select className="input w-auto" value={anoAulas} onChange={e => { const a = +e.target.value; setAnoAulas(a); buscarAulas(aulaModal.coach, mesAulas, a) }}>
                {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <span className="text-xs text-gray-400 self-center">{aulaModal.aulas.length} aula{aulaModal.aulas.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3">
              {loadingAulas ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : aulaModal.aulas.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400 italic">Nenhuma aula registrada neste mês.</div>
              ) : (
                <div className="space-y-2">
                  {aulaModal.aulas.map(aula => (
                    <div key={aula.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 truncate">{aula.alunos?.nome || 'Aluno'}</span>
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-gray-500 truncate">{aula.treinos?.nome || '—'}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${aula.status === 'finalizada' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                            {aula.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(aula.horario_agendado).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <button onClick={() => excluirAula(aula.id)} disabled={excluindo === aula.id}
                        className="flex-shrink-0 p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50">
                        {excluindo === aula.id
                          ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          : <Trash2 size={14} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button onClick={() => setAulaModal(null)} className="btn w-full">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal de senha ─── */}
      {senhaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">Redefinir senha</h2>
                <p className="text-xs text-gray-400 mt-0.5">{senhaModal.nome}</p>
              </div>
              <button onClick={() => setSenhaModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="label">Nova senha</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                />
              </div>
              {msgSenha && (
                <p className={`text-xs px-3 py-2 rounded-lg ${msgSenha.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {msgSenha}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={salvarSenha} disabled={salvandoSenha} className="btn btn-primary flex-1 gap-2">
                  <KeyRound size={13} /> {salvandoSenha ? 'Salvando...' : 'Salvar senha'}
                </button>
                <button onClick={() => setSenhaModal(null)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
