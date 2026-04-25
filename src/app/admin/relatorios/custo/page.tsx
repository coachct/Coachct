'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Coach } from '@/types'
import { fmt, calcCoachMetrics, perfLabel } from '@/lib/utils'
import { KpiCard, OccBar, Insight, PageHeader, Spinner } from '@/components/ui'

export default function CustoRetornoPage() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [aulas, setAulas] = useState<any[]>([])
  const [slots, setSlots] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()

  useEffect(() => {
    async function load() {
      const inicioMes = `${ano}-${String(mes).padStart(2,'0')}-01`
      const [{ data: c }, { data: a }, { data: h }] = await Promise.all([
        supabase.from('coaches').select('*').eq('ativo', true),
        supabase.from('aulas').select('coach_id').gte('horario_agendado', inicioMes).eq('status','finalizada'),
        supabase.from('coach_horarios').select('coach_id').eq('ativo', true),
      ])
      setCoaches(c || [])
      setAulas(a || [])
      // slots por semana × 4.3 semanas
      const slotsMap: Record<string, number> = {}
      ;(h || []).forEach((row: any) => { slotsMap[row.coach_id] = (slotsMap[row.coach_id] || 0) + 1 })
      Object.keys(slotsMap).forEach(k => { slotsMap[k] = Math.round(slotsMap[k] * 4.3) })
      setSlots(slotsMap)
      setLoading(false)
    }
    load()
  }, [])

  const aulasPorCoach = (id: string) => aulas.filter(a => a.coach_id === id).length
  const metrics = coaches.map(c => calcCoachMetrics(c, aulasPorCoach(c.id), slots[c.id] || 40))
  const fatT = metrics.reduce((s, m) => s + m.faturamento, 0)
  const cstT = metrics.reduce((s, m) => s + m.custo_total, 0)
  const aulasT = aulas.length
  const slotsT = metrics.reduce((s, m) => s + m.slots_disponiveis, 0)
  const receitaPerdida = metrics.reduce((s, m) => s + (m.slots_disponiveis - m.aulas_mes) * m.coach.valor_cliente_aula, 0)

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Custo × Retorno" subtitle="Ocupação real vs disponibilidade declarada" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Faturamento total" value={fmt(fatT)} subColor="text-primary-600" />
        <KpiCard label="Custo total" value={fmt(cstT)} sub="fixo + variável" subColor="text-danger-600" />
        <KpiCard label="Margem bruta" value={fmt(fatT - cstT)} sub={`${fatT > 0 ? ((fatT-cstT)/fatT*100).toFixed(1) : 0}%`} subColor="text-primary-600" />
        <KpiCard label="Receita potencial perdida" value={fmt(receitaPerdida)} sub="slots ociosos" subColor="text-danger-600" />
      </div>

      <div className="space-y-4 mb-6">
        {metrics.map(m => {
          const p = perfLabel(m.ocupacao_pct)
          const fixoPct = m.custo_total > 0 ? (m.custo_fixo / m.custo_total * 100).toFixed(0) : 0
          const varPct = m.custo_total > 0 ? (m.custo_variavel / m.custo_total * 100).toFixed(0) : 0
          return (
            <div key={m.coach.id} className={`card border-l-4 ${m.breakeven_atingido && m.ocupacao_pct >= 44 ? 'border-l-primary-400' : m.breakeven_atingido ? 'border-l-warning-400' : 'border-l-danger-400'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-800 text-sm font-semibold flex items-center justify-center flex-shrink-0">
                  {m.coach.nome.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{m.coach.nome}</div>
                  <div className="text-xs text-gray-400">{m.coach.contrato} · Fixo {fmt(m.custo_fixo)} + R${m.coach.adicional_por_aula}/aula · Cliente R${m.coach.valor_cliente_aula}/aula</div>
                </div>
                <span className={`badge badge-${p.color}`}>{p.txt}</span>
              </div>

              <div className="grid grid-cols-5 gap-2 mb-4">
                {[
                  { l: 'Aulas', v: m.aulas_mes, c: 'text-gray-900' },
                  { l: 'Custo fixo', v: fmt(m.custo_fixo), c: 'text-danger-600' },
                  { l: 'Custo variável', v: fmt(m.custo_variavel), c: 'text-warning-700' },
                  { l: 'Faturamento', v: fmt(m.faturamento), c: 'text-primary-700' },
                  { l: 'Margem', v: fmt(m.margem), c: m.margem >= 0 ? 'text-primary-700' : 'text-danger-600' },
                ].map(item => (
                  <div key={item.l} className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">{item.l}</div>
                    <div className={`text-sm font-semibold ${item.c}`}>{item.v}</div>
                  </div>
                ))}
              </div>

              <div className="mb-3">
                <div className="text-xs text-gray-400 mb-1">Composição do custo: fixo {fixoPct}% + variável {varPct}%</div>
                <div className="flex h-2 rounded-full overflow-hidden">
                  <div style={{ width: `${fixoPct}%` }} className="bg-danger-400" />
                  <div style={{ width: `${varPct}%` }} className="bg-warning-400" />
                </div>
              </div>

              <OccBar pct={m.ocupacao_pct} className="mb-2" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{m.aulas_mes}/{m.slots_disponiveis} slots · {m.ocupacao_pct}% ocupação</span>
                <span className={m.breakeven_atingido ? 'text-primary-700' : 'text-danger-600'}>
                  Equilíbrio: {m.breakeven_aulas} aulas · {m.breakeven_atingido ? `✓ +${m.aulas_mes - m.breakeven_aulas} acima` : `⚠ faltam ${m.breakeven_aulas - m.aulas_mes}`}
                </span>
              </div>

              {!m.breakeven_atingido && (
                <Insight variant="red" >
                  ⚠ Custo fixo de {fmt(m.custo_fixo)} não coberto. Receita potencial perdida nos slots ociosos: {fmt((m.slots_disponiveis - m.aulas_mes) * m.coach.valor_cliente_aula)}.
                </Insight>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
