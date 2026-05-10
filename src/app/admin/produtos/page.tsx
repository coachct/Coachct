'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Plus, X, Edit2, Check, Package, AlertCircle } from 'lucide-react'

const TIPOS_PRODUTO = [
  { key: 'credito_coach', label: 'Crédito Avulso Coach CT', precisaValidade: true, descricao: 'Gera N créditos individuais com validade própria' },
]

function ProdutoCard({ produto, unidades, onEditar, onAlternar }: any) {
  const tipoLabel = TIPOS_PRODUTO.find(t => t.key === produto.tipo)?.label || produto.tipo
  const unidadeNome = produto.unidade_id 
    ? unidades.find((u: any) => u.id === produto.unidade_id)?.nome || '—'
    : 'Rede (todas as unidades)'
  
  return (
    <div className={`card flex items-start gap-3 ${!produto.ativo ? 'opacity-60' : ''}`}>
      <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center flex-shrink-0">
        <Package size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{produto.nome}</span>
          {!produto.unidade_id ? (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Rede</span>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{unidadeNome}</span>
          )}
          {!produto.ativo && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Inativo</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
          <span>{tipoLabel}</span>
          <span className="font-mono font-semibold text-gray-700">
            R$ {Number(produto.valor).toFixed(2).replace('.', ',')}
          </span>
          <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
            {produto.creditos_por_venda || 1} crédito{(produto.creditos_por_venda || 1) > 1 ? 's' : ''} por unidade
          </span>
          {produto.dias_validade && (
            <span>Validade: {produto.dias_validade} dias</span>
          )}
        </div>
        {produto.descricao && (
          <div className="text-xs text-gray-400 mt-1 line-clamp-2">{produto.descricao}</div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <button onClick={onEditar} className="btn btn-sm gap-1 text-primary-600 hover:bg-primary-50">
          <Edit2 size={11} /> Editar
        </button>
        <button onClick={onAlternar} className="btn btn-sm text-xs text-gray-500 hover:bg-gray-50">
          {produto.ativo ? 'Desativar' : 'Ativar'}
        </button>
      </div>
    </div>
  )
}

export default function AdminProdutosPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [produtos, setProdutos] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [modalProduto, setModalProduto] = useState<any>(null)
  const [form, setForm] = useState({
    nome: '',
    tipo: 'credito_coach',
    valor: 0,
    creditos_por_venda: 1,
    dias_validade: 30,
    descricao: '',
    ativo: true,
    unidade_id: '' as string | '',
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') {
      router.push('/')
    }
  }, [perfil, loading])

  useEffect(() => {
    if (perfil) carregar()
  }, [perfil])

  async function carregar() {
    const [{ data: produtosData }, { data: unidadesData }] = await Promise.all([
      supabase.from('produtos').select('*').order('ativo', { ascending: false }).order('nome'),
      supabase.from('unidades').select('id, nome, tipo').eq('ativo', true).order('nome'),
    ])
    setProdutos(produtosData || [])
    setUnidades(unidadesData || [])
    setLoadingData(false)
  }

  function abrirNovo() {
    setForm({
      nome: '',
      tipo: 'credito_coach',
      valor: 0,
      creditos_por_venda: 1,
      dias_validade: 30,
      descricao: '',
      ativo: true,
      unidade_id: '',
    })
    setErro('')
    setModalProduto({ id: null })
  }

  function abrirEditar(produto: any) {
    setForm({
      nome: produto.nome,
      tipo: produto.tipo,
      valor: produto.valor,
      creditos_por_venda: produto.creditos_por_venda || 1,
      dias_validade: produto.dias_validade || 30,
      descricao: produto.descricao || '',
      ativo: produto.ativo,
      unidade_id: produto.unidade_id || '',
    })
    setErro('')
    setModalProduto(produto)
  }

  async function salvar() {
    if (!form.nome.trim()) { setErro('Informe o nome do produto.'); return }
    if (form.valor <= 0) { setErro('Informe um valor válido.'); return }
    if (form.creditos_por_venda < 1) { setErro('A quantidade de créditos por venda deve ser pelo menos 1.'); return }

    setSalvando(true)
    setErro('')

    const dados = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      valor: form.valor,
      creditos_por_venda: form.creditos_por_venda,
      dias_validade: form.dias_validade,
      descricao: form.descricao.trim() || null,
      ativo: form.ativo,
      unidade_id: form.unidade_id || null,
    }

    const op = modalProduto?.id
      ? supabase.from('produtos').update(dados).eq('id', modalProduto.id)
      : supabase.from('produtos').insert(dados)

    const { error } = await op

    if (error) {
      setErro('Erro ao salvar. Tente novamente.')
      setSalvando(false)
      return
    }

    setModalProduto(null)
    setSalvando(false)
    await carregar()
  }

  async function alternarAtivo(produto: any) {
    await supabase.from('produtos').update({ ativo: !produto.ativo }).eq('id', produto.id)
    await carregar()
  }

  if (loading || loadingData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const ativos = produtos.filter(p => p.ativo)
  const inativos = produtos.filter(p => !p.ativo)
  const tipoForm = TIPOS_PRODUTO.find(t => t.key === form.tipo)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Produtos</h1>
          <p className="text-xs text-gray-400 mt-0.5">{ativos.length} ativo(s) · {inativos.length} inativo(s)</p>
        </div>
        <button onClick={abrirNovo} className="btn btn-sm gap-1 bg-primary-600 text-white hover:bg-primary-700">
          <Plus size={14} /> Novo produto
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5">
        {produtos.length === 0 ? (
          <div className="card text-center py-16">
            <Package size={32} className="mx-auto text-gray-200 mb-3" />
            <div className="text-sm text-gray-400 mb-3">Nenhum produto cadastrado.</div>
            <button onClick={abrirNovo} className="btn btn-sm bg-primary-600 text-white">
              + Cadastrar primeiro produto
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {ativos.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ativos</div>
                <div className="space-y-2">
                  {ativos.map(p => (
                    <ProdutoCard key={p.id} produto={p} unidades={unidades} onEditar={() => abrirEditar(p)} onAlternar={() => alternarAtivo(p)} />
                  ))}
                </div>
              </div>
            )}
            {inativos.length > 0 && (
              <div className="mt-6">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Inativos</div>
                <div className="space-y-2">
                  {inativos.map(p => (
                    <ProdutoCard key={p.id} produto={p} unidades={unidades} onEditar={() => abrirEditar(p)} onAlternar={() => alternarAtivo(p)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {modalProduto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="font-semibold text-gray-900 text-lg">
                {modalProduto.id ? 'Editar produto' : 'Novo produto'}
              </div>
              <button onClick={() => setModalProduto(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Nome do produto</label>
                <input type="text" className="input w-full"
                  value={form.nome}
                  onChange={e => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Crédito Avulso Coach CT" />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Disponível em</label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    form.unidade_id === '' ? 'border-purple-400 bg-purple-50' : 'border-gray-200'
                  }`}>
                    <input type="radio" checked={form.unidade_id === ''}
                      onChange={() => setForm({ ...form, unidade_id: '' })}
                      className="mt-1 accent-purple-600" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">Rede (todas as unidades)</div>
                      <div className="text-xs text-gray-500 mt-0.5">Produto disponível em qualquer unidade</div>
                    </div>
                  </label>
                  {unidades.map(u => (
                    <label key={u.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      form.unidade_id === u.id ? 'border-primary-400 bg-primary-50' : 'border-gray-200'
                    }`}>
                      <input type="radio" checked={form.unidade_id === u.id}
                        onChange={() => setForm({ ...form, unidade_id: u.id })}
                        className="mt-1 accent-primary-600" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{u.nome}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Produto exclusivo desta unidade
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Tipo</label>
                <div className="space-y-2">
                  {TIPOS_PRODUTO.map(t => (
                    <label key={t.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      form.tipo === t.key ? 'border-primary-400 bg-primary-50' : 'border-gray-200'
                    }`}>
                      <input type="radio" checked={form.tipo === t.key}
                        onChange={() => setForm({ ...form, tipo: t.key })}
                        className="mt-1 accent-primary-600" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{t.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{t.descricao}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Valor (R$)</label>
                  <input type="number" min={0} step="0.01" className="input w-full"
                    value={form.valor}
                    onChange={e => setForm({ ...form, valor: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Créditos por venda</label>
                  <input type="number" min={1} max={100} className="input w-full"
                    value={form.creditos_por_venda}
                    onChange={e => setForm({ ...form, creditos_por_venda: parseInt(e.target.value) || 1 })} />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                <div className="font-semibold mb-1">💡 Como funciona "Créditos por venda":</div>
                <div>• <strong>1 crédito:</strong> a recepção define quantas unidades vender (ex: 5 créditos avulsos)</div>
                <div>• <strong>5/10/40 créditos:</strong> pacotes fechados, vendido como 1 unidade que dá N treinos</div>
              </div>

              {tipoForm?.precisaValidade && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Validade (dias)</label>
                  <input type="number" min={1} className="input w-full"
                    value={form.dias_validade}
                    onChange={e => setForm({ ...form, dias_validade: parseInt(e.target.value) || 30 })} />
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Descrição (opcional)</label>
                <textarea className="input w-full resize-none" rows={3}
                  value={form.descricao}
                  onChange={e => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Descrição que aparece para o cliente..." />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.ativo}
                  onChange={e => setForm({ ...form, ativo: e.target.checked })}
                  className="w-4 h-4 accent-primary-600" />
                <span className="text-sm text-gray-700">Produto ativo (disponível para venda)</span>
              </label>
            </div>

            {erro && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                {erro}
              </div>
            )}

            <div className="flex gap-2 mt-6">
              <button onClick={() => setModalProduto(null)}
                className="btn flex-1 text-gray-500 border border-gray-200">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700 gap-1">
                <Check size={12} /> {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
