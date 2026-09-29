'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import GuiasPanel from './GuiasPanel'
import {
  Landmark,
  Plus,
  X,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  TriangleAlert,
  CircleDollarSign,
  CalendarClock,
  ClipboardList,
  FileCheck2,
} from 'lucide-react'

const supabase = createClient()

const MESES_CURTO =['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const ORGAOS = ['RFB', 'PGFN', 'PMSP', 'PGM', 'INSS'] as const
const TIPOS: { v: string; label: string }[] = [
  { v: 'simplificado', label: 'Simplificado' },
  { v: 'transacao', label: 'Transação' },
  { v: 'parcsn', label: 'Simples Nacional (PARCSN)' },
  { v: 'tdm', label: 'TDM municipal' },
  { v: 'parcelamento', label: 'Parcelamento' },
  { v: 'a_vista', label: 'À vista' },
]
const STATUS: { v: string; label: string }[] = [
  { v: 'simulado', label: 'Simulado' },
  { v: 'ativo', label: 'Ativo' },
  { v: 'suspenso', label: 'Suspenso' },
  { v: 'quitado', label: 'Quitado' },
  { v: 'rescindido', label: 'Rescindido' },
]

const ORGAO_BADGE: Record<string, string> = {
  RFB: 'bg-blue-100 text-blue-700',
  PGFN: 'bg-indigo-100 text-indigo-700',
  PMSP: 'bg-amber-100 text-amber-700',
  PGM: 'bg-orange-100 text-orange-700',
  INSS: 'bg-teal-100 text-teal-700',
}
const STATUS_BADGE: Record<string, string> = {
  simulado: 'bg-gray-100 text-gray-500',
  ativo: 'bg-green-100 text-green-700',
  suspenso: 'bg-sky-100 text-sky-700',
  quitado: 'bg-gray-100 text-gray-600',
  rescindido: 'bg-red-100 text-red-700',
}
const RISCO_LABEL: Record<string, string> = {
  ok: 'Em dia',
  atraso: 'Com atraso',
  atencao: 'A 1 parcela da rescisão',
  rescisao_iminente: 'Rescisão iminente',
  rescindido: 'Rescindido',
}
const RISCO_BADGE: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  atraso: 'bg-amber-100 text-amber-800',
  atencao: 'bg-orange-100 text-orange-800',
  rescisao_iminente: 'bg-red-100 text-red-700',
  rescindido: 'bg-red-100 text-red-700',
}
const RISCO_LABEL_PEND: Record<string, string> = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }
const RISCO_BADGE_PEND: Record<string, string> = {
  alto: 'bg-red-100 text-red-700',
  medio: 'bg-amber-100 text-amber-800',
  baixo: 'bg-gray-100 text-gray-600',
}
const SITUACAO_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_negociacao: 'Em negociação',
  resolvida: 'Resolvida',
}

type Unidade = { id: string; nome: string }

type Resumo = {
  acordo_id: string
  orgao: string
  numero: string | null
  descricao: string
  tipo: string
  status: string
  unidade_id: string | null
  valor_consolidado: number | null
  qtd_parcelas: number | null
  limite_rescisao: number
  parcelas_total: number
  parcelas_pagas: number
  parcelas_atrasadas: number
  valor_pago: number
  saldo_aberto: number
  valor_atrasado: number
  proximo_vencimento: string | null
  proximo_valor: number | null
  risco: string
}

type Fluxo = {
  competencia: string
  total: number
  total_simulado: number
  parcelas: number
}

type Pendencia = {
  id: string
  orgao: string
  descricao: string
  valor: number | null
  risco: string
  situacao: string
  prazo: string | null
  observacao: string | null
  guia_pedida_em: string | null
}

// Parcela em atraso de acordo ativo — o que vai para o pedido de guia
type ParcelaCritica = {
  id: string
  numero: number
  vencimento: string
  valor: number
  estimado: boolean
  guia_pedida_em: string | null
  acordo_id: string
  fiscal_acordos: {
    orgao: string
    descricao: string
    numero: string | null
    qtd_parcelas: number | null
    limite_rescisao: number
  }
}

type FormAcordo = {
  orgao: string
  numero: string
  descricao: string
  tipo: string
  valor_consolidado: string
  status: string
  limite_rescisao: string
  unidade_id: string
  observacao: string
}

const FORM_VAZIO: FormAcordo = {
  orgao: 'RFB',
  numero: '',
  descricao: '',
  tipo: 'parcelamento',
  valor_consolidado: '',
  status: 'ativo',
  limite_rescisao: '3',
  unidade_id: 'geral',
  observacao: '',
}

function fmtData(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}
function fmtMesAno(d: string): string {
  const [y, m] = d.split('-')
  return `${MESES_CURTO[Number(m) - 1]}/${y.slice(2)}`
}
function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function parseValor(s: string): number {
  if (!s) return 0
  let t = s.trim()
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}
// Crítico de verdade = o mínimo que tira o acordo do limite de rescisão.
// A Receita abate a parcela mais antiga primeiro: com 3 em atraso e limite 3,
// só a mais antiga é crítica; acordo abaixo do limite não entra.
// `lista` vem ordenada por vencimento.
function soCriticas(lista: ParcelaCritica[]): {
  criticas: ParcelaCritica[]
  foraPorAcordo: Record<string, number>
} {
  const porAcordo = new Map<string, ParcelaCritica[]>()
  for (const p of lista) {
    const arr = porAcordo.get(p.acordo_id) || []
    arr.push(p)
    porAcordo.set(p.acordo_id, arr)
  }
  const criticas: ParcelaCritica[] = []
  const foraPorAcordo: Record<string, number> = {}
  porAcordo.forEach((arr, acordoId) => {
    const k = arr.length - arr[0].fiscal_acordos.limite_rescisao + 1
    if (k <= 0) return
    criticas.push(...arr.slice(0, k))
    foraPorAcordo[acordoId] = arr.length - k
  })
  return { criticas, foraPorAcordo }
}

function hojeLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function diasAte(d: string): number {
  const [y, m, dd] = d.split('-').map(Number)
  const alvo = new Date(y, m - 1, dd)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

export default function ParcelamentosPage() {
  const { user, loading: authLoading } = useAuth()

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [resumo, setResumo] = useState<Resumo[]>([])
  const [fluxo, setFluxo] = useState<Fluxo[]>([])
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])

  const [fOrgao, setFOrgao] = useState('todos')
  const [fStatus, setFStatus] = useState('ativos')
  const [incluirSimulado, setIncluirSimulado] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)

  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState<FormAcordo>(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)

  // críticos: parcelas em atraso + pendências de risco alto, para pedir guia
  const [criticosAberto, setCriticosAberto] = useState(false)
  const [carregandoCrit, setCarregandoCrit] = useState(false)
  const [parcelasCrit, setParcelasCrit] = useState<ParcelaCritica[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [soFaltaPedir, setSoFaltaPedir] = useState(false)
  const [marcando, setMarcando] = useState(false)

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const [resResumo, resFluxo, resPend, resUni] = await Promise.all([
      supabase.rpc('fiscal_resumo_acordos'),
      supabase.rpc('fiscal_fluxo_futuro', { p_meses: 18, p_incluir_simulado: true }),
      supabase
        .from('fiscal_pendencias')
        .select('id, orgao, descricao, valor, risco, situacao, prazo, observacao, guia_pedida_em')
        .order('risco', { ascending: true }),
      supabase.from('unidades').select('id, nome').order('nome', { ascending: true }),
    ])

    if (resResumo.error) {
      setErro('Não foi possível carregar os parcelamentos.')
      setCarregando(false)
      return
    }

    setResumo((resResumo.data as Resumo[]) || [])
    setFluxo((resFluxo.data as Fluxo[]) || [])
    const pesoRisco: Record<string, number> = { alto: 0, medio: 1, baixo: 2 }
    setPendencias(
      ((resPend.data as Pendencia[]) || []).sort(
        (a, b) => (pesoRisco[a.risco] ?? 9) - (pesoRisco[b.risco] ?? 9)
      )
    )
    setUnidades((resUni.data as Unidade[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    if (!authLoading) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  const nomeUnidade = (id: string | null) =>
    id ? unidades.find((u) => u.id === id)?.nome || 'Unidade' : 'Geral'

  // ---------------- indicadores ----------------
  const kpi = useMemo(() => {
    const vivos = resumo.filter((r) => r.status === 'ativo')
    const simulados = resumo.filter((r) => r.status === 'simulado')

    const saldoAtivo = vivos.reduce((a, r) => a + Number(r.saldo_aberto || 0), 0)
    const saldoSimulado = simulados.reduce((a, r) => a + Number(r.saldo_aberto || 0), 0)

    const atrasado = vivos.reduce((a, r) => a + Number(r.valor_atrasado || 0), 0)
    const qtdAtrasadas = vivos.reduce((a, r) => a + Number(r.parcelas_atrasadas || 0), 0)

    const prox30 = resumo
      .filter((r) => (r.status === 'ativo' || (incluirSimulado && r.status === 'simulado')))
      .filter((r) => r.proximo_vencimento && diasAte(r.proximo_vencimento) <= 30)
      .reduce((a, r) => a + Number(r.proximo_valor || 0), 0)

    const emRisco = vivos.filter((r) => r.risco === 'rescisao_iminente' || r.risco === 'atencao')

    const pendAbertas = pendencias.filter((p) => p.situacao !== 'resolvida')
    const pendValor = pendAbertas.reduce((a, p) => a + Number(p.valor || 0), 0)
    const pendSemValor = pendAbertas.filter((p) => p.valor === null).length

    return {
      saldoAtivo, saldoSimulado, atrasado, qtdAtrasadas, prox30, emRisco,
      pendAbertas: pendAbertas.length, pendValor, pendSemValor,
    }
  }, [resumo, pendencias, incluirSimulado])

  const lista = useMemo(() => {
    const ordemRisco: Record<string, number> = {
      rescisao_iminente: 0, atencao: 1, atraso: 2, rescindido: 3, ok: 4,
    }
    return resumo
      .filter((r) => (fOrgao === 'todos' ? true : r.orgao === fOrgao))
      .filter((r) => {
        if (fStatus === 'todos') return true
        if (fStatus === 'ativos') return r.status === 'ativo'
        if (fStatus === 'simulados') return r.status === 'simulado'
        if (fStatus === 'encerrados') return ['quitado', 'rescindido', 'suspenso'].includes(r.status)
        return true
      })
      .sort((a, b) => {
        const d = (ordemRisco[a.risco] ?? 9) - (ordemRisco[b.risco] ?? 9)
        if (d !== 0) return d
        return a.orgao.localeCompare(b.orgao)
      })
  }, [resumo, fOrgao, fStatus])

  const fluxoVisivel = useMemo(
    () => fluxo.filter((f) => Number(f.total) > 0 || Number(f.total_simulado) > 0).slice(0, 18),
    [fluxo]
  )
  const fluxoMax = useMemo(
    () => Math.max(1, ...fluxoVisivel.map((f) => Number(f.total) + (incluirSimulado ? Number(f.total_simulado) : 0))),
    [fluxoVisivel, incluirSimulado]
  )

  // ---------------- ações ----------------
  async function sincronizarContasAPagar() {
    setSincronizando(true)
    setErro(null)
    setAviso(null)
    const { data, error } = await supabase.rpc('fiscal_sync_contas_a_pagar')
    setSincronizando(false)
    if (error) {
      setErro('Não foi possível sincronizar com Contas a Pagar.')
      return
    }
    const n = Number(data || 0)
    setAviso(
      n === 0
        ? 'Nada novo para lançar — Contas a Pagar já está em dia com a janela do mês corrente e do próximo.'
        : `${n} parcela${n > 1 ? 's' : ''} lançada${n > 1 ? 's' : ''} em Contas a Pagar.`
    )
    carregar()
  }

  // ---------------- críticos / pedido de guia ----------------
  const pendCriticas = useMemo(
    () => pendencias.filter((p) => p.risco === 'alto' && p.situacao !== 'resolvida'),
    [pendencias]
  )

  // parcelas em atraso agrupadas por acordo, na ordem do vencimento
  const { criticas, foraPorAcordo } = useMemo(() => soCriticas(parcelasCrit), [parcelasCrit])

  const gruposCrit = useMemo(() => {
    const lista = soFaltaPedir ? criticas.filter((p) => !p.guia_pedida_em) : criticas
    const mapa = new Map<string, { acordo: ParcelaCritica['fiscal_acordos']; parcelas: ParcelaCritica[] }>()
    for (const p of lista) {
      const g = mapa.get(p.acordo_id) || { acordo: p.fiscal_acordos, parcelas: [] }
      g.parcelas.push(p)
      mapa.set(p.acordo_id, g)
    }
    return Array.from(mapa.entries()).map(([id, g]) => ({ id, ...g }))
  }, [criticas, soFaltaPedir])

  const pendCritVisiveis = useMemo(
    () => (soFaltaPedir ? pendCriticas.filter((p) => !p.guia_pedida_em) : pendCriticas),
    [pendCriticas, soFaltaPedir]
  )

  const totalSelecionado = useMemo(() => {
    let v = 0
    for (const p of criticas) if (selecionados.has(`p:${p.id}`)) v += Number(p.valor || 0)
    for (const p of pendCriticas) if (selecionados.has(`d:${p.id}`)) v += Number(p.valor || 0)
    return v
  }, [criticas, pendCriticas, selecionados])

  async function carregarCriticos(): Promise<ParcelaCritica[]> {
    const { data, error } = await supabase
      .from('fiscal_parcelas')
      .select(
        'id, numero, vencimento, valor, estimado, guia_pedida_em, acordo_id, fiscal_acordos!inner(orgao, descricao, numero, qtd_parcelas, limite_rescisao, status)'
      )
      .eq('pago', false)
      .lt('vencimento', hojeLocalStr())
      .eq('fiscal_acordos.status', 'ativo')
      .order('vencimento', { ascending: true })
    if (error) {
      setErro('Não foi possível carregar as parcelas em atraso.')
      return []
    }
    const lista = (data as unknown as ParcelaCritica[]) || []
    setParcelasCrit(lista)
    return lista
  }

  async function abrirCriticos() {
    setErro(null)
    setAviso(null)
    setSoFaltaPedir(false)
    setCriticosAberto(true)
    setCarregandoCrit(true)
    const lista = await carregarCriticos()
    // já abre com tudo o que ainda não teve guia pedida selecionado
    const sel = new Set<string>()
    soCriticas(lista).criticas.filter((p) => !p.guia_pedida_em).forEach((p) => sel.add(`p:${p.id}`))
    pendCriticas.filter((p) => !p.guia_pedida_em).forEach((p) => sel.add(`d:${p.id}`))
    setSelecionados(sel)
    setCarregandoCrit(false)
  }

  function alternar(chave: string) {
    setSelecionados((prev) => {
      const s = new Set(prev)
      if (s.has(chave)) s.delete(chave)
      else s.add(chave)
      return s
    })
  }

  function alternarGrupo(chaves: string[]) {
    setSelecionados((prev) => {
      const s = new Set(prev)
      const todos = chaves.every((c) => s.has(c))
      chaves.forEach((c) => (todos ? s.delete(c) : s.add(c)))
      return s
    })
  }

  async function marcarGuia(pedida: boolean) {
    const idsParcelas = Array.from(selecionados).filter((k) => k.startsWith('p:')).map((k) => k.slice(2))
    const idsPend = Array.from(selecionados).filter((k) => k.startsWith('d:')).map((k) => k.slice(2))
    if (idsParcelas.length + idsPend.length === 0) return

    setMarcando(true)
    setErro(null)
    const valor = pedida ? hojeLocalStr() : null
    const [r1, r2] = await Promise.all([
      idsParcelas.length
        ? supabase.from('fiscal_parcelas').update({ guia_pedida_em: valor }).in('id', idsParcelas)
        : Promise.resolve({ error: null }),
      idsPend.length
        ? supabase.from('fiscal_pendencias').update({ guia_pedida_em: valor }).in('id', idsPend)
        : Promise.resolve({ error: null }),
    ])
    setMarcando(false)
    if (r1.error || r2.error) {
      setErro('Não foi possível registrar o pedido de guia.')
      return
    }
    const n = idsParcelas.length + idsPend.length
    setAviso(
      pedida
        ? `${n} ${n === 1 ? 'item marcado' : 'itens marcados'} como guia pedida em ${fmtData(valor)}.`
        : `Marcação de guia pedida removida de ${n} ${n === 1 ? 'item' : 'itens'}.`
    )
    setSelecionados(new Set())
    await Promise.all([carregarCriticos(), carregar()])
  }

  function abrirNovo() {
    setForm(FORM_VAZIO)
    setErro(null)
    setModalAberto(true)
  }

  async function salvarAcordo() {
    if (!form.descricao.trim()) {
      setErro('Descreva o acordo.')
      return
    }
    setSalvando(true)
    setErro(null)

    const { error } = await supabase.from('fiscal_acordos').insert({
      orgao: form.orgao,
      numero: form.numero.trim() || null,
      descricao: form.descricao.trim(),
      tipo: form.tipo,
      valor_consolidado: form.valor_consolidado ? parseValor(form.valor_consolidado) : null,
      status: form.status,
      limite_rescisao: Number(form.limite_rescisao) || 3,
      unidade_id: form.unidade_id === 'geral' ? null : form.unidade_id,
      observacao: form.observacao.trim() || null,
      criado_por: user?.id || null,
    })

    setSalvando(false)
    if (error) {
      setErro('Não foi possível salvar o acordo.')
      return
    }
    setModalAberto(false)
    setAviso('Acordo criado. Abra o acordo para gerar a grade de parcelas.')
    carregar()
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20 md:text-sm'

  return (
    <>
      <div className="space-y-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Landmark size={22} className="text-[#ff2d9b]" />
              Parcelamentos fiscais
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Acordos com a Receita, a PGFN e a Prefeitura — parcelas pagas, futuras e em atraso.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={abrirCriticos}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              title="Parcelas em atraso e pendências de risco alto, para pedir guia à contabilidade"
            >
              <ClipboardList size={16} />
              Críticos
            </button>
            <button
              onClick={sincronizarContasAPagar}
              disabled={sincronizando}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              title="Lança em Contas a Pagar as parcelas que vencem no mês corrente e no próximo"
            >
              {sincronizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Sincronizar
            </button>
            <button
              onClick={abrirNovo}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#ff2d9b] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0267f]"
            >
              <Plus size={16} />
              Novo acordo
            </button>
          </div>
        </div>

        {erro && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {erro}
          </div>
        )}
        {aviso && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
            {aviso}
          </div>
        )}

        {/* ALERTA DE RESCISÃO — o que não pode passar batido */}
        {kpi.emRisco.length > 0 && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <TriangleAlert size={20} className="mt-0.5 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-red-800">
                  {kpi.emRisco.length === 1
                    ? '1 acordo em risco de rescisão'
                    : `${kpi.emRisco.length} acordos em risco de rescisão`}
                </div>
                <p className="mt-0.5 text-xs text-red-700">
                  Pela Lei 10.522/2002, o parcelamento é rescindido com parcelas em atraso no limite
                  do acordo. Rescindido, o débito volta a ser exigível e passa a bloquear o
                  reenquadramento no Simples.
                </p>
                <button
                  onClick={abrirCriticos}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                >
                  <ClipboardList size={14} />
                  Ver parcelas para pedir guia
                </button>
                <div className="mt-3 space-y-2">
                  {kpi.emRisco.map((r) => (
                    <Link
                      key={r.acordo_id}
                      href={`/admin/financeiro/parcelamentos/${r.acordo_id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-white px-3 py-2.5 transition hover:border-red-300"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {r.orgao} · {r.descricao}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {r.parcelas_atrasadas} de {r.limite_rescisao} parcelas em atraso ·{' '}
                          {fmtBRL(Number(r.valor_atrasado))}
                        </div>
                      </div>
                      <ChevronRight size={16} className="shrink-0 text-red-400" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Indicadores */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              <CircleDollarSign size={13} />
              Saldo devedor
            </div>
            <div className="mt-1.5 text-xl font-bold text-gray-900">{fmtBRL(kpi.saldoAtivo)}</div>
            {kpi.saldoSimulado > 0 && (
              <div className="mt-0.5 text-xs text-gray-500">
                + {fmtBRL(kpi.saldoSimulado)} em simulação
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              <CalendarClock size={13} />
              Vence em 30 dias
            </div>
            <div className="mt-1.5 text-xl font-bold text-gray-900">{fmtBRL(kpi.prox30)}</div>
            <div className="mt-0.5 text-xs text-gray-500">próxima parcela de cada acordo</div>
          </div>

          <div
            className={`rounded-2xl border p-4 ${
              kpi.atrasado > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              <AlertTriangle size={13} />
              Em atraso
            </div>
            <div
              className={`mt-1.5 text-xl font-bold ${kpi.atrasado > 0 ? 'text-red-700' : 'text-gray-900'}`}
            >
              {fmtBRL(kpi.atrasado)}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              {kpi.qtdAtrasadas} parcela{kpi.qtdAtrasadas === 1 ? '' : 's'}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
              <TriangleAlert size={13} />
              Fora de acordo
            </div>
            <div className="mt-1.5 text-xl font-bold text-gray-900">{fmtBRL(kpi.pendValor)}</div>
            <div className="mt-0.5 text-xs text-gray-500">
              {kpi.pendAbertas} pendência{kpi.pendAbertas === 1 ? '' : 's'}
              {kpi.pendSemValor > 0 && ` · ${kpi.pendSemValor} sem valor`}
            </div>
          </div>
        </div>

        {/* Guias da contabilidade — leitura e conferência */}
        <GuiasPanel onAlterado={carregar} />

        {/* Fluxo futuro */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Desembolso mês a mês</h2>
              <p className="text-xs text-gray-500">
                Horizonte completo dos acordos. Em Contas a Pagar entram só o mês corrente e o próximo.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={incluirSimulado}
                onChange={(e) => setIncluirSimulado(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
              />
              Incluir simulações
            </label>
          </div>

          {kpi.atrasado > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <span className="text-xs font-semibold text-red-800">Vencido (imediato)</span>
              <span className="text-sm font-bold text-red-700">{fmtBRL(kpi.atrasado)}</span>
            </div>
          )}

          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              Carregando…
            </div>
          ) : fluxoVisivel.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Nenhuma parcela futura cadastrada.
            </div>
          ) : (
            <div className="mt-3 space-y-1.5">
              {fluxoVisivel.map((f) => {
                const ativo = Number(f.total)
                const sim = incluirSimulado ? Number(f.total_simulado) : 0
                const tot = ativo + sim
                const pctA = (ativo / fluxoMax) * 100
                const pctS = (sim / fluxoMax) * 100
                return (
                  <div key={f.competencia} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-gray-500">
                      {fmtMesAno(f.competencia)}
                    </span>
                    <div className="flex h-5 flex-1 overflow-hidden rounded-md bg-gray-100">
                      <div className="h-full bg-[#ff2d9b]" style={{ width: `${pctA}%` }} />
                      <div
                        className="h-full bg-[#ff2d9b]/25"
                        style={{ width: `${pctS}%` }}
                        title="Simulação"
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs font-medium text-gray-700">
                      {fmtBRL(tot)}
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center gap-4 pt-2 text-[11px] text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded bg-[#ff2d9b]" /> Acordos ativos
                </span>
                {incluirSimulado && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded bg-[#ff2d9b]/25" /> Simulações
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Órgão</label>
            <select value={fOrgao} onChange={(e) => setFOrgao(e.target.value)} className={inputCls}>
              <option value="todos">Todos</option>
              {ORGAOS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Situação</label>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={inputCls}>
              <option value="ativos">Ativos</option>
              <option value="simulados">Simulações</option>
              <option value="encerrados">Encerrados / suspensos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
        </div>

        {/* Lista de acordos */}
        <div className="space-y-3">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-16 text-gray-500">
              <Loader2 size={18} className="animate-spin" />
              Carregando…
            </div>
          ) : lista.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-500">
              Nenhum acordo para este filtro.
            </div>
          ) : (
            lista.map((r) => {
              const pct =
                r.parcelas_total > 0 ? Math.round((r.parcelas_pagas / r.parcelas_total) * 100) : 0
              const alerta = r.risco === 'rescisao_iminente' || r.risco === 'atencao'
              return (
                <Link
                  key={r.acordo_id}
                  href={`/admin/financeiro/parcelamentos/${r.acordo_id}`}
                  className={`block rounded-2xl border bg-white p-4 transition hover:shadow-sm ${
                    alerta ? 'border-red-200' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORGAO_BADGE[r.orgao]}`}
                        >
                          {r.orgao}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[r.status]}`}
                        >
                          {STATUS.find((s) => s.v === r.status)?.label}
                        </span>
                        {r.risco !== 'ok' && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${RISCO_BADGE[r.risco]}`}
                          >
                            {RISCO_LABEL[r.risco]}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-gray-900">{r.descricao}</div>
                      {r.numero && (
                        <div className="mt-0.5 font-mono text-[11px] text-gray-400">{r.numero}</div>
                      )}
                      <div className="mt-0.5 text-xs text-gray-500">{nomeUnidade(r.unidade_id)}</div>
                    </div>
                    <ChevronRight size={18} className="mt-1 shrink-0 text-gray-300" />
                  </div>

                  {r.parcelas_total > 0 ? (
                    <>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-[#ff2d9b] transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs font-medium text-gray-600">
                          {r.parcelas_pagas}/{r.parcelas_total}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="text-gray-400">Pago</div>
                          <div className="font-semibold text-gray-900">
                            {fmtBRL(Number(r.valor_pago))}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Saldo</div>
                          <div className="font-semibold text-gray-900">
                            {fmtBRL(Number(r.saldo_aberto))}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">Próxima</div>
                          <div className="font-semibold text-gray-900">
                            {r.proximo_vencimento ? fmtData(r.proximo_vencimento) : '—'}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      Grade de parcelas ainda não cadastrada
                      {r.valor_consolidado
                        ? ` · consolidado de ${fmtBRL(Number(r.valor_consolidado))}`
                        : ''}
                      .
                    </div>
                  )}
                </Link>
              )
            })
          )}
        </div>

        {/* Pendências fora de acordo */}
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-bold text-gray-900">Fora de acordo</h2>
            <p className="text-xs text-gray-500">
              Débitos e prazos que ainda não estão parcelados nem com exigibilidade suspensa.
            </p>
          </div>
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              Carregando…
            </div>
          ) : pendencias.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Nenhuma pendência cadastrada.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendencias.map((p) => {
                const prazoDias = p.prazo ? diasAte(p.prazo) : null
                return (
                  <div
                    key={p.id}
                    className={`px-4 py-3 ${p.situacao === 'resolvida' ? 'opacity-50' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORGAO_BADGE[p.orgao]}`}
                      >
                        {p.orgao}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${RISCO_BADGE_PEND[p.risco]}`}
                      >
                        Risco {RISCO_LABEL_PEND[p.risco]}
                      </span>
                      {p.situacao !== 'aberta' && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          {SITUACAO_LABEL[p.situacao]}
                        </span>
                      )}
                      {p.guia_pedida_em && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                          <FileCheck2 size={11} />
                          Guia pedida em {fmtData(p.guia_pedida_em)}
                        </span>
                      )}
                      {prazoDias !== null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            prazoDias < 0
                              ? 'bg-red-100 text-red-700'
                              : prazoDias <= 60
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {prazoDias < 0
                            ? `Prazo vencido em ${fmtData(p.prazo)}`
                            : `${prazoDias} dias · ${fmtData(p.prazo)}`}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-gray-900">{p.descricao}</span>
                      <span className="shrink-0 text-sm font-semibold text-gray-900">
                        {p.valor !== null ? fmtBRL(Number(p.valor)) : 'a apurar'}
                      </span>
                    </div>
                    {p.observacao && (
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">{p.observacao}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal — críticos / pedido de guia */}
      {criticosAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <ClipboardList size={19} className="text-red-600" />
                  Críticos — pedir guia
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Só a parcela mais antiga que segura cada acordo no limite de rescisão, e as
                  pendências de risco alto. Selecione o que vai pedir à contabilidade.
                </p>
              </div>
              <button
                onClick={() => setCriticosAberto(false)}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-b border-gray-100 px-5 py-2.5">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={soFaltaPedir}
                  onChange={(e) => setSoFaltaPedir(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                />
                Só o que ainda não teve guia pedida
              </label>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {erro && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {erro}
                </div>
              )}
              {aviso && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
                  {aviso}
                </div>
              )}

              {carregandoCrit ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                  <Loader2 size={16} className="animate-spin" />
                  Carregando…
                </div>
              ) : (
                <>
                  {/* Parcelas em atraso, por acordo */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Parcelas no limite da rescisão
                    </h3>
                    {gruposCrit.length === 0 ? (
                      <div className="mt-2 rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-500">
                        Nenhum acordo no limite de rescisão{soFaltaPedir ? ' sem guia pedida' : ''}.
                      </div>
                    ) : (
                      <div className="mt-2 space-y-3">
                        {gruposCrit.map((g) => {
                          const chaves = g.parcelas.map((p) => `p:${p.id}`)
                          const todos = chaves.every((c) => selecionados.has(c))
                          const soma = g.parcelas.reduce((a, p) => a + Number(p.valor || 0), 0)
                          return (
                            <div key={g.id} className="overflow-hidden rounded-xl border border-red-200">
                              <label className="flex cursor-pointer items-start gap-3 bg-red-50 px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={todos}
                                  onChange={() => alternarGrupo(chaves)}
                                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORGAO_BADGE[g.acordo.orgao]}`}
                                    >
                                      {g.acordo.orgao}
                                    </span>
                                    <span className="text-sm font-semibold text-gray-900">
                                      {g.acordo.descricao}
                                    </span>
                                  </div>
                                  {g.acordo.numero && (
                                    <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                                      {g.acordo.numero}
                                    </div>
                                  )}
                                </div>
                                <span className="shrink-0 text-sm font-bold text-red-700">
                                  {fmtBRL(soma)}
                                </span>
                              </label>
                              <div className="divide-y divide-gray-100">
                                {g.parcelas.map((p) => {
                                  const chave = `p:${p.id}`
                                  return (
                                    <label
                                      key={p.id}
                                      className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selecionados.has(chave)}
                                        onChange={() => alternar(chave)}
                                        className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm text-gray-900">
                                          Parcela {p.numero}
                                          {g.acordo.qtd_parcelas ? `/${g.acordo.qtd_parcelas}` : ''}
                                          {p.estimado && (
                                            <span className="ml-1 font-mono text-amber-600">~</span>
                                          )}
                                          <span className="text-gray-500"> · venc. {fmtData(p.vencimento)}</span>
                                        </div>
                                        {p.guia_pedida_em && (
                                          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                                            <FileCheck2 size={11} />
                                            Guia pedida em {fmtData(p.guia_pedida_em)}
                                          </span>
                                        )}
                                      </div>
                                      <span className="shrink-0 text-sm font-medium text-gray-900">
                                        {Number(p.valor) > 0 ? fmtBRL(Number(p.valor)) : 'valor a informar'}
                                      </span>
                                    </label>
                                  )
                                })}
                              </div>
                              {(foraPorAcordo[g.id] || 0) > 0 && (
                                <div className="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-500">
                                  + {foraPorAcordo[g.id]} parcela{foraPorAcordo[g.id] === 1 ? '' : 's'} em
                                  atraso mais recente{foraPorAcordo[g.id] === 1 ? '' : 's'}, ainda não
                                  crítica{foraPorAcordo[g.id] === 1 ? '' : 's'} — não entra
                                  {foraPorAcordo[g.id] === 1 ? '' : 'm'} aqui.
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Pendências de risco alto */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Pendências de risco alto (fora de acordo)
                    </h3>
                    {pendCritVisiveis.length === 0 ? (
                      <div className="mt-2 rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-500">
                        Nenhuma pendência de risco alto{soFaltaPedir ? ' sem guia pedida' : ''}.
                      </div>
                    ) : (
                      <div className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                        {pendCritVisiveis.map((p) => {
                          const chave = `d:${p.id}`
                          return (
                            <label
                              key={p.id}
                              className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={selecionados.has(chave)}
                                onChange={() => alternar(chave)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORGAO_BADGE[p.orgao]}`}
                                  >
                                    {p.orgao}
                                  </span>
                                  <span className="text-sm text-gray-900">{p.descricao}</span>
                                </div>
                                {p.guia_pedida_em && (
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                                    <FileCheck2 size={11} />
                                    Guia pedida em {fmtData(p.guia_pedida_em)}
                                  </span>
                                )}
                              </div>
                              <span className="shrink-0 text-sm font-medium text-gray-900">
                                {p.valor !== null ? fmtBRL(Number(p.valor)) : 'a apurar'}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-5 py-4">
              <div className="mr-auto text-xs text-gray-500">
                <span className="font-semibold text-gray-900">{selecionados.size}</span> selecionado
                {selecionados.size === 1 ? '' : 's'} ·{' '}
                <span className="font-semibold text-gray-900">{fmtBRL(totalSelecionado)}</span>
              </div>
              <button
                onClick={() => marcarGuia(false)}
                disabled={marcando || selecionados.size === 0}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Desmarcar guia
              </button>
              <button
                onClick={() => marcarGuia(true)}
                disabled={marcando || selecionados.size === 0}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#ff2d9b] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0267f] disabled:opacity-50"
              >
                {marcando ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}
                Marcar guia pedida
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — novo acordo */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Novo acordo</h2>
              <button
                onClick={() => setModalAberto(false)}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {erro && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {erro}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Órgão</label>
                  <select
                    value={form.orgao}
                    onChange={(e) => setForm({ ...form, orgao: e.target.value })}
                    className={inputCls}
                  >
                    {ORGAOS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className={inputCls}
                  >
                    {TIPOS.map((t) => (
                      <option key={t.v} value={t.v}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Descrição <span className="text-[#ff2d9b]">*</span>
                </label>
                <input
                  type="text"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  className={inputCls}
                  placeholder="Ex.: Parcelamento simplificado 2026"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Número do acordo
                </label>
                <input
                  type="text"
                  value={form.numero}
                  onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  className={inputCls}
                  placeholder="Ex.: 0211.00012.0083423774.23-01"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Valor consolidado
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.valor_consolidado}
                    onChange={(e) => setForm({ ...form, valor_consolidado: e.target.value })}
                    className={inputCls}
                    placeholder="55.501,92"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Situação</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className={inputCls}
                  >
                    {STATUS.map((s) => (
                      <option key={s.v} value={s.v}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Centro de custo
                  </label>
                  <select
                    value={form.unidade_id}
                    onChange={(e) => setForm({ ...form, unidade_id: e.target.value })}
                    className={inputCls}
                  >
                    <option value="geral">Geral</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Rescinde com
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={form.limite_rescisao}
                      onChange={(e) => setForm({ ...form, limite_rescisao: e.target.value })}
                      className={inputCls}
                    />
                    <span className="shrink-0 text-xs text-gray-500">atrasos</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Observação</label>
                <textarea
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  rows={3}
                  className={inputCls}
                  placeholder="O que a contabilidade informou, o que falta conferir…"
                />
              </div>
            </div>

            <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setModalAberto(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvarAcordo}
                disabled={salvando}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#ff2d9b] py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0267f] disabled:opacity-50"
              >
                {salvando && <Loader2 size={15} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
