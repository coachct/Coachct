'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, Spinner } from '@/components/ui'
import { Search, Plus, ChevronRight, CheckCircle, Link, AlertTriangle, Clock } from 'lucide-react'

type Etapa = 'buscar_aluno' | 'escolher_treino' | 'registrando' | 'finalizado'

interface Insight {
  icon: string
  titulo: string
  descricao: string
  cor: 'green' | 'blue' | 'orange' | 'red' | 'purple'
}

function gerarUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

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
  const aulaIdRef = useRef<string | null>(null)

  const [exercicios, setExercicios] = useState<any[]>([])
  const [cargas, setCargas] = useState<Record<string, string[]>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [ultimasCargas, setUltimasCargas] = useState<Record<string, number>>({})

  const [fimSlot, setFimSlot] = useState<Date | null>(null)
  const [tempoRestante, setTempoRestante] = useState<number>(0)
  const [alertaAtivo, setAlertaAtivo] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [insights, setInsights] = useState<Insight[]>([])
  const [loadingInsights, setLoadingInsights] = useState(false)

  // ✅ ref para controlar duplo disparo do finalizar
  const finalizandoRef = useRef(false)

  const supabase = createClient()
  const now = new Date()
  const mesNome = now.toLocaleDateString('pt-BR', { month: 'long' })

  useEffect(() => {
    if (perfil?.id) loadCoach()
    const timeout = setTimeout(() => setLoading(false), 5000)
    return () => {
      clearTimeout(timeout)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [perfil])

  useEffect(() => {
    if (!fimSlot || etapa !== 'registrando') return
    timerRef.current = setInterval(() => {
      const agora = new Date()
      const diff = Math.floor((fimSlot.getTime() - agora.getTime()) / 1000)
      setTempoRestante(diff)
      setAlertaAtivo(diff <= 300 && diff > 0)
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fimSlot, etapa])

  function calcularFimSlot(inicio: Date): Date {
    const minutos = inicio.getMinutes()
    const slot = new Date(inicio)
    slot.setSeconds(0, 0)
    if (minutos >= 45) {
      slot.setMinutes(0)
      slot.setHours(slot.getHours() + 1)
    } else if (minutos >= 15) {
      slot.setMinutes(30)
    } else {
      slot.setMinutes(0)
    }
    const fim = new Date(slot)
    fim.setMinutes(fim.getMinutes() + 55)
    return fim
  }

  function formatarTempo(segundos: number): string {
    if (segundos <= 0) return '00:00'
    const m = Math.floor(segundos / 60)
    const s = segundos % 60
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }

  async function buscarUltimasCargas(alunoId: string) {
    const { data: hist } = await supabase
      .from('registros_carga')
      .select('exercicio_id, carga_kg, aulas!inner(aluno_id)')
      .eq('aulas.aluno_id', alunoId)
    const maxCargas: Record<string, number> = {}
    for (const r of (hist || [])) {
      if (!r.exercicio_id) continue
      if (!maxCargas[r.exercicio_id] || r.carga_kg > maxCargas[r.exercicio_id])
        maxCargas[r.exercicio_id] = r.carga_kg
    }
    return maxCargas
  }

  async function loadCoach() {
    try {
      const { data: coachData } = await supabase
        .from('coaches').select('*').eq('user_id', perfil!.id).maybeSingle()
      if (!coachData) return
      setCoach(coachData)

      const { data: aulaPendente } = await supabase
        .from('aulas')
        .select(`*, alunos(id, nome, cpf), treinos(id, nome, descricao,
          treino_exercicios(id, exercicio_id, ordem, series_override, reps_override, descanso_override, observacoes_override, conjugado,
            exercicios(id, nome, numero_maquina, observacoes)))`)
        .eq('coach_id', coachData.id)
        .eq('status', 'em_andamento')
        .order('iniciada_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (aulaPendente) {
        await continuarAula(aulaPendente)
        return
      }
    } catch (err) {
      console.error('Erro ao carregar coach:', err)
    } finally {
      setLoading(false)
    }
  }

  async function continuarAula(aula: any) {
    setAlunoSel(aula.alunos)
    setTreinoSel({ treinos: aula.treinos })
    const exs = (aula.treinos?.treino_exercicios || [])
      .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
    setExercicios(exs)

    const cargasIniciais: Record<string, string[]> = {}
    for (const ex of exs) {
      cargasIniciais[ex.id] = Array(ex.series_override || 3).fill('')
    }

    const { data: registros } = await supabase
      .from('registros_carga').select('*').eq('aula_id', aula.id)

    for (const r of (registros || [])) {
      const ex = exs.find((e: any) => e.exercicio_id === r.exercicio_id)
      if (!ex) continue
      const match = (r.observacoes || '').match(/Série (\d+)/)
      if (match) {
        const idx = parseInt(match[1]) - 1
        if (!cargasIniciais[ex.id]) cargasIniciais[ex.id] = Array(ex.series_override || 3).fill('')
        cargasIniciais[ex.id][idx] = String(r.carga_kg)
      }
    }
    setCargas(cargasIniciais)

    const maxCargas = await buscarUltimasCargas(aula.alunos?.id)
    setUltimasCargas(maxCargas)

    const inicio = new Date(aula.iniciada_em)
    const fim = calcularFimSlot(inicio)
    setFimSlot(fim)
    setTempoRestante(Math.floor((fim.getTime() - new Date().getTime()) / 1000))
    aulaIdRef.current = aula.id
    setAulaId(aula.id)
    setEtapa('registrando')
  }

  async function buscarAlunos(q: string) {
    setBusca(q)
    if (q.length < 2) { setAlunos([]); return }
    setBuscando(true)
    const { data } = await supabase.from('alunos')
      .select('*').or(`nome.ilike.%${q}%,cpf.ilike.%${q}%`).limit(10)
    setAlunos(data || [])
    setBuscando(false)
  }

  async function cadastrarAluno() {
    if (!novoNome.trim()) return
    setSalvandoAluno(true)
    const { data } = await supabase.from('alunos').insert({
      nome: novoNome.trim(), cpf: novoCPF.trim() || null, cadastrado_por: coach?.id,
    }).select().maybeSingle()
    if (data) await selecionarAluno(data)
    setSalvandoAluno(false)
    setShowCadastro(false)
  }

  async function selecionarAluno(aluno: any) {
    setAlunoSel(aluno)
    setBusca('')
    setAlunos([])
    const agora = new Date()
    const mesAtual = agora.getMonth() + 1
    const anoAtual = agora.getFullYear()
    const { data } = await supabase
      .from('treino_publicacoes')
      .select(`id, mes, ano, publicado, treinos(id, nome, descricao,
        treino_exercicios(id, exercicio_id, ordem, series_override, reps_override, descanso_override, observacoes_override, conjugado,
          exercicios(id, nome, numero_maquina, observacoes)))`)
      .eq('mes', mesAtual).eq('ano', anoAtual).eq('publicado', true)
    const ordenado = (data || []).sort((a: any, b: any) =>
      (a.treinos?.nome || '').localeCompare(b.treinos?.nome || '', 'pt-BR')
    )
    setTreinos(ordenado)
    setEtapa('escolher_treino')
  }

  async function selecionarTreino(pub: any, alunoAtual: any) {
    const exs = (pub.treinos?.treino_exercicios || [])
      .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))

    const cargasIniciais: Record<string, string[]> = {}
    for (const ex of exs) {
      cargasIniciais[ex.id] = Array(ex.series_override || 3).fill('')
    }

    const agora = new Date()
    const fim = calcularFimSlot(agora)

    const novoAulaId = gerarUUID()
    aulaIdRef.current = novoAulaId
    setAulaId(novoAulaId)

    setTreinoSel(pub)
    setExercicios(exs)
    setCargas(cargasIniciais)
    setFimSlot(fim)
    setTempoRestante(Math.floor((fim.getTime() - agora.getTime()) / 1000))
    setEtapa('registrando')

    const [maxCargas] = await Promise.all([
      buscarUltimasCargas(alunoAtual.id),
      fetch('/api/aulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: novoAulaId,
          coach_id: coach.id,
          aluno_id: alunoAtual.id,
          treino_id: pub.treinos?.id,
          horario_agendado: agora.toISOString(),
          iniciada_em: agora.toISOString(),
          status: 'em_andamento',
        })
      })
    ])

    setUltimasCargas(maxCargas)
  }

  async function salvarCarga(teId: string, serieIdx: number, valor: string) {
    const novas = [...(cargas[teId] || [])]
    novas[serieIdx] = valor
    setCargas(prev => ({ ...prev, [teId]: novas }))
    const idAtual = aulaIdRef.current ?? aulaId
    if (!idAtual || !valor) return
    const ex = exercicios.find(e => e.id === teId)
    if (!ex) return
    setSalvando(teId)
    const cargaNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(cargaNum)) { setSalvando(null); return }
    await supabase.from('registros_carga').upsert({
      aula_id: idAtual,
      exercicio_id: ex.exercicio_id,
      maquina: ex.exercicios?.numero_maquina || '',
      carga_kg: cargaNum,
      reps_realizadas: ex.reps_override || '12',
      observacoes: `Série ${serieIdx + 1}`,
    }, { onConflict: 'aula_id,exercicio_id,observacoes' })
    setSalvando(null)
  }

  async function gerarInsights(alunoId: string, aulaIdAtual: string) {
    const res = await fetch(`/api/aulas?insights=1&aluno_id=${alunoId}&aula_id=${aulaIdAtual}`)
    const json = await res.json()
    const { aulasRecentes, aulasMes, aulasSemana, cargasHoje, cargasAnteriores } = json.data

    const insightsGerados: Insight[] = []

    const maxAnterior: Record<string, number> = {}
    for (const r of (cargasAnteriores || [])) {
      if (!r.exercicio_id) continue
      if (!maxAnterior[r.exercicio_id] || r.carga_kg > maxAnterior[r.exercicio_id])
        maxAnterior[r.exercicio_id] = r.carga_kg
    }
    const records = (cargasHoje || []).filter((r: any) =>
      r.exercicio_id && maxAnterior[r.exercicio_id] && r.carga_kg > maxAnterior[r.exercicio_id]
    )
    if (records.length > 0) {
      insightsGerados.push({
        icon: '🏆', titulo: 'Recorde batido!',
        descricao: `${records.length} exercício${records.length > 1 ? 's' : ''} com carga máxima superada hoje! Continue progredindo!`,
        cor: 'purple'
      })
    }

    const diasTreinados = [...new Set((aulasRecentes || []).map((a: any) =>
      new Date(a.finalizada_em).toDateString()
    ))] as string[]
    let sequencia = diasTreinados.length > 0 ? 1 : 0
    for (let d = 1; d < diasTreinados.length; d++) {
      const diff = (new Date(diasTreinados[d-1]).getTime() - new Date(diasTreinados[d]).getTime()) / (1000*60*60*24)
      if (diff <= 1) sequencia++
      else break
    }
    if (sequencia >= 3) {
      insightsGerados.push({
        icon: '🔥', titulo: `${sequencia} treinos seguidos!`,
        descricao: 'Que sequência incrível! Consistência é o segredo do resultado.',
        cor: 'orange'
      })
    }

    const totalSemana = aulasSemana?.length || 0
    if (totalSemana >= 4) {
      insightsGerados.push({
        icon: '💪', titulo: `${totalSemana} treinos essa semana!`,
        descricao: 'Semana muito produtiva! Lembre-se de descansar bem para recuperação.',
        cor: 'green'
      })
    } else if (totalSemana === 1) {
      insightsGerados.push({
        icon: '📅', titulo: 'Primeiro treino da semana!',
        descricao: 'Ótimo começo! Tente manter pelo menos 3 treinos por semana para melhores resultados.',
        cor: 'blue'
      })
    }

    const totalMes = aulasMes?.length || 0
    insightsGerados.push({
      icon: '📊', titulo: `${totalMes} treino${totalMes !== 1 ? 's' : ''} em ${mesNome}`,
      descricao: totalMes >= 12 ? 'Excelente frequência no mês! Você está no caminho certo.'
        : totalMes >= 8 ? 'Boa frequência! Continue assim.'
        : 'Tente aumentar a frequência para resultados mais rápidos.',
      cor: totalMes >= 12 ? 'green' : totalMes >= 8 ? 'blue' : 'orange'
    })

    const descricoes = (aulasRecentes || []).map((a: any) =>
      (a.treinos?.descricao || a.treinos?.nome || '').toLowerCase()
    )
    const gruposFeitos = {
      perna: descricoes.some((d: string) => d.includes('perna') || d.includes('glút') || d.includes('leg')),
      peito: descricoes.some((d: string) => d.includes('peito')),
      costas: descricoes.some((d: string) => d.includes('costas')),
      braço: descricoes.some((d: string) => d.includes('bícep') || d.includes('trícep') || d.includes('braço')),
      ombro: descricoes.some((d: string) => d.includes('ombro')),
    }
    const faltando = Object.entries(gruposFeitos)
      .filter(([_, feito]) => !feito).map(([grupo]) => grupo)
    if (faltando.length > 0 && faltando.length <= 3) {
      insightsGerados.push({
        icon: '⚠️', titulo: 'Grupos musculares em falta',
        descricao: `Nos últimos 7 dias não treinou: ${faltando.join(', ')}. Considere incluir na próxima semana!`,
        cor: 'red'
      })
    }

    setInsights(insightsGerados)
    setLoadingInsights(false)
  }

  async function finalizarAula() {
    // ✅ evita duplo disparo
    if (finalizandoRef.current) return
    finalizandoRef.current = true

    const aulaIdAtual = aulaIdRef.current ?? aulaId
    if (!aulaIdAtual) { finalizandoRef.current = false; return }

    const agora = new Date()
    const foraPrazo = fimSlot ? agora > fimSlot : false
    const alunoIdAtual = alunoSel?.id

    if (timerRef.current) clearInterval(timerRef.current)

    await fetch('/api/aulas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: aulaIdAtual,
        finalizada_em: agora.toISOString(),
        status: 'finalizada',
        observacoes: foraPrazo ? 'fora_do_prazo' : null,
      })
    })

    setEtapa('finalizado')
    setLoadingInsights(true)

    if (alunoIdAtual) await gerarInsights(alunoIdAtual, aulaIdAtual)
    finalizandoRef.current = false
  }

  function resetar() {
    aulaIdRef.current = null
    finalizandoRef.current = false
    setEtapa('buscar_aluno')
    setAlunoSel(null); setTreinoSel(null); setAulaId(null)
    setExercicios([]); setCargas({}); setBusca(''); setAlunos([])
    setNovoNome(''); setNovoCPF(''); setShowCadastro(false)
    setFimSlot(null); setTempoRestante(0)
    setAlertaAtivo(false); setInsights([])
  }

  const corMap: Record<string, string> = {
    green: 'bg-green-50 border-green-200 text-green-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
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
              {alunos.map(a => {
                let touchStartY = 0
                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onTouchStart={e => { touchStartY = e.touches[0].clientY }}
                    onTouchEnd={e => {
                      const delta = Math.abs(e.changedTouches[0].clientY - touchStartY)
                      if (delta > 10) return
                      selecionarAluno(a)
                    }}
                    onClick={() => selecionarAluno(a)}
                    onKeyDown={e => e.key === 'Enter' && selecionarAluno(a)}
                    className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50 text-left cursor-pointer select-none"
                    style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center flex-shrink-0 pointer-events-none">
                      {a.nome.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 pointer-events-none">
                      <div className="text-sm font-medium text-gray-900">{a.nome}</div>
                      {a.cpf && <div className="text-xs text-gray-400">{a.cpf}</div>}
                    </div>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0 pointer-events-none" />
                  </div>
                )
              })}
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
          let touchStartY = 0
          return (
            <div
              key={pub.id}
              role="button"
              tabIndex={0}
              onTouchStart={e => { touchStartY = e.touches[0].clientY }}
              onTouchEnd={e => {
                const delta = Math.abs(e.changedTouches[0].clientY - touchStartY)
                if (delta > 10) return
                selecionarTreino(pub, alunoSel)
              }}
              onClick={() => selecionarTreino(pub, alunoSel)}
              onKeyDown={e => e.key === 'Enter' && selecionarTreino(pub, alunoSel)}
              className="card w-full text-left border-2 border-transparent active:border-primary-300 active:bg-primary-50 transition-colors cursor-pointer select-none"
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
            >
              <div className="flex items-center gap-3 pointer-events-none">
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
            </div>
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
        itens.push([exercicios[i], exercicios[i+1]]); i += 2
      } else {
        itens.push([exercicios[i]]); i++
      }
    }
    const foraPrazo = tempoRestante <= 0 && fimSlot !== null
    const corTimer = foraPrazo ? 'text-red-600' : alertaAtivo ? 'text-orange-500' : 'text-gray-500'

    return (
      <div>
        {alertaAtivo && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-orange-500 text-white px-4 py-3 flex items-center gap-3 animate-pulse">
            <AlertTriangle size={18} />
            <span className="font-semibold text-sm">Atenção! Faltam {formatarTempo(tempoRestante)} para encerrar o slot!</span>
          </div>
        )}
        {foraPrazo && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={18} />
            <span className="font-semibold text-sm">⚠️ Tempo encerrado! Finalize a aula agora.</span>
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
            {/* ✅ botão finalizar com proteção contra scroll e duplo toque */}
            <button
              onTouchStart={e => { (e.currentTarget as any)._touchY = e.touches[0].clientY }}
              onTouchEnd={e => {
                const delta = Math.abs(e.changedTouches[0].clientY - (e.currentTarget as any)._touchY)
                if (delta > 10) return
                finalizarAula()
              }}
              onClick={finalizarAula}
              className="btn btn-primary gap-2"
            >
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
                  const ultimaCarga = ex.exercicio_id ? ultimasCargas[ex.exercicio_id] : null
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
                            {maquina && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{maquina}</span>}
                            <span className="text-xs text-gray-400">{series} séries × {reps} reps</span>
                            {!isConj && ex.descanso_override && <span className="text-xs text-gray-400">· {ex.descanso_override}s descanso</span>}
                          </div>
                          {ultimaCarga && (
                            <div className="text-xs text-primary-600 mt-1 font-medium">
                              📊 Última carga máxima neste exercício: {ultimaCarga}kg
                            </div>
                          )}
                          {ex.observacoes_override && <div className="text-xs text-gray-500 italic mt-1">📌 {ex.observacoes_override}</div>}
                          {ex.exercicios?.observacoes && <div className="text-xs text-gray-400 italic mt-0.5">💡 {ex.exercicios.observacoes}</div>}
                        </div>
                      </div>

                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(series, 4)}, 1fr)` }}>
                        {Array.from({ length: series }).map((_, si) => (
                          <div key={si}>
                            <div className="text-xs text-gray-400 text-center mb-1">Série {si+1}</div>
                            <div className="relative">
                              <input className="input text-center pr-7" type="number" step="0.5" placeholder="0"
                                value={cargasEx[si] || ''} onChange={e => salvarCarga(ex.id, si, e.target.value)} />
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

          {/* ✅ botão finalizar do rodapé com mesma proteção */}
          <button
            onTouchStart={e => { (e.currentTarget as any)._touchY = e.touches[0].clientY }}
            onTouchEnd={e => {
              const delta = Math.abs(e.changedTouches[0].clientY - (e.currentTarget as any)._touchY)
              if (delta > 10) return
              finalizarAula()
            }}
            onClick={finalizarAula}
            className="btn btn-primary w-full gap-2 py-3"
          >
            <CheckCircle size={16} /> Finalizar aula
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto py-8">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">Aula finalizada! 🎉</h1>
        <p className="text-sm text-gray-400 mt-1">
          Treino de <strong>{alunoSel?.nome}</strong> registrado com sucesso.
        </p>
      </div>

      {loadingInsights ? (
        <div className="text-center py-4">
          <div className="w-6 h-6 border-4 border-primary-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-gray-400">Gerando insights do aluno...</p>
        </div>
      ) : insights.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            💬 Compartilhe com {alunoSel?.nome?.split(' ')[0]}:
          </h2>
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className={`border rounded-xl p-4 ${corMap[insight.cor]}`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">{insight.icon}</span>
                  <div>
                    <div className="font-semibold text-sm">{insight.titulo}</div>
                    <div className="text-xs mt-0.5 opacity-80">{insight.descricao}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onTouchStart={e => { (e.currentTarget as any)._touchY = e.touches[0].clientY }}
          onTouchEnd={e => {
            const delta = Math.abs(e.changedTouches[0].clientY - (e.currentTarget as any)._touchY)
            if (delta > 10) return
            resetar()
          }}
          onClick={resetar}
          className="btn btn-primary flex-1"
        >
          Nova aula
        </button>
        <button
          onTouchStart={e => { (e.currentTarget as any)._touchY = e.touches[0].clientY }}
          onTouchEnd={e => {
            const delta = Math.abs(e.changedTouches[0].clientY - (e.currentTarget as any)._touchY)
            if (delta > 10) return
            window.location.href = '/coach/painel'
          }}
          onClick={() => { window.location.href = '/coach/painel' }}
          className="btn flex-1"
        >
          Ir ao painel
        </button>
      </div>
    </div>
  )
}
