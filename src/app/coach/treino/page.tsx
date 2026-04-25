'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Aluno, Treino, TreinoExercicio, Aula, RegistroCarga } from '@/types'
import { PageHeader, Spinner, AutosaveBar, EmptyState } from '@/components/ui'
import { Search } from 'lucide-react'

export default function CoachTreinoPage() {
  const { user } = useAuth()
  const supabase = createClient()

  const [coachId, setCoachId] = useState<string | null>(null)
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [treinos, setTreinos] = useState<Treino[]>([])
  const [busca, setBusca] = useState('')
  const [alunoSel, setAlunoSel] = useState<Aluno | null>(null)
  const [treinoSel, setTreinoSel] = useState<Treino | null>(null)
  const [exercicios, setExercicios] = useState<TreinoExercicio[]>([])
  const [aula, setAula] = useState<Aula | null>(null)
  const [cargas, setCargas] = useState<Record<string, Partial<RegistroCarga>>>({})
  const [historico, setHistorico] = useState<Record<string, any>>({})
  const [autosave, setAutosave] = useState<'idle'|'saving'|'saved'>('idle')
  const [loading, setLoading] = useState(true)
  const timers = useRef<Record<string, any>>({})

  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()

  useEffect(() => {
    if (!user) return
    async function init() {
      // Buscar coach
      const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user!.id).single()
      if (!coach) return
      setCoachId(coach.id)

      // Buscar alunos e treinos do mês
      const [{ data: al }, { data: tr }] = await Promise.all([
        supabase.from('alunos').select('*').eq('ativo', true).order('nome'),
        supabase.from('treinos').select('*').eq('mes', mes).eq('ano', ano).eq('publicado', true).order('nome'),
      ])
      setAlunos(al || [])
      setTreinos(tr || [])
      setLoading(false)
    }
    init()
  }, [user])

  async function selecionarTreino(treino: Treino) {
    setTreinoSel(treino)
    const { data } = await supabase
      .from('treino_exercicios')
      .select('*, exercicios(*, categorias(nome))')
      .eq('treino_id', treino.id)
      .order('ordem')
    setExercicios(data || [])

    // Buscar histórico de cargas do aluno por máquina
    if (alunoSel) {
      const { data: hist } = await supabase
        .from('historico_maquina')
        .select('*')
        .eq('aluno_id', alunoSel.id)
        .limit(100)
      const map: Record<string, any> = {}
      ;(hist || []).forEach((h: any) => {
        const key = `${h.exercicio_id}_${h.maquina || 'livre'}`
        if (!map[key]) map[key] = h
      })
      setHistorico(map)
    }
  }

  async function iniciarAula() {
    if (!coachId || !alunoSel || !treinoSel) return
    const { data } = await supabase.from('aulas').insert({
      coach_id: coachId,
      aluno_id: alunoSel.id,
      treino_id: treinoSel.id,
      horario_agendado: new Date().toISOString(),
      iniciada_em: new Date().toISOString(),
      status: 'em_andamento',
    }).select().single()
    setAula(data)
  }

  function atualizarCarga(exId: string, field: string, value: string) {
    setCargas(prev => ({ ...prev, [exId]: { ...prev[exId], [field]: value } }))
    // Autosave debounced
    clearTimeout(timers.current[exId])
    setAutosave('saving')
    timers.current[exId] = setTimeout(() => salvarCarga(exId, { ...cargas[exId], [field]: value }), 900)
  }

  async function salvarCarga(exId: string, dados: Partial<RegistroCarga>) {
    if (!aula) return
    const ex = exercicios.find(e => e.exercicio_id === exId)
    const maquina = ex?.exercicios?.numero_maquina || null

    const payload = {
      aula_id: aula.id,
      exercicio_id: exId,
      maquina,
      carga_kg: dados.carga_kg ? Number(dados.carga_kg) : null,
      reps_realizadas: dados.reps_realizadas || null,
      observacoes: dados.observacoes || null,
      salvo_em: new Date().toISOString(),
    }

    // Upsert por aula + exercicio
    await supabase.from('registros_carga')
      .upsert(payload, { onConflict: 'aula_id,exercicio_id' })

    setAutosave('saved')
    setTimeout(() => setAutosave('idle'), 2000)
  }

  async function finalizarAula() {
    if (!aula) return
    await supabase.from('aulas').update({ status: 'finalizada', finalizada_em: new Date().toISOString() }).eq('id', aula.id)
    alert('Aula finalizada com sucesso!')
    setAula(null); setAlunoSel(null); setTreinoSel(null); setExercicios([]); setCargas({})
  }

  const alunosFiltrados = alunos.filter(a =>
    a.nome.toLowerCase().includes(busca.toLowerCase()) || a.cpf.includes(busca)
  )

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Registrar aula" subtitle={aula ? `Em andamento desde ${new Date(aula.iniciada_em!).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}` : 'Selecione o aluno e o treino'} />

      <AutosaveBar status={autosave} />

      {/* Etapa 1: Selecionar aluno */}
      {!alunoSel && (
        <div className="card mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Selecionar aluno</h2>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-8" placeholder="Nome ou CPF..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alunosFiltrados.length === 0 && <EmptyState message="Nenhum aluno encontrado." />}
            {alunosFiltrados.map(a => (
              <button key={a.id} onClick={() => { setAlunoSel(a); setBusca('') }}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-primary-50 hover:border-primary-200 border border-transparent text-left transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center">
                  {a.nome.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{a.nome}</div>
                  <div className="text-xs text-gray-400">CPF {a.cpf}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Etapa 2: Aluno selecionado, escolher treino */}
      {alunoSel && !aula && (
        <>
          <div className="flex items-center gap-3 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-primary-200 text-primary-900 text-sm font-semibold flex items-center justify-center">{alunoSel.nome.slice(0,2).toUpperCase()}</div>
            <div className="flex-1">
              <div className="font-medium text-primary-900 text-sm">{alunoSel.nome}</div>
              <div className="text-xs text-primary-600">CPF {alunoSel.cpf}</div>
            </div>
            <button onClick={() => { setAlunoSel(null); setTreinoSel(null) }} className="text-xs text-primary-600 hover:underline">Trocar</button>
          </div>

          <div className="card mb-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Treino do dia</h2>
            <div className="flex flex-wrap gap-2">
              {treinos.map(t => (
                <button key={t.id} onClick={() => selecionarTreino(t)}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${treinoSel?.id === t.id ? 'bg-primary-400 text-white border-primary-400' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-primary-300'}`}>
                  {t.nome}
                  {t.descricao && <span className="text-xs opacity-70 ml-1">— {t.descricao}</span>}
                </button>
              ))}
            </div>
          </div>

          {treinoSel && (
            <button onClick={iniciarAula} className="btn btn-primary w-full mb-4">
              Iniciar aula — {treinoSel.nome}
            </button>
          )}
        </>
      )}

      {/* Etapa 3: Aula em andamento - registrar cargas */}
      {aula && (
        <>
          <div className="flex items-center justify-between bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 mb-4">
            <div>
              <div className="font-medium text-primary-900 text-sm">{alunoSel?.nome} · {treinoSel?.nome}</div>
              <div className="text-xs text-primary-600">{treinoSel?.descricao}</div>
            </div>
            <button onClick={finalizarAula} className="btn btn-primary btn-sm">Finalizar aula</button>
          </div>

          <div className="space-y-4">
            {exercicios.map(te => {
              const ex = te.exercicios!
              const maq = ex.numero_maquina
              const histKey = `${ex.id}_${maq || 'livre'}`
              const ultCarga = historico[histKey]
              const carga = cargas[te.exercicio_id] || {}

              return (
                <div key={te.id} className="card border-l-4 border-l-primary-200">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{ex.nome}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {te.series_override || ex.series_padrao}× · {te.reps_override || ex.reps_padrao} reps · {te.descanso_override || ex.descanso_segundos}s descanso
                      </div>
                      {maq && <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Máquina {maq}</span>}
                    </div>
                  </div>

                  {ultCarga && (
                    <div className="text-xs text-primary-700 bg-primary-50 rounded-lg px-3 py-1.5 mb-3">
                      Última carga nesta máquina: <strong>{ultCarga.carga_kg} kg</strong> · {new Date(ultCarga.data_aula).toLocaleDateString('pt-BR')}
                    </div>
                  )}

                  {(te.observacoes_override || ex.observacoes) && (
                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5 mb-3 italic">
                      📌 {te.observacoes_override || ex.observacoes}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="label">Carga (kg)</label>
                      <input className="input text-center" type="number" step="0.5"
                        placeholder={ultCarga?.carga_kg ? String(ultCarga.carga_kg) : 'kg'}
                        value={carga.carga_kg || ''}
                        onChange={e => atualizarCarga(te.exercicio_id, 'carga_kg', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Reps realizadas</label>
                      <input className="input text-center"
                        placeholder={te.reps_override || ex.reps_padrao}
                        value={carga.reps_realizadas || ''}
                        onChange={e => atualizarCarga(te.exercicio_id, 'reps_realizadas', e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Observações</label>
                    <textarea className="input resize-none" rows={2} placeholder="Ex: aluno sentiu dor, adaptou exercício..."
                      value={carga.observacoes || ''}
                      onChange={e => atualizarCarga(te.exercicio_id, 'observacoes', e.target.value)} />
                  </div>
                </div>
              )
            })}
          </div>

          <button onClick={finalizarAula} className="btn btn-primary w-full mt-4">
            Finalizar aula
          </button>
        </>
      )}
    </div>
  )
}
