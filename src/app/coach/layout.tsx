'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { ArrowLeft } from 'lucide-react'

export default function AlunoHistoricoPage() {
  const { id } = useParams()
  const router = useRouter()
  const [aluno, setAluno] = useState<any>(null)
  const [aulas, setAulas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (id) loadData()
  }, [id])

  async function loadData() {
    const [{ data: alunoData }, { data: aulasData }] = await Promise.all([
      supabase.from('alunos').select('*').eq('id', id).single(),
      supabase.from('aulas')
        .select(`
          id, finalizada_em, observacoes,
          treinos ( nome, descricao ),
          registros_carga (
            id, carga_kg, reps_realizadas, observacoes,
            exercicios ( nome, numero_maquina )
          )
        `)
        .eq('aluno_id', id)
        .eq('status', 'finalizada')
        .order('finalizada_em', { ascending: false })
        .limit(30)
    ])
    setAluno(alunoData)
    setAulas(aulasData || [])
    setLoading(false)
  }

  if (loading) return <Spinner />

  return (
    <div>
      <button onClick={() => router.back()} className="btn btn-sm gap-1 mb-4">
        <ArrowLeft size={13} /> Voltar
      </button>

      <PageHeader
        title={aluno?.nome || 'Aluno'}
        subtitle={`Histórico completo de treinos · ${aulas.length} aulas registradas`}
      />

      {aluno?.observacoes && (
        <div className="card mb-4 bg-yellow-50 border-yellow-200 max-w-2xl">
          <div className="text-xs font-semibold text-yellow-800 mb-1">⚠️ Observações do aluno</div>
          <div className="text-sm text-yellow-800">{aluno.observacoes}</div>
        </div>
      )}

      {aulas.length === 0 && <EmptyState message="Nenhuma aula registrada ainda." />}

      <div className="space-y-3 max-w-2xl">
        {aulas.map(aula => {
          const isOpen = expandido === aula.id
          const foraPrazo = aula.observacoes === 'fora_do_prazo'

          const porExercicio: Record<string, any> = {}
          for (const r of (aula.registros_carga || [])) {
            const nome = r.exercicios?.nome || 'Exercício'
            if (!porExercicio[nome]) {
              porExercicio[nome] = {
                nome,
                maquina: r.exercicios?.numero_maquina || '',
                series: []
              }
            }
            const match = (r.observacoes || '').match(/Série (\d+)/)
            const serieNum = match ? parseInt(match[1]) : porExercicio[nome].series.length + 1
            porExercicio[nome].series.push({ serie: serieNum, carga: r.carga_kg, reps: r.reps_realizadas })
          }
          Object.values(porExercicio).forEach((ex: any) => {
            ex.series.sort((a: any, b: any) => a.serie - b.serie)
          })
          const exerciciosList = Object.values(porExercicio)

          return (
            <div key={aula.id} className={`card cursor-pointer ${foraPrazo ? 'border-red-200' : ''}`}
              onClick={() => setExpandido(isOpen ? null : aula.id)}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{aula.treinos?.nome}</span>
                    {aula.treinos?.descricao && (
                      <span className="text-xs text-gray-400">— {aula.treinos.descricao}</span>
                    )}
                    {foraPrazo && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Fora do prazo</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(aula.finalizada_em).toLocaleDateString('pt-BR', {
                      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded-full">
                    {exerciciosList.length} exercícios
                  </span>
                  <span className="text-gray-300">{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                  {exerciciosList.map((ex: any) => {
                    const cargaMax = Math.max(...ex.series.map((s: any) => s.carga))
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
                          {ex.series.map((s: any) => (
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
