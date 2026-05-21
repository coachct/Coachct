'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { useRouter } from 'next/navigation'
import { BarChart2, TrendingUp, Users, Clock } from 'lucide-react'
import UnidadeSelector from '@/components/UnidadeSelector'

type Periodo = 7 | 30 | 90

interface CoachOcupacao {
  coach_id: string
  coach_nome: string
  total_alocado: number
  total_disponivel: number
  taxa_ocupacao: number
}

interface PreferenciaHorario {
  horario: string
  coaches: {
    coach_id: string
    coach_nome: string
    total_alocado: number
    total_disponivel: number
    taxa_preferencia: number
  }[]
}

interface AfinidadeCliente {
  cliente_nome: string
  coach_nome: string
  total_treinos: number
}

export default function AnalyticsCoachesPage() {
  const { perfil, loading } = useAuth()
  const { unidadeAtiva, loading: loadingUnidade } = useUnidade()
  const router = useRouter()
  const supabase = createClient()

  const [periodo, setPeriodo] = useState<Periodo>(30)
  const [loadingData, setLoadingData] = useState(true)

  const [ocupacao, setOcupacao] = useState<CoachOcupacao[]>([])
  const [preferencias, setPreferencias] = useState<PreferenciaHorario[]>([])
  const [afinidades, setAfinidades] = useState<AfinidadeCliente[]>([])
  const [totalSessoes, setTotalSessoes] = useState(0)
  const [coachesAtivos, setCoachesAtivos] = useState(0)

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') router.push('/')
  }, [perfil, loading])

  useEffect(() => {
    if (perfil) loadAnalytics()
  }, [periodo, perfil, unidadeAtiva?.id])

  async function loadAnalytics() {
    setLoadingData(true)

    const dataInicio = new Date()
    dataInicio.setDate(dataInicio.getDate() - periodo)
    const dataInicioStr = dataInicio.toISOString().split('T')[0]
    const hoje = new Date().toISOString().split('T')[0]

    // Query base — filtra por unidade só se houver múltiplas no futuro
    let agsQuery = supabase
      .from('agendamentos')
      .select('id, horario, coach_id, cliente_id, data, status, clientes(nome), coaches(nome)')
      .gte('data', dataInicioStr)
      .lte('data', hoje)
      .not('coach_id', 'is', null)
      .neq('status', 'cancelado')

    let horariosQuery = supabase
      .from('coach_horarios')
      .select('coach_id, hora, dia_semana, coaches(nome)')
      .eq('ativo', true)

    // Aplica filtro de unidade apenas se unidade estiver selecionada
    if (unidadeAtiva) {
      agsQuery = agsQuery.eq('unidade_id', unidadeAtiva.id)
      horariosQuery = horariosQuery.eq('unidade_id', unidadeAtiva.id)
    }

    const [{ data: ags }, { data: horarios }, { data: coachesData }] = await Promise.all([
      agsQuery,
      horariosQuery,
      supabase.from('coaches').select('id, nome').eq('ativo', true),
    ])

    setCoachesAtivos((coachesData || []).length)
    setTotalSessoes((ags || []).length)

    calcularOcupacao(ags || [], horarios || [], coachesData || [], dataInicioStr, hoje)
    calcularPreferencias(ags || [])
    calcularAfinidades(ags || [])

    setLoadingData(false)
  }

  function calcularOcupacao(ags: any[], horarios: any[], coaches: any[], dataInicio: string, dataFim: string) {
    const diasNoPeriodo: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    const d = new Date(dataInicio + 'T12:00:00')
    const fim = new Date(dataFim + 'T12:00:00')
    while (d <= fim) {
      diasNoPeriodo[d.getDay()] = (diasNoPeriodo[d.getDay()] || 0) + 1
      d.setDate(d.getDate() + 1)
    }

    const dispMap: Record<string, number> = {}
    for (const h of horarios) {
      const disp = diasNoPeriodo[h.dia_semana] || 0
      dispMap[h.coach_id] = (dispMap[h.coach_id] || 0) + disp
    }

    const alocMap: Record<string, number> = {}
    const nomeMap: Record<string, string> = {}
    for (const ag of ags) {
      if (!ag.coach_id) continue
      alocMap[ag.coach_id] = (alocMap[ag.coach_id] || 0) + 1
      nomeMap[ag.coach_id] = (ag.coaches as any)?.nome || '—'
    }
    for (const c of coaches) {
      nomeMap[c.id] = c.nome
    }

    const resultado: CoachOcupacao[] = coaches.map(c => {
      const total_alocado = alocMap[c.id] || 0
      const total_disponivel = dispMap[c.id] || 0
      const taxa = total_disponivel > 0 ? Math.round((total_alocado / total_disponivel) * 100) : 0
      return {
        coach_id: c.id,
        coach_nome: c.nome,
        total_alocado,
        total_disponivel,
        taxa_ocupacao: taxa,
      }
    }).sort((a, b) => b.total_alocado - a.total_alocado)

    setOcupacao(resultado)
  }

  function calcularPreferencias(ags: any[]) {
    const porHorario: Record<string, Record<string, number>> = {}
    const nomesCoach: Record<string, string> = {}

    for (const ag of ags) {
      if (!ag.coach_id) continue
      const hora = (ag.horario || '').slice(0, 5)
      if (!porHorario[hora]) porHorario[hora] = {}
      porHorario[hora][ag.coach_id] = (porHorario[hora][ag.coach_id] || 0) + 1
      nomesCoach[ag.coach_id] = (ag.coaches as any)?.nome || '—'
    }

    const resultado: PreferenciaHorario[] = Object.entries(porHorario)
      .map(([horario, coachMap]) => {
        const total = Object.values(coachMap).reduce((a, b) => a + b, 0)
        const coaches = Object.entries(coachMap)
          .map(([coach_id, count]) => ({
            coach_id,
            coach_nome: nomesCoach[coach_id] || '—',
            total_alocado: count,
            total_disponivel: total,
            taxa_preferencia: Math.round((count / total) * 100),
          }))
          .sort((a, b) => b.total_alocado - a.total_alocado)
        return { horario, coaches }
      })
      .sort((a, b) => a.horario.localeCompare(b.horario))
      .slice(0, 8)

    setPreferencias(resultado)
  }

  function calcularAfinidades(ags: any[]) {
    const pares: Record<string, number> = {}
    const nomesCliente: Record<string, string> = {}
    const nomesCoach: Record<string, string> = {}

    for (const ag of ags) {
      if (!ag.coach_id || !ag.cliente_id) continue
      const chave = `${ag.cliente_id}__${ag.coach_id}`
      pares[chave] = (pares[chave] || 0) + 1
      nomesCliente[ag.cliente_id] = (ag.clientes as any)?.nome || '—'
      nomesCoach[ag.coach_id] = (ag.coaches as any)?.nome || '—'
    }

    const resultado: AfinidadeCliente[] = Object.entries(pares)
      .filter(([_, count]) => count >= 2)
      .map(([chave, count]) => {
        const [cliente_id, coach_id] = chave.split('__')
        return {
          cliente_nome: nomesCliente[cliente_id] || '—',
          coach_nome: nomesCoach[coach_id] || '—',
          total_treinos: count,
        }
      })
      .sort((a, b) => b.total_treinos - a.total_treinos)
      .slice(0, 15)

    setAfinidades(resultado)
  }

  if (loading || loadingUnidade) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const periodos: { label: string; value: Periodo }[] = [
    { label: '7 dias', value: 7 },
    { label: '30 dias', value: 30 },
    { label: '90 dias', value: 90 },
  ]

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <BarChart2 size={20} className="text-primary-600" />
            <h1 className="text-lg font-semibold text-gray-900">Analytics de Coaches</h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {periodos.map(p => (
                <button key={p.value} onClick={() => setPeriodo(p.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    periodo === p.value
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <UnidadeSelector />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: <BarChart2 size={16} />, label: 'Sessões no período', value: totalSessoes },
            { icon: <Users size={16} />, label: 'Coaches ativos', value: coachesAtivos },
            { icon: <TrendingUp size={16} />, label: 'Média por coach', value: coachesAtivos > 0 ? Math.round(totalSessoes / coachesAtivos) : 0 },
            { icon: <Clock size={16} />, label: 'Horários analisados', value: preferencias.length },
          ].map((card, i) => (
            <div key={i} className="card">
              <div className="flex items-center gap-2 text-primary-600 mb-2">{card.icon}</div>
              <div className="text-2xl font-bold text-gray-900">{card.value}</div>
              <div className="text-xs text-gray-500 mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        {loadingData ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : totalSessoes === 0 ? (
          <div className="card text-center py-16 text-gray-400">
            <BarChart2 size={32} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">Nenhuma sessão com coach alocado encontrada no período.</div>
            <div className="text-xs mt-2 text-gray-300">Os dados aparecem conforme a recepção aloca coaches nas sessões.</div>
          </div>
        ) : (
          <>
            {/* 1. OCUPAÇÃO POR COACH */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-primary-600" />
                <h2 className="text-sm font-semibold text-gray-900">Ocupação por Coach</h2>
                <span className="text-xs text-gray-400 ml-auto">últimos {periodo} dias</span>
              </div>
              <div className="space-y-3">
                {ocupacao.filter(c => c.total_alocado > 0).map((c, i) => (
                  <div key={c.coach_id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                        <span className="text-sm font-medium text-gray-900">{c.coach_nome}</span>
                        {i === 0 && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">⭐ mais alocado</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span><strong className="text-gray-900">{c.total_alocado}</strong> sessões</span>
                        <span className={`font-semibold ${
                          c.taxa_ocupacao >= 60 ? 'text-green-600' :
                          c.taxa_ocupacao >= 30 ? 'text-yellow-600' : 'text-red-500'
                        }`}>{c.taxa_ocupacao}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${
                        c.taxa_ocupacao >= 60 ? 'bg-green-500' :
                        c.taxa_ocupacao >= 30 ? 'bg-yellow-400' : 'bg-red-400'
                      }`} style={{ width: `${Math.min(c.taxa_ocupacao, 100)}%` }} />
                    </div>
                  </div>
                ))}
                {ocupacao.filter(c => c.total_alocado === 0).length > 0 && (
                  <div className="pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-400 mb-2">Sem sessões no período:</div>
                    <div className="flex flex-wrap gap-2">
                      {ocupacao.filter(c => c.total_alocado === 0).map(c => (
                        <span key={c.coach_id} className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{c.coach_nome}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. PREFERÊNCIA POR HORÁRIO */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={16} className="text-primary-600" />
                <h2 className="text-sm font-semibold text-gray-900">Preferência por Horário</h2>
                <span className="text-xs text-gray-400 ml-auto">quem é mais escolhido em cada slot</span>
              </div>
              {preferencias.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Sem dados suficientes.</div>
              ) : (
                <div className="space-y-4">
                  {preferencias.map(h => (
                    <div key={h.horario} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-mono font-bold text-gray-900">{h.horario}</span>
                        <span className="text-xs text-gray-400">{h.coaches.reduce((a, c) => a + c.total_alocado, 0)} sessões</span>
                      </div>
                      <div className="space-y-2">
                        {h.coaches.map((c, i) => (
                          <div key={c.coach_id} className="flex items-center gap-2">
                            <span className="text-xs w-5">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                            <span className="text-xs text-gray-700 w-28 truncate">{c.coach_nome}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full bg-primary-400" style={{ width: `${c.taxa_preferencia}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-primary-600 w-10 text-right">{c.taxa_preferencia}%</span>
                            <span className="text-xs text-gray-400 w-12 text-right">{c.total_alocado}x</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. AFINIDADE CLIENTE-COACH */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-primary-600" />
                <h2 className="text-sm font-semibold text-gray-900">Afinidade Cliente × Coach</h2>
                <span className="text-xs text-gray-400 ml-auto">pares com 2+ treinos juntos</span>
              </div>
              {afinidades.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Sem pares recorrentes no período ainda.</div>
              ) : (
                <div className="space-y-2">
                  {afinidades.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate block">{a.cliente_nome}</span>
                        <span className="text-xs text-gray-500">com {a.coach_nome}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="flex gap-0.5">
                          {Array.from({ length: Math.min(a.total_treinos, 10) }).map((_, j) => (
                            <div key={j} className="w-1.5 h-4 bg-primary-400 rounded-sm opacity-80" />
                          ))}
                          {a.total_treinos > 10 && <span className="text-xs text-gray-400 ml-1">+{a.total_treinos - 10}</span>}
                        </div>
                        <span className="text-xs font-semibold text-primary-600 ml-2">{a.total_treinos}x</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
