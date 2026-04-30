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

  const supabase = createClient()
  const mes = new Date().getMonth() + 1
  const ano = new Date().getFullYear()
  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long' })

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
    const slotBase = new Date(inicio)
    if (minutos < 30) slotBase.setMinutes(0, 0, 0)
    else slotBase.setMinutes(30, 0, 0)
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
        car
