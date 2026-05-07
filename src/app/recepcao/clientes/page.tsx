'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Search, Plus, ChevronRight, X, Check, Calendar, Unlock, AlertCircle, CreditCard, Clock, CheckCircle2, XCircle } from 'lucide-react'

const HORARIOS = [
  '05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00',
  '12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00',
  '19:30','20:00'
]

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const LIMITE_PLANO: Record<string, number> = {
  wellhub: 8,
  totalpass: 10,
}

export default function RecepcaoClientesPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [clienteSel, setClienteSel] = useState<any>(null)
  const [aba, setAba] = useState<'dados' | 'historico' | 'agendar'>('dados')

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)

  const [historico, setHistorico] = useState<any[]>([])
  const [creditos, setCreditos] = useState<Record<string, { usado: number; limite: number }>>({})

  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [horariosSel, setHorariosSel] = useState<any[]>([])
  const [horarioEscolhido, setHorarioEscolhido] = useState('')
  const [tipoCredito, setTipoCredito] = useState('')
  const [agendando, setAgendando] = useState(false)
  const [erroAgendar, setErroAgendar] = useState('')
  const [sucessoAgendar, setSucessoAgendar] = useState(false)

  const [novoCliente, setNovoCliente] = useState(false)
  const [formNovo, setFormNovo] = useState({ nome: '', email: '', telefone: '', cpf: '', planos: ['wellhub'], creditos_avulso: 0 })
  const [criando, setCriando] = useState(false)
  const [erroCriar, setErroCriar] = useState('')

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if ((perfil.role as any) !== 'recepcao' && (perfil.role as any) !== 'admin') { router.push('/'); return }
    buscarClientes()
  }, [loading, perfil])

  useEffect(() => {
    if (!perfil) return
    buscarClientes()
  }, [busca])

  async function buscarClientes() {
    setLoadingClientes(true)
    let query = supabase.from('clientes').select('*').order('nome').limit(50)
    if (busca.trim()) {
      query = query.or(`nome.ilike.%${busca}%,cpf.ilike.%${busca}%,email.ilike.%${busca}%`)
    }
    const { data } = await query
    setClientes(data || [])
    setLoadingClientes(false)
  }

  async function abrirCliente(cliente: any) {
    setClienteSel(cliente)
    setForm({ ...cliente, planos: cliente.planos || ['wellhub'] })
    setEditando(false)
    setAba('dados')
    setHistorico([])
    setSucessoAgendar(false)
    setErroAgendar('')
    setHorarioEscolhido('')
    setTipoCredito('')
    await carregarCreditos(cliente)
  }

  async function carregarCreditos(cliente: any) {
    const agora = new Date()
    const mes = agora.getMonth() + 1
    const ano = agora.getFullYear()
    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
    const fim = `${ano}-${String(mes).padStart(2, '0')}-31`

    const { data: ags } = await supabase
      .from('agendamentos')
      .select('tipo_credito, status')
      .eq('cliente_id', cliente.id)
      .gte('data', inicio)
      .lte('data', fim)
      .in('status', ['agendado', 'confirmado', 'realizado'])

    const usado: Record<string, number> = {}
    for (const a of (ags || [])) {
      usado[a.tipo_credito] = (usado[a.tipo_credito] || 0) + 1
    }

    const resultado: Record<string, { usado: number; limite: number }> = {}
    const planos = cliente.planos || ['wellhub']
    for (const p of planos) {
      if (LIMITE_PLANO[p]) {
        resultado[p] = { usado: usado[p] || 0, limite: LIMITE_PLANO[p] }
      }
    }
    if ((cliente.creditos_avulso || 0) > 0) {
      resultado['avulso'] = { usado: usado['avulso'] || 0, limite: cliente.creditos_avulso }
    }

    setCreditos(resultado)
  }

  async function carregarHistorico(clienteId: string) {
    const { data } = await supabase
      .from('agendamentos')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('data', { ascending: false })
      .limit(30)
    setHistorico(data || [])
  }

  async function salvarEdicao() {
    setSalvando(true)
    const { error } = await supabase.from('clientes').update({
      nome: form.nome,
      email: form.email,
      telefone: form.telefone,
      cpf: form.cpf,
      planos: form.planos,
      creditos_avulso: form.creditos_avulso || 0,
    }).eq('id', clienteSel.id)

    if (!error) {
      const updated = { ...clienteSel, ...form }
      setClienteSel(updated)
      setEditando(false)
      await carregarCreditos(updated)
      buscarClientes()
    }
    setSalvando(false)
  }

  async function desbloquear() {
    if (!confirm('Desbloquear este cliente?')) return
    await supabase.from('clientes').update({ bloqueado: false, motivo_bloqueio: null }).eq('id', clienteSel.id)
    setClienteSel({ ...clienteSel, bloqueado: false, motivo_bloqueio: null })
    buscarClientes()
  }

  async function criarCliente() {
    setCriando(true)
    setErroCriar('')
    const { error } = await supabase.from('clientes').insert({
      nome: formNovo.nome,
      email: formNovo.email,
      telefone: formNovo.telefone,
      cpf: formNovo.cpf.replace(/\D/g, ''),
      planos: formNovo.planos,
      creditos_avulso: formNovo.creditos_avulso,
      bloqueado: false,
    })
    if (error) {
      setErroCriar('Erro ao cadastrar. Verifique os dados.')
    } else {
      setNovoCliente(false)
      setFormNovo({ nome: '', email: '', telefone: '', cpf: '', planos: ['wellhub'], creditos_avulso: 0 })
      buscarClientes()
    }
    setCriando(false)
  }

  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + semanaOffset * 7 + i)
    return d
  })

  useEffect(() => {
    if (aba === 'agendar') carregarHorariosAgendar()
  }, [aba, diaSel, semanaOffset])

  async function carregarHorariosAgendar() {
    const dataSel = diasSemana[diaSel]
    const diaSemNum = dataSel.getDay()
    const dataStr = dataSel.toISOString().split('T')[0]

    const [{ data: hors }, { data: ags }] = await Promise.all([
      supabase.from('coach_horarios').select('hora').eq('dia_semana', diaSemNum).eq('ativo', true),
      supabase.from('agendamentos').select('horario').eq('data', dataStr).neq('status', 'cancelado'),
    ])

    const porHora: Record<string, number> = {}
    for (const h of (hors || [])) {
      const hora = (h.hora || '').slice(0, 5)
      porHora[hora] = (porHora[hora] || 0) + 1
    }
    const ocupados: Record<string, number> = {}
    for (const a of (ags || [])) {
      const hora = (a.horario || '').slice(0, 5)
      ocupados[hora] = (ocupados[hora] || 0) + 1
    }

    const resultado = Object.entries(porHora).map(([hora, total]) => ({
      hora,
      total,
      ocupados: ocupados[hora] || 0,
      livres: total - (ocupados[hora] || 0),
    })).sort((a, b) => a.hora.localeCompare(b.hora))

    setHorariosSel(resultado)
  }

  async function confirmarAgendamento() {
    if (!horarioEscolhido || !tipoCredito) { setErroAgendar('Selecione o horário e o tipo de crédito.'); return }
    setAgendando(true)
    setErroAgendar('')
    const dataStr = diasSemana[diaSel].toISOString().split('T')[0]

    const { error } = await supabase.from('agendamentos').insert({
      cliente_id: clienteSel.id,
      data: dataStr,
      horario: horarioEscolhido + ':00',
      status: 'agendado',
      tipo_credito: tipoCredito,
    })

    if (error) {
      setErroAgendar('Erro ao agendar. Tente novamente.')
    } else {
      setSucessoAgendar(true)
      setHorarioEscolhido('')
      setTipoCredito('')
      carregarHorariosAgendar()
      await carregarCreditos(clienteSel)
    }
    setAgendando(false)
  }

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    agendado:   { label: 'Agendado',   color: 'bg-blue-100 text-blue-700',   icon: Clock },
    confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
    realizado:  { label: 'Realizado',  color: 'bg-gray-100 text-gray-600',   icon: CheckCircle2 },
    cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600',     icon: XCircle },
    falta:      { label: 'Falta',      color: 'bg-orange-100 text-orange-700', icon: XCircle },
  }

  const planoConfig: Record<string, { label: string; cor: string; bg: string }> = {
    wellhub:   { label: 'Wellhub Diamond', cor: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
    totalpass: { label: 'TotalPass TP6',   cor: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
    avulso:    { label: 'Avulso Coach CT', cor: 'text-pink-700',   bg: 'bg-pink-50 border-pink-200' },
  }

  const hoje = new Date().toISOString().split('T')[0]
  const historicoFuturo = historico.filter(a => a.data >= hoje && a.status !== 'cancelado')
  const historicoPassado = historico.filter(a => a.data < hoje || a.status === 'cancelado')

  if (loading || !perfil) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {clienteSel && (
            <button onClick={() => setClienteSel(null)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          )}
          <div>
            <div className="font-bold text-gray-900 text-sm">● COACH CT</div>
            <div className="text-xs text-gray-400">{clienteSel ? clienteSel.nome : 'Clientes'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!clienteSel && (
            <button onClick={() => setNovoCliente(true)} className="btn btn-sm gap-1 bg-primary-600 text-white hover:bg-primary-700">
              <Plus size={14} /> Novo
            </button>
          )}
          <button onClick={() => router.push('/recepcao/agenda')} className="btn btn-sm text-gray-500">Agenda</button>
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }} className="btn btn-sm text-gray-500">Sair</button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5">

        {/* LISTA */}
        {!clienteSel && (
          <>
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-3 text-gray-400" />
              <input
                className="input pl-9 w-full"
                placeholder="Buscar por nome, CPF ou email..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>

            {loadingClientes ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : clientes.length === 0 ? (
              <div className="card text-center py-12 text-gray-400 text-sm">Nenhum cliente encontrado.</div>
            ) : (
              <div className="space-y-2">
                {clientes.map(c => {
                  const planos = c.planos || ['wellhub']
                  return (
                    <div key={c.id} onClick={() => abrirCliente(c)}
                      className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-all">
                      <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-800 text-sm font-bold flex items-center justify-center flex-shrink-0">
                        {c.nome?.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{c.nome}</span>
                          {c.bloqueado && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Bloqueado</span>}
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {planos.map((p: string) => (
                            <span key={p} className={`text-xs px-2 py-0.5 rounded-full border ${planoConfig[p]?.bg} ${planoConfig[p]?.cor}`}>
                              {planoConfig[p]?.label || p}
                            </span>
                          ))}
                          {(c.creditos_avulso || 0) > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full border bg-pink-50 border-pink-200 text-pink-700">
                              {c.creditos_avulso} avulso{c.creditos_avulso !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* PERFIL */}
        {clienteSel && (
          <>
            {/* Alerta bloqueado */}
            {clienteSel.bloqueado && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-red-700">Cliente bloqueado</div>
                  <div className="text-xs text-red-500">{clienteSel.motivo_bloqueio}</div>
                </div>
                <button onClick={desbloquear} className="btn btn-sm gap-1 text-green-600 hover:bg-green-50">
                  <Unlock size={12} /> Desbloquear
                </button>
              </div>
            )}

            {/* Cards de crédito */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {Object.entries(creditos).map(([plano, info]) => {
                const restante = info.limite - info.usado
                const pct = Math.round((info.usado / info.limite) * 100)
                const cfg = planoConfig[plano]
                return (
                  <div key={plano} className={`rounded-2xl border p-4 ${cfg?.bg}`}>
                    <div className={`text-xs font-semibold mb-1 ${cfg?.cor}`}>{cfg?.label || plano}</div>
                    <div className="flex items-end gap-1">
                      <span className={`text-3xl font-bold ${cfg?.cor}`}>{restante}</span>
                      <span className="text-xs text-gray-400 mb-1">/ {info.limite}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">sessões restantes</div>
                    <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        plano === 'wellhub' ? 'bg-purple-400' :
                        plano === 'totalpass' ? 'bg-blue-400' : 'bg-pink-400'
                      }`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{info.usado} usadas este mês</div>
                  </div>
                )
              })}
            </div>

            {/* Abas */}
            <div className="flex gap-2 mb-5">
              {[
                { key: 'dados', label: 'Dados' },
                { key: 'historico', label: 'Histórico' },
                { key: 'agendar', label: '+ Agendar' },
              ].map(a => (
                <button key={a.key}
                  onClick={() => { setAba(a.key as any); if (a.key === 'historico') carregarHistorico(clienteSel.id) }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    aba === a.key ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
                  }`}>
                  {a.label}
                </button>
              ))}
            </div>

            {/* ABA DADOS */}
            {aba === 'dados' && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-gray-900">Dados do cliente</div>
                  {!editando ? (
                    <button onClick={() => setEditando(true)} className="btn btn-sm text-primary-600">Editar</button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => { setEditando(false); setForm(clienteSel) }} className="btn btn-sm text-gray-500">Cancelar</button>
                      <button onClick={salvarEdicao} disabled={salvando} className="btn btn-sm gap-1 bg-primary-600 text-white">
                        <Check size={12} /> {salvando ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {[
                    { label: 'Nome', key: 'nome', type: 'text' },
                    { label: 'Email', key: 'email', type: 'email' },
                    { label: 'Telefone', key: 'telefone', type: 'text' },
                    { label: 'CPF', key: 'cpf', type: 'text' },
                  ].map(f => (
                    <div key={f.key}>
                      <div className="text-xs text-gray-400 mb-1">{f.label}</div>
                      {editando ? (
                        <input type={f.type} className="input w-full" value={form[f.key] || ''}
                          onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                      ) : (
                        <div className="text-sm text-gray-900">{clienteSel[f.key] || '—'}</div>
                      )}
                    </div>
                  ))}

                  <div>
                    <div className="text-xs text-gray-400 mb-2">Planos</div>
                    {editando ? (
                      <div className="flex flex-col gap-2">
                        {['wellhub', 'totalpass'].map(p => (
                          <label key={p} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={(form.planos || []).includes(p)}
                              onChange={e => {
                                const atual = form.planos || []
                                setForm({ ...form, planos: e.target.checked ? [...atual, p] : atual.filter((x: string) => x !== p) })
                              }}
                              className="w-4 h-4 accent-primary-600" />
                            <span className="text-sm text-gray-700">{planoConfig[p].label}</span>
                          </label>
                        ))}
                        <div className="mt-1">
                          <div className="text-xs text-gray-400 mb-1">Créditos avulsos</div>
                          <input type="number" min={0} className="input w-24" value={form.creditos_avulso || 0}
                            onChange={e => setForm({ ...form, creditos_avulso: parseInt(e.target.value) || 0 })} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        {(clienteSel.planos || ['wellhub']).map((p: string) => (
                          <span key={p} className={`text-xs px-2.5 py-1 rounded-full border ${planoConfig[p]?.bg} ${planoConfig[p]?.cor}`}>
                            {planoConfig[p]?.label}
                          </span>
                        ))}
                        {(clienteSel.creditos_avulso || 0) > 0 && (
                          <span className="text-xs px-2.5 py-1 rounded-full border bg-pink-50 border-pink-200 text-pink-700">
                            {clienteSel.creditos_avulso} avulso{clienteSel.creditos_avulso !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ABA HISTÓRICO */}
            {aba === 'historico' && (
              <div className="space-y-5">
                {/* Próximos */}
                {historicoFuturo.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Próximos agendamentos</div>
                    <div className="space-y-2">
                      {historicoFuturo.map(ag => {
                        const Ic = statusConfig[ag.status]?.icon || Clock
                        return (
                          <div key={ag.id} className="card flex items-center gap-3 border-l-4 border-l-blue-400">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-900">
                                  {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
                                </span>
                                <span className="font-mono text-xs text-gray-500">{(ag.horario || '').slice(0, 5)}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>
                                  {statusConfig[ag.status]?.label}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">{planoConfig[ag.tipo_credito]?.label || ag.tipo_credito}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Passados */}
                {historicoPassado.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Histórico</div>
                    <div className="space-y-2">
                      {historicoPassado.map(ag => (
                        <div key={ag.id} className={`card flex items-center gap-3 border-l-4 ${
                          ag.status === 'realizado' ? 'border-l-gray-300' :
                          ag.status === 'falta' ? 'border-l-orange-400' :
                          ag.status === 'cancelado' ? 'border-l-red-300' : 'border-l-gray-200'
                        }`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-700">
                                {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
                              </span>
                              <span className="font-mono text-xs text-gray-400">{(ag.horario || '').slice(0, 5)}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>
                                {statusConfig[ag.status]?.label}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">{planoConfig[ag.tipo_credito]?.label || ag.tipo_credito}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {historico.length === 0 && (
                  <div className="card text-center py-12 text-gray-400 text-sm">Nenhum agendamento encontrado.</div>
                )}
              </div>
            )}

            {/* ABA AGENDAR */}
            {aba === 'agendar' && (
              <div>
                {sucessoAgendar && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-green-700 text-sm">
                    <Check size={16} /> Agendamento realizado com sucesso!
                  </div>
                )}

                <div className="card mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => { setSemanaOffset(o => Math.max(0, o - 1)); setDiaSel(0) }}
                      disabled={semanaOffset === 0}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-30">‹</button>
                    <div className="flex gap-1 flex-1">
                      {diasSemana.map((d, i) => (
                        <button key={i} onClick={() => { setDiaSel(i); setSucessoAgendar(false); setHorarioEscolhido('') }}
                          className={`flex-1 py-2 rounded-lg text-center transition-all ${
                            i === diaSel ? 'bg-primary-600 text-white' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:border-primary-300'
                          }`}>
                          <div className="text-xs font-medium">{DIAS_SEMANA[d.getDay()]}</div>
                          <div className="text-sm font-bold">{d.getDate()}</div>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setSemanaOffset(o => Math.min(3, o + 1)); setDiaSel(0) }}
                      disabled={semanaOffset === 3}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-30">›</button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {horariosSel.map(h => (
                      <button key={h.hora}
                        onClick={() => { if (h.livres > 0) { setHorarioEscolhido(h.hora); setSucessoAgendar(false) } }}
                        disabled={h.livres === 0}
                        className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                          horarioEscolhido === h.hora ? 'bg-primary-600 text-white border-primary-600' :
                          h.livres === 0 ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' :
                          'bg-white border-gray-200 text-gray-700 hover:border-primary-400'
                        }`}>
                        <div>{h.hora}</div>
                        <div className="text-xs opacity-70">{h.livres === 0 ? 'Lotado' : `${h.livres} vaga${h.livres !== 1 ? 's' : ''}`}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {horarioEscolhido && (
                  <div className="card mb-4">
                    <div className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Tipo de crédito</div>
                    <div className="space-y-2">
                      {[
                        ...(clienteSel.planos || ['wellhub']),
                        ...((clienteSel.creditos_avulso || 0) > 0 ? ['avulso'] : [])
                      ].map((p: string) => {
                        const info = creditos[p]
                        const semSaldo = info ? (info.limite - info.usado) <= 0 : false
                        return (
                          <div key={p} onClick={() => !semSaldo && setTipoCredito(p)}
                            className={`border rounded-xl p-3 flex items-center gap-3 transition-all ${
                              semSaldo ? 'opacity-40 cursor-not-allowed border-gray-100' :
                              tipoCredito === p ? `border-primary-400 ${planoConfig[p]?.bg} cursor-pointer` :
                              'border-gray-200 hover:border-primary-200 cursor-pointer'
                            }`}>
                            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                              tipoCredito === p ? 'border-primary-600 bg-primary-600' : 'border-gray-300'
                            }`} />
                            <div className="flex-1">
                              <span className={`text-sm font-medium ${planoConfig[p]?.cor}`}>{planoConfig[p]?.label || p}</span>
                              {info && <span className="text-xs text-gray-400 ml-2">{info.limite - info.usado} restantes</span>}
                            </div>
                            {semSaldo && <span className="text-xs text-red-500">Sem saldo</span>}
                          </div>
                        )
                      })}
                    </div>

                    {erroAgendar && <div className="mt-3 text-sm text-red-600">{erroAgendar}</div>}

                    <button onClick={confirmarAgendamento} disabled={agendando}
                      className="btn w-full mt-4 bg-primary-600 text-white hover:bg-primary-700 font-medium">
                      <Calendar size={14} className="mr-2" />
                      {agendando ? 'Agendando...' : `Confirmar às ${horarioEscolhido}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal novo cliente */}
      {novoCliente && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-gray-900">Novo cliente</div>
              <button onClick={() => setNovoCliente(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Nome completo', key: 'nome', type: 'text' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'Telefone', key: 'telefone', type: 'text' },
                { label: 'CPF', key: 'cpf', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <input type={f.type} className="input w-full"
                    value={formNovo[f.key as keyof typeof formNovo] as string}
                    onChange={e => setFormNovo({ ...formNovo, [f.key]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Planos</label>
                {['wellhub', 'totalpass'].map(p => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer mb-1">
                    <input type="checkbox" checked={formNovo.planos.includes(p)}
                      onChange={e => setFormNovo({
                        ...formNovo,
                        planos: e.target.checked ? [...formNovo.planos, p] : formNovo.planos.filter(x => x !== p)
                      })}
                      className="w-4 h-4 accent-primary-600" />
                    <span className="text-sm text-gray-700">{planoConfig[p].label}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Créditos avulsos</label>
                <input type="number" min={0} className="input w-24"
                  value={formNovo.creditos_avulso}
                  onChange={e => setFormNovo({ ...formNovo, creditos_avulso: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            {erroCriar && <div className="mt-3 text-sm text-red-600">{erroCriar}</div>}

            <div className="flex gap-2 mt-5">
              <button onClick={() => setNovoCliente(false)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={criarCliente} disabled={criando} className="btn flex-1 bg-primary-600 text-white">
                {criando ? 'Cadastrando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
