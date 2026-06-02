'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  TrendingUp,
  Zap,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

const supabase = createClient()

type Unidade = { id: string; nome: string }

type Receita = {
  id: string
  unidade_id: string | null
  origem: 'wellhub' | 'totalpass' | 'classpass' | 'outro'
  descricao: string | null
  valor: number
  competencia: string // YYYY-MM-DD (dia 1)
  recebido_em: string | null
  recebido: boolean
  observacao: string | null
}

const ORIGENS: { value: Receita['origem']; label: string }[] = [
  { value: 'wellhub', label: 'Wellhub' },
  { value: 'totalpass', label: 'TotalPass' },
  { value: 'classpass', label: 'ClassPass' },
  { value: 'outro', label: 'Outro' },
]

const ORIGEM_LABEL: Record<string, string> = {
  wellhub: 'Wellhub',
  totalpass: 'TotalPass',
  classpass: 'ClassPass',
  outro: 'Outro',
}

const ORIGEM_BADGE: Record<string, string> = {
  wellhub: 'bg-orange-100 text-orange-700',
  totalpass: 'bg-indigo-100 text-indigo-700',
  classpass: 'bg-teal-100 text-teal-700',
  outro: 'bg-gray-100 text-gray-600',
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ---- helpers de data (sem toISOString, pra não pular dia no fuso de SP) ----
function hojeLocalStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function mesAnteriorDe(ano: number, mes: number): { ano: number; mes: number } {
  if (mes === 1) return { ano: ano - 1, mes: 12 }
  return { ano, mes: mes - 1 }
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

export default function ReceitasPage() {
  const { user, loading: authLoading } = useAuth()

  const agora = new Date()
  const anoAtual = agora.getFullYear()
  const mesAtual = agora.getMonth() + 1
  const anteriorPadrao = mesAnteriorDe(anoAtual, mesAtual)

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [receitas, setReceitas] = useState<Receita[]>([])

  // ---- lançamento rápido ----
  const [qAgregador, setQAgregador] = useState<Receita['origem']>('wellhub')
  const [qMes, setQMes] = useState(anteriorPadrao.mes)
  const [qAno, setQAno] = useState(anteriorPadrao.ano)
  const [qData, setQData] = useState(hojeLocalStr())
  const [qValores, setQValores] = useState<Record<string, string>>({})
  const [qSalvando, setQSalvando] = useState(false)
  const [qMsg, setQMsg] = useState<string | null>(null)

  // ---- filtros da lista ----
  const [fTodosMeses, setFTodosMeses] = useState(false)
  const [fMes, setFMes] = useState(mesAtual)
  const [fAno, setFAno] = useState(anoAtual)
  const [fUnidade, setFUnidade] = useState<string>('todas') // 'todas' | 'geral' | id
  const [fOrigem, setFOrigem] = useState<string>('todas')

  // ---- modal (avulsa / edição) ----
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Receita | null>(null)
  const [mOrigem, setMOrigem] = useState<Receita['origem']>('outro')
  const [mUnidade, setMUnidade] = useState<string>('') // '' | 'geral' | id
  const [mDescricao, setMDescricao] = useState('')
  const [mValor, setMValor] = useState('')
  const [mMes, setMMes] = useState(mesAtual)
  const [mAno, setMAno] = useState(anoAtual)
  const [mRecebido, setMRecebido] = useState(true)
  const [mRecebidoEm, setMRecebidoEm] = useState(hojeLocalStr())
  const [mSalvando, setMSalvando] = useState(false)
  const [mErro, setMErro] = useState<string | null>(null)

  const anos = [anoAtual - 1, anoAtual, anoAtual + 1]

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const [resUni, resRec] = await Promise.all([
      supabase.from('unidades').select('id, nome').order('nome', { ascending: true }),
      supabase
        .from('receitas')
        .select('*')
        .is('excluido_em', null)
        .order('competencia', { ascending: false })
        .order('recebido_em', { ascending: false }),
    ])

    if (resRec.error) {
      setErro('Não foi possível carregar as receitas.')
      setCarregando(false)
      return
    }

    setUnidades((resUni.data as Unidade[]) || [])
    setReceitas((resRec.data as Receita[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    if (!authLoading) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  const unidadePorId = useMemo(() => {
    const mapa = new Map<string, string>()
    unidades.forEach((u) => mapa.set(u.id, u.nome))
    return mapa
  }, [unidades])

  function nomeUnidade(id: string | null): string {
    if (!id) return 'Geral'
    return unidadePorId.get(id) || '—'
  }

  // ---- lançamento rápido ----
  async function lancarRepasse() {
    setQMsg(null)

    const linhas = unidades
      .map((u) => ({ unidade_id: u.id, valor: parseValor(qValores[u.id] || '') }))
      .filter((l) => l.valor > 0)

    if (linhas.length === 0) {
      setQMsg('Preencha ao menos um valor maior que zero.')
      return
    }

    setQSalvando(true)

    const competencia = competenciaStr(qAno, qMes)
    const payload = linhas.map((l) => ({
      unidade_id: l.unidade_id,
      origem: qAgregador,
      descricao: `Repasse ${ORIGEM_LABEL[qAgregador]} — ${fmtCompetencia(competencia)}`,
      valor: l.valor,
      competencia,
      recebido_em: qData || null,
      recebido: true,
      criado_por: user?.id ?? null,
    }))

    const { error } = await supabase.from('receitas').insert(payload)

    if (error) {
      setQMsg('Erro ao lançar o repasse. Tente novamente.')
      setQSalvando(false)
      return
    }

    setQValores({})
    setQSalvando(false)
    setQMsg(`Repasse lançado em ${linhas.length} unidade(s).`)
    carregar()
  }

  // ---- modal ----
  function abrirNovaAvulsa() {
    setEditando(null)
    setMOrigem('outro')
    setMUnidade('')
    setMDescricao('')
    setMValor('')
    setMMes(mesAtual)
    setMAno(anoAtual)
    setMRecebido(true)
    setMRecebidoEm(hojeLocalStr())
    setMErro(null)
    setModalAberto(true)
  }

  function abrirEdicao(r: Receita) {
    setEditando(r)
    setMOrigem(r.origem)
    setMUnidade(r.unidade_id === null ? 'geral' : r.unidade_id)
    setMDescricao(r.descricao || '')
    setMValor(String(r.valor).replace('.', ','))
    const [y, m] = r.competencia.split('-')
    setMAno(Number(y))
    setMMes(Number(m))
    setMRecebido(r.recebido)
    setMRecebidoEm(r.recebido_em || hojeLocalStr())
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

    const payload = {
      unidade_id: mUnidade === 'geral' ? null : mUnidade,
      origem: mOrigem,
      descricao: mDescricao.trim() || null,
      valor: valorNum,
      competencia: competenciaStr(mAno, mMes),
      recebido: mRecebido,
      recebido_em: mRecebido ? mRecebidoEm || null : null,
    }

    let res
    if (editando) {
      res = await supabase.from('receitas').update(payload).eq('id', editando.id)
    } else {
      res = await supabase
        .from('receitas')
        .insert({ ...payload, criado_por: user?.id ?? null })
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

  async function excluir(r: Receita) {
    const ok = window.confirm(
      `Excluir a receita de ${fmtBRL(r.valor)} (${ORIGEM_LABEL[r.origem]} · ${nomeUnidade(
        r.unidade_id
      )})?`
    )
    if (!ok) return

    const { error } = await supabase
      .from('receitas')
      .update({ excluido_em: new Date().toISOString(), excluido_por: user?.id ?? null })
      .eq('id', r.id)

    if (!error) {
      setReceitas((prev) => prev.filter((x) => x.id !== r.id))
    }
  }

  const lista = useMemo(() => {
    return receitas.filter((r) => {
      if (!fTodosMeses) {
        const [ry, rm] = r.competencia.split('-').map(Number)
        if (ry !== fAno || rm !== fMes) return false
      }
      if (fUnidade === 'geral' && r.unidade_id !== null) return false
      if (fUnidade !== 'todas' && fUnidade !== 'geral' && r.unidade_id !== fUnidade)
        return false
      if (fOrigem !== 'todas' && r.origem !== fOrigem) return false
      return true
    })
  }, [receitas, fTodosMeses, fMes, fAno, fUnidade, fOrigem])

  const totalLista = useMemo(
    () => lista.reduce((acc, r) => acc + Number(r.valor || 0), 0),
    [lista]
  )

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20'

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d9b]/10 text-[#ff2d9b]">
              <TrendingUp size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Receitas / Repasses</h1>
              <p className="text-sm text-gray-500">
                Repasses de agregadores e lançamentos manuais de receita
              </p>
            </div>
          </div>

          <button
            onClick={abrirNovaAvulsa}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Plus size={18} />
            Nova receita avulsa
          </button>
        </div>

        {erro && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Lançamento rápido de repasse */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Zap size={18} className="text-[#ff2d9b]" />
            <h2 className="text-base font-bold text-gray-900">Lançamento rápido de repasse</h2>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Agregador</label>
              <select
                value={qAgregador}
                onChange={(e) => setQAgregador(e.target.value as Receita['origem'])}
                className={inputCls}
              >
                {ORIGENS.filter((o) => o.value !== 'outro').map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Competência (mês dos check-ins)
              </label>
              <div className="flex gap-2">
                <select value={qMes} onChange={(e) => setQMes(Number(e.target.value))} className={inputCls}>
                  {MESES.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select value={qAno} onChange={(e) => setQAno(Number(e.target.value))} className={inputCls}>
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
                Data do recebimento
              </label>
              <input
                type="date"
                value={qData}
                onChange={(e) => setQData(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {unidades.map((u) => (
              <div key={u.id}>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {ORIGEM_LABEL[qAgregador]} · {u.nome}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    R$
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={qValores[u.id] || ''}
                    onChange={(e) =>
                      setQValores((prev) => ({ ...prev, [u.id]: e.target.value }))
                    }
                    placeholder="0,00"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-h-[20px] text-sm">
              {qMsg && (
                <span
                  className={
                    qMsg.startsWith('Erro') || qMsg.startsWith('Preencha')
                      ? 'text-red-600'
                      : 'inline-flex items-center gap-1 text-green-700'
                  }
                >
                  {!qMsg.startsWith('Erro') && !qMsg.startsWith('Preencha') && (
                    <CheckCircle2 size={16} />
                  )}
                  {qMsg}
                </span>
              )}
            </div>
            <button
              onClick={lancarRepasse}
              disabled={qSalvando || unidades.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f] disabled:opacity-60"
            >
              {qSalvando && <Loader2 size={16} className="animate-spin" />}
              Lançar repasse
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Competência</label>
            <div className="flex items-center gap-2">
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
            <label className="mb-1 block text-xs font-medium text-gray-500">Origem</label>
            <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} className={inputCls}>
              <option value="todas">Todas</option>
              {ORIGENS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
              Nenhuma receita encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3 font-medium">Origem</th>
                    <th className="px-4 py-3 font-medium">Unidade</th>
                    <th className="px-4 py-3 font-medium">Competência</th>
                    <th className="px-4 py-3 font-medium">Recebido em</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Valor</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ORIGEM_BADGE[r.origem]}`}
                        >
                          {ORIGEM_LABEL[r.origem]}
                        </span>
                        {r.descricao && (
                          <div className="mt-0.5 text-xs text-gray-400">{r.descricao}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{nomeUnidade(r.unidade_id)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtCompetencia(r.competencia)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtData(r.recebido_em)}</td>
                      <td className="px-4 py-3">
                        {r.recebido ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            Recebido
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                            A receber
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {fmtBRL(Number(r.valor))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => abrirEdicao(r)}
                            title="Editar"
                            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-[#ff2d9b]"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => excluir(r)}
                            title="Excluir"
                            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50/60">
                    <td colSpan={5} className="px-4 py-3 text-sm font-medium text-gray-600">
                      Total ({lista.length} lançamento{lista.length !== 1 ? 's' : ''})
                    </td>
                    <td className="px-4 py-3 text-right text-base font-bold text-gray-900">
                      {fmtBRL(totalLista)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal avulsa / edição */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editando ? 'Editar receita' : 'Nova receita avulsa'}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Origem</label>
                  <select
                    value={mOrigem}
                    onChange={(e) => setMOrigem(e.target.value as Receita['origem'])}
                    className={inputCls}
                  >
                    {ORIGENS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Unidade</label>
                  <select
                    value={mUnidade}
                    onChange={(e) => setMUnidade(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Selecione —</option>
                    <option value="geral">Geral</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

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
                <label className="mb-1 block text-sm font-medium text-gray-700">Descrição</label>
                <input
                  type="text"
                  value={mDescricao}
                  onChange={(e) => setMDescricao(e.target.value)}
                  placeholder="Opcional"
                  className={inputCls}
                />
              </div>

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

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={mRecebido}
                    onChange={(e) => setMRecebido(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                  />
                  Já recebido
                </label>
                {mRecebido && (
                  <input
                    type="date"
                    value={mRecebidoEm}
                    onChange={(e) => setMRecebidoEm(e.target.value)}
                    className={`${inputCls} max-w-[180px]`}
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
                {editando ? 'Salvar alterações' : 'Lançar receita'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
