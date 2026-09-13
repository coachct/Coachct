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
        {/* Celular: um cartão por coach (sem rolar pro lado). A tabela aparece a partir de md. */}
        <div className="md:hidden divide-y divide-gray-100">
          {coaches.map(c => {
            const n = aulasPorCoach(c.id)
            const variavel = c.adicional_por_aula * n
            const total = c.salario_fixo + variavel
            const fat = c.valor_cliente_aula * n
            const mrg = fat - total
            const isPago = pagos.has(c.id)
            return (
              <div key={c.id} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 shrink-0 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center">{c.nome.slice(0,2).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{c.nome}</div>
                      <div className="text-xs text-gray-400">{c.contrato}</div>
                    </div>
                  </div>
                  <span className={`badge shrink-0 ${isPago ? 'badge-green' : 'badge-amber'}`}>{isPago ? 'Pago' : 'Pendente'}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Aulas</div>
                    <div className="text-sm">{n}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Salário fixo</div>
                    <div className="text-sm text-danger-600">{fmt(c.salario_fixo)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Adicional aulas</div>
                    <div className="text-sm text-warning-700">{fmt(variavel)}</div>
                    <div className="text-xs text-gray-400">{n}×R${c.adicional_por_aula}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Total a pagar</div>
                    <div className="text-sm font-bold text-gray-900">{fmt(total)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Fat. gerado</div>
                    <div className="text-sm">{fmt(fat)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Margem</div>
                    <div className={`text-sm font-semibold ${mrg >= 0 ? '' : 'text-danger-600'}`}>{fmt(mrg)}</div>
                  </div>
                </div>
                <div className="mt-2.5">
                  {isPago
                    ? <button className="btn btn-sm w-full">Recibo</button>
                    : <button onClick={() => setPagos(prev => new Set([...prev, c.id]))} className="btn btn-primary btn-sm w-full">Pagar</button>
                  }
                </div>
              </div>
            )
          })}
          <div className="pt-3 flex items-start justify-between gap-3 text-sm font-semibold">
            <span className="text-gray-900">Total</span>
            <div className="text-right">
              <div className="text-gray-900">{fmt(totalPagar)}</div>
              <div className="text-xs font-normal text-gray-400">Fat. gerado {fmt(coaches.reduce((s,c)=>s+c.valor_cliente_aula*aulasPorCoach(c.id),0))}</div>
            </div>
          </div>
        </div>

        <div className="hidden md:block overflow-x-auto">
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
