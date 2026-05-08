'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Search, Plus, ChevronRight, X, Check, Calendar, Unlock, AlertCircle } from 'lucide-react'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const LIMITE_PLANO: Record<string, number> = {
  wellhub: 8,
  totalpass: 10,
}

const planoConfig: Record<string, { label: string; cor: string; bg: string; barra: string }> = {
  wellhub:   { label: 'Wellhub Diamond', cor: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', barra: 'bg-purple-400' },
  totalpass: { label: 'TotalPass TP6',   cor: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     barra: 'bg-blue-400' },
  avulso:    { label: 'Avulso Coach CT', cor: 'text-pink-700',   bg: 'bg-pink-50 border-pink-200',     barra: 'bg-pink-400' },
}

const statusConfig: Record<string, { label: string; color: string }> = {
  agendado:   { label: 'Agendado',   color: 'bg-blue-100 text-blue-700' },
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
  realizado:  { label: 'Realizado',  color: 'bg-gray-100 text-gray-600' },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600' },
  falta:      { label: 'Falta',      color: 'bg-orange-100 text-orange-700' },
}

export default function RecepcaoClientesPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [clienteSel, setClienteSel] = useState<any>(null)
  const [aba, setAba] = useState<'dados' | 'planos' | 'agendamentos' | 'historico' | 'agendar'>('dados')

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)

  const [historico, setHistorico] = useState<any[]>([])
  const [saldoMes, setSaldoMes] = useState<Record<string, any>>({})

  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [horariosSel, setHorariosSel] = useState<any[]>([])

  const [modalSlot, setModalSlot] = useState<{ hora: string; data: string } | null>(null)
  const [tipoCredito, setTipoCredito] = useState('')
  const [agendando, setAgendando] = useState(false)
  const [erroModal, setErroModal] = useState('')

  const [novoCliente, setNovoCliente] = useState(false)
  const [formNovo, setFormNovo] = useState({ nome: '', email: '', telefone: '', cpf: '', planos: ['wellhub'], creditos_avulso: 0 })
  const [criando, setCriando] = useState(false)
  const [erroCriar, setErroCriar] = useState('')

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if ((perfil.role as any) !== 'recepcao' && (perfil.role as any) !== 'admin') { router.push('/'); return }
  }, [loading, perfil])

  useEffect(() => {
    if (!perfil) return
    if (busca.trim().length >= 2) {
      buscarClientes()
    } else {
      setClientes([])
    }
  }, [busca])

  async function buscarClientes() {
    setLoadingClientes(true)
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .or(`nome.ilike.%${busca}%,cpf.ilike.%${busca}%,email.ilike.%${busca}%`)
      .order('nome')
      .limit(20)
    setClientes(data || [])
    setLoadingClientes(false)
  }

  async function abrirCliente(cliente: any) {
    setClienteSel(cliente)
    setForm({ ...cliente, planos: cliente.planos || ['wellhub'] })
    setEditando(false)
    setAba('dados')
    setHistorico([])
    setModalSlot(null)
    setTipoCredito('')
    await Promise.all([carregarSaldo(cliente.id), carregarHistorico(cliente.id)])
  }

  async function carregarSaldo(clienteId: string) {
    const agora = new Date()
    const mes = agora.getMonth() + 1
    const ano = agora.getFullYear()

    const { data } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteId,
      p_mes: mes,
      p_ano: ano,
    })
    setSaldoMes(data || {})
  }

  async function carregarHistorico(clienteId: string) {
    const { data } = await supabase
      .from('agendamentos')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('data', { ascending: false })
      .limit(50)
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
      await carregarSaldo(updated.id)
      buscarClientes()
    }
    setSalvando(false)
  }

  async function desbloquear() {
    if (!confirm('Desbloquear este cliente?')) return
    await supabase.from('clientes').update({ bloqueado: false, motivo_bloqueio: null }).eq('id', clienteSel.id)
    setClienteSel({ ...clienteSel, bloqueado: false, motivo_bloqueio: null })
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
      setBusca('')
      setClientes([])
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

    const [{ data: hors }, { data: ags }, { data: bloqueadas }] = await Promise.all([
      supabase.from('coach_horarios').select('hora').eq('dia_semana', diaSemNum).eq('ativo', true),
      supabase.from('agendamentos').select('horario').eq('data', dataStr).neq('status', 'cancelado'),
      supabase.from('vagas_bloqueadas').select('horario, quantidade').eq('data', dataStr).eq('ativo', true),
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
    const bloqueadasMap: Record<string, number> = {}
    for (const b of (bloqueadas || [])) {
      const hora = (b.horario || '').slice(0, 5)
      bloqueadasMap[hora] = (bloqueadasMap[hora] || 0) + (b.quantidade || 1)
    }

    const resultado = Object.entries(porHora).map(([hora, total]) => {
      const bloq = bloqueadasMap[hora] || 0
      const ocup = ocupados[hora] || 0
      return {
        hora, total,
        ocupados: ocup,
        bloqueadas: bloq,
        livres: Math.max(0, total - ocup - bloq),
      }
    }).sort((a, b) => a.hora.localeCompare(b.hora))

    setHorariosSel(resultado)
  }

  async function abrirModal(hora: string) {
    const dataStr = diasSemana[diaSel].toISOString().split('T')[0]

    // Carrega o saldo do mês correto baseado na data selecionada
    const dataObj = diasSemana[diaSel]
    const { data: saldoData } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteSel.id,
      p_mes: dataObj.getMonth() + 1,
      p_ano: dataObj.getFullYear(),
    })
    setSaldoMes(saldoData || {})

    setModalSlot({ hora, data: dataStr })
    setTipoCredito('')
    setErroModal('')
  }

  async function confirmarAgendamento() {
    if (!tipoCredito) { setErroModal('Selecione o tipo de crédito.'); return }
    if (!modalSlot || !clienteSel) return
    setAgendando(true)
    setErroModal('')

    const { error } = await supabase.from('agendamentos').insert({
      cliente_id: clienteSel.id,
      data: modalSlot.data,
      horario: modalSlot.hora + ':00',
      status: 'agendado',
      tipo_credito: tipoCredito,
    })

    if (error) {
      setErroModal('Erro ao agendar. Tente novamente.')
      setAgendando(false)
      return
    }

    setModalSlot(null)
    setAgendando(false)
    await Promise.all([carregarSaldo(clienteSel.id), carregarHistorico(clienteSel.id)])
    setAba('agendamentos')
  }

  const hoje = new Date().toISOString().split('T')[0]
  const agendamentosFuturos = historico
    .filter(a => a.data >= hoje && ['agendado','confirmado'].includes(a.status))
    .sort((a, b) => a.data.localeCompare(b.data))
  const agendamentosPassados = historico
    .filter(a => a.data < hoje || ['realizado','falta','cancelado'].includes(a.status))
    .sort((a, b) => b.data.localeCompare(a.data))

  const abas = [
    { key: 'dados', label: 'Dados' },
    { key: 'planos', label: 'Planos' },
    { key: 'agendamentos', label: `Agenda${agendamentosFuturos.length > 0 ? ` (${agendamentosFuturos.length})` : ''}` },
    { key: 'historico', label: 'Histórico' },
    { key: 'agendar', label: '+ Agendar' },
  ]

  if (loading || !perfil) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {clienteSel && (
            <button onClick={() => { setClienteSel(null); setBusca(''); setClientes([]) }} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          )}
          <div>
            <div className="text-base font-semibold text-gray-900">
              {clienteSel ? clienteSel.nome : 'Clientes'}
            </div>
            {!clienteSel && (
              <div className="text-xs text-gray-400">Digite para buscar</div>
            )}
          </div>
        </div>
        {!clienteSel && (
          <button onClick={() => setNovoCliente(true)} className="btn btn-sm gap-1 bg-primary-600 text-white hover:bg-primary-700">
            <Plus size={14} /> Novo
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5">

        {!clienteSel && (
          <>
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-3 text-gray-400" />
              <input
                className="input pl-9 w-full"
                placeholder="Buscar por nome, CPF ou email..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                autoFocus
              />
            </div>

            {busca.trim().length < 2 ? (
              <div className="text-center py-16">
                <Search size={32} className="mx-auto text-gray-200 mb-3" />
                <div className="text-sm text-gray-400">Digite ao menos 2 caracteres para buscar</div>
              </div>
            ) : loadingClientes ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : clientes.length === 0 ? (
              <div className="card text-center py-12 text-gray-400 text-sm">
                Nenhum cliente encontrado para "{busca}".
                <br />
                <button onClick={() => setNovoCliente(true)} className="mt-3 text-primary-600 text-sm font-medium">
                  + Cadastrar novo cliente
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {clientes.map(c => {
                  const planos = c.planos || ['wellhub']
                  return (
                    <div key={c.id} onClick={() => abrirCliente(c)}
                      className="card flex items-center gap-3 cursor-pointer hover:border-primary-200 transition-all">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-700 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
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

        {clienteSel && (
          <>
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

            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              {abas.map(a => (
                <button key={a.key} onClick={() => setAba(a.key as any)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    aba === a.key ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
                  }`}>
                  {a.label}
                </button>
              ))}
            </div>

            {aba === 'dados' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-5 text-white flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-white/20 text-white text-xl font-bold flex items-center justify-center flex-shrink-0">
                    {clienteSel.nome?.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-lg leading-tight">{clienteSel.nome}</div>
                    <div className="text-primary-200 text-sm mt-0.5">{clienteSel.email || '—'}</div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {(clienteSel.planos || ['wellhub']).map((p: string) => (
                        <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white">{planoConfig[p]?.label}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-gray-900">Informações</div>
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
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Nome', key: 'nome', type: 'text', full: true },
                      { label: 'Email', key: 'email', type: 'email', full: true },
                      { label: 'Telefone', key: 'telefone', type: 'text', full: false },
                      { label: 'CPF', key: 'cpf', type: 'text', full: false },
                    ].map(f => (
                      <div key={f.key} className={f.full ? 'col-span-2' : ''}>
                        <div className="text-xs text-gray-400 mb-1">{f.label}</div>
                        {editando ? (
                          <input type={f.type} className="input w-full" value={form[f.key] || ''}
                            onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{clienteSel[f.key] || '—'}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {aba === 'planos' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(saldoMes).map(([plano, info]: [string, any]) => {
                    const restante = info.disponivel
                    const pct = info.total > 0 ? Math.round((info.usado / info.total) * 100) : 0
                    const cfg = planoConfig[plano]
                    return (
                      <div key={plano} className={`rounded-2xl border p-4 ${cfg?.bg || 'bg-gray-50 border-gray-200'}`}>
                        <div className={`text-xs font-semibold mb-2 ${cfg?.cor || 'text-gray-700'}`}>{cfg?.label || plano}</div>
                        <div className="flex items-end gap-1">
                          <span className={`text-4xl font-bold ${cfg?.cor || 'text-gray-700'}`}>{restante}</span>
                          <span className="text-xs text-gray-400 mb-1">/ {info.total}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">sessões restantes</div>
                        <div className="mt-3 h-2 bg-white rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${cfg?.barra || 'bg-gray-400'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{info.usado} usadas este mês</div>
                      </div>
                    )
                  })}
                </div>

                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-gray-900">Planos ativos</div>
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
                  {editando ? (
                    <div className="space-y-3">
                      {['wellhub', 'totalpass'].map(p => (
                        <label key={p} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          (form.planos || []).includes(p) ? `${planoConfig[p].bg}` : 'border-gray-200'
                        }`}>
                          <input type="checkbox" checked={(form.planos || []).includes(p)}
                            onChange={e => {
                              const atual = form.planos || []
                              setForm({ ...form, planos: e.target.checked ? [...atual, p] : atual.filter((x: string) => x !== p) })
                            }}
                            className="w-4 h-4 accent-primary-600" />
                          <span className={`text-sm font-medium ${planoConfig[p].cor}`}>{planoConfig[p].label}</span>
                          <span className="text-xs text-gray-400 ml-auto">{LIMITE_PLANO[p]} sessões/mês</span>
                        </label>
                      ))}
                      <div className="pt-2 border-t border-gray-100">
                        <div className="text-xs text-gray-400 mb-2">Créditos avulsos</div>
                        <input type="number" min={0} className="input w-28"
                          value={form.creditos_avulso || 0}
                          onChange={e => setForm({ ...form, creditos_avulso: parseInt(e.target.value) || 0 })} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(clienteSel.planos || ['wellhub']).map((p: string) => (
                        <div key={p} className={`flex items-center justify-between p-3 rounded-xl border ${planoConfig[p]?.bg}`}>
                          <span className={`text-sm font-medium ${planoConfig[p]?.cor}`}>{planoConfig[p]?.label}</span>
                          <span className="text-xs text-gray-500">{LIMITE_PLANO[p]} sessões/mês</span>
                        </div>
                      ))}
                      {(clienteSel.creditos_avulso || 0) > 0 && (
                        <div className="flex items-center justify-between p-3 rounded-xl border bg-pink-50 border-pink-200">
                          <span className="text-sm font-medium text-pink-700">Avulso Coach CT</span>
                          <span className="text-xs text-gray-500">{clienteSel.creditos_avulso} crédito{clienteSel.creditos_avulso !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {aba === 'agendamentos' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-gray-900">Próximos agendamentos</div>
                  <button onClick={() => setAba('agendar')} className="btn btn-sm gap-1 bg-primary-600 text-white">
                    <Plus size={12} /> Agendar
                  </button>
                </div>
                {agendamentosFuturos.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">
                    Nenhum agendamento futuro.
                    <br />
                    <button onClick={() => setAba('agendar')} className="mt-3 text-primary-600 text-sm font-medium">
                      + Fazer agendamento
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {agendamentosFuturos.map(ag => (
                      <div key={ag.id} className="card border-l-4 border-l-blue-400">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex flex-col items-center justify-center flex-shrink-0">
                            <div className="text-sm font-bold text-blue-700 leading-none">
                              {new Date(ag.data + 'T12:00:00').getDate()}
                            </div>
                            <div className="text-xs text-blue-500 uppercase">
                              {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900 capitalize">
                                {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
                              </span>
                              <span className="font-mono text-xs text-gray-500">{(ag.horario || '').slice(0,5)}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>
                                {statusConfig[ag.status]?.label}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">{planoConfig[ag.tipo_credito]?.label || ag.tipo_credito}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aba === 'historico' && (
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-4">Histórico de treinos</div>
                {agendamentosPassados.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">Nenhum histórico encontrado.</div>
                ) : (
                  <div className="space-y-2">
                    {agendamentosPassados.map(ag => (
                      <div key={ag.id} className={`card flex items-center gap-3 border-l-4 ${
                        ag.status === 'realizado' ? 'border-l-green-400' :
                        ag.status === 'falta' ? 'border-l-orange-400' : 'border-l-gray-200'
                      }`}>
                        <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                          ag.status === 'realizado' ? 'bg-green-50' :
                          ag.status === 'falta' ? 'bg-orange-50' : 'bg-gray-50'
                        }`}>
                          <div className={`text-sm font-bold leading-none ${
                            ag.status === 'realizado' ? 'text-green-700' :
                            ag.status === 'falta' ? 'text-orange-700' : 'text-gray-500'
                          }`}>
                            {new Date(ag.data + 'T12:00:00').getDate()}
                          </div>
                          <div className={`text-xs uppercase ${
                            ag.status === 'realizado' ? 'text-green-500' :
                            ag.status === 'falta' ? 'text-orange-500' : 'text-gray-400'
                          }`}>
                            {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-700 capitalize">
                              {new Date(ag.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
                            </span>
                            <span className="font-mono text-xs text-gray-400">{(ag.horario || '').slice(0,5)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>
                              {statusConfig[ag.status]?.label}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{planoConfig[ag.tipo_credito]?.label || ag.tipo_credito}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aba === 'agendar' && (
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-4">Escolha o dia e horário</div>
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => { setSemanaOffset(o => Math.max(0, o - 1)); setDiaSel(0) }}
                      disabled={semanaOffset === 0}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-30">‹</button>
                    <div className="flex gap-1 flex-1">
                      {diasSemana.map((d, i) => (
                        <button key={i} onClick={() => setDiaSel(i)}
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
                    {horariosSel.length === 0 && (
                      <div className="col-span-3 text-center py-6 text-gray-400 text-sm">Nenhum horário disponível.</div>
                    )}
                    {horariosSel.map(h => (
                      <button key={h.hora}
                        onClick={() => h.livres > 0 && abrirModal(h.hora)}
                        disabled={h.livres === 0}
                        className={`py-3 px-3 rounded-xl text-sm font-medium border transition-all ${
                          h.livres === 0
                            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-primary-400 hover:bg-primary-50 active:scale-95'
                        }`}>
                        <div className="font-bold">{h.hora}</div>
                        <div className="text-xs opacity-70 mt-0.5">
                          {h.livres === 0 ? 'Lotado' : `${h.livres} vaga${h.livres !== 1 ? 's' : ''}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {modalSlot && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900">Confirmar agendamento</div>
                <div className="text-sm text-gray-400 mt-0.5 capitalize">
                  {new Date(modalSlot.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · {modalSlot.hora}
                </div>
              </div>
              <button onClick={() => setModalSlot(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4">
              <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Usar crédito de</div>
              <div className="space-y-2">
                {Object.keys(saldoMes).length === 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
                    Cliente sem créditos disponíveis para esta data.
                  </div>
                ) : (
                  Object.entries(saldoMes).map(([p, info]: [string, any]) => {
                    const restante = info.disponivel
                    const semSaldo = restante <= 0
                    return (
                      <div key={p} onClick={() => !semSaldo && setTipoCredito(p)}
                        className={`border rounded-xl p-3 flex items-center gap-3 transition-all ${
                          semSaldo ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50' :
                          tipoCredito === p ? `${planoConfig[p]?.bg} border-primary-400 cursor-pointer` :
                          'border-gray-200 hover:border-primary-200 cursor-pointer bg-white'
                        }`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          tipoCredito === p ? 'border-primary-600 bg-primary-600' : 'border-gray-300'
                        }`}>
                          {tipoCredito === p && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1">
                          <div className={`text-sm font-semibold ${planoConfig[p]?.cor}`}>{planoConfig[p]?.label || p}</div>
                          <div className="text-xs text-gray-400">{restante} sessão{restante !== 1 ? 'ões' : ''} restante{restante !== 1 ? 's' : ''}</div>
                        </div>
                        {semSaldo && <span className="text-xs text-red-400 font-medium">Sem saldo</span>}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {erroModal && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">
                {erroModal}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModalSlot(null)} className="btn flex-1 text-gray-500 border border-gray-200">
                Cancelar
              </button>
              <button onClick={confirmarAgendamento} disabled={agendando || !tipoCredito}
                className={`btn flex-1 font-medium transition-all ${
                  tipoCredito ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}>
                <Calendar size={14} className="mr-1.5" />
                {agendando ? 'Confirmando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {novoCliente && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="font-semibold text-gray-900 text-lg">Novo cliente</div>
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
                  <label className="text-xs text-gray-500 mb-1 block font-medium">{f.label}</label>
                  <input type={f.type} className="input w-full"
                    value={formNovo[f.key as keyof typeof formNovo] as string}
                    onChange={e => setFormNovo({ ...formNovo, [f.key]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-2 block font-medium">Planos</label>
                {['wellhub', 'totalpass'].map(p => (
                  <label key={p} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer mb-2 transition-all ${
                    formNovo.planos.includes(p) ? `${planoConfig[p].bg}` : 'border-gray-200'
                  }`}>
                    <input type="checkbox" checked={formNovo.planos.includes(p)}
                      onChange={e => setFormNovo({
                        ...formNovo,
                        planos: e.target.checked ? [...formNovo.planos, p] : formNovo.planos.filter(x => x !== p)
                      })}
                      className="w-4 h-4 accent-primary-600" />
                    <span className={`text-sm font-medium ${planoConfig[p].cor}`}>{planoConfig[p].label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{LIMITE_PLANO[p]} sess/mês</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Créditos avulsos</label>
                <input type="number" min={0} className="input w-28"
                  value={formNovo.creditos_avulso}
                  onChange={e => setFormNovo({ ...formNovo, creditos_avulso: parseInt(e.target.value) || 0 })} />
              </div>
            </div>

            {erroCriar && <div className="mt-3 text-sm text-red-600">{erroCriar}</div>}

            <div className="flex gap-2 mt-6">
              <button onClick={() => setNovoCliente(false)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={criarCliente} disabled={criando} className="btn flex-1 bg-primary-600 text-white font-medium">
                {criando ? 'Cadastrando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
