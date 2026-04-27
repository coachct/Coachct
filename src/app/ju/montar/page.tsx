'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Categoria, Exercicio, Treino } from '@/types'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Plus, X, Save, ChevronDown, ChevronUp, Copy, Pencil, Calendar } from 'lucide-react'

interface ExercicioComSeries extends Exercicio {
  series: string
  reps: string
  descanso: string
  obs_treino: string
  te_id?: string
}

interface TreinoCompleto extends Treino {
  treino_exercicios?: any[]
}

const LETRAS = ['A','B','C','D','E','F','G','H','I','J']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default function JuMontarPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [treinos, setTreinos] = useState<TreinoCompleto[]>([])
  const [catFiltro, setCatFiltro] = useState('todos')
  const [exExpandido, setExExpandido] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Treino em edição
  const [editando, setEditando] = useState<string | null>(null) // id do treino sendo editado
  const [nomeEdit, setNomeEdit] = useState('')
  const [descEdit, setDescEdit] = useState('')
  const [exsEdit, setExsEdit] = useState<ExercicioComSeries[]>([])

  // Modal publicar
  const [modalPublicar, setModalPublicar] = useState<string | null>(null)
  const [pubMes, setPubMes] = useState(new Date().getMonth() + 1)
  const [pubAno, setPubAno] = useState(new Date().getFullYear())

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: cats }, { data: exs }, { data: tr }] = await Promise.all([
      supabase.from('categorias').select('*').order('ordem'),
      supabase.from('exercicios').select('*, categorias(nome)').eq('ativo', true).order('nome'),
      supabase.from('treinos').select('*, treino_exercicios(*, exercicios(nome, numero_maquina))').order('nome'),
    ])
    setCategorias(cats || [])
    setExercicios(exs || [])
    setTreinos(tr || [])
    setLoading(false)
  }

  // ---- Criar novo treino ----
  async function criarNovo() {
    const idx = treinos.length
    const nome = `Treino ${LETRAS[idx] || idx+1}`
    const { data } = await supabase.from('treinos').insert({
      nome, descricao: '', mes: 1, ano: 2025, publicado: false
    }).select().single()
    if (data) {
      setTreinos(prev => [...prev, { ...data, treino_exercicios: [] }])
      abrirEdicao({ ...data, treino_exercicios: [] })
    }
  }

  // ---- Duplicar treino ----
  async function duplicar(treino: TreinoCompleto) {
    const { data: novo } = await supabase.from('treinos').insert({
      nome: treino.nome + ' (cópia)',
      descricao: treino.descricao,
      mes: 1, ano: 2025, publicado: false
    }).select().single()
    if (novo && treino.treino_exercicios) {
      const rows = treino.treino_exercicios.map((te: any, i: number) => ({
        treino_id: novo.id,
        exercicio_id: te.exercicio_id,
        ordem: te.ordem ?? i,
        series_override: te.series_override,
        reps_override: te.reps_override,
        des
