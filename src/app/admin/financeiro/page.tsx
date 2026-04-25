'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Coach } from '@/types'
import { fmt, calcCoachMetrics } from '@/lib/utils'
import { PageHeader, Spinner } from '@/components/ui'

export default function FinanceiroPage() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [aulas, setAulas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())

  useEffect(() => { loadData() }, [mes, ano])

  async function loadData() {
    setLoading(true)
    const inicioMes = `${ano}-${String(mes).padStart(2,'0')}-01`
    const fimMes = new Date(ano, mes, 0).toISOString()
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('coaches').select('*').eq('ativo', true),
      supabase.from('aulas').select('coach_id').gte('horario_agendado', inicioMes).lte('horario_agendado', fimMes).eq('status','finalizada'),
    ])
    setCoaches(c || [])
    setAulas(a || [])
    setLoading(false)
  }

  const aulasPorCoach = (id: string) => aulas.filter(a => a.coach_id === id).length
  const metrics = coaches.map(c => calcCoachMetrics(c, aulasPorCoach(c.id), 54))
  const fatT = metrics.reduce((s, m) => s + m.faturamento, 0)
  const cstT = metrics.reduce((s, m) => s + m.custo_total, 0)
  const fixoT = metrics.reduce((s, m) => s + m.custo_fixo, 0)
  const varT = metrics.reduce((s, m) => s + m.custo_variavel, 0)
  const mrgT = fatT - cstT
  const mrgPct = fatT > 0 ? (mrgT / fatT * 100) : 0

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Faturamento & Margem" subtitle="Receita, custo e lucro por coach" />

      <div className="flex gap-3 mb-6 flex-wrap">
        <select className="input w-auto" value={`${mes}-${ano}`} onChange={e => { const [m,a] = e.target.value.split('-'); setMes(+m); setAno(+a) }}>
          {Array.from({length: 6}, (_,i) => { const d = new Date(); d.setMonth(d.getMonth()-i); return d }).map(d => {
            const m = d.getMonth()+1; const a = d.getFullYear()
            return <option key={`${m}-${a}`} value={`${m}-${a}`}>{meses[m-1]} {a}</option>
          })}
        </select>
        <button className="btn btn-sm">Exportar PDF</button>
        <button className="btn btn-sm">Exportar CSV</button>
      </div>

      {/* Hero */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-5">
          <div className="text-xs font-medium text-primary-600 uppercase tracking-wide mb-1">Faturamento</div>
          <div className="text-2xl font-semibold text-primary-900">{fmt(fatT)}</div>
          <div className="text-xs text-primary-600 mt-1">{aulas.length} aulas no mês</div>
        </div>
        <div className="bg-danger-50 border border-danger-200 rounded-xl p-5">
          <div className="text-xs font-medium text-danger-600 uppercase tracking-wide mb-1">Custo total coaches</div>
          <div className="text-2xl font-semibold text-danger-800">{fmt(cstT)}</div>
          <div className="text-xs text-danger-600 mt-1">fixo {fmt(fixoT)} + var. {fmt(varT)}</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
          <div className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Margem bruta</div>
          <div className="text-2xl font-semibold text-blue-900">{fmt(mrgT)}</div>
          <div className="text-xs text-blue-600 mt-1">{mrgPct.toFixed(1)}% de margem</div>
        </div>
      </div>

      {/* Barra margem */}
      <div className="h-3 rounded-full bg-danger-100 overflow-hidden mb-1">
        <div className="h-full bg-primary-400 rounded-full transition-all" style={{ width: `${Math.max(0, mrgPct)}%` }} />
      </div>
      <div className="text-xs text-gray-400 text-right mb-6">Custo {(100-mrgPct).toFixed(1)}% · Margem {mrgPct.toFixed(1)}%</div>

      {/* Tabela por coach */}
      <div className="card mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Detalhamento por coach</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-3 pr-3">Coach</th>
                <th className="text-right pb-3 pr-3">Aulas</th>
                <th className="text-right pb-3 pr-3">Faturamento</th>
                <th className="text-right pb-3 pr-3">Fixo</th>
                <th className="text-right pb-3 pr-3">Variável</th>
                <th className="text-right pb-3 pr-3">Custo total</th>
                <th className="text-right pb-3 pr-3">Margem R$</th>
                <th className="text-right pb-3">Margem %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {metrics.map(m => (
                <tr key={m.coach.id}>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center">{m.coach.nome.slice(0,2).toUpperCase()}</div>
                      <span className="font-medium text-gray-900">{m.coach.nome}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-right text-gray-700">{m.aulas_mes}</td>
                  <td className="py-3 pr-3 text-right font-semibold text-primary-700">{fmt(m.faturamento)}</td>
                  <td className="py-3 pr-3 text-right text-danger-600">{fmt(m.custo_fixo)}</td>
                  <td className="py-3 pr-3 text-right text-warning-700">{fmt(m.custo_variavel)}</td>
                  <td className="py-3 pr-3 text-right font-semibold text-gray-900">{fmt(m.custo_total)}</td>
                  <td className={`py-3 pr-3 text-right font-semibold ${m.margem >= 0 ? 'text-primary-700' : 'text-danger-600'}`}>{fmt(m.margem)}</td>
                  <td className="py-3 text-right">
                    <span className={`badge ${m.margem_pct >= 20 ? 'badge-green' : m.margem_pct >= 10 ? 'badge-amber' : 'badge-red'}`}>
                      {m.margem_pct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td className="pt-3 pr-3 text-gray-900">Total</td>
                <td className="pt-3 pr-3 text-right">{aulas.length}</td>
                <td className="pt-3 pr-3 text-right text-primary-700">{fmt(fatT)}</td>
                <td className="pt-3 pr-3 text-right text-danger-600">{fmt(fixoT)}</td>
                <td className="pt-3 pr-3 text-right text-warning-700">{fmt(varT)}</td>
                <td className="pt-3 pr-3 text-right">{fmt(cstT)}</td>
                <td className="pt-3 pr-3 text-right text-primary-700">{fmt(mrgT)}</td>
                <td className="pt-3 text-right"><span className="badge badge-green">{mrgPct.toFixed(1)}%</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Ponto de equilíbrio */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Ponto de equilíbrio por coach</h2>
        <p className="text-xs text-gray-400 mb-4">Quantas aulas cada coach precisa dar para cobrir o custo fixo mensal.</p>
        <div className="space-y-4">
          {metrics.map(m => {
            const pct = m.breakeven_aulas > 0 ? Math.min(100, Math.round(m.aulas_mes / m.breakeven_aulas * 100)) : 100
            return (
              <div key={m.coach.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{m.coach.nome}</span>
                  <span className={`text-xs font-medium ${m.breakeven_atingido ? 'text-primary-700' : 'text-danger-600'}`}>
                    {m.aulas_mes}/{m.breakeven_aulas} aulas {m.breakeven_atingido ? '✓' : '⚠'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full rounded-full ${m.breakeven_atingido ? 'bg-primary-400' : 'bg-danger-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Fixo {fmt(m.custo_fixo)} ÷ margem unit. R${(m.coach.valor_cliente_aula - m.coach.adicional_por_aula).toFixed(0)} = {m.breakeven_aulas} aulas mínimas
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
