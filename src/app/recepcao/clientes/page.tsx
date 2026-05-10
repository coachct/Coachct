'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { useRouter } from 'next/navigation'
import { Search, Plus, ChevronRight, X, Check, Calendar, Unlock, AlertCircle, ShoppingCart, Package, DollarSign, Building2, Trash2 } from 'lucide-react'
import UnidadeSelector from '@/components/UnidadeSelector'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const statusConfig: Record<string, { label: string; color: string }> = {
  agendado:   { label: 'Agendado',   color: 'bg-blue-100 text-blue-700' },
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
  realizado:  { label: 'Realizado',  color: 'bg-gray-100 text-gray-600' },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600' },
  falta:      { label: 'Falta',      color: 'bg-orange-100 text-orange-700' },
}

const FORMAS_PAGAMENTO = [
  { key: 'pix', label: 'PIX' },
  { key: 'cartao_credito', label: 'Cartão de crédito' },
  { key: 'cartao_debito', label: 'Cartão de débito' },
  { key: 'dinheiro', label: 'Dinheiro' },
]

export default function RecepcaoClientesPage() {
  const { perfil, loading } = useAuth()
  const { unidadeAtiva, unidadesPermitidas, loading: loadingUnidade } = useUnidade()
  const router = useRouter()
  const supabase = createClient()

  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [clienteSel, setClienteSel] = useState<any>(null)
  const [aba, setAba] = useState<'dados' | 'planos' | 'agendamentos' | 'historico' | 'vendas' | 'agendar'>('dados')

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)

  const [historico, setHistorico] = useState<any[]>([])
  const [saldoMes, setSaldoMes] = useState<Record<string, any>>({})
  const [vendas, setVendas] = useState<any[]>([])
  const [planosCliente, setPlanosCliente] = useState<any[]>([])
  const [planosDisponiveis, setPlanosDisponiveis] = useState<any[]>([])
  const [todasUnidades, setTodasUnidades] = useState<any[]>([])

  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [horariosSel, setHorariosSel] = useState<any[]>([])

  const [modalSlot, setModalSlot] = useState<{ hora: string; data: string } | null>(null)
  const [tipoCredito, setTipoCredito] = useState('')
  const [agendando, setAgendando] = useState(false)
  const [erroModal, setErroModal] = useState('')

  const [novoCliente, setNovoCliente] = useState(false)
  const [formNovo, setFormNovo] = useState({ nome: '', email: '', telefone: '', cpf: '' })
  const [criando, setCriando] = useState(false)
  const [erroCriar, setErroCriar] = useState('')

  const [modalVenda, setModalVenda] = useState(false)
  const [produtosDisp, setProdutosDisp] = useState<any[]>([])
  const [formVenda, setFormVenda] = useState({
    produto_id: '',
    quantidade: 1,
    valor_unitario: 0,
    forma_pagamento: 'pix',
    observacao: '',
  })
  const [vendendo, setVendendo] = useState(false)
  const [erroVenda, setErroVenda] = useState('')

  const [modalAtivarPlano, setModalAtivarPlano] = useState<any>(null)
  const [salvandoPlano, setSalvandoPlano] = useState(false)

  const [cancelandoId, setCancelandoId] = useState<string | null>(null)

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

  useEffect(() => {
    if (perfil) carregarUnidadesEPlanos()
  }, [perfil])

  async function carregarUnidadesEPlanos() {
    const [{ data: unidades }, { data: planos }] = await Promise.all([
      supabase.from('unidades').select('*').eq('ativo', true).order('nome'),
      supabase.from('planos_disponiveis').select('*').eq('ativo', true),
    ])
    setTodasUnidades(unidades || [])
    setPlanosDisponiveis(planos || [])
  }

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
    setForm({ ...cliente })
    setEditando(false)
    setAba('dados')
    setHistorico([])
    setVendas([])
    setModalSlot(null)
    setTipoCredito('')
    await Promise.all([
      carregarSaldo(cliente.id),
      carregarHistorico(cliente.id),
      carregarVendas(cliente.id),
      carregarPlanosCliente(cliente.id),
    ])
  }

  async function carregarSaldo(clienteId: string) {
    const agora = new Date()
    const mes = agora.getMonth() + 1
    const ano = agora.getFullYear()

    const { data } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteId,
      p_mes: mes,
      p_ano: ano,
      p_unidade_id: null,
    })
    setSaldoMes(data || {})
  }

  async function carregarHistorico(clienteId: string) {
    const { data } = await supabase
      .from('agendamentos')
      .select('*, unidades(nome)')
      .eq('cliente_id', clienteId)
      .order('data', { ascending: false })
      .limit(50)
    setHistorico(data || [])
  }

  async function carregarVendas(clienteId: string) {
    const { data } = await supabase
      .from('vendas')
      .select('*, produtos(nome, tipo), perfis:vendido_por(nome), unidades(nome)')
      .eq('cliente_id', clienteId)
      .order('vendido_em', { ascending: false })
      .limit(50)
    setVendas(data || [])
  }

  async function carregarPlanosCliente(clienteId: string) {
    const { data } = await supabase
      .from('cliente_planos')
      .select(`
        id, ativo, contrato_aceito_em, inicio, fim,
        planos_disponiveis(id, nome, tipo, creditos_mes, unidade_id, unidades(id, nome, tipo))
      `)
      .eq('cliente_id', clienteId)
      .order('contrato_aceito_em', { ascending: false })
    setPlanosCliente(data || [])
  }

  async function salvarEdicao() {
    setSalvando(true)
    const { error } = await supabase.from('clientes').update({
      nome: form.nome,
      email: form.email,
      telefone: form.telefone,
      cpf: form.cpf,
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
      email: formNovo.email || null,
      telefone: formNovo.telefone,
      cpf: formNovo.cpf.replace(/\D/g, ''),
      bloqueado: false,
    })
    if (error) {
      setErroCriar('Erro ao cadastrar. Verifique os dados.')
    } else {
      setNovoCliente(false)
      setFormNovo({ nome: '', email: '', telefone: '', cpf: '' })
      setBusca('')
      setClientes([])
    }
    setCriando(false)
  }

  async function abrirVenda() {
    if (!unidadeAtiva) return
    const { data } = await supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .or(`unidade_id.eq.${unidadeAtiva.id},unidade_id.is.null`)
      .order('nome')
    setProdutosDisp(data || [])
    setFormVenda({
      produto_id: data && data[0] ? data[0].id : '',
      quantidade: 1,
      valor_unitario: data && data[0] ? Number(data[0].valor) : 0,
      forma_pagamento: 'pix',
      observacao: '',
    })
    setErroVenda('')
    setModalVenda(true)
  }

  function selecionarProduto(produtoId: string) {
    const p = produtosDisp.find(x => x.id === produtoId)
    if (p) {
      setFormVenda({
        ...formVenda,
        produto_id: produtoId,
        valor_unitario: Number(p.valor),
      })
    }
  }

  async function confirmarVenda() {
    if (!unidadeAtiva) return
    if (!formVenda.produto_id) { setErroVenda('Selecione um produto.'); return }
    if (formVenda.quantidade < 1 || formVenda.quantidade > 20) { setErroVenda('Quantidade deve ser entre 1 e 20.'); return }
    if (formVenda.valor_unitario <= 0) { setErroVenda('Informe um valor válido.'); return }

    setVendendo(true)
    setErroVenda('')

    const { data, error } = await supabase.rpc('registrar_venda', {
      p_produto_id: formVenda.produto_id,
      p_cliente_id: clienteSel.id,
      p_quantidade: formVenda.quantidade,
      p_valor_unitario: formVenda.valor_unitario,
      p_forma_pagamento: formVenda.forma_pagamento,
      p_vendido_por: perfil?.id,
      p_unidade_id: unidadeAtiva.id,
      p_observacao: formVenda.observacao.trim() || null,
    })

    setVendendo(false)

    if (error) {
      setErroVenda('Erro ao registrar venda: ' + error.message)
      return
    }

    if (data && !data.sucesso) {
      setErroVenda('Erro: ' + (data.motivo || 'desconhecido'))
      return
    }

    setModalVenda(false)
    await Promise.all([
      carregarSaldo(clienteSel.id),
      carregarVendas(clienteSel.id),
    ])
    setAba('vendas')
  }

  async function ativarPlano(planoId: string) {
    if (!clienteSel) return
    setSalvandoPlano(true)

    const { data: existente } = await supabase
      .from('cliente_planos')
      .select('id, ativo')
      .eq('cliente_id', clienteSel.id)
      .eq('plano_id', planoId)
      .maybeSingle()

    let errPlano = null

    if (existente) {
      const { error } = await supabase.from('cliente_planos').update({
        ativo: true,
        contrato_aceito_em: new Date().toISOString(),
        fim: null,
      }).eq('id', existente.id)
      errPlano = error
    } else {
      const { error } = await supabase.from('cliente_planos').insert({
        cliente_id: clienteSel.id,
        plano_id: planoId,
        ativo: true,
        contrato_aceito_em: new Date().toISOString(),
      })
      errPlano = error
    }

    if (errPlano) {
      setSalvandoPlano(false)
      alert('Erro ao ativar plano: ' + errPlano.message)
      return
    }

    const planoInfo = planosDisponiveis.find(p => p.id === planoId)
    if (planoInfo) {
      const agora = new Date()
      const mes = agora.getMonth() + 1
      const ano = agora.getFullYear()

      const { error: errCreditos } = await supabase.from('cliente_creditos').insert({
        cliente_id: clienteSel.id,
        tipo: planoInfo.tipo,
        mes,
        ano,
        total: planoInfo.creditos_mes,
        usado: 0,
        unidade_id: planoInfo.unidade_id,
        gerado_automatico: false,
        observacao: 'Gerado na ativação do plano pela recepção',
      })

      if (errCreditos && !errCreditos.message.includes('duplicate')) {
        console.error('Erro ao gerar créditos:', errCreditos)
      }
    }

    setSalvandoPlano(false)
    setModalAtivarPlano(null)
    await carregarPlanosCliente(clienteSel.id)
    await carregarSaldo(clienteSel.id)
  }

  async function desativarPlano(cpId: string) {
    if (!confirm('Desativar este plano? O cliente perderá acesso aos créditos dessa unidade.')) return
    await supabase.from('cliente_planos').update({
      ativo: false,
      fim: new Date().toISOString().split('T')[0],
    }).eq('id', cpId)
    await carregarPlanosCliente(clienteSel.id)
    await carregarSaldo(clienteSel.id)
  }

  async function cancelarAgendamento(agId: string) {
    if (!confirm('Cancelar este agendamento? O crédito será devolvido ao cliente.')) return
    setCancelandoId(agId)

    const { error } = await supabase.from('agendamentos').update({
      status: 'cancelado',
      cancelado_em: new Date().toISOString(),
      motivo_cancelamento: 'Cancelado pela recepção',
    }).eq('id', agId)

    setCancelandoId(null)

    if (error) {
      alert('Erro ao cancelar: ' + error.message)
      return
    }

    await Promise.all([
      carregarSaldo(clienteSel.id),
      carregarHistorico(clienteSel.id),
    ])
  }

  function planosDisponiveisParaAtivar() {
    if (!unidadeAtiva) return []
    const planosAtivos = planosCliente.filter(p => p.ativo).map(p => p.planos_disponiveis?.id)
    return planosDisponiveis.filter(p =>
      p.unidade_id === unidadeAtiva.id && !planosAtivos.includes(p.id)
    )
  }

  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + semanaOffset * 7 + i)
    return d
  })

  useEffect(() => {
    if (aba === 'agendar' && unidadeAtiva) carregarHorariosAgendar()
  }, [aba, diaSel, semanaOffset, unidadeAtiva?.id])

  async function carregarHorariosAgendar() {
    if (!unidadeAtiva) return
    const dataSel = diasSemana[diaSel]
    const diaSemNum = dataSel.getDay()
    const dataStr = dataSel.toISOString().split('T')[0]

    const [{ data: hors }, { data: ags }, { data: bloqueadas }] = await Promise.all([
      supabase.from('coach_horarios').select('hora')
        .eq('dia_semana', diaSemNum)
        .eq('unidade_id', unidadeAtiva.id)
        .eq('ativo', true),
      supabase.from('agendamentos').select('horario')
        .eq('data', dataStr)
        .eq('unidade_id', unidadeAtiva.id)
        .neq('status', 'cancelado'),
      supabase.from('vagas_bloqueadas').select('horario, quantidade')
        .eq('data', dataStr)
        .eq('unidade_id', unidadeAtiva.id)
        .eq('ativo', true),
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
    if (!unidadeAtiva) return
    const dataStr = diasSemana[diaSel].toISOString().split('T')[0]
    const dataObj = diasSemana[diaSel]
    const { data: saldoData } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteSel.id,
      p_mes: dataObj.getMonth() + 1,
      p_ano: dataObj.getFullYear(),
      p_unidade_id: unidadeAtiva.id,
    })
    setSaldoMes(saldoData || {})

    setModalSlot({ hora, data: dataStr })
    setTipoCredito('')
    setErroModal('')
  }

  async function confirmarAgendamento() {
    if (!tipoCredito) { setErroModal('Selecione o tipo de crédito.'); return }
    if (!modalSlot || !clienteSel || !unidadeAtiva) return
    setAgendando(true)
    setErroModal('')

    const { error } = await supabase.from('agendamentos').insert({
      cliente_id: clienteSel.id,
      data: modalSlot.data,
      horario: modalSlot.hora + ':00',
      status: 'agendado',
      tipo_credito: tipoCredito,
      unidade_id: unidadeAtiva.id,
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
    { key: 'vendas', label: `Vendas${vendas.length > 0 ? ` (${vendas.length})` : ''}` },
    { key: 'agendamentos', label: `Agenda${agendamentosFuturos.length > 0 ? ` (${agendamentosFuturos.length})` : ''}` },
    { key: 'historico', label: 'Histórico' },
    { key: 'agendar', label: '+ Agendar' },
  ]

  const saldosUnidadeAtiva = Object.entries(saldoMes).filter(([_, info]: [string, any]) =>
    info.unidade_id === unidadeAtiva?.id
  )

  const planosPorUnidade: Record<string, any[]> = {}
  for (const cp of planosCliente.filter(p => p.ativo)) {
    const u = cp.planos_disponiveis?.unidades
    if (!u) continue
    if (!planosPorUnidade[u.id]) planosPorUnidade[u.id] = []
    planosPorUnidade[u.id].push(cp)
  }

  if (loading || loadingUnidade || !perfil) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!unidadeAtiva) return (
    <div className="flex items-center justify-center h-screen p-6 text-center">
      <div>
        <AlertCircle size={32} className="text-orange-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Sem acesso a unidades</h2>
      </div>
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
        <div className="flex items-center gap-2">
          <UnidadeSelector />
          {!clienteSel && (
            <button onClick={() => setNovoCliente(true)} className="btn btn-sm gap-1 bg-primary-600 text-white hover:bg-primary-700">
              <Plus size={14} /> Novo
            </button>
          )}
        </div>
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
                {clientes.map(c => (
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
                      <div className="text-xs text-gray-500 mt-0.5">
                        {c.cpf && <span className="font-mono">{c.cpf}</span>}
                        {c.email && <span> · {c.email}</span>}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  </div>
                ))}
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

            <button onClick={abrirVenda}
              className="w-full mb-4 btn gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 py-3 font-semibold shadow-sm">
              <ShoppingCart size={16} /> Vender produto · {unidadeAtiva.nome}
            </button>

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
                {Object.keys(planosPorUnidade).length === 0 ? (
                  <div className="card text-center py-8 text-gray-400 text-sm">
                    Cliente sem planos ativos.
                  </div>
                ) : (
                  todasUnidades.map(u => {
                    const planosU = planosPorUnidade[u.id] || []
                    if (planosU.length === 0) return null
                    const podeMexer = u.id === unidadeAtiva.id || perfil?.role === 'admin'

                    return (
                      <div key={u.id} className="card">
                        <div className="flex items-center gap-2 mb-3">
                          <Building2 size={14} className="text-gray-400" />
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            u.tipo === 'ct' ? 'bg-primary-100 text-primary-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {u.tipo === 'ct' ? 'CT' : 'Club'}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">{u.nome}</span>
                          {!podeMexer && (
                            <span className="text-xs text-gray-400 italic">(somente leitura)</span>
                          )}
                        </div>

                        <div className="space-y-2">
                          {planosU.map(cp => {
                            const pd = cp.planos_disponiveis
                            const saldoKey = Object.keys(saldoMes).find(k =>
                              saldoMes[k]?.unidade_id === u.id && saldoMes[k]?.tipo_plano === pd?.tipo
                            )
                            const saldo = saldoKey ? saldoMes[saldoKey] : null

                            return (
                              <div key={cp.id} className="border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-900">{pd?.nome}</div>
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {pd?.creditos_mes} sessões/mês
                                    {saldo && (
                                      <> · <span className="font-bold text-primary-600">{saldo.disponivel}</span> disponível este mês</>
                                    )}
                                  </div>
                                  {cp.contrato_aceito_em && (
                                    <div className="text-xs text-gray-400 mt-0.5">
                                      Contrato aceito em {new Date(cp.contrato_aceito_em).toLocaleDateString('pt-BR')}
                                    </div>
                                  )}
                                </div>
                                {podeMexer && (
                                  <button onClick={() => desativarPlano(cp.id)}
                                    className="btn btn-sm gap-1 text-red-500 hover:bg-red-50">
                                    <Trash2 size={12} /> Desativar
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                )}

                {planosDisponiveisParaAtivar().length > 0 && (
                  <div className="card border-2 border-dashed border-primary-200 bg-primary-50">
                    <div className="text-sm font-semibold text-primary-800 mb-3 flex items-center gap-2">
                      <Plus size={14} /> Ativar plano em {unidadeAtiva.nome}
                    </div>
                    <div className="space-y-2">
                      {planosDisponiveisParaAtivar().map(p => (
                        <button key={p.id} onClick={() => setModalAtivarPlano(p)}
                          className="w-full bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between hover:border-primary-400 transition-all text-left">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{p.nome}</div>
                            <div className="text-xs text-gray-500">{p.creditos_mes} sessões/mês</div>
                          </div>
                          <Plus size={16} className="text-primary-600" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {aba === 'vendas' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-gray-900">Histórico de vendas</div>
                  <button onClick={abrirVenda} className="btn btn-sm gap-1 bg-green-600 text-white hover:bg-green-700">
                    <ShoppingCart size={12} /> Nova venda
                  </button>
                </div>
                {vendas.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">
                    Nenhuma venda registrada para este cliente.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vendas.map(v => (
                      <div key={v.id} className="card">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-700 flex items-center justify-center flex-shrink-0">
                            <Package size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-900">
                                {v.produtos?.nome || 'Produto removido'}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                {v.quantidade}x
                              </span>
                              {v.unidades?.nome && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                  {v.unidades.nome}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                              <span className="font-mono font-bold text-green-700">
                                R$ {Number(v.valor_total).toFixed(2).replace('.', ',')}
                              </span>
                              <span>{FORMAS_PAGAMENTO.find(f => f.key === v.forma_pagamento)?.label || v.forma_pagamento}</span>
                              <span>{new Date(v.vendido_em).toLocaleDateString('pt-BR')} {new Date(v.vendido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {v.perfis?.nome && (
                              <div className="text-xs text-gray-400 mt-0.5">Vendido por {v.perfis.nome}</div>
                            )}
                            {v.observacao && (
                              <div className="text-xs text-gray-500 mt-1 italic">{v.observacao}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                              {ag.unidades?.nome && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                  {ag.unidades.nome}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">{ag.tipo_credito}</div>
                          </div>
                          <button
                            onClick={() => cancelarAgendamento(ag.id)}
                            disabled={cancelandoId === ag.id}
                            className="btn btn-sm gap-1 text-red-500 hover:bg-red-50 flex-shrink-0">
                            <X size={12} /> {cancelandoId === ag.id ? 'Cancelando...' : 'Cancelar'}
                          </button>
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
                            {ag.unidades?.nome && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                {ag.unidades.nome}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{ag.tipo_credito}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aba === 'agendar' && (
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-4">
                  Agendar em {unidadeAtiva.nome}
                </div>
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
                <div className="text-xs text-gray-400">{unidadeAtiva.nome}</div>
              </div>
              <button onClick={() => setModalSlot(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4">
              <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Usar crédito de</div>
              <div className="space-y-2">
                {saldosUnidadeAtiva.length === 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
                    Cliente sem créditos disponíveis nesta unidade.
                  </div>
                ) : (
                  saldosUnidadeAtiva.map(([key, info]: [string, any]) => {
                    const restante = info.disponivel
                    const semSaldo = restante <= 0
                    return (
                      <div key={key} onClick={() => !semSaldo && setTipoCredito(info.tipo_plano)}
                        className={`border rounded-xl p-3 flex items-center gap-3 transition-all ${
                          semSaldo ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50' :
                          tipoCredito === info.tipo_plano ? 'bg-primary-50 border-primary-400 cursor-pointer' :
                          'border-gray-200 hover:border-primary-200 cursor-pointer bg-white'
                        }`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          tipoCredito === info.tipo_plano ? 'border-primary-600 bg-primary-600' : 'border-gray-300'
                        }`}>
                          {tipoCredito === info.tipo_plano && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900 capitalize">{info.tipo_plano}</div>
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

      {modalVenda && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2">
                  <ShoppingCart size={18} className="text-green-600" /> Vender produto
                </div>
                <div className="text-xs text-gray-400 mt-0.5">para {clienteSel?.nome} · {unidadeAtiva.nome}</div>
              </div>
              <button onClick={() => setModalVenda(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {produtosDisp.length === 0 ? (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-700">
                Nenhum produto ativo disponível para esta unidade.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-2 block font-medium uppercase tracking-wide">Produto</label>
                  <div className="space-y-2">
                    {produtosDisp.map(p => (
                      <label key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        formVenda.produto_id === p.id ? 'border-green-400 bg-green-50' : 'border-gray-200'
                      }`}>
                        <input type="radio" checked={formVenda.produto_id === p.id}
                          onChange={() => selecionarProduto(p.id)}
                          className="mt-1 accent-green-600" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{p.nome}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            R$ {Number(p.valor).toFixed(2).replace('.', ',')}
                            {p.creditos_por_venda > 1 && ` · ${p.creditos_por_venda} créditos por venda`}
                            {p.dias_validade && ` · validade ${p.dias_validade} dias`}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block font-medium">Quantidade</label>
                    <input type="number" min={1} max={20} className="input w-full"
                      value={formVenda.quantidade}
                      onChange={e => setFormVenda({ ...formVenda, quantidade: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block font-medium">Valor unitário (R$)</label>
                    <input type="number" min={0} step="0.01" className="input w-full"
                      value={formVenda.valor_unitario}
                      onChange={e => setFormVenda({ ...formVenda, valor_unitario: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm text-green-800 font-medium">Total da venda</span>
                  <span className="font-mono text-xl font-bold text-green-700">
                    R$ {(formVenda.quantidade * formVenda.valor_unitario).toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-2 block font-medium uppercase tracking-wide">Forma de pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FORMAS_PAGAMENTO.map(f => (
                      <button key={f.key}
                        onClick={() => setFormVenda({ ...formVenda, forma_pagamento: f.key })}
                        className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                          formVenda.forma_pagamento === f.key
                            ? 'border-green-400 bg-green-50 text-green-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Observação (opcional)</label>
                  <textarea className="input w-full resize-none" rows={2}
                    value={formVenda.observacao}
                    onChange={e => setFormVenda({ ...formVenda, observacao: e.target.value })}
                    placeholder="Ex: cliente pagou parcelado..." />
                </div>

                {erroVenda && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    {erroVenda}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setModalVenda(false)}
                    className="btn flex-1 text-gray-500 border border-gray-200">
                    Cancelar
                  </button>
                  <button onClick={confirmarVenda} disabled={vendendo}
                    className="btn flex-1 bg-green-600 text-white hover:bg-green-700 gap-1">
                    <DollarSign size={14} /> {vendendo ? 'Registrando...' : 'Confirmar venda'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modalAtivarPlano && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900">Ativar plano</div>
              <button onClick={() => setModalAtivarPlano(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-4">
              <div className="font-semibold text-primary-900">{modalAtivarPlano.nome}</div>
              <div className="text-xs text-primary-700 mt-1">
                {modalAtivarPlano.creditos_mes} sessões/mês em {unidadeAtiva.nome}
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-xs text-yellow-800">
              ⚠️ Esta ação simula o aceite de contrato pelo cliente. O cliente precisa estar presente e ciente da ativação.
            </div>

            <div className="flex gap-2">
              <button onClick={() => setModalAtivarPlano(null)} className="btn flex-1 text-gray-500 border border-gray-200">
                Cancelar
              </button>
              <button onClick={() => ativarPlano(modalAtivarPlano.id)} disabled={salvandoPlano}
                className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700">
                {salvandoPlano ? 'Ativando...' : 'Ativar plano'}
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
