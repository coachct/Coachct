'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { BarChart3, Loader2, TrendingUp, TrendingDown } from 'lucide-react'

const supabase = createClient()

type Unidade = { id: string; nome: string }
type FatRow = { unidade_id: string | null; total: number }
type DespRow = {
  unidade_id: string | null
  categoria_id: string | null
  categoria_nome: string | null
  grupo: string | null
  total: number
}
type ResRow = {
  unidade_id: string | null
  faturamento: number
  despesas: number
  resultado: number
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const ORDEM_GRUPOS = ['Pessoal', 'Custo Fixo', 'Variável', 'Impostos', 'Outros', 'Sem categoria']

function recuar(ano: number, mes: number, n: number): { ano: number; mes: number } {
  let m = mes - n
  let y = ano
  while (m < 1) {
    m += 12
    y -= 1
  }
  return { ano: y, mes: m }
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function money(v: number): string {
  return v === 0 ? '–' : fmtBRL(v)
}

export default function FinanceiroDREPage() {
  const { loading: authLoading } = useAuth()

  const agora = new Date()
  const [ano, setAno] = useState(agora.getFullYear())
  const [mes, setMes] = useState(agora.getMonth() + 1)
  const [modo, setModo] = useState<'competencia' | 'caixa'>('competencia')

  const anos = [agora.getFullYear() - 1, agora.getFullYear(), agora.getFullYear() + 1]

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [faturamento, setFaturamento] = useState<FatRow[]>([])
  const [despesasRows, setDespesasRows] = useState<DespRow[]>([])
  const [comparativo, setComparativo] = useState<
    { label: string; fat: number; desp: number; res: number }[]
  >([])

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const prev1 = recuar(ano, mes, 1)
    const prev2 = recuar(ano, mes, 2)

    const [resUni, resFat, resDesp, resR1, resR2] = await Promise.all([
      supabase.from('unidades').select('id, nome').order('nome', { ascending: true }),
      supabase.rpc('fin_faturamento', { p_ano: ano, p_mes: mes, p_modo: modo }),
      supabase.rpc('fin_despesas', { p_ano: ano, p_mes: mes, p_modo: modo }),
      supabase.rpc('fin_resultado', { p_ano: prev1.ano, p_mes: prev1.mes, p_modo: modo }),
      supabase.rpc('fin_resultado', { p_ano: prev2.ano, p_mes: prev2.mes, p_modo: modo }),
    ])

    if (resFat.error || resDesp.error) {
      setErro('Não foi possível carregar os dados financeiros.')
      setCarregando(false)
      return
    }

    const fat: FatRow[] = ((resFat.data as any[]) || []).map((r) => ({
      unidade_id: r.unidade_id,
      total: Number(r.total || 0),
    }))
    const desp: DespRow[] = ((resDesp.data as any[]) || []).map((r) => ({
      unidade_id: r.unidade_id,
      categoria_id: r.categoria_id,
      categoria_nome: r.categoria_nome,
      grupo: r.grupo,
      total: Number(r.total || 0),
    }))

    setUnidades((resUni.data as Unidade[]) || [])
    setFaturamento(fat)
    setDespesasRows(desp)

    const somaRes = (rows: any[]) => {
      let f = 0
      let d = 0
      ;(rows || []).forEach((r) => {
        f += Number(r.faturamento || 0)
        d += Number(r.despesas || 0)
      })
      return { fat: f, desp: d, res: f - d }
    }

    const totalFatAtual = fat.reduce((a, r) => a + r.total, 0)
    const totalDespAtual = desp.reduce((a, r) => a + r.total, 0)

    setComparativo([
      {
        label: `${MESES[prev2.mes - 1].slice(0, 3)}/${String(prev2.ano).slice(2)}`,
        ...somaRes((resR2.data as any[]) || []),
      },
      {
        label: `${MESES[prev1.mes - 1].slice(0, 3)}/${String(prev1.ano).slice(2)}`,
        ...somaRes((resR1.data as any[]) || []),
      },
      {
        label: `${MESES[mes - 1].slice(0, 3)}/${String(ano).slice(2)}`,
        fat: totalFatAtual,
        desp: totalDespAtual,
        res: totalFatAtual - totalDespAtual,
      },
    ])

    setCarregando(false)
  }

  useEffect(() => {
    if (!authLoading) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, ano, mes, modo])

  // ---- montagem das colunas e da matriz da DRE ----
  const temGeral = useMemo(() => {
    const fatGeral = faturamento.some((r) => r.unidade_id === null && r.total !== 0)
    const despGeral = despesasRows.some((r) => r.unidade_id === null)
    return fatGeral || despGeral
  }, [faturamento, despesasRows])

  const colunas = useMemo(() => {
    const cols: { key: string; label: string }[] = unidades.map((u) => ({
      key: u.id,
      label: u.nome,
    }))
    if (temGeral) cols.push({ key: 'geral', label: 'Geral' })
    cols.push({ key: 'total', label: 'Total' })
    return cols
  }, [unidades, temGeral])

  const keyDe = (unidade_id: string | null) => (unidade_id === null ? 'geral' : unidade_id)

  const fatPorColuna = useMemo(() => {
    const m: Record<string, number> = {}
    faturamento.forEach((r) => {
      const k = keyDe(r.unidade_id)
      m[k] = (m[k] || 0) + r.total
    })
    m.total = faturamento.reduce((a, r) => a + r.total, 0)
    return m
  }, [faturamento])

  // grupos -> categorias -> valores por coluna
  const grupos = useMemo(() => {
    const map = new Map<string, Map<string, Record<string, number>>>()
    despesasRows.forEach((r) => {
      const grupo = r.grupo || 'Sem categoria'
      const cat = r.categoria_nome || 'Sem categoria'
      if (!map.has(grupo)) map.set(grupo, new Map())
      const catMap = map.get(grupo)!
      if (!catMap.has(cat)) catMap.set(cat, {})
      const linha = catMap.get(cat)!
      const k = keyDe(r.unidade_id)
      linha[k] = (linha[k] || 0) + r.total
      linha.total = (linha.total || 0) + r.total
    })

    const gruposOrdenados = Array.from(map.keys()).sort((a, b) => {
      const ia = ORDEM_GRUPOS.indexOf(a)
      const ib = ORDEM_GRUPOS.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })

    return gruposOrdenados.map((g) => ({
      grupo: g,
      categorias: Array.from(map.get(g)!.entries()).map(([nome, valores]) => ({
        nome,
        valores,
      })),
    }))
  }, [despesasRows])

  const despPorColuna = useMemo(() => {
    const m: Record<string, number> = {}
    despesasRows.forEach((r) => {
      const k = keyDe(r.unidade_id)
      m[k] = (m[k] || 0) + r.total
    })
    m.total = despesasRows.reduce((a, r) => a + r.total, 0)
    return m
  }, [despesasRows])

  const resumo = useMemo(() => {
    const fat = fatPorColuna.total || 0
    const desp = despPorColuna.total || 0
    const res = fat - desp
    const margem = fat > 0 ? (res / fat) * 100 : 0
    return { fat, desp, res, margem }
  }, [fatPorColuna, despPorColuna])

  const maxComparativo = useMemo(
    () => Math.max(1, ...comparativo.map((c) => Math.max(c.fat, c.desp))),
    [comparativo]
  )

  const inputCls =
    'rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20'

  function celValor(valores: Record<string, number>, key: string): number {
    return valores[key] || 0
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d9b]/10 text-[#ff2d9b]">
              <BarChart3 size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Financeiro · Visão Geral</h1>
              <p className="text-sm text-gray-500">
                Resultado por unidade — {MESES[mes - 1]} {ano}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputCls}>
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className={inputCls}>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex rounded-xl border border-gray-200 p-0.5">
              <button
                onClick={() => setModo('competencia')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  modo === 'competencia'
                    ? 'bg-[#ff2d9b] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Competência
              </button>
              <button
                onClick={() => setModo('caixa')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  modo === 'caixa' ? 'bg-[#ff2d9b] text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Caixa
              </button>
            </div>
          </div>
        </div>

        {erro && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white py-20 text-gray-500">
            <Loader2 size={18} className="animate-spin" />
            Carregando…
          </div>
        ) : (
          <>
            {/* Cards de resumo */}
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Faturamento
                </div>
                <div className="mt-1 text-xl font-bold text-gray-900">{fmtBRL(resumo.fat)}</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Despesas
                </div>
                <div className="mt-1 text-xl font-bold text-amber-600">{fmtBRL(resumo.desp)}</div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Resultado
                </div>
                <div
                  className={`mt-1 flex items-center gap-1 text-xl font-bold ${
                    resumo.res >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {resumo.res >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  {fmtBRL(resumo.res)}
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Margem
                </div>
                <div
                  className={`mt-1 text-xl font-bold ${
                    resumo.res >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {resumo.margem.toFixed(1).replace('.', ',')}%
                </div>
              </div>
            </div>

            {/* DRE */}
            <div className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-3">
                <h2 className="text-base font-bold text-gray-900">
                  DRE por unidade ·{' '}
                  <span className="font-normal text-gray-500">
                    {modo === 'competencia' ? 'regime de competência' : 'regime de caixa'}
                  </span>
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3 font-medium">Conta</th>
                      {colunas.map((c) => (
                        <th
                          key={c.key}
                          className={`px-4 py-3 text-right font-medium ${
                            c.key === 'total' ? 'text-gray-700' : ''
                          }`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Receita */}
                    <tr className="bg-gray-50/60">
                      <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Receita
                      </td>
                      {colunas.map((c) => (
                        <td key={c.key} className="px-4 py-2" />
                      ))}
                    </tr>
                    <tr className="border-b border-gray-50">
                      <td className="px-4 py-2.5 text-gray-700">Faturamento</td>
                      {colunas.map((c) => (
                        <td
                          key={c.key}
                          className={`px-4 py-2.5 text-right ${
                            c.key === 'total' ? 'font-semibold text-gray-900' : 'text-gray-700'
                          }`}
                        >
                          {money(fatPorColuna[c.key] || 0)}
                        </td>
                      ))}
                    </tr>

                    {/* Despesas */}
                    <tr className="bg-gray-50/60">
                      <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Despesas
                      </td>
                      {colunas.map((c) => (
                        <td key={c.key} className="px-4 py-2" />
                      ))}
                    </tr>

                    {grupos.length === 0 && (
                      <tr className="border-b border-gray-50">
                        <td className="px-4 py-2.5 text-gray-400" colSpan={colunas.length + 1}>
                          Nenhuma despesa no período.
                        </td>
                      </tr>
                    )}

                    {grupos.map((g) => (
                      <FragmentGrupo
                        key={g.grupo}
                        grupo={g.grupo}
                        categorias={g.categorias}
                        colunas={colunas}
                        celValor={celValor}
                      />
                    ))}

                    {grupos.length > 0 && (
                      <tr className="border-y border-gray-100 bg-gray-50/40">
                        <td className="px-4 py-2.5 font-semibold text-gray-700">Total despesas</td>
                        {colunas.map((c) => (
                          <td
                            key={c.key}
                            className="px-4 py-2.5 text-right font-semibold text-amber-700"
                          >
                            {money(despPorColuna[c.key] || 0)}
                          </td>
                        ))}
                      </tr>
                    )}

                    {/* Resultado */}
                    <tr className="border-t-2 border-gray-200">
                      <td className="px-4 py-3 font-bold text-gray-900">Resultado</td>
                      {colunas.map((c) => {
                        const v = (fatPorColuna[c.key] || 0) - (despPorColuna[c.key] || 0)
                        return (
                          <td
                            key={c.key}
                            className={`px-4 py-3 text-right font-bold ${
                              v >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {fmtBRL(v)}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Margem */}
                    <tr>
                      <td className="px-4 py-2.5 text-gray-500">Margem</td>
                      {colunas.map((c) => {
                        const fat = fatPorColuna[c.key] || 0
                        const v = fat - (despPorColuna[c.key] || 0)
                        const margem = fat > 0 ? (v / fat) * 100 : 0
                        return (
                          <td
                            key={c.key}
                            className={`px-4 py-2.5 text-right text-sm ${
                              v >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {fat > 0 ? `${margem.toFixed(1).replace('.', ',')}%` : '–'}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Comparativo 3 meses */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-3">
                <h2 className="text-base font-bold text-gray-900">Últimos 3 meses</h2>
              </div>
              <div className="space-y-4 px-5 py-4">
                {comparativo.map((c) => (
                  <div key={c.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{c.label}</span>
                      <span
                        className={`font-semibold ${
                          c.res >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {fmtBRL(c.res)}
                      </span>
                    </div>
                    <div className="flex h-3 w-full gap-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${(c.fat / maxComparativo) * 100}%` }}
                        title={`Faturamento ${fmtBRL(c.fat)}`}
                      />
                    </div>
                    <div className="mt-1 flex h-3 w-full gap-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${(c.desp / maxComparativo) * 100}%` }}
                        title={`Despesas ${fmtBRL(c.desp)}`}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-gray-400">
                      <span>Fat. {fmtBRL(c.fat)}</span>
                      <span>Desp. {fmtBRL(c.desp)}</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 pt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Faturamento
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Despesas
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FragmentGrupo({
  grupo,
  categorias,
  colunas,
  celValor,
}: {
  grupo: string
  categorias: { nome: string; valores: Record<string, number> }[]
  colunas: { key: string; label: string }[]
  celValor: (valores: Record<string, number>, key: string) => number
}) {
  return (
    <>
      <tr>
        <td
          className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-gray-400"
          colSpan={colunas.length + 1}
        >
          {grupo}
        </td>
      </tr>
      {categorias.map((cat) => (
        <tr key={cat.nome} className="border-b border-gray-50">
          <td className="px-4 py-2 pl-6 text-gray-600">{cat.nome}</td>
          {colunas.map((c) => (
            <td
              key={c.key}
              className={`px-4 py-2 text-right ${
                c.key === 'total' ? 'font-medium text-gray-700' : 'text-gray-600'
              }`}
            >
              {money(celValor(cat.valores, c.key))}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
