'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, Spinner, EmptyState, KpiCard } from '@/components/ui'
import { ArrowLeft, Ban } from 'lucide-react'

type Unidade = { id: string; nome: string }
type Item = { quantidade: number; preco_unitario: number; subtotal: number; loja_produtos: { nome: string } | null }
type Venda = {
  id: string; unidade_id: string; valor_total: number; forma_pagamento: string
  observacao: string | null; vendido_em: string; excluido_em: string | null
  perfis: { nome: string } | null
  loja_venda_itens: Item[]
}

const FORMAS_PAGAMENTO: Record<string, string> = {
  pix: 'PIX',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  dinheiro: 'Dinheiro',
  cortesia: 'Cortesia',
}

function moeda(v: number) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
}

function hojeISO(offsetDias = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return d.toISOString().slice(0, 10)
}

export default function AdminLojaVendasPage() {
  const supabase = createClient()
  const { perfil } = useAuth()

  const [carregando, setCarregando] = useState(true)
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [vendas, setVendas] = useState<Venda[]>([])
  const [filtroUnidade, setFiltroUnidade] = useState('')
  const [de, setDe]   = useState(hojeISO(-30))
  const [ate, setAte] = useState(hojeISO())
  const [cancelando, setCancelando] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setUnidades((data || []) as Unidade[]))
  }, [])

  useEffect(() => { carregar() }, [filtroUnidade, de, ate])

  async function carregar() {
    setCarregando(true)
    let q = supabase
      .from('loja_vendas')
      .select('id, unidade_id, valor_total, forma_pagamento, observacao, vendido_em, excluido_em, perfis(nome), loja_venda_itens(quantidade, preco_unitario, subtotal, loja_produtos(nome))')
      .gte('vendido_em', `${de}T00:00:00`)
      .lte('vendido_em', `${ate}T23:59:59`)
      .order('vendido_em', { ascending: false })
      .limit(500)

    if (filtroUnidade) q = q.eq('unidade_id', filtroUnidade)

    const { data } = await q
    setVendas((data || []) as any)
    setCarregando(false)
  }

  async function cancelar(venda: Venda) {
    if (!confirm(`Cancelar esta venda de ${moeda(venda.valor_total)}? Os produtos voltam para o estoque.`)) return
    setCancelando(venda.id)
    const { data, error } = await supabase.rpc('loja_cancelar_venda', {
      p_venda_id: venda.id, p_por: perfil?.id, p_motivo: null,
    })
    setCancelando(null)
    if (error) { alert('Erro ao cancelar: ' + error.message); return }
    if (data && !data.sucesso) { alert('Não foi possível cancelar: ' + data.motivo); return }
    carregar()
  }

  const validas = vendas.filter(v => !v.excluido_em)
  const total = validas.reduce((soma, v) => soma + Number(v.valor_total), 0)
  const itensVendidos = validas.reduce(
    (soma, v) => soma + v.loja_venda_itens.reduce((s, i) => s + i.quantidade, 0), 0
  )

  // Ranking de produtos no período
  const porProduto = new Map<string, { qtd: number; valor: number }>()
  for (const v of validas) {
    for (const i of v.loja_venda_itens) {
      const nome = i.loja_produtos?.nome || '—'
      const atual = porProduto.get(nome) || { qtd: 0, valor: 0 }
      porProduto.set(nome, { qtd: atual.qtd + i.quantidade, valor: atual.valor + Number(i.subtotal) })
    }
  }
  const ranking = [...porProduto.entries()].sort((a, b) => b[1].valor - a[1].valor)

  // Faturamento por unidade — separado do faturamento de créditos e planos.
  const porUnidade = unidades.map(u => {
    const doPeriodo = validas.filter(v => v.unidade_id === u.id)
    return {
      unidade: u,
      vendas: doPeriodo.length,
      itens: doPeriodo.reduce((s, v) => s + v.loja_venda_itens.reduce((t, i) => t + i.quantidade, 0), 0),
      total: doPeriodo.reduce((s, v) => s + Number(v.valor_total), 0),
    }
  }).filter(l => l.vendas > 0).sort((a, b) => b.total - a.total)

  return (
    <div>
      <Link href="/admin/loja" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-3">
        <ArrowLeft size={14} /> Produtos e estoque
      </Link>

      <PageHeader title="Loja — Vendas" subtitle="Bebidas e comida vendidas no balcão das unidades." />

      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Unidade</label>
            <select className="input" value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)}>
              <option value="">Todas</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">De</label>
            <input type="date" className="input" value={de} onChange={e => setDe(e.target.value)} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" className="input" value={ate} onChange={e => setAte(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiCard label="Faturamento" value={moeda(total)} />
        <KpiCard label="Vendas" value={String(validas.length)} />
        <KpiCard label="Itens vendidos" value={String(itensVendidos)} />
      </div>

      {carregando ? <Spinner /> : (
        <>
          {porUnidade.length > 0 && (
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Faturamento por unidade</h2>
              <p className="text-xs text-gray-500 mb-3">
                Só produtos da loja. Não se mistura com o faturamento de créditos e planos.
              </p>
              <div className="card p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-left font-medium px-4 py-3">Unidade</th>
                      <th className="text-right font-medium px-3 py-3">Vendas</th>
                      <th className="text-right font-medium px-3 py-3">Itens</th>
                      <th className="text-right font-medium px-4 py-3">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porUnidade.map(l => (
                      <tr key={l.unidade.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2.5 text-gray-900">{l.unidade.nome}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-700">{l.vendas}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-700">{l.itens}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">{moeda(l.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {ranking.length > 0 && (
            <div className="mb-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Mais vendidos no período</h2>
              <div className="card p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-left font-medium px-4 py-3">Produto</th>
                      <th className="text-right font-medium px-3 py-3">Qtd</th>
                      <th className="text-right font-medium px-4 py-3">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map(([nome, r]) => (
                      <tr key={nome} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2.5 text-gray-900">{nome}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-700">{r.qtd}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">{moeda(r.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <h2 className="text-base font-semibold text-gray-900 mb-3">Vendas</h2>
          {vendas.length === 0 ? (
            <div className="card"><EmptyState message="Nenhuma venda no período." /></div>
          ) : (
            <div className="space-y-2">
              {vendas.map(v => {
                const unidade = unidades.find(u => u.id === v.unidade_id)?.nome || '—'
                const cancelada = !!v.excluido_em
                return (
                  <div key={v.id} className={`card ${cancelada ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{moeda(v.valor_total)}</span>
                          <span className="badge badge-blue">{unidade}</span>
                          <span className="badge badge-gray">{FORMAS_PAGAMENTO[v.forma_pagamento] || v.forma_pagamento}</span>
                          {cancelada && <span className="badge badge-red">Cancelada</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(v.vendido_em).toLocaleDateString('pt-BR')}{' '}
                          {new Date(v.vendido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          {v.perfis?.nome && ` · ${v.perfis.nome}`}
                        </div>
                        <div className="text-sm text-gray-700 mt-2">
                          {v.loja_venda_itens.map((i, idx) => (
                            <div key={idx}>
                              {i.quantidade}× {i.loja_produtos?.nome || '—'}
                              <span className="text-gray-400"> · {moeda(i.subtotal)}</span>
                            </div>
                          ))}
                        </div>
                        {v.observacao && <div className="text-xs text-gray-500 italic mt-1">{v.observacao}</div>}
                      </div>
                      {!cancelada && (
                        <button className="btn btn-sm btn-danger" onClick={() => cancelar(v)} disabled={cancelando === v.id}>
                          <Ban size={13} /> {cancelando === v.id ? 'Cancelando...' : 'Cancelar'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
