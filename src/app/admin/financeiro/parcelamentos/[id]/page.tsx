'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  ArrowLeft,
  Loader2,
  X,
  CheckCircle2,
  RotateCcw,
  TriangleAlert,
  ListPlus,
  ExternalLink,
} from 'lucide-react'

const supabase = createClient()

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const ORGAO_BADGE: Record<string, string> = {
  RFB: 'bg-blue-100 text-blue-700',
  PGFN: 'bg-indigo-100 text-indigo-700',
  PMSP: 'bg-amber-100 text-amber-700',
  PGM: 'bg-orange-100 text-orange-700',
  INSS: 'bg-teal-100 text-teal-700',
}
const STATUS_LABEL: Record<string, string> = {
  simulado: 'Simulado',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  quitado: 'Quitado',
  rescindido: 'Rescindido',
}
const STATUS_BADGE: Record<string, string> = {
  simulado: 'bg-gray-100 text-gray-500',
  ativo: 'bg-green-100 text-green-700',
  suspenso: 'bg-sky-100 text-sky-700',
  quitado: 'bg-gray-100 text-gray-600',
  rescindido: 'bg-red-100 text-red-700',
}
const STATUS_OPCOES = ['simulado', 'ativo', 'suspenso', 'quitado', 'rescindido']

type Unidade = { id: string; nome: string }

type Acordo = {
  id: string
  orgao: string
  numero: string | null
  descricao: string
  tipo: string
  valor_consolidado: number | null
  qtd_parcelas: number | null
  dia_vencimento: number | null
  status: string
  limite_rescisao: number
  unidade_id: string | null
  observacao: string | null
}

type Parcela = {
  id: string
  numero: number
  competencia: string
  vencimento: string
  valor: number
  estimado: boolean
  pago: boolean
  pago_em: string | null
  valor_pago: number | null
  despesa_id: string | null
  observacao: string | null
}

function hojeLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

export default function AcordoDetalhePage() {
  const params = useParams()
  const acordoId = String(params?.id || '')
  const { loading: authLoading } = useAuth()
  const hoje = hojeLocalStr()

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [acordo, setAcordo] = useState<Acordo | null>(null)
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])

  const [soAbertas, setSoAbertas] = useState(false)

  // baixa de parcela
  const [baixa, setBaixa] = useState<Parcela | null>(null)
  const [bData, setBData] = useState(hoje)
  const [bValor, setBValor] = useState('')
  const [bSalvando, setBSalvando] = useState(false)

  // gerar grade
  const [gerarAberto, setGerarAberto] = useState(false)
  const [gPrimeiroVenc, setGPrimeiroVenc] = useState(hoje)
  const [gQtd, setGQtd] = useState('60')
  const [gValorDemais, setGValorDemais] = useState('')
  const [gValorPrimeira, setGValorPrimeira] = useState('')
  const [gEstimado, setGEstimado] = useState(true)
  const [gSalvando, setGSalvando] = useState(false)

  // status do acordo
  const [statusSalvando, setStatusSalvando] = useState(false)

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const [resAcordo, resParcelas, resUni] = await Promise.all([
      supabase.from('fiscal_acordos').select('*').eq('id', acordoId).maybeSingle(),
      supabase
        .from('fiscal_parcelas')
        .select('id, numero, competencia, vencimento, valor, estimado, pago, pago_em, valor_pago, despesa_id, observacao')
        .eq('acordo_id', acordoId)
        .order('numero', { ascending: true }),
      supabase.from('unidades').select('id, nome').order('nome', { ascending: true }),
    ])

    if (resAcordo.error || !resAcordo.data) {
      setErro('Acordo não encontrado.')
      setCarregando(false)
      return
    }

    setAcordo(resAcordo.data as Acordo)
    setParcelas((resParcelas.data as Parcela[]) || [])
    setUnidades((resUni.data as Unidade[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    if (!authLoading && acordoId) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, acordoId])

  const nomeUnidade = (id: string | null) =>
    id ? unidades.find((u) => u.id === id)?.nome || 'Unidade' : 'Geral'

  const totais = useMemo(() => {
    const pagas = parcelas.filter((p) => p.pago)
    const abertas = parcelas.filter((p) => !p.pago)
    const atrasadas = abertas.filter((p) => p.vencimento < hoje)
    return {
      total: parcelas.length,
      pagas: pagas.length,
      atrasadas: atrasadas.length,
      valorPago: pagas.reduce((a, p) => a + Number(p.valor_pago ?? p.valor), 0),
      saldo: abertas.reduce((a, p) => a + Number(p.valor), 0),
      valorAtrasado: atrasadas.reduce((a, p) => a + Number(p.valor), 0),
      temEstimado: parcelas.some((p) => p.estimado),
    }
  }, [parcelas, hoje])

  const listaParcelas = useMemo(
    () => (soAbertas ? parcelas.filter((p) => !p.pago) : parcelas),
    [parcelas, soAbertas]
  )

  function situacaoParcela(p: Parcela): { label: string; cls: string } {
    if (p.pago) return { label: 'Paga', cls: 'bg-green-100 text-green-700' }
    if (p.vencimento < hoje) return { label: 'Atrasada', cls: 'bg-red-100 text-red-700' }
    return { label: 'Em aberto', cls: 'bg-gray-100 text-gray-600' }
  }

  // ---------------- ações ----------------
  function abrirBaixa(p: Parcela) {
    setBaixa(p)
    setBData(hoje)
    setBValor(String(Number(p.valor).toFixed(2)).replace('.', ','))
    setErro(null)
  }

  async function confirmarBaixa() {
    if (!baixa) return
    setBSalvando(true)
    setErro(null)

    const { error } = await supabase
      .from('fiscal_parcelas')
      .update({ pago: true, pago_em: bData, valor_pago: parseValor(bValor) })
      .eq('id', baixa.id)

    setBSalvando(false)
    if (error) {
      setErro('Não foi possível dar baixa na parcela.')
      return
    }
    setBaixa(null)
    setAviso('Parcela baixada. A despesa já entrou no financeiro com a data do pagamento.')
    carregar()
  }

  async function estornar(p: Parcela) {
    setErro(null)
    const { error } = await supabase
      .from('fiscal_parcelas')
      .update({ pago: false, pago_em: null, valor_pago: null })
      .eq('id', p.id)
    if (error) {
      setErro('Não foi possível estornar a parcela.')
      return
    }
    setAviso(`Parcela ${p.numero} estornada. A despesa voltou para em aberto.`)
    carregar()
  }

  async function gerarGrade() {
    const qtd = Number(gQtd)
    if (!qtd || qtd < 1) {
      setErro('Informe a quantidade de parcelas.')
      return
    }
    if (parseValor(gValorDemais) <= 0) {
      setErro('Informe o valor das parcelas.')
      return
    }
    setGSalvando(true)
    setErro(null)

    const { data, error } = await supabase.rpc('fiscal_gerar_parcelas', {
      p_acordo_id: acordoId,
      p_primeiro_venc: gPrimeiroVenc,
      p_qtd: qtd,
      p_valor_demais: parseValor(gValorDemais),
      p_valor_primeira: gValorPrimeira ? parseValor(gValorPrimeira) : null,
      p_estimado: gEstimado,
    })

    setGSalvando(false)
    if (error) {
      setErro('Não foi possível gerar a grade de parcelas.')
      return
    }
    setGerarAberto(false)
    setAviso(`${Number(data || 0)} parcela(s) criada(s).`)
    carregar()
  }

  async function trocarStatus(novo: string) {
    if (!acordo) return
    setStatusSalvando(true)
    setErro(null)
    const { error } = await supabase
      .from('fiscal_acordos')
      .update({ status: novo })
      .eq('id', acordo.id)
    setStatusSalvando(false)
    if (error) {
      setErro('Não foi possível trocar a situação do acordo.')
      return
    }
    setAviso(
      novo === 'ativo' && acordo.status === 'simulado'
        ? 'Acordo formalizado. Use "Sincronizar" na lista para lançar as próximas parcelas em Contas a Pagar.'
        : 'Situação atualizada.'
    )
    carregar()
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20 md:text-sm'

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-gray-500">
        <Loader2 size={18} className="animate-spin" />
        Carregando…
      </div>
    )
  }

  if (!acordo) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/financeiro/parcelamentos"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={15} />
          Parcelamentos
        </Link>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro || 'Acordo não encontrado.'}
        </div>
      </div>
    )
  }

  const pct = totais.total > 0 ? Math.round((totais.pagas / totais.total) * 100) : 0
  const emRisco = acordo.status === 'ativo' && totais.atrasadas >= acordo.limite_rescisao - 1

  return (
    <>
      <div className="space-y-5">
        <Link
          href="/admin/financeiro/parcelamentos"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900"
        >
          <ArrowLeft size={15} />
          Parcelamentos
        </Link>

        {/* Cabeçalho do acordo */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORGAO_BADGE[acordo.orgao]}`}>
              {acordo.orgao}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[acordo.status]}`}>
              {STATUS_LABEL[acordo.status]}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {nomeUnidade(acordo.unidade_id)}
            </span>
          </div>

          <h1 className="mt-2 text-xl font-bold text-gray-900">{acordo.descricao}</h1>
          {acordo.numero && (
            <div className="mt-0.5 font-mono text-xs text-gray-400">{acordo.numero}</div>
          )}

          {acordo.observacao && (
            <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
              {acordo.observacao}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs text-gray-400">Consolidado</div>
              <div className="text-sm font-semibold text-gray-900">
                {acordo.valor_consolidado ? fmtBRL(Number(acordo.valor_consolidado)) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Pago</div>
              <div className="text-sm font-semibold text-gray-900">{fmtBRL(totais.valorPago)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Saldo em aberto</div>
              <div className="text-sm font-semibold text-gray-900">{fmtBRL(totais.saldo)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Em atraso</div>
              <div
                className={`text-sm font-semibold ${
                  totais.valorAtrasado > 0 ? 'text-red-700' : 'text-gray-900'
                }`}
              >
                {fmtBRL(totais.valorAtrasado)}
              </div>
            </div>
          </div>

          {totais.total > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-[#ff2d9b]" style={{ width: `${pct}%` }} />
              </div>
              <span className="shrink-0 text-xs font-medium text-gray-600">
                {totais.pagas}/{totais.total} pagas
              </span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
            <span className="text-xs text-gray-500">Situação:</span>
            <select
              value={acordo.status}
              onChange={(e) => trocarStatus(e.target.value)}
              disabled={statusSalvando}
              className="rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:border-[#ff2d9b] disabled:opacity-50"
            >
              {STATUS_OPCOES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <button
              onClick={() => {
                setGPrimeiroVenc(hoje)
                setGQtd(String(acordo.qtd_parcelas || 60))
                setGValorDemais('')
                setGValorPrimeira('')
                setGEstimado(true)
                setErro(null)
                setGerarAberto(true)
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <ListPlus size={14} />
              Gerar parcelas
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

        {emRisco && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-red-600" />
            <div className="text-xs leading-relaxed text-red-800">
              <span className="font-bold">
                {totais.atrasadas} de {acordo.limite_rescisao} parcelas em atraso.
              </span>{' '}
              {totais.atrasadas >= acordo.limite_rescisao
                ? 'O acordo já está no limite e pode ser rescindido a qualquer momento. Rescindido, o débito volta a ser exigível.'
                : 'Falta uma parcela para o gatilho de rescisão.'}
            </div>
          </div>
        )}

        {acordo.status === 'simulado' && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
            Este acordo é uma <span className="font-semibold">simulação</span>: aparece no desembolso
            futuro para dimensionar o caixa, mas não gera despesa nem entra em Contas a Pagar. Ao
            formalizar, troque a situação para <span className="font-semibold">Ativo</span>.
          </div>
        )}

        {/* Grade de parcelas */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Parcelas</h2>
              {totais.temEstimado && (
                <p className="text-xs text-amber-700">
                  As parcelas marcadas com <span className="font-mono font-bold">~</span> têm valor
                  ou vencimento estimado — conferir no extrato do órgão.
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={soAbertas}
                onChange={(e) => setSoAbertas(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
              />
              Só em aberto
            </label>
          </div>

          {listaParcelas.length === 0 ? (
            <div className="py-14 text-center text-sm text-gray-500">
              {parcelas.length === 0
                ? 'Nenhuma parcela cadastrada. Use "Gerar parcelas" para montar a grade.'
                : 'Nenhuma parcela em aberto.'}
            </div>
          ) : (
            <>
              {/* Celular */}
              <div className="divide-y divide-gray-100 md:hidden">
                {listaParcelas.map((p) => {
                  const s = situacaoParcela(p)
                  return (
                    <div key={p.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-gray-900">
                            Parcela {p.numero}
                            {acordo.qtd_parcelas ? `/${acordo.qtd_parcelas}` : ''}
                            {p.estimado && <span className="ml-1 font-mono text-amber-600">~</span>}
                          </span>
                          <div className="mt-0.5 text-xs text-gray-500">
                            Venc. {fmtData(p.vencimento)} · {fmtMesAno(p.competencia)}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                          {s.label}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between">
                        <span className="text-sm font-bold text-gray-900">
                          {fmtBRL(Number(p.valor_pago ?? p.valor))}
                        </span>
                        {p.pago && (
                          <span className="text-xs text-gray-500">pago em {fmtData(p.pago_em)}</span>
                        )}
                      </div>
                      {p.observacao && (
                        <p className="mt-1 text-[11px] text-gray-400">{p.observacao}</p>
                      )}
                      <div className="mt-2.5">
                        {p.pago ? (
                          <button
                            onClick={() => estornar(p)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-sm font-medium text-gray-600 active:bg-gray-50"
                          >
                            <RotateCcw size={15} />
                            Estornar
                          </button>
                        ) : (
                          <button
                            onClick={() => abrirBaixa(p)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#ff2d9b] py-2 text-sm font-semibold text-white active:bg-[#e0267f]"
                          >
                            <CheckCircle2 size={15} />
                            Marcar como paga
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3 font-medium">#</th>
                      <th className="px-4 py-3 font-medium">Competência</th>
                      <th className="px-4 py-3 font-medium">Vencimento</th>
                      <th className="px-4 py-3 text-right font-medium">Valor</th>
                      <th className="px-4 py-3 font-medium">Situação</th>
                      <th className="px-4 py-3 font-medium">Pago em</th>
                      <th className="px-4 py-3 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaParcelas.map((p) => {
                      const s = situacaoParcela(p)
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                        >
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {p.numero}
                            {p.estimado && <span className="ml-1 font-mono text-amber-600">~</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{fmtMesAno(p.competencia)}</td>
                          <td className="px-4 py-3 text-gray-600">{fmtData(p.vencimento)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {fmtBRL(Number(p.valor_pago ?? p.valor))}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
                              {s.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{fmtData(p.pago_em)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {p.despesa_id && (
                                <Link
                                  href="/admin/financeiro/contas-a-pagar"
                                  title="Ver em Contas a Pagar"
                                  className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                                >
                                  <ExternalLink size={15} />
                                </Link>
                              )}
                              {p.pago ? (
                                <button
                                  onClick={() => estornar(p)}
                                  title="Estornar"
                                  className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-red-600"
                                >
                                  <RotateCcw size={16} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => abrirBaixa(p)}
                                  title="Marcar como paga"
                                  className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-[#ff2d9b]"
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal — baixa de parcela */}
      {baixa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-bold text-gray-900">
                Baixar parcela {baixa.numero}
              </h2>
              <button
                onClick={() => setBaixa(null)}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Data do pagamento
                </label>
                <input
                  type="date"
                  value={bData}
                  onChange={(e) => setBData(e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  É esta data que o DRE usa — o regime é caixa.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Valor pago</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={bValor}
                  onChange={(e) => setBValor(e.target.value)}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Parcelas federais são corrigidas pela Selic — ajuste para o valor da guia.
                </p>
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
              <button
                onClick={() => setBaixa(null)}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarBaixa}
                disabled={bSalvando}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#ff2d9b] py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0267f] disabled:opacity-50"
              >
                {bSalvando && <Loader2 size={15} className="animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — gerar grade */}
      {gerarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-bold text-gray-900">Gerar parcelas</h2>
              <button
                onClick={() => setGerarAberto(false)}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
                Cria as parcelas mês a mês a partir do primeiro vencimento. Parcelas que já existem
                com o mesmo número são preservadas.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    1º vencimento
                  </label>
                  <input
                    type="date"
                    value={gPrimeiroVenc}
                    onChange={(e) => setGPrimeiroVenc(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Parcelas</label>
                  <input
                    type="number"
                    min={1}
                    value={gQtd}
                    onChange={(e) => setGQtd(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Valor das parcelas <span className="text-[#ff2d9b]">*</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={gValorDemais}
                  onChange={(e) => setGValorDemais(e.target.value)}
                  className={inputCls}
                  placeholder="925,03"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Valor da 1ª parcela (se diferente)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={gValorPrimeira}
                  onChange={(e) => setGValorPrimeira(e.target.value)}
                  className={inputCls}
                  placeholder="Ex.: entrada de 4.612,72"
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={gEstimado}
                  onChange={(e) => setGEstimado(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                />
                <span>
                  Marcar como estimado
                  <span className="block text-[11px] text-gray-500">
                    Enquanto o extrato do órgão não confirmar os valores.
                  </span>
                </span>
              </label>
            </div>
            <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
              <button
                onClick={() => setGerarAberto(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={gerarGrade}
                disabled={gSalvando}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#ff2d9b] py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0267f] disabled:opacity-50"
              >
                {gSalvando && <Loader2 size={15} className="animate-spin" />}
                Gerar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
