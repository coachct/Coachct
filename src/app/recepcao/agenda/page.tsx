'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle, XCircle, Search, Users, Calendar, ChevronLeft, ChevronRight, Lock, Unlock, X, AlertCircle, Tv } from 'lucide-react'
import UnidadeSelector from '@/components/UnidadeSelector'

const HORARIOS = [
  '05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00',
  '12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00',
  '19:30','20:00'
]

// 🔧 Crédito legível a partir da chave (ex.: totalpass_just_ct → 🔵 TotalPass TP6 — Just CT)
function parsePlanoKey(key: string): { label: string; icon: string } {
  const lower = (key || '').toLowerCase()
  let tipo = ''
  let icon = '🏋️'
  let slugUnidade = ''
  if (lower.startsWith('coach_ct_pro')) { tipo = 'Coach CT Pro'; icon = '🏆'; slugUnidade = key.substring('coach_ct_pro_'.length) }
  else if (lower.startsWith('wellhub')) { tipo = 'Wellhub Diamond'; icon = '💜'; slugUnidade = key.split('_').slice(1).join('_') }
  else if (lower.startsWith('totalpass')) { tipo = 'TotalPass TP6'; icon = '🔵'; slugUnidade = key.split('_').slice(1).join('_') }
  else if (lower.startsWith('avulso') || lower.startsWith('credito')) { tipo = 'Crédito Avulso'; icon = '🎟️'; slugUnidade = key.split('_').slice(1).join('_') }
  else { tipo = key }
  const nomeUnidade: Record<string, string> = { just_ct: 'Just CT', just_club_vila_olimpia: 'Vila Olímpia', just_club_pinheiros: 'Pinheiros' }
  return { label: `${tipo} — ${nomeUnidade[slugUnidade] || slugUnidade.replace(/_/g, ' ')}`, icon }
}

function addDias(dataStr: string, dias: number) {
  const d = new Date(dataStr + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

export default function RecepcaoAgendaPage() {
  const { perfil, loading } = useAuth()
  const { unidadeAtiva, loading: loadingUnidade } = useUnidade()
  const router = useRouter()
  const supabase = createClient()

  const [data, setData] = useState(() => new Date().toISOString().split('T')[0])
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [coaches, setCoaches] = useState<any[]>([])
  const [coachesFds, setCoachesFds] = useState<any[]>([])
  const [usaEscalaFds, setUsaEscalaFds] = useState(false)
  const [bloqueios, setBloqueios] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [alocandoId, setAlocandoId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [abaAtiva, setAbaAtiva] = useState<'agendamentos' | 'grade' | 'recepcao'>('agendamentos')
  // 🔧 Relógio interno da aba Próximos Treinos: dispara a regra de "sumir 15 min após o horário"
  const [agora, setAgora] = useState<Date>(() => new Date())

  const [modalBloqueio, setModalBloqueio] = useState<{ horario: string; vagasLivres: number; bloqueiosAtivos: any[] } | null>(null)
  const [qtdBloquear, setQtdBloquear] = useState(1)
  const [motivoBloqueio, setMotivoBloqueio] = useState('')
  const [salvandoBloqueio, setSalvandoBloqueio] = useState(false)
  const [erroBloqueio, setErroBloqueio] = useState('')

  const [modalDesbloquear, setModalDesbloquear] = useState<any>(null)
  const [qtdLiberar, setQtdLiberar] = useState(1)
  const [desbloqueando, setDesbloqueando] = useState(false)

  const scrollRef = useRef<number>(0)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const hoje = new Date().toISOString().split('T')[0]

  const diaSemana = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  useEffect(() => {
    if (!loading && perfil?.role !== ('recepcao' as any) && perfil?.role !== 'admin') {
      router.push('/')
    }
  }, [perfil, loading])

  // Recepção de unidade club não usa a agenda do CT — manda pro calendário do club
  useEffect(() => {
    if (perfil?.role !== ('recepcao' as any)) return
    if (!unidadeAtiva?.id) return
    let cancelado = false
    async function checarTipoUnidade() {
      let tipo = (unidadeAtiva as any)?.tipo
      if (!tipo) {
        const { data: u } = await supabase
          .from('unidades').select('tipo').eq('id', unidadeAtiva!.id).maybeSingle()
        tipo = u?.tipo
      }
      if (!cancelado && tipo === 'club') router.replace('/recepcao/club')
    }
    checarTipoUnidade()
    return () => { cancelado = true }
  }, [perfil?.role, unidadeAtiva?.id])

  useEffect(() => {
    if (perfil && unidadeAtiva) loadData()
  }, [data, perfil, unidadeAtiva?.id])

  // 🔧 Aba Próximos Treinos: a cada 1 min, avança o relógio e recarrega (mantém scroll).
  useEffect(() => {
    if (abaAtiva !== 'recepcao') return
    setAgora(new Date())
    const id = setInterval(() => {
      setAgora(new Date())
      if (data === hoje && perfil && unidadeAtiva) loadData(true)
    }, 60000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, data, perfil, unidadeAtiva?.id])

  async function loadData(manter_scroll = false) {
    if (!unidadeAtiva) return
    if (manter_scroll) scrollRef.current = window.scrollY
    const diaSem = new Date(data + 'T12:00:00').getDay()
    const ehFds = diaSem === 0 || diaSem === 6

    const [{ data: ags }, { data: coachs }, { data: bloqs }, { data: feriado }] = await Promise.all([
      supabase.from('agendamentos')
        .select('*, clientes(nome, cpf, telefone)')
        .eq('data', data)
        .eq('unidade_id', unidadeAtiva.id)
        .order('horario'),
      supabase.from('coach_horarios')
        .select('*, coaches(id, nome)')
        .eq('dia_semana', diaSem)
        .eq('unidade_id', unidadeAtiva.id)
        .eq('ativo', true),
      supabase.from('vagas_bloqueadas')
        .select('*, perfis:bloqueado_por(nome)')
        .eq('data', data)
        .eq('unidade_id', unidadeAtiva.id)
        .eq('ativo', true),
      supabase.from('feriados')
        .select('id')
        .eq('unidade_id', unidadeAtiva.id)
        .eq('data', data)
        .eq('ativo', true)
        .maybeSingle(),
    ])

    // Fim de semana ou feriado: no CT a escala não vem de coach_horarios, e sim de escala_fds
    // (um coach escalado cobre o dia inteiro). Carrega esses coaches para o seletor.
    const escalaFds = ehFds || !!feriado
    setUsaEscalaFds(escalaFds)
    if (escalaFds) {
      // FDS/feriado: a escala vem do escala_fds. ATENÇÃO: escala_fds.coach_id guarda o
      // user_id do coach, não o coaches.id — por isso a busca em coaches é por user_id.
      const { data: esc } = await supabase.from('escala_fds')
        .select('coach_id')
        .eq('unidade_id', unidadeAtiva.id)
        .eq('data', data)
      const userIds = Array.from(new Set((esc || []).map((e: any) => e.coach_id).filter(Boolean)))
      let coachesEscala: any[] = []
      if (userIds.length > 0) {
        const { data: cs } = await supabase.from('coaches')
          .select('id, nome')
          .in('user_id', userIds)
        coachesEscala = (cs || []).map((c: any) => ({ coaches: { id: c.id, nome: c.nome } }))
      }
      setCoachesFds(coachesEscala)
    } else {
      setCoachesFds([])
    }

    setAgendamentos(ags || [])
    setCoaches(coachs || [])
    setBloqueios(bloqs || [])
    setLoadingData(false)

    if (manter_scroll) setTimeout(() => window.scrollTo({ top: scrollRef.current }), 50)
  }

  function norm(hora: string) { return (hora || '').slice(0, 5) }
  function coachesPorHorario(horario: string) { return coaches.filter(c => norm(c.hora) === horario) }
  function agendamentosPorHorario(horario: string) { return agendamentos.filter(a => norm(a.horario) === horario) }
  function bloqueiosPorHorario(horario: string) { return bloqueios.filter(b => norm(b.horario) === horario) }

  function bloqueadasNoHorario(horario: string) {
    return bloqueiosPorHorario(horario).reduce((acc, b) => acc + (b.quantidade || 0), 0)
  }

  function vagasDisponiveis(horario: string) {
    const total = coachesPorHorario(horario).length
    const ocupadas = agendamentosPorHorario(horario).filter(a => a.status !== 'cancelado').length
    const bloqueadas = bloqueadasNoHorario(horario)
    return Math.max(0, total - ocupadas - bloqueadas)
  }

  async function criarNotificacaoCoach(agendamentoId: string, coachId: string) {
    if (!unidadeAtiva) return
    const { data: ag } = await supabase
      .from('agendamentos')
      .select('*, clientes(id, nome)')
      .eq('id', agendamentoId)
      .maybeSingle()

    if (!ag || !ag.clientes) return

    const horario = (ag.horario || '').slice(0, 5)
    const mensagem = `${ag.clientes.nome} chegou e te aguarda na recepção para o treino das ${horario}.`

    await supabase.from('notificacoes_coach').insert({
      coach_id: coachId,
      cliente_id: ag.clientes.id,
      agendamento_id: agendamentoId,
      unidade_id: unidadeAtiva.id,
      tipo: 'cliente_chegou',
      mensagem,
    })
  }

  async function alocarCoach(agendamentoId: string, coachId: string) {
    setAlocandoId(agendamentoId)

    const { data: agAtual } = await supabase
      .from('agendamentos')
      .select('status')
      .eq('id', agendamentoId)
      .maybeSingle()

    if (!coachId) {
      // 🔧 Desalocar — deixar sem coach (mantém status, não notifica coach)
      await supabase.from('agendamentos').update({
        coach_id: null,
        alocado_em: null,
        alocado_por: null
      }).eq('id', agendamentoId)
    } else {
      await supabase.from('agendamentos').update({
        coach_id: coachId,
        alocado_em: new Date().toISOString(),
        alocado_por: perfil?.id,
        status: 'confirmado'
      }).eq('id', agendamentoId)

      if (agAtual?.status === 'realizado') {
        await criarNotificacaoCoach(agendamentoId, coachId)
      }
    }

    await loadData(true)
    setAlocandoId(null)
  }

  async function marcarPresenca(agendamentoId: string) {
    await supabase.from('agendamentos').update({ status: 'realizado' }).eq('id', agendamentoId)

    const { data: ag } = await supabase
      .from('agendamentos')
      .select('coach_id')
      .eq('id', agendamentoId)
      .maybeSingle()

    if (ag?.coach_id) {
      await criarNotificacaoCoach(agendamentoId, ag.coach_id)
    }

    await loadData(true)
  }

  async function marcarFalta(agendamentoId: string) {
    if (!confirm('Marcar como falta? O cliente poderá ser bloqueado.')) return
    await supabase.from('agendamentos').update({ status: 'falta' }).eq('id', agendamentoId)
    const ag = agendamentos.find(a => a.id === agendamentoId)
    if (ag?.cliente_id) {
      await supabase.from('clientes').update({
        bloqueado: true,
        motivo_bloqueio: 'No-show — falta sem cancelamento'
      }).eq('id', ag.cliente_id)
    }
    await loadData(true)
  }

  async function cancelarAgendamento(agendamentoId: string) {
    if (!confirm('Cancelar este agendamento?')) return
    await supabase.from('agendamentos').update({
      status: 'cancelado',
      cancelado_em: new Date().toISOString(),
      motivo_cancelamento: 'Cancelado pela recepção'
    }).eq('id', agendamentoId)
    await loadData(true)
  }

  function abrirModalBloqueio(horario: string) {
    const vagasLivres = vagasDisponiveis(horario)
    const bloqueiosAtivos = bloqueiosPorHorario(horario)
    setModalBloqueio({ horario, vagasLivres, bloqueiosAtivos })
    setQtdBloquear(1)
    setMotivoBloqueio('')
    setErroBloqueio('')
  }

  async function salvarBloqueio() {
    if (!modalBloqueio || !unidadeAtiva) return
    if (!motivoBloqueio.trim()) {
      setErroBloqueio('Informe o motivo do bloqueio.')
      return
    }
    if (qtdBloquear < 1 || qtdBloquear > modalBloqueio.vagasLivres) {
      setErroBloqueio(`Quantidade inválida. Há ${modalBloqueio.vagasLivres} vaga(s) disponível(eis).`)
      return
    }

    setSalvandoBloqueio(true)
    setErroBloqueio('')

    const { error } = await supabase.from('vagas_bloqueadas').insert({
      data,
      horario: modalBloqueio.horario + ':00',
      quantidade: qtdBloquear,
      motivo: motivoBloqueio.trim(),
      bloqueado_por: perfil?.id,
      bloqueado_por_role: perfil?.role,
      unidade_id: unidadeAtiva.id,
      ativo: true,
    })

    if (error) {
      setErroBloqueio('Erro ao bloquear. Tente novamente.')
      setSalvandoBloqueio(false)
      return
    }

    setModalBloqueio(null)
    setSalvandoBloqueio(false)
    await loadData(true)
  }

  function abrirModalDesbloquear(bloqueio: any) {
    setModalDesbloquear(bloqueio)
    setQtdLiberar(1)
  }

  async function confirmarDesbloqueio() {
    if (!modalDesbloquear) return
    if (qtdLiberar < 1 || qtdLiberar > modalDesbloquear.quantidade) return

    setDesbloqueando(true)

    const { error } = await supabase.rpc('desbloquear_vagas_parcial', {
      p_bloqueio_id: modalDesbloquear.id,
      p_quantidade_liberar: qtdLiberar,
      p_desbloqueado_por: perfil?.id,
    })

    setDesbloqueando(false)

    if (error) {
      alert('Erro ao desbloquear: ' + error.message)
      return
    }

    setModalDesbloquear(null)
    await loadData(true)

    if (modalBloqueio) {
      const novosBloqueios = bloqueiosPorHorario(modalBloqueio.horario)
      if (novosBloqueios.length === 0) {
        setModalBloqueio(null)
      } else {
        setModalBloqueio({
          ...modalBloqueio,
          bloqueiosAtivos: novosBloqueios,
          vagasLivres: vagasDisponiveis(modalBloqueio.horario),
        })
      }
    }
  }

  const statusConfig: Record<string, { label: string; color: string }> = {
    agendado:   { label: 'Agendado',   color: 'bg-blue-100 text-blue-700' },
    confirmado: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
    realizado:  { label: 'Realizado',  color: 'bg-gray-100 text-gray-600' },
    cancelado:  { label: 'Cancelado',  color: 'bg-red-100 text-red-600' },
    falta:      { label: 'Falta',      color: 'bg-orange-100 text-orange-700' },
  }

  const horariosAtivos = HORARIOS.filter(h =>
    coachesPorHorario(h).length > 0 || agendamentosPorHorario(h).length > 0
  )

  const agendamentosAtivos = agendamentos
    .filter(a => a.status !== 'cancelado')
    .sort((a, b) => a.horario.localeCompare(b.horario))

  // 🔧 ---- Aba Próximos Treinos (visão rolante) ----
  // Um horário fica visível até 15 min depois de começar (05:30 some às 05:45).
  const JANELA_MIN = 15
  function horaParaMin(h: string) { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm }
  const ehHoje = data === hoje
  const agoraMin = agora.getHours() * 60 + agora.getMinutes()
  const horariosComAgendamento = Array.from(new Set(agendamentosAtivos.map(a => norm(a.horario)))).sort()
  const horariosRecepcao = horariosComAgendamento.filter(h => !ehHoje || agoraMin < horaParaMin(h) + JANELA_MIN)
  const pendentesRecepcao = ehHoje
    ? agendamentosAtivos.filter(a =>
        agoraMin >= horaParaMin(norm(a.horario)) + JANELA_MIN &&
        a.status !== 'realizado' && a.status !== 'falta'
      )
    : []

  const agendamentosFiltrados = busca
    ? agendamentos.filter(a =>
        a.clientes?.nome?.toLowerCase().includes(busca.toLowerCase()) ||
        a.clientes?.cpf?.includes(busca)
      )
    : null

  if (loading || loadingUnidade) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!unidadeAtiva) return (
    <div className="flex items-center justify-center h-screen p-6 text-center">
      <div>
        <AlertCircle size={32} className="text-orange-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Sem acesso a unidades</h2>
        <p className="text-sm text-gray-500 mt-2">
          Você não tem permissão para acessar nenhuma unidade.<br />
          Solicite ao administrador para configurar suas permissões.
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-lg font-semibold text-gray-900 capitalize">{diaSemana}</h1>
          <UnidadeSelector />
        </div>
        <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
          <span>📅 {agendamentosAtivos.length} agendamentos</span>
          <span>✅ {agendamentos.filter(a => a.status === 'realizado').length} realizados</span>
          <span>❌ {agendamentos.filter(a => a.status === 'falta').length} faltas</span>
          {bloqueios.length > 0 && (
            <span>🔒 {bloqueios.reduce((acc, b) => acc + b.quantidade, 0)} bloqueada(s)</span>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5">

        {/* Seletor de data — controla tanto Clientes do dia quanto Grade do dia */}
        <div className="card mb-4 flex items-center gap-3">
          <button
            onClick={() => { setData(addDias(data, -1)); setLoadingData(true) }}
            className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-all flex-shrink-0">
            <ChevronLeft size={16} />
          </button>

          <div className="flex-1 text-center">
            <div className="text-sm font-semibold text-gray-900 capitalize">
              {diaSemana}
            </div>
            {data !== hoje && (
              <button onClick={() => { setData(hoje); setLoadingData(true) }}
                className="text-xs text-primary-600 hover:underline mt-0.5">
                Voltar para hoje
              </button>
            )}
          </div>

          <div className="relative flex-shrink-0">
            <button
              onClick={() => dateInputRef.current?.showPicker()}
              className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-all">
              <Calendar size={15} />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={data}
              onChange={e => { setData(e.target.value); setLoadingData(true) }}
              className="absolute opacity-0 w-0 h-0 top-0 left-0 pointer-events-none"
            />
          </div>

          <button
            onClick={() => { setData(addDias(data, 1)); setLoadingData(true) }}
            className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-all flex-shrink-0">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex gap-2 mb-5">
          <button onClick={() => setAbaAtiva('agendamentos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              abaAtiva === 'agendamentos'
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
            }`}>
            <Users size={14} />
            Clientes do dia
            {agendamentosAtivos.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                abaAtiva === 'agendamentos' ? 'bg-white text-primary-600' : 'bg-primary-100 text-primary-700'
              }`}>
                {agendamentosAtivos.length}
              </span>
            )}
          </button>
          <button onClick={() => setAbaAtiva('grade')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              abaAtiva === 'grade'
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
            }`}>
            <Calendar size={14} />
            Grade do dia
          </button>
          <button onClick={() => setAbaAtiva('recepcao')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              abaAtiva === 'recepcao'
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'
            }`}>
            <Tv size={14} />
            Próximos Treinos
            {ehHoje && pendentesRecepcao.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                abaAtiva === 'recepcao' ? 'bg-white text-orange-600' : 'bg-orange-100 text-orange-700'
              }`}>
                {pendentesRecepcao.length}
              </span>
            )}
          </button>
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {abaAtiva === 'agendamentos' && (
              <div>
                <div className="card mb-4">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-3 text-gray-400" />
                    <input className="input pl-9" placeholder="Buscar por nome ou CPF..."
                      value={busca} onChange={e => setBusca(e.target.value)} />
                  </div>
                  {agendamentosFiltrados && agendamentosFiltrados.length === 0 && (
                    <div className="text-sm text-gray-400 text-center mt-3">Nenhum cliente encontrado.</div>
                  )}
                </div>

                {agendamentosAtivos.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">
                    Nenhum agendamento para este dia.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(agendamentosFiltrados || agendamentosAtivos).map(ag => {
                      const horario = norm(ag.horario)
                      const coachesHorario = usaEscalaFds ? coachesFds : coachesPorHorario(horario)
                      const ags = agendamentosPorHorario(horario).filter(a => a.status !== 'cancelado')
                      const coachesLivres = coachesHorario.filter(
                        c => !ags.some(a => a.id !== ag.id && a.coach_id === c.coaches?.id)
                      )
                      const coachNome = coachesHorario.find(c => c.coaches?.id === ag.coach_id)?.coaches?.nome

                      return (
                        <div key={ag.id} className={`card border-l-4 ${
                          ag.status === 'realizado' ? 'border-l-gray-300' :
                          ag.status === 'falta' ? 'border-l-orange-400' :
                          ag.coach_id ? 'border-l-green-400' : 'border-l-blue-400'
                        }`}>
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-800 text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {ag.clientes?.nome?.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-900">{ag.clientes?.nome}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>
                                  {statusConfig[ag.status]?.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                <span className="font-mono font-medium text-gray-700">{horario}</span>
                                <span>{ag.tipo_credito}</span>
                                {ag.clientes?.telefone && <span>{ag.clientes.telefone}</span>}
                              </div>
                              {coachNome && (
                                <div className="text-xs text-green-700 mt-1 font-medium">Coach: {coachNome}</div>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {/* Seletor de coach — sempre disponível, inclusive após Presença/Falta */}
                            {!ag.coach_id && coachesLivres.length > 0 && (
                              <select className="input input-sm text-xs flex-1" defaultValue=""
                                onChange={e => { if (e.target.value) alocarCoach(ag.id, e.target.value) }}
                                disabled={alocandoId === ag.id}>
                                <option value="">Alocar coach...</option>
                                {coachesLivres.map(c => (
                                  <option key={c.coaches?.id} value={c.coaches?.id}>{c.coaches?.nome}</option>
                                ))}
                              </select>
                            )}
                            {ag.coach_id && (
                              <select className="input input-sm text-xs flex-1" value={ag.coach_id}
                                onChange={e => alocarCoach(ag.id, e.target.value)}
                                disabled={alocandoId === ag.id}>
                                {coachesHorario.map(c => (
                                  <option key={c.coaches?.id} value={c.coaches?.id}>{c.coaches?.nome}</option>
                                ))}
                                <option value="">— Sem coach —</option>
                              </select>
                            )}

                            {/* Presença / Falta / Cancelar — só enquanto não realizado/falta */}
                            {ag.status !== 'realizado' && ag.status !== 'falta' && (
                              <>
                                <button onClick={() => marcarPresenca(ag.id)}
                                  className="btn btn-sm gap-1 bg-green-500 text-white hover:bg-green-600">
                                  <CheckCircle size={12} /> Presença
                                </button>
                                <button onClick={() => marcarFalta(ag.id)}
                                  className="btn btn-sm gap-1 text-orange-600 hover:bg-orange-50">
                                  <XCircle size={12} /> Falta
                                </button>
                                <button onClick={() => cancelarAgendamento(ag.id)}
                                  className="btn btn-sm text-red-400 hover:bg-red-50">
                                  Cancelar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {abaAtiva === 'grade' && (
              <div>
                {horariosAtivos.length === 0 ? (
                  <div className="card text-center py-12 text-gray-400 text-sm">
                    Nenhum coach disponível neste dia.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {horariosAtivos.map(horario => {
                      const coachesHorario = coachesPorHorario(horario)
                      const vagas = vagasDisponiveis(horario)
                      const ags = agendamentosPorHorario(horario).filter(a => a.status !== 'cancelado')
                      const bloqueiosHorario = bloqueiosPorHorario(horario)
                      const totalBloqueadas = bloqueadasNoHorario(horario)

                      return (
                        <div key={horario} className="card">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-primary-600" />
                              <span className="font-bold text-gray-900">{horario}</span>
                              <span className="text-xs text-gray-400">
                                {coachesHorario.length} coach{coachesHorario.length !== 1 ? 'es' : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                vagas === 0 ? 'bg-red-100 text-red-700' :
                                vagas <= 2 ? 'bg-orange-100 text-orange-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {vagas === 0 ? 'Lotado' : `${vagas} vaga${vagas !== 1 ? 's' : ''}`}
                              </span>
                              {totalBloqueadas > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-600 border border-red-200">
                                  🔒 {totalBloqueadas}
                                </span>
                              )}
                              <button
                                onClick={() => abrirModalBloqueio(horario)}
                                className="text-xs px-2 py-0.5 rounded-full border border-gray-200 text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-all flex items-center gap-1">
                                <Lock size={10} />
                                {totalBloqueadas > 0 ? 'Gerenciar' : 'Bloquear'}
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {coachesHorario.map(c => {
                              const alocado = ags.some(a => a.coach_id === c.coaches?.id)
                              return (
                                <span key={c.id} className={`text-xs px-2.5 py-1 rounded-full ${
                                  alocado ? 'bg-primary-100 text-primary-800 line-through opacity-60' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {c.coaches?.nome?.split(' ')[0]}
                                </span>
                              )
                            })}
                          </div>
                          {ags.length > 0 && (
                            <div className="mt-2 text-xs text-gray-500">
                              {ags.length} cliente{ags.length !== 1 ? 's' : ''} agendado{ags.length !== 1 ? 's' : ''}
                            </div>
                          )}
                          {bloqueiosHorario.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                              {bloqueiosHorario.map(b => (
                                <div key={b.id} className="flex items-start gap-2 text-xs">
                                  <Lock size={11} className="text-red-500 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <span className="font-medium text-red-700">{b.quantidade} vaga(s)</span>
                                    <span className="text-gray-500"> — {b.motivo || 'Sem motivo'}</span>
                                    {b.perfis?.nome && (
                                      <span className="text-gray-400"> · por {b.perfis.nome.split(' ')[0]}</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => abrirModalDesbloquear(b)}
                                    className="text-green-600 hover:bg-green-50 rounded px-1.5 py-0.5 flex items-center gap-1">
                                    <Unlock size={10} /> Liberar
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {abaAtiva === 'recepcao' && (
              <div>
                {/* Faixa de aviso: treinos já vencidos ainda sem presença/falta */}
                {ehHoje && pendentesRecepcao.length > 0 && (
                  <div className="card mb-5 border-2 border-orange-300 bg-orange-50">
                    <div className="flex items-center gap-2 font-semibold text-orange-800">
                      <AlertCircle size={18} className="flex-shrink-0" />
                      {pendentesRecepcao.length} treino{pendentesRecepcao.length !== 1 ? 's' : ''} sem presença/falta — ajustar
                    </div>
                    <div className="mt-3 space-y-2">
                      {pendentesRecepcao.map(ag => (
                        <div key={ag.id} className="flex items-center gap-3 rounded-xl border border-orange-100 bg-white px-3 py-2">
                          <span className="font-mono font-bold text-gray-700">{norm(ag.horario)}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{ag.clientes?.nome}</span>
                          <button onClick={() => marcarPresenca(ag.id)} className="btn btn-sm gap-1 bg-green-500 text-white hover:bg-green-600">
                            <CheckCircle size={12} /> Presença
                          </button>
                          <button onClick={() => marcarFalta(ag.id)} className="btn btn-sm gap-1 text-orange-600 hover:bg-orange-50">
                            <XCircle size={12} /> Falta
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {horariosRecepcao.length === 0 ? (
                  <div className="card py-12 text-center text-sm text-gray-400">
                    {ehHoje ? 'Nenhum próximo treino no momento. 🎉' : 'Nenhum agendamento para este dia.'}
                  </div>
                ) : (
                  <div className="space-y-7">
                    {horariosRecepcao.map(h => {
                      const cards = agendamentosPorHorario(h).filter(a => a.status !== 'cancelado')
                      if (cards.length === 0) return null
                      return (
                        <div key={h}>
                          <div className="mb-3 flex items-baseline gap-3">
                            <span className="font-mono text-3xl font-extrabold text-primary-700">{h}</span>
                            <span className="text-sm font-medium text-gray-400">{cards.length} aluno{cards.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="space-y-3">
                            {cards.map(ag => {
                              const { label: planoLabel, icon: planoIcon } = parsePlanoKey(ag.tipo_credito || '')
                              const feito = ag.status === 'realizado'
                              const faltou = ag.status === 'falta'
                              const coachesHorario = usaEscalaFds ? coachesFds : coachesPorHorario(h)
                              const agsH = agendamentosPorHorario(h).filter(a => a.status !== 'cancelado')
                              const coachesLivres = coachesHorario.filter(c => !agsH.some(a => a.id !== ag.id && a.coach_id === c.coaches?.id))
                              return (
                                <div key={ag.id} className={`flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm border-l-4 ${feito ? 'border-l-gray-300 opacity-70' : faltou ? 'border-l-orange-400' : ag.coach_id ? 'border-l-green-400' : 'border-l-primary-400'}`}>
                                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-800">
                                    {ag.clientes?.nome?.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-lg font-bold text-gray-900">{ag.clientes?.nome || '—'}</div>
                                    <div className="mt-0.5 text-sm text-gray-500">{planoIcon} {planoLabel}</div>
                                    <div className="mt-2">
                                      {!ag.coach_id && coachesLivres.length > 0 && (
                                        <select className="input input-sm text-xs max-w-[230px]" defaultValue=""
                                          onChange={e => { if (e.target.value) alocarCoach(ag.id, e.target.value) }}
                                          disabled={alocandoId === ag.id}>
                                          <option value="">Alocar coach...</option>
                                          {coachesLivres.map(c => <option key={c.coaches?.id} value={c.coaches?.id}>{c.coaches?.nome}</option>)}
                                        </select>
                                      )}
                                      {ag.coach_id && (
                                        <select className="input input-sm text-xs max-w-[230px]" value={ag.coach_id}
                                          onChange={e => alocarCoach(ag.id, e.target.value)} disabled={alocandoId === ag.id}>
                                          {coachesHorario.map(c => <option key={c.coaches?.id} value={c.coaches?.id}>{c.coaches?.nome}</option>)}
                                          <option value="">— Sem coach —</option>
                                        </select>
                                      )}
                                      {!ag.coach_id && coachesLivres.length === 0 && (
                                        <span className="text-xs text-gray-400">Nenhum coach livre neste horário</span>
                                      )}
                                    </div>
                                  </div>
                                  {feito || faltou ? (
                                    <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig[ag.status]?.color}`}>
                                      {statusConfig[ag.status]?.label}
                                    </span>
                                  ) : (
                                    <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row">
                                      <button onClick={() => marcarPresenca(ag.id)} className="btn btn-sm gap-1 bg-green-500 text-white hover:bg-green-600">
                                        <CheckCircle size={14} /> Presença
                                      </button>
                                      <button onClick={() => marcarFalta(ag.id)} className="btn btn-sm gap-1 text-orange-600 hover:bg-orange-50">
                                        <XCircle size={14} /> Falta
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {modalBloqueio && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2">
                  <Lock size={18} className="text-red-500" /> Bloquear vagas — {modalBloqueio.horario}
                </div>
                <div className="text-sm text-gray-400 mt-0.5 capitalize">
                  {new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
              </div>
              <button onClick={() => setModalBloqueio(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {modalBloqueio.bloqueiosAtivos.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Bloqueios ativos</div>
                <div className="space-y-2">
                  {modalBloqueio.bloqueiosAtivos.map(b => (
                    <div key={b.id} className="bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2">
                      <Lock size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 text-sm">
                        <div className="font-medium text-red-700">{b.quantidade} vaga(s)</div>
                        <div className="text-xs text-gray-600 mt-0.5">{b.motivo || 'Sem motivo registrado'}</div>
                        {b.perfis?.nome && (
                          <div className="text-xs text-gray-400 mt-0.5">por {b.perfis.nome}</div>
                        )}
                      </div>
                      <button
                        onClick={() => abrirModalDesbloquear(b)}
                        className="btn btn-sm gap-1 text-green-600 hover:bg-green-50">
                        <Unlock size={12} /> Liberar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {modalBloqueio.vagasLivres > 0 ? (
              <>
                <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Bloquear novas vagas</div>
                <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs text-gray-600 flex items-start gap-2">
                  <AlertCircle size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <span>Há {modalBloqueio.vagasLivres} vaga(s) livre(s) neste horário. Bloqueios impedem que clientes reservem essas vagas.</span>
                </div>

                <div className="mb-3">
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Quantidade</label>
                  <input type="number" min={1} max={modalBloqueio.vagasLivres}
                    value={qtdBloquear}
                    onChange={e => setQtdBloquear(parseInt(e.target.value) || 1)}
                    className="input w-24" />
                </div>

                <div className="mb-3">
                  <label className="text-xs text-gray-500 mb-1 block font-medium">
                    Motivo <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={motivoBloqueio}
                    onChange={e => setMotivoBloqueio(e.target.value)}
                    placeholder="Ex: equipamento em manutenção, evento, limpeza..."
                    rows={2}
                    className="input w-full resize-none"
                  />
                </div>

                {erroBloqueio && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-sm text-red-600">
                    {erroBloqueio}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setModalBloqueio(null)}
                    className="btn flex-1 text-gray-500 border border-gray-200">
                    Cancelar
                  </button>
                  <button onClick={salvarBloqueio} disabled={salvandoBloqueio}
                    className="btn flex-1 bg-red-500 text-white hover:bg-red-600 gap-1">
                    <Lock size={12} /> {salvandoBloqueio ? 'Bloqueando...' : 'Bloquear'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4 text-sm text-gray-400">
                Sem vagas livres para bloquear neste horário.
              </div>
            )}
          </div>
        </div>
      )}

      {modalDesbloquear && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2">
                  <Unlock size={18} className="text-green-600" /> Liberar vagas
                </div>
                <div className="text-sm text-gray-400 mt-0.5">
                  {norm(modalDesbloquear.horario)} · {modalDesbloquear.quantidade} vaga(s) bloqueada(s)
                </div>
              </div>
              <button onClick={() => setModalDesbloquear(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {modalDesbloquear.motivo && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-600">
                <span className="font-medium">Motivo do bloqueio:</span> {modalDesbloquear.motivo}
              </div>
            )}

            {modalDesbloquear.quantidade === 1 ? (
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 mb-4 text-sm text-green-700">
                Confirma a liberação desta vaga? Se houver clientes na fila, o próximo será confirmado automaticamente.
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3 text-xs text-blue-700 flex items-start gap-2">
                  <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                  <span>Você pode liberar parte ou todas as vagas. Para cada vaga liberada, se houver fila, o próximo cliente é confirmado automaticamente.</span>
                </div>

                <div className="mb-4">
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Quantas vagas liberar?</label>
                  <div className="flex items-center gap-3">
                    <input type="number" min={1} max={modalDesbloquear.quantidade}
                      value={qtdLiberar}
                      onChange={e => setQtdLiberar(Math.min(modalDesbloquear.quantidade, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="input w-20" />
                    <span className="text-sm text-gray-500">de {modalDesbloquear.quantidade}</span>
                    <button
                      onClick={() => setQtdLiberar(modalDesbloquear.quantidade)}
                      className="btn btn-sm text-primary-600 ml-auto">
                      Liberar todas
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2">
              <button onClick={() => setModalDesbloquear(null)}
                className="btn flex-1 text-gray-500 border border-gray-200">
                Cancelar
              </button>
              <button onClick={confirmarDesbloqueio} disabled={desbloqueando}
                className="btn flex-1 bg-green-500 text-white hover:bg-green-600 gap-1">
                <Unlock size={12} /> {desbloqueando ? 'Liberando...' : `Liberar ${qtdLiberar > 1 ? `${qtdLiberar} vagas` : '1 vaga'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
