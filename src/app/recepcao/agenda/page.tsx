'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Clock, CheckCircle, XCircle, Search } from 'lucide-react'

const HORARIOS = [
  '05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00',
  '12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00',
  '19:30','20:00'
]

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

  async function loadData() {
    setLoadingData(true)
    const diaSem = new Date(data + 'T12:00:00').getDay()

    const [{ data: ags }, { data: coachs }] = await Promise.all([
      supabase
        .from('agendamentos')
        .select('*, clientes(nome, cpf, telefone)')
        .eq('data', data)
        .order('horario'),
      supabase
        .from('coach_horarios')
        .select('*, coaches(id, nome)')
        .eq('dia_semana', diaSem)
        .eq('ativo', true),
    ])

    setAgendamentos(ags || [])
    setCoaches(coachs || [])
    setLoadingData(false)
  }

  // Normaliza para "HH:MM" independente do formato vindo do banco
  function norm(hora: string) {
    return (hora || '').slice(0, 5)
  }

  function coachesPorHorario(horario: string) {
    return coaches.filter(c => norm(c.hora) === horario)
  }

  function agendamentosPorHorario(horario: string) {
    return agendamentos.filter(a => norm(a.horario) === horario)
  }

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
    await loadData()
    setAlocandoId(null)
  }

  async function marcarPresenca(agendamentoId: string) {
    await supabase.from('agendamentos').update({ status: 'realizado' }).eq('id', agendamentoId)
    await loadData()
  }

  async function marcarFalta(agendamentoId: string) {
    if (!confirm('Marcar como falta? O cliente poderá ser bloqueado para novos agendamentos.')) return
    await supabase.from('agendamentos').update({ status: 'falta' }).eq('id', agendamentoId)
    const ag = agendamentos.find(a => a.id === agendamentoId)
    if (ag?.cliente_id) {
      await supabase.from('clientes').update({
        bloqueado: true,
        motivo_bloqueio: 'No-show — falta sem cancelamento'
      }).eq('id', ag.cliente_id)
    }
    await loadData()
  }

  async function cancelarAgendamento(agendamentoId: string) {
    if (!confirm('Cancelar este agendamento?')) return
    await supabase.from('agendamentos').update({
      status: 'cancelado',
      cancelado_em: new Date().toISOString(),
      motivo_cancelamento: 'Cancelado pela recepção'
    }).eq('id', agendamentoId)
    await loadData()
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

  const agendamentosFiltrados = busca
    ? agendamentos.filter(a =>
        a.clientes?.nome?.toLowerCase().includes(busca.toLowerCase()) ||
        a.clientes?.cpf?.includes(busca)
      )
    : null

  if (loading || loadingData) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="font-bold text-gray-900 text-sm">● COACH CT</div>
          <div className="text-xs text-gray-400">Recepção</div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            className="input text-sm"
            value={data}
            onChange={e => setData(e.target.value)}
          />
          <button
            onClick={() => { supabase.auth.signOut(); router.push('/login') }}
            className="btn btn-sm text-gray-500"
          >
            Sair
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5">

        {/* Data e resumo */}
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-gray-900 capitalize">{diaSemana}</h1>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span>📅 {agendamentos.filter(a => a.status !== 'cancelado').length} agendamentos</span>
            <span>✅ {agendamentos.filter(a => a.status === 'realizado').length} realizados</span>
            <span>❌ {agendamentos.filter(a => a.status === 'falta').length} faltas</span>
          </div>
        </div>

        {/* Busca rápida */}
        <div className="card mb-5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar cliente por nome ou CPF..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          {agendamentosFiltrados && agendamentosFiltrados.length > 0 && (
            <div className="mt-3 space-y-2">
              {agendamentosFiltrados.map(ag => (
                <div key={ag.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{ag.clientes?.nome}</div>
                    <div className="text-xs text-gray-400">
                      {norm(ag.horario)} · {ag.tipo_credito} ·
                      <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${statusConfig[ag.status]?.color}`}>
                        {statusConfig[ag.status]?.label}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {agendamentosFiltrados && agendamentosFiltrados.length === 0 && (
            <div className="text-sm text-gray-400 text-center mt-3">Nenhum cliente encontrado.</div>
          )}
        </div>

        {/* Horários do dia */}
        {horariosAtivos.length === 0 ? (
          <div className="card text-center py-12 text-gray-400 text-sm">
            Nenhum coach disponível neste dia.
          </div>
        ) : (
          <div className="space-y-4">
            {horariosAtivos.map(horario => {
              const ags = agendamentosPorHorario(horario).filter(a => a.status !== 'cancelado')
              const coachesHorario = coachesPorHorario(horario)
              const vagas = vagasDisponiveis(horario)

              return (
                <div key={horario} className="card">

                  {/* Cabeçalho do horário */}
                  <div className="flex items-center justify-between mb-3">
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

                  {/* Coaches disponíveis */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {coachesHorario.map(c => {
                      const alocado = ags.some(a => a.coach_id === c.coaches?.id)
                      return (
                        <span key={c.id} className={`text-xs px-2.5 py-1 rounded-full ${
                          alocado
                            ? 'bg-primary-100 text-primary-800 line-through opacity-60'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {c.coaches?.nome?.split(' ')[0]}
                        </span>
                      )
                    })}
                  </div>

                  {/* Agendamentos */}
                  {ags.length === 0 ? (
                    <div className="text-xs text-gray-400 italic">Nenhum agendamento neste horário.</div>
                  ) : (
                    <div className="space-y-2">
                      {ags.map(ag => {
                        const coachesLivres = coachesHorario.filter(
                          c => !ags.some(a => a.id !== ag.id && a.coach_id === c.coaches?.id)
                        )
                        return (
                          <div key={ag.id} className={`border rounded-xl p-3 ${
                            ag.status === 'realizado' ? 'bg-gray-50 border-gray-100' :
                            ag.status === 'falta' ? 'bg-orange-50 border-orange-200' :
                            ag.coach_id ? 'bg-green-50 border-green-200' :
                            'bg-blue-50 border-blue-200'
                          }`}>
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-800 text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {ag.clientes?.nome?.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-gray-900">{ag.clientes?.nome}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig[ag.status]?.color}`}>
                                    {statusConfig[ag.status]?.label}
                                  </span>
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                    {ag.tipo_credito}
                                  </span>
                                </div>
                                {ag.clientes?.telefone && (
                                  <div className="text-xs text-gray-400 mt-0.5">{ag.clientes.telefone}</div>
                                )}
                                {ag.coach_id && (
                                  <div className="text-xs text-green-700 mt-1 font-medium">
                                    Coach: {coachesHorario.find(c => c.coaches?.id === ag.coach_id)?.coaches?.nome || '—'}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Ações */}
                            {ag.status !== 'realizado' && ag.status !== 'falta' && ag.status !== 'cancelado' && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {!ag.coach_id && coachesLivres.length > 0 && (
                                  <select
                                    className="input input-sm text-xs flex-1"
                                    defaultValue=""
                                    onChange={e => { if (e.target.value) alocarCoach(ag.id, e.target.value) }}
                                    disabled={alocandoId === ag.id}
                                  >
                                    <option value="">Alocar coach...</option>
                                    {coachesLivres.map(c => (
                                      <option key={c.coaches?.id} value={c.coaches?.id}>
                                        {c.coaches?.nome}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {ag.coach_id && (
                                  <select
                                    className="input input-sm text-xs flex-1"
                                    value={ag.coach_id}
                                    onChange={e => alocarCoach(ag.id, e.target.value)}
                                    disabled={alocandoId === ag.id}
                                  >
                                    {coachesHorario.map(c => (
                                      <option key={c.coaches?.id} value={c.coaches?.id}>
                                        {c.coaches?.nome}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  onClick={() => marcarPresenca(ag.id)}
                                  className="btn btn-sm gap-1 bg-green-500 text-white hover:bg-green-600"
                                >
                                  <CheckCircle size={12} /> Presença
                                </button>
                                <button
                                  onClick={() => marcarFalta(ag.id)}
                                  className="btn btn-sm gap-1 text-orange-600 hover:bg-orange-50"
                                >
                                  <XCircle size={12} /> Falta
                                </button>
                                <button
                                  onClick={() => cancelarAgendamento(ag.id)}
                                  className="btn btn-sm text-red-400 hover:bg-red-50"
                                >
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
