'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { ShoppingBag, CreditCard, Zap, CheckCircle, XCircle, Clock } from 'lucide-react'

export default function AdminVendasOnlinePage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [vendas, setVendas] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('30d')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') router.push('/')
  }, [perfil, loading])

  useEffect(() => {
    if (perfil) carregar()
  }, [perfil, filtroPeriodo, dataInicio, dataFim])

  async function carregar() {
    let query = supabase
      .from('pagamentos_pendentes')
      .select('*, clientes(nome, email), produtos(nome, subtipo)')
      .order('created_at', { ascending: false })
      .limit(200)

    const agora = new Date()

    if (filtroPeriodo === 'hoje') {
      const inicio = new Date(agora)
      inicio.setHours(0, 0, 0, 0)
      query = query.gte('created_at', inicio.toISOString())
    } else if (filtroPeriodo === '7d') {
      const inicio = new Date(agora)
      inicio.setDate(inicio.getDate() - 7)
      query = query.gte('created_at', inicio.toISOString())
    } else if (filtroPeriodo === '30d') {
      const inicio = new Date(agora)
      inicio.setDate(inicio.getDate() - 30)
      query = query.gte('created_at', inicio.toISOString())
    } else if (filtroPeriodo === 'mes_atual') {
      const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
      query = query.gte('created_at', inicio.toISOString())
    } else if (filtroPeriodo === 'custom' && dataInicio) {
      query = query.gte('created_at', new Date(dataInicio).toISOString())
      if (dataFim) {
        const fim = new Date(dataFim)
        fim.setHours(23, 59, 59, 999)
        query = query.lte('created_at', fim.toISOString())
      }
    }

    const { data } = await query
    setVendas(data || [])
    setLoadingData(false)
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
    if (m === 'cartao_credito') return { label: 'Cartão', icon: CreditCard, color: 'text-blue-600 bg-blue-50' }
    if (m === 'pix') return { label: 'PIX', icon: Zap, color: 'text-green-600 bg-green-50' }
    return { label: m, icon: CreditCard, color: 'text-gray-600 bg-gray-50' }
  }

  function labelStatus(s: string) {
    if (s === 'pago') return { label: 'Pago', icon: CheckCircle, color: 'text-green-700 bg-green-50 border-green-200' }
    if (s === 'falhou') return { label: 'Falhou', icon: XCircle, color: 'text-red-700 bg-red-50 border-red-200' }
    if (s === 'pendente') return { label: 'Pendente', icon: Clock, color: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
    if (s === 'expirado') return { label: 'Expirado', icon: XCircle, color: 'text-gray-600 bg-gray-50 border-gray-200' }
    return { label: s, icon: Clock, color: 'text-gray-600 bg-gray-50 border-gray-200' }
  }

  const filtrados = filtroStatus === 'todos' ? vendas : vendas.filter(v => v.status === filtroStatus)

  const totais = {
    pago: vendas.filter(v => v.status === 'pago').reduce((acc, v) => acc + Number(v.valor_total), 0),
    qtd_pago: vendas.filter(v => v.status === 'pago').length,
    qtd_falhou: vendas.filter(v => v.status === 'falhou').length,
    qtd_pendente: vendas.filter(v => v.status === 'pendente').length,
  }

  const periodos = [
    { key: 'hoje', label: 'Hoje' },
    { key: '7d', label: '7 dias' },
    { key: '30d', label: '30 dias' },
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
            <h1 className="text-lg font-semibold text-gray-900">Vendas Online</h1>
            <p className="text-xs text-gray-400 mt-0.5">Transações via Pagar.me</p>
          </div>
          <ShoppingBag size={20} className="text-gray-300" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-5">

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-600">{formatarValor(totais.pago)}</div>
            <div className="text-xs text-gray-400 mt-1">Total recebido</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-gray-800">{totais.qtd_pago}</div>
            <div className="text-xs text-gray-400 mt-1">Pagos</div>
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

        {/* Filtro de período */}
        <div className="flex gap-2 mb-3 flex-wrap">
          {periodos.map(p => (
            <button key={p.key} onClick={() => setFiltroPeriodo(p.key)}
              className={`btn btn-sm ${filtroPeriodo === p.key ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-500'}`}>
              {p.label}
            </button>
          ))}
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
        <div className="flex gap-2 mb-4 flex-wrap">
          {['todos', 'pago', 'pendente', 'falhou', 'expirado'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`btn btn-sm capitalize ${filtroStatus === s ? 'bg-gray-800 text-white' : 'border border-gray-200 text-gray-500'}`}>
              {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div className="card text-center py-16">
            <ShoppingBag size={32} className="mx-auto text-gray-200 mb-3" />
            <div className="text-sm text-gray-400">Nenhuma transação encontrada.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtrados.map(v => {
              const metodo = labelMetodo(v.metodo_pagamento)
              const status = labelStatus(v.status)
              const MetodoIcon = metodo.icon
              const StatusIcon = status.icon
              return (
                <div key={v.id} className="card flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${metodo.color}`}>
                    <MetodoIcon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">
                        {v.clientes?.nome || '—'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${status.color}`}>
                        <StatusIcon size={10} />
                        {status.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                      <span>{v.produtos?.nome || '—'}</span>
                      <span>·</span>
                      <span>{metodo.label}</span>
                      {v.parcelas > 1 && <span>· {v.parcelas}x</span>}
                      <span>·</span>
                      <span>{formatarData(v.created_at)}</span>
                    </div>
                    {v.motivo_falha && (
                      <div className="text-xs text-red-500 mt-0.5">{v.motivo_falha}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-gray-900">{formatarValor(v.valor_total)}</div>
                    {v.clientes?.email && (
                      <div className="text-xs text-gray-400">{v.clientes.email}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
