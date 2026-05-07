'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Search, Plus, ChevronRight, X, Check, Calendar, Unlock, AlertCircle } from 'lucide-react'

const HORARIOS = [
  '05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00',
  '12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00',
  '19:30','20:00'
]

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function RecepcaoClientesPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [clienteSel, setClienteSel] = useState<any>(null)
  const [aba, setAba] = useState<'dados' | 'historico' | 'agendar'>('dados')

  // Edição
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)

  // Histórico
  const [historico, setHistorico] = useState<any[]>([])

  // Agendamento avulso
  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [horariosSel, setHorariosSel] = useState<any[]>([])
  const [horarioEscolhido, setHorarioEscolhido] = useState('')
  const [tipoCredito, setTipoCredito] = useState('')
  const [agendando, setAgendando] = useState(false)
  const [erroAgendar, setErroAgendar] = useState('')
  const [sucessoAgendar, setSucessoAgendar] = useState(false)

  // Novo cliente
  const [novoCliente, setNovoCliente] = useState(false)
  const [formNovo, setFormNovo] = useState({ nome: '', email: '', telefone: '', cpf: '', plano: 'wellhub' })
  const [criando, setCriando] = useState(false)
  const [erroCriar, setErroCriar] = useState('')

  useEffect(() => {
    if (!loading && perfil?.role !== ('recepcao' as any) && perfil?.role !== 'admin') {
      router.push('/')
    }
  }, [perfil, loading])

  useEffect(() => {
    buscarClientes()
  }, [busca])

  async function buscarClientes() {
    setLoadingClientes(true)
    let query = supabase
      .from('clientes')
      .select('*')
      .order('nome')
      .limit(50)

    if (busca.trim()) {
      query = query.or(`nome.ilike.%${busca}%,cpf.ilike.%${busca}%,email.ilike.%${busca}%`)
    }

    const { data } = await query
    setClientes(data || [])
    setLoadingClientes(false)
  }

  async function abrirCliente(cliente: any) {
    setClienteSel(cliente)
    setForm(cliente)
    setEditando(false)
    setAba('dados')
    setHistorico([])
    setSucessoAgendar(false)
    setErroAgendar('')
    setHorarioEscolhido('')
    setTipoCredito('')
  }

  async function carregarHistorico(clienteId: string) {
    const { data } = await supabase
      .from('agendamentos')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('data', { ascending: false })
      .limit(20)
    setHistorico(data || [])
  }

  async function salvarEdicao() {
    setSalvando(true)
    const { error } = await supabase
      .from('clientes')
      .update({
        nome: form.nome,
        email: form.email,
        telefone: form.telefone,
        cpf: form.cpf,
        plano: form.plano,
      })
      .eq('id', clienteSel.id)

    if (!error) {
      setClienteSel({ ...clienteSel, ...form })
      setEditando(false)
      buscarClientes()
    }
    setSalvando(false)
  }

  async function desbloquear() {
    if (!confirm('Desbloquear este cliente?')) return
    await supabase
      .from('clientes')
      .update({ bloqueado: false, motivo_bloqueio: null })
      .eq('id', clienteSel.id)
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
      plano: formNovo.plano,
      bloqueado: false,
    })
    if (error) {
      setErroCriar('Erro ao cadastrar. Verifique os dados.')
    } else {
      setNovoCliente(false)
      setFormNovo({ nome: '', email: '', telefone: '', cpf: '', plano: 'wellhub' })
      buscarClientes()
    }
    setCriando(false)
  }

  // Agendamento avulso
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
    if (!horarioEscolhido || !tipoCredito) {
      setErroAgendar('Selecione o horário e o tipo de crédito.')
      return
    }
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
    }
    setAgendando(false)
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    agendado:   { label: 'Agendado',   color: 'bg-blue-100 text-blue-700' },
    confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
    realizado:  { label: 'Realizado',  color: 'bg-gray-100 text-gray-600' },
    cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600' },
    falta:      { label: 'Falta',      color: 'bg-orange-100 text-orange-700' },
  }

  if (loading) return (
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
            <button
              onClick={() => setNovoCliente(true)}
              className="btn btn-sm gap-1 bg-primary-600 text-white hover:bg-primary-700"
            >
              <Plus size={14} /> Novo cliente
            </button>
          )}
          <button onClick={() => router.push('/recepcao/agenda')} className="btn btn-sm text-gray-500">
            Agenda
          </button>
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }} className="btn btn-sm text-gray-500">
            Sair
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5">

        {/* LISTA DE CLIENTES */}
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
              <div className="card text-center py-12 text-gray-400 text-sm">
                Nenhum cliente encontrado.
              </div>
            ) : (
              <div className="space-y-2">
                {clientes.map(c => (
                  <div
                    key={c.id}
                    onClick={() => abrirCliente(c)}
                    className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-800 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {c.nome?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{c.nome}</span>
                        {c.bloqueado && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">Bloqueado</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {c.plano} · {c.email || c.telefone || 'sem contato'}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* PERFIL DO CLIENTE */}
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

            {/* Abas do perfil */}
            <div className="flex gap-2 mb-5">
              {[
                { key: 'dados', label: 'Dados' },
                { key: 'historico', label: 'Histórico' },
                { key: 'agendar', label: '+ Agendar' },
              ].map(a => (
                <button
                  key={a.key}
                  onClick={() => {
                    setAba(a.key as any)
                    if (a.key === 'historico') carregarHistorico(clienteSel.id)
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    aba === a.key
                      ? 'bg-primary-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
                  }`}
                >
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
                    <button onClick={() => setEditando(true)} className="btn btn-sm text-primary-600">
                      Editar
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => { setEditando(false); setForm(clienteSel) }} className="btn btn-sm text-gray-500">
                        Cancelar
                      </button>
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
                        <input
                          type={f.type}
                          className="input w-full"
                          value={form[f.key] || ''}
                          onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        />
                      ) : (
                        <div className="text-sm text-gray-900">{clienteSel[f.key] || '—'}</div>
                      )}
                    </div>
                  ))}

                  <div>
                    <div className="text-xs text-gray-400 mb-1">Plano</div>
                    {editando ? (
                      <select
                        className="input w-full"
                        value={form.plano || ''}
                        onChange={e => setForm({ ...form, plano: e.target.value })}
                      >
                        <option value="wellhub">Wellhub Diamond</option>
                        <option value="totalpass">TotalPass TP6</option>
                        <option value="avulso">Avulso Coach CT</option>
                      </select>
                    ) : (
                      <div className="text-sm text-gray-900 capitalize">{clienteSel.plano || '—'}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ABA HISTÓRICO */}
            {aba === 'historico' && (
              <div>
                {historico.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">
                    Nenhum agendamento encontrado.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historico.map(ag => (
                      <div key={ag.id} className="card flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', {
                                weekday: 'short', day: 'numeric', month: 'short'
                              })}
                            </span>
                            <span className="font-mono text-xs text-gray-500">{(ag.horario || '').slice(0, 5)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>
                              {statusConfig[ag.status]?.label}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{ag.tipo_credito}</div>
                        </div>
                      </div>
                    ))}
                  </div>
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

                {/* Calendário */}
                <div className="card mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => { setSemanaOffset(o => Math.max(0, o - 1)); setDiaSel(0) }}
                      disabled={semanaOffset === 0}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-30"
                    >‹</button>
                    <div className="flex gap-1 flex-1">
                      {diasSemana.map((d, i) => (
                        <button
                          key={i}
                          onClick={() => { setDiaSel(i); setSucessoAgendar(false); setHorarioEscolhido('') }}
                          className={`flex-1 py-2 rounded-lg text-center transition-all ${
                            i === diaSel
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-50 border border-gray-200 text-gray-600 hover:border-primary-300'
                          }`}
                        >
                          <div className="text-xs font-medium">{DIAS_SEMANA[d.getDay()]}</div>
                          <div className="text-sm font-bold">{d.getDate()}</div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => { setSemanaOffset(o => Math.min(3, o + 1)); setDiaSel(0) }}
                      disabled={semanaOffset === 3}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-30"
                    >›</button>
                  </div>

                  {/* Horários */}
                  <div className="grid grid-cols-3 gap-2">
                    {horariosSel.map(h => (
                      <button
                        key={h.hora}
                        onClick={() => { if (h.livres > 0) { setHorarioEscolhido(h.hora); setSucessoAgendar(false) } }}
                        disabled={h.livres === 0}
                        className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                          horarioEscolhido === h.hora
                            ? 'bg-primary-600 text-white border-primary-600'
                            : h.livres === 0
                            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-primary-400'
                        }`}
                      >
                        <div>{h.hora}</div>
                        <div className="text-xs opacity-70">{h.livres === 0 ? 'Lotado' : `${h.livres} vaga${h.livres !== 1 ? 's' : ''}`}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tipo de crédito */}
                {horarioEscolhido && (
                  <div className="card mb-4">
                    <div className="text-xs text-gray-400 mb-3 uppercase tracking-wide">Tipo de crédito</div>
                    <div className="space-y-2">
                      {[
                        { key: 'wellhub', label: 'Wellhub Diamond' },
                        { key: 'totalpass', label: 'TotalPass TP6' },
                        { key: 'avulso', label: 'Avulso Coach CT' },
                      ].map(p => (
                        <div
                          key={p.key}
                          onClick={() => setTipoCredito(p.key)}
                          className={`border rounded-xl p-3 cursor-pointer flex items-center gap-3 transition-all ${
                            tipoCredito === p.key
                              ? 'border-primary-400 bg-primary-50'
                              : 'border-gray-200 hover:border-primary-200'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                            tipoCredito === p.key ? 'border-primary-600 bg-primary-600' : 'border-gray-300'
                          }`} />
                          <span className="text-sm font-medium text-gray-800">{p.label}</span>
                        </div>
                      ))}
                    </div>

                    {erroAgendar && (
                      <div className="mt-3 text-sm text-red-600">{erroAgendar}</div>
                    )}

                    <button
                      onClick={confirmarAgendamento}
                      disabled={agendando}
                      className="btn w-full mt-4 bg-primary-600 text-white hover:bg-primary-700 font-medium"
                    >
                      <Calendar size={14} className="mr-2" />
                      {agendando ? 'Agendando...' : `Confirmar agendamento às ${horarioEscolhido}`}
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
              <button onClick={() => setNovoCliente(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
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
                  <input
                    type={f.type}
                    className="input w-full"
                    value={formNovo[f.key as keyof typeof formNovo]}
                    onChange={e => setFormNovo({ ...formNovo, [f.key]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Plano</label>
                <select
                  className="input w-full"
                  value={formNovo.plano}
                  onChange={e => setFormNovo({ ...formNovo, plano: e.target.value })}
                >
                  <option value="wellhub">Wellhub Diamond</option>
                  <option value="totalpass">TotalPass TP6</option>
                  <option value="avulso">Avulso Coach CT</option>
                </select>
              </div>
            </div>

            {erroCriar && (
              <div className="mt-3 text-sm text-red-600">{erroCriar}</div>
            )}

            <div className="flex gap-2 mt-5">
              <button onClick={() => setNovoCliente(false)} className="btn flex-1 text-gray-500 border border-gray-200">
                Cancelar
              </button>
              <button onClick={criarCliente} disabled={criando} className="btn flex-2 flex-1 bg-primary-600 text-white">
                {criando ? 'Cadastrando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
