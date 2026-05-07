'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle, XCircle, Search, Users, Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

const HORARIOS = [
  '05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00',
  '12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00',
  '19:30','20:00'
]

function addDias(dataStr: string, dias: number) {
  const d = new Date(dataStr + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().split('T')[0]
}

export default function RecepcaoAgendaPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [data, setData] = useState(() => new Date().toISOString().split('T')[0])
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [coaches, setCoaches] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [alocandoId, setAlocandoId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [abaAtiva, setAbaAtiva] = useState<'agendamentos' | 'grade'>('agendamentos')

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

  useEffect(() => {
    if (perfil) loadData()
  }, [data, perfil])

  async function loadData(manter_scroll = false) {
    if (manter_scroll) scrollRef.current = window.scrollY
    const diaSem = new Date(data + 'T12:00:00').getDay()

    const [{ data: ags }, { data: coachs }] = await Promise.all([
      supabase.from('agendamentos').select('*, clientes(nome, cpf, telefone)').eq('data', data).order('horario'),
      supabase.from('coach_horarios').select('*, coaches(id, nome)').eq('dia_semana', diaSem).eq('ativo', true),
    ])

    setAgendamentos(ags || [])
    setCoaches(coachs || [])
    setLoadingData(false)

    if (manter_scroll) setTimeout(() => window.scrollTo({ top: scrollRef.current }), 50)
  }

  function norm(hora: string) { return (hora || '').slice(0, 5) }
  function coachesPorHorario(horario: string) { return coaches.filter(c => norm(c.hora) === horario) }
  function agendamentosPorHorario(horario: string) { return agendamentos.filter(a => norm(a.horario) === horario) }
  function vagasDisponiveis(horario: string) {
    const total = coachesPorHorario(horario).length
    const ocupadas = agendamentosPorHorario(horario).filter(a => a.status !== 'cancelado').length
    return Math.max(0, total - ocupadas)
  }

  async function alocarCoach(agendamentoId: string, coachId: string) {
    setAlocandoId(agendamentoId)
    await supabase.from('agendamentos').update({
      coach_id: coachId,
      alocado_em: new Date().toISOString(),
      alocado_por: perfil?.id,
      status: 'confirmado'
    }).eq('id', agendamentoId)
    await loadData(true)
    setAlocandoId(null)
  }

  async function marcarPresenca(agendamentoId: string) {
    await supabase.from('agendamentos').update({ status: 'realizado' }).eq('id', agendamentoId)
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

  const agendamentosFiltrados = busca
    ? agendamentos.filter(a =>
        a.clientes?.nome?.toLowerCase().includes(busca.toLowerCase()) ||
        a.clientes?.cpf?.includes(busca)
      )
    : null

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-gray-900 capitalize">{diaSemana}</h1>
        <div className="flex gap-4 mt-1 text-sm text-gray-500">
          <span>📅 {agendamentosAtivos.length} agendamentos</span>
          <span>✅ {agendamentos.filter(a => a.status === 'realizado').length} realizados</span>
          <span>❌ {agendamentos.filter(a => a.status === 'falta').length} faltas</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5">

        {/* Abas */}
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
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ABA CLIENTES */}
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
                      const coachesHorario = coachesPorHorario(horario)
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

                          {ag.status !== 'realizado' && ag.status !== 'falta' && (
                            <div className="mt-3 flex flex-wrap gap-2">
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
                                </select>
                              )}
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
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ABA GRADE */}
            {abaAtiva === 'grade' && (
              <div>
                {/* Navegação de data: setas + ícone calendário */}
                <div className="card mb-4 flex items-center gap-3">
                  <button
                    onClick={() => { setData(addDias(data, -1)); setLoadingData(true) }}
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-all flex-shrink-0">
                    <ChevronLeft size={16} />
                  </button>

                  <div className="flex-1 text-center">
                    <div className="text-sm font-semibold text-gray-900 capitalize">
                      {new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                    {data !== hoje && (
                      <button onClick={() => { setData(hoje); setLoadingData(true) }}
                        className="text-xs text-primary-600 hover:underline mt-0.5">
                        Voltar para hoje
                      </button>
                    )}
                  </div>

                  {/* Input de data escondido acionado pelo ícone */}
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
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              vagas === 0 ? 'bg-red-100 text-red-700' :
                              vagas <= 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {vagas === 0 ? 'Lotado' : `${vagas} vaga${vagas !== 1 ? 's' : ''}`}
                            </span>
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
    </div>
  )
}
