'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { createClient } from '@/lib/supabase'
import { dashboardDoRole } from '@/lib/auth-redirect'
import SiteHeader from '@/components/SiteHeader'
import ModalTelefone from '@/components/ModalTelefone'

const ACCENT  = '#ff2d9b'
const CYAN    = '#00e5ff'
const AMARELO = '#ffaa00'
const VERMELHO = '#ff4444'

// Endereço fixo por nome de unidade (mesma fonte usada na home)
const ENDERECOS_UNIDADES: Record<string, string> = {
  'Just CT': 'Rua Fiandeiras, 392 — Itaim Bibi, São Paulo',
  'JustClub Vila Olímpia': 'Av. Dr. Cardoso de Melo, 1337 — Vila Olímpia, São Paulo',
  'JustClub Pinheiros': 'Rua Deputado Lacerda Franco, 342 — Pinheiros, São Paulo',
}

const DIAS_SEMANA  = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HORARIOS_FDS = ['08:00', '09:00', '10:00', '11:00', '12:00']
const JANELA_DIAS  = 14

function dentroDaJanelaProximoMes(): boolean {
  const hoje = new Date()
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  return ultimoDiaMes - hoje.getDate() <= 7
}

// Converte um Date para "AAAA-MM-DD" usando componentes LOCAIS.
// Evita o pulo de dia que o toISOString() causa após as 21h em SP (UTC-3).
function dataLocalStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Telefone válido = DDD + número (10 ou 11 dígitos)
function telefoneValido(tel: any): boolean {
  const d = String(tel || '').replace(/\D/g, '')
  return d.length >= 10 && d.length <= 11
}

const CONTRATO = `CONTRATO DE ADESÃO — COACH CT / JUST CT

1. OBJETO
O presente contrato regula as condições de uso do serviço Coach CT, que consiste no agendamento de sessões de treinamento personalizado com coaches da unidade Just CT.

2. REGRAS DE AGENDAMENTO
2.1. Wellhub Diamond: até 8 sessões Coach CT por mês-calendário.
2.2. TotalPass TP6: até 10 sessões Coach CT por mês-calendário.
2.3. Plano Avulso Coach CT: crédito válido por 30 dias a partir da compra.
2.4. Coach CT Pro: pacote completo de sessões com janela estendida de 14 dias.
2.5. Os créditos dos planos Wellhub e TotalPass não são acumulativos e renovam-se todo dia 1º de cada mês.
2.6. Agendamentos liberados em janela rolante: 7 dias para Wellhub/TotalPass/Avulso · 14 dias para Coach CT Pro.

3. CANCELAMENTO
3.1. Cancelamentos até 12h antes resultam na devolução do crédito.
3.2. Entre 12h e 3h antes: cancelamento só permitido se houver cliente na fila de espera.
3.3. Menos de 3h antes: não é possível cancelar.

4. POLÍTICA DE FALTAS
4.1. Falta sem cancelamento gera bloqueio de novos agendamentos.
4.2. Para reativação: regularização na recepção do Just CT.
4.3. Agendamentos futuros são cancelados automaticamente.

5. FILA DE ESPERA
5.1. Ao entrar na fila de espera, o cliente aceita automaticamente as regras.
5.2. Quando uma vaga abrir, o agendamento é confirmado automaticamente.
5.3. As mesmas regras de cancelamento e falta se aplicam — inclusive multa por no-show.
5.4. A confirmação automática pode ocorrer a qualquer momento até 3h antes do treino.

6. ACEITE
Ao concluir o cadastro, o cliente declara ter lido e concordado com todos os termos acima.`

function parsePlanoKey(key: string): { label: string; icon: string } {
  const lower = key.toLowerCase()
  let tipo = ''
  let icon = '🏋️'
  if (lower.startsWith('coach_ct_pro')) { tipo = 'Coach CT Pro'; icon = '🏆' }
  else if (lower.startsWith('wellhub')) { tipo = 'Wellhub'; icon = '💜' }
  else if (lower.startsWith('totalpass')) { tipo = 'TotalPass'; icon = '🔵' }
  else if (lower.startsWith('avulso') || lower.startsWith('credito')) { tipo = 'Crédito Avulso'; icon = '🎟️' }
  else { tipo = key }
  let slugUnidade = lower.startsWith('coach_ct_pro') ? key.substring('coach_ct_pro_'.length) : key.split('_').slice(1).join('_')
  const nomeUnidade: Record<string, string> = { just_ct: 'Just CT', just_club_vila_olimpia: 'Vila Olímpia', just_club_pinheiros: 'Pinheiros' }
  return { label: `${tipo} — ${nomeUnidade[slugUnidade] || slugUnidade.replace(/_/g, ' ')}`, icon }
}

function HalterSVG({ estado, onClick }: { estado: 'livre' | 'ocupado' | 'meu' | 'fila' | 'bloqueado', onClick?: () => void }) {
  const cor = estado === 'ocupado' ? '#333' : estado === 'meu' ? CYAN : estado === 'fila' ? AMARELO : estado === 'bloqueado' ? '#ff4444' : ACCENT
  const opacity = estado === 'ocupado' ? 0.3 : estado === 'bloqueado' ? 0.4 : 1
  return (
    <svg width="36" height="36" viewBox="0 0 48 28" style={{ opacity, flexShrink: 0, cursor: estado === 'livre' ? 'pointer' : 'default' }} onClick={estado === 'livre' ? onClick : undefined}>
      <rect x="15" y="11.5" width="18" height="5" rx="2" fill={cor} />
      <rect x="2" y="5" width="5" height="18" rx="3" fill={cor} />
      <rect x="8" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="36" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="41" y="5" width="5" height="18" rx="3" fill={cor} />
    </svg>
  )
}

// ─── Card de seleção de unidade ───────────────────────────────────────────────
function CardUnidade({ unidade, onClick }: { unidade: any; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  const isClub = unidade.tipo === 'club'
  const cor = isClub ? CYAN : ACCENT

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: `1.5px solid ${hover ? cor : '#2a2a2a'}`,
        background: hover ? `${cor}10` : '#111',
        borderRadius: 16,
        padding: '1.5rem',
        cursor: 'pointer',
        transition: 'all .2s',
        display: 'flex',
        alignItems: 'center',
        gap: '1.25rem',
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 14, flexShrink: 0,
        background: `${cor}18`, border: `1px solid ${cor}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28,
      }}>
        {isClub ? '⚡' : '🏋️'}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 22, letterSpacing: 1,
          color: hover ? cor : '#fff',
          transition: 'color .2s',
        }}>
          {unidade.nome}
        </div>
        <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
          {isClub ? 'Aulas coletivas · Lift · Running + Funcional' : 'Personal training · Treino individual com coach'}
        </div>
        {ENDERECOS_UNIDADES[unidade.nome] && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 8, fontSize: 12, color: '#666', lineHeight: 1.4 }}>
            <span style={{ flexShrink: 0 }}>📍</span>
            <span>{ENDERECOS_UNIDADES[unidade.nome]}</span>
          </div>
        )}
      </div>

      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: `1.5px solid ${hover ? cor : '#333'}`,
        color: hover ? cor : '#444',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, transition: 'all .2s', flexShrink: 0,
      }}>›</div>
    </div>
  )
}

export default function AgendarPage() {
  const { user, perfil, loading } = useAuth()
  const { unidadeAtiva, setUnidadeAtiva, unidadesPermitidas, loading: loadingUnidade } = useUnidade()
  const router = useRouter()
  const supabase = createClient()

  const [unidadeConfirmada, setUnidadeConfirmada] = useState(false)

  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [periodo, setPeriodo] = useState<'todos' | 'manha' | 'tarde' | 'noite'>('todos')
  const [horarios, setHorarios] = useState<any[]>([])
  const [cliente, setCliente] = useState<any>(null)
  const [loadingHorarios, setLoadingHorarios] = useState(false)
  // ── FIX: estado de loading de saldos separado ─────────────────────────────
  const [loadingSaldos, setLoadingSaldos] = useState(true)
  // ──────────────────────────────────────────────────────────────────────────
  const [tipoDia, setTipoDia] = useState<'util' | 'fds' | 'feriado'>('util')
  const [feriadoDescricao, setFeriadoDescricao] = useState<string>('')
  const [saldoMesAtual, setSaldoMesAtual] = useState<Record<string, any>>({})
  const [saldoMesProximo, setSaldoMesProximo] = useState<Record<string, any>>({})
  const [agendamentosNoDia, setAgendamentosNoDia] = useState<any[]>([])
  const [filasDoCliente, setFilasDoCliente] = useState<any[]>([])
  const [filaGeral, setFilaGeral] = useState<any[]>([])
  const [modalSlot, setModalSlot] = useState<{ data: string; hora: string; vagas: number } | null>(null)
  const [tipoCredito, setTipoCredito] = useState<string>('')
  const [coachEscolhido, setCoachEscolhido] = useState<string>('')
  const [coachesDisponiveis, setCoachesDisponiveis] = useState<{ id: string; nome: string }[]>([])
  const [confirmando, setConfirmando] = useState(false)
  const [erroModal, setErroModal] = useState('')
  const [modalFila, setModalFila] = useState<{ data: string; hora: string } | null>(null)
  const [tipoFilaCredito, setTipoFilaCredito] = useState<string>('')
  const [entrandoFila, setEntrandoFila] = useState(false)
  const [erroFila, setErroFila] = useState('')
  const [filaAceite, setFilaAceite] = useState(false)
  const [notifFila, setNotifFila] = useState<'whatsapp' | 'email' | 'nenhuma'>('whatsapp')
  const [mostrarContrato, setMostrarContrato] = useState(false)
  const [contratoAssinado, setContratoAssinado] = useState(false)
  const [aceiteCheck, setAceiteCheck] = useState(false)
  const [modalSemPlano, setModalSemPlano] = useState(false)
  const [modalSemCartao, setModalSemCartao] = useState(false)
  const [cobrancasPendentes, setCobrancasPendentes] = useState<any[]>([])
  // Modal de telefone (Pagar.me exige telefone no customer para cobrar multa)
  const [modalTelefone, setModalTelefone] = useState(false)
  const [pendingReserva, setPendingReserva] = useState<(() => void) | null>(null)

  const janelaProximoMesAberta = dentroDaJanelaProximoMes()
  const temCoachCtProAtivo = Object.entries(saldoMesAtual).some(([c, i]: [string, any]) => c.startsWith('coach_ct_pro_') && i?.disponivel > 0)
  const tipoVisualizacao: 'visitante' | 'coach_ct_pro' | 'padrao' = !user ? 'visitante' : temCoachCtProAtivo ? 'coach_ct_pro' : 'padrao'

  const temPlanoParceiroAtivo = Object.entries(saldoMesAtual).some(([k, v]: [string, any]) =>
    (k.startsWith('wellhub_') || k.startsWith('totalpass_')) && v?.disponivel > 0
  )
  const precisaCartao = !!cliente && temPlanoParceiroAtivo && !cliente?.pagarme_card_id
  // Gate de telefone: já tem cartão (customer no Pagar.me existe) mas está sem telefone válido
  const precisaTelefone = () => !!cliente?.pagarme_card_id && !telefoneValido(cliente?.telefone)
  const clienteBloqueado = !!cliente?.bloqueado
  const temCobrancaPendente = cobrancasPendentes.length > 0

  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + semanaOffset * 7 + i)
    return d
  })

  useEffect(() => {
    if (!loadingUnidade && unidadesPermitidas.length === 1) {
      setUnidadeConfirmada(true)
    }
  }, [loadingUnidade, unidadesPermitidas.length])

  useEffect(() => {
    if (loading) return
    if (perfil && perfil.role && perfil.role !== 'cliente') router.push(dashboardDoRole(perfil.role))
  }, [perfil, loading])

  useEffect(() => { if (perfil) loadCliente() }, [perfil])

  useEffect(() => {
    if (perfil && cliente && unidadeAtiva) {
      carregarSaldos(cliente.id, unidadeAtiva.id)
      carregarCobrancasPendentes(cliente.id)
    }
  }, [unidadeAtiva?.id, cliente?.id])

  useEffect(() => {
    if (unidadeAtiva && !clienteBloqueado && unidadeConfirmada) loadHorarios()
  }, [diaSel, semanaOffset, perfil, cliente, unidadeAtiva?.id, clienteBloqueado, unidadeConfirmada])

  async function loadCliente() {
    if (!perfil) return
    const { data } = await supabase.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
    setCliente(data)
    if (data) {
      const { count } = await supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('cliente_id', data.id)
      setContratoAssinado((count || 0) > 0)
      setNotifFila(data.notificacao_preferida || 'whatsapp')
    }
  }

  async function carregarCobrancasPendentes(clienteId: string) {
    const { data } = await supabase.from('cobrancas_pendentes').select('*').eq('cliente_id', clienteId).eq('status', 'pendente').order('cobrado_em', { ascending: false })
    setCobrancasPendentes(data || [])
  }

  async function carregarSaldos(clienteId: string, unidadeId: string) {
    // ── FIX: sinaliza início do carregamento de saldos ────────────────────
    setLoadingSaldos(true)
    // ──────────────────────────────────────────────────────────────────────
    const agora = new Date()
    const mesAtual = agora.getMonth() + 1
    const anoAtual = agora.getFullYear()
    const mesProximo = mesAtual === 12 ? 1 : mesAtual + 1
    const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual
    const { data: atual } = await supabase.rpc('saldo_creditos_cliente', { p_cliente_id: clienteId, p_mes: mesAtual, p_ano: anoAtual, p_unidade_id: unidadeId })
    setSaldoMesAtual(atual || {})
    // Carrega sempre o saldo do próximo mês (a agenda de 14 dias pode alcançar o próximo mês)
    const { data: proximo } = await supabase.rpc('saldo_creditos_cliente', { p_cliente_id: clienteId, p_mes: mesProximo, p_ano: anoProximo, p_unidade_id: unidadeId })
    setSaldoMesProximo(proximo || {})
    // ── FIX: sinaliza fim do carregamento de saldos ───────────────────────
    setLoadingSaldos(false)
    // ──────────────────────────────────────────────────────────────────────
  }

  async function loadHorarios() {
    if (!unidadeAtiva) return
    setLoadingHorarios(true)
    try {
      const dataSel = diasSemana[diaSel]
      if (!dataSel) { setHorarios([]); setLoadingHorarios(false); return }
      const diaSem = dataSel.getDay()
      const dataStr = dataLocalStr(dataSel)
      const hoje = dataLocalStr(new Date())
      const agora = new Date()
      const horaAtual = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
      const isDiaDe = dataStr === hoje
      const { data: feriadoData } = await supabase.from('feriados').select('*').eq('unidade_id', unidadeAtiva.id).eq('data', dataStr).eq('ativo', true).maybeSingle()
      const ehFeriado = !!feriadoData
      const ehFds = diaSem === 0 || diaSem === 6
      const usaEscalaFds = ehFeriado || ehFds
      if (ehFeriado) { setTipoDia('feriado'); setFeriadoDescricao(feriadoData.descricao || '') }
      else if (ehFds) { setTipoDia('fds'); setFeriadoDescricao('') }
      else { setTipoDia('util'); setFeriadoDescricao('') }
      let porHora: Record<string, number> = {}
      if (usaEscalaFds) {
        const { data: escala } = await supabase.from('escala_fds').select('coach_id').eq('unidade_id', unidadeAtiva.id).eq('data', dataStr)
        const qtd = (escala || []).length
        if (qtd > 0) for (const hora of HORARIOS_FDS) { if (isDiaDe && hora <= horaAtual) continue; porHora[hora] = qtd }
      } else {
        const { data: hors } = await supabase.from('coach_horarios').select('hora').eq('dia_semana', diaSem).eq('ativo', true).eq('unidade_id', unidadeAtiva.id)
        for (const h of (hors || [])) { const hora = (h.hora || '').slice(0, 5); if (isDiaDe && hora <= horaAtual) continue; porHora[hora] = (porHora[hora] || 0) + 1 }
      }
      const [agsRes, filaGeralRes, bloqueadasRes, agClienteRes, filasRes] = await Promise.allSettled([
        supabase.from('agendamentos').select('horario, status').eq('data', dataStr).eq('unidade_id', unidadeAtiva.id).neq('status', 'cancelado'),
        supabase.from('fila_espera').select('horario').eq('data', dataStr).eq('status', 'aguardando').eq('unidade_id', unidadeAtiva.id),
        supabase.from('vagas_bloqueadas').select('horario, quantidade').eq('data', dataStr).eq('ativo', true).eq('unidade_id', unidadeAtiva.id),
        cliente ? supabase.from('agendamentos').select('horario, tipo_credito, status').eq('data', dataStr).eq('cliente_id', cliente.id).eq('unidade_id', unidadeAtiva.id) : Promise.resolve({ data: [] as any[] }),
        cliente ? supabase.from('fila_espera').select('horario').eq('data', dataStr).eq('cliente_id', cliente.id).eq('unidade_id', unidadeAtiva.id) : Promise.resolve({ data: [] as any[] }),
      ])
      const ags = agsRes.status === 'fulfilled' ? (agsRes.value as any).data : []
      const filaGeralData = filaGeralRes.status === 'fulfilled' ? (filaGeralRes.value as any).data : []
      const bloqueadas = bloqueadasRes.status === 'fulfilled' ? (bloqueadasRes.value as any).data : []
      const agCliente = agClienteRes.status === 'fulfilled' ? (agClienteRes.value as any).data : []
      const filas = filasRes.status === 'fulfilled' ? (filasRes.value as any).data : []
      const ocupados: Record<string, number> = {}
      for (const a of (ags || [])) { const hora = (a.horario || '').slice(0, 5); ocupados[hora] = (ocupados[hora] || 0) + 1 }
      const bloqueadasMap: Record<string, number> = {}
      for (const b of (bloqueadas || [])) { const hora = (b.horario || '').slice(0, 5); bloqueadasMap[hora] = (bloqueadasMap[hora] || 0) + (b.quantidade || 1) }
      const resultado = Object.entries(porHora).map(([hora, total]) => {
        const bloq = bloqueadasMap[hora] || 0
        const ocup = ocupados[hora] || 0
        return { hora, total, ocupados: ocup, bloqueadas: bloq, livres: Math.max(0, total - ocup - bloq) }
      }).sort((a, b) => a.hora.localeCompare(b.hora))
      setHorarios(resultado)
      setAgendamentosNoDia(agCliente || [])
      setFilasDoCliente(filas || [])
      setFilaGeral(filaGeralData || [])
    } catch (err) {
      console.error('Erro:', err)
      setHorarios([])
    } finally {
      setLoadingHorarios(false)
    }
  }

  async function carregarCoachesDisponiveis(dataStr: string, horaStr: string) {
    if (!unidadeAtiva) return
    const diaSem = new Date(dataStr + 'T12:00:00').getDay()
    const { data: feriadoData } = await supabase.from('feriados').select('*').eq('unidade_id', unidadeAtiva.id).eq('data', dataStr).eq('ativo', true).maybeSingle()
    const usaEscalaFds = !!feriadoData || diaSem === 0 || diaSem === 6
    let coachIds: string[] = []
    if (usaEscalaFds) {
      const { data: escala } = await supabase.from('escala_fds').select('coach_id').eq('unidade_id', unidadeAtiva.id).eq('data', dataStr)
      coachIds = (escala || []).map((e: any) => e.coach_id).filter(Boolean)
    } else {
      const { data: hors } = await supabase.from('coach_horarios').select('coach_id').eq('dia_semana', diaSem).eq('hora', horaStr).eq('ativo', true).eq('unidade_id', unidadeAtiva.id)
      coachIds = (hors || []).map((h: any) => h.coach_id).filter(Boolean)
    }
    if (coachIds.length === 0) { setCoachesDisponiveis([]); return }
    const { data: ocupados } = await supabase.from('agendamentos').select('coach_id').eq('data', dataStr).eq('horario', horaStr + ':00').eq('unidade_id', unidadeAtiva.id).neq('status', 'cancelado').not('coach_id', 'is', null)
    const idsOcupados = new Set((ocupados || []).map((a: any) => a.coach_id))
    const idsDisp = coachIds.filter(id => !idsOcupados.has(id))
    if (idsDisp.length === 0) { setCoachesDisponiveis([]); return }
    const { data: coachesData } = await supabase.from('coaches').select('id, nome').in('id', idsDisp).eq('ativo', true).order('nome')
    setCoachesDisponiveis(coachesData || [])
  }

  const hojeRef = new Date(); hojeRef.setHours(0, 0, 0, 0)
  const dataMaxima = new Date(hojeRef); dataMaxima.setDate(dataMaxima.getDate() + JANELA_DIAS)
  const semanasMaximas = Math.floor(JANELA_DIAS / 7)

  const horariosFiltrados = horarios.filter(h => {
    const hr = parseInt(h.hora)
    if (periodo === 'manha') return hr < 12
    if (periodo === 'tarde') return hr >= 12 && hr < 18
    if (periodo === 'noite') return hr >= 18
    return true
  })

  const dataSelecionada = diasSemana[diaSel]
  const dataSelAposLimite = dataSelecionada > dataMaxima
  const diasDesdHoje = Math.floor((dataSelecionada.getTime() - hojeRef.getTime()) / (1000 * 60 * 60 * 24))
  const isDiaExclusivoPro = diasDesdHoje >= 7 && tipoVisualizacao !== 'coach_ct_pro'

  function jaAgendouNoDia(plano: string) { return agendamentosNoDia.some(a => a.tipo_credito === plano && ['agendado', 'confirmado', 'realizado'].includes(a.status)) }
  function naFila(hora: string) { return filasDoCliente.some(f => (f.horario || '').slice(0, 5) === hora) }
  function temFilaNoHorario(hora: string) { return filaGeral.some(f => (f.horario || '').slice(0, 5) === hora) }

  function saldoParaData(): Record<string, any> {
    const dataSel = diasSemana[diaSel]
    const agora = new Date()
    const mesmoMes = dataSel.getMonth() === agora.getMonth() && dataSel.getFullYear() === agora.getFullYear()
    if (mesmoMes) return saldoMesAtual
    const saldoMisto: Record<string, any> = { ...saldoMesProximo }
    for (const [chave, info] of Object.entries(saldoMesAtual)) {
      if (chave.startsWith('coach_ct_pro_')) saldoMisto[chave] = info
    }
    return saldoMisto
  }

  function planosDisponiveisParaDia() {
    const saldo = saldoParaData()
    return Object.keys(saldo).filter(p => saldo[p].disponivel > 0 && !jaAgendouNoDia(p))
  }

  const notifOpcoes = [
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
    { key: 'email', label: 'Email', icon: '📧' },
    { key: 'nenhuma', label: 'Sem aviso', icon: '🔕' },
  ]

  // ── FIX: inclui !loadingSaldos na checagem para evitar falso positivo ─────
  const semPlanoAtivo = !loadingHorarios && !loadingSaldos && !!cliente &&
    Object.keys(saldoMesAtual).length === 0 &&
    Object.keys(saldoMesProximo).length === 0
  // ──────────────────────────────────────────────────────────────────────────

  function tentarAgendar(hora: string, vagas: number, skipTel: boolean = false) {
    if (!user) { router.push('/login'); return }
    if (clienteBloqueado) return
    if (semPlanoAtivo) { setModalSemPlano(true); return }
    if (precisaCartao) { setModalSemCartao(true); return }
    if (!skipTel && precisaTelefone()) { setPendingReserva(() => () => tentarAgendar(hora, vagas, true)); setModalTelefone(true); return }
    abrirModalReserva(hora, vagas)
  }

  function tentarFila(hora: string, skipTel: boolean = false) {
    if (!user) { router.push('/login'); return }
    if (clienteBloqueado) return
    if (semPlanoAtivo) { setModalSemPlano(true); return }
    if (precisaCartao) { setModalSemCartao(true); return }
    if (!skipTel && precisaTelefone()) { setPendingReserva(() => () => tentarFila(hora, true)); setModalTelefone(true); return }
    abrirModalFila(hora)
  }

  function abrirModalReserva(hora: string, vagas: number) {
    const dataStr = dataLocalStr(diasSemana[diaSel])
    setModalSlot({ data: dataStr, hora, vagas })
    setTipoCredito(''); setCoachEscolhido(''); setCoachesDisponiveis([]); setErroModal('')
    if (!contratoAssinado) setMostrarContrato(true)
  }

  function abrirModalFila(hora: string) {
    const dataStr = dataLocalStr(diasSemana[diaSel])
    setModalFila({ data: dataStr, hora })
    setTipoFilaCredito(''); setErroFila(''); setFilaAceite(false)
    setNotifFila(cliente?.notificacao_preferida || 'whatsapp')
    if (!contratoAssinado) setMostrarContrato(true)
  }

  useEffect(() => {
    if (!modalSlot || !tipoCredito) { setCoachesDisponiveis([]); setCoachEscolhido(''); return }
    if (tipoCredito.startsWith('coach_ct_pro_')) carregarCoachesDisponiveis(modalSlot.data, modalSlot.hora)
    else { setCoachesDisponiveis([]); setCoachEscolhido('') }
  }, [tipoCredito, modalSlot?.hora, modalSlot?.data])

  async function confirmarAgendamento() {
    if (!tipoCredito) { setErroModal('Selecione como vai usar esta sessão.'); return }
    if (!modalSlot || !cliente || !unidadeAtiva) return
    if (clienteBloqueado) { setErroModal('Sua conta está bloqueada.'); return }
    if (jaAgendouNoDia(tipoCredito)) { const { label } = parsePlanoKey(tipoCredito); setErroModal(`Você já tem um agendamento com ${label} neste dia.`); return }
    const agora = new Date()
    const dataSel = diasSemana[diaSel]
    const mesmoMes = dataSel.getMonth() === agora.getMonth() && dataSel.getFullYear() === agora.getFullYear()
    const mesRef = mesmoMes ? agora.getMonth() + 1 : (agora.getMonth() === 11 ? 1 : agora.getMonth() + 2)
    const anoRef = mesmoMes ? agora.getFullYear() : (agora.getMonth() === 11 ? agora.getFullYear() + 1 : agora.getFullYear())
    const { data: saldoAtualizado } = await supabase.rpc('saldo_creditos_cliente', { p_cliente_id: cliente.id, p_mes: mesRef, p_ano: anoRef, p_unidade_id: unidadeAtiva.id })
    if (!saldoAtualizado || !saldoAtualizado[tipoCredito] || saldoAtualizado[tipoCredito].disponivel <= 0) {
      setErroModal('Saldo insuficiente.'); await carregarSaldos(cliente.id, unidadeAtiva.id); return
    }
    setConfirmando(true); setErroModal('')
    const payload: any = { cliente_id: cliente.id, data: modalSlot.data, horario: modalSlot.hora + ':00', status: 'agendado', tipo_credito: tipoCredito, unidade_id: unidadeAtiva.id }
    if (tipoCredito.startsWith('coach_ct_pro_') && coachEscolhido) { payload.coach_id = coachEscolhido; payload.alocado_por = perfil?.id || null; payload.alocado_em = new Date().toISOString() }
    const { error } = await supabase.from('agendamentos').insert(payload)
    if (error) { setErroModal('Erro ao agendar. Tente novamente.'); setConfirmando(false); return }
    await Promise.all([carregarSaldos(cliente.id, unidadeAtiva.id), loadHorarios()])
    setContratoAssinado(true); setModalSlot(null); setConfirmando(false)
    router.push('/minha-conta')
  }

  async function confirmarFila() {
    if (!tipoFilaCredito) { setErroFila('Selecione como vai usar esta sessão.'); return }
    if (!filaAceite) { setErroFila('Confirme que entendeu as regras da fila.'); return }
    if (!modalFila || !cliente || !unidadeAtiva) return
    if (clienteBloqueado) { setErroFila('Sua conta está bloqueada.'); return }
    setEntrandoFila(true); setErroFila('')
    if (notifFila !== cliente.notificacao_preferida) {
      await supabase.from('clientes').update({ notificacao_preferida: notifFila }).eq('id', cliente.id)
      setCliente({ ...cliente, notificacao_preferida: notifFila })
    }
    const { error } = await supabase.from('fila_espera').insert({ cliente_id: cliente.id, data: modalFila.data, horario: modalFila.hora + ':00', tipo_credito: tipoFilaCredito, status: 'aguardando', unidade_id: unidadeAtiva.id })
    if (error) { setErroFila('Erro ao entrar na fila.'); setEntrandoFila(false); return }
    await Promise.all([carregarSaldos(cliente.id, unidadeAtiva.id), loadHorarios()])
    setContratoAssinado(true); setModalFila(null); setEntrandoFila(false)
    router.push('/minha-conta')
  }

  const dataFormatada = (dataStr: string) => new Date(dataStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  if (loading || loadingUnidade) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const planosDisp = planosDisponiveisParaDia()
  const saldoExibir = saldoParaData()
  const todosSemSaldo = !!cliente && Object.keys(saldoExibir).length > 0 && planosDisp.length === 0
  const temFila = modalSlot ? temFilaNoHorario(modalSlot.hora) : false
  const dataSelEhProximoMes = diasSemana[diaSel].getMonth() !== new Date().getMonth() || diasSemana[diaSel].getFullYear() !== new Date().getFullYear()
  const isCredPro = tipoCredito.startsWith('coach_ct_pro_')

  const mostrarHero = !clienteBloqueado && unidadesPermitidas.length > 1 && !unidadeConfirmada

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .dia-btn-h { transition: all .2s; cursor: pointer; flex: 1; min-width: 0; }
        .dia-btn-h:hover { border-color: ${ACCENT} !important; }
        .dia-btn-disabled { opacity: 0.25; cursor: not-allowed !important; }
        .slot-row-h { transition: all .2s; }
        .slot-row-h:hover { border-color: ${ACCENT} !important; background: #ff2d9b08 !important; }
        .nav-semana-btn:hover:not(:disabled) { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .mini-card-pro:hover { border-color: ${ACCENT} !important; }
        .btn-cobranca:hover { opacity: 0.85; }
      `}</style>

      <SiteHeader />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '6rem 1.5rem 2rem' }}>

        {/* ══ HERO: Seleção de unidade ══ */}
        {mostrarHero ? (
          <div>
            <div style={{ marginBottom: '2.5rem' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#fff', letterSpacing: 1 }}>
                ONDE VOCÊ QUER TREINAR?
              </div>
              <div style={{ fontSize: 14, color: '#444', marginTop: 6 }}>
                Escolha a unidade para ver os horários disponíveis.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {unidadesPermitidas.map(u => (
                <CardUnidade
                  key={u.id}
                  unidade={u}
                  onClick={() => {
                    if (u.tipo === 'club') {
                      router.push(`/aulas?unidade=${u.id}`)
                    } else {
                      setUnidadeAtiva(u)
                      setUnidadeConfirmada(true)
                      setHorarios([])
                      setDiaSel(0)
                      setSemanaOffset(0)
                    }
                  }}
                />
              ))}
            </div>

            {!user && (
              <div style={{ marginTop: '2rem', background: '#0a0014', border: `1px solid ${ACCENT}22`, borderRadius: 12, padding: '1rem 1.25rem', fontSize: 13, color: '#666', textAlign: 'center' }}>
                👋 Visitante · <span onClick={() => router.push('/login')} style={{ color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>Faça login</span> para reservar treinos.
              </div>
            )}
          </div>

        ) : (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff' }}>AGENDAR TREINO</div>
              <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>
                {clienteBloqueado ? 'Conta com pendência — veja os detalhes abaixo' : 'Cada halter = uma vaga disponível'}
              </div>
            </div>

            {unidadesPermitidas.length > 1 && (
              <>
              <div style={{ display: 'flex', gap: 8, marginBottom: unidadeAtiva && ENDERECOS_UNIDADES[unidadeAtiva.nome] ? 10 : '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1 }}>Unidade:</span>
                {unidadesPermitidas.map(u => {
                  const ativa = unidadeAtiva?.id === u.id
                  const cor = u.tipo === 'club' ? CYAN : ACCENT
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        if (u.tipo === 'club') {
                          router.push(`/aulas?unidade=${u.id}`)
                        } else {
                          setUnidadeAtiva(u); setHorarios([]); setDiaSel(0); setSemanaOffset(0)
                        }
                      }}
                      style={{
                        padding: '0.35rem 1rem', borderRadius: 20,
                        border: `1.5px solid ${ativa ? cor : '#333'}`,
                        background: ativa ? `${cor}18` : 'transparent',
                        color: ativa ? cor : '#555',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif", transition: 'all .2s',
                      }}>
                      {u.nome}
                    </button>
                  )
                })}
                <button
                  onClick={() => setUnidadeConfirmada(false)}
                  style={{ marginLeft: 'auto', padding: '0.3rem 0.75rem', borderRadius: 20, border: '1px solid #222', background: 'transparent', color: '#444', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  ← Voltar
                </button>
              </div>
              {unidadeAtiva && ENDERECOS_UNIDADES[unidadeAtiva.nome] && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: '1.5rem', fontSize: 13, color: '#777', lineHeight: 1.4 }}>
                  <span style={{ flexShrink: 0 }}>📍</span>
                  <span>{ENDERECOS_UNIDADES[unidadeAtiva.nome]}</span>
                </div>
              )}
              </>
            )}

            {unidadesPermitidas.length === 1 && unidadeAtiva && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 8, padding: '0.35rem 0.85rem' }}>
                  <span style={{ fontSize: 12, color: ACCENT, fontWeight: 600 }}>{unidadeAtiva.nome}</span>
                </div>
                {ENDERECOS_UNIDADES[unidadeAtiva.nome] && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 8, fontSize: 13, color: '#777', lineHeight: 1.4 }}>
                    <span style={{ flexShrink: 0 }}>📍</span>
                    <span>{ENDERECOS_UNIDADES[unidadeAtiva.nome]}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Bloqueio por cobrança ── */}
            {clienteBloqueado && temCobrancaPendente && (
              <div style={{ background: '#1a0000', border: `2px solid ${VERMELHO}`, borderRadius: 16, padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
                  <div style={{ fontSize: 32 }}>🚫</div>
                  <div>
                    <div style={{ fontSize: 18, color: VERMELHO, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>CARTÃO RECUSADO</div>
                    <div style={{ fontSize: 13, color: '#ccc' }}>Não conseguimos cobrar a multa no seu cartão</div>
                  </div>
                </div>
                <div style={{ background: '#0a0000', border: `1px solid ${VERMELHO}33`, borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginBottom: 8 }}>Multas pendentes:</div>
                  {cobrancasPendentes.map((c, i) => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: i < cobrancasPendentes.length - 1 ? '1px solid #220000' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#ddd' }}>{c.motivo}</div>
                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Tentativa em {new Date(c.cobrado_em).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <div style={{ fontSize: 16, color: VERMELHO, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>R$ {Number(c.valor).toFixed(2).replace('.', ',')}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: `1px solid ${VERMELHO}33` }}>
                    <div style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>TOTAL</div>
                    <div style={{ fontSize: 18, color: VERMELHO, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>R$ {cobrancasPendentes.reduce((s, c) => s + Number(c.valor), 0).toFixed(2).replace('.', ',')}</div>
                  </div>
                </div>
                <button onClick={() => router.push('/cadastrar-cartao')} className="btn-cobranca"
                  style={{ width: '100%', background: VERMELHO, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem 1.25rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  💳 Atualizar cartão e regularizar
                </button>
              </div>
            )}

            {clienteBloqueado && !temCobrancaPendente && (
              <div style={{ background: '#1a1000', border: `2px solid ${AMARELO}`, borderRadius: 16, padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: 32 }}>⏳</div>
                  <div>
                    <div style={{ fontSize: 18, color: AMARELO, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>AGUARDANDO REGULARIZAÇÃO</div>
                    <div style={{ fontSize: 13, color: '#ccc' }}>Conta temporariamente bloqueada</div>
                  </div>
                </div>
                <div style={{ fontSize: 14, color: '#ddd', lineHeight: 1.7, marginBottom: '0.75rem' }}>
                  {cliente?.motivo_bloqueio || 'Você teve uma falta sem cancelamento prévio.'}
                </div>
                <div style={{ background: '#0a0500', border: `1px solid ${AMARELO}33`, borderRadius: 10, padding: '0.85rem 1rem', fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>
                  ⏳ <strong style={{ color: '#fff' }}>Aguarde a regularização da cobrança</strong> para fazer novos agendamentos.
                </div>
              </div>
            )}

            {!clienteBloqueado && tipoVisualizacao === 'visitante' && (
              <div style={{ background: '#0a0014', border: `1px solid ${ACCENT}33`, borderRadius: 12, padding: '0.85rem 1.25rem', marginBottom: '1.5rem', fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
                👋 Você está navegando como visitante. Faça login para reservar treinos.
              </div>
            )}

            {/* ── FIX: mostra skeleton enquanto saldos carregam, evitando flash do banner errado ── */}
            {!clienteBloqueado && loadingSaldos && cliente && (
              <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 16, padding: '1rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 16, height: 16, border: `2px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: '#444' }}>Verificando plano...</div>
              </div>
            )}

            {!clienteBloqueado && !loadingSaldos && semPlanoAtivo && (
              <div style={{ background: '#110008', border: `1.5px solid ${ACCENT}55`, borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, color: ACCENT, fontWeight: 700, marginBottom: 4 }}>⚡ Você não tem um plano ativo</div>
                  <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>Ative seu Wellhub, TotalPass ou compre sessões avulsas para começar a agendar.</div>
                </div>
                <button onClick={() => router.push('/meus-planos')} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.65rem 1.25rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>Ative seu plano →</button>
              </div>
            )}

            {!clienteBloqueado && !loadingSaldos && !semPlanoAtivo && precisaCartao && (
              <div style={{ background: '#1a1000', border: `1.5px solid ${AMARELO}55`, borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14, color: AMARELO, fontWeight: 700, marginBottom: 4 }}>💳 Cadastre um cartão para liberar agendamentos</div>
                  <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>Como seu plano é Wellhub/TotalPass, precisamos de um cartão registrado. <strong style={{ color: '#fff' }}>Nada será cobrado agora.</strong></div>
                </div>
                <button onClick={() => router.push('/cadastrar-cartao')} style={{ background: AMARELO, color: '#000', border: 'none', borderRadius: 10, padding: '0.65rem 1.25rem', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>Cadastrar cartão →</button>
              </div>
            )}

            {!clienteBloqueado && janelaProximoMesAberta && cliente && (
              <div style={{ background: '#0a0014', border: `1px solid ${ACCENT}33`, borderRadius: 12, padding: '0.85rem 1.25rem', marginBottom: '1.5rem', fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
                ✨ Agendamentos para o próximo mês já estão liberados.
              </div>
            )}

            {!clienteBloqueado && todosSemSaldo && !dataSelAposLimite && (
              <div style={{ background: '#1a0a00', border: '1px solid #ff660033', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 14, color: AMARELO, fontWeight: 600, marginBottom: 4 }}>⚠️ Sem créditos disponíveis</div>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>{dataSelEhProximoMes ? 'Você não tem créditos para o mês selecionado.' : 'Seus créditos renovam no dia 1º do próximo mês.'}</div>
              </div>
            )}

            {!clienteBloqueado && cliente && Object.keys(saldoExibir).length > 0 && !dataSelAposLimite && (
              <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {dataSelEhProximoMes && <span style={{ fontSize: 11, color: AMARELO, fontWeight: 600, marginRight: 4 }}>Saldo do próximo mês:</span>}
                {Object.entries(saldoExibir).map(([plano, info]: [string, any]) => {
                  const restante = info.disponivel
                  const { label } = parsePlanoKey(plano)
                  return (
                    <div key={plano} style={{ background: '#111', border: `1px solid ${restante === 0 ? '#333' : restante <= 2 ? '#ffaa0044' : '#ff2d9b33'}`, borderRadius: 10, padding: '0.5rem 1rem', fontSize: 12, color: restante === 0 ? '#444' : restante <= 2 ? AMARELO : ACCENT }}>
                      <span style={{ fontWeight: 600 }}>{restante}</span>
                      <span style={{ color: '#555', marginLeft: 4 }}>/ {info.total} {label}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {!clienteBloqueado && isDiaExclusivoPro && !dataSelAposLimite && (
              <div style={{ background: `linear-gradient(90deg, ${ACCENT}22 0%, #08080800 100%)`, border: `1px solid ${ACCENT}55`, borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: ACCENT, fontWeight: 700, fontFamily: "'DM Mono', monospace", letterSpacing: 0.5 }}>🏆 AGENDAMENTOS EXCLUSIVOS COACH CT PRO</div>
                <button onClick={() => router.push('/comprar')} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.4rem 0.85rem', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>CONHECER PLANO →</button>
              </div>
            )}

            {!clienteBloqueado && !isDiaExclusivoPro && tipoVisualizacao === 'visitante' && semanaOffset === 0 && (
              <div style={{ background: 'linear-gradient(90deg, #0a1a14 0%, #08080800 100%)', border: `1px solid #2ddd8b33`, borderRadius: 10, padding: '0.6rem 1rem', marginBottom: '0.75rem', fontSize: 12, color: '#2ddd8b', fontWeight: 600, fontFamily: "'DM Mono', monospace", letterSpacing: 0.5 }}>
                📅 AGENDAMENTO LIVRE · próximos 7 dias
              </div>
            )}

            {!clienteBloqueado && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <button className="nav-semana-btn" onClick={() => { setSemanaOffset(o => Math.max(0, o - 1)); setDiaSel(0) }} disabled={semanaOffset === 0}
                    style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #333', background: 'transparent', color: semanaOffset === 0 ? '#333' : '#fff', fontSize: 18, cursor: semanaOffset === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .2s' }}>‹</button>
                  <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                    {diasSemana.map((d, i) => {
                      const isHoje = semanaOffset === 0 && i === 0
                      const isSel = i === diaSel
                      const diaForaLimite = d > dataMaxima
                      return (
                        <div key={i} className={`dia-btn-h ${diaForaLimite ? 'dia-btn-disabled' : ''}`} onClick={() => !diaForaLimite && setDiaSel(i)}
                          style={{ padding: '0.6rem 0.25rem', borderRadius: 10, border: `1.5px solid ${isSel ? ACCENT : '#222'}`, background: isSel ? `${ACCENT}15` : 'transparent', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: isSel ? ACCENT : '#555', fontWeight: 600, marginBottom: 2 }}>{isHoje ? 'HOJE' : DIAS_SEMANA[d.getDay()]}</div>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: isSel ? '#fff' : '#888', lineHeight: 1 }}>{d.getDate()}</div>
                          <div style={{ fontSize: 9, color: isSel ? ACCENT : '#444', textTransform: 'uppercase' }}>{d.toLocaleDateString('pt-BR', { month: 'short' })}</div>
                        </div>
                      )
                    })}
                  </div>
                  <button className="nav-semana-btn" onClick={() => { setSemanaOffset(o => Math.min(semanasMaximas, o + 1)); setDiaSel(0) }} disabled={semanaOffset >= semanasMaximas}
                    style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #333', background: 'transparent', color: semanaOffset >= semanasMaximas ? '#333' : '#fff', fontSize: 18, cursor: semanaOffset >= semanasMaximas ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .2s' }}>›</button>
                </div>

                {tipoDia === 'feriado' && (
                  <div style={{ background: '#1a1000', border: `1px solid ${AMARELO}44`, borderRadius: 12, padding: '0.85rem 1.25rem', marginBottom: '1rem', fontSize: 13, color: '#ddd', lineHeight: 1.6 }}>
                    ⭐ <strong style={{ color: AMARELO }}>{feriadoDescricao}</strong> — funcionando com escala especial e horários de fim de semana.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  {[{ key: 'todos', label: 'Todos' }, { key: 'manha', label: '🌅 Manhã' }, { key: 'tarde', label: '☀️ Tarde' }, { key: 'noite', label: '🌙 Noite' }].map(p => (
                    <button key={p.key} onClick={() => setPeriodo(p.key as any)}
                      style={{ padding: '0.35rem 1rem', borderRadius: 20, border: `1px solid ${periodo === p.key ? ACCENT : '#333'}`, background: periodo === p.key ? `${ACCENT}20` : 'transparent', color: periodo === p.key ? ACCENT : '#555', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                      {p.label}
                    </button>
                  ))}
                </div>

                {dataSelAposLimite ? (
                  <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#666' }}>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>📅 Data ainda não liberada</div>
                    <div style={{ fontSize: 12, color: '#555' }}>Agendamentos liberados em janela de 14 dias.</div>
                  </div>
                ) : !unidadeAtiva ? (
                  <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#444' }}>Selecione uma unidade para ver os horários.</div>
                ) : loadingHorarios ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#555' }}>Carregando horários...</div>
                ) : horariosFiltrados.length === 0 ? (
                  <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#666', lineHeight: 1.7 }}>
                    {tipoDia === 'fds' ? <><div style={{ fontSize: 32, marginBottom: 8 }}>📅</div><div style={{ fontSize: 14, color: '#888' }}>Não há coaches escalados neste dia ainda.</div></>
                      : tipoDia === 'feriado' ? <><div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div><div style={{ fontSize: 14, color: '#888' }}>Feriado sem coaches escalados.</div></>
                      : semanaOffset === 0 && diaSel === 0 ? 'Não há mais horários disponíveis para hoje.' : 'Nenhum horário disponível neste dia.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {horariosFiltrados.map((h, i) => {
                      const lotado = h.livres <= 0
                      const clienteNaFila = naFila(h.hora)
                      const jaAgendado = agendamentosNoDia.some(a => (a.horario || '').slice(0, 5) === h.hora && ['agendado', 'confirmado'].includes(a.status))
                      const temFilaEsperaAqui = temFilaNoHorario(h.hora)
                      return (
                        <div key={i} className="slot-row-h"
                          style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1rem 1.25rem', borderRadius: 12, border: `1px solid ${jaAgendado ? CYAN + '44' : clienteNaFila ? AMARELO + '44' : '#222'}`, background: jaAgendado ? '#00e5ff08' : clienteNaFila ? '#ffaa0008' : '#111' }}>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, color: '#fff', width: 58, flexShrink: 0 }}>{h.hora}</div>
                          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                            {Array.from({ length: h.total }).map((_, vi) => {
                              let estado: 'livre' | 'ocupado' | 'meu' | 'fila' | 'bloqueado' = 'livre'
                              if (jaAgendado && vi === 0) estado = 'meu'
                              else if (clienteNaFila && vi === 0) estado = 'fila'
                              else if (vi < h.ocupados) estado = 'ocupado'
                              else if (vi < h.ocupados + h.bloqueadas) estado = 'bloqueado'
                              return <HalterSVG key={vi} estado={estado} onClick={!isDiaExclusivoPro ? () => !lotado && !jaAgendado && tentarAgendar(h.hora, h.livres) : undefined} />
                            })}
                          </div>
                          <div style={{ flexShrink: 0, minWidth: 110, textAlign: 'right' }}>
                            {jaAgendado ? (
                              <div style={{ fontSize: 11, color: CYAN, fontWeight: 600 }}>RESERVADO ✓</div>
                            ) : clienteNaFila ? (
                              <div style={{ fontSize: 11, color: AMARELO, fontWeight: 600 }}>NA FILA ⏳</div>
                            ) : isDiaExclusivoPro ? (
                              <div className="mini-card-pro" onClick={() => router.push('/comprar')}
                                style={{ background: '#0d0010', border: `1px solid ${ACCENT}55`, borderRadius: 10, padding: '0.6rem 0.75rem', cursor: 'pointer', textAlign: 'left', transition: 'border-color .2s' }}>
                                <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>🏆 Exclusivo Pro</div>
                                <div style={{ fontSize: 11, color: '#aaa', textDecoration: 'underline' }}>Conhecer planos →</div>
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: lotado ? '#ff4444' : h.livres <= 2 ? AMARELO : ACCENT, fontWeight: 600, marginBottom: 4 }}>
                                  {lotado ? 'LOTADO' : h.livres === 1 ? '1 VAGA' : `${h.livres} VAGAS`}
                                </div>
                                {h.bloqueadas > 0 && !lotado && <div style={{ fontSize: 9, color: '#ff4444', marginBottom: 4 }}>{h.bloqueadas} bloq.</div>}
                                {temFilaEsperaAqui && !lotado && <div style={{ fontSize: 9, color: AMARELO, marginBottom: 4 }}>⏳ há fila</div>}
                                {!lotado && <button onClick={() => tentarAgendar(h.hora, h.livres)} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Reservar</button>}
                                {lotado && <button onClick={() => tentarFila(h.hora)} style={{ background: 'transparent', color: AMARELO, border: `1px solid ${AMARELO}`, borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Entrar na fila</button>}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ══ MODAIS ══ */}
      {modalSemPlano && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: `1.5px solid ${ACCENT}55`, borderRadius: 20, width: '100%', maxWidth: 400, padding: '1.5rem' }}>
            <div style={{ fontSize: 36, marginBottom: '1rem', textAlign: 'center' }}>⚡</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 8, textAlign: 'center' }}>PLANO NECESSÁRIO</div>
            <div style={{ fontSize: 14, color: '#aaa', lineHeight: 1.7, marginBottom: '1.5rem', textAlign: 'center' }}>
              Para agendar você precisa de um plano ativo. Ative seu <strong style={{ color: '#fff' }}>Wellhub</strong>, <strong style={{ color: '#fff' }}>TotalPass</strong> ou compre sessões avulsas.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalSemPlano(false)} style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Fechar</button>
              <button onClick={() => router.push('/meus-planos')} style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Ative seu plano →</button>
            </div>
          </div>
        </div>
      )}

      {modalSemCartao && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: `1.5px solid ${AMARELO}55`, borderRadius: 20, width: '100%', maxWidth: 420, padding: '1.5rem' }}>
            <div style={{ fontSize: 36, marginBottom: '1rem', textAlign: 'center' }}>💳</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 8, textAlign: 'center' }}>CARTÃO NECESSÁRIO</div>
            <div style={{ fontSize: 14, color: '#aaa', lineHeight: 1.7, marginBottom: '1rem', textAlign: 'center' }}>
              Como seu plano é <strong style={{ color: '#fff' }}>Wellhub/TotalPass</strong>, precisamos de um cartão cadastrado pra cobrir possíveis multas por faltas.
            </div>
            <div style={{ background: '#0a0a0a', border: `1px solid ${AMARELO}33`, borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: 13, color: AMARELO, textAlign: 'center', fontWeight: 600 }}>
              🔒 Nada será cobrado agora
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalSemCartao(false)} style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Fechar</button>
              <button onClick={() => router.push('/cadastrar-cartao')} style={{ flex: 2, background: AMARELO, color: '#000', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Cadastrar cartão →</button>
            </div>
          </div>
        </div>
      )}

      {mostrarContrato && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid #222' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 1 }}>CONTRATO COACH CT</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Leia antes de fazer sua primeira reserva</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              <pre style={{ fontSize: 13, color: '#aaa', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif" }}>{CONTRATO}</pre>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #222' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem' }}>
                <input type="checkbox" checked={aceiteCheck} onChange={e => setAceiteCheck(e.target.checked)} style={{ marginTop: 2, accentColor: ACCENT, width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>Li e aceito o contrato e as regras de agendamento, cancelamento e falta.</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setMostrarContrato(false); setModalSlot(null); setModalFila(null) }} style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.75rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
                <button onClick={() => { if (aceiteCheck) { setContratoAssinado(true); setMostrarContrato(false) } }} disabled={!aceiteCheck}
                  style={{ flex: 2, background: aceiteCheck ? ACCENT : '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontWeight: 600, fontSize: 14, cursor: aceiteCheck ? 'pointer' : 'default', fontFamily: "'DM Sans', sans-serif" }}>
                  Aceitar e continuar →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalSlot && !mostrarContrato && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 440, padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 4 }}>CONFIRMAR RESERVA</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 2, textTransform: 'capitalize' }}>{dataFormatada(modalSlot.data)} · {modalSlot.hora}</div>
            {unidadeAtiva && <div style={{ fontSize: 12, color: ACCENT, marginBottom: '1.5rem', fontWeight: 600 }}>📍 {unidadeAtiva.nome}</div>}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Como vai usar esta sessão?</div>
              {planosDisp.length === 0 ? (
                <div style={{ background: '#1a0a00', border: '1px solid #ff660033', borderRadius: 10, padding: '1rem', fontSize: 13, color: AMARELO }}>⚠️ Você não tem créditos disponíveis.</div>
              ) : planosDisp.map(p => {
                const { label, icon } = parsePlanoKey(p)
                return (
                  <div key={p} onClick={() => setTipoCredito(p)}
                    style={{ border: `1.5px solid ${tipoCredito === p ? ACCENT : '#333'}`, background: tipoCredito === p ? `${ACCENT}12` : 'transparent', borderRadius: 10, padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8, transition: 'all .15s' }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: tipoCredito === p ? '#fff' : '#888' }}>{label}</div>
                      {saldoExibir[p] && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{saldoExibir[p].disponivel} sessões restantes {p.startsWith('coach_ct_pro_') ? 'no plano' : dataSelEhProximoMes ? 'no próximo mês' : 'este mês'}</div>}
                    </div>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${tipoCredito === p ? ACCENT : '#444'}`, background: tipoCredito === p ? ACCENT : 'transparent', flexShrink: 0 }} />
                  </div>
                )
              })}
            </div>
            {isCredPro && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Deseja escolher seu coach?</div>
                <select value={coachEscolhido} onChange={e => setCoachEscolhido(e.target.value)}
                  style={{ width: '100%', background: '#0a0a0a', border: `1.5px solid ${coachEscolhido ? ACCENT : '#333'}`, borderRadius: 10, padding: '0.75rem 1rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}>
                  <option value="">Qualquer coach disponível</option>
                  {coachesDisponiveis.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                {coachesDisponiveis.length === 0 && <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>Sem coaches disponíveis pra escolha neste horário.</div>}
              </div>
            )}
            <div style={{ background: temFila ? '#1a1000' : '#0a0a0a', border: `1px solid ${temFila ? AMARELO + '44' : '#1a1a1a'}`, borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: 12, lineHeight: 1.7 }}>
              {temFila
                ? <><div style={{ color: AMARELO, fontWeight: 600, marginBottom: 4 }}>⏳ Há fila de espera para este horário</div><div style={{ color: '#888' }}>Cancelamento gratuito <strong style={{ color: '#fff' }}>até 3h antes</strong>. Abaixo de 3h: <strong style={{ color: '#ff4444' }}>bloqueado</strong>.</div></>
                : <div style={{ color: '#555' }}>⚠️ Cancelamento gratuito <strong style={{ color: '#888' }}>{isCredPro ? 'até 3h antes' : 'até 12h antes'}</strong>. Falta sem aviso gera bloqueio.</div>
              }
            </div>
            {erroModal && <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>{erroModal}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalSlot(null)} style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
              <button onClick={confirmarAgendamento} disabled={confirmando || planosDisp.length === 0}
                style={{ flex: 2, background: planosDisp.length === 0 ? '#222' : ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: confirmando || planosDisp.length === 0 ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: confirmando ? 0.7 : 1 }}>
                {confirmando ? 'Confirmando...' : 'Confirmar reserva ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFila && !mostrarContrato && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: `1px solid ${AMARELO}33`, borderRadius: 20, width: '100%', maxWidth: 440, padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: AMARELO, marginBottom: 4 }}>FILA DE ESPERA</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 2, textTransform: 'capitalize' }}>{dataFormatada(modalFila.data)} · {modalFila.hora}</div>
            {unidadeAtiva && <div style={{ fontSize: 12, color: AMARELO, marginBottom: '1.5rem', fontWeight: 600 }}>📍 {unidadeAtiva.nome}</div>}
            <div style={{ background: '#1a1000', border: `1px solid ${AMARELO}33`, borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', fontSize: 13, color: '#aaa', lineHeight: 1.7 }}>
              <div style={{ color: AMARELO, fontWeight: 600, marginBottom: 6 }}>⚠️ Atenção antes de entrar na fila</div>
              <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li>Se alguém cancelar, <strong style={{ color: '#fff' }}>você será automaticamente reservado</strong> — até 3h antes.</li>
                <li>Após confirmado, cancelamento <strong style={{ color: '#fff' }}>até 3h antes</strong> — só com outra pessoa na fila.</li>
                <li>Falta sem aviso gera multa.</li>
              </ul>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Usar crédito de qual plano?</div>
              {planosDisp.map(p => {
                const { label, icon } = parsePlanoKey(p)
                return (
                  <div key={p} onClick={() => setTipoFilaCredito(p)}
                    style={{ border: `1.5px solid ${tipoFilaCredito === p ? AMARELO : '#333'}`, background: tipoFilaCredito === p ? `${AMARELO}12` : 'transparent', borderRadius: 10, padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8, transition: 'all .15s' }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: tipoFilaCredito === p ? '#fff' : '#888' }}>{label}</div>
                      {saldoExibir[p] && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{saldoExibir[p].disponivel} sessões restantes</div>}
                    </div>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${tipoFilaCredito === p ? AMARELO : '#444'}`, background: tipoFilaCredito === p ? AMARELO : 'transparent', flexShrink: 0 }} />
                  </div>
                )
              })}
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Como quer ser avisado?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {notifOpcoes.map(op => (
                  <div key={op.key} onClick={() => setNotifFila(op.key as any)}
                    style={{ flex: 1, border: `1.5px solid ${notifFila === op.key ? AMARELO : '#333'}`, background: notifFila === op.key ? `${AMARELO}12` : 'transparent', borderRadius: 10, padding: '0.6rem 0.5rem', cursor: 'pointer', textAlign: 'center', transition: 'all .15s' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{op.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: notifFila === op.key ? '#fff' : '#666' }}>{op.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
              <input type="checkbox" checked={filaAceite} onChange={e => setFilaAceite(e.target.checked)} style={{ marginTop: 2, accentColor: AMARELO, width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>Entendi as regras. Se uma vaga abrir, aceito o agendamento automático.</span>
            </label>
            {erroFila && <div style={{ background: '#ffaa0015', border: '1px solid #ffaa0044', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: AMARELO, marginBottom: '1rem' }}>{erroFila}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalFila(null)} style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
              <button onClick={confirmarFila} disabled={entrandoFila}
                style={{ flex: 2, background: AMARELO, color: '#000', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 700, fontSize: 15, cursor: entrandoFila ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: entrandoFila ? 0.7 : 1 }}>
                {entrandoFila ? 'Entrando...' : 'Entrar na fila ⏳'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalTelefone
        aberto={modalTelefone}
        onFechar={() => { setModalTelefone(false); setPendingReserva(null) }}
        onSucesso={(tel) => {
          setCliente((prev: any) => prev ? { ...prev, telefone: tel } : prev)
          setModalTelefone(false)
          const acao = pendingReserva
          setPendingReserva(null)
          if (acao) acao()
        }}
      />
    </div>
  )
}
