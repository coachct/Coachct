'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  Repeat,
  CalendarPlus,
  Plus,
  Pencil,
  Power,
  X,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

const supabase = createClient()

type Categoria = { id: string; nome: string; grupo: string }
type Unidade = { id: string; nome: string }

type Recorrente = {
  id: string
  unidade_id: string | null
  categoria_id: string | null
  descricao: string
  valor: number
  dia_vencimento: number
  inicio: string // YYYY-MM-DD
  fim: string | null
  ativo: boolean
  ultima_geracao: string | null
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function hojeLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function competenciaStr(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`
}

function ultimoDiaStr(ano: number, mes: number): string {
  const lastDay = new Date(ano, mes, 0).getDate() // mes 1-based → último dia do mês
  return `${ano}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function vencimentoStr(ano: number, mes: number, dia: number): string {
  const lastDay = new Date(ano, mes, 0).getDate()
  const d = Math.min(dia, lastDay)
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fmtData(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

function fmtCompetencia(d: string | null): string {
  if (!d) return '—'
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

export default function RecorrentesPage() {
  const { user, loading: authLoading } = useAuth()

  const agora = new Date()
  const anoAtual = agora.getFullYear()
  const mesAtual = agora.getMonth() + 1
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1]

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])

  // ---- geração ----
  const [gMes, setGMes] = useState(mesAtual)
  const [gAno, setGAno] = useState(anoAtual)
  const [gGerando, setGGerando] = useState(false)
  const [gMsg, setGMsg] = useState<string | null>(null)
  const [gErro, setGErro] = useState(false)

  // ---- modal ----
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Recorrente | null>(null)
  const [mDescricao, setMDescricao] = useState('')
  const [mUnidade, setMUnidade] = useState<string>('') // '' | 'geral' | id
  const [mCategoria, setMCategoria] = useState<string>('')
  const [mValor, setMValor] = useState('')
  const [mDia, setMDia] = useState('1')
  const [mInicio, setMInicio] = useState(hojeLocalStr())
  const [mFim, setMFim] = useState('')
  const [mSalvando, setMSalvando] = useState(false)
  const [mErro, setMErro] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const [resRec, resCat, resUni] = await Promise.all([
      supabase
        .from('despesas_recorrentes')
        .select('*')
        .order('ativo', { ascending: false })
        .order('descricao', { ascending: true }),
      supabase
        .from('categorias_despesa')
        .select('id, nome, grupo')
        .eq('ativo', true)
        .order('ordem', { ascending: true }),
      supabase.from('unidades').select('id, nome').order('nome', { ascending: true }),
    ])

    if (resRec.error) {
      setErro('Não foi possível carregar as despesas recorrentes.')
      setCarregando(false)
      return
    }

    setRecorrentes((resRec.data as Recorrente[]) || [])
    setCategorias((resCat.data as Categoria[]) || [])
    setUnidades((resUni.data as Unidade[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    if (!authLoading) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  const categoriaPorId = useMemo(() => {
    const mapa = new Map<string, Categoria>()
    categorias.forEach((c) => mapa.set(c.id, c))
    return mapa
  }, [categorias])

  const unidadePorId = useMemo(() => {
    const mapa = new Map<string, string>()
    unidades.forEach((u) => mapa.set(u.id, u.nome))
    return mapa
  }, [unidades])

  function nomeUnidade(id: string | null): string {
    if (!id) return 'Geral'
    return unidadePorId.get(id) || '—'
  }

  // ---- geração de despesas do mês ----
  async function gerar() {
    setGMsg(null)
    setGErro(false)

    const compFirst = competenciaStr(gAno, gMes)
    const compLast = ultimoDiaStr(gAno, gMes)

    const validos = recorrentes.filter(
      (t) =>
        t.ativo &&
        t.inicio <= compLast &&
        (t.fim === null || t.fim >= compFirst)
    )

    if (validos.length === 0) {
      setGMsg('Nenhum template ativo dentro da vigência nesta competência.')
      return
    }

    setGGerando(true)

    const ids = validos.map((t) => t.id)
    const { data: existentes, error: errExist } = await supabase
      .from('despesas')
      .select('recorrencia_id')
      .eq('competencia', compFirst)
      .is('excluido_em', null)
      .in('recorrencia_id', ids)

    if (errExist) {
      setGErro(true)
      setGMsg('Erro ao verificar despesas já geradas.')
      setGGerando(false)
      return
    }

    const jaGeradas = new Set((existentes || []).map((r: any) => r.recorrencia_id))
    const aGerar = validos.filter((t) => !jaGeradas.has(t.id))

    if (aGerar.length === 0) {
      setGGerando(false)
      setGMsg(
        `Nada novo: as ${validos.length} despesas desta competência já tinham sido geradas.`
      )
      return
    }

    const payload = aGerar.map((t) => ({
      unidade_id: t.unidade_id,
      categoria_id: t.categoria_id,
      descricao: t.descricao,
      valor: t.valor,
      competencia: compFirst,
      vencimento: vencimentoStr(gAno, gMes, t.dia_vencimento),
      pago: false,
      origem: 'recorrente',
      recorrencia_id: t.id,
      criado_por: user?.id ?? null,
    }))

    const { error: errInsert } = await supabase.from('despesas').insert(payload)

    if (errInsert) {
      setGErro(true)
      setGMsg('Erro ao gerar as despesas. Tente novamente.')
      setGGerando(false)
      return
    }

    await supabase
      .from('despesas_recorrentes')
      .update({ ultima_geracao: compFirst })
      .in(
        'id',
        aGerar.map((t) => t.id)
      )

    setGGerando(false)
    setGMsg(
      `${aGerar.length} despesa(s) gerada(s)${
        jaGeradas.size > 0 ? `, ${jaGeradas.size} já existiam` : ''
      }.`
    )
    carregar()
  }

  // ---- modal ----
  function abrirNovo() {
    setEditando(null)
    setMDescricao('')
    setMUnidade('')
    setMCategoria('')
    setMValor('')
    setMDia('1')
    setMInicio(hojeLocalStr())
    setMFim('')
    setMErro(null)
    setModalAberto(true)
  }

  function abrirEdicao(t: Recorrente) {
    setEditando(t)
    setMDescricao(t.descricao || '')
    setMUnidade(t.unidade_id === null ? 'geral' : t.unidade_id)
    setMCategoria(t.categoria_id || '')
    setMValor(String(t.valor).replace('.', ','))
    setMDia(String(t.dia_vencimento))
    setMInicio(t.inicio || hojeLocalStr())
    setMFim(t.fim || '')
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
    const diaNum = parseInt(mDia, 10)

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
    if (isNaN(diaNum) || diaNum < 1 || diaNum > 31) {
      setMErro('Dia de vencimento deve estar entre 1 e 31.')
      return
    }

    setMSalvando(true)
    setMErro(null)

    const payload = {
      unidade_id: mUnidade === 'geral' ? null : mUnidade,
      categoria_id: mCategoria || null,
      descricao: mDescricao.trim(),
      valor: valorNum,
      dia_vencimento: diaNum,
      inicio: mInicio,
      fim: mFim || null,
    }

    let res
    if (editando) {
      res = await supabase.from('despesas_recorrentes').update(payload).eq('id', editando.id)
    } else {
      res = await supabase.from('despesas_recorrentes').insert({ ...payload, ativo: true })
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

  async function alternarAtivo(t: Recorrente) {
    const { error } = await supabase
      .from('despesas_recorrentes')
      .update({ ativo: !t.ativo })
      .eq('id', t.id)

    if (!error) {
      setRecorrentes((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, ativo: !x.ativo } : x))
      )
    }
  }

  const ativosCount = useMemo(() => recorrentes.filter((t) => t.ativo).length, [recorrentes])

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20'

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d9b]/10 text-[#ff2d9b]">
              <Repeat size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Despesas Recorrentes</h1>
              <p className="text-sm text-gray-500">
                Modelos de despesas fixas e a geração das contas do mês
              </p>
            </div>
          </div>

          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f]"
          >
            <Plus size={18} />
            Novo template
          </button>
        </div>

        {erro && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Gerar despesas do mês */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarPlus size={18} className="text-[#ff2d9b]" />
            <h2 className="text-base font-bold text-gray-900">Gerar despesas do mês</h2>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Competência</label>
              <div className="flex gap-2">
                <select value={gMes} onChange={(e) => setGMes(Number(e.target.value))} className={inputCls}>
                  {MESES.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select value={gAno} onChange={(e) => setGAno(Number(e.target.value))} className={inputCls}>
                  {anos.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={gerar}
              disabled={gGerando || ativosCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f] disabled:opacity-60"
            >
              {gGerando && <Loader2 size={16} className="animate-spin" />}
              Gerar
            </button>

            <div className="min-h-[20px] flex-1 text-sm">
              {gMsg && (
                <span
                  className={
                    gErro
                      ? 'text-red-600'
                      : 'inline-flex items-center gap-1 text-green-700'
                  }
                >
                  {!gErro && <CheckCircle2 size={16} />}
                  {gMsg}
                </span>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-400">
            Cria as contas em aberto no Contas a Pagar a partir dos templates ativos. Pode rodar
            mais de uma vez — o que já foi gerado no mês não duplica.
          </p>
        </div>

        {/* Lista de templates */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
              <Loader2 size={18} className="animate-spin" />
              Carregando…
            </div>
          ) : recorrentes.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">
              Nenhum template cadastrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3 font-medium">Descrição</th>
                    <th className="px-4 py-3 font-medium">Unidade</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 font-medium">Venc.</th>
                    <th className="px-4 py-3 font-medium">Vigência</th>
                    <th className="px-4 py-3 font-medium">Último gerado</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Valor</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {recorrentes.map((t) => {
                    const cat = t.categoria_id ? categoriaPorId.get(t.categoria_id) : null
                    return (
                      <tr
                        key={t.id}
                        className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 ${
                          !t.ativo ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{t.descricao}</td>
                        <td className="px-4 py-3 text-gray-600">{nomeUnidade(t.unidade_id)}</td>
                        <td className="px-4 py-3">
                          {cat ? (
                            <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                              {cat.nome}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">dia {t.dia_vencimento}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtData(t.inicio)} → {t.fim ? fmtData(t.fim) : 'sem fim'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{fmtCompetencia(t.ultima_geracao)}</td>
                        <td className="px-4 py-3">
                          {t.ativo ? (
                            <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                              Inativo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {fmtBRL(Number(t.valor))}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => abrirEdicao(t)}
                              title="Editar"
                              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-[#ff2d9b]"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => alternarAtivo(t)}
                              title={t.ativo ? 'Inativar' : 'Ativar'}
                              className={`rounded-lg p-2 transition hover:bg-gray-100 ${
                                t.ativo
                                  ? 'text-gray-500 hover:text-red-600'
                                  : 'text-gray-400 hover:text-green-600'
                              }`}
                            >
                              <Power size={16} />
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

      {/* Modal */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editando ? 'Editar template' : 'Novo template recorrente'}
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
                  placeholder="Ex.: Aluguel Pinheiros"
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Dia de vencimento
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={mDia}
                    onChange={(e) => setMDia(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Início</label>
                  <input
                    type="date"
                    value={mInicio}
                    onChange={(e) => setMInicio(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Fim <span className="text-gray-400">(opcional)</span>
                  </label>
                  <input
                    type="date"
                    value={mFim}
                    onChange={(e) => setMFim(e.target.value)}
                    className={inputCls}
                  />
                </div>
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
