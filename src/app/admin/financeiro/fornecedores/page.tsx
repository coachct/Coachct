'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  Plus,
  Search,
  Pencil,
  Power,
  X,
  Building2,
  Loader2,
} from 'lucide-react'

const supabase = createClient()

type Categoria = {
  id: string
  nome: string
  grupo: string
}

type Fornecedor = {
  id: string
  nome: string
  documento: string | null
  tipo: 'PJ' | 'PF' | null
  categoria_padrao_id: string | null
  contato: string | null
  observacao: string | null
  ativo: boolean
  criado_em: string
}

type FormState = {
  nome: string
  documento: string
  tipo: '' | 'PJ' | 'PF'
  categoria_padrao_id: string
  contato: string
  observacao: string
}

const FORM_VAZIO: FormState = {
  nome: '',
  documento: '',
  tipo: '',
  categoria_padrao_id: '',
  contato: '',
  observacao: '',
}

export default function FornecedoresPage() {
  const { loading: authLoading } = useAuth()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])

  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Fornecedor | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const [resForn, resCat] = await Promise.all([
      supabase.from('fornecedores').select('*').order('nome', { ascending: true }),
      supabase
        .from('categorias_despesa')
        .select('id, nome, grupo')
        .eq('ativo', true)
        .order('ordem', { ascending: true }),
    ])

    if (resForn.error) {
      setErro('Não foi possível carregar os fornecedores.')
      setCarregando(false)
      return
    }

    setFornecedores((resForn.data as Fornecedor[]) || [])
    setCategorias((resCat.data as Categoria[]) || [])
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

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return fornecedores
    return fornecedores.filter(
      (f) =>
        f.nome.toLowerCase().includes(termo) ||
        (f.documento || '').toLowerCase().includes(termo) ||
        (f.contato || '').toLowerCase().includes(termo)
    )
  }, [fornecedores, busca])

  function abrirNovo() {
    setEditando(null)
    setForm(FORM_VAZIO)
    setErro(null)
    setModalAberto(true)
  }

  function abrirEdicao(f: Fornecedor) {
    setEditando(f)
    setForm({
      nome: f.nome || '',
      documento: f.documento || '',
      tipo: (f.tipo as '' | 'PJ' | 'PF') || '',
      categoria_padrao_id: f.categoria_padrao_id || '',
      contato: f.contato || '',
      observacao: f.observacao || '',
    })
    setErro(null)
    setModalAberto(true)
  }

  function fecharModal() {
    if (salvando) return
    setModalAberto(false)
    setEditando(null)
    setForm(FORM_VAZIO)
  }

  async function salvar() {
    if (!form.nome.trim()) {
      setErro('Informe o nome do fornecedor.')
      return
    }

    setSalvando(true)
    setErro(null)

    const payload = {
      nome: form.nome.trim(),
      documento: form.documento.trim() || null,
      tipo: form.tipo || null,
      categoria_padrao_id: form.categoria_padrao_id || null,
      contato: form.contato.trim() || null,
      observacao: form.observacao.trim() || null,
    }

    let res
    if (editando) {
      res = await supabase.from('fornecedores').update(payload).eq('id', editando.id)
    } else {
      res = await supabase.from('fornecedores').insert(payload)
    }

    if (res.error) {
      setErro('Erro ao salvar. Tente novamente.')
      setSalvando(false)
      return
    }

    setSalvando(false)
    fecharModal()
    carregar()
  }

  async function alternarAtivo(f: Fornecedor) {
    const { error } = await supabase
      .from('fornecedores')
      .update({ ativo: !f.ativo })
      .eq('id', f.id)

    if (!error) {
      setFornecedores((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, ativo: !x.ativo } : x))
      )
    }
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d9b]/10 text-[#ff2d9b]">
              <Building2 size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Fornecedores</h1>
              <p className="text-sm text-gray-500">
                Cadastro de fornecedores e prestadores do financeiro
              </p>
            </div>
          </div>

          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f]"
          >
            <Plus size={18} />
            Novo fornecedor
          </button>
        </div>

        {/* Busca */}
        <div className="mb-4 relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, documento ou contato…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20"
          />
        </div>

        {erro && !modalAberto && (
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
          ) : lista.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">
              {busca
                ? 'Nenhum fornecedor encontrado para a busca.'
                : 'Nenhum fornecedor cadastrado ainda.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Documento</th>
                    <th className="px-4 py-3 font-medium">Categoria padrão</th>
                    <th className="px-4 py-3 font-medium">Contato</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((f) => {
                    const cat = f.categoria_padrao_id
                      ? categoriaPorId.get(f.categoria_padrao_id)
                      : null
                    return (
                      <tr
                        key={f.id}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{f.nome}</td>
                        <td className="px-4 py-3 text-gray-600">{f.tipo || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{f.documento || '—'}</td>
                        <td className="px-4 py-3">
                          {cat ? (
                            <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                              {cat.nome}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{f.contato || '—'}</td>
                        <td className="px-4 py-3">
                          {f.ativo ? (
                            <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                              Inativo
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => abrirEdicao(f)}
                              title="Editar"
                              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-[#ff2d9b]"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => alternarAtivo(f)}
                              title={f.ativo ? 'Inativar' : 'Ativar'}
                              className={`rounded-lg p-2 transition hover:bg-gray-100 ${
                                f.ativo
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
                {editando ? 'Editar fornecedor' : 'Novo fornecedor'}
              </h2>
              <button
                onClick={fecharModal}
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

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Nome <span className="text-[#ff2d9b]">*</span>
                </label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20"
                  placeholder="Ex.: Imobiliária São Paulo Ltda"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Tipo
                  </label>
                  <select
                    value={form.tipo}
                    onChange={(e) =>
                      setForm({ ...form, tipo: e.target.value as '' | 'PJ' | 'PF' })
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20"
                  >
                    <option value="">—</option>
                    <option value="PJ">PJ</option>
                    <option value="PF">PF</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Documento
                  </label>
                  <input
                    type="text"
                    value={form.documento}
                    onChange={(e) => setForm({ ...form, documento: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20"
                    placeholder="CNPJ / CPF"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Categoria padrão
                </label>
                <select
                  value={form.categoria_padrao_id}
                  onChange={(e) =>
                    setForm({ ...form, categoria_padrao_id: e.target.value })
                  }
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20"
                >
                  <option value="">— Sem categoria padrão —</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.grupo})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Usada como sugestão ao lançar uma despesa desse fornecedor.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Contato
                </label>
                <input
                  type="text"
                  value={form.contato}
                  onChange={(e) => setForm({ ...form, contato: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20"
                  placeholder="Telefone, e-mail ou responsável"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Observação
                </label>
                <textarea
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20"
                  placeholder="Anotações internas (opcional)"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                onClick={fecharModal}
                disabled={salvando}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f] disabled:opacity-60"
              >
                {salvando && <Loader2 size={16} className="animate-spin" />}
                {editando ? 'Salvar alterações' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
