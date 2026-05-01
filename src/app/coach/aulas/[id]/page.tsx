'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageHeader, Spinner } from '@/components/ui'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'

export default function EditarAulaPage() {
  const { id } = useParams()
  const router = useRouter()
  const [aula, setAula] = useState<any>(null)
  const [cargas, setCargas] = useState<Record<string, string[]>>({})
  const [obs, setObs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (id) loadAula()
  }, [id])

  async function loadAula() {
    const res = await fetch(`/api/aulas?aula_detalhe=1&aula_id=${id}`)
    const json = await res.json()
    const data = json.data
    setAula(data)

    // monta estado inicial das cargas
    const exs = (data?.treinos?.treino_exercicios || [])
      .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))

    const cargasIniciais: Record<string, string[]> = {}
    const obsIniciais: Record<string, string> = {}

    for (const ex of exs) {
      const series = ex.series_override || 3
      cargasIniciais[ex.id] = Array(series).fill('')

      for (const r of (data?.registros_carga || [])) {
        if (r.exercicio_id === ex.exercicio_id) {
          const match = (r.observacoes || '').match(/Série (\d+)/)
          if (match) {
            const idx = parseInt(match[1]) - 1
            if (!cargasIniciais[ex.id]) cargasIniciais[ex.id] = Array(series).fill('')
            cargasIniciais[ex.id][idx] = String(r.carga_kg)
          }
        }
      }
      obsIniciais[ex.id] = ex.observacoes_override || ''
    }

    setCargas(cargasIniciais)
    setObs(obsIniciais)
    setLoading(false)
  }

  function getPermissao(): 'cancelar' | 'editar' | 'bloqueado' {
    if (!aula) return 'bloqueado'
    const iniciada = new Date(aula.iniciada_em)
    const finalizada = new Date(aula.finalizada_em)
    const agora = new Date()
    const minDesdeInicio = (agora.getTime() - iniciada.getTime()) / (1000 * 60)
    const minDesdeFinalizacao = (agora.getTime() - finalizada.getTime()) / (1000 * 60)

    if (minDesdeInicio <= 5) return 'cancelar'
    if (minDesdeFinalizacao <= 60) return 'editar'
    return 'bloqueado'
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      const exs = (aula?.treinos?.treino_exercicios || [])
        .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))

      const registros: any[] = []
      for (const ex of exs) {
        const series = ex.series_override || 3
        for (let si = 0; si < series; si++) {
          const val = cargas[ex.id]?.[si]
          if (!val) continue
          const cargaNum = parseFloat(val.replace(',', '.'))
          if (isNaN(cargaNum)) continue
          registros.push({
            exercicio_id: ex.exercicio_id,
            carga_kg: cargaNum,
            reps_realizadas: ex.reps_override || '12',
            observacoes: `Série ${si + 1}`,
            maquina: ex.exercicios?.numero_maquina || '',
          })
        }
      }

      await fetch('/api/aulas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, registros_carga: registros })
      })

      router.back()
    } catch (e) {
      setErro('Erro ao salvar. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  async function cancelarAula() {
    if (!confirm('Cancelar esta aula? Ela será removida do histórico.')) return
    setCancelando(true)
    await fetch('/api/aulas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        status: 'cancelada',
        observacoes: 'cancelada_pelo_coach',
      })
    })
    router.push('/coach/painel')
  }

  if (loading) return <Spinner />

  if (!aula) return (
    <div className="text-center py-12 text-gray-400">Aula não encontrada.</div>
  )

  const permissao = getPermissao()
  const exs = (aula?.treinos?.treino_exercicios || [])
    .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))

  return (
    <div>
      <button onClick={() => router.back()} className="btn btn-sm gap-1 mb-4">
        <ArrowLeft size={13} /> Voltar
      </button>

      <PageHeader
        title="Editar aula"
        subtitle={`${aula.alunos?.nome} · ${aula.treinos?.nome}`}
      />

      {/* Status da permissão */}
      {permissao === 'bloqueado' && (
        <div className="card mb-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700 font-medium">
            ⛔ Edição bloqueada — passou mais de 1 hora desde o término da aula.
          </p>
        </div>
      )}
      {permissao === 'cancelar' && (
        <div className="card mb-4 bg-orange-50 border-orange-200">
          <p className="text-sm text-orange-700 font-medium mb-2">
            ⚠️ Aula iniciada há menos de 5 minutos — você pode cancelá-la completamente ou editar as cargas.
          </p>
          <button
            onClick={cancelarAula}
            disabled={cancelando}
            className="btn btn-sm text-red-500 hover:bg-red-50 gap-1"
          >
            <Trash2 size={12} /> {cancelando ? 'Cancelando...' : 'Cancelar esta aula'}
          </button>
        </div>
      )}
      {permissao === 'editar' && (
        <div className="card mb-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-700">
            ✏️ Você pode editar as cargas desta aula por até 1 hora após o término.
          </p>
        </div>
      )}

      {erro && (
        <div className="card mb-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      {/* Exercícios */}
      <div className="space-y-4 max-w-2xl">
        {exs.map((ex: any) => {
          const series = ex.series_override || 3
          const reps = ex.reps_override || '12'
          const maquina = ex.exercicios?.numero_maquina
          const cargasEx = cargas[ex.id] || Array(series).fill('')

          return (
            <div key={ex.id} className="card">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="font-semibold text-sm text-gray-900">{ex.exercicios?.nome}</span>
                {maquina && (
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{maquina}</span>
                )}
                <span className="text-xs text-gray-400 ml-auto">{series} séries × {reps} reps</span>
              </div>

              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(series, 4)}, 1fr)` }}>
                {Array.from({ length: series }).map((_, si) => (
                  <div key={si}>
                    <div className="text-xs text-gray-400 text-center mb-1">Série {si + 1}</div>
                    <div className="relative">
                      <input
                        className="input text-center pr-7"
                        type="number"
                        step="0.5"
                        placeholder="0"
                        disabled={permissao === 'bloqueado'}
                        value={cargasEx[si] || ''}
                        onChange={e => {
                          const novas = [...(cargas[ex.id] || Array(series).fill(''))]
                          novas[si] = e.target.value
                          setCargas(prev => ({ ...prev, [ex.id]: novas }))
                        }}
                      />
                      <span className="absolute right-2 top-2.5 text-xs text-gray-400">kg</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {permissao !== 'bloqueado' && (
          <button
            onClick={salvar}
            disabled={salvando}
            className="btn btn-primary w-full gap-2 py-3"
          >
            <Save size={16} />
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        )}
      </div>
    </div>
  )
}
