'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, Spinner } from '@/components/ui'
import { Search, Plus, ChevronRight, CheckCircle, Link, AlertTriangle, Clock } from 'lucide-react'

type Etapa = 'buscar_aluno' | 'escolher_treino' | 'registrando' | 'finalizado'

export default function CoachTreinoPage() {
  const { perfil } = useAuth()
  const [coach, setCoach] = useState<any>(null)
  const [etapa, setEtapa] = useState<Etapa>('buscar_aluno')
  const [loading, setLoading] = useState(true)

  const [busca, setBusca] = useState('')
  const [alunos, setAlunos] = useState<any[]>([])
  const [buscando, setBuscando] = useState(false)
  const [alunoSel, setAlunoSel] = useState<any>(null)
  const [showCadastro, setShowCadastro] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoCPF, setNovoCPF] = useState('')
  const [salvandoAluno, setSalvandoAluno] = useState(false)

  const [treinos, setTreinos] = useState<any[]>([])
  const [treinoSel, setTreinoSel] = useState<any>(null)
  const [aulaId, setAulaId] = useState<string | null>(null)

  const [exercicios, setExercicios] = useState<any[]>([])
  const [cargas, setCargas] = useState<Record<string, string[]>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [ultimasCargas, setUltimasCargas] = useState<Record<string, number>>({})

  // Timer da aula
  const [inicioAula, setInicioAula] = useState<Date | null>(null)
  const [fimSlot, setFimSlot] = useState<Date | null>(null)
  const [tempoRestante, setTempoRestante] = useState<number>(0) // segundos
  const [alertaAtivo, setAlertaAtivo] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const supabase = createClient()
  const mes = new Date().getMonth() + 1
  const ano = new Date().getFullYear()
  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long' })

  useEffect(() => {
    if (perfil?.id) loadCoach()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [perfil])

  // Timer countdown
  useEffect(() => {
    if (!fimSlot || etapa !== 'registrando') return
    timerRef.current = setInterval(() => {
      const agora = new Date()
      const diff = Math.floor((fimSlot.getTime() - agora.getTime()) / 1000)
      setTempoRestante(diff)
      setAlertaAtivo(diff <= 300 && diff > 0) // alerta nos últimos 5 min
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fimSlot, etapa])

  function calcularFimSlot(inicio: Date): Date {
    // Arredonda para o slot de 30min anterior (hora cheia ou meia hora)
    const minutos = inicio.getMinutes()
    const slotBase = new Date(inicio)
    if (minutos < 30) {
      slotBase.setMinutes(0, 0, 0)
    } else {
      slotBase.setMinutes(30, 0, 0)
    }
    // Fim = slotBase + 1 hora
    const fim = new Date(slotBase)
    fim.setHours(fim.getHours() + 1)
    return fim
  }

  function formatarTempo(segundos: number): string {
    if (segundos <= 0) return '00:00'
    const m = Math.floor(segundos / 60)
    const s = segundos % 60
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }

  async function loadCoach() {
    const { data } = await supabase.from('coaches').select('*').eq('user_id', perfil!.id).single()
    setCoach(data)
    setLoading(false)
  }

  async function buscarAlunos(q: string) {
    setBusca(q)
    if (q.length < 2) { setAlunos([]); return }
    setBuscando(true)
    const { data } = await supabase.from('alunos')
      .select('*')
      .or(`nome.ilike.%${q}%,cpf.ilike.%${q}%`)
      .limit(10)
    setAlunos(data || [])
    setBuscando(false)
  }

  async function cadastrarAluno() {
    if (!novoNome.trim()) return
    setSalvandoAluno(true)
    const { data } = await supabase.from('alunos').insert({
      nome: novoNome.trim(),
      cpf: novoCPF.trim() || null,
      cadastrado_por: coach?.id,
    }).select().single()
    if (data) await selecionarAluno(data)
    setSalvandoAluno(false)
    setShowCadastro(false)
  }

  async function selecionarAluno(aluno: any) {
    setAlunoSel(aluno)
    setBusca('')
    setAlunos([])
    const { data } = await supabase
      .from('treino_publicacoes')
      .select(`
        id, mes, ano, publicado,
        treinos (
          id, nome, descricao,
          treino_exercicios (
            id, exercicio_id, ordem, series_override, reps_override, descanso_override, observacoes_override, conjugado,
            exercicios ( id, nome, numero_maquina, observacoes )
          )
        )
      `)
      .eq('mes', mes)
      .eq('ano', ano)
      .eq('publicado', true)
    setTreinos(data || [])
    setEtapa('escolher_treino')
  }

  async function selecionarTreino(pub: any, alunoAtual: any) {
    setTreinoSel(pub)
    const exs = (pub.treinos?.treino_exercicios || [])
      .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
    setExercicios(exs)

    const cargasIniciais: Record<string, string[]> = {}
    for (const ex of exs) {
      const series = ex.series_override || 3
      cargasIniciais[ex.id] = Array(series).fill('')
    }
    setCargas(cargasIniciais)

    const { data: hist } = await supabase
      .from('registros_carga')
      .select('*, aulas!inner(aluno_id)')
      .eq('aulas.aluno_id', alunoAtual.id)

    const maxCargas: Record<string, number> = {}
    for (const r of (hist || [])) {
      const maq = r.maquina
      if (!maq) continue
      if (!maxCargas[maq] || r.carga_kg > maxCargas[maq]) maxCargas[maq] = r.carga_kg
    }
    setUltimasCargas(maxCargas)

    // Calcular timer do slot
    const agora = new Date()
    const fim = calcularFimSlot(agora)
    setInicioAula(agora)
    setFimSlot(fim)
    const diffInicial = Math.floor((fim.getTime() - agora.getTime()) / 1000)
    setTempoRestante(diffInicial)

    const { data: aula } = await supabase.from('aulas').insert({
      coach_id: coach.id,
      aluno_id: alunoAtual.id,
      treino_id: pub.treinos?.id,
      horario_agendado: agora.toISOString(),
      iniciada_em: agora.toISOString(),
      status: 'em_andamento',
    }).select().single()

    if (aula) setAulaId(aula.id)
    setEtapa('registrando')
  }

  async function salvarCarga(teId: string, serieIdx: number, valor: string) {
    const novas = [...(cargas[teId] || [])]
    novas[serieIdx] = valor
    setCargas(prev => ({ ...prev, [teId]: novas }))
    if (!aulaId || !valor) return
    const ex = exercicios.find(e => e.id === teId)
    if (!ex) return
    setSalvando(teId)
    const cargaNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(cargaNum)) { setSalvando(null); return }
    await supabase.from('registros_carga').upsert({
      aula_id: aulaId,
      exercicio_id: ex.exercicio_id,
      maquina: ex.exercicios?.numero_maquina || '',
      carga_kg: cargaNum,
      reps_realizadas: ex.reps_override || '12',
      observacoes: `Série ${serieIdx + 1}`,
    }, { onConflict: 'aula_id,exercicio_id,observacoes' })
    setSalvando(null)
  }

  async function finalizarAula() {
    if (!aulaId) return
    const agora = new Date()
    const foraPrazo = fimSlot ? agora > fimSlot : false
    await supabase.from('aulas').update({
      finalizada_em: agora.toISOString(),
      status: 'finalizada',
      observacoes: foraPrazo ? 'fora_do_prazo' : null,
    }).eq('id', aulaId)
    if (timerRef.current) clearInterval(timerRef.current)
    setEtapa('finalizado')
  }

  function resetar() {
    setEtapa('buscar_aluno')
    setAlunoSel(null)
    setTreinoSel(null)
    setAulaId(null)
    setExercicios([])
    setCargas({})
    setBusca('')
    setAlunos([])
    setNovoNome('')
    setNovoCPF('')
    setShowCadastro(false)
    setInicioAula(null)
    setFimSlot(null)
    setTempoRestante(0)
    setAlertaAtivo(false)
  }

  if (loading) return <Spinner />

  if (etapa === 'buscar_aluno') return (
    <div>
      <PageHeader title="Registrar aula" subtitle="Busque o aluno ou cadastre um novo" />
      <div className="max-w-lg">
        <div className="card mb-4">
          <label className="label">Buscar aluno por nome ou CPF</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-gray-400" />
            <input className="input pl-9" placeholder="Digite o nome ou CPF..."
              value={busca} onChange={e => buscarAlunos(e.target.value)} />
          </div>
          {buscando && <div className="text-xs text-gray-400 mt-2">Buscando...</div>}
          {alunos.length > 0 && (
            <div className="mt-2 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
              {alunos.map(a => (
                <button key={a.id} onClick={() => selecionarAluno(a)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                    {a.nome.slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{a.nome}</div>
                    {a.cpf && <div className="text-xs text-gray-400">{a.cpf}</div>}
                  </div>
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
          {busca.length >= 2 && alunos.length === 0 && !buscando && (
            <div className="text-sm text-gray-400 mt-3 text-center">Nenhum aluno encontrado.</div>
          )}
        </div>
        <button onClick={() => setShowCadastro(!showCadastro)} className="btn btn-sm gap-2 w-full">
          <Plus size={13} /> Cadastrar novo aluno
        </button>
        {showCadastro && (
          <div className="card mt-3">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Novo aluno</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Nome completo *</label>
                <input className="input" value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do aluno" />
              </div>
              <div>
                <label className="label">CPF</label>
                <input className="input" value={novoCPF} onChange={e => setNovoCPF(e.target.value)} placeholder="000.000.000-00 (opcional)" />
              </div>
              <button onClick={cadastrarAluno} disabled={salvandoAluno || !novoNome.trim()} className="btn btn-primary w-full">
                {salvandoAluno ? 'Cadastrando...' : 'Cadastrar e continuar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (etapa === 'escolher_treino') return (
    <div>
      <PageHeader title="Escolher treino" subtitle={`Aluno: ${alunoSel?.nome} · Treinos de ${mesNome}`} />
      <div className="max-w-lg space-y-3">
        {treinos.length === 0 && (
          <div className="card text-center py-8 text-gray-400 text-sm">
            Nenhum treino publicado para {mesNome}. Contate a coordenadora.
          </div>
        )}
        {treinos.map(pub => {
          const exs = pub.treinos?.treino_exercicios || []
          return (
            <button key={pub.id} onClick={() => selecionarTreino(pub, alunoSel)}
              className="card w-full text-left hover:border-primary-300 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-800 font-bold text-sm flex items-center justify-center flex-shrink-0">
                  {pub.treinos?.nome?.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900">{pub.treinos?.nome}</div>
                  {pub.treinos?.descricao && <div className="text-xs text-gray-400">{pub.treinos.descricao}</div>}
                  <div className="text-xs text-gray-400">{exs.length} exercícios</div>
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </div>
            </button>
          )
        })}
        <button onClick={() => setEtapa('buscar_aluno')} className="btn w-full text-sm">← Voltar</button>
      </div>
    </div>
  )

  if (etapa === 'registrando') {
    const itens: any[][] = []
    let i = 0
    while (i < exercicios.length) {
      if (exercicios[i].conjugado && exercicios[i+1]) {
        itens.push([exercicios[i], exercicios[i+1]])
        i += 2
      } else {
        itens.push([exercicios[i]])
        i++
      }
    }

    const foraPrazo = tempoRestante <= 0 && fimSlot !== null
    const corTimer = foraPrazo ? 'text-red-600' : alertaAtivo ? 'text-orange-500' : 'text-gray-500'

    return (
      <div>
        {/* Alerta 5 minutos */}
        {alertaAtivo && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-orange-500 text-white px-4 py-3 flex items-center gap-3 animate-pulse">
            <AlertTriangle size={18} />
            <span className="font-semibold text-sm">Atenção! Faltam {formatarTempo(tempoRestante)} para encerrar o slot desta aula!</span>
          </div>
        )}

        {/* Alerta fora do prazo */}
        {foraPrazo && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={18} />
            <span className="font-semibold text-sm">⚠️ Tempo do slot encerrado! Finalize a aula agora.</span>
          </div>
        )}

        <div className={`flex items-center justify-between mb-4 flex-wrap gap-2 ${alertaAtivo || foraPrazo ? 'mt-12' : ''}`}>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{treinoSel?.treinos?.nome}</h1>
            <p className="text-sm text-gray-400">{alunoSel?.nome}</p>
          </div>
          <div className="flex items-center gap-3">
            {fimSlot && (
              <div className={`flex items-center gap-1.5 text-sm font-mono font-semibold ${corTimer}`}>
                <Clock size={14} />
                {foraPrazo ? 'Fora do prazo' : formatarTempo(tempoRestante)}
              </div>
            )}
            <button onClick={finalizarAula} className="btn btn-primary gap-2">
              <CheckCircle size={14} /> Finalizar aula
            </button>
          </div>
        </div>

        <div className="space-y-4 max-w-2xl">
          {itens.map((grupo, gi) => {
            const isConj = grupo.length === 2
            return (
              <div key={gi} className={`rounded-xl overflow-hidden ${isConj ? 'border-2 border-primary-200' : 'border border-gray-100'}`}>
                {isConj && (
                  <div className="bg-primary-50 px-4 py-2 flex items-center gap-2">
                    <Link size={12} className="text-primary-600" />
                    <span className="text-xs font-semibold text-primary-700">CONJUGADO — faça os dois sem descanso, descanse após o par</span>
                  </div>
                )}
                {grupo.map((ex: any, exIdx: number) => {
                  const series = ex.series_override || 3
                  const reps = ex.reps_override || '12'
                  const maquina = ex.exercicios?.numero_maquina
                  const ultimaCarga = maquina ? ultimasCargas[maquina] : null
                  const cargasEx = cargas[ex.id] || Array(series).fill('')
                  const isUltimoConj = isConj && exIdx === 1

                  return (
                    <div key={ex.id} className={`p-4 bg-white ${isConj && exIdx === 0 ? 'border-b border-primary-100' : ''}`}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-800 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {isConj ? `${gi+1}${exIdx===0?'A':'B'}` : gi+1}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-gray-900">{ex.exercicios?.nome}</div>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            {maquina && (
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{maquina}</span>
                            )}
                            <span className="text-xs text-gray-400">{series} séries × {reps} reps</span>
                            {!isConj && ex.descanso_override && (
                              <span className="text-xs text-gray-400">· {ex.descanso_override}s descanso</span>
                            )}
                          </div>
                          {ultimaCarga && (
                            <div className="text-xs text-primary-600 mt-1 font-medium">
                              📊 Última carga máxima nesta máquina: {ultimaCarga}kg
                            </div>
                          )}
                          {ex.observacoes_override && (
                            <div className="text-xs text-gray-500 italic mt-1">📌 {ex.observacoes_override}</div>
                          )}
                          {ex.exercicios?.observacoes && (
                            <div className="text-xs text-gray-400 italic mt-0.5">💡 {ex.exercicios.observacoes}</div>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(series, 4)}, 1fr)` }}>
                        {Array.from({ length: series }).map((_, si) => (
                          <div key={si}>
                            <div className="text-xs text-gray-400 text-center mb-1">Série {si+1}</div>
                            <div className="relative">
                              <input
                                className="input text-center pr-7"
                                type="number"
                                step="0.5"
                                placeholder="0"
                                value={cargasEx[si] || ''}
                                onChange={e => salvarCarga(ex.id, si, e.target.value)}
                              />
                              <span className="absolute right-2 top-2.5 text-xs text-gray-400">kg</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {isUltimoConj && ex.descanso_override && (
                        <div className="mt-3 text-xs text-primary-700 bg-primary-50 px-3 py-2 rounded-lg text-center font-medium">
                          ⏱ Descanse {ex.descanso_override} segundos antes da próxima série do par
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          <button onClick={finalizarAula} className={`btn w-full gap-2 py-3 ${foraPrazo ? 'btn-danger' : 'btn-primary'}`}>
            <CheckCircle size={16} /> Finalizar aula
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto text-center py-12">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={32} className="text-green-600" />
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Aula finalizada! 🎉</h1>
      <p className="text-sm text-gray-400 mb-6">Treino de {alunoSel?.nome} registrado com sucesso.</p>
      <div className="flex gap-3 justify-center">
        <button onClick={resetar} className="btn btn-primary">Nova aula</button>
        <button onClick={() => window.location.href = '/coach/painel'} className="btn">Ir ao painel</button>
      </div>
    </div>
  )
}
