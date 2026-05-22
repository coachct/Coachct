'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { useRouter } from 'next/navigation'
import { AlertCircle, CreditCard, X, Check, Calendar, DollarSign, Users, AlertTriangle, Filter } from 'lucide-react'
import UnidadeSelector from '@/components/UnidadeSelector'

const VALOR_MULTA = 99.00
const PRODUTO_MULTA_ID = '7a0e93e1-98b0-4125-a993-7a688e8e34bb'

type FiltroPeriodo = 'hoje' | 'semana' | 'mes' | 'tudo'
type FiltroStatus = 'todos' | 'pendente' | 'cobrado' | 'sem_cartao'

function formatarBR(data: string) {
  return new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')
}

function formatarMoeda(v: number) {
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`
}

export default function CobrancaNoShowPage() {
  const { perfil, loading } = useAuth()
  const { unidadeAtiva, loading: loadingUnidade } = useUnidade()
  const router = useRouter()
  const supabase = createClient()

  const [faltas, setFaltas] = useState<any[]>([])
  const [loadingFaltas, setLoadingFaltas] = useState(false)
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>('mes')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos')

  const [modalCobranca, setModalCobranca] = useState<any>(null)
  const [cobrando, setCobrando] = useState(false)
  const [erroCobranca, setErroCobranca] = useState('')
  const [sucessoCobranca, setSucessoCobranca] = useState<any>(null)

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if (!['admin', 'coordenadora'].includes(perfil.role as any)) { router.push('/'); return }
  }, [loading, perfil])

  useEffect(() => {
    if (perfil && unidadeAtiva) carregarFaltas()
  }, [perfil, unidadeAtiva?.id, filtroPeriodo])

  function getRangeData(): { de: string; ate: string } {
    const hoje = new Date()
    const ate = hoje.toISOString().split('T')[0]
    let de = ate

    if (filtroPeriodo === 'hoje') {
      de = ate
    } else if (filtroPeriodo === 'semana') {
      const d = new Date(hoje)
      d.setDate(d.getDate() - 7)
      de = d.toISOString().split('T')[0]
    } else if (filtroPeriodo === 'mes') {
      const d = new Date(hoje)
      d.setDate(d.getDate() - 30)
      de = d.toISOString().split('T')[0]
    } else {
      const d = new Date(hoje)
      d.setDate(d.getDate() - 365)
      de = d.toISOString().split('T')[0]
    }
    return { de, ate }
  }

  async function carregarFaltas() {
    if (!unidadeAtiva) return
    setLoadingFaltas(true)

    const { de, ate } = getRangeData()

    // 1. Busca faltas do período na unidade
    const { data: agsRaw, error } = await supabase
      .from('agendamentos')
      .select(`
        id, cliente_id, coach_id, data, horario, status, tipo_credito, unidade_id,
        clientes(id, nome, cpf, email, telefone, bloqueado, pagarme_customer_id, pagarme_card_id, pagarme_card_last4, pagarme_card_brand),
        coaches(id, nome)
      `)
      .eq('status', 'falta')
      .eq('unidade_id', unidadeAtiva.id)
      .gte('data', de)
      .lte('data', ate)
      .order('data', { ascending: false })
      .order('horario', { ascending: false })

    if (error) {
      console.error('Erro ao carregar faltas:', error)
      setFaltas([])
      setLoadingFaltas(false)
      return
    }

    const ags: any[] = agsRaw || []

    // 2. Para cada falta, verifica se já foi cobrada
    //    Verifica em DOIS lugares:
    //    a) cobrancas_pendentes com status='pago' (cliente regularizou ou admin cobrou via fluxo novo)
    //    b) vendas com produto_id=multa (fallback pra cobranças antigas)
    let cobrancasMap: Record<string, any> = {} // por agendamento_id

    if (ags.length > 0) {
      const clienteIds = ags.map((a: any) => a.cliente_id)

      // a) Busca cobranças pendentes/pagas/canceladas relacionadas aos clientes
      const { data: cobs } = await supabase
        .from('cobrancas_pendentes')
        .select('*')
        .in('cliente_id', clienteIds)

      for (const c of ((cobs as any[]) || [])) {
        // Extrai agendamento_id da observacao "agendamento_id: xxx"
        const match = c.observacao?.match(/agendamento_id:\s*([a-f0-9-]{36})/i)
        if (match) {
          const agId = match[1]
          // Mantém o registro mais relevante (pago > pendente > cancelado)
          const existente = cobrancasMap[agId]
          if (!existente || (c.status === 'pago' && existente.status !== 'pago')) {
            cobrancasMap[agId] = c
          }
        }
      }

      // b) Fallback: vendas diretas de multa (cobrança feita pelo admin direto)
      const { data: vendas } = await supabase
        .from('vendas')
        .select('id, cliente_id, valor_total, vendido_em, observacao')
        .eq('produto_id', PRODUTO_MULTA_ID)
        .in('cliente_id', clienteIds)

      for (const v of ((vendas as any[]) || [])) {
        const match = v.observacao?.match(/agendamento ([a-f0-9-]{36})/i)
        if (match) {
          const agId = match[1]
          // Se já tem cobrança paga registrada via cobrancas_pendentes, não sobrescreve
          if (!cobrancasMap[agId] || cobrancasMap[agId].status !== 'pago') {
            cobrancasMap[agId] = {
              status: 'pago',
              valor: v.valor_total,
              pago_em: v.vendido_em,
              _venda_direta: true,
            }
          }
        }
      }
    }

    // 3. Enriquece cada falta com status real
    const enriquecidas = ags.map((a: any) => {
      const cob = cobrancasMap[a.id]
      let statusCobranca: 'pendente' | 'cobrado' | 'sem_cartao' = 'pendente'

      if (cob?.status === 'pago') {
        statusCobranca = 'cobrado'
      } else if (!a.clientes?.pagarme_card_id) {
        statusCobranca = 'sem_cartao'
      }

      return { ...a, statusCobranca, cobranca: cob }
    })

    setFaltas(enriquecidas)
    setLoadingFaltas(false)
  }

  function abrirModalCobranca(falta: any) {
    setModalCobranca(falta)
    setErroCobranca('')
    setSucessoCobranca(null)
  }

  function fecharModal() {
    setModalCobranca(null)
    setErroCobranca('')
    setSucessoCobranca(null)
  }

  async function confirmarCobranca() {
    if (!modalCobranca) return
    setCobrando(true)
    setErroCobranca('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setErroCobranca('Sessão expirada. Faça login novamente.')
        setCobrando(false)
        return
      }

      const res = await fetch('/api/admin/cobrar-cartao-salvo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          agendamento_id: modalCobranca.id,
          valor: VALOR_MULTA,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErroCobranca(data.error || 'Erro ao processar cobrança')
        setCobrando(false)
        return
      }

      setSucessoCobranca(data)
      await carregarFaltas()
    } catch (err: any) {
      setErroCobranca('Erro de conexão. Tente novamente.')
    } finally {
      setCobrando(false)
    }
  }

  const faltasFiltradas = faltas.filter((f: any) => {
    if (filtroStatus === 'todos') return true
    return f.statusCobranca === filtroStatus
  })

  const totalFaltas = faltas.length
  const valorPotencial = faltas.length * VALOR_MULTA
  const totalCobrado = faltas.filter((f: any) => f.statusCobranca === 'cobrado').length
  const valorCobrado = totalCobrado * VALOR_MULTA
  const totalPendente = faltas.filter((f: any) => f.statusCobranca === 'pendente').length
  const valorPendente = totalPendente * VALOR_MULTA
  const totalSemCartao = faltas.filter((f: any) => f.statusCobranca === 'sem_cartao').length

  if (loading || loadingUnidade || !perfil) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!unidadeAtiva) return (
    <div className="flex items-center justify-center h-screen p-6 text-center">
      <div>
        <AlertCircle size={32} className="text-orange-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900">Sem acesso a unidades</h2>
        <p className="text-sm text-gray-500 mt-2">Configure suas permissões em /admin/permissoes.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="text-base font-semibold text-gray-900">Cobrança No-Show</div>
          <div className="text-xs text-gray-400">Faltas pendentes de cobrança · {unidadeAtiva.nome}</div>
        </div>
        <UnidadeSelector />
      </div>

      <div className="max-w-5xl mx-auto px-6 py-5">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={14} className="text-orange-500" />
              <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Faltas</div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{totalFaltas}</div>
            <div className="text-xs text-gray-400 mt-0.5">no período</div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={14} className="text-blue-500" />
              <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Potencial</div>
            </div>
            <div className="text-2xl font-bold text-blue-700">{formatarMoeda(valorPotencial)}</div>
            <div className="text-xs text-gray-400 mt-0.5">total das multas</div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <Check size={14} className="text-green-500" />
              <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Cobrado</div>
            </div>
            <div className="text-2xl font-bold text-green-700">{formatarMoeda(valorCobrado)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{totalCobrado} de {totalFaltas}</div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={14} className="text-orange-500" />
              <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Pendente</div>
            </div>
            <div className="text-2xl font-bold text-orange-700">{formatarMoeda(valorPendente)}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {totalPendente} pendente{totalSemCartao > 0 && ` · ${totalSemCartao} sem cartão`}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-3 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-gray-500 font-semibold uppercase tracking-wide">
              <Filter size={12} /> Período:
            </div>
            {[
              { key: 'hoje', label: 'Hoje' },
              { key: 'semana', label: '7 dias' },
              { key: 'mes', label: '30 dias' },
              { key: 'tudo', label: '12 meses' },
            ].map(p => (
              <button key={p.key} onClick={() => setFiltroPeriodo(p.key as FiltroPeriodo)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  filtroPeriodo === p.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {p.label}
              </button>
            ))}

            <div className="w-px h-5 bg-gray-200 mx-1" />

            <div className="flex items-center gap-1 text-xs text-gray-500 font-semibold uppercase tracking-wide">
              Status:
            </div>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'pendente', label: 'Pendente' },
              { key: 'cobrado', label: 'Cobrado' },
              { key: 'sem_cartao', label: 'Sem cartão' },
            ].map(s => (
              <button key={s.key} onClick={() => setFiltroStatus(s.key as FiltroStatus)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  filtroStatus === s.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loadingFaltas ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : faltasFiltradas.length === 0 ? (
          <div className="card text-center py-16">
            <Check size={32} className="mx-auto text-green-300 mb-3" />
            <div className="text-sm text-gray-500 font-medium">Nenhuma falta encontrada</div>
            <div className="text-xs text-gray-400 mt-1">
              {filtroStatus === 'todos' ? 'Não há faltas no período selecionado.' : `Não há faltas com status "${filtroStatus}".`}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {faltasFiltradas.map((f: any) => {
              const cliente = f.clientes
              const temCartao = !!cliente?.pagarme_card_id
              const cobrado = f.statusCobranca === 'cobrado'

              return (
                <div key={f.id} className={`card border-l-4 ${
                  cobrado ? 'border-l-green-400' :
                  !temCartao ? 'border-l-red-400' :
                  'border-l-orange-400'
                }`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${
                      cobrado ? 'bg-green-50' : !temCartao ? 'bg-red-50' : 'bg-orange-50'
                    }`}>
                      <div className={`text-sm font-bold leading-none ${
                        cobrado ? 'text-green-700' : !temCartao ? 'text-red-700' : 'text-orange-700'
                      }`}>
                        {new Date(f.data + 'T12:00:00').getDate()}
                      </div>
                      <div className={`text-xs uppercase ${
                        cobrado ? 'text-green-500' : !temCartao ? 'text-red-500' : 'text-orange-500'
                      }`}>
                        {new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{cliente?.nome || 'Cliente removido'}</span>
                        <span className="font-mono text-xs text-gray-500">{(f.horario || '').slice(0, 5)}</span>
                        {cobrado && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold flex items-center gap-1">
                            <Check size={10} /> Cobrado
                          </span>
                        )}
                        {!temCartao && !cobrado && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                            Sem cartão
                          </span>
                        )}
                        {temCartao && !cobrado && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
                            Pendente
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                        {f.coaches?.nome && <span>Coach: <strong>{f.coaches.nome}</strong></span>}
                        {f.tipo_credito && <span>· {f.tipo_credito}</span>}
                        {temCartao && (
                          <span>· {cliente.pagarme_card_brand} •••• {cliente.pagarme_card_last4}</span>
                        )}
                      </div>
                      {cobrado && f.cobranca?.pago_em && (
                        <div className="text-xs text-green-600 mt-1">
                          Cobrado em {new Date(f.cobranca.pago_em).toLocaleDateString('pt-BR')} · {formatarMoeda(f.cobranca.valor || VALOR_MULTA)}
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      {cobrado ? (
                        <div className="text-xs text-green-700 font-bold text-right">
                          ✓ {formatarMoeda(f.cobranca?.valor || VALOR_MULTA)}
                        </div>
                      ) : !temCartao ? (
                        <button disabled className="btn btn-sm bg-gray-100 text-gray-400 cursor-not-allowed">
                          Sem cartão
                        </button>
                      ) : (
                        <button onClick={() => abrirModalCobranca(f)}
                          className="btn btn-sm gap-1 bg-orange-500 text-white hover:bg-orange-600">
                          <CreditCard size={12} /> Cobrar {formatarMoeda(VALOR_MULTA)}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalCobranca && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900 flex items-center gap-2">
                <CreditCard size={18} className="text-orange-600" />
                {sucessoCobranca ? 'Cobrança realizada' : 'Confirmar cobrança'}
              </div>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {!sucessoCobranca ? (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
                  <div className="text-sm text-orange-900 leading-relaxed">
                    Você está prestes a cobrar <strong>{formatarMoeda(VALOR_MULTA)}</strong> no cartão de <strong>{modalCobranca.clientes?.nome}</strong>.
                  </div>
                  <div className="mt-3 pt-3 border-t border-orange-200 text-xs text-orange-800 space-y-1">
                    <div>Cartão: <strong>{modalCobranca.clientes?.pagarme_card_brand} •••• {modalCobranca.clientes?.pagarme_card_last4}</strong></div>
                    <div>Motivo: <strong>Falta em {formatarBR(modalCobranca.data)} às {(modalCobranca.horario || '').slice(0, 5)}</strong></div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-800">
                  💡 Após cobrança aprovada, o cliente será <strong>desbloqueado automaticamente</strong>.
                </div>

                {erroCobranca && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600 flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    {erroCobranca}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={fecharModal} className="btn flex-1 text-gray-500 border border-gray-200">
                    Cancelar
                  </button>
                  <button onClick={confirmarCobranca} disabled={cobrando}
                    className="btn flex-1 bg-orange-500 text-white hover:bg-orange-600 gap-1 disabled:opacity-50">
                    <CreditCard size={14} /> {cobrando ? 'Cobrando...' : `Cobrar ${formatarMoeda(VALOR_MULTA)}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
                  <Check size={36} className="text-green-600 mx-auto mb-2" />
                  <div className="text-sm font-bold text-green-900">Cobrança aprovada!</div>
                  <div className="text-xs text-green-700 mt-1 leading-relaxed">
                    {formatarMoeda(sucessoCobranca.valor)} cobrados no {sucessoCobranca.cartao}.<br/>
                    Cliente desbloqueado automaticamente.
                  </div>
                </div>

                <button onClick={fecharModal} className="w-full btn bg-primary-600 text-white hover:bg-primary-700">
                  Entendi
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
