'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'

export default function CoachHistoricoPage() {
  const { perfil } = useAuth()
  const [coach, setCoach] = useState<any>(null)
  const [aulas, setAulas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [alunoFiltro, setAlunoFiltro] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (perfil?.id) loadData()
  }, [perfil])

  async function loadData() {
    const { data: coachData } = await supabase
      .from('coaches').select('*').eq('user_id', perfil!.id).single()
    if (!coachData) { setLoading(false); return }
    setCoach(coachData)

    const { data } = await supabase
      .from('aulas')
      .select(`
        id, status, iniciada_em, finalizada_em,
        alunos ( id, nome ),
        treinos ( nome ),
        registros_carga ( id, maquina, carga_kg, reps_realizadas, observacoes,
          exercicios ( nome )
        )
      `)
      .eq('coach_id', coachData.id)
      .eq('status', 'finalizada')
      .order('finalizada_em', { ascending: false })
      .limit(50)

    setAulas(data || [])
    setLoading(false)
  }

  const aulasFiltradas = alunoFiltro
    ? aulas.filter(a => a.alunos?.nome?.toLowerCase().includes(alunoFiltro.toLowerCase()))
    : aulas

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Histórico de aulas" subtitle="Suas aulas registradas e cargas por aluno" />

      <div className="mb-4 max-w-sm">
        <input
          className="input"
          placeholder="Filtrar por nome do aluno..."
          value={alunoFiltro}
          onChange={e => setAlunoFiltro(e.target.value)}
        />
      </div>

      {aulasFiltradas.length === 0 && (
        <EmptyState message="Nenhuma aula finalizada ainda." />
      )}

      <div className="space-y-4 max-w-2xl">
        {aulasFiltradas.map(aula => (
          <div key={aula.id} className="card">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-semibold text-sm text-gray-900">{aula.alunos?.nome}</div>
                <div className="text-xs text-gray-400">
                  {aula.treinos?.nome} · {new Date(aula.finalizada_em).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                {aula.registros_carga?.length || 0} registros
              </span>
            </div>

            {(aula.registros_carga || []).length > 0 && (
              <div className="divide-y divide-gray-50">
                {(aula.registros_carga || []).map((r: any) => (
                  <div key={r.id} className="py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800">{r.exercicios?.nome}</div>
                      {r.maquina && <div className="text-xs text-blue-500">{r.maquina}</div>}
                      {r.observacoes && <div className="text-xs text-gray-400">{r.observacoes}</div>}
                    </div>
                    <div className="text-sm font-bold text-primary-700 flex-shrink-0">
                      {r.carga_kg}kg
                    </div>
                    <div className="text-xs text-gray-400 flex-shrink-0">
                      {r.reps_realizadas} reps
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
