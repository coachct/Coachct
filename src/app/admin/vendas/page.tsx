'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { ShoppingBag, CreditCard, Zap, CheckCircle, XCircle, Clock, Banknote, Store, Globe, Trash2 } from 'lucide-react'

type VendaUnificada = {
  id: string
  origem: 'site' | 'balcao'
  cliente_nome: string
  cliente_email: string | null
  produto_nome: string
  valor_total: number
  metodo: string
  parcelas: number | null
  status: string
  data: string
  motivo_falha: string | null
  vendedor_nome: string | null
  unidade_id: string | null
}

export default function AdminVendasPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [vendas, setVendas] = useState<VendaUnificada[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('mes_atual')
  const [filtroUnidade, setFiltroUnidade] = useState<string>('todas')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') router.push('/')
  }, [perfil, loading])

  useEffect(() => {
    if (perfil) carregarUnidades()
  }, [perfil])

  useEffect(() => {
    if (perfil) carregar()
  }, [perfil, filtroPeriodo, filtroUnidade, dataInicio, dataFim])

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades').select('id, nome').order('nome')
    setUnidades(data || [])
  }

  function inicioPeriodo(): Date | null {
    const agora = new Date()
    if (filtroPeriodo === 'hoje') {
      const i = new Date(agora); i.setHours(0, 0, 0, 0); return i
    }
    if (filtroPeriodo === '7d') {
      const i = new Date(agora); i.setDate(i.getDate() - 7); return i
    }
    if (filtroPeriodo === '15d') {
      const i = new Date(agora); i.setDate(i.getDate() - 15); return i
    }
    if (filtroPeriodo === 'mes_atual') {
      return new Date(agora.getFullYear(), agora.getMonth(), 1)
    }
    if (filtroPeriodo === 'custom' && dataInicio) {
      return new Date(dataInicio)
    }
    return null
  }

  function fimPeriodo(): Date | null {
    if (filtroPeriodo === 'custom' && dataFim) {
      const f = new Date(dataFim); f.setHours(23, 59, 59, 999); return f
    }
    return null
  }

  async function carregar() {
    const inicio = inicioPeriodo()
    const fim = fimPeriodo()

    // ---- ONLINE (Pagar.me) ----
    let qOnline = supabase
      .from('pagamentos_pendentes')
      .select('*, clientes(nome, email), produtos(nome, subtipo)')
      .is('excluido_em', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (inicio) qOnline = qOnline.gte('created_at', inicio.toISOString())
    if (fim) qOnline = qOnline.lte('created_at', fim.toISOString())
    if (filtroUnidade !== 'todas') qOnline = qOnline.eq('unidade_id', filtroUnidade)
    const { data: onlineRaw } = await qOnline

    // ---- BALCÃO (vendas registradas pela equipe) ----
    let qBalcao = supabase
      .from('vendas')
      .select('*')
      .is('excluido_em', null)
      .order('vendido_em', { ascending: false })
      .limit(200)
    if (inicio) qBalcao = qBalcao.gte('vendido_em', inicio.toISOString())
    if (fim) qBalcao = qBalcao.lte('vendido_em', fim.toISOString())
    if (filtroUnidade !== 'todas') qBalcao = qBalcao.eq('unidade_id', filtroUnidade)
    const { data: balcaoRaw } = await qBalcao

    // vendas que já vieram do online (têm venda_id apontando pra elas) — pra não duplicar
    const idsVendaOnline = new Set(
      (onlineRaw || []).map((o: any) => o.venda_id).filter(Boolean)
    )
    const balcaoPuro = (balcaoRaw || []).filter((v: any) => !idsVendaOnline.has(v.id))

    // ---- lookups pro balcão: cliente, produto, vendedor ----
    const clienteIds = [...new Set(balcaoPuro.map((v: any) => v.cliente_id).filter(Boolean))]
    const produtoIds = [...new Set(balcaoPuro.map((v: any) => v.produto_id).filter(Boolean))]
    const vendedorIds = [...new Set(balcaoPuro.map((v: any) => v.vendido_por).filter(Boolean))]

    const [clientesRes, produtosRes, vendedoresRes] = await Promise.all([
      clienteIds.length
        ? supabase.from('clientes').select('id, nome, email').in('id', clienteIds)
        : Promise.resolve({ data: [] as any[] }),
      produtoIds.length
        ? supabase.from('produtos').select('id, nome').in('id', produtoIds)
        : Promise.resolve({ data: [] as any[] }),
      vendedorIds.length
        ? supabase.from('perfis').select('id, nome').in('id', vendedorIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const mapCliente = new Map((clientesRes.data || []).map((c: any) => [c.id, c]))
    const mapProduto = new Map((produtosRes.data || []).map((p: any) => [p.id, p]))
    const mapVendedor = new Map((vendedoresRes.data || []).map((p: any) => [p.id, p]))

    // ---- unificar as duas fontes ----
    const online: VendaUnificada[] = (onlineRaw || []).map((o: any) => ({
      id: o.id,
      origem: 'site',
      cliente_nome: o.clientes?.nome || '—',
      cliente_email: o.clientes?.email || null,
      produto_nome: o.produtos?.nome || '—',
      valor_total: Number(o.valor_total) || 0,
      metodo: o.metodo_pagamento,
      parcelas: o.parcelas,
      status: o.status,
      data: o.created_at,
      motivo_falha: o.motivo_falha || null,
      vendedor_nome: null,
      unidade_id: o.unidade_id,
    }))

    const balcao: VendaUnificada[] = balcaoPuro.map((v: any) => ({
      id: v.id,
      origem: 'balcao',
      cliente_nome: mapCliente.get(v.cliente_id)?.nome || '—',
      cliente_email: mapCliente.get(v.cliente_id)?.email || null,
      produto_nome: mapProduto.get(v.produto_id)?.nome || '—',
      valor_total: Number(v.valor_total) || 0,
      metodo: v.forma_pagamento,
      parcelas: null,
      status: 'pago',
      data: v.vendido_em,
      motivo_falha: null,
      vendedor_nome: mapVendedor.get(v.vendido_por)?.nome || null,
      unidade_id: v.unidade_id,
    }))

    const unificado = [...online, ...balcao].sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
    )

    setVendas(unificado)
    setLoadingData(false)
  }

  async function excluirVenda(v: VendaUnificada) {
    if (!confirm(
      `Excluir a venda de ${v.cliente_nome} (${formatarValor(v.valor_total)})?\n\n` +
      `Ela sai da lista e da soma. Não estorna créditos/plano já gerados.`
    )) return

    const tabela = v.origem === 'site' ? 'pagamentos_pendentes' : 'vendas'
    const { error } = await supabase
      .from(tabela)
      .update({ excluido_em: new Date().toISOString(), excluido_por: perfil?.id })
      .eq('id', v.id)

    if (error) {
      alert('Não foi possível excluir: ' + error.message)
      return
    }
    setVendas(prev => prev.filter(x => x.id !== v.id))
  }

  function formatarValor(v: number) {
    return `R$ ${Number(v).toFixed(2).replace('.', ',')}`
  }

  function formatarData(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  function labelMetodo(m: string) {
    const v = (m || '').toLowerCase()
    if (v.includes('debito')) return { label: 'Cartão déb.', icon: CreditCard, color: 'text-blue-600 bg-blue-50' }
    if (v.includes('credito') || v === 'cartao' || v.includes('cartão')) return { label: 'Cartão', icon: CreditCard, color: 'text-blue-600 bg-blue-50' }
    if (v === 'pix') return { label: 'PIX', icon: Zap, color: 'text-green-600 bg-green-50' }
    if (v.includes('dinheiro') || v.includes('especie') || v.includes('espécie')) return { label: 'Dinheiro', icon: Banknote, color: 'text-emerald-600 bg-emerald-50' }
    return { label: m || '—', icon: CreditCard, color: 'text-gray-600 bg-gray-50' }
  }

  function labelStatus(s: string) {
    if (s === 'pago') return { label: 'Pago', icon: CheckCircle, color: 'text-green-700 bg-green-50 border-green-200' }
    if (s === 'falhou') return { label: 'Falhou', icon: XCircle, color: 'text-red-700 bg-red-50 border-red-200' }
    if (s === 'pendente') return { label: 'Pendente', icon: Clock, color: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
    if (s === 'expirado') return { label: 'Expirado', icon: XCircle, color: 'text-gray-600 bg-gray-50 border-gray-200' }
    return { label: s, icon: Clock, color: 'text-gray-600 bg-gray-50 border-gray-200' }
  }

  function badgeOrigem(o: 'site' | 'balcao') {
    if (o === 'site') return { label: 'Site', icon: Globe, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' }
    return { label: 'Balcão', icon: Store, color: 'text-orange-600 bg-orange-50 border-orange-200' }
  }

  const filtrados = filtroStatus === 'todos' ? vendas : vendas.filter(v => v.status === filtroStatus)

  const totais = {
    recebido: vendas.filter(v => v.status === 'pago').reduce((acc, v) => acc + v.valor_total, 0),
    qtd_pago: vendas.filter(v => v.status === 'pago').length,
    qtd_pendente: vendas.filter(v => v.status === 'pendente').length,
    qtd_falhou: vendas.filter(v => v.status === 'falhou').length,
  }

  const periodos = [
    { key: 'hoje', label: 'Hoje' },
    { key: '7d', label: 'Semana' },
    { key: '15d', label: '15 dias' },
    { key: 'mes_atual', label: 'Mês atual' },
    { key: 'custom', label: 'Personalizado' },
  ]

  if (loading || loadingData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Vendas</h1>
            <p className="text-xs text-gray-400 mt-0.5">Todas as vendas — site e balcão</p>
          </div>
          <ShoppingBag size={20} className="text-gray-300" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-5">

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-600">{formatarValor(totais.recebido)}</div>
            <div className="text-xs text-gray-400 mt-1">Total recebido</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-gray-800">{totais.qtd_pago}</div>
            <div className="text-xs text-gray-400 mt-1">Pagas</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-yellow-500">{totais.qtd_pendente}</div>
            <div className="text-xs text-gray-400 mt-1">Pendentes</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-red-500">{totais.qtd_falhou}</div>
            <div className="text-xs text-gray-400 mt-1">Falharam</div>
          </div>
        </div>

        {/* Filtro de unidade */}
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-1">Unidade</div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFiltroUnidade('todas')}
              className={`btn btn-sm ${filtroUnidade === 'todas' ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-500'}`}>
              Todas
            </button>
            {unidades.map(u => (
              <button key={u.id} onClick={() => setFiltroUnidade(u.id)}
                className={`btn btn-sm ${filtroUnidade === u.id ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-500'}`}>
                {u.nome}
              </button>
            ))}
          </div>
        </div>

        {/* Filtro de período */}
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-1">Período</div>
          <div className="flex gap-2 flex-wrap">
            {periodos.map(p => (
              <button key={p.key} onClick={() => setFiltroPeriodo(p.key)}
                className={`btn btn-sm ${filtroPeriodo === p.key ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-500'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Campos de data personalizada */}
        {filtroPeriodo === 'custom' && (
          <div className="flex gap-3 mb-4 flex-wrap items-center">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">De</label>
              <input type="date" className="input text-sm"
                value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Até</label>
              <input type="date" className="input text-sm"
                value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
          </div>
        )}

        {/* Filtro de status */}
        <div className="mb-4">
          <div className="text-xs text-gray-400 mb-1">Status</div>
          <div className="flex gap-2 flex-wrap">
            {['todos', 'pago', 'pendente', 'falhou', 'expirado'].map(s => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={`btn btn-sm capitalize ${filtroStatus === s ? 'bg-gray-800 text-white' : 'border border-gray-200 text-gray-500'}`}>
                {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div className="card text-center py-16">
            <ShoppingBag size={32} className="mx-auto text-gray-200 mb-3" />
            <div className="text-sm text-gray-400">Nenhuma venda encontrada.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtrados.map(v => {
              const metodo = labelMetodo(v.metodo)
              const status = labelStatus(v.status)
              const origem = badgeOrigem(v.origem)
              const MetodoIcon = metodo.icon
              const StatusIcon = status.icon
              const OrigemIcon = origem.icon
              return (
                <div key={v.id} className="card flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${metodo.color}`}>
                    <MetodoIcon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {v.cliente_nome}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${origem.color}`}>
                        <OrigemIcon size={10} />
                        {origem.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${status.color}`}>
                        <StatusIcon size={10} />
                        {status.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                      <span>{v.produto_nome}</span>
                      <span>·</span>
                      <span>{metodo.label}</span>
                      {v.parcelas && v.parcelas > 1 && <span>· {v.parcelas}x</span>}
                      <span>·</span>
                      <span>{formatarData(v.data)}</span>
                      {v.vendedor_nome && (
                        <>
                          <span>·</span>
                          <span>Vendido por {v.vendedor_nome}</span>
                        </>
                      )}
                    </div>
                    {v.motivo_falha && (
                      <div className="text-xs text-red-500 mt-0.5">{v.motivo_falha}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-gray-900">{formatarValor(v.valor_total)}</div>
                    {v.cliente_email && (
                      <div className="text-xs text-gray-400">{v.cliente_email}</div>
                    )}
                  </div>
                  <button
                    onClick={() => excluirVenda(v)}
                    title="Excluir venda"
                    className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
