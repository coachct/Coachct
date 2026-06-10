'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Tag, Plus, Pencil, X, Loader2 } from 'lucide-react'

const supabase = createClient()

type Origem = 'wellhub' | 'totalpass'

type ValorCheckin = {
  id: string
  origem: Origem
  produto_id: string | null
  descricao: string
  valor: number
  limite_mensal: number | null
  ativo: boolean
}

const ORIGENS: { value: Origem; label: string }[] = [
  { value: 'wellhub', label: 'Wellhub' },
  { value: 'totalpass', label: 'TotalPass' },
]

const ORIGEM_LABEL: Record<string, string> = {
  wellhub: 'Wellhub',
  totalpass: 'TotalPass',
}

const ORIGEM_BADGE: Record<string, string> = {
  wellhub: 'bg-orange-100 text-orange-700',
  totalpass: 'bg-indigo-100 text-indigo-700',
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

export default function ValoresCheckinPage() {
  const { loading: authLoading } = useAuth()

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [itens, setItens] = useState<ValorCheckin[]>([])

  // modal
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<ValorCheckin | null>(null)
  const [mOrigem, setMOrigem] = useState<Origem>('wellhub')
  const [mDescricao, setMDescricao] = useState('')
  const [mValor, setMValor] = useState('')
  const [mLimite, setMLimite] = useState('')
  const [mProdutoId, setMProdutoId] = useState('')
  const [mAtivo, setMAtivo] = useState(true)
  const [mSalvando, setMSalvando] = useState(false)
  const [mErro, setMErro] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true)
    setErro(null)
    const { data, error } = await supabase
      .from('valores_checkin')
      .select('id, origem, produto_id, descricao, valor, limite_mensal, ativo')
      .order('origem', { ascending: true })
      .order('descricao', { ascending: true })

    if (error) {
      setErro('Não foi possível carregar os valores.')
      setCarregando(false)
      return
    }
    setItens((data as ValorCheckin[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    if (!authLoading) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  function abrirNovo() {
    setEditando(null)
    setMOrigem('wellhub')
    setMDescricao('')
    setMValor('')
    setMLimite('')
    setMProdutoId('')
    setMAtivo(true)
    setMErro(null)
    setModalAberto(true)
  }

  function abrirEditar(item: ValorCheckin) {
    setEditando(item)
    setMOrigem(item.origem)
    setMDescricao(item.descricao)
    setMValor(String(item.valor).replace('.', ','))
    setMLimite(item.limite_mensal != null ? String(item.limite_mensal) : '')
    setMProdutoId(item.produto_id || '')
    setMAtivo(item.ativo)
    setMErro(null)
    setModalAberto(true)
  }

  function fecharModal() {
    if (mSalvando) return
    setModalAberto(false)
    setEditando(null)
  }

  async function salvar() {
    const valorNum = parseValor(mValor)
    if (!mDescricao.trim()) {
      setMErro('Informe a descrição (nome do produto).')
      return
    }
    if (valorNum <= 0) {
      setMErro('Informe um valor maior que zero.')
      return
    }

    setMSalvando(true)
    setMErro(null)

    const limiteNum = mLimite.trim() ? parseInt(mLimite.trim(), 10) : null
    const payload = {
      origem: mOrigem,
      descricao: mDescricao.trim(),
      valor: valorNum,
      limite_mensal: limiteNum != null && !isNaN(limiteNum) ? limiteNum : null,
      produto_id: mProdutoId.trim() || null,
      ativo: mAtivo,
    }

    let res
    if (editando) {
      res = await supabase
        .from('valores_checkin')
        .update({ ...payload, atualizado_em: new Date().toISOString() })
        .eq('id', editando.id)
    } else {
      res = await supabase.from('valores_checkin').insert(payload)
    }

    if (res.error) {
      setMErro('Erro ao salvar. Verifique se já não existe esse produto na mesma origem.')
      setMSalvando(false)
      return
    }

    setMSalvando(false)
    fecharModal()
    carregar()
  }

  async function alternarAtivo(item: ValorCheckin) {
    const { error } = await supabase
      .from('valores_checkin')
      .update({ ativo: !item.ativo, atualizado_em: new Date().toISOString() })
      .eq('id', item.id)
    if (!error) {
      setItens((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, ativo: !x.ativo } : x))
      )
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20'

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d9b]/10 text-[#ff2d9b]">
              <Tag size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Valores por check-in</h1>
              <p className="text-sm text-gray-500">
                Quanto cada produto do Wellhub/TotalPass vale por check-in validado
              </p>
            </div>
          </div>

          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f]"
          >
            <Plus size={18} />
            Novo produto
          </button>
        </div>

        {erro && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Lista */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
              <Loader2 size={18} className="animate-spin" />
              Carregando…
            </div>
          ) : itens.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">
              Nenhum produto cadastrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3 font-medium">Origem</th>
                    <th className="px-4 py-3 font-medium">Produto</th>
                    <th className="px-4 py-3 font-medium">ID produto</th>
                    <th className="px-4 py-3 font-medium">Limite</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Valor</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => (
                    <tr
                      key={it.id}
                      className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 ${
                        !it.ativo ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ORIGEM_BADGE[it.origem]}`}
                        >
                          {ORIGEM_LABEL[it.origem]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{it.descricao}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {it.produto_id || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {it.limite_mensal != null ? `${it.limite_mensal}x/mês` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {it.ativo ? (
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
                        {fmtBRL(Number(it.valor))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => abrirEditar(it)}
                            title="Editar"
                            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-[#ff2d9b]"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => alternarAtivo(it)}
                            className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100"
                          >
                            {it.ativo ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-400">
          O <strong>ID produto</strong> normalmente é preenchido sozinho no primeiro check-in real
          (o sistema casa pelo nome e aprende o id). Você só precisa do nome e do valor.
        </p>
      </div>

      {/* Modal add/editar */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editando ? 'Editar produto' : 'Novo produto'}
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
                    onChange={(e) => setMOrigem(e.target.value as Origem)}
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Limite mensal
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mLimite}
                    onChange={(e) => setMLimite(e.target.value)}
                    placeholder="opcional (ex: 12)"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Produto (nome) <span className="text-[#ff2d9b]">*</span>
                </label>
                <input
                  type="text"
                  value={mDescricao}
                  onChange={(e) => setMDescricao(e.target.value)}
                  placeholder="Ex: Musculação"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Valor por check-in <span className="text-[#ff2d9b]">*</span>
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
                    ID do produto
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mProdutoId}
                    onChange={(e) => setMProdutoId(e.target.value)}
                    placeholder="opcional"
                    className={inputCls}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={mAtivo}
                  onChange={(e) => setMAtivo(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#ff2d9b] focus:ring-[#ff2d9b]"
                />
                Ativo
              </label>
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
                onClick={salvar}
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
