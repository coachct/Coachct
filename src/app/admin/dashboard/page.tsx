'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, calcCoachMetrics, perfLabel } from '@/lib/utils'
import { Coach, Aula } from '@/types'
import { KpiCard, OccBar, Badge, Insight, PageHeader, Spinner } from '@/components/ui'
import Link from 'next/link'

type Unidade = {
  id: string
  nome: string
  slug: string
  ativo: boolean
  tipo: string
}

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function tipoLabelClub(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')   return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t || '—'
}

export default function AdminDashboard() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [aulasHoje, setAulasHoje] = useState<any[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()

  // Carregar unidades ativas + selecionar default (do localStorage ou primeira ativa)
  useEffect(() => {
    async function loadUnidades() {
      const { data } = await supabase
        .from('unidades')
        .select('id, nome, slug, ativo, tipo')
        .eq('ativo', true)
        .order('nome')

      if (data && data.length > 0) {
        setUnidades(data)
        const saved = typeof window !== 'undefined' ? localStorage.getItem('admin_unidade_selecionada') : null
        const valida = saved && data.find(u => u.id === saved)
        setUnidadeSelecionada(valida ? saved! : data[0].id)
      }
    }
    loadUnidades()
  }, [])

  // Salvar preferência da unidade
  useEffect(() => {
    if (unidadeSelecionada && typeof window !== 'undefined') {
      localStorage.setItem('admin_unidade_selecionada', unidadeSelecionada)
    }
  }, [unidadeSelecionada])

  // Carregar dados quando unidade muda
  useEffect(() => {
    if (!unidadeSelecionada) return

    async function load() {
      setLoading(true)
      try {
        const inicioHoje = new Date(ano, mes - 1, now.getDate()).toISOString()
        const fimHoje = new Date(ano, mes - 1, now.getDate(), 23, 59, 59).toISOString()

        const [coachesRes, aulasRes, hojeRes] = await Promise.allSettled([
          supabase.from('coaches').select('*').eq('ativo', true),
          supabase.from('aulas').select('*')
            .gte('horario_agendado', `${ano}-${String(mes).padStart(2,'0')}-01`)
            .eq('status', 'finalizada')
            .eq('unidade_id', unidadeSelecionada),
          supabase.from('aulas')
            .select('*, coaches(nome), clientes:cliente_id(nome), treinos(nome)')
            .gte('horario_agendado', inicioHoje)
            .lte('horario_agendado', fimHoje)
            .eq('unidade_id', unidadeSelecionada)
            .order('horario_agendado', { ascending: true }),
        ])

        if (coachesRes.status === 'fulfilled') {
          setCoaches(coachesRes.value.data || [])
        } else {
          console.error('Erro coaches:', coachesRes.reason)
        }

        if (aulasRes.status === 'fulfilled') {
          setAulas(aulasRes.value.data || [])
        } else {
          console.error('Erro aulas:', aulasRes.reason)
        }

        if (hojeRes.status === 'fulfilled') {
          const dados = (hojeRes.value.data || []).map((a: any) => ({
            ...a,
            alunos: a.clientes,
          }))
          setAulasHoje(dados)
        } else {
          console.error('Erro aulas hoje:', hojeRes.reason)
        }
      } catch (err) {
        console.error('Erro geral no dashboard:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [unidadeSelecionada])

  if (loading) return <Spinner />

  const aulasPorCoach = (coachId: string) => aulas.filter(a => a.coach_id === coachId).length
  const metrics = coaches.map(c => calcCoachMetrics(c, aulasPorCoach(c.id), 54))
  const fatTotal = metrics.reduce((s, m) => s + m.faturamento, 0)
  const cstTotal = metrics.reduce((s, m) => s + m.custo_total, 0)
  const mrgTotal = fatTotal - cstTotal
  const mrgPct = fatTotal > 0 ? (mrgTotal / fatTotal) * 100 : 0
  const aulasTotal = aulas.length
  const mesNome = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // ====== HOJE EM NÚMEROS ======
  // Separar por status (canceladas NÃO contam como "agendadas" nem no ranking)
  const aulasFinalizadasHoje = aulasHoje.filter(a => a.status === 'finalizada')
  const aulasEmAndamento = aulasHoje.filter(a => a.status === 'em_andamento')
  const aulasCanceladasHoje = aulasHoje.filter(a => a.status === 'cancelada')
  const aulasRealizadasOuEmCurso = aulasFinalizadasHoje.length + aulasEmAndamento.length
  // "Agendadas hoje" = aulas válidas (finalizada + em_andamento), exclui canceladas
  const totalAulasValidasHoje = aulasRealizadasOuEmCurso

  // Capacidade do dia (Opção 3): coaches ativos × aulas/dia
  // Seg-Sex: 15h30 de funcionamento → ~15 aulas/coach
  // Sáb/Dom: 5h de funcionamento → ~5 aulas/coach
  const diaSemana = now.getDay()
  const isFimDeSemana = diaSemana === 0 || diaSemana === 6
  const aulasPorCoachDia = isFimDeSemana ? 5 : 15
  const capacidadeDia = coaches.length * aulasPorCoachDia
  const ocupacaoPct = capacidadeDia > 0 ? Math.round((aulasRealizadasOuEmCurso / capacidadeDia) * 100) : 0

  // ====== RANKING DE COACHES DO DIA ======
  // Só conta aulas que realmente aconteceram (finalizada + em_andamento)
  // Canceladas NÃO contam
  const rankingCoachesHoje = (() => {
    const contagem: Record<string, { nome: string; aulas: number }> = {}
    aulasHoje
      .filter(a => a.status === 'finalizada' || a.status === 'em_andamento')
      .forEach(a => {
        const coachId = a.coach_id
        const coachNome = a.coaches?.nome || '—'
        if (!coachId) return
        if (!contagem[coachId]) contagem[coachId] = { nome: coachNome, aulas: 0 }
        contagem[coachId].aulas++
      })
    const lista = Object.values(contagem).sort((a, b) => b.aulas - a.aulas)
    const max = lista[0]?.aulas || 1
    return lista.map(c => ({ ...c, pct: Math.round((c.aulas / max) * 100) }))
  })()

  const renderAula = (aula: any) => {
    const emAndamento = aula.status === 'em_andamento'
    return (
      <div key={aula.id}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          emAndamento
            ? 'bg-orange-50 border-orange-200'
            : 'bg-gray-50 border-gray-100'
        }`}
      >
        <div className="text-center flex-shrink-0 w-20">
          <div className="text-sm font-bold text-gray-700">
            {new Date(aula.horario_agendado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {aula.finalizada_em ? (
            <div className="text-xs text-gray-400 mt-0.5">
              até {new Date(aula.finalizada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          ) : (
            <div className="text-xs text-orange-500 mt-0.5 font-medium">em curso</div>
          )}
        </div>

        <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">
              {aula.alunos?.nome || 'Aluno'}
            </span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500 truncate">
              {aula.treinos?.nome || '—'}
            </span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            Coach: {aula.coaches?.nome || '—'}
          </div>
        </div>

        <div className="flex-shrink-0">
          {emAndamento ? (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              Em andamento
            </span>
          ) : (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              Finalizada
            </span>
          )}
        </div>
      </div>
    )
  }

  const unidadeAtual = unidades.find(u => u.id === unidadeSelecionada)
  const isClub = unidadeAtual?.tipo === 'club'

  return (
    <div>
      {/* Header com filtro de unidade */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <PageHeader title="Dashboard" subtitle={mesNome.charAt(0).toUpperCase() + mesNome.slice(1)} />
        {unidades.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Unidade</label>
            <select
              value={unidadeSelecionada}
              onChange={(e) => setUnidadeSelecionada(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
            >
              {unidades.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isClub ? (
        <DashboardClub unidadeId={unidadeSelecionada} unidadeNome={unidadeAtual?.nome} />
      ) : (
        <>
          {/* 1. Hero financeiro */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-primary-50 border border-primary-100 rounded-xl p-5">
              <div className="text-xs font-medium text-primary-600 uppercase tracking-wide mb-1">Faturamento</div>
              <div className="text-2xl font-semibold text-primary-900">{fmt(fatTotal)}</div>
              <div className="text-xs text-primary-600 mt-1">{aulasTotal} aulas no mês</div>
            </div>
            <div className="bg-danger-50 border border-danger-200 rounded-xl p-5">
              <div className="text-xs font-medium text-danger-600 uppercase tracking-wide mb-1">Custo coaches</div>
              <div className="text-2xl font-semibold text-danger-800">{fmt(cstTotal)}</div>
              <div className="text-xs text-danger-600 mt-1">fixo + variável</div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
              <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Margem bruta</div>
              <div className="text-2xl font-semibold text-blue-900">{fmt(mrgTotal)}</div>
              <div className="text-xs text-blue-600 mt-1">{mrgPct.toFixed(1)}% de margem</div>
            </div>
          </div>

          {/* 2. KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard label="Aulas no mês" value={String(aulasTotal)} />
            <KpiCard label="Coaches ativos" value={String(coaches.length)} />
            <KpiCard label="Custo fixo total" value={fmt(metrics.reduce((s,m)=>s+m.custo_fixo,0))} sub="salários" />
            <KpiCard label="Custo variável" value={fmt(metrics.reduce((s,m)=>s+m.custo_variavel,0))} sub="por aulas dadas" />
          </div>

          {/* 3. HOJE EM NÚMEROS */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Hoje em números</h2>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">
                  {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {unidadeAtual && <span className="text-gray-300"> · {unidadeAtual.nome}</span>}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Agendadas hoje</div>
                <div className="text-2xl font-semibold text-gray-900">{totalAulasValidasHoje}</div>
                <div className="text-xs text-gray-400 mt-1">aulas no dia</div>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <div className="text-xs font-medium text-green-600 uppercase tracking-wide mb-1">Já finalizadas</div>
                <div className="text-2xl font-semibold text-green-900">{aulasFinalizadasHoje.length}</div>
                <div className="text-xs text-green-600 mt-1">concluídas</div>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <div className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">A fazer</div>
                <div className="text-2xl font-semibold text-orange-900">{aulasEmAndamento.length}</div>
                <div className="text-xs text-orange-600 mt-1">em andamento</div>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <div className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Canceladas hoje</div>
                <div className="text-2xl font-semibold text-red-900">{aulasCanceladasHoje.length}</div>
                <div className="text-xs text-red-600 mt-1">
                  {totalAulasValidasHoje + aulasCanceladasHoje.length > 0
                    ? `${Math.round((aulasCanceladasHoje.length / (totalAulasValidasHoje + aulasCanceladasHoje.length)) * 100)}% do dia`
                    : 'sem aulas ainda'}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Ocupação do dia</div>
                <div className="text-2xl font-semibold text-blue-900">{ocupacaoPct}%</div>
                <div className="text-xs text-blue-600 mt-1">{aulasRealizadasOuEmCurso} de {capacidadeDia} vagas</div>
              </div>
            </div>
          </div>

          {/* 4. Aulas em andamento */}
          {aulasEmAndamento.length > 0 && (
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                    Aulas em andamento
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">{aulasEmAndamento.length} aula{aulasEmAndamento.length !== 1 ? 's' : ''} acontecendo agora</p>
                </div>
                <span className="flex items-center gap-1.5 text-xs bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full font-medium">
                  {aulasEmAndamento.length} ao vivo
                </span>
              </div>
              <div className="space-y-2">
                {aulasEmAndamento.map(renderAula)}
              </div>
            </div>
          )}

          {/* 5. Aulas finalizadas hoje */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Aulas finalizadas hoje</h2>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">
                  {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
                {aulasFinalizadasHoje.length} finalizadas
              </span>
            </div>

            {aulasFinalizadasHoje.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400 italic">
                Nenhuma aula finalizada hoje ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {aulasFinalizadasHoje.map(renderAula)}
              </div>
            )}
          </div>

          {/* 6. RANKING DE COACHES DO DIA */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Ranking de coaches do dia</h2>
                <p className="text-xs text-gray-400 mt-0.5">Aulas efetivamente realizadas hoje (não inclui canceladas)</p>
              </div>
              {rankingCoachesHoje.length > 0 && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-medium">
                  {rankingCoachesHoje.length} ativo{rankingCoachesHoje.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {rankingCoachesHoje.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400 italic">
                Nenhum coach com aulas hoje ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {rankingCoachesHoje.map((c, idx) => (
                  <div key={c.nome}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-mono w-5">{idx + 1}.</span>
                        <span className="text-sm font-medium text-gray-800">{c.nome}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">
                        {c.aulas} {c.aulas === 1 ? 'aula' : 'aulas'}
                      </span>
                    </div>
                    <div className="ml-7 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all"
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 7. Coaches + Alertas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Ocupação dos coaches</h2>
                <Link href="/admin/relatorios/custo" className="text-xs text-primary-600 hover:underline">Ver completo</Link>
              </div>
              <div className="space-y-4">
                {metrics.length === 0 ? (
                  <div className="text-sm text-gray-400 italic py-4 text-center">Nenhum coach ativo encontrado.</div>
                ) : metrics.map(m => {
                  const p = perfLabel(m.ocupacao_pct)
                  return (
                    <div key={m.coach.id}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-800 flex-1">{m.coach.nome}</span>
                        <Badge variant={p.color as any}>{p.txt}</Badge>
                        <span className="text-sm font-semibold text-gray-700">{m.ocupacao_pct}%</span>
                      </div>
                      <OccBar pct={m.ocupacao_pct} />
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>{m.aulas_mes} aulas · margem {fmt(m.margem)}</span>
                        <span className={m.breakeven_atingido ? 'text-primary-600' : 'text-danger-500'}>
                          {m.breakeven_atingido ? `✓ equilíbrio atingido` : `⚠ faltam ${m.breakeven_aulas - m.aulas_mes} aulas`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Alertas do mês</h2>
              <div className="space-y-1">
                {metrics.length === 0 ? (
                  <div className="text-sm text-gray-400 italic py-4 text-center">Sem dados pra exibir alertas.</div>
                ) : metrics.map(m => {
                  const occ = m.ocupacao_pct
                  if (!m.breakeven_atingido) return (
                    <Insight key={m.coach.id} variant="red">
                      ⚠ <strong>{m.coach.nome}</strong> não cobriu o custo fixo. Faltam {m.breakeven_aulas - m.aulas_mes} aulas.
                    </Insight>
                  )
                  if (occ < 44) return (
                    <Insight key={m.coach.id} variant="amber">
                      ● <strong>{m.coach.nome}</strong> com ocupação baixa ({occ}%). Avaliar redistribuição de horários.
                    </Insight>
                  )
                  return (
                    <Insight key={m.coach.id} variant="green">
                      ✓ <strong>{m.coach.nome}</strong> — {occ}% de ocupação, margem {fmt(m.margem)}.
                    </Insight>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// DASHBOARD CLUB — resumo de ocupação de hoje/amanhã + por aula
// ============================================================
function DashboardClub({ unidadeId, unidadeNome }: { unidadeId: string; unidadeNome?: string }) {
  const supabase = createClient()

  const hoje = dataLocalStr(new Date())
  const amanhaDate = new Date(); amanhaDate.setDate(amanhaDate.getDate() + 1)
  const amanha = dataLocalStr(amanhaDate)

  const [resumoHoje, setResumoHoje]   = useState<any>(null)
  const [resumoAmanha, setResumoAmanha] = useState<any>(null)
  const [vendasDia, setVendasDia]     = useState(0)
  const [vendasMes, setVendasMes]     = useState(0)
  const [dataSel, setDataSel]         = useState(hoje)
  const [detalhe, setDetalhe]         = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)

  // Carrega as aulas (ocorrências) + reservas de um dia, monta resumo
  async function carregarDia(dataStr: string) {
    const { data: ocs } = await supabase
      .from('club_ocorrencias')
      .select('id, data, vagas_bloqueadas, coach_escalado:coaches!coach_id(nome), club_aulas!inner(tipo, horario, capacidade, unidade_id, coaches(nome), grupos_musculares(nome))')
      .eq('data', dataStr)
      .eq('club_aulas.unidade_id', unidadeId)

    const ocList = ocs || []
    const ocIds = ocList.map((o: any) => o.id)

    let reservasRows: any[] = []
    if (ocIds.length > 0) {
      const { data: rs } = await supabase
        .from('club_reservas')
        .select('ocorrencia_id, status')
        .in('ocorrencia_id', ocIds)
        .neq('status', 'cancelado')
      reservasRows = rs || []
    }

    const aulas = ocList.map((o: any) => {
      const rs = reservasRows.filter(r => r.ocorrencia_id === o.id)
      const reservas  = rs.length
      const presentes = rs.filter(r => r.status === 'presente').length
      const faltas    = rs.filter(r => r.status === 'falta').length
      const cap  = o.club_aulas?.capacidade || 0
      const bloq = o.vagas_bloqueadas || 0
      const capacidade = Math.max(0, cap - bloq)
      return {
        id: o.id,
        horario: (o.club_aulas?.horario || '').slice(0, 5),
        tipo: o.club_aulas?.tipo,
        grupo: o.club_aulas?.grupos_musculares?.nome || null,
        coach: o.coach_escalado?.nome || o.club_aulas?.coaches?.nome || null,
        reservas, presentes, faltas, capacidade, bloqueadas: bloq,
      }
    }).sort((a: any, b: any) => a.horario.localeCompare(b.horario))

    const totalReservas = aulas.reduce((s: number, a: any) => s + a.reservas, 0)
    const capacidade    = aulas.reduce((s: number, a: any) => s + a.capacidade, 0)
    return { aulas, totalReservas, ocupadas: totalReservas, capacidade, nAulas: aulas.length }
  }

  // Vendas (online pago + balcão, sem duplicar) — igual à página /admin/vendas
  async function carregarVendas() {
    const n = new Date()
    const inicioDia = new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString()
    const fimDia    = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59).toISOString()
    const inicioMes = new Date(n.getFullYear(), n.getMonth(), 1).toISOString()
    const fimMes    = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59).toISOString()

    const { data: onlineMes } = await supabase
      .from('pagamentos_pendentes')
      .select('valor_total, venda_id, pago_em')
      .eq('unidade_id', unidadeId)
      .eq('status', 'pago')
      .is('excluido_em', null)
      .gte('pago_em', inicioMes).lte('pago_em', fimMes)

    const { data: balcaoMes } = await supabase
      .from('vendas')
      .select('id, valor_total, vendido_em')
      .eq('unidade_id', unidadeId)
      .is('excluido_em', null)
      .gte('vendido_em', inicioMes).lte('vendido_em', fimMes)

    const online = onlineMes || []
    const vendaIdsOnline = new Set(online.map((o: any) => o.venda_id).filter(Boolean))
    const balcao = (balcaoMes || []).filter((v: any) => !vendaIdsOnline.has(v.id))

    const soma = (rows: any[]) => rows.reduce((s, r) => s + Number(r.valor_total || 0), 0)
    const dentro = (iso: string | null | undefined, ini: string, fim: string) => !!iso && iso >= ini && iso <= fim

    setVendasMes(soma(online) + soma(balcao))
    setVendasDia(
      soma(online.filter((o: any) => dentro(o.pago_em, inicioDia, fimDia))) +
      soma(balcao.filter((v: any) => dentro(v.vendido_em, inicioDia, fimDia)))
    )
  }

  // Carga inicial: resumos de hoje e amanhã + vendas + detalhe inicial (hoje)
  useEffect(() => {
    if (!unidadeId) return
    let ativo = true
    async function init() {
      setLoading(true)
      const [rh, ra] = await Promise.all([carregarDia(hoje), carregarDia(amanha)])
      if (!ativo) return
      setResumoHoje(rh)
      setResumoAmanha(ra)
      setDataSel(hoje)
      setDetalhe(rh)
      await carregarVendas()
      if (!ativo) return
      setLoading(false)
    }
    init()
    return () => { ativo = false }
  }, [unidadeId])

  // Detalhe muda com a data selecionada (reaproveita hoje/amanhã já carregados)
  useEffect(() => {
    if (loading) return
    let ativo = true
    async function loadDet() {
      if (dataSel === hoje && resumoHoje)   { setDetalhe(resumoHoje); return }
      if (dataSel === amanha && resumoAmanha) { setDetalhe(resumoAmanha); return }
      setLoadingDetalhe(true)
      const r = await carregarDia(dataSel)
      if (!ativo) return
      setDetalhe(r)
      setLoadingDetalhe(false)
    }
    loadDet()
    return () => { ativo = false }
  }, [dataSel])

  if (loading) return <Spinner />

  const labelDataSel = (() => {
    if (dataSel === hoje) return 'Hoje'
    if (dataSel === amanha) return 'Amanhã'
    return new Date(dataSel + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  })()
  const ehHoje = dataSel === hoje

  function CardDia({ titulo, dataStr, resumo, destaque }: { titulo: string; dataStr: string; resumo: any; destaque?: boolean }) {
    const cap = resumo?.capacidade || 0
    const occ = resumo?.ocupadas || 0
    const pct = cap > 0 ? Math.round((occ / cap) * 100) : 0
    const dataFmt = new Date(dataStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    return (
      <div className={`rounded-xl p-5 border ${destaque ? 'bg-primary-50 border-primary-100' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-sm font-semibold ${destaque ? 'text-primary-800' : 'text-gray-800'}`}>{titulo}</div>
            <div className="text-xs text-gray-400 capitalize">{dataFmt}</div>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-semibold leading-none ${destaque ? 'text-primary-900' : 'text-gray-900'}`}>{resumo?.totalReservas ?? 0}</div>
            <div className="text-xs text-gray-400 mt-1">reservas</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-500">Ocupação</span>
          <span className="font-semibold text-gray-700">{occ}/{cap} vagas · {pct}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 85 ? 'bg-red-500' : pct >= 50 ? 'bg-primary-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="text-xs text-gray-400 mt-2">{resumo?.nAulas ?? 0} aula{(resumo?.nAulas ?? 0) !== 1 ? 's' : ''} no dia</div>
      </div>
    )
  }

  return (
    <div>
      {/* Resumo HOJE / AMANHÃ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CardDia titulo="Hoje"   dataStr={hoje}   resumo={resumoHoje}   destaque />
        <CardDia titulo="Amanhã" dataStr={amanha} resumo={resumoAmanha} />
      </div>

      {/* Vendas */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <KpiCard label="Vendas hoje" value={fmt(vendasDia)} sub={unidadeNome || undefined} />
        <KpiCard label="Vendas no mês" value={fmt(vendasMes)} sub="mês atual" />
      </div>

      {/* Resumo por aula */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Reservas por aula</h2>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">{labelDataSel}{unidadeNome && <span className="text-gray-300"> · {unidadeNome}</span>}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setDataSel(hoje)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dataSel === hoje ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Hoje
              </button>
              <button
                onClick={() => setDataSel(amanha)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dataSel === amanha ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Amanhã
              </button>
            </div>
            <input
              type="date"
              value={dataSel}
              onChange={(e) => setDataSel(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
            />
          </div>
        </div>

        {loadingDetalhe ? (
          <div className="text-center py-8 text-sm text-gray-400 italic">Carregando…</div>
        ) : !detalhe || detalhe.aulas.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 italic">Nenhuma aula nesse dia.</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="text-gray-500">{detalhe.nAulas} aulas</span>
              <span className="font-semibold text-gray-700">
                {detalhe.ocupadas}/{detalhe.capacidade} vagas ocupadas · {detalhe.capacidade > 0 ? Math.round((detalhe.ocupadas / detalhe.capacidade) * 100) : 0}%
              </span>
            </div>
            <div className="space-y-2">
              {detalhe.aulas.map((a: any) => {
                const pct = a.capacidade > 0 ? Math.round((a.reservas / a.capacidade) * 100) : 0
                return (
                  <Link
                    key={a.id}
                    href={`/admin/justclub/calendario/${a.id}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-gray-50 border-gray-100 hover:bg-gray-100 hover:border-gray-200 transition-colors cursor-pointer"
                  >
                    <div className="text-center flex-shrink-0 w-14">
                      <div className="text-sm font-bold text-gray-700">{a.horario}</div>
                    </div>
                    <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{tipoLabelClub(a.tipo)}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">
                        {a.coach ? `Coach: ${a.coach}` : 'Coach a definir'}
                        {a.bloqueadas > 0 && <span className="text-red-400"> · {a.bloqueadas} bloqueada{a.bloqueadas !== 1 ? 's' : ''}</span>}
                        {ehHoje && (a.presentes > 0 || a.faltas > 0) && (
                          <span className="text-gray-400"> · {a.presentes} pres. / {a.faltas} falta{a.faltas !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-32">
                      <div className="flex items-center justify-end gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-700">{a.reservas}/{a.capacidade}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct >= 85 ? 'bg-red-500' : pct >= 50 ? 'bg-primary-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
