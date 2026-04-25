'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Coach } from '@/types'
import { fmt } from '@/lib/utils'
import { PageHeader, Spinner } from '@/components/ui'

export default function PagamentosPage() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [aulas, setAulas] = useState<any[]>([])
  const [pagos, setPagos] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()

  useEffect(() => {
    async function load() {
      const inicioMes = `${ano}-${String(mes).padStart(2,'0')}-01`
      const [{ data: c }, { data: a }] = await Promise.all([
        supabase.from('coaches').select('*').eq('ativo', true),
        supabase.from('aulas').select('coach_id').gte('horario_agendado', inicioMes).eq('status','finalizada'),
      ])
      setCoaches(c || [])
      setAulas(a || [])
      setLoading(false)
    }
    load()
  }, [])

  const aulasPorCoach = (id: string) => aulas.filter(a => a.coach_id === id).length
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  if (loading) return <Spinner />

  const totalPagar = coaches.reduce((s, c) => s + c.salario_fixo + c.adicional_por_aula * aulasPorCoach(c.id), 0)

  return (
    <div>
      <PageHeader title="Pagamentos" subtitle={`${meses[mes-1]} ${ano} — fixo + variável por coach`} />

      <div className="flex gap-2 mb-4">
        <button className="btn btn-sm">Exportar PDF</button>
        <button className="btn btn-sm">Exportar CSV</button>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-3 pr-3">Coach</th>
                <th className="text-right pb-3 pr-3">Aulas</th>
                <th className="text-right pb-3 pr-3">Salário fixo</th>
                <th className="text-right pb-3 pr-3">Adicional aulas</th>
                <th className="text-right pb-3 pr-3">Total a pagar</th>
                <th className="text-right pb-3 pr-3">Fat. gerado</th>
                <th className="text-right pb-3 pr-3">Margem</th>
                <th className="text-center pb-3 pr-3">Status</th>
                <th className="text-right pb-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {coaches.map(c => {
                const n = aulasPorCoach(c.id)
                const variavel = c.adicional_por_aula * n
                const total = c.salario_fixo + variavel
                const fat = c.valor_cliente_aula * n
                const mrg = fat - total
                const isPago = pagos.has(c.id)
                return (
                  <tr key={c.id}>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center">{c.nome.slice(0,2).toUpperCase()}</div>
                        <div>
                          <div className="font-medium text-gray-900">{c.nome}</div>
                          <div className="text-xs text-gray-400">{c.contrato}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right">{n}</td>
                    <td className="py-3 pr-3 text-right text-danger-600">{fmt(c.salario_fixo)}</td>
                    <td className="py-3 pr-3 text-right text-warning-700">
                      {fmt(variavel)}
                      <div className="text-xs text-gray-400">{n}×R${c.adicional_por_aula}</div>
                    </td>
                    <td className="py-3 pr-3 text-right font-bold text-gray-900">{fmt(total)}</td>
                    <td className="py-3 pr-3 text-right text-primary-700">{fmt(fat)}</td>
                    <td className={`py-3 pr-3 text-right font-semibold ${mrg >= 0 ? 'text-primary-700' : 'text-danger-600'}`}>{fmt(mrg)}</td>
                    <td className="py-3 pr-3 text-center">
                      <span className={`badge ${isPago ? 'badge-green' : 'badge-amber'}`}>{isPago ? 'Pago' : 'Pendente'}</span>
                    </td>
                    <td className="py-3 text-right">
                      {isPago
                        ? <button className="btn btn-sm">Recibo</button>
                        : <button onClick={() => setPagos(prev => new Set([...prev, c.id]))} className="btn btn-primary btn-sm">Pagar</button>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td className="pt-3 pr-3 text-gray-900" colSpan={4}>Total</td>
                <td className="pt-3 pr-3 text-right text-gray-900">{fmt(totalPagar)}</td>
                <td className="pt-3 pr-3 text-right text-primary-700">{fmt(coaches.reduce((s,c)=>s+c.valor_cliente_aula*aulasPorCoach(c.id),0))}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
