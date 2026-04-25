'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner } from '@/components/ui'

export default function FrequenciaPage() {
  const [dados, setDados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()

  useEffect(() => {
    async function load() {
      const inicioMes = `${ano}-${String(mes).padStart(2,'0')}-01`
      const { data } = await supabase
        .from('aulas')
        .select('aluno_id, alunos(nome, cpf), coaches(nome)')
        .gte('horario_agendado', inicioMes)
        .eq('status', 'finalizada')
      // Agrupar por aluno
      const map: Record<string, any> = {}
      ;(data || []).forEach((a: any) => {
        if (!map[a.aluno_id]) map[a.aluno_id] = { aluno: a.alunos, coaches: new Set(), aulas: 0 }
        map[a.aluno_id].aulas++
        map[a.aluno_id].coaches.add(a.coaches?.nome)
      })
      const sorted = Object.values(map).sort((a: any, b: any) => b.aulas - a.aulas)
      setDados(sorted)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Frequência de alunos" subtitle={`${new Date(ano, mes-1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`} />
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-3 pr-3">#</th>
                <th className="text-left pb-3 pr-3">Aluno</th>
                <th className="text-left pb-3 pr-3">CPF</th>
                <th className="text-right pb-3 pr-3">Aulas</th>
                <th className="text-left pb-3">Coaches</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dados.map((d: any, i) => (
                <tr key={i}>
                  <td className="py-2.5 pr-3 text-gray-400 text-xs">{i+1}</td>
                  <td className="py-2.5 pr-3 font-medium text-gray-900">{d.aluno?.nome}</td>
                  <td className="py-2.5 pr-3 text-xs text-gray-400">{d.aluno?.cpf}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-primary-700">{d.aulas}</td>
                  <td className="py-2.5 text-xs text-gray-500">{[...d.coaches].join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dados.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Nenhum dado encontrado para este mês.</div>}
        </div>
      </div>
    </div>
  )
}
