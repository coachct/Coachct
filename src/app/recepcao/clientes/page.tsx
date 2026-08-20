'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import { gradeExtraDoDia } from '@/lib/grade'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Plus, ChevronRight, X, Check, Calendar, Unlock, AlertCircle, ShoppingCart, Package, DollarSign, Building2, Trash2, Zap, Gift, CalendarClock, Edit2, KeyRound, Copy, Dumbbell, CheckCircle2 } from 'lucide-react'
import UnidadeSelector from '@/components/UnidadeSelector'
import { numerarTreinosDoMes, PLANOS_SEM_TETO } from '@/lib/treinos-numero'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const statusConfig: Record<string, { label: string; color: string }> = {
  agendado:   { label: 'Agendado',   color: 'bg-blue-100 text-blue-700' },
  confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
  realizado:  { label: 'Realizado',  color: 'bg-gray-100 text-gray-600' },
  cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600' },
  falta:      { label: 'Falta',      color: 'bg-orange-100 text-orange-700' },
  reservado:  { label: 'Reservado',  color: 'bg-blue-100 text-blue-700' },
  presente:   { label: 'Presente',   color: 'bg-green-100 text-green-700' },
}

const FORMAS_PAGAMENTO = [
  { key: 'pix', label: 'PIX' },
  { key: 'cartao_credito', label: 'Cartão de crédito' },
  { key: 'cartao_debito', label: 'Cartão de débito' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'cortesia', label: 'Cortesia' },
]

function formatarBR(data: string | Date) {
  const d = typeof data === 'string' ? new Date(data + 'T12:00:00') : data
  return d.toLocaleDateString('pt-BR')
}

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function tipoLabelClub(t: string) {
  if (t==='lift')              return 'Lift'
  if (t==='lift_for_girls')   return 'Lift for Girls'
  if (t==='running_funcional') return 'Running + Funcional'
  return t
}
function tipoCorClub(t: string) {
  if (t==='lift')              return '#00e5ff'
  if (t==='lift_for_girls')   return '#ff2d9b'
  return '#2ddd8b'
}
function parsePlanoKey(key: string) {
  const lower = (key||'').toLowerCase()
  if (lower.startsWith('wellhub'))   return { label:'Wellhub',  icon:'💜' }
  if (lower.startsWith('totalpass')) return { label:'TotalPass', icon:'🔵' }
  if (lower === 'avulso_importado') return { label: 'Crédito Avulso · todos os Clubs', icon:'🎟️' }
  return { label: key, icon:'🎟️' }
}

// ─── Exibição do uso (espelha a tela do admin) ────────────────────────────────
// A recepção precisa explicar pro cliente COM QUE plano cada treino foi pago,
// de onde veio a reserva e quando foi feita — por isso os mesmos rótulos daqui.
function creditoLabel(key?: string | null): { label: string; icon: string } {
  const k = key || ''
  const lower = k.toLowerCase()
  if (!k) return { label: '', icon: '' }
  if (lower === 'avulso_importado') return { label: 'Crédito Avulso · todos os Clubs', icon: '🎟️' }
  let tipo = '', icon = '🏋️', slug = ''
  if (lower.startsWith('coach_ct_pro'))      { tipo = 'Coach CT Pro'; icon = '🏆'; slug = k.substring('coach_ct_pro_'.length) }
  else if (lower.startsWith('wellhub'))      { tipo = 'Wellhub';   icon = '💜'; slug = k.split('_').slice(1).join('_') }
  else if (lower.startsWith('totalpass'))    { tipo = 'TotalPass'; icon = '🔵'; slug = k.split('_').slice(1).join('_') }
  else if (lower.startsWith('avulso') || lower.startsWith('credito')) { tipo = 'Crédito Avulso'; icon = '🎟️'; slug = k.split('_').slice(1).join('_') }
  else return { label: k, icon: '🏋️' }
  const nomeUnidade: Record<string, string> = { just_ct: 'Just CT', just_club_vila_olimpia: 'Vila Olímpia', just_club_pinheiros: 'Pinheiros' }
  const u = nomeUnidade[slug] || slug.replace(/_/g, ' ')
  return { label: u ? `${tipo} — ${u}` : tipo, icon }
}

function origemReserva(via?: string | null): { label: string; cls: string } | null {
  if (!via) return null
  const map: Record<string, { label: string; cls: string }> = {
    cliente:   { label: 'Cliente',   cls: 'bg-gray-100 text-gray-600' },
    recepcao:  { label: 'Recepção',  cls: 'bg-blue-100 text-blue-700' },
    admin:     { label: 'Admin',     cls: 'bg-primary-100 text-primary-700' },
    whatsapp:  { label: 'WhatsApp',  cls: 'bg-green-100 text-green-700' },
    wellhub:   { label: 'Wellhub',   cls: 'bg-purple-100 text-purple-700' },
    totalpass: { label: 'TotalPass', cls: 'bg-orange-100 text-orange-700' },
  }
  return map[via] || { label: via, cls: 'bg-gray-100 text-gray-600' }
}

function reservadoEm(ts?: string | null): string | null {
  if (!ts) return null
  const d = new Date(ts)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function RecepcaoClientesPageInner() {
  const { perfil, loading } = useAuth()
  const { unidadeAtiva, unidadesPermitidas, loading: loadingUnidade } = useUnidade()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [loadingClientes, setLoadingClientes] = useState(false)
  const [clienteSel, setClienteSel] = useState<any>(null)
  const [aba, setAba] = useState<'dados' | 'planos' | 'agendamentos' | 'historico' | 'vendas' | 'agendar'>('dados')

  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)
  const [erroEdicao, setErroEdicao] = useState('')

  const [historico, setHistorico] = useState<any[]>([])
  const [clubReservas, setClubReservas] = useState<any[]>([])
  const [acessosWalkin, setAcessosWalkin] = useState<any[]>([])
  const [saldoMes, setSaldoMes] = useState<Record<string, any>>({})
  const [vendas, setVendas] = useState<any[]>([])
  const [planosCliente, setPlanosCliente] = useState<any[]>([])
  const [avulsosPacotes, setAvulsosPacotes] = useState<any[]>([])
  const [planosDisponiveis, setPlanosDisponiveis] = useState<any[]>([])
  const [todasUnidades, setTodasUnidades] = useState<any[]>([])

  // CT: seletor de dia/semana + horários
  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [horariosSel, setHorariosSel] = useState<any[]>([])
  const [modalSlot, setModalSlot] = useState<{ hora: string; data: string } | null>(null)
  const [tipoCredito, setTipoCredito] = useState('')
  const [agendando, setAgendando] = useState(false)
  const [erroModal, setErroModal] = useState('')

  // Club: lista de ocorrências do dia selecionado
  const [dataSel, setDataSel] = useState(dataLocalStr(new Date()))
  const [aulasClub, setAulasClub] = useState<any[]>([])
  const [contagensClub, setContagensClub] = useState<Record<string, { reservado:number; presente:number; falta:number; total:number }>>({})
  const [loadingAulas, setLoadingAulas] = useState(false)
  const [modalAulaClub, setModalAulaClub] = useState<any>(null)
  const [saldoClubModal, setSaldoClubModal] = useState<Record<string, any>>({})
  const [tipoCreditoClub, setTipoCreditoClub] = useState('')
  const [agendandoClub, setAgendandoClub] = useState(false)
  const [erroModalClub, setErroModalClub] = useState('')

  const [novoCliente, setNovoCliente] = useState(false)
  const [formNovo, setFormNovo] = useState({ nome: '', email: '', telefone: '', cpf: '' })
  const [criando, setCriando] = useState(false)
  const [erroCriar, setErroCriar] = useState('')

  // ── Gerar senha provisória ──
  const [modalSenhaProvisoria, setModalSenhaProvisoria] = useState<{ nome: string; email: string | null; senha: string; acao: string } | null>(null)
  const [gerandoSenha, setGerandoSenha] = useState(false)
  const [erroGerarSenha, setErroGerarSenha] = useState('')
  const [senhaCopiada, setSenhaCopiada] = useState(false)

  const [modalVenda, setModalVenda] = useState(false)
  const [produtosDisp, setProdutosDisp] = useState<any[]>([])
  const [formVenda, setFormVenda] = useState({
    produto_id: '',
    quantidade: 1,
    valor_unitario: 0,
    desconto_percentual: 0,
    forma_pagamento: 'pix',
    observacao: '',
  })
  const [vendendo, setVendendo] = useState(false)
  const [erroVenda, setErroVenda] = useState('')
  // ── Código de liberação de desconto (recepção) ──
  const [codigoLiberacao, setCodigoLiberacao] = useState('')
  const [liberacao, setLiberacao] = useState<{ desconto_maximo: number } | null>(null)
  const [validandoCodigo, setValidandoCodigo] = useState(false)
  const [erroCodigo, setErroCodigo] = useState('')
  // ── Tela de venda finalizada + atalho walk-in (só produtos credito_treino) ──
  const [vendaSucesso, setVendaSucesso] = useState<{ cliente_id: string; cliente_nome: string; nome_produto: string | null; contexto: 'ct' | 'club' | null } | null>(null)
  const [entradaStatus, setEntradaStatus] = useState<'idle' | 'registrando' | 'ok' | 'erro'>('idle')
  const [entradaErro, setEntradaErro] = useState('')
  // Aulas de hoje do Club para o atalho da tela de sucesso (contexto 'club')
  const [aulasClubSucesso, setAulasClubSucesso] = useState<any[]>([])
  const [contagensClubSucesso, setContagensClubSucesso] = useState<Record<string, any>>({})
  const [loadingAulasSucesso, setLoadingAulasSucesso] = useState(false)

  const [modalAtivarPlano, setModalAtivarPlano] = useState<any>(null)
  const [salvandoPlano, setSalvandoPlano] = useState(false)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [modalVencimento, setModalVencimento] = useState<any>(null)
  const [novoVencimento, setNovoVencimento] = useState('')
  const [ajustandoVencimento, setAjustandoVencimento] = useState(false)
  const [erroVencimento, setErroVencimento] = useState('')

  const isClub = unidadeAtiva?.tipo === 'club'
  const ehRecepcao = perfil?.role === 'recepcao'

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if ((perfil.role as any) !== 'recepcao' && (perfil.role as any) !== 'admin') { router.push('/'); return }
  }, [loading, perfil])

  useEffect(() => {
    if (!perfil) return
    if (busca.trim().length >= 2) buscarClientes()
    else setClientes([])
  }, [busca])

  useEffect(() => {
    if (perfil) carregarUnidadesEPlanos()
  }, [perfil])

  // Abre um cliente direto pela URL (?id=...) — usado pelos links de nome nas listas de reserva
  useEffect(() => {
    const id = searchParams.get('id')
    if (perfil && id) abrirClientePorId(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, searchParams])

  // Atalho vindo do walk-in: ?venda=1 abre o modal de venda assim que o cliente carrega
  const vendaAutoRef = useRef(false)
  useEffect(() => {
    if (vendaAutoRef.current) return
    if (clienteSel && unidadeAtiva && searchParams.get('venda') === '1') {
      vendaAutoRef.current = true
      abrirVenda()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteSel, unidadeAtiva, searchParams])

  async function abrirClientePorId(id: string) {
    const { data } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle()
    if (data) { setBusca(data.nome || ''); await abrirCliente(data) }
  }

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
    const { data } = await supabase.from('clientes').select('*')
      .or(`nome.ilike.%${busca}%,cpf.ilike.%${busca}%,email.ilike.%${busca}%`)
      .order('nome').limit(20)
    setClientes(data || [])
    setLoadingClientes(false)
  }

  async function abrirCliente(cliente: any) {
    setClienteSel(cliente)
    setForm({ ...cliente })
    setEditando(false)
    setAba('dados')
    setHistorico([])
    setClubReservas([])
    setAcessosWalkin([])
    setVendas([])
    setModalSlot(null)
    setTipoCredito('')
    setErroGerarSenha('')
    setDataSel(dataLocalStr(new Date()))
    await Promise.all([
      carregarSaldo(cliente.id),
      carregarHistorico(cliente.id),
      carregarClubReservas(cliente.id),
      carregarAcessosWalkin(cliente.id),
      carregarVendas(cliente.id),
      carregarPlanosCliente(cliente.id),
      carregarAvulsos(cliente.id),
    ])
  }

  async function carregarSaldo(clienteId: string) {
    const agora = new Date()
    const { data } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteId,
      p_mes: agora.getMonth() + 1,
      p_ano: agora.getFullYear(),
      p_unidade_id: null,
    })
    setSaldoMes(data || {})
  }

  async function carregarHistorico(clienteId: string) {
    // Só Coach CT aqui. O Club vem de carregarClubReservas (com o crédito usado
    // e a origem da reserva) e o walk-in de carregarAcessosWalkin — as três
    // listas se juntam em itensFuturos/itensPassados, igual à tela do admin.
    const { data } = await supabase.from('agendamentos').select('*, unidades(nome)')
      .eq('cliente_id', clienteId).order('data', { ascending: false }).limit(50)
    setHistorico(data || [])
  }

  async function carregarClubReservas(clienteId: string) {
    const { data } = await supabase.from('club_reservas')
      .select('*, creditos_avulsos(observacao), club_ocorrencias(id, data, club_aulas(tipo, horario, unidade_id, unidades(nome)))')
      .eq('cliente_id', clienteId)
      .neq('status', 'cancelado')
      .order('created_at', { ascending: false })
      .limit(50)
    setClubReservas(data || [])
  }

  async function carregarAcessosWalkin(clienteId: string) {
    // Walk-ins de musculação livre no CT. Não geram agendamento nem reserva de
    // Club — vivem só aqui — então precisam ser lidos à parte pro histórico.
    const { data } = await supabase.from('acessos_livres_ct')
      .select('id, data, unidade_id, criado_em, creditos_avulsos(observacao)')
      .eq('cliente_id', clienteId)
      .is('cancelado_em', null)
      .order('data', { ascending: false })
      .limit(50)
    setAcessosWalkin(data || [])
  }

  async function carregarVendas(clienteId: string) {
    const { data } = await supabase.from('vendas')
      .select('*, produtos(nome, tipo, subtipo), perfis:vendido_por(nome), unidades(nome)')
      .eq('cliente_id', clienteId).order('vendido_em', { ascending: false }).limit(50)
    setVendas(data || [])
  }

  async function carregarPlanosCliente(clienteId: string) {
    const { data } = await supabase.from('cliente_planos').select(`
      id, ativo, contrato_aceito_em, inicio, fim, produto_id, venda_id,
      planos_disponiveis(id, nome, tipo, creditos_mes, unidade_id, unidades(id, nome, tipo)),
      produtos(id, nome, subtipo, unidade_id, unidades(id, nome, tipo), dias_validade)
    `).eq('cliente_id', clienteId).order('contrato_aceito_em', { ascending: false })
    setPlanosCliente(data || [])
  }

  async function carregarAvulsos(clienteId: string) {
    const { data } = await supabase.from('creditos_avulsos')
      .select('id, tipo, unidade_id, usado, validade, observacao, unidades(nome, tipo)')
      .eq('cliente_id', clienteId)
    const linhas = data || []

    // Reservas ativas que consumiram esses créditos (vínculo display-only credito_avulso_id).
    // O abatimento do saldo continua sendo o do RPC; aqui só refletimos o consumo por pacote.
    const ids = linhas.map((c: any) => c.id)
    const reservasPorCredito: Record<string, any[]> = {}
    if (ids.length > 0) {
      const { data: rs } = await supabase.from('club_reservas')
        .select('id, credito_avulso_id, status, club_ocorrencias(data, club_aulas(tipo, horario, unidades(nome)))')
        .in('credito_avulso_id', ids)
        .neq('status', 'cancelado')
      for (const r of (rs || [])) {
        const cid = (r as any).credito_avulso_id
        if (!cid) continue
        ;(reservasPorCredito[cid] ||= []).push(r)
      }
    }

    const hojeStr = dataLocalStr(new Date())
    const grupos: Record<string, any> = {}
    for (const c of linhas) {
      const chave = `${c.observacao || ''}|${c.validade || ''}|${c.unidade_id || 'global'}|${c.tipo || ''}`
      if (!grupos[chave]) {
        grupos[chave] = {
          chave,
          observacao: c.observacao ?? null,
          validade: c.validade ?? null,
          unidade_id: c.unidade_id ?? null,
          tipo: c.tipo ?? null,
          unidade_nome: (c.unidades as any)?.nome ?? null,
          unidade_tipo: (c.unidades as any)?.tipo ?? null,
          total: 0, usados: 0, disponiveis: 0, reservas: [] as any[],
        }
      }
      grupos[chave].total++
      // A fonte de verdade do débito é a coluna `usado` — setada por qualquer
      // consumo (reserva de Club OU walk-in do CT em acessos_livres_ct). O vínculo
      // de club_reservas é só para exibir QUAL reserva consumiu; se contarmos
      // usados por ele, walk-ins do CT somem e o pacote aparece cheio (bug).
      const links = reservasPorCredito[c.id]
      if (links && links.length > 0) grupos[chave].reservas.push(...links)
      if (c.usado) {
        grupos[chave].usados++
      } else if ((c.validade || '') >= hojeStr) {
        grupos[chave].disponiveis++
      }
      // crédito vencido e não consumido: não conta como disponível nem usado
    }
    const lista = Object.values(grupos).sort((a: any, b: any) => (a.validade || '').localeCompare(b.validade || ''))
    setAvulsosPacotes(lista)
  }

  // ─── CT: carregar horários de coach ───────────────────────────────────────
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + semanaOffset * 7 + i)
    return d
  })

  useEffect(() => {
    if (aba === 'agendar' && unidadeAtiva && !isClub) carregarHorariosAgendar()
  }, [aba, diaSel, semanaOffset, unidadeAtiva?.id])

  async function carregarHorariosAgendar() {
    if (!unidadeAtiva) return
    const dataSel = diasSemana[diaSel]
    const diaSemNum = dataSel.getDay()
    const dataStr = dataSel.toISOString().split('T')[0]

    const [{ data: hors }, { data: ags }, { data: bloqueadas }] = await Promise.all([
      supabase.from('coach_horarios').select('hora, coach_id').eq('dia_semana', diaSemNum)
        .eq('unidade_id', unidadeAtiva.id).eq('ativo', true),
      supabase.from('agendamentos').select('horario').eq('data', dataStr)
        .eq('unidade_id', unidadeAtiva.id).neq('status', 'cancelado'),
      supabase.from('vagas_bloqueadas').select('horario, quantidade').eq('data', dataStr)
        .eq('unidade_id', unidadeAtiva.id).eq('ativo', true),
    ])

    const porHora: Record<string, number> = {}
    const coachPorHora: Record<string, Set<string>> = {}
    for (const h of (hors || [])) {
      const hora = (h.hora||'').slice(0,5)
      porHora[hora] = (porHora[hora]||0)+1
      if (!coachPorHora[hora]) coachPorHora[hora] = new Set()
      coachPorHora[hora].add((h as any).coach_id)
    }
    // Grade extra do período — só em dia útil (FDS/feriado seguem escala_fds).
    if (diaSemNum !== 0 && diaSemNum !== 6) {
      const extra = await gradeExtraDoDia(supabase, { unidadeId: unidadeAtiva.id, dataStr, diaSemana: diaSemNum })
      for (const s of extra) {
        if (!coachPorHora[s.hora]) coachPorHora[s.hora] = new Set()
        if (coachPorHora[s.hora].has(s.coach_id)) continue
        coachPorHora[s.hora].add(s.coach_id)
        porHora[s.hora] = (porHora[s.hora]||0)+1
      }
    }
    const ocupados: Record<string, number> = {}
    for (const a of (ags || [])) { const hora = (a.horario||'').slice(0,5); ocupados[hora] = (ocupados[hora]||0)+1 }
    const bloqueadasMap: Record<string, number> = {}
    for (const b of (bloqueadas||[])) { const hora = (b.horario||'').slice(0,5); bloqueadasMap[hora] = (bloqueadasMap[hora]||0)+(b.quantidade||1) }

    const resultado = Object.entries(porHora).map(([hora, total]) => ({
      hora, total,
      ocupados: ocupados[hora]||0,
      bloqueadas: bloqueadasMap[hora]||0,
      livres: Math.max(0, total - (ocupados[hora]||0) - (bloqueadasMap[hora]||0)),
    })).sort((a,b) => a.hora.localeCompare(b.hora))
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
    setAgendando(true); setErroModal('')
    const { error } = await supabase.from('agendamentos').insert({
      cliente_id: clienteSel.id, data: modalSlot.data,
      horario: modalSlot.hora + ':00', status: 'agendado',
      tipo_credito: tipoCredito, unidade_id: unidadeAtiva.id,
      criado_via: 'recepcao', criado_por: perfil?.id || null,
    })
    if (error) { setErroModal('Erro ao agendar. Tente novamente.'); setAgendando(false); return }
    setModalSlot(null); setAgendando(false)
    await Promise.all([carregarSaldo(clienteSel.id), carregarHistorico(clienteSel.id)])
    setAba('agendamentos')
  }

  // ─── Club: carregar ocorrências do dia ─────────────────────────────────────
  useEffect(() => {
    if (aba === 'agendar' && unidadeAtiva && isClub && clienteSel) carregarAulasClub()
  }, [aba, dataSel, unidadeAtiva?.id, isClub])

  async function carregarAulasClub() {
    if (!unidadeAtiva) return
    setLoadingAulas(true)

    const { data: aulasIds } = await supabase.from('club_aulas').select('id')
      .eq('unidade_id', unidadeAtiva.id).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    if (!ids.length) { setAulasClub([]); setContagensClub({}); setLoadingAulas(false); return }

    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('*, club_aulas(tipo, horario, capacidade, coaches(nome), grupos_musculares(nome))')
      .in('aula_id', ids).eq('data', dataSel).eq('status', 'ativa')

    const lista = (ocs || []).sort((a: any, b: any) =>
      (a.club_aulas?.horario||'').localeCompare(b.club_aulas?.horario||''))
    setAulasClub(lista)

    if (lista.length > 0) {
      const { data: reservas } = await supabase.from('club_reservas')
        .select('ocorrencia_id, status').in('ocorrencia_id', lista.map((o: any) => o.id))
      const cont: Record<string, any> = {}
      for (const oc of lista) {
        const rs = (reservas||[]).filter((r: any) => r.ocorrencia_id === oc.id)
        cont[oc.id] = {
          total:    oc.club_aulas?.capacidade || 0,
          reservado: rs.filter((r: any) => r.status==='reservado').length,
          presente:  rs.filter((r: any) => r.status==='presente').length,
          falta:     rs.filter((r: any) => r.status==='falta').length,
        }
      }
      setContagensClub(cont)
    }
    setLoadingAulas(false)
  }

  async function abrirModalAulaClub(oc: any) {
    // Verifica se cliente já tem reserva nessa ocorrência
    const { data: jaReservou } = await supabase.from('club_reservas')
      .select('id').eq('ocorrencia_id', oc.id).eq('cliente_id', clienteSel.id)
      .neq('status', 'cancelado').maybeSingle()
    if (jaReservou) { alert('Este cliente já possui reserva nesta aula.'); return }

    const dataOc = new Date(oc.data + 'T12:00:00')
    const { data: saldo } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteSel.id,
      p_mes: dataOc.getMonth() + 1,
      p_ano: dataOc.getFullYear(),
      p_unidade_id: unidadeAtiva!.id,
    })
    setSaldoClubModal(saldo || {})
    setModalAulaClub(oc)
    setTipoCreditoClub('')
    setErroModalClub('')
  }

  async function ativarPlanoRapidoClub(tipo: string) {
    if (!clienteSel || !unidadeAtiva || !modalAulaClub) return
    const dataOc = new Date(modalAulaClub.data + 'T12:00:00')
    const mes = dataOc.getMonth() + 1
    const ano = dataOc.getFullYear()

    const { data: plano } = await supabase.from('planos_disponiveis').select('id')
      .eq('tipo', tipo).eq('unidade_id', unidadeAtiva.id).maybeSingle()
    if (!plano) { setErroModalClub('Plano não encontrado para esta unidade.'); return }

    await supabase.from('cliente_planos').upsert({
      cliente_id: clienteSel.id, plano_id: plano.id, ativo: true,
      inicio: modalAulaClub.data,
    }, { onConflict: 'cliente_id,plano_id' })

    await supabase.from('cliente_creditos').upsert({
      cliente_id: clienteSel.id, unidade_id: unidadeAtiva.id,
      tipo, total: 12, mes, ano,
    }, { onConflict: 'cliente_id,unidade_id,tipo,mes,ano' })

    const { data: saldo } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteSel.id, p_mes: mes, p_ano: ano,
      p_unidade_id: unidadeAtiva.id,
    })
    setSaldoClubModal(saldo || {})
    setErroModalClub('')
  }

  async function confirmarAgendamentoClub() {
    if (!tipoCreditoClub) { setErroModalClub('Selecione o plano.'); return }
    if (!modalAulaClub || !clienteSel) return
    setAgendandoClub(true); setErroModalClub('')

    const hoje = dataLocalStr(new Date())
    const statusInicial = modalAulaClub.data === hoje ? 'presente' : 'reservado'

    const { error } = await supabase.from('club_reservas').insert({
      ocorrencia_id: modalAulaClub.id,
      cliente_id: clienteSel.id,
      tipo_credito: tipoCreditoClub,
      status: statusInicial,
    })
    if (error) { setErroModalClub('Erro: ' + error.message); setAgendandoClub(false); return }

    setAgendandoClub(false)
    setModalAulaClub(null)
    setTipoCreditoClub('')
    await carregarAulasClub()
    await carregarSaldo(clienteSel.id)
    await carregarClubReservas(clienteSel.id)
    setAba('agendamentos')
  }

  // ─── Demais funções (CT — sem alteração) ──────────────────────────────────
  async function salvarEdicao() {
    setSalvando(true); setErroEdicao('')
    const cpfLimpo = (form.cpf || '').replace(/\D/g, '')
    const emailLimpo = (form.email || '').trim().toLowerCase()

    if (cpfLimpo && cpfLimpo.length !== 11) {
      setErroEdicao('CPF inválido. Digite os 11 dígitos.'); setSalvando(false); return
    }
    if (cpfLimpo) {
      const { data: donoCpf } = await supabase.from('clientes').select('id, nome')
        .eq('cpf', cpfLimpo).neq('id', clienteSel.id).maybeSingle()
      if (donoCpf) {
        setErroEdicao(`Este CPF já está no cadastro de ${donoCpf.nome}. Provavelmente é um cadastro duplicado — resolva o duplicado antes de salvar.`)
        setSalvando(false); return
      }
    }
    if (emailLimpo) {
      const { data: donoEmail } = await supabase.from('clientes').select('id, nome')
        .ilike('email', emailLimpo).neq('id', clienteSel.id).maybeSingle()
      if (donoEmail) {
        setErroEdicao(`Este email já está no cadastro de ${donoEmail.nome}.`)
        setSalvando(false); return
      }
    }

    const { data, error } = await supabase.from('clientes').update({
      nome: form.nome, email: emailLimpo || null, telefone: form.telefone, cpf: cpfLimpo || null,
    }).eq('id', clienteSel.id).select().maybeSingle()

    if (error) {
      setErroEdicao('Não foi possível salvar: ' + error.message); setSalvando(false); return
    }
    if (!data) {
      setErroEdicao('Nada foi salvo — o cadastro não foi encontrado ou seu acesso não permite alterá-lo. Avise o suporte.')
      setSalvando(false); return
    }
    setClienteSel(data); setForm({ ...data }); setEditando(false)
    await carregarSaldo(data.id); buscarClientes()
    setSalvando(false)
  }

  async function desbloquear() {
    if (!confirm('Desbloquear este cliente?')) return
    await supabase.from('clientes').update({ bloqueado: false, motivo_bloqueio: null }).eq('id', clienteSel.id)
    setClienteSel({ ...clienteSel, bloqueado: false, motivo_bloqueio: null })
  }

  async function criarCliente() {
    setCriando(true); setErroCriar('')
    const { data: novoClienteData, error } = await supabase.from('clientes').insert({
      nome: formNovo.nome, email: formNovo.email || null,
      telefone: formNovo.telefone, cpf: formNovo.cpf.replace(/\D/g,''), bloqueado: false,
    }).select().single()
    if (error || !novoClienteData) { setErroCriar('Erro ao cadastrar. Verifique os dados.') }
    else { setNovoCliente(false); setFormNovo({ nome:'',email:'',telefone:'',cpf:'' }); setBusca(''); setClientes([]); await abrirCliente(novoClienteData) }
    setCriando(false)
  }

  // ─── Gerar senha provisória (cria acesso se não houver, ou redefine) ───────
  async function gerarSenhaProvisoria() {
    if (!clienteSel) return
    setGerandoSenha(true); setErroGerarSenha('')
    try {
      const { data: sessao } = await supabase.auth.getSession()
      const token = sessao?.session?.access_token
      if (!token) { setErroGerarSenha('Sessão expirada. Recarregue a página e entre novamente.'); setGerandoSenha(false); return }
      const res = await fetch('/api/gerar-senha-provisoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ cliente_id: clienteSel.id }),
      })
      const result = await res.json()
      if (!res.ok) { setErroGerarSenha(result.error || 'Erro ao gerar senha provisória.'); setGerandoSenha(false); return }
      // Atualiza o cliente selecionado (ex.: passou a ter acesso)
      const { data: cliAtualizado } = await supabase.from('clientes').select('*').eq('id', clienteSel.id).maybeSingle()
      if (cliAtualizado) setClienteSel(cliAtualizado)
      setSenhaCopiada(false)
      setModalSenhaProvisoria({ nome: result.nome, email: result.email ?? null, senha: result.senha_provisoria, acao: result.acao })
    } catch (e: any) { setErroGerarSenha('Erro: ' + (e.message || 'desconhecido')) }
    finally { setGerandoSenha(false) }
  }

  async function copiarSenhaProvisoria() {
    if (!modalSenhaProvisoria) return
    try { await navigator.clipboard.writeText(modalSenhaProvisoria.senha); setSenhaCopiada(true); setTimeout(() => setSenhaCopiada(false), 3000) }
    catch (e) { alert('Não foi possível copiar. Selecione e copie manualmente.') }
  }

  async function abrirVenda() {
    if (!unidadeAtiva) return
    const { data } = await supabase.from('produtos').select('*').eq('ativo', true)
      .or(`unidade_id.eq.${unidadeAtiva.id},unidade_id.is.null`).order('nome')
    setProdutosDisp(data || [])
    setFormVenda({
      produto_id: data && data[0] ? data[0].id : '',
      quantidade: 1, valor_unitario: data && data[0] ? Number(data[0].valor) : 0,
      desconto_percentual: 0, forma_pagamento: 'pix', observacao: '',
    })
    setCodigoLiberacao(''); setLiberacao(null); setErroCodigo('')
    setVendaSucesso(null); setEntradaStatus('idle'); setEntradaErro('')
    setAulasClubSucesso([]); setContagensClubSucesso({})
    setErroVenda(''); setModalVenda(true)
  }

  // Carrega as aulas de HOJE da unidade Club atual (atalho da tela de sucesso).
  // Mesma leitura da aba Agendar, mas isolada pra não mexer no estado dela.
  async function carregarAulasClubHoje() {
    if (!unidadeAtiva) return
    setLoadingAulasSucesso(true)
    setAulasClubSucesso([]); setContagensClubSucesso({})
    const hoje = dataLocalStr(new Date())
    const { data: aulasIds } = await supabase.from('club_aulas').select('id')
      .eq('unidade_id', unidadeAtiva.id).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    if (!ids.length) { setLoadingAulasSucesso(false); return }
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('*, club_aulas(tipo, horario, capacidade, duracao_min, coaches(nome), grupos_musculares(nome))')
      .in('aula_id', ids).eq('data', hoje).eq('status', 'ativa')
    const lista = (ocs || []).sort((a: any, b: any) =>
      (a.club_aulas?.horario || '').localeCompare(b.club_aulas?.horario || ''))
    setAulasClubSucesso(lista)
    if (lista.length) {
      const { data: reservas } = await supabase.from('club_reservas')
        .select('ocorrencia_id, status').in('ocorrencia_id', lista.map((o: any) => o.id))
      const cont: Record<string, any> = {}
      for (const oc of lista) {
        const rs = (reservas || []).filter((r: any) => r.ocorrencia_id === oc.id)
        cont[oc.id] = {
          total: oc.club_aulas?.capacidade || 0,
          reservado: rs.filter((r: any) => r.status === 'reservado').length,
          presente: rs.filter((r: any) => r.status === 'presente').length,
          falta: rs.filter((r: any) => r.status === 'falta').length,
        }
      }
      setContagensClubSucesso(cont)
    }
    setLoadingAulasSucesso(false)
  }

  // Atalho Club: fecha a venda e abre o modal de reserva que já existe
  // (o crédito avulso recém-comprado aparece como opção "avulso").
  function irParaReservaClub(oc: any) {
    setModalVenda(false)
    setVendaSucesso(null)
    abrirModalAulaClub(oc)
  }

  // Fecha o modal de venda e volta pra aba de vendas (usado no X e no "Fechar" da tela de sucesso)
  function fecharModalVenda() {
    setModalVenda(false)
    if (vendaSucesso) { setAba('vendas'); setVendaSucesso(null) }
  }

  // Atalho da tela de sucesso: registra a entrada na Musculação Livre agora,
  // descontando 1 crédito avulso (credito_treino). Reaproveita a RPC do walk-in.
  async function registrarEntradaWalkin() {
    if (!vendaSucesso) return
    setEntradaStatus('registrando'); setEntradaErro('')
    const { error } = await supabase.rpc('registrar_acesso_livre_ct', { p_cliente_id: vendaSucesso.cliente_id })
    if (error) {
      const msg = error.message || ''
      if (msg.includes('SEM_CREDITO')) setEntradaErro('Cliente está sem saldo avulso disponível.')
      else if (msg.includes('NAO_AUTORIZADO')) setEntradaErro('Você não tem permissão para registrar.')
      else setEntradaErro('Erro ao registrar: ' + msg)
      setEntradaStatus('erro')
      return
    }
    setEntradaStatus('ok')
    await carregarSaldo(vendaSucesso.cliente_id)
  }

  function selecionarProduto(produtoId: string) {
    const p = produtosDisp.find(x => x.id === produtoId)
    // trocar de produto zera qualquer desconto/liberação em andamento
    if (p) setFormVenda({ ...formVenda, produto_id: produtoId, valor_unitario: Number(p.valor), desconto_percentual: 0 })
    setCodigoLiberacao(''); setLiberacao(null); setErroCodigo('')
  }

  async function validarCodigoLiberacao() {
    const cod = codigoLiberacao.trim()
    if (!cod) { setErroCodigo('Digite o código.'); return }
    setValidandoCodigo(true); setErroCodigo('')
    const { data, error } = await supabase.rpc('validar_codigo_liberacao', { p_codigo: cod })
    setValidandoCodigo(false)
    if (error) { setErroCodigo('Erro ao validar: ' + error.message); return }
    if (!data || !data.valido) {
      setLiberacao(null)
      setErroCodigo('Código inválido ou expirado. Peça um novo ao admin.')
      return
    }
    setLiberacao({ desconto_maximo: Number(data.desconto_maximo) })
    setErroCodigo('')
  }

  async function confirmarVenda() {
    if (!unidadeAtiva) return
    if (!formVenda.produto_id) { setErroVenda('Selecione um produto.'); return }
    if (formVenda.quantidade < 1 || formVenda.quantidade > 20) { setErroVenda('Quantidade deve ser entre 1 e 20.'); return }
    if (formVenda.valor_unitario <= 0) { setErroVenda('Informe um valor válido.'); return }
    // Recepção: desconto só com código de liberação válido (o resto o banco garante)
    if (ehRecepcao && formVenda.desconto_percentual > 0) {
      if (!liberacao) { setErroVenda('Para aplicar desconto, valide um código de liberação do admin.'); return }
      if (formVenda.desconto_percentual > liberacao.desconto_maximo) {
        setErroVenda(`Esse código libera desconto de até ${liberacao.desconto_maximo}%.`); return
      }
    }
    setVendendo(true); setErroVenda('')
    const { data, error } = await supabase.rpc('registrar_venda', {
      p_produto_id: formVenda.produto_id, p_cliente_id: clienteSel.id,
      p_quantidade: formVenda.quantidade, p_valor_unitario: formVenda.valor_unitario,
      p_forma_pagamento: formVenda.forma_pagamento, p_vendido_por: perfil?.id,
      p_unidade_id: unidadeAtiva.id, p_observacao: formVenda.observacao.trim()||null,
      p_desconto_percentual: formVenda.desconto_percentual,
      p_codigo_liberacao: (ehRecepcao && liberacao) ? codigoLiberacao.trim() : null,
    })
    setVendendo(false)
    if (error) { setErroVenda('Erro ao registrar venda: ' + error.message); return }
    if (data && !data.sucesso) {
      const MOTIVOS: Record<string,string> = {
        preco_alterado_sem_autorizacao: 'O valor não confere com o preço do produto.',
        desconto_sem_liberacao: 'Desconto exige um código de liberação do admin.',
        codigo_invalido_ou_expirado: 'Código de liberação inválido ou expirado.',
        desconto_acima_do_teto: `Desconto acima do liberado por esse código${data.teto?` (até ${data.teto}%)`:''}.`,
      }
      setErroVenda(MOTIVOS[data.motivo] || ('Erro: ' + (data.motivo||'desconhecido'))); return
    }
    const prod = produtosDisp.find(p => p.id === formVenda.produto_id)
    await Promise.all([carregarSaldo(clienteSel.id), carregarVendas(clienteSel.id), carregarPlanosCliente(clienteSel.id)])
    // Atalho só para crédito de treino: no CT vira walk-in (musculação livre),
    // no Club vira reserva numa aula do dia. Nas demais unidades, sem atalho.
    const contexto: 'ct' | 'club' | null = prod?.tipo === 'credito_treino'
      ? (unidadeAtiva.tipo === 'ct' ? 'ct' : unidadeAtiva.tipo === 'club' ? 'club' : null)
      : null
    setVendaSucesso({
      cliente_id: clienteSel.id,
      cliente_nome: clienteSel.nome,
      nome_produto: prod?.nome ?? null,
      contexto,
    })
    setEntradaStatus('idle'); setEntradaErro('')
    if (contexto === 'club') carregarAulasClubHoje()
  }

  async function ativarPlano(planoId: string) {
    if (!clienteSel) return
    setSalvandoPlano(true)
    const { data: existente } = await supabase.from('cliente_planos').select('id,ativo')
      .eq('cliente_id', clienteSel.id).eq('plano_id', planoId).maybeSingle()
    let errPlano = null
    if (existente) {
      const { error } = await supabase.from('cliente_planos').update({ ativo:true, contrato_aceito_em: new Date().toISOString(), fim:null }).eq('id', existente.id)
      errPlano = error
    } else {
      const { error } = await supabase.from('cliente_planos').insert({ cliente_id: clienteSel.id, plano_id: planoId, ativo:true, contrato_aceito_em: new Date().toISOString() })
      errPlano = error
    }
    if (errPlano) { setSalvandoPlano(false); alert('Erro ao ativar plano: ' + errPlano.message); return }
    const planoInfo = planosDisponiveis.find(p => p.id === planoId)
    if (planoInfo) {
      const agora = new Date()
      await supabase.from('cliente_creditos').insert({
        cliente_id: clienteSel.id, tipo: planoInfo.tipo, mes: agora.getMonth()+1, ano: agora.getFullYear(),
        total: planoInfo.creditos_mes, usado:0, unidade_id: planoInfo.unidade_id,
        gerado_automatico: false, observacao: 'Gerado na ativação do plano pela recepção',
      })
    }
    setSalvandoPlano(false); setModalAtivarPlano(null)
    await carregarPlanosCliente(clienteSel.id); await carregarSaldo(clienteSel.id)
  }

  async function desativarPlano(cpId: string) {
    if (!confirm('Desativar este plano? O cliente perderá acesso a partir de hoje.')) return
    await supabase.from('cliente_planos').update({ ativo:false, fim: new Date().toISOString().split('T')[0] }).eq('id', cpId)
    await carregarPlanosCliente(clienteSel.id); await carregarSaldo(clienteSel.id)
  }

  function abrirAjusteVencimento(cp: any) { setModalVencimento(cp); setNovoVencimento(cp.fim||''); setErroVencimento('') }

  async function salvarNovoVencimento() {
    if (!modalVencimento) return
    if (!novoVencimento) { setErroVencimento('Informe uma data válida.'); return }
    setAjustandoVencimento(true); setErroVencimento('')
    const { error } = await supabase.from('cliente_planos').update({ fim: novoVencimento }).eq('id', modalVencimento.id)
    setAjustandoVencimento(false)
    if (error) { setErroVencimento('Erro ao salvar: ' + error.message); return }
    setModalVencimento(null); await carregarPlanosCliente(clienteSel.id)
  }

  async function cancelarAgendamento(agId: string) {
    if (!confirm('Cancelar este agendamento? O crédito será devolvido ao cliente.')) return
    setCancelandoId(agId)
    const { error } = await supabase.from('agendamentos').update({
      status: 'cancelado', cancelado_em: new Date().toISOString(), motivo_cancelamento: 'Cancelado pela recepção',
    }).eq('id', agId)
    setCancelandoId(null)
    if (error) { alert('Erro ao cancelar: ' + error.message); return }
    await Promise.all([carregarSaldo(clienteSel.id), carregarHistorico(clienteSel.id)])
  }

  function planosDisponiveisParaAtivar() {
    if (!unidadeAtiva) return []
    const planosAtivos = planosCliente.filter(p => p.ativo).map(p => p.planos_disponiveis?.id).filter(Boolean)
    return planosDisponiveis.filter(p => p.unidade_id === unidadeAtiva.id && !planosAtivos.includes(p.id))
  }

  const hoje = new Date().toISOString().split('T')[0]
  const agendamentosFuturos = historico
    .filter(a => a.data >= hoje && ['agendado','confirmado','reservado'].includes(a.status))
    .sort((a,b) => a.data.localeCompare(b.data))
  const agendamentosPassados = historico
    .filter(a => a.data < hoje || ['realizado','falta','cancelado','presente'].includes(a.status))
    .sort((a,b) => b.data.localeCompare(a.data))

  // Numeração "X/N" dos treinos de Coach CT no mês (só planos com teto — avulso/
  // pacote não recebem). Só temos saldo do mês atual, então só os treinos deste
  // mês ganham rótulo. N = total do pool; X = ordem cronológica no mês.
  const anoMesAtual = hoje.slice(0, 7)
  const numeroTreino = numerarTreinosDoMes(
    historico.map((a:any) => ({ id: a.id, data: a.data, horario: a.horario, status: a.status, tipo_credito: a.tipo_credito })),
    (tipo, ym) => {
      if (ym !== anoMesAtual) return null
      const info = saldoMes?.[tipo]
      if (!info || PLANOS_SEM_TETO.has(info.tipo_plano)) return null
      return typeof info.total === 'number' ? info.total : null
    },
  )

  const clubReservasFuturas = clubReservas.filter(cr => {
    const data = cr.club_ocorrencias?.data
    return data && data >= hoje && ['reservado','confirmado'].includes(cr.status)
  }).sort((a, b) => (a.club_ocorrencias?.data || '').localeCompare(b.club_ocorrencias?.data || ''))

  const clubReservasPassadas = clubReservas.filter(cr => {
    const data = cr.club_ocorrencias?.data
    return (data && data < hoje) || ['presente','falta','realizado'].includes(cr.status)
  }).sort((a, b) => (b.club_ocorrencias?.data || '').localeCompare(a.club_ocorrencias?.data || ''))

  // Coach CT, Club e walk-in numa lista só, ordenada por dia (chave = data+horário)
  const chaveCt = (a: any) => `${a.data || ''}T${(a.horario || '').slice(0,5)}`
  const chaveClub = (cr: any) => `${cr.club_ocorrencias?.data || ''}T${(cr.club_ocorrencias?.club_aulas?.horario || '').slice(0,5)}`
  const itensFuturos = [
    ...agendamentosFuturos.map(a => ({ kind: 'ct' as const, chave: chaveCt(a), item: a })),
    ...clubReservasFuturas.map(cr => ({ kind: 'club' as const, chave: chaveClub(cr), item: cr })),
  ].sort((a, b) => a.chave.localeCompare(b.chave))
  const itensPassados = [
    ...agendamentosPassados.map(a => ({ kind: 'ct' as const, chave: chaveCt(a), item: a })),
    ...clubReservasPassadas.map(cr => ({ kind: 'club' as const, chave: chaveClub(cr), item: cr })),
    ...acessosWalkin.map(w => ({ kind: 'walkin' as const, chave: `${w.data || ''}T00:00`, item: w })),
  ].sort((a, b) => b.chave.localeCompare(a.chave))

  const totalFuturos = agendamentosFuturos.length + clubReservasFuturas.length

  const abas = [
    { key: 'dados', label: 'Dados' },
    { key: 'planos', label: 'Planos' },
    { key: 'vendas', label: `Vendas${vendas.length > 0 ? ` (${vendas.length})` : ''}` },
    { key: 'agendamentos', label: `Agenda${totalFuturos > 0 ? ` (${totalFuturos})` : ''}` },
    { key: 'historico', label: 'Histórico' },
    { key: 'agendar', label: '+ Agendar' },
  ]

  const saldosUnidadeAtiva = Object.entries(saldoMes).filter(([_, info]: [string, any]) => info.unidade_id === unidadeAtiva?.id)
  const planosAppsParceiros = planosCliente.filter(p => p.ativo && p.planos_disponiveis)
  const planosJustCT = planosCliente.filter(p => p.ativo && p.produtos && p.produtos.subtipo === 'acesso')
  const appsPorUnidade: Record<string, any[]> = {}
  for (const cp of planosAppsParceiros) {
    const u = cp.planos_disponiveis?.unidades; if (!u) continue
    if (!appsPorUnidade[u.id]) appsPorUnidade[u.id] = []; appsPorUnidade[u.id].push(cp)
  }
  const saldosPorUnidade: Record<string, any[]> = {}
  for (const [key, info] of Object.entries(saldoMes)) {
    const uid = (info as any).unidade_id; if (!uid) continue
    if (!saldosPorUnidade[uid]) saldosPorUnidade[uid] = []; saldosPorUnidade[uid].push({ key, ...(info as any) })
  }
  function isPlanoVigente(cp: any) { if (!cp.fim) return true; return cp.fim >= hoje }
  function diasRestantesPlano(cp: any) {
    if (!cp.fim) return null
    return Math.ceil((new Date(cp.fim+'T12:00:00').getTime() - new Date().getTime()) / (1000*60*60*24))
  }

  const produtoSelecionado = produtosDisp.find(p => p.id === formVenda.produto_id)
  const valorOriginal = formVenda.quantidade * formVenda.valor_unitario
  const valorTotalComDesconto = valorOriginal * (1 - formVenda.desconto_percentual / 100)
  const ehAcesso = produtoSelecionado?.subtipo === 'acesso'

  const clienteTemAcesso = !!clienteSel?.user_id

  // Club: datas rápidas
  const dataHoje = dataLocalStr(new Date())
  const dataAmanha = dataLocalStr(new Date(Date.now() + 86400000))
  const dataOntem = dataLocalStr(new Date(Date.now() - 86400000))
  function labelData(d: string) {
    if (d===dataHoje) return 'Hoje'
    if (d===dataAmanha) return 'Amanhã'
    if (d===dataOntem) return 'Ontem'
    return new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'})
  }

  // Club: créditos disponíveis no modal
  const planosDispClub = Object.entries(saldoClubModal).filter(([,v]:any) => v?.disponivel > 0).map(([k]) => k)

  if (loading || loadingUnidade || !perfil) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!unidadeAtiva) return (
    <div className="flex items-center justify-center h-screen p-6 text-center">
      <div><AlertCircle size={32} className="text-orange-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Sem acesso a unidades</h2></div>
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
            <div className="text-base font-semibold text-gray-900">{clienteSel ? clienteSel.nome : 'Clientes'}</div>
            {!clienteSel && <div className="text-xs text-gray-400">Digite para buscar</div>}
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
              <input className="input pl-9 w-full" placeholder="Buscar por nome, CPF ou email..."
                value={busca} onChange={e => setBusca(e.target.value)} autoFocus />
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
                      {c.nome?.slice(0,2).toUpperCase()}
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

            {/* ─── ABA DADOS ─── */}
            {aba === 'dados' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-5 text-white flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-white/20 text-white text-xl font-bold flex items-center justify-center flex-shrink-0">
                    {clienteSel.nome?.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-lg leading-tight">{clienteSel.nome}</div>
                    <div className="text-primary-200 text-sm mt-0.5">{clienteSel.email || '—'}</div>
                  </div>
                </div>

                {planosJustCT.filter(isPlanoVigente).length > 0 && (
                  <div className="card border-l-4 border-l-amber-400">
                    <div className="flex items-center gap-2 mb-3">
                      <CalendarClock size={16} className="text-amber-600" />
                      <div className="text-sm font-semibold text-gray-900">Plano Just CT ativo</div>
                    </div>
                    <div className="space-y-2">
                      {planosJustCT.filter(isPlanoVigente).map(cp => {
                        const dias = diasRestantesPlano(cp)
                        return (
                          <div key={cp.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <div className="text-sm font-semibold text-amber-900">{cp.produtos?.nome}</div>
                            <div className="text-xs text-amber-700 mt-1">
                              Válido até <strong>{cp.fim ? formatarBR(cp.fim) : '—'}</strong>
                              {dias !== null && dias >= 0 && <span className="ml-1">({dias} dias restantes)</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {Object.keys(saldosPorUnidade).length > 0 && (
                  <div className="card">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap size={16} className="text-primary-600" />
                      <div className="text-sm font-semibold text-gray-900">Créditos disponíveis</div>
                      <span className="text-xs text-gray-400">· este mês</span>
                    </div>
                    <div className="space-y-3">
                      {todasUnidades.map(u => {
                        const saldosU = saldosPorUnidade[u.id]
                        if (!saldosU || saldosU.length === 0) return null
                        return (
                          <div key={u.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.tipo==='ct'?'bg-primary-100 text-primary-700':'bg-blue-100 text-blue-700'}`}>
                                {u.tipo==='ct'?'CT':'Club'}
                              </span>
                              <span className="text-xs font-semibold text-gray-700">{u.nome}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {saldosU.map((s: any) => (
                                <div key={s.key} className="bg-white rounded-lg p-2 text-center border border-gray-100">
                                  <div className={`text-2xl font-bold ${s.disponivel===0?'text-gray-300':s.disponivel<=2?'text-orange-500':'text-primary-600'}`}>
                                    {s.disponivel}
                                  </div>
                                  <div className="text-xs text-gray-500 capitalize mt-0.5 truncate">{s.tipo_plano}</div>
                                  <div className="text-xs text-gray-400 mt-0.5">de {s.total}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-gray-900">Informações</div>
                    {!editando ? (
                      <button onClick={() => { setErroEdicao(''); setEditando(true) }} className="btn btn-sm text-primary-600">Editar</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => { setEditando(false); setErroEdicao(''); setForm(clienteSel) }} className="btn btn-sm text-gray-500">Cancelar</button>
                        <button onClick={salvarEdicao} disabled={salvando} className="btn btn-sm gap-1 bg-primary-600 text-white">
                          <Check size={12} /> {salvando ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label:'Nome', key:'nome', type:'text', full:true },
                      { label:'Email', key:'email', type:'email', full:true },
                      { label:'Telefone', key:'telefone', type:'text', full:false },
                      { label:'CPF', key:'cpf', type:'text', full:false },
                    ].map(f => (
                      <div key={f.key} className={f.full ? 'col-span-2' : ''}>
                        <div className="text-xs text-gray-400 mb-1">{f.label}</div>
                        {editando ? (
                          <input type={f.type} className="input w-full" value={form[f.key]||''}
                            onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{clienteSel[f.key]||'—'}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  {erroEdicao && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2 mt-3 text-xs text-red-700">{erroEdicao}</div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <button onClick={gerarSenhaProvisoria} disabled={gerandoSenha} className="btn btn-sm gap-1 bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                      <KeyRound size={12} /> {gerandoSenha ? 'Gerando...' : 'Gerar senha provisória'}
                    </button>
                    <div className="text-xs text-gray-400 mt-2 leading-relaxed">
                      Gera uma senha na hora para passar ao cliente (quando o email não chega). {clienteTemAcesso ? 'Redefine a senha atual do cliente.' : 'Cria o acesso — precisa de email cadastrado.'}
                    </div>
                    {erroGerarSenha && <div className="bg-red-50 border border-red-200 rounded-lg p-2 mt-2 text-xs text-red-700">{erroGerarSenha}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* ─── ABA PLANOS ─── */}
            {aba === 'planos' && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <CalendarClock size={12} /> Planos Just CT
                  </div>
                  {planosJustCT.length === 0 ? (
                    <div className="card text-center py-6 text-gray-400 text-sm">Nenhum plano de acesso ativo. Venda um Plano Semestral ou Anual.</div>
                  ) : (
                    <div className="space-y-2">
                      {planosJustCT.map(cp => {
                        const vigente = isPlanoVigente(cp); const dias = diasRestantesPlano(cp)
                        return (
                          <div key={cp.id} className={`card border-l-4 ${vigente?'border-l-amber-400':'border-l-gray-300 opacity-60'}`}>
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                                <CalendarClock size={18} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-900">{cp.produtos?.nome}</span>
                                  {!vigente && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Vencido</span>}
                                </div>
                                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                  <div>Início: <strong>{cp.inicio ? formatarBR(cp.inicio) : '—'}</strong></div>
                                  <div>Vencimento: <strong className={vigente?'text-amber-700':'text-red-600'}>{cp.fim ? formatarBR(cp.fim) : '—'}</strong>
                                    {vigente && dias!==null && <span className="text-gray-400 ml-1">({dias} dias restantes)</span>}
                                  </div>
                                  {cp.produtos?.unidades?.nome && <div>Unidade: {cp.produtos.unidades.nome}</div>}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <button onClick={() => abrirAjusteVencimento(cp)} className="btn btn-sm gap-1 text-amber-700 hover:bg-amber-50">
                                  <Edit2 size={11} /> Ajustar
                                </button>
                                <button onClick={() => desativarPlano(cp.id)} className="btn btn-sm gap-1 text-red-500 hover:bg-red-50 text-xs">
                                  <Trash2 size={11} /> Cancelar
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold text-primary-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Zap size={12} /> Apps Parceiros (Wellhub / TotalPass)
                  </div>
                  {Object.keys(appsPorUnidade).length === 0 ? (
                    <div className="card text-center py-6 text-gray-400 text-sm">Cliente sem planos de app parceiro ativos.</div>
                  ) : (
                    todasUnidades.map(u => {
                      const planosU = appsPorUnidade[u.id]||[]; if (!planosU.length) return null
                      const podeMexer = u.id === unidadeAtiva.id || perfil?.role === 'admin'
                      return (
                        <div key={u.id} className="card mb-2">
                          <div className="flex items-center gap-2 mb-3">
                            <Building2 size={14} className="text-gray-400" />
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.tipo==='ct'?'bg-primary-100 text-primary-700':'bg-blue-100 text-blue-700'}`}>
                              {u.tipo==='ct'?'CT':'Club'}
                            </span>
                            <span className="text-sm font-semibold text-gray-900">{u.nome}</span>
                            {!podeMexer && <span className="text-xs text-gray-400 italic">(somente leitura)</span>}
                          </div>
                          <div className="space-y-2">
                            {planosU.map((cp: any) => {
                              const pd = cp.planos_disponiveis
                              const saldoKey = Object.keys(saldoMes).find(k => saldoMes[k]?.unidade_id===u.id && saldoMes[k]?.tipo_plano===pd?.tipo)
                              const saldo = saldoKey ? saldoMes[saldoKey] : null
                              return (
                                <div key={cp.id} className="border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-gray-900">{pd?.nome}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      {pd?.creditos_mes} sessões/mês
                                      {saldo && <> · <span className="font-bold text-primary-600">{saldo.disponivel}</span> disponível este mês</>}
                                    </div>
                                    {cp.contrato_aceito_em && (
                                      <div className="text-xs text-gray-400 mt-0.5">Contrato aceito em {new Date(cp.contrato_aceito_em).toLocaleDateString('pt-BR')}</div>
                                    )}
                                  </div>
                                  {podeMexer && (
                                    <button onClick={() => desativarPlano(cp.id)} className="btn btn-sm gap-1 text-red-500 hover:bg-red-50">
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
                        <Plus size={14} /> Ativar app parceiro em {unidadeAtiva.nome}
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

                {/* ─── CRÉDITOS AVULSOS / PACOTES (somente leitura — recepção) ─── */}
                <div>
                  <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-2"><Package size={12} /> Créditos avulsos / Pacotes</div>
                  {avulsosPacotes.length === 0 ? (
                    <div className="card text-center py-6 text-gray-400 text-sm">Nenhum crédito avulso.</div>
                  ) : (
                    <div className="space-y-2">
                      {avulsosPacotes.map(pac => {
                        const venc = pac.validade ? new Date(pac.validade + 'T12:00:00') : null
                        const vigente = venc ? venc >= new Date(new Date().toDateString()) : true
                        return (
                          <div key={pac.chave} className={`card border-l-4 ${pac.disponiveis > 0 && vigente ? 'border-l-blue-400' : 'border-l-gray-300 opacity-70'}`}>
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0"><Package size={18} /></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-900">{pac.observacao || 'Créditos avulsos'}</span>
                                  {!vigente && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Vencido</span>}
                                  {pac.unidade_nome
                                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{pac.unidade_nome}</span>
                                    : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Todas as unidades</span>}
                                </div>
                                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                  <div>Validade: <strong className={vigente ? 'text-blue-700' : 'text-red-600'}>{pac.validade ? formatarBR(pac.validade) : '—'}</strong></div>
                                  <div><span className="font-bold text-blue-600">{pac.disponiveis}</span> disponíveis<span className="text-gray-400"> · {pac.usados} usados · {pac.total} no total</span></div>
                                  {pac.reservas && pac.reservas.length > 0 && (
                                    <div className="mt-1 pl-2 border-l-2 border-blue-100 space-y-0.5">
                                      {pac.reservas
                                        .slice()
                                        .sort((a: any, b: any) => (a.club_ocorrencias?.data || '').localeCompare(b.club_ocorrencias?.data || ''))
                                        .map((r: any) => (
                                          <div key={r.id} className="text-[11px] text-gray-500">
                                            {r.club_ocorrencias?.data ? formatarBR(r.club_ocorrencias.data) : '—'}
                                            {r.club_ocorrencias?.club_aulas?.horario ? ` · ${r.club_ocorrencias.club_aulas.horario}` : ''}
                                            {r.club_ocorrencias?.club_aulas?.tipo ? ` · ${r.club_ocorrencias.club_aulas.tipo}` : ''}
                                            {r.club_ocorrencias?.club_aulas?.unidades?.nome ? ` · ${r.club_ocorrencias.club_aulas.unidades.nome}` : ''}
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── ABA VENDAS ─── */}
            {aba === 'vendas' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-gray-900">Histórico de vendas</div>
                  <button onClick={abrirVenda} className="btn btn-sm gap-1 bg-green-600 text-white hover:bg-green-700">
                    <ShoppingCart size={12} /> Nova venda
                  </button>
                </div>
                {vendas.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">Nenhuma venda registrada para este cliente.</div>
                ) : (
                  <div className="space-y-2">
                    {vendas.map(v => {
                      const teveDesconto = v.desconto_percentual && v.desconto_percentual > 0
                      const ehCortesia = v.desconto_percentual === 100
                      return (
                        <div key={v.id} className="card">
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl ${ehCortesia?'bg-amber-100 text-amber-700':'bg-green-50 text-green-700'} flex items-center justify-center flex-shrink-0`}>
                              {ehCortesia ? <Gift size={18} /> : <Package size={18} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-900">{v.produtos?.nome||'Produto removido'}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{v.quantidade}x</span>
                                {v.produtos?.subtipo==='acesso' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Acesso</span>}
                                {ehCortesia && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">🎁 Cortesia</span>}
                                {v.unidades?.nome && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{v.unidades.nome}</span>}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                                {teveDesconto && !ehCortesia && v.valor_original && (
                                  <span className="line-through text-gray-400">R$ {Number(v.valor_original).toFixed(2).replace('.',',')}</span>
                                )}
                                <span className={`font-mono font-bold ${ehCortesia?'text-amber-700':'text-green-700'}`}>
                                  R$ {Number(v.valor_total).toFixed(2).replace('.',',')}
                                </span>
                                {teveDesconto && !ehCortesia && <span className="text-orange-600 font-medium">-{v.desconto_percentual}%</span>}
                                <span>{FORMAS_PAGAMENTO.find(f => f.key===v.forma_pagamento)?.label||v.forma_pagamento}</span>
                                <span>{new Date(v.vendido_em).toLocaleDateString('pt-BR')} {new Date(v.vendido_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
                              </div>
                              {v.perfis?.nome && <div className="text-xs text-gray-400 mt-0.5">Vendido por {v.perfis.nome}</div>}
                              {v.observacao && <div className="text-xs text-gray-500 mt-1 italic">{v.observacao}</div>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─── ABA AGENDAMENTOS ─── */}
            {aba === 'agendamentos' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-gray-900">Próximos agendamentos</div>
                  <button onClick={() => setAba('agendar')} className="btn btn-sm gap-1 bg-primary-600 text-white">
                    <Plus size={12} /> Agendar
                  </button>
                </div>
                {totalFuturos === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">Nenhum agendamento futuro.</div>
                ) : (
                  <div className="space-y-2">
                    {itensFuturos.map(it => {
                      if (it.kind === 'ct') {
                        const ag = it.item
                        const cred = creditoLabel(ag.tipo_credito)
                        return (
                          <div key={ag.id} className="card border-l-4 border-l-blue-400">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-blue-50 flex flex-col items-center justify-center flex-shrink-0">
                                <div className="text-sm font-bold text-blue-700 leading-none">{new Date(ag.data+'T12:00:00').getDate()}</div>
                                <div className="text-xs text-blue-500 uppercase">{new Date(ag.data+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'})}</div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-base font-bold text-gray-900">Coach CT</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">Coach CT</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>{statusConfig[ag.status]?.label}</span>
                                  {numeroTreino.get(ag.id) && <span title="treino do mês" className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold font-mono">{numeroTreino.get(ag.id)}</span>}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500 mt-0.5">
                                  <span className="capitalize">{new Date(ag.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long'})}</span>
                                  <span className="text-gray-300">·</span>
                                  <span className="font-mono">{(ag.horario||'').slice(0,5)}</span>
                                  {ag.unidades?.nome && <><span className="text-gray-300">·</span><span>{ag.unidades.nome}</span></>}
                                </div>
                                {cred.label && <div className="text-xs text-gray-500 mt-1">{cred.icon} {cred.label}</div>}
                                {(() => { const o = origemReserva((ag as any).criado_via); const q = reservadoEm((ag as any).created_at); if (!o && !q) return null; return (
                                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-400 mt-0.5">
                                    {o && <span className={`px-1.5 py-0.5 rounded-full ${o.cls}`}>{o.label}</span>}
                                    {q && <span>agendado em {q}</span>}
                                  </div>
                                )})()}
                              </div>
                            </div>
                          </div>
                        )
                      }
                      const cr = it.item
                      const oc = cr.club_ocorrencias
                      const aula = oc?.club_aulas
                      const data = oc?.data || ''
                      const cred = creditoLabel(cr.tipo_credito)
                      return (
                        <div key={cr.id} className="card border-l-4 border-l-purple-400">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 flex flex-col items-center justify-center flex-shrink-0">
                              <div className="text-sm font-bold text-purple-700 leading-none">{data ? new Date(data+'T12:00:00').getDate() : '—'}</div>
                              <div className="text-xs text-purple-500 uppercase">{data ? new Date(data+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'}) : ''}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-bold text-gray-900">{tipoLabelClub(aula?.tipo) || 'Club'}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Club</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[cr.status]?.color || 'bg-gray-100 text-gray-600'}`}>{statusConfig[cr.status]?.label || cr.status}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500 mt-0.5">
                                <span className="capitalize">{data ? new Date(data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long'}) : '—'}</span>
                                <span className="text-gray-300">·</span>
                                <span className="font-mono">{(aula?.horario||'').slice(0,5)}</span>
                                {aula?.unidades?.nome && <><span className="text-gray-300">·</span><span>{aula.unidades.nome}</span></>}
                              </div>
                              {cred.label && <div className="text-xs text-gray-500 mt-1">{cred.icon} {(cr as any).creditos_avulsos?.observacao || cred.label}</div>}
                              {(() => { const o = origemReserva((cr as any).criado_via); const q = reservadoEm((cr as any).created_at); if (!o && !q) return null; return (
                                <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-400 mt-0.5">
                                  {o && <span className={`px-1.5 py-0.5 rounded-full ${o.cls}`}>{o.label}</span>}
                                  {q && <span>reservado em {q}</span>}
                                </div>
                              )})()}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─── ABA HISTÓRICO ─── */}
            {aba === 'historico' && (
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-4">Histórico de treinos</div>
                {itensPassados.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">Nenhum histórico encontrado.</div>
                ) : (
                  <div className="space-y-2">
                    {itensPassados.map(it => {
                      if (it.kind === 'walkin') {
                        const w = it.item
                        const uNome = todasUnidades.find((u: any) => u.id === w.unidade_id)?.nome
                        const pacote = (w as any).creditos_avulsos?.observacao
                        return (
                          <div key={w.id} className="card flex items-center gap-3 border-l-4 border-l-green-400">
                            <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 bg-green-50">
                              <div className="text-sm font-bold leading-none text-green-700">{w.data ? new Date(w.data+'T12:00:00').getDate() : '—'}</div>
                              <div className="text-xs uppercase text-green-500">{w.data ? new Date(w.data+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'}) : ''}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-bold text-gray-900">Musculação Livre</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">Walk-in CT</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Realizado</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500 mt-0.5">
                                <span className="capitalize">{w.data ? new Date(w.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long'}) : '—'}</span>
                                {uNome && <><span className="text-gray-300">·</span><span>{uNome}</span></>}
                              </div>
                              {pacote && <div className="text-xs text-gray-500 mt-1">📦 {pacote}</div>}
                            </div>
                          </div>
                        )
                      }
                      if (it.kind === 'ct') {
                        const ag = it.item
                        const cred = creditoLabel(ag.tipo_credito)
                        return (
                          <div key={ag.id} className={`card flex items-center gap-3 border-l-4 ${
                            ag.status==='realizado'?'border-l-green-400':ag.status==='falta'?'border-l-orange-400':'border-l-gray-200'
                          }`}>
                            <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                              ag.status==='realizado'?'bg-green-50':ag.status==='falta'?'bg-orange-50':'bg-gray-50'
                            }`}>
                              <div className={`text-sm font-bold leading-none ${ag.status==='realizado'?'text-green-700':ag.status==='falta'?'text-orange-700':'text-gray-500'}`}>
                                {new Date(ag.data+'T12:00:00').getDate()}
                              </div>
                              <div className={`text-xs uppercase ${ag.status==='realizado'?'text-green-500':ag.status==='falta'?'text-orange-500':'text-gray-400'}`}>
                                {new Date(ag.data+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'})}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-bold text-gray-900">Coach CT</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>{statusConfig[ag.status]?.label}</span>
                                {numeroTreino.get(ag.id) && <span title="treino do mês" className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold font-mono">{numeroTreino.get(ag.id)}</span>}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500 mt-0.5">
                                <span className="capitalize">{new Date(ag.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long'})}</span>
                                <span className="text-gray-300">·</span>
                                <span className="font-mono">{(ag.horario||'').slice(0,5)}</span>
                                {ag.unidades?.nome && <><span className="text-gray-300">·</span><span>{ag.unidades.nome}</span></>}
                              </div>
                              {cred.label && <div className="text-xs text-gray-500 mt-1">{cred.icon} {cred.label}</div>}
                              {(() => { const o = origemReserva((ag as any).criado_via); const q = reservadoEm((ag as any).created_at); if (!o && !q) return null; return (
                                <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-400 mt-0.5">
                                  {o && <span className={`px-1.5 py-0.5 rounded-full ${o.cls}`}>{o.label}</span>}
                                  {q && <span>agendado em {q}</span>}
                                </div>
                              )})()}
                            </div>
                          </div>
                        )
                      }
                      const cr = it.item
                      const oc = cr.club_ocorrencias
                      const aula = oc?.club_aulas
                      const data = oc?.data || ''
                      const cred = creditoLabel(cr.tipo_credito)
                      return (
                        <div key={cr.id} className={`card flex items-center gap-3 border-l-4 ${
                          cr.status==='presente'?'border-l-green-400':cr.status==='falta'?'border-l-orange-400':'border-l-purple-200'
                        }`}>
                          <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                            cr.status==='presente'?'bg-green-50':cr.status==='falta'?'bg-orange-50':'bg-purple-50'
                          }`}>
                            <div className={`text-sm font-bold leading-none ${cr.status==='presente'?'text-green-700':cr.status==='falta'?'text-orange-700':'text-purple-700'}`}>
                              {data ? new Date(data+'T12:00:00').getDate() : '—'}
                            </div>
                            <div className={`text-xs uppercase ${cr.status==='presente'?'text-green-500':cr.status==='falta'?'text-orange-500':'text-purple-500'}`}>
                              {data ? new Date(data+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'}) : ''}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-bold text-gray-900">{tipoLabelClub(aula?.tipo) || 'Club'}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Club</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[cr.status]?.color || 'bg-gray-100 text-gray-600'}`}>{statusConfig[cr.status]?.label || cr.status}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500 mt-0.5">
                              <span className="capitalize">{data ? new Date(data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long'}) : '—'}</span>
                              <span className="text-gray-300">·</span>
                              <span className="font-mono">{(aula?.horario||'').slice(0,5)}</span>
                              {aula?.unidades?.nome && <><span className="text-gray-300">·</span><span>{aula.unidades.nome}</span></>}
                            </div>
                            {cred.label && <div className="text-xs text-gray-500 mt-1">{cred.icon} {(cr as any).creditos_avulsos?.observacao || cred.label}</div>}
                            {(() => { const o = origemReserva((cr as any).criado_via); const q = reservadoEm((cr as any).created_at); if (!o && !q) return null; return (
                              <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-400 mt-0.5">
                                {o && <span className={`px-1.5 py-0.5 rounded-full ${o.cls}`}>{o.label}</span>}
                                {q && <span>reservado em {q}</span>}
                              </div>
                            )})()}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─── ABA AGENDAR ─── branch CT vs Club ─── */}
            {aba === 'agendar' && !isClub && (
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-4">Agendar em {unidadeAtiva.nome}</div>
                <div className="card">
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => { setSemanaOffset(o => Math.max(0,o-1)); setDiaSel(0) }}
                      disabled={semanaOffset===0}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-30">‹</button>
                    <div className="flex gap-1 flex-1">
                      {diasSemana.map((d,i) => (
                        <button key={i} onClick={() => setDiaSel(i)}
                          className={`flex-1 py-2 rounded-lg text-center transition-all ${i===diaSel?'bg-primary-600 text-white':'bg-gray-50 border border-gray-200 text-gray-600 hover:border-primary-300'}`}>
                          <div className="text-xs font-medium">{DIAS_SEMANA[d.getDay()]}</div>
                          <div className="text-sm font-bold">{d.getDate()}</div>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setSemanaOffset(o => Math.min(3,o+1)); setDiaSel(0) }}
                      disabled={semanaOffset===3}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-30">›</button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {horariosSel.length === 0 && <div className="col-span-3 text-center py-6 text-gray-400 text-sm">Nenhum horário disponível.</div>}
                    {horariosSel.map(h => (
                      <button key={h.hora} onClick={() => h.livres > 0 && abrirModal(h.hora)} disabled={h.livres===0}
                        className={`py-3 px-3 rounded-xl text-sm font-medium border transition-all ${
                          h.livres===0 ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-primary-400 hover:bg-primary-50 active:scale-95'
                        }`}>
                        <div className="font-bold">{h.hora}</div>
                        <div className="text-xs opacity-70 mt-0.5">{h.livres===0?'Lotado':`${h.livres} vaga${h.livres!==1?'s':''}`}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {aba === 'agendar' && isClub && (
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-4">Agendar em {unidadeAtiva.nome}</div>

                {/* Seletor de data */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {[dataOntem, dataHoje, dataAmanha].map(d => (
                    <button key={d} onClick={() => setDataSel(d)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                        dataSel===d ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300'
                      }`}>
                      {labelData(d)}
                    </button>
                  ))}
                  <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 bg-white focus:outline-none focus:border-primary-400" />
                </div>

                {/* Lista de aulas */}
                {loadingAulas ? (
                  <div className="card text-center py-8 text-gray-400 text-sm">Carregando aulas...</div>
                ) : aulasClub.length === 0 ? (
                  <div className="card text-center py-8 text-gray-400 text-sm">
                    <div className="text-2xl mb-2">📅</div>
                    Nenhuma aula em {labelData(dataSel)} para {unidadeAtiva.nome}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aulasClub.map(oc => {
                      const aula = oc.club_aulas
                      const cont = contagensClub[oc.id] || { total:0, reservado:0, presente:0, falta:0 }
                      const ocupadas = cont.reservado + cont.presente + cont.falta
                      const vagas = Math.max(0, cont.total - ocupadas)
                      const cor = tipoCorClub(aula?.tipo)
                      return (
                        <button key={oc.id} onClick={() => abrirModalAulaClub(oc)}
                          disabled={vagas === 0}
                          className={`w-full text-left card border transition-all ${vagas===0?'opacity-50 cursor-not-allowed':'hover:border-primary-300 active:scale-[0.99]'}`}
                          style={{ borderLeftWidth:4, borderLeftColor: cor }}>
                          <div className="flex items-center gap-4">
                            <div>
                              <div className="font-mono text-xl font-bold text-gray-900">{(aula?.horario||'').slice(0,5)}</div>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color:cor, background:`${cor}18` }}>
                                  {tipoLabelClub(aula?.tipo)}
                                </span>
                              </div>
                              <div className="text-sm font-semibold text-gray-900">{aula?.grupos_musculares?.nome||'—'}</div>
                              <div className="text-xs text-gray-500 mt-0.5">👤 {aula?.coaches?.nome?.split(' ')[0]||'—'} · {aula?.duracao_min||50}min</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className={`text-2xl font-bold ${vagas===0?'text-gray-300':vagas<=3?'text-orange-500':'text-gray-900'}`}>{vagas}</div>
                              <div className="text-xs text-gray-400">vagas</div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── MODAL CT: confirmar agendamento ─── */}
      {modalSlot && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900">Confirmar agendamento</div>
                <div className="text-sm text-gray-400 mt-0.5 capitalize">
                  {new Date(modalSlot.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} · {modalSlot.hora}
                </div>
                <div className="text-xs text-gray-400">{unidadeAtiva.nome}</div>
              </div>
              <button onClick={() => setModalSlot(null)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="mb-4">
              <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Usar crédito de</div>
              <div className="space-y-2">
                {saldosUnidadeAtiva.length === 0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">Cliente sem créditos disponíveis nesta unidade.</div>
                ) : (
                  saldosUnidadeAtiva.map(([key, info]: [string, any]) => {
                    const restante = info.disponivel; const semSaldo = restante <= 0
                    return (
                      <div key={key} onClick={() => !semSaldo && setTipoCredito(info.tipo_plano)}
                        className={`border rounded-xl p-3 flex items-center gap-3 transition-all ${
                          semSaldo ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
                            : tipoCredito===info.tipo_plano ? 'bg-primary-50 border-primary-400 cursor-pointer'
                            : 'border-gray-200 hover:border-primary-200 cursor-pointer bg-white'
                        }`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${tipoCredito===info.tipo_plano?'border-primary-600 bg-primary-600':'border-gray-300'}`}>
                          {tipoCredito===info.tipo_plano && <div className="w-2 h-2 rounded-full bg-white"/>}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900 capitalize">{info.tipo_plano}</div>
                          <div className="text-xs text-gray-400">{restante} sessão{restante!==1?'ões':''} restante{restante!==1?'s':''}</div>
                        </div>
                        {semSaldo && <span className="text-xs text-red-400 font-medium">Sem saldo</span>}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
            {erroModal && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">{erroModal}</div>}
            <div className="flex gap-2">
              <button onClick={() => setModalSlot(null)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={confirmarAgendamento} disabled={agendando || !tipoCredito}
                className={`btn flex-1 font-medium ${tipoCredito?'bg-primary-600 text-white hover:bg-primary-700':'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                <Calendar size={14} className="mr-1.5"/> {agendando?'Confirmando...':'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL Club: confirmar agendamento em aula ─── */}
      {modalAulaClub && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900">Confirmar reserva</div>
                <div className="text-sm font-medium mt-1" style={{ color: tipoCorClub(modalAulaClub.club_aulas?.tipo) }}>
                  {tipoLabelClub(modalAulaClub.club_aulas?.tipo)} · {(modalAulaClub.club_aulas?.horario||'').slice(0,5)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {new Date(modalAulaClub.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}
                  {modalAulaClub.data === dataHoje && <span className="ml-1 text-green-600 font-medium">· Hoje</span>}
                  {modalAulaClub.data > dataHoje && <span className="ml-1 text-blue-600 font-medium">· Agendamento futuro</span>}
                </div>
              </div>
              <button onClick={() => setModalAulaClub(null)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>

            {/* Créditos disponíveis */}
            {planosDispClub.length === 0 ? (
              <div className="mb-4">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700 mb-3">
                  ⚠️ Cliente sem créditos para {unidadeAtiva.nome} neste mês.
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="text-xs font-semibold text-blue-800 mb-2">⚡ Ativar plano agora</div>
                  <div className="flex gap-2">
                    {['wellhub','totalpass'].map(tipo => (
                      <button key={tipo} onClick={() => ativarPlanoRapidoClub(tipo)}
                        className="flex-1 py-2 rounded-lg border border-blue-200 bg-white text-sm font-semibold text-blue-700 hover:bg-blue-50">
                        {tipo==='wellhub'?'💜 Wellhub':'🔵 TotalPass'}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-blue-600 mt-2 opacity-70">Ativa 12 créditos para o mês da aula</div>
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide font-semibold">Usar crédito de</div>
                <div className="space-y-2">
                  {planosDispClub.map(p => {
                    const { label, icon } = parsePlanoKey(p)
                    const info = saldoClubModal[p]
                    return (
                      <div key={p} onClick={() => setTipoCreditoClub(p)}
                        className={`border rounded-xl p-3 flex items-center gap-3 cursor-pointer transition-all ${
                          tipoCreditoClub===p ? 'bg-primary-50 border-primary-400' : 'border-gray-200 hover:border-primary-200 bg-white'
                        }`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${tipoCreditoClub===p?'border-primary-600 bg-primary-600':'border-gray-300'}`}>
                          {tipoCreditoClub===p && <div className="w-2 h-2 rounded-full bg-white"/>}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900">{icon} {label}</div>
                          <div className="text-xs text-gray-400">{info?.disponivel} crédito{info?.disponivel!==1?'s':''} restante{info?.disponivel!==1?'s':''}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {erroModalClub && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">{erroModalClub}</div>}

            <div className="flex gap-2">
              <button onClick={() => setModalAulaClub(null)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={confirmarAgendamentoClub} disabled={agendandoClub || planosDispClub.length===0}
                className={`btn flex-1 font-medium gap-1 ${planosDispClub.length===0||!tipoCreditoClub?'bg-gray-100 text-gray-400 cursor-not-allowed':'bg-primary-600 text-white hover:bg-primary-700'}`}>
                <Calendar size={14}/>
                {agendandoClub ? 'Reservando...' : modalAulaClub.data===dataHoje ? 'Confirmar presença' : 'Confirmar reserva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL Venda ─── */}
      {modalVenda && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            {vendaSucesso ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="font-bold text-gray-900 flex items-center gap-2"><CheckCircle2 size={18} className="text-green-600"/> Venda registrada</div>
                <button onClick={fecharModalVenda} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0"><Check size={18}/></div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{vendaSucesso.nome_produto || 'Produto'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">para {vendaSucesso.cliente_nome}</div>
                </div>
              </div>

              {vendaSucesso.contexto === 'ct' && (
                entradaStatus === 'ok' ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 flex items-center gap-3">
                    <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0"/>
                    <div className="text-sm text-emerald-800"><strong>Entrada registrada</strong> na Musculação Livre — 1 crédito descontado.</div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                    <div className="flex items-start gap-3 mb-3">
                      <Dumbbell size={18} className="text-emerald-600 mt-0.5 flex-shrink-0"/>
                      <div className="text-sm text-emerald-900">Vai treinar agora? Registre a entrada na <strong>Musculação Livre</strong> sem sair daqui — desconta 1 crédito avulso.</div>
                    </div>
                    {entradaErro && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-sm text-red-600 flex items-start gap-2">
                        <AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>{entradaErro}
                      </div>
                    )}
                    <button onClick={registrarEntradaWalkin} disabled={entradaStatus==='registrando'}
                      className="btn w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 font-semibold">
                      <Dumbbell size={16}/> {entradaStatus==='registrando' ? 'Registrando...' : 'Registrar entrada na musculação agora'}
                    </button>
                  </div>
                )
              )}

              {vendaSucesso.contexto === 'club' && (
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Calendar size={18} className="text-primary-600 mt-0.5 flex-shrink-0"/>
                    <div className="text-sm text-primary-900">Vai fazer aula agora? Reserve numa aula de hoje sem sair daqui — usa o crédito avulso recém-comprado.</div>
                  </div>
                  {loadingAulasSucesso ? (
                    <div className="text-center py-6 text-sm text-gray-400">Carregando aulas de hoje...</div>
                  ) : aulasClubSucesso.length === 0 ? (
                    <div className="text-center py-6 text-sm text-gray-400">Nenhuma aula hoje em {unidadeAtiva.nome}.</div>
                  ) : (
                    <div className="space-y-2">
                      {aulasClubSucesso.map(oc => {
                        const aula = oc.club_aulas
                        const cont = contagensClubSucesso[oc.id] || { total:0, reservado:0, presente:0, falta:0 }
                        const vagas = Math.max(0, cont.total - (cont.reservado + cont.presente + cont.falta))
                        const cor = tipoCorClub(aula?.tipo)
                        return (
                          <button key={oc.id} onClick={() => irParaReservaClub(oc)} disabled={vagas===0}
                            className={`w-full text-left bg-white rounded-xl border p-3 flex items-center gap-3 transition-all ${vagas===0?'opacity-50 cursor-not-allowed':'hover:border-primary-300 active:scale-[0.99]'}`}
                            style={{ borderLeftWidth:4, borderLeftColor: cor }}>
                            <div className="font-mono text-base font-bold text-gray-900 w-12 flex-shrink-0">{(aula?.horario||'').slice(0,5)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold" style={{ color:cor }}>{tipoLabelClub(aula?.tipo)}</div>
                              <div className="text-sm font-semibold text-gray-900 truncate">{aula?.grupos_musculares?.nome || '—'}</div>
                              <div className="text-xs text-gray-400 truncate">👤 {aula?.coaches?.nome?.split(' ')[0] || '—'}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className={`text-lg font-bold ${vagas===0?'text-gray-300':vagas<=3?'text-orange-500':'text-gray-900'}`}>{vagas}</div>
                              <div className="text-[10px] text-gray-400">vagas</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <button onClick={fecharModalVenda} className="btn w-full text-gray-600 border border-gray-200">
                {entradaStatus === 'ok' ? 'Concluir' : 'Fechar'}
              </button>
            </div>
            ) : (
            <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2"><ShoppingCart size={18} className="text-green-600"/> Vender produto</div>
                <div className="text-xs text-gray-400 mt-0.5">para {clienteSel?.nome} · {unidadeAtiva.nome}</div>
              </div>
              <button onClick={() => setModalVenda(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            {produtosDisp.length === 0 ? (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-700">Nenhum produto ativo disponível para esta unidade.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 mb-2 block font-medium uppercase tracking-wide">Produto</label>
                  <div className="space-y-2">
                    {produtosDisp.map(p => (
                      <label key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${formVenda.produto_id===p.id?'border-green-400 bg-green-50':'border-gray-200'}`}>
                        <input type="radio" checked={formVenda.produto_id===p.id} onChange={() => selecionarProduto(p.id)} className="mt-1 accent-green-600"/>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">{p.nome}</span>
                            {p.subtipo==='acesso' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Acesso</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            R$ {Number(p.valor).toFixed(2).replace('.',',')}
                            {p.subtipo==='acesso' ? ` · ${p.dias_validade} dias` : (p.creditos_por_venda>1?` · ${p.creditos_por_venda} créditos`:'')}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block font-medium">Quantidade</label>
                    <input type="number" min={1} max={20} className="input w-full" value={formVenda.quantidade}
                      onChange={e => setFormVenda({...formVenda, quantidade: parseInt(e.target.value)||1})}/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block font-medium">Valor unitário (R$)</label>
                    {ehRecepcao ? (
                      <div className="input w-full bg-gray-50 text-gray-700 flex items-center justify-between cursor-not-allowed">
                        <span className="font-mono">R$ {formVenda.valor_unitario.toFixed(2).replace('.',',')}</span>
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">preço do produto</span>
                      </div>
                    ) : (
                      <input type="number" min={0} step="0.01" className="input w-full" value={formVenda.valor_unitario}
                        onChange={e => setFormVenda({...formVenda, valor_unitario: parseFloat(e.target.value)||0})}/>
                    )}
                  </div>
                </div>
                {ehRecepcao ? (
                  !liberacao ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Desconto</span>
                        <span className="text-xs text-gray-500">Precisa de código do admin</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="text" inputMode="numeric" maxLength={6} className="input flex-1" placeholder="Código de liberação"
                          value={codigoLiberacao}
                          onChange={e => { setCodigoLiberacao(e.target.value.replace(/\D/g,'')); setErroCodigo('') }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); validarCodigoLiberacao() } }}/>
                        <button type="button" onClick={validarCodigoLiberacao} disabled={validandoCodigo}
                          className="btn bg-amber-600 text-white hover:bg-amber-700 text-sm px-3">
                          {validandoCodigo ? 'Validando...' : 'Liberar'}
                        </button>
                      </div>
                      {erroCodigo && <div className="text-xs text-red-600">{erroCodigo}</div>}
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Desconto liberado (até {liberacao.desconto_maximo}%)</span>
                        <button type="button" onClick={() => { setLiberacao(null); setCodigoLiberacao(''); setFormVenda({...formVenda, desconto_percentual: 0}) }}
                          className="text-xs text-emerald-700 underline">trocar código</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} max={liberacao.desconto_maximo} step={1} className="input flex-1" placeholder="0"
                          value={formVenda.desconto_percentual||''}
                          onChange={e => setFormVenda({...formVenda, desconto_percentual: Math.min(liberacao.desconto_maximo, Math.max(0, parseFloat(e.target.value)||0))})}/>
                        <span className="text-sm text-emerald-800 font-medium">%</span>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Desconto</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} max={100} step={1} className="input flex-1" placeholder="0"
                        value={formVenda.desconto_percentual||''}
                        onChange={e => setFormVenda({...formVenda, desconto_percentual: Math.min(100, Math.max(0, parseFloat(e.target.value)||0))})}/>
                      <span className="text-sm text-amber-800 font-medium">%</span>
                    </div>
                  </div>
                )}
                <div className="rounded-xl p-3 bg-green-50 border border-green-200">
                  {formVenda.desconto_percentual > 0 && (
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">Valor original</span>
                      <span className="text-sm text-gray-500 line-through font-mono">R$ {valorOriginal.toFixed(2).replace('.',',')}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-green-800">Total da venda</span>
                    <span className="font-mono text-xl font-bold text-green-700">R$ {valorTotalComDesconto.toFixed(2).replace('.',',')}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-2 block font-medium uppercase tracking-wide">Forma de pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FORMAS_PAGAMENTO.filter(f => f.key!=='cortesia').map(f => (
                      <button key={f.key} onClick={() => setFormVenda({...formVenda, forma_pagamento: f.key})}
                        className={`p-3 rounded-xl border text-sm font-medium transition-all ${formVenda.forma_pagamento===f.key?'border-green-400 bg-green-50 text-green-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Observação (opcional)</label>
                  <textarea className="input w-full resize-none" rows={2} value={formVenda.observacao}
                    onChange={e => setFormVenda({...formVenda, observacao: e.target.value})} placeholder="Ex: cliente pagou parcelado..."/>
                </div>
                {erroVenda && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>{erroVenda}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setModalVenda(false)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
                  <button onClick={confirmarVenda} disabled={vendendo} className="btn flex-1 bg-green-600 text-white hover:bg-green-700 gap-1">
                    <DollarSign size={14}/> {vendendo?'Registrando...':'Confirmar venda'}
                  </button>
                </div>
              </div>
            )}
            </>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL Ativar Plano ─── */}
      {modalAtivarPlano && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900">Ativar plano</div>
              <button onClick={() => setModalAtivarPlano(null)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-4">
              <div className="font-semibold text-primary-900">{modalAtivarPlano.nome}</div>
              <div className="text-xs text-primary-700 mt-1">{modalAtivarPlano.creditos_mes} sessões/mês em {unidadeAtiva.nome}</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-xs text-yellow-800">
              ⚠️ Esta ação simula o aceite de contrato pelo cliente. O cliente precisa estar presente e ciente da ativação.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModalAtivarPlano(null)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={() => ativarPlano(modalAtivarPlano.id)} disabled={salvandoPlano} className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700">
                {salvandoPlano?'Ativando...':'Ativar plano'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL Vencimento ─── */}
      {modalVencimento && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2"><CalendarClock size={18} className="text-amber-600"/> Ajustar vencimento</div>
                <div className="text-xs text-gray-400 mt-0.5">{modalVencimento.produtos?.nome}</div>
              </div>
              <button onClick={() => setModalVencimento(null)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
              💡 Use este ajuste quando o cliente comprou o plano fora do sistema e você precisa retroagir ou estender o vencimento.
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">Início do plano</div>
                <div className="text-sm font-medium text-gray-900">{modalVencimento.inicio ? formatarBR(modalVencimento.inicio) : '—'}</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Nova data de vencimento</label>
                <input type="date" className="input w-full" value={novoVencimento} onChange={e => setNovoVencimento(e.target.value)}/>
                <div className="text-xs text-gray-400 mt-1">Vencimento atual: {modalVencimento.fim ? formatarBR(modalVencimento.fim) : '—'}</div>
              </div>
            </div>
            {erroVencimento && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3 text-sm text-red-600 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>{erroVencimento}
              </div>
            )}
            <div className="flex gap-2 mt-6">
              <button onClick={() => setModalVencimento(null)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={salvarNovoVencimento} disabled={ajustandoVencimento} className="btn flex-1 bg-amber-500 text-white hover:bg-amber-600 gap-1">
                <Check size={12}/> {ajustandoVencimento?'Salvando...':'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL Novo Cliente ─── */}
      {novoCliente && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="font-semibold text-gray-900 text-lg">Novo cliente</div>
              <button onClick={() => setNovoCliente(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              {[
                { label:'Nome completo', key:'nome', type:'text' },
                { label:'Email', key:'email', type:'email' },
                { label:'Telefone', key:'telefone', type:'text' },
                { label:'CPF', key:'cpf', type:'text' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">{f.label}</label>
                  <input type={f.type} className="input w-full" value={formNovo[f.key as keyof typeof formNovo] as string}
                    onChange={e => setFormNovo({...formNovo, [f.key]: e.target.value})}/>
                </div>
              ))}
            </div>
            {erroCriar && <div className="mt-3 text-sm text-red-600">{erroCriar}</div>}
            <div className="flex gap-2 mt-6">
              <button onClick={() => setNovoCliente(false)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={criarCliente} disabled={criando} className="btn flex-1 bg-primary-600 text-white font-medium">
                {criando?'Cadastrando...':'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL Senha provisória ─── */}
      {modalSenhaProvisoria && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900 flex items-center gap-2"><KeyRound size={18} className="text-primary-600" /> {modalSenhaProvisoria.acao === 'senha_redefinida' ? 'Senha redefinida' : 'Acesso criado'}</div>
              <button onClick={() => setModalSenhaProvisoria(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-800 leading-relaxed">
              Passe esta senha provisória para <strong>{modalSenhaProvisoria.nome}</strong>. O cliente entra com ela e depois troca em <strong>Minha Conta &rarr; Alterar senha</strong>.
            </div>
            <div className="bg-gray-900 rounded-xl p-4 mb-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Senha provisória</div>
              <div className="font-mono text-2xl text-primary-300 font-bold tracking-wider mb-2 break-all">{modalSenhaProvisoria.senha}</div>
              {modalSenhaProvisoria.email && <div className="text-xs text-gray-400">Email: <span className="text-white font-mono">{modalSenhaProvisoria.email}</span></div>}
            </div>
            <button onClick={copiarSenhaProvisoria} className={`w-full btn gap-1 mb-2 ${senhaCopiada ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {senhaCopiada ? <><Check size={14} /> Copiada!</> : <><Copy size={14} /> Copiar senha</>}
            </button>
            <button onClick={() => setModalSenhaProvisoria(null)} className="w-full btn bg-primary-600 text-white hover:bg-primary-700">Entendi</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RecepcaoClientesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Carregando…</div>}>
      <RecepcaoClientesPageInner />
    </Suspense>
  )
}
