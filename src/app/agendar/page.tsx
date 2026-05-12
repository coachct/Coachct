'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'
const CYAN = '#00e5ff'
const AMARELO = '#ffaa00'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HORARIOS_FDS = ['08:00', '09:00', '10:00', '11:00', '12:00']

function dentroDaJanelaProximoMes(): boolean {
  const hoje = new Date()
  const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
  const diasAteFimMes = ultimoDiaMes - hoje.getDate()
  return diasAteFimMes <= 7
}

const CONTRATO = `CONTRATO DE ADESÃO — COACH CT / JUST CT

1. OBJETO
O presente contrato regula as condições de uso do serviço Coach CT, que consiste no agendamento de sessões de treinamento personalizado com coaches da unidade Just CT.

2. REGRAS DE AGENDAMENTO
2.1. Wellhub Diamond: até 8 sessões Coach CT por mês-calendário.
2.2. TotalPass TP6: até 10 sessões Coach CT por mês-calendário.
2.3. Plano Avulso Coach CT: crédito válido por 30 dias a partir da compra.
2.4. Os créditos dos planos Wellhub e TotalPass não são acumulativos e renovam-se todo dia 1º de cada mês.
2.5. Agendamentos para o mês seguinte são liberados a partir de 7 dias antes da virada.

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

  if (lower.startsWith('wellhub')) { tipo = 'Wellhub'; icon = '💜' }
  else if (lower.startsWith('totalpass')) { tipo = 'TotalPass'; icon = '🔵' }
  else if (lower.startsWith('avulso') || lower.startsWith('credito')) { tipo = 'Crédito Avulso'; icon = '🎟️' }
  else { tipo = key }

  const partes = key.split('_')
  const slugUnidade = partes.slice(1).join('_')

  const nomeUnidade: Record<string, string> = {
    just_ct: 'Just CT',
    just_club_vila_olimpia: 'Vila Olímpia',
    just_club_pinheiros: 'Pinheiros',
  }
  const unidadeLabel = nomeUnidade[slugUnidade] || slugUnidade.replace(/_/g, ' ')

  return { label: `${tipo} — ${unidadeLabel}`, icon }
}

function HalterSVG({ estado, onClick }: { estado: 'livre' | 'ocupado' | 'meu' | 'fila' | 'bloqueado', onClick?: () => void }) {
  const cor = estado === 'ocupado' ? '#333' : estado === 'meu' ? CYAN : estado === 'fila' ? AMARELO : estado === 'bloqueado' ? '#ff4444' : ACCENT
  const opacity = estado === 'ocupado' ? 0.3 : estado === 'bloqueado' ? 0.4 : 1
  return (
    <svg width="36" height="36" viewBox="0 0 48 28"
      style={{ opacity, flexShrink: 0, cursor: estado === 'livre' ? 'pointer' : 'default' }}
      onClick={estado === 'livre' ? onClick : undefined}>
      <rect x="15" y="11.5" width="18" height="5" rx="2" fill={cor} />
      <rect x="2" y="5" width="5" height="18" rx="3" fill={cor} />
      <rect x="8" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="36" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="41" y="5" width="5" height="18" rx="3" fill={cor} />
    </svg>
  )
}

export default function AgendarPage() {
  const { user, perfil, loading } = useAuth()
  const { unidadeAtiva, setUnidadeAtiva, unidadesPermitidas, loading: loadingUnidade } = useUnidade()
  const router = useRouter()
  const supabase = createClient()

  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [periodo, setPeriodo] = useState<'todos' | 'manha' | 'tarde' | 'noite'>('todos')
  const [horarios, setHorarios] = useState<any[]>([])
  const [cliente, setCliente] = useState<any>(null)
  const [loadingHorarios, setLoadingHorarios] = useState(false)
  const [tipoDia, setTipoDia] = useState<'util' | 'fds' | 'feriado'>('util')
  const [feriadoDescricao, setFeriadoDescricao] = useState<string>('')

  const [saldoMesAtual, setSaldoMesAtual] = useState<Record<string, { total: number; usado: number; disponivel: number }>>({})
  const [saldoMesProximo, setSaldoMesProximo] = useState<Record<string, { total: number; usado: number; disponivel: number }>>({})
  const [agendamentosNoDia, setAgendamentosNoDia] = useState<any[]>([])
  const [filasDoCliente, setFilasDoCliente] = useState<any[]>([])
  const [filaGeral, setFilaGeral] = useState<any[]>([])

  const [modalSlot, setModalSlot] = useState<{ data: string; hora: string; vagas: number } | null>(null)
  const [tipoCredito, setTipoCredito] = useState<string>('')
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

  // Novo: modal sem plano ativo
  const [modalSemPlano, setModalSemPlano] = useState(false)

  const janelaProximoMesAberta = dentroDaJanelaProximoMes()

  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + semanaOffset * 7 + i)
    return d
  })

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && perfil && perfil.role && !['cliente'].includes(perfil.role as string)) router.push('/equipe')
  }, [user, perfil, loading])

  useEffect(() => {
    if (perfil) loadCliente()
  }, [perfil])

  useEffect(() => {
    if (perfil && cliente && unidadeAtiva) {
      carregarSaldos(cliente.id, unidadeAtiva.id)
    }
  }, [unidadeAtiva?.id, cliente?.id])

  useEffect(() => {
    if (perfil && cliente && unidadeAtiva) loadHorarios()
  }, [diaSel, semanaOffset, perfil, cliente, unidadeAtiva?.id])

  async function loadCliente() {
    const { data } = await supabase.from('clientes').select('*').eq('user_id', perfil!.id).maybeSingle()
    setCliente(data)
    if (data) {
      const { count } = await supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('cliente_id', data.id)
      setContratoAssinado((count || 0) > 0)
      setNotifFila(data.notificacao_preferida || 'whatsapp')
    }
  }

  async function carregarSaldos(clienteId: string, unidadeId: string) {
    const agora = new Date()
    const mesAtual = agora.getMonth() + 1
    const anoAtual = agora.getFullYear()
    const mesProximo = mesAtual === 12 ? 1 : mesAtual + 1
    const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual

    const { data: atual } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteId,
      p_mes: mesAtual,
      p_ano: anoAtual,
      p_unidade_id: unidadeId,
    })
    setSaldoMesAtual(atual || {})

    if (janelaProximoMesAberta) {
      const { data: proximo } = await supabase.rpc('saldo_creditos_cliente', {
        p_cliente_id: clienteId,
        p_mes: mesProximo,
        p_ano: anoProximo,
        p_unidade_id: unidadeId,
      })
      setSaldoMesProximo(proximo || {})
    } else {
      setSaldoMesProximo({})
    }
  }

  async function loadHorarios() {
    if (!unidadeAtiva) return
    setLoadingHorarios(true)

    try {
      const dataSel = diasSemana[diaSel]
      if (!dataSel) { setHorarios([]); setLoadingHorarios(false); return }

      const diaSem = dataSel.getDay()
      const dataStr = dataSel.toISOString().split('T')[0]
      const hoje = new Date().toISOString().split('T')[0]
      const agora = new Date()
      const horaAtual = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
      const isDiaDe = dataStr === hoje

      const { data: feriadoData } = await supabase
        .from('feriados').select('*').eq('unidade_id', unidadeAtiva.id).eq('data', dataStr).eq('ativo', true).maybeSingle()

      const ehFeriado = !!feriadoData
      const ehFds = diaSem === 0 || diaSem === 6
      const usaEscalaFds = ehFeriado || ehFds

      if (ehFeriado) { setTipoDia('feriado'); setFeriadoDescricao(feriadoData.descricao || '') }
      else if (ehFds) { setTipoDia('fds'); setFeriadoDescricao('') }
      else { setTipoDia('util'); setFeriadoDescricao('') }

      let porHora: Record<string, number> = {}

      if (usaEscalaFds) {
        const { data: escala } = await supabase.from('escala_fds').select('coach_id').eq('unidade_id', unidadeAtiva.id).eq('data', dataStr)
        const qtdCoaches = (escala || []).length
        if (qtdCoaches > 0) {
          for (const hora of HORARIOS_FDS) {
            if (isDiaDe && hora <= horaAtual) continue
            porHora[hora] = qtdCoaches
          }
        }
      } else {
        const { data: hors } = await supabase.from('coach_horarios').select('hora').eq('dia_semana', diaSem).eq('ativo', true).eq('unidade_id', unidadeAtiva.id)
        for (const h of (hors || [])) {
          const hora = (h.hora || '').slice(0, 5)
          if (isDiaDe && hora <= horaAtual) continue
          porHora[hora] = (porHora[hora] || 0) + 1
        }
      }

      const [agsRes, agClienteRes, filasRes, filaGeralRes, bloqueadasRes] = await Promise.allSettled([
        supabase.from('agendamentos').select('horario, status').eq('data', dataStr).eq('unidade_id', unidadeAtiva.id).neq('status', 'cancelado'),
        supabase.from('agendamentos').select('horario, tipo_credito, status').eq('data', dataStr).eq('cliente_id', cliente.id).eq('unidade_id', unidadeAtiva.id),
        supabase.from('fila_espera').select('horario').eq('data', dataStr).eq('cliente_id', cliente.id).eq('unidade_id', unidadeAtiva.id),
        supabase.from('fila_espera').select('horario').eq('data', dataStr).eq('status', 'aguardando').eq('unidade_id', unidadeAtiva.id),
        supabase.from('vagas_bloqueadas').select('horario, quantidade').eq('data', dataStr).eq('ativo', true).eq('unidade_id', unidadeAtiva.id),
      ])

      const ags = agsRes.status === 'fulfilled' ? agsRes.value.data : []
      const agCliente = agClienteRes.status === 'fulfilled' ? agClienteRes.value.data : []
      const filas = filasRes.status === 'fulfilled' ? filasRes.value.data : []
      const filaGeralData = filaGeralRes.status === 'fulfilled' ? filaGeralRes.value.data : []
      const bloqueadas = bloqueadasRes.status === 'fulfilled' ? bloqueadasRes.value.data : []

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
        return { hora, total, ocupados: ocup, bloqueadas: bloq, livres: Math.max(0, total - ocup - bloq) }
      }).sort((a, b) => a.hora.localeCompare(b.hora))

      setHorarios(resultado)
      setAgendamentosNoDia(agCliente || [])
      setFilasDoCliente(filas || [])
      setFilaGeral(filaGeralData || [])
    } catch (err) {
      console.error('Erro carregando horários:', err)
      setHorarios([])
    } finally {
      setLoadingHorarios(false)
    }
  }

  const hojeRef = new Date()
  const mesAtualRef = hojeRef.getMonth()
  const anoAtualRef = hojeRef.getFullYear()
  const ultimoDiaMesAtual = new Date(anoAtualRef, mesAtualRef + 1, 0)
  const ultimoDiaMesProximo = new Date(anoAtualRef, mesAtualRef + 2, 0)
  const dataMaxima = janelaProximoMesAberta ? ultimoDiaMesProximo : ultimoDiaMesAtual
  const diasAteDataMaxima = Math.floor((dataMaxima.getTime() - hojeRef.getTime()) / (1000 * 60 * 60 * 24))
  const semanasMaximas = Math.floor(diasAteDataMaxima / 7)

  const horariosFiltrados = horarios.filter(h => {
    const hr = parseInt(h.hora)
    if (periodo === 'manha') return hr < 12
    if (periodo === 'tarde') return hr >= 12 && hr < 18
    if (periodo === 'noite') return hr >= 18
    return true
  })

  const dataSelecionada = diasSemana[diaSel]
  const dataSelAposLimite = dataSelecionada > dataMaxima

  function jaAgendouNoDia(plano: string) {
    return agendamentosNoDia.some(a => a.tipo_credito === plano && ['agendado', 'confirmado', 'realizado'].includes(a.status))
  }

  function naFila(hora: string) {
    return filasDoCliente.some(f => (f.horario || '').slice(0, 5) === hora)
  }

  function temFilaNoHorario(hora: string) {
    return filaGeral.some(f => (f.horario || '').slice(0, 5) === hora)
  }

  function saldoParaData(): Record<string, any> {
    const dataSel = diasSemana[diaSel]
    const agora = new Date()
    const mesmoMes = dataSel.getMonth() === agora.getMonth() && dataSel.getFullYear() === agora.getFullYear()
    return mesmoMes ? saldoMesAtual : saldoMesProximo
  }

  function planosDisponiveisParaDia() {
    const saldo = saldoParaData()
    const disponiveis: string[] = []
    for (const plano of Object.keys(saldo)) {
      if (saldo[plano].disponivel > 0 && !jaAgendouNoDia(plano)) disponiveis.push(plano)
    }
    return disponiveis
  }

  const notifOpcoes = [
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
    { key: 'email', label: 'Email', icon: '📧' },
    { key: 'nenhuma', label: 'Sem aviso', icon: '🔕' },
  ]

  const semPlanoAtivo = !loadingHorarios && cliente && Object.keys(saldoMesAtual).length === 0 && Object.keys(saldoMesProximo).length === 0

  function tentarAgendar(hora: string, vagas: number) {
    if (semPlanoAtivo) { setModalSemPlano(true); return }
    abrirModalReserva(hora, vagas)
  }

  function tentarFila(hora: string) {
    if (semPlanoAtivo) { setModalSemPlano(true); return }
    abrirModalFila(hora)
  }

  function abrirModalReserva(hora: string, vagas: number) {
    const dataStr = diasSemana[diaSel].toISOString().split('T')[0]
    setModalSlot({ data: dataStr, hora, vagas })
    setTipoCredito('')
    setErroModal('')
    if (!contratoAssinado) setMostrarContrato(true)
  }

  function abrirModalFila(hora: string) {
    const dataStr = diasSemana[diaSel].toISOString().split('T')[0]
    setModalFila({ data: dataStr, hora })
    setTipoFilaCredito('')
    setErroFila('')
    setFilaAceite(false)
    setNotifFila(cliente?.notificacao_preferida || 'whatsapp')
    if (!contratoAssinado) setMostrarContrato(true)
  }

  async function confirmarAgendamento() {
    if (!tipoCredito) { setErroModal('Selecione como vai usar esta sessão.'); return }
    if (!modalSlot || !cliente || !unidadeAtiva) return
    if (jaAgendouNoDia(tipoCredito)) {
      const { label } = parsePlanoKey(tipoCredito)
      setErroModal(`Você já tem um agendamento com ${label} neste dia nesta unidade.`)
      return
    }
    const saldo = saldoParaData()
    if (saldo[tipoCredito] && saldo[tipoCredito].disponivel <= 0) { setErroModal('Saldo insuficiente para este plano.'); return }
    setConfirmando(true)
    setErroModal('')

    const { error } = await supabase.from('agendamentos').insert({
      cliente_id: cliente.id,
      data: modalSlot.data,
      horario: modalSlot.hora + ':00',
      status: 'agendado',
      tipo_credito: tipoCredito,
      unidade_id: unidadeAtiva.id,
    })

    if (error) { setErroModal('Erro ao agendar. Tente novamente.'); setConfirmando(false); return }
    setContratoAssinado(true)
    setModalSlot(null)
    setConfirmando(false)
    router.push('/minha-conta')
  }

  async function confirmarFila() {
    if (!tipoFilaCredito) { setErroFila('Selecione como vai usar esta sessão.'); return }
    if (!filaAceite) { setErroFila('Confirme que entendeu as regras da fila.'); return }
    if (!modalFila || !cliente || !unidadeAtiva) return

    setEntrandoFila(true)
    setErroFila('')

    if (notifFila !== cliente.notificacao_preferida) {
      await supabase.from('clientes').update({ notificacao_preferida: notifFila }).eq('id', cliente.id)
      setCliente({ ...cliente, notificacao_preferida: notifFila })
    }

    const { error } = await supabase.from('fila_espera').insert({
      cliente_id: cliente.id,
      data: modalFila.data,
      horario: modalFila.hora + ':00',
      tipo_credito: tipoFilaCredito,
      status: 'aguardando',
      unidade_id: unidadeAtiva.id,
    })

    if (error) { setErroFila('Erro ao entrar na fila. Tente novamente.'); setEntrandoFila(false); return }
    setContratoAssinado(true)
    setModalFila(null)
    setEntrandoFila(false)
    router.push('/minha-conta')
  }

  async function sair() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const dataFormatada = (dataStr: string) => {
    const d = new Date(dataStr + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  if (loading || loadingUnidade) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const planosDisp = planosDisponiveisParaDia()
  const saldoExibir = saldoParaData()
  const todosSemSaldo = Object.keys(saldoExibir).length > 0 && planosDisp.length === 0
  const temFila = modalSlot ? temFilaNoHorario(modalSlot.hora) : false
  const dataSelEhProximoMes = diasSemana[diaSel].getMonth() !== new Date().getMonth() || diasSemana[diaSel].getFullYear() !== new Date().getFullYear()

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
        .unidade-tab:hover { border-color: ${ACCENT} !important; color: #fff !important; }
        .nav-link-cliente:hover { color: ${ACCENT} !important; }
        @media (max-width: 640px) {
          .header-nav-r { gap: 0.5rem !important; }
          .header-nav-r .link-init { display: none !important; }
        }
      `}</style>

      <div style={{ background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div className="header-nav-r" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <span onClick={() => router.push('/')} className="nav-link-cliente link-init" style={{ fontSize: 13, color: '#888', cursor: 'pointer', transition: 'color .2s' }}>Início</span>
          <span onClick={() => router.push('/minha-conta')} className="nav-link-cliente" style={{ fontSize: 13, color: '#888', cursor: 'pointer', transition: 'color .2s' }}>Minha conta</span>
          <span onClick={() => router.push('/meus-planos')} className="nav-link-cliente" style={{ fontSize: 13, color: '#888', cursor: 'pointer', transition: 'color .2s' }}>Meus planos</span>
          <button onClick={sair} style={{ background: 'transparent', border: '1px solid #444', borderRadius: 8, padding: '0.4rem 1rem', color: '#bbb', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Sair</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff' }}>AGENDAR TREINO</div>
          <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>Cada halter = uma vaga disponível</div>
        </div>

        {/* Banner sem plano ativo */}
        {semPlanoAtivo && (
          <div style={{ background: '#110008', border: `1.5px solid ${ACCENT}55`, borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, color: ACCENT, fontWeight: 700, marginBottom: 4 }}>⚡ Você não tem um plano ativo</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>Ative seu Wellhub, TotalPass ou compre sessões avulsas para começar a agendar.</div>
            </div>
            <button onClick={() => router.push('/meus-planos')} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.65rem 1.25rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>
              Ative seu plano →
            </button>
          </div>
        )}

        {janelaProximoMesAberta && (
          <div style={{ background: '#0a0014', border: `1px solid ${ACCENT}33`, borderRadius: 12, padding: '0.85rem 1.25rem', marginBottom: '1.5rem', fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
            ✨ Agendamentos para o próximo mês já estão liberados.
          </div>
        )}

        {unidadesPermitidas.length > 1 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Unidade</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {unidadesPermitidas.map(u => {
                const ativa = unidadeAtiva?.id === u.id
                return (
                  <button key={u.id} className="unidade-tab"
                    onClick={() => { setUnidadeAtiva(u); setHorarios([]); setDiaSel(0); setSemanaOffset(0) }}
                    style={{ padding: '0.5rem 1.25rem', borderRadius: 10, border: `1.5px solid ${ativa ? ACCENT : '#333'}`, background: ativa ? `${ACCENT}18` : 'transparent', color: ativa ? ACCENT : '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
                    {u.nome}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {unidadesPermitidas.length === 1 && unidadeAtiva && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 8, padding: '0.35rem 0.85rem' }}>
              <span style={{ fontSize: 12, color: ACCENT, fontWeight: 600 }}>{unidadeAtiva.nome}</span>
            </div>
          </div>
        )}

        {todosSemSaldo && !dataSelAposLimite && (
          <div style={{ background: '#1a0a00', border: '1px solid #ff660033', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: 14, color: AMARELO, fontWeight: 600, marginBottom: 4 }}>⚠️ Sem créditos disponíveis</div>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
              {dataSelEhProximoMes ? 'Você não tem créditos para o mês selecionado nesta unidade.' : 'Seus créditos renovam no dia 1º do próximo mês. Você ainda pode treinar comprando sessões avulsas na recepção.'}
            </div>
          </div>
        )}

        {Object.keys(saldoExibir).length > 0 && !dataSelAposLimite && (
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
            <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>Os agendamentos para o próximo mês são liberados nos últimos 7 dias do mês atual.</div>
          </div>
        ) : !unidadeAtiva ? (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#444' }}>Selecione uma unidade para ver os horários.</div>
        ) : loadingHorarios ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#555' }}>Carregando horários...</div>
        ) : horariosFiltrados.length === 0 ? (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#666', lineHeight: 1.7 }}>
            {tipoDia === 'fds' ? (<><div style={{ fontSize: 32, marginBottom: 8 }}>📅</div><div style={{ fontSize: 14, color: '#888' }}>Não há coaches escalados neste dia ainda.</div><div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>A escala de fim de semana é definida pela equipe.</div></>)
              : tipoDia === 'feriado' ? (<><div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div><div style={{ fontSize: 14, color: '#888' }}>Feriado sem coaches escalados.</div></>)
              : semanaOffset === 0 && diaSel === 0 ? 'Não há mais horários disponíveis para hoje.' : 'Nenhum horário disponível neste dia.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {horariosFiltrados.map((h, i) => {
              const lotado = h.livres <= 0
              const clienteNaFila = naFila(h.hora)
              const jaAgendado = agendamentosNoDia.some(a => (a.horario || '').slice(0, 5) === h.hora && ['agendado', 'confirmado'].includes(a.status))
              const semCredito = planosDisp.length === 0
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
                      return <HalterSVG key={vi} estado={estado} onClick={() => !lotado && !jaAgendado && tentarAgendar(h.hora, h.livres)} />
                    })}
                  </div>
                  <div style={{ flexShrink: 0, minWidth: 90, textAlign: 'right' }}>
                    {jaAgendado ? (<div style={{ fontSize: 11, color: CYAN, fontWeight: 600 }}>RESERVADO ✓</div>)
                      : clienteNaFila ? (<div style={{ fontSize: 11, color: AMARELO, fontWeight: 600 }}>NA FILA ⏳</div>)
                      : (<>
                        <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: lotado ? '#ff4444' : h.livres <= 2 ? AMARELO : ACCENT, fontWeight: 600, marginBottom: 4 }}>
                          {lotado ? 'LOTADO' : h.livres === 1 ? '1 VAGA' : `${h.livres} VAGAS`}
                        </div>
                        {h.bloqueadas > 0 && !lotado && <div style={{ fontSize: 9, color: '#ff4444', marginBottom: 4 }}>{h.bloqueadas} bloq.</div>}
                        {temFilaEsperaAqui && !lotado && <div style={{ fontSize: 9, color: AMARELO, marginBottom: 4 }}>⏳ há fila</div>}
                        {!lotado && <button onClick={() => tentarAgendar(h.hora, h.livres)} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Reservar</button>}
                        {lotado && <button onClick={() => tentarFila(h.hora)} style={{ background: 'transparent', color: AMARELO, border: `1px solid ${AMARELO}`, borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Entrar na fila</button>}
                      </>)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal sem plano ativo */}
      {modalSemPlano && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: `1.5px solid ${ACCENT}55`, borderRadius: 20, width: '100%', maxWidth: 400, padding: '1.5rem' }}>
            <div style={{ fontSize: 36, marginBottom: '1rem', textAlign: 'center' }}>⚡</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 8, textAlign: 'center' }}>PLANO NECESSÁRIO</div>
            <div style={{ fontSize: 14, color: '#aaa', lineHeight: 1.7, marginBottom: '1.5rem', textAlign: 'center' }}>
              Para agendar um treino você precisa de um plano ativo. Ative seu <strong style={{ color: '#fff' }}>Wellhub</strong>, <strong style={{ color: '#fff' }}>TotalPass</strong> ou compre sessões avulsas na recepção.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalSemPlano(false)} style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Fechar</button>
              <button onClick={() => router.push('/meus-planos')} style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Ative seu plano →</button>
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
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 440, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 4 }}>CONFIRMAR RESERVA</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 2, textTransform: 'capitalize' }}>{dataFormatada(modalSlot.data)} · {modalSlot.hora}</div>
            {unidadeAtiva && <div style={{ fontSize: 12, color: ACCENT, marginBottom: '1.5rem', fontWeight: 600 }}>📍 {unidadeAtiva.nome}</div>}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Como vai usar esta sessão?</div>
              {planosDisp.length === 0 ? (
                <div style={{ background: '#1a0a00', border: '1px solid #ff660033', borderRadius: 10, padding: '1rem', fontSize: 13, color: AMARELO, lineHeight: 1.6 }}>⚠️ Você não tem créditos disponíveis. Compre sessões avulsas na recepção.</div>
              ) : planosDisp.map(p => {
                const { label, icon } = parsePlanoKey(p)
                return (
                  <div key={p} onClick={() => setTipoCredito(p)}
                    style={{ border: `1.5px solid ${tipoCredito === p ? ACCENT : '#333'}`, background: tipoCredito === p ? `${ACCENT}12` : 'transparent', borderRadius: 10, padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8, transition: 'all .15s' }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: tipoCredito === p ? '#fff' : '#888' }}>{label}</div>
                      {saldoExibir[p] && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{saldoExibir[p].disponivel} sessões restantes {dataSelEhProximoMes ? 'no próximo mês' : 'este mês'}</div>}
                    </div>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${tipoCredito === p ? ACCENT : '#444'}`, background: tipoCredito === p ? ACCENT : 'transparent', flexShrink: 0 }} />
                  </div>
                )
              })}
            </div>
            <div style={{ background: temFila ? '#1a1000' : '#0a0a0a', border: `1px solid ${temFila ? AMARELO + '44' : '#1a1a1a'}`, borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: 12, lineHeight: 1.7 }}>
              {temFila ? (<><div style={{ color: AMARELO, fontWeight: 600, marginBottom: 4 }}>⏳ Há fila de espera para este horário</div><div style={{ color: '#888' }}>Cancelamento gratuito <strong style={{ color: '#fff' }}>até 3h antes</strong> — desde que haja outra pessoa na fila.<br />Abaixo de 3h antes: <strong style={{ color: '#ff4444' }}>cancelamento bloqueado</strong>. Falta sem aviso gera bloqueio de conta.</div></>)
                : <div style={{ color: '#555' }}>⚠️ Cancelamento gratuito <strong style={{ color: '#888' }}>até 12h antes</strong>. Entre 12h e 3h: só com fila de espera. Falta sem aviso gera bloqueio de conta.</div>}
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
                <li>Se alguém cancelar a reserva, <strong style={{ color: '#fff' }}>você será automaticamente reservado na aula</strong> — até 3h antes do treino.</li>
                <li>Após confirmado, você pode cancelar <strong style={{ color: '#fff' }}>até 3h antes</strong> — mas só se houver outra pessoa na fila.</li>
                <li>Se não houver mais fila, <strong style={{ color: '#fff' }}>cancelamento bloqueado</strong> e falta sem aviso gera multa.</li>
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
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Como quer ser avisado quando a vaga abrir?</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {notifOpcoes.map(op => (
                  <div key={op.key} onClick={() => setNotifFila(op.key as any)}
                    style={{ flex: 1, border: `1.5px solid ${notifFila === op.key ? AMARELO : '#333'}`, background: notifFila === op.key ? `${AMARELO}12` : 'transparent', borderRadius: 10, padding: '0.6rem 0.5rem', cursor: 'pointer', textAlign: 'center', transition: 'all .15s' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{op.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: notifFila === op.key ? '#fff' : '#666' }}>{op.label}</div>
                  </div>
                ))}
              </div>
              {notifFila === 'whatsapp' && cliente?.telefone && <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>📱 Aviso para ({cliente.telefone.slice(0, 2)}) {cliente.telefone.slice(2, 7)}-{cliente.telefone.slice(7)}</div>}
              {notifFila === 'email' && cliente?.email && <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>📧 Aviso para {cliente.email}</div>}
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
              <input type="checkbox" checked={filaAceite} onChange={e => setFilaAceite(e.target.checked)} style={{ marginTop: 2, accentColor: AMARELO, width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>Entendi as regras. Se uma vaga abrir, aceito o agendamento automático e as regras de cancelamento e multa.</span>
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
    </div>
  )
}
