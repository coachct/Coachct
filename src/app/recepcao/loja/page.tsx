'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { ShoppingCart, Plus, Minus, X, Check, Coffee, Sandwich, Package } from 'lucide-react'

type Produto = { id: string; nome: string; categoria: string; preco: number }

const FORMAS_PAGAMENTO = [
  { key: 'pix', label: 'PIX' },
  { key: 'cartao_credito', label: 'Cartão de crédito' },
  { key: 'cartao_debito', label: 'Cartão de débito' },
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'cortesia', label: 'Cortesia' },
]

const ICONE_CATEGORIA: Record<string, any> = {
  bebida: Coffee, comida: Sandwich, outro: Package,
}

function moeda(v: number) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
}

export default function RecepcaoLojaPage() {
  const supabase = createClient()
  const { perfil } = useAuth()
  const { unidadeAtiva, loading: loadingUnidade } = useUnidade()

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [saldos, setSaldos] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)

  // Carrinho: produto_id -> quantidade
  const [carrinho, setCarrinho] = useState<Record<string, number>>({})
  const [modalPagamento, setModalPagamento] = useState(false)
  const [forma, setForma] = useState('dinheiro')
  const [observacao, setObservacao] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState<{ total: number; itens: number } | null>(null)

  // Fechamento do dia
  const [resumoHoje, setResumoHoje] = useState({ vendas: 0, total: 0 })

  useEffect(() => {
    if (!loadingUnidade && unidadeAtiva) carregar()
  }, [loadingUnidade, unidadeAtiva?.id])

  async function carregar() {
    setCarregando(true)
    const [p, s] = await Promise.all([
      supabase.from('loja_produtos').select('id, nome, categoria, preco').eq('ativo', true).order('categoria').order('nome'),
      supabase.from('loja_estoque_atual').select('produto_id, saldo').eq('unidade_id', unidadeAtiva!.id),
    ])
    setProdutos((p.data || []) as Produto[])
    const mapa: Record<string, number> = {}
    for (const linha of (s.data || []) as any[]) mapa[linha.produto_id] = linha.saldo
    setSaldos(mapa)
    setCarregando(false)
    carregarResumoHoje()
  }

  async function carregarResumoHoje() {
    const hoje = new Date()
    const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    const { data } = await supabase
      .from('loja_vendas')
      .select('valor_total')
      .eq('unidade_id', unidadeAtiva!.id)
      .gte('vendido_em', `${inicio}T00:00:00`)
      .is('excluido_em', null)
    const linhas = (data || []) as any[]
    setResumoHoje({
      vendas: linhas.length,
      total: linhas.reduce((s, v) => s + Number(v.valor_total), 0),
    })
  }

  function adicionar(p: Produto) {
    const noCarrinho = carrinho[p.id] || 0
    const disponivel = saldos[p.id] ?? 0
    if (noCarrinho >= disponivel) return
    setCarrinho({ ...carrinho, [p.id]: noCarrinho + 1 })
  }

  function remover(produtoId: string) {
    const atual = carrinho[produtoId] || 0
    const novo = { ...carrinho }
    if (atual <= 1) delete novo[produtoId]
    else novo[produtoId] = atual - 1
    setCarrinho(novo)
  }

  const itensCarrinho = Object.entries(carrinho).map(([id, qtd]) => {
    const p = produtos.find(x => x.id === id)!
    return { produto: p, quantidade: qtd, subtotal: (p?.preco || 0) * qtd }
  }).filter(i => i.produto)

  const total = itensCarrinho.reduce((s, i) => s + i.subtotal, 0)
  const qtdItens = itensCarrinho.reduce((s, i) => s + i.quantidade, 0)

  async function confirmarVenda() {
    if (!unidadeAtiva || itensCarrinho.length === 0) return
    setRegistrando(true); setErro('')

    const { data, error } = await supabase.rpc('loja_registrar_venda', {
      p_unidade_id: unidadeAtiva.id,
      p_itens: itensCarrinho.map(i => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
      p_forma_pagamento: forma,
      p_vendido_por: perfil?.id,
      p_observacao: observacao.trim() || null,
    })
    setRegistrando(false)

    if (error) { setErro('Erro ao registrar venda: ' + error.message); return }
    if (data && !data.sucesso) {
      const MOTIVOS: Record<string, string> = {
        estoque_insuficiente: data.produto
          ? `Estoque insuficiente de ${data.produto}: tem ${data.saldo}, pediu ${data.pedido}.`
          : 'Estoque insuficiente.',
        produto_nao_encontrado_ou_inativo: 'Um dos produtos saiu do cardápio. Recarregue a tela.',
        carrinho_vazio: 'Adicione pelo menos um produto.',
        quantidade_invalida: 'Quantidade inválida.',
        forma_pagamento_obrigatoria: 'Escolha a forma de pagamento.',
      }
      setErro(MOTIVOS[data.motivo] || ('Erro: ' + (data.motivo || 'desconhecido')))
      return
    }

    setSucesso({ total: Number(data.valor_total), itens: qtdItens })
    setModalPagamento(false)
    setCarrinho({}); setObservacao(''); setForma('dinheiro')
    carregar()
  }

  if (loadingUnidade || carregando) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!unidadeAtiva) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-sm text-gray-500 text-center">
        Nenhuma unidade vinculada a este acesso. Peça ao admin para liberar.
      </div>
    </div>
  )

  const hojeExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen bg-gray-50 pb-32">

      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <ShoppingCart size={18} />
          </div>
          <div>
            <div className="text-base font-semibold text-gray-900">Venda de Produtos</div>
            <div className="text-xs text-gray-400 capitalize">{hojeExtenso}</div>
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">
          {unidadeAtiva.nome}
        </span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5">

        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-gray-900">Produtos</div>
          <span className="text-xs text-gray-400">
            Hoje: {resumoHoje.vendas} {resumoHoje.vendas === 1 ? 'venda' : 'vendas'} · {moeda(resumoHoje.total)}
          </span>
        </div>

        {produtos.length === 0 ? (
          <div className="card text-center py-12">
            <ShoppingCart size={32} className="mx-auto text-gray-200 mb-3" />
            <div className="text-sm text-gray-400">Nenhum produto cadastrado. Fale com o admin.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {produtos.map(p => {
              const disponivel = saldos[p.id] ?? 0
              const noCarrinho = carrinho[p.id] || 0
              const esgotado = disponivel <= 0
              const noLimite = noCarrinho >= disponivel
              const Icone = ICONE_CATEGORIA[p.categoria] || Package
              return (
                <button
                  key={p.id}
                  onClick={() => adicionar(p)}
                  disabled={esgotado || noLimite}
                  className={`card text-left transition-all ${
                    esgotado
                      ? 'opacity-50 cursor-not-allowed'
                      : noLimite
                        ? 'opacity-70 cursor-not-allowed border-primary-200'
                        : 'hover:border-primary-300 hover:shadow-sm cursor-pointer'
                  } ${noCarrinho > 0 ? 'border-primary-400 bg-primary-50/40' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center flex-shrink-0">
                      <Icone size={15} />
                    </div>
                    {noCarrinho > 0 && (
                      <span className="w-6 h-6 rounded-full bg-primary-400 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                        {noCarrinho}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-gray-900 mt-2 leading-snug">{p.nome}</div>
                  <div className="font-mono text-sm font-semibold text-gray-700 mt-1">{moeda(p.preco)}</div>
                  <div className={`text-xs mt-1 ${esgotado ? 'text-danger-600 font-medium' : disponivel <= 5 ? 'text-warning-800' : 'text-gray-400'}`}>
                    {esgotado ? 'Esgotado' : `${disponivel} em estoque`}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ---------- Carrinho fixo ---------- */}
      {itensCarrinho.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-[200px] bg-white border-t border-gray-200 z-30 shadow-lg">
          <div className="max-w-3xl mx-auto px-6 py-3">
            <div className="max-h-32 overflow-y-auto mb-2 space-y-1">
              {itensCarrinho.map(i => (
                <div key={i.produto.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-700 truncate flex-1">{i.produto.nome}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => remover(i.produto.id)}
                      className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                      <Minus size={12} />
                    </button>
                    <span className="w-5 text-center font-medium">{i.quantidade}</span>
                    <button onClick={() => adicionar(i.produto)}
                      disabled={i.quantidade >= (saldos[i.produto.id] ?? 0)}
                      className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40">
                      <Plus size={12} />
                    </button>
                    <span className="font-mono text-gray-700 w-16 text-right">{moeda(i.subtotal)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setCarrinho({})} className="btn btn-sm">Limpar</button>
              <button
                onClick={() => { setErro(''); setModalPagamento(true) }}
                className="btn btn-primary flex-1 py-3 font-semibold">
                Fechar venda · {moeda(total)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal: pagamento ---------- */}
      {modalPagamento && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="text-base font-semibold text-gray-900">Fechar venda</div>
              <button className="text-gray-400 hover:text-gray-700" onClick={() => setModalPagamento(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1">
              {itensCarrinho.map(i => (
                <div key={i.produto.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{i.quantidade}× {i.produto.nome}</span>
                  <span className="font-mono text-gray-700">{moeda(i.subtotal)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 mt-2 border-t border-gray-200 font-semibold">
                <span>Total</span>
                <span className="font-mono">{moeda(total)}</span>
              </div>
            </div>

            <label className="label">Forma de pagamento</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {FORMAS_PAGAMENTO.map(f => (
                <button key={f.key} onClick={() => setForma(f.key)}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                    forma === f.key
                      ? 'border-green-400 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            <label className="label">Observação (opcional)</label>
            <input className="input mb-4" value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: levou para a aula" />

            {erro && <div className="text-sm text-danger-600 mb-3">{erro}</div>}

            <button onClick={confirmarVenda} disabled={registrando}
              className="btn btn-primary w-full py-3 font-semibold">
              {registrando ? 'Registrando...' : `Confirmar · ${moeda(total)}`}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Modal: venda registrada ---------- */}
      {sucesso && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center mx-auto mb-3">
              <Check size={26} />
            </div>
            <div className="text-base font-semibold text-gray-900">Venda registrada</div>
            <div className="text-sm text-gray-500 mt-1">
              {sucesso.itens} {sucesso.itens === 1 ? 'item' : 'itens'} · {moeda(sucesso.total)}
            </div>
            <button className="btn btn-primary w-full mt-5 py-3 font-semibold" onClick={() => setSucesso(null)}>
              Nova venda
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
