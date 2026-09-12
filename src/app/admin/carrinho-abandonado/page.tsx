'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, Badge, Insight, EmptyState } from '@/components/ui'

type Etapa = 'abriu' | 'pix_nao_pago' | 'cartao_recusado'
type Linha = {
  visita_em: string
  cliente_id: string
  cliente_nome: string
  telefone: string | null
  produto_nome: string
  valor: number
  unidade_id: string | null
  unidade_nome: string | null
  etapa: Etapa
}

const ETAPAS = {
  abriu:           { label: 'Só abriu o checkout',   variant: 'gray' },
  pix_nao_pago:    { label: 'Gerou Pix e não pagou', variant: 'amber' },
  cartao_recusado: { label: 'Cartão recusado',       variant: 'red' },
} as const

const DIAS = 30

function fmtDataHora(s: string) {
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fmtValor(v: number) {
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`
}

export default function CarrinhoAbandonadoPage() {
  const supabase = createClient()

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [unidadeId, setUnidadeId] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc('carrinhos_abandonados', { p_dias: DIAS })
      if (error) setErro(error.message)
      else setLinhas((data || []) as Linha[])
      setLoading(false)
    }
    load()
  }, [])

  // Unidades que aparecem na lista (produto sem unidade fica de fora do filtro)
  const unidades = useMemo(() => {
    const m = new Map<string, string>()
    linhas.forEach(l => { if (l.unidade_id && l.unidade_nome) m.set(l.unidade_id, l.unidade_nome) })
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [linhas])

  const filtradas = unidadeId ? linhas.filter(l => l.unidade_id === unidadeId) : linhas

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Carrinho abandonado"
        subtitle={`Clientes logados que abriram o checkout e não compraram em 1 hora — últimos ${DIAS} dias`}
      />

      {erro && <Insight variant="red">Erro ao carregar: {erro}</Insight>}

      <Insight variant="amber">
        O registro das visitas ao checkout começou em 12/09/2026 — antes disso não há dados.
        Só entra quem estava logado como cliente; quem compra depois sai da lista.
      </Insight>

      <div className="card mb-4">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Unidade</div>
        <select
          value={unidadeId}
          onChange={e => setUnidadeId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="">Todas as unidades</option>
          {unidades.map(u => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-3 pr-2">Quando</th>
                <th className="text-left pb-3 pr-2">Cliente</th>
                <th className="text-left pb-3 pr-2">Telefone</th>
                <th className="text-left pb-3 pr-2">Produto</th>
                <th className="text-left pb-3 pr-2">Unidade</th>
                <th className="text-left pb-3">Até onde chegou</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map(l => {
                const tel = (l.telefone || '').replace(/\D/g, '')
                const etapa = ETAPAS[l.etapa] || ETAPAS.abriu
                return (
                  <tr key={`${l.cliente_id}-${l.produto_nome}-${l.visita_em}`}>
                    <td className="py-2.5 pr-2 text-gray-600 whitespace-nowrap">{fmtDataHora(l.visita_em)}</td>
                    <td className="py-2.5 pr-2 font-medium text-gray-900">{l.cliente_nome}</td>
                    <td className="py-2.5 pr-2 text-xs whitespace-nowrap">
                      {tel ? (
                        <a
                          href={`https://wa.me/55${tel}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          {l.telefone}
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2">
                      <div className="text-gray-900">{l.produto_nome}</div>
                      <div className="text-xs text-gray-400">{fmtValor(l.valor)}</div>
                    </td>
                    <td className="py-2.5 pr-2 text-gray-600">{l.unidade_nome || '—'}</td>
                    <td className="py-2.5">
                      <Badge variant={etapa.variant}>{etapa.label}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtradas.length === 0 && (
            <EmptyState message="Nenhum carrinho abandonado no período." />
          )}
        </div>
      </div>
    </div>
  )
}
