'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react'

const supabase = createClient()

type Categoria = { id: string; nome: string; grupo: string }
type Unidade = { id: string; nome: string }
type Fornecedor = { id: string; nome: string; ativo: boolean }

type Despesa = {
  id: string
  unidade_id: string | null
  fornecedor_id: string | null
  categoria_id: string | null
  descricao: string
  valor: number
  competencia: string
  vencimento: string | null
  pago: boolean
  pago_em: string | null
  forma_pagamento: string | null
  origem: 'manual' | 'recorrente' | 'coach'
  observacao: string | null
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const FORMAS = ['Pix', 'Boleto', 'Transferência', 'Cartão', 'Dinheiro', 'Débito automático']

const ORIGEM_LABEL: Record<string, string> = {
  manual: 'Manual',
  recorrente: 'Recorrente',
  coach: 'Coach',
}
const ORIGEM_BADGE: Record<string, string> = {
  manual: 'bg-gray-100 text-gray-600',
  recorrente: 'bg-purple-100 text-purple-700',
  coach: 'bg-pink-100 text-pink-700',
}

function hojeLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}
function competenciaStr(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`
}
function fmtData(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}
function fmtCompetencia(d: string): string {
  const [y, m] = d.split('-')
  return `${MESES[Number(m) - 1]}/${y}`
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

export default function ContasAPagarPage() {
  const { user, loading: authLoading } = useAuth()

  const agora = new Date()
  const anoAtual = agora.getFullYear()
  const mesAtual = agora.getMonth() + 1
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1]
  const hoje = hojeLocalStr()

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])

  // ---- filtros ----
  const [baseMes, setBaseMes] = useState<'competencia' | 'vencimento'>('competencia')
  const [fTodosMeses, setFTodosMeses] = useState(false)
  const [fMes, setFMes] = useState(mesAtual)
  const [fAno, setFAno] = useState(anoAtual)
  const [fUnidade, setFUnidade] = useState('todas')
  const [fStatus, setFStatus] = useState<'todas' | 'aberto' | 'pago'>('todas')
  const [fCategoria, setFCategoria] = useState('todas')

  // ---- seleção em lote ----
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [bData, setBData] = useState(hoje)
  const [bSalvando, setBSalvando] = useState(false)

  // ---- modal ----
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Despesa | null>(null)
  const [mUnidade, setMUnidade] = useState('')
  const [mFornecedor, setMFornecedor] = useState('')
  const [mCategoria, setMCategoria] = useState('')
  const [mDescricao, setMDescricao] = useState('')
  const [mValor, setMValor] = useState('')
  const [mMes, setMMes] = useState(mesAtual)
  const [mAno, setMAno] = useState(anoAtual)
  const [mVencimento, setMVencimento] = useState(hoje)
  const [mForma, setMForma] = useState('')
  const [mObservacao, setMObservacao] = useState('')
  const [mPago, setMPago] = useState(false)
  const [mPagoEm, setMPagoEm] = useState(hoje)
  const [mSalvando, setMSalvando] = useState(false)
  const [mErro, setMErro] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true)
    setErro(null)
    setSelecionadas(new Set())

    const [resD, resC, resU, resF] = await Promise.all([
      supabase
        .from('despesas')
        .select('*')
        .is('excluido_em', null)
        .order('vencimento', { ascending: true, nullsFirst: false }),
      supabase
        .from('categorias_despesa')
        .select('id, nome, grupo')
        .eq('ativo', true)
        .order('ordem', { ascending: true }),
      supabase.from('unidades').select('id, nome').order('nome', { ascending: true }),
      supabase.from('fornecedores').select('id, nome, ativo').order('nome', { ascending: true }),
    ])

    if (resD.error) {
      setErro('Não foi possível carregar as despesas.')
      setCarregando(false)
      return
    }

    setDespesas((resD.data as Despesa[]) || [])
    setCategorias((resC.data as Categoria[]) || [])
    setUnidades((resU.data as Unidade[]) || [])
    setFornecedores((resF.data as Fornecedor[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    if (!authLoading) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  const categoriaPorId = useMemo(() => {
    const m = new Map<string, Categoria>()
    categorias.forEach((c) => m.set(c.id, c))
    return m
  }, [categorias])

  const unidadePorId = useMemo(() => {
    const m = new Map<string, string>()
    unidades.forEach((u) => m.set(u.id, u.nome))
    return m
  }, [unidades])

  const fornecedorPorId = useMemo(() => {
    const m = new Map<string, string>()
    fornecedores.forEach((f) => m.set(f.id, f.nome))
    return m
  }, [fornecedores])

  function nomeUnidade(id: string | null): string {
    if (!id) return 'Geral'
    return unidadePorId.get(id) || '—'
  }

  const lista = useMemo(() => {
    return despesas.filter((d) => {
      if (!fTodosMeses) {
        const base = baseMes === 'competencia' ? d.competencia : d.vencimento
        if (!base) return false
        const [y, m] = base.split('-').map(Number)
        if (y !== fAno || m !== fMes) return false
      }
      if (fUnidade === 'geral' && d.unidade_id !== null) return false
      if (fUnidade !== 'todas' && fUnidade !== 'geral' && d.unidade_id !== fUnidade) return false
      if (fStatus === 'aberto' && d.pago) return false
      if (fStatus === 'pago' && !d.pago) return false
      if (fCategoria === 'sem' && d.categoria_id !== null) return false
      if (fCategoria !== 'todas' && fCategoria !== 'sem' && d.categoria_id !== fCategoria)
        return false
      return true
    })
  }, [despesas, fTodosMeses, baseMes, fMes, fAno, fUnidade, fStatus, fCategoria])

  const totais = useMemo(() => {
    let aberto = 0
    let pago = 0
    lista.forEach((d) => {
      if (d.pago) pago += Number(d.valor || 0)
      else aberto += Number(d.valor || 0)
    })
    return { aberto, pago, total: aberto + pago }
  }, [lista])

  // ids em aberto da lista filtrada (selecionáveis)
  const idsSelecionaveis = useMemo(
    () => lista.filter((d) => !d.pago).map((d) => d.id),
    [lista]
  )

  const todasSelecionadas =
    idsSelecionaveis.length > 0 && idsSelecionaveis.every((id) => selecionadas.has(id))

  function toggleSel(id: string) {
    setSelecionadas((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function toggleTodas() {
    if (todasSelecionadas) {
      setSelecionadas(new Set())
    } else {
      setSelecionadas(new Set(idsSelecionaveis))
    }
  }

  const somaSelecionadas = useMemo(() => {
    let s = 0
    despesas.forEach((d) => {
      if (selecionadas.has(d.id)) s += Number(d.valor || 0)
    })
    return s
  }, [despesas, selecionadas])

  async function marcarSelecionadasPagas() {
    if (selecionadas.size === 0) return
    setBSalvando(true)
    const ids = [...selecionadas]
    const { error } = await supabase
      .from('despesas')
      .update({ pago: true, pago_em: bData || hoje })
      .in('id', ids)
    setBSalvando(false)
    if (!error) {
      setSelecionadas(new Set())
      carregar()
    }
  }

  async function alternarPago(d: Despesa) {
    const novo = !d.pago
    const payload = novo
      ? { pago: true, pago_em: hoje }
      : { pago: false, pago_em: null }
    const { error } = await supabase.from('despesas').update(payload).eq('id', d.id)
    if (!error) {
      setDespesas((prev) =>
        prev.map((x) =>
          x.id === d.id
            ? { ...x, pago: novo, pago_em: novo ? hoje : null }
            : x
        )
      )
      if (novo) {
        setSelecionadas((prev) => {
          const n = new Set(prev)
          n.delete(d.id)
          return n
        })
      }
    }
  }

  // ---- modal ----
  function abrirNova() {
    setEditando(null)
    setMUnidade('')
    setMFornecedor('')
    setMCategoria('')
    setMDescricao('')
    setMValor('')
    setMMes(mesAtual)
    setMAno(anoAtual)
    setMVencimento(hoje)
    setMForma('')
    setMObservacao('')
    setMPago(false)
    setMPagoEm(hoje)
    setMErro(null)
    setModalAberto(true)
  }

  function abrirEdicao(d: Despesa) {
    setEditando(d)
    setMUnidade(d.unidade_id === null ? 'geral' : d.unidade_id)
    setMFornecedor(d.fornecedor_id || '')
    setMCategoria(d.categoria_id || '')
    setMDescricao(d.descricao || '')
    setMValor(String(d.valor).replace('.', ','))
    const [y, m] = d.competencia.split('-')
    setMAno(Number(y))
    setMMes(Number(m))
    setMVencimento(d.vencimento || hoje)
    setMForma(d.forma_pagamento || '')
    setMObservacao(d.observacao || '')
    setMPago(d.pago)
    setMPagoEm(d.pago_em || hoje)
    setMErro(null)
    setModalAberto(true)
  }

  function fecharModal() {
    if (mSalvando) return
    setModalAberto(false)
    setEditando(null)
  }

  async function salvarModal() {
    const valorNum = parseValor(mValor)
    if (!mDescricao.trim()) {
      setMErro('Informe a descrição.')
      return
    }
    if (valorNum <= 0) {
      setMErro('Informe um valor maior que zero.')
      return
    }
    if (!mUnidade) {
      setMErro('Selecione a unidade (ou Geral).')
      return
    }

    setMSalvando(true)
    setMErro(null)

    const payload: any = {
      unidade_id: mUnidade === 'geral' ? null : mUnidade,
      fornecedor_id: mFornecedor || null,
      categoria_id: mCategoria || null,
      descricao: mDescricao.trim(),
      valor: valorNum,
      competencia: competenciaStr(mAno, mMes),
      vencimento: mVencimento || null,
      forma_pagamento: mForma || null,
      observacao: mObservacao.trim() || null,
      pago: mPago,
      pago_em: mPago ? mPagoEm || null : null,
    }

    let res
    if (editando) {
      res = await supabase.from('despesas').update(payload).eq('id', editando.id)
    } else {
      res = await supabase
        .from('despesas')
        .insert({ ...payload, origem: 'manual', criado_por: user?.id ?? null })
    }

    if (res.error) {
      setMErro('Erro ao salvar. Tente novamente.')
      setMSalvando(false)
      return
    }

    setMSalvando(false)
    fecharModal()
    carregar()
  }

  async function excluir(d: Despesa) {
    const ok = window.confirm(`Excluir a despesa "${d.descricao}" (${fmtBRL(Number(d.valor))})?`)
    if (!ok) return
    const { error } = await supabase
      .from('despesas')
      .update({ excluido_em: new Date().toISOString(), excluido_por: user?.id ?? null })
      .eq('id', d.id)
    if (!error) {
      setDespesas((prev) => prev.filter((x) => x.id !== d.id))
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20'

  const fornecedoresAtivos = fornecedores.filter((f) => f.ativo || f.id === mFornecedor)

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-6 pb-28 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d9b]/10 text-[#ff2d9b]">
              <Wallet size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Contas a Pagar</h1>
              <p className="text-sm text-gray-500">Despesas, vencimentos e baixas</p>
            </div>
          </div>

          <button
            onClick={abrirNova}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f]"
          >
            <Plus size={18} />
            Nova despesa
          </button>
        </div>

        {erro && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Resumo */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Em aberto
            </div>
            <div className="mt-1 text-xl font-bold text-amber-600">{fmtBRL(totais.aberto)}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Pago</div>
            <div className="mt-1 text-xl font-bold text-green-600">{fmtBRL(totais.pago)}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Total no período
            </div>
            <div className="mt-1 text-xl font-bold text-gray-900">{fmtBRL(totais.total)}</div>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Base do mês</label>
            <div className="flex rounded-xl border border-gray-200 p-0.5">
              <button
                onClick={() => setBaseMes('competencia')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  baseMes === 'competencia'
                    ? 'bg-[#ff2d9b] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Competência
              </button>
              <button
                onClick={() => setBaseMes('vencimento')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  baseMes === 'vencimento'
                    ? 'bg-[#ff2d9b] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Vencimento
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Mês</label>
            <div className="flex gap-2">
              <select
                value={fMes}
                onChange={(e) => setFMes(Number(e.target.value))}
                disabled={fTodosMeses}
                className={`${inputCls} ${fTodosMeses ? 'opacity-50' : ''}`}
              >
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={fAno}
                onChange={(e) => setFAno(Number(e.target.value))}
                disabled={fTodosMeses}
                className={`${inputCls} ${fTodosMeses ? 'opacity-50' : ''}`}
              >
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="mb-2.5 flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={fTodosMeses}
              onChange={(e) => setFTodosMeses(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
            />
            Todos os meses
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Unidade</label>
            <select value={fUnidade} onChange={(e) => setFUnidade(e.target.value)} className={inputCls}>
              <option value="todas">Todas</option>
              <option value="geral">Geral</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value as any)}
              className={inputCls}
            >
              <option value="todas">Todas</option>
              <option value="aberto">Em aberto</option>
              <option value="pago">Pago</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Categoria</label>
            <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)} className={inputCls}>
              <option value="todas">Todas</option>
              <option value="sem">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Lista */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
              <Loader2 size={18} className="animate-spin" />
              Carregando…
            </div>
          ) : lista.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">
              Nenhuma despesa encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] leading-5">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-2 py-3">
                      <input
                        type="checkbox"
                        checked={todasSelecionadas}
                        onChange={toggleTodas}
                        disabled={idsSelecionaveis.length === 0}
                        className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                        title="Selecionar todas em aberto"
                      />
                    </th>
                    <th className="px-2 py-3 font-medium">Descrição</th>
                    <th className="px-2 py-3 font-medium">Fornecedor</th>
                    <th className="px-2 py-3 font-medium">Unidade</th>
                    <th className="px-2 py-3 font-medium">Categoria</th>
                    <th className="hidden px-2 py-3 font-medium 2xl:table-cell">Origem</th>
                    <th className="px-2 py-3 font-medium">Compet.</th>
                    <th className="px-2 py-3 font-medium">Venc.</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="px-2 py-3 text-right font-medium">Valor</th>
                    <th className="px-2 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((d) => {
                    const cat = d.categoria_id ? categoriaPorId.get(d.categoria_id) : null
                    const vencida = !!d.vencimento && !d.pago && d.vencimento < hoje
                    return (
                      <tr
                        key={d.id}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                      >
                        <td className="px-2 py-3">
                          {!d.pago ? (
                            <input
                              type="checkbox"
                              checked={selecionadas.has(d.id)}
                              onChange={() => toggleSel(d.id)}
                              className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                            />
                          ) : (
                            <span className="block h-4 w-4" />
                          )}
                        </td>
                        <td className="px-2 py-3 font-medium text-gray-900">{d.descricao}</td>
                        <td className="px-2 py-3 text-gray-600">
                          {d.fornecedor_id ? fornecedorPorId.get(d.fornecedor_id) || '—' : '—'}
                        </td>
                        <td className="px-2 py-3 text-gray-600">{nomeUnidade(d.unidade_id)}</td>
                        <td className="px-2 py-3">
                          {cat ? (
                            <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {cat.nome}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="hidden px-2 py-3 2xl:table-cell">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ORIGEM_BADGE[d.origem]}`}
                          >
                            {ORIGEM_LABEL[d.origem]}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-gray-600">{fmtCompetencia(d.competencia)}</td>
                        <td className={`px-2 py-3 ${vencida ? 'font-semibold text-red-600' : 'text-gray-600'}`}>
                          {fmtData(d.vencimento)}
                        </td>
                        <td className="px-2 py-3">
                          {d.pago ? (
                            <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              Pago {d.pago_em ? `· ${fmtData(d.pago_em)}` : ''}
                            </span>
                          ) : vencida ? (
                            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              Vencida
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Em aberto
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-right font-semibold text-gray-900">
                          {fmtBRL(Number(d.valor))}
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              onClick={() => alternarPago(d)}
                              title={d.pago ? 'Reverter para em aberto' : 'Marcar como paga'}
                              className={`rounded-lg p-1.5 transition hover:bg-gray-100 ${
                                d.pago
                                  ? 'text-gray-500 hover:text-amber-600'
                                  : 'text-gray-500 hover:text-green-600'
                              }`}
                            >
                              {d.pago ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
                            </button>
                            <button
                              onClick={() => abrirEdicao(d)}
                              title="Editar"
                              className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[#ff2d9b]"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => excluir(d)}
                              title="Excluir"
                              className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-red-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Barra de ação em lote */}
      {selecionadas.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
            <div className="text-sm text-gray-700">
              <span className="font-semibold text-gray-900">{selecionadas.size}</span> selecionada(s)
              {' · '}
              <span className="font-semibold text-gray-900">{fmtBRL(somaSelecionadas)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelecionadas(new Set())}
                className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              >
                Limpar
              </button>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">Pago em</label>
                <input
                  type="date"
                  value={bData}
                  onChange={(e) => setBData(e.target.value)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20"
                />
              </div>
              <button
                onClick={marcarSelecionadasPagas}
                disabled={bSalvando}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f] disabled:opacity-60"
              >
                {bSalvando && <Loader2 size={16} className="animate-spin" />}
                Marcar como pagas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nova / edição */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editando ? 'Editar despesa' : 'Nova despesa'}
              </h2>
              <button
                onClick={fecharModal}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {mErro && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                  {mErro}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Descrição <span className="text-[#ff2d9b]">*</span>
                </label>
                <input
                  type="text"
                  value={mDescricao}
                  onChange={(e) => setMDescricao(e.target.value)}
                  placeholder="Ex.: Conta de energia"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Unidade</label>
                  <select value={mUnidade} onChange={(e) => setMUnidade(e.target.value)} className={inputCls}>
                    <option value="">— Selecione —</option>
                    <option value="geral">Geral</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Categoria</label>
                  <select value={mCategoria} onChange={(e) => setMCategoria(e.target.value)} className={inputCls}>
                    <option value="">— Sem categoria —</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} ({c.grupo})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Fornecedor</label>
                <select value={mFornecedor} onChange={(e) => setMFornecedor(e.target.value)} className={inputCls}>
                  <option value="">— Sem fornecedor —</option>
                  {fornecedoresAtivos.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Valor <span className="text-[#ff2d9b]">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      R$
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={mValor}
                      onChange={(e) => setMValor(e.target.value)}
                      placeholder="0,00"
                      className={`${inputCls} pl-9`}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Vencimento</label>
                  <input
                    type="date"
                    value={mVencimento}
                    onChange={(e) => setMVencimento(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Competência</label>
                  <div className="flex gap-2">
                    <select value={mMes} onChange={(e) => setMMes(Number(e.target.value))} className={inputCls}>
                      {MESES.map((m, i) => (
                        <option key={i} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select value={mAno} onChange={(e) => setMAno(Number(e.target.value))} className={inputCls}>
                      {anos.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Forma de pagamento
                  </label>
                  <select value={mForma} onChange={(e) => setMForma(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {FORMAS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Observação</label>
                <textarea
                  value={mObservacao}
                  onChange={(e) => setMObservacao(e.target.value)}
                  rows={2}
                  className={`${inputCls} resize-none`}
                  placeholder="Opcional"
                />
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={mPago}
                    onChange={(e) => setMPago(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                  />
                  Já paga
                </label>
                {mPago && (
                  <input
                    type="date"
                    value={mPagoEm}
                    onChange={(e) => setMPagoEm(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                onClick={fecharModal}
                disabled={mSalvando}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvarModal}
                disabled={mSalvando}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f] disabled:opacity-60"
              >
                {mSalvando && <Loader2 size={16} className="animate-spin" />}
                {editando ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
