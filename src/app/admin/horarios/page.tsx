'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner } from '@/components/ui'
import { DIAS_SEMANA, HORARIOS } from '@/lib/utils'

export default function HorariosPage() {
  const [heatmap, setHeatmap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()

  useEffect(() => {
    async function load() {
      const inicioMes = `${ano}-${String(mes).padStart(2,'0')}-01`
      const fimMes = `${ano}-${String(mes).padStart(2,'0')}-31`

      const { data } = await supabase
        .from('agendamentos')
        .select('data, horario')
        .gte('data', inicioMes)
        .lte('data', fimMes)
        .neq('status', 'cancelado')

      const map: Record<string, number> = {}
      ;(data || []).forEach((a: any) => {
        const d = new Date(a.data + 'T12:00:00')
        const hora = (a.horario || '').slice(0, 5) // "06:00"
        const key = `${d.getDay()}-${hora}`
        map[key] = (map[key] || 0) + 1
      })
      setHeatmap(map)
      setLoading(false)
    }
    load()
  }, [])

  const max = Math.max(...Object.values(heatmap), 1)

  function heatClass(v: number) {
    if (!v) return 'bg-gray-100'
    const r = v / max
    if (r >= 0.75) return 'bg-primary-800 text-white'
    if (r >= 0.5) return 'bg-primary-400 text-white'
    if (r >= 0.25) return 'bg-primary-200 text-primary-900'
    return 'bg-primary-100 text-primary-700'
  }

  const entries = Object.entries(heatmap)

  const picoEntry = entries.reduce((a, b) => b[1] > a[1] ? b : a, ['', 0])
  const [picoKey] = picoEntry
  const [picoDiaStr, picoHora] = picoKey ? picoKey.split(/-(.+)/) : [null, null]
  const picoDia = picoDiaStr ? parseInt(picoDiaStr) : null

  const totalAulas = Object.values(heatmap).reduce((a, b) => a + b, 0)

  const dayTotals = [1,2,3,4,5,6].map(d => ({
    d,
    v: entries.filter(([k]) => k.startsWith(`${d}-`)).reduce((s, [, v]) => s + v, 0)
  }))
  const diaMaisMovimentado = [...dayTotals].sort((a, b) => b.v - a.v)[0]?.d ?? 1
  const horaTotals = HORARIOS.map(h => ({
    h,
    v: entries.filter(([k]) => k.endsWith(`-${h}`)).reduce((s, [, v]) => s + v, 0)
  }))
  const horaMaisVazia = [...horaTotals].sort((a, b) => a.v - b.v)[0]

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Horários populares" subtitle="Mapa de calor por dia e horário — mês atual" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">Horário de pico</div>
          <div className="text-lg font-semibold text-gray-900">{picoHora ?? '—'}</div>
          <div className="text-xs text-gray-400">{picoDia !== null ? DIAS_SEMANA[picoDia] : ''} · {picoEntry[1]} agend.</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">Total de aulas</div>
          <div className="text-lg font-semibold text-gray-900">{totalAulas}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">Dias com mais aulas</div>
          <div className="text-lg font-semibold text-gray-900">{DIAS_SEMANA[diaMaisMovimentado]}</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="text-xs text-gray-400 mb-1">Horário mais vazio</div>
          <div className="text-lg font-semibold text-gray-900">{horaMaisVazia?.h ?? '—'}</div>
          <div className="text-xs text-primary-600">oportunidade de atrair alunos</div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Mapa de calor — {new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </h2>
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-gray-400 font-normal w-14 pr-2 pb-2 text-left">Hora</th>
              {DIAS_SEMANA.slice(1).map(d => (
                <th key={d} className="text-gray-400 font-normal pb-2 px-1 text-center min-w-[36px]">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HORARIOS.map(hora => (
              <tr key={hora}>
                <td className="text-gray-400 pr-2 py-0.5">{hora}</td>
                {[1, 2, 3, 4, 5, 6].map(dia => {
                  const v = heatmap[`${dia}-${hora}`] || 0
                  return (
                    <td key={dia} className="px-0.5 py-0.5">
                      <div className={`w-9 h-7 rounded flex items-center justify-center font-medium text-xs ${heatClass(v)}`}>
                        {v > 0 ? v : ''}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
          <span>Menos</span>
          {['bg-gray-100', 'bg-primary-100', 'bg-primary-200', 'bg-primary-400', 'bg-primary-800'].map(c => (
            <div key={c} className={`w-4 h-4 rounded ${c}`} />
          ))}
          <span>Mais</span>
        </div>
      </div>
    </div>
  )
}
