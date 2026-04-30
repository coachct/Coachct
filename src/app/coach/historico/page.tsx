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
  const [expandido, setExpandido] = useState<string | null>(null)
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
        id, status, iniciada_em, finalizada_em, observacoes,
        alunos ( id, nome ),
        treinos ( nome ),
        registros_carga (
          id, maquina, carga_kg, reps_realizadas, observacoes,
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
      <PageHeader title="Histórico de aulas" subtitle="Suas aulas registradas com cargas por série" />

      <div className="mb-4 max-w-sm">
        <input className="input" placeholder="Filtrar por nome do aluno..."
          value={alunoFiltro} onChange={e => setAlunoFiltro(e.target.value)} />
      </div>

      {aulasFiltradas.length === 0 && <EmptyState message="Nenhuma aula finalizada ainda." />}

      <div className="space-y-3 max-w-2xl">
        {aulasFiltradas.map(aula => {
          const isOpen = expandido === aula.id
          const foraPrazo = aula.observacoes === 'fora_do_prazo'

          // Agrupa registros por exercício
          const porExercicio: Record<string, { nome: string; maquina: string; series: { serie: number; carga: number; reps: string }[] }> = {}
          for (const r of (aula.registros_carga || [])) {
            const exNome = r.exercicios?.nome || 'Exercício'
            if (!porExercicio[exNome]) {
              porExercicio[exNome] = { nome: exNome, maquina: r.maquina || '', series: [] }
            }
            const match = (r.observacoes || '').match(/Série (\d+)/)
            const serieNum = match ? parseInt(match[1]) : porExercicio[exNome].series.length + 1
            porExercicio[exNome].series.push({ serie: serieNum, carga: r.carga_kg, reps: r.reps_realizadas })
          }
          // Ordena séries
          Object.values(porExercicio).forEach(ex => {
            ex.series.sort((a, b) => a.serie - b.serie)
          })
          const exerciciosList = Object.values(porExercicio)
          const totalRegistros = aula.registros_carga?.length || 0

          return (
            <div key={aula.id} className={`card ${foraPrazo ? 'border-red-200' : ''}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap"
                onClick={() => setExpandido(isOpen ? null : aula.id)}
                style={{ cursor: 'pointer' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{aula.alunos?.nome}</span>
                    {foraPrazo && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Fora do prazo</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {aula.treinos?.nome} · {new Date(aula.finalizada_em).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded-full font-medium">
                    {exerciciosList.length} exercícios · {totalRegistros} séries
                  </span>
                  <span className="text-gray-300 text-sm">{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {isOpen && exerciciosList.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                  {exerciciosList.map(ex => {
                    const cargaMax = Math.max(...ex.series.map(s => s.carga))
                    return (
                      <div key={ex.nome}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-gray-900">{ex.nome}</span>
                          {ex.maquina && (
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{ex.maquina}</span>
                          )}
                          <span className="text-xs text-primary-600 font-semibold ml-auto">máx {cargaMax}kg</span>
                        </div>
                        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(ex.series.length, 4)}, 1fr)` }}>
                          {ex.series.map(s => (
                            <div key={s.serie} className={`rounded-lg px-2 py-2 text-center ${s.carga === cargaMax ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'}`}>
                              <div className="text-xs text-gray-400">Série {s.serie}</div>
                              <div className={`text-sm font-bold ${s.carga === cargaMax ? 'text-primary-700' : 'text-gray-700'}`}>
                                {s.carga}kg
                              </div>
                              <div className="text-xs text-gray-400">{s.reps} reps</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {isOpen && exerciciosList.length === 0 && (
                <div className="mt-3 text-xs text-gray-400 italic text-center">Nenhuma carga registrada nesta aula.</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
