'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt, calcCoachMetrics, perfLabel } from '@/lib/utils'
import { Coach, Aula } from '@/types'
import { KpiCard, OccBar, Badge, Insight, PageHeader, Spinner } from '@/components/ui'
import Link from 'next/link'

export default function AdminDashboard() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: a }] = await Promise.all([
        supabase.from('coaches').select('*').eq('ativo', true),
        supabase.from('aulas').select('*').gte('horario_agendado', `${ano}-${String(mes).padStart(2,'0')}-01`).eq('status', 'finalizada'),
      ])
      setCoaches(c || [])
      setAulas(a || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <Spinner />

  // Calcular métricas
  const aulasPorCoach = (coachId: string) => aulas.filter(a => a.coach_id === coachId).length
  const metrics = coaches.map(c => calcCoachMetrics(c, aulasPorCoach(c.id), 54)) // slots placeholder
  const fatTotal = metrics.reduce((s, m) => s + m.faturamento, 0)
  const cstTotal = metrics.reduce((s, m) => s + m.custo_total, 0)
  const mrgTotal = fatTotal - cstTotal
  const mrgPct = fatTotal > 0 ? (mrgTotal / fatTotal) * 100 : 0
  const aulasTotal = aulas.length

  const mesNome = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={mesNome.charAt(0).toUpperCase() + mesNome.slice(1)} />

      {/* Hero financeiro */}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Aulas no mês" value={String(aulasTotal)} />
        <KpiCard label="Coaches ativos" value={String(coaches.length)} />
        <KpiCard label="Custo fixo total" value={fmt(metrics.reduce((s,m)=>s+m.custo_fixo,0))} sub="salários" />
        <KpiCard label="Custo variável" value={fmt(metrics.reduce((s,m)=>s+m.custo_variavel,0))} sub="por aulas dadas" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Coaches ocupação */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Ocupação dos coaches</h2>
            <Link href="/admin/relatorios/custo" className="text-xs text-primary-600 hover:underline">Ver completo</Link>
          </div>
          <div className="space-y-4">
            {metrics.map(m => {
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

        {/* Alertas */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Alertas do mês</h2>
          <div className="space-y-1">
            {metrics.map(m => {
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
    </div>
  )
}
