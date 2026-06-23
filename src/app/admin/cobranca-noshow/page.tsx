'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { useRouter } from 'next/navigation'
import { AlertCircle, CreditCard, X, Check, AlertTriangle, Filter, DollarSign, Zap } from 'lucide-react'
import UnidadeSelector from '@/components/UnidadeSelector'

const VALOR_MULTA_CT    = 99.00
const VALOR_MULTA_CLUB  = 49.90
const PRODUTO_MULTA_CT_ID   = '7a0e93e1-98b0-4125-a993-7a688e8e34bb'
const PRODUTO_MULTA_CLUB_ID = '196ac99d-9b0e-45de-b418-471e45e22db3'

type FiltroPeriodo = 'hoje' | 'semana' | 'mes' | 'tudo'
type FiltroStatus  = 'todos' | 'pendente' | 'cobrado' | 'sem_cartao'
type AbaAtiva      = 'ct' | 'club'

// Converte a chave interna de controle de agendamento (tipo_credito) no nome do
// pacote como ele aparece para o cliente. Mesma lógica do parsePlanoKey usado em /agendar.
function nomePacote(key: string): string {
  if (!key) return ''
  const lower = key.toLowerCase()
  let tipo = ''
  if (lower.startsWith('coach_ct_pro')) tipo = 'Coach CT Pro'
  else if (lower.startsWith('wellhub')) tipo = 'Wellhub'
  else if (lower.startsWith('totalpass')) tipo = 'TotalPass'
  else if (lower.startsWith('avulso') || lower.startsWith('credito')) tipo = 'Crédito Avulso'
  else tipo = key
  const slugUnidade = lower.startsWith('coach_ct_pro') ? key.substring('coach_ct_pro_'.length) : key.split('_').slice(1).join('_')
  const nomeUnidade: Record<string, string> = { just_ct: 'Just CT', just_club_vila_olimpia: 'Vila Olímpia', just_club_pinheiros: 'Pinheiros' }
  const unidade = nomeUnidade[slugUnidade] || slugUnidade.replace(/_/g, ' ')
  return unidade ? `${tipo} — ${unidade}` : tipo
}

function formatarBR(data: string) { return new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') }
function formatarMoeda(v: number) { return `R$ ${Number(v).toFixed(2).replace('.', ',')}` }
function hojeLocal(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function subtrairDias(dataStr: string, dias: number): string {
  const d = new Date(dataStr + 'T12:00:00'); d.setDate(d.getDate() - dias)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function CobrancaNoShowPage() {
  const { perfil, loading } = useAuth()
  const { unidadeAtiva, loading: loadingUnidade } = useUnidade()
  const router   = useRouter()
  const supabase = createClient()

  const [aba,           setAba]           = useState<AbaAtiva>('ct')
  const [faltas,        setFaltas]        = useState<any[]>([])
  const [loadingFaltas, setLoadingFaltas] = useState(false)
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>('hoje')
  const [filtroStatus,  setFiltroStatus]  = useState<FiltroStatus>('todos')

  const [modalCobranca,  setModalCobranca]  = useState<any>(null)
  const [cobrando,       setCobrando]       = useState(false)
  const [erroCobranca,   setErroCobranca]   = useState('')
  const [sucessoCobranca,setSucessoCobranca]= useState<any>(null)

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if (!['admin', 'coordenadora'].includes(perfil.role as any)) { router.push('/'); return }
  }, [loading, perfil])

  useEffect(() => { if (perfil && unidadeAtiva) carregarFaltas() }, [perfil, unidadeAtiva?.id, filtroPeriodo, aba])

  function getRangeData() {
    const ate = hojeLocal()
    const de = filtroPeriodo === 'hoje' ? ate : filtroPeriodo === 'semana' ? subtrairDias(ate, 7) : filtroPeriodo === 'mes' ? subtrairDias(ate, 30) : subtrairDias(ate, 365)
    return { de, ate }
  }

  async function carregarFaltas() {
    if (!unidadeAtiva) return
    setLoadingFaltas(true)
    const { de, ate } = getRangeData()

    if (aba === 'ct') {
      await carregarFaltasCT(de, ate)
    } else {
      await carregarFaltasClub(de, ate)
    }
    setLoadingFaltas(false)
  }

  async function carregarFaltasCT(de: string, ate: string) {
    const { data: agsRaw } = await supabase
      .from('agendamentos')
      .select(`id, cliente_id, coach_id, data, horario, status, tipo_credito, unidade_id,
        clientes(id, nome, cpf, email, telefone, bloqueado, pagarme_customer_id, pagarme_card_id, pagarme_card_last4, pagarme_card_brand),
        coaches(id, nome)`)
      .eq('status', 'falta').eq('unidade_id', unidadeAtiva!.id)
      // Só plano parceiro gera multa. Crédito de pacote nosso (avulso/Coach CT Pro) só perde o crédito.
      .or('tipo_credito.ilike.wellhub*,tipo_credito.ilike.totalpass*')
      .gte('data', de).lte('data', ate)
      .order('data', { ascending: false }).order('horario', { ascending: false })

    const ags: any[] = agsRaw || []
    const cobrancasMap = await buscarCobrancas(ags.map(a => a.cliente_id), ags.map(a => a.id), PRODUTO_MULTA_CT_ID, 'agendamento')
    setFaltas(ags.map(a => enriquecerFalta(a, cobrancasMap, a.id)))
  }

  async function carregarFaltasClub(de: string, ate: string) {
    // Busca faltas de TODAS as clubs (admin vê tudo)
    const { data: unidadesClub } = await supabase.from('unidades').select('id').eq('tipo', 'club').eq('ativo', true)
    const clubIds = (unidadesClub || []).map((u: any) => u.id)
    if (!clubIds.length) { setFaltas([]); return }

    const { data: aulasIds } = await supabase.from('club_aulas').select('id').in('unidade_id', clubIds).eq('ativo', true)
    const aulasIdList = (aulasIds || []).map((a: any) => a.id)
    if (!aulasIdList.length) { setFaltas([]); return }

    const { data: ocsIds } = await supabase.from('club_ocorrencias').select('id').in('aula_id', aulasIdList).gte('data', de).lte('data', ate)
    const ocsIdList = (ocsIds || []).map((o: any) => o.id)
    if (!ocsIdList.length) { setFaltas([]); return }

    const { data: resRaw } = await supabase
      .from('club_reservas')
      .select(`id, cliente_id, tipo_credito, status,
        clientes(id, nome, cpf, email, telefone, bloqueado, pagarme_customer_id, pagarme_card_id, pagarme_card_last4, pagarme_card_brand),
        club_ocorrencias(data, club_aulas(horario, tipo, unidades(nome)))`)
      .eq('status', 'falta')
      // Só plano parceiro gera multa. Crédito de pacote nosso (avulso/Coach CT Pro) só perde o crédito.
      .or('tipo_credito.ilike.wellhub*,tipo_credito.ilike.totalpass*')
      .in('ocorrencia_id', ocsIdList)
      .order('created_at', { ascending: false })

    const reservas: any[] = (resRaw || []).map((r: any) => ({
      ...r,
      data:    r.club_ocorrencias?.data || '',
      horario: r.club_ocorrencias?.club_aulas?.horario || '',
      unidadeNome: r.club_ocorrencias?.club_aulas?.unidades?.nome || '',
      tipoAula: r.club_ocorrencias?.club_aulas?.tipo || '',
    })).sort((a: any, b: any) => b.data.localeCompare(a.data))

    const cobrancasMap = await buscarCobrancas(reservas.map(r => r.cliente_id), reservas.map(r => r.id), PRODUTO_MULTA_CLUB_ID, 'reserva')
    setFaltas(reservas.map(r => enriquecerFalta(r, cobrancasMap, r.id)))
  }

  async function buscarCobrancas(clienteIds: string[], itemIds: string[], produtoId: string, tipoRef: string) {
    const cobrancasMap: Record<string, any> = {}
    if (!clienteIds.length) return cobrancasMap

    const { data: cobs } = await supabase.from('cobrancas_pendentes').select('*').in('cliente_id', clienteIds)
    const refKey = tipoRef === 'agendamento' ? 'agendamento_id' : 'reserva_id'
    for (const c of (cobs || [])) {
      const match = c.observacao?.match(new RegExp(`${refKey}:\\s*([a-f0-9-]{36})`, 'i'))
      if (match) {
        const id = match[1]
        if (!cobrancasMap[id] || (c.status === 'pago' && cobrancasMap[id].status !== 'pago')) cobrancasMap[id] = c
      }
    }

    const { data: vendas } = await supabase.from('vendas').select('id, cliente_id, valor_total, vendido_em, observacao').eq('produto_id', produtoId).in('cliente_id', clienteIds)
    for (const v of (vendas || [])) {
      const match = v.observacao?.match(/([a-f0-9-]{36})/)
      if (match) {
        const id = match[1]
        if (itemIds.includes(id) && (!cobrancasMap[id] || cobrancasMap[id].status !== 'pago')) {
          cobrancasMap[id] = { status: 'pago', valor: v.valor_total, pago_em: v.vendido_em, _venda_direta: true }
        }
      }
    }
    return cobrancasMap
  }

  function enriquecerFalta(item: any, cobrancasMap: Record<string, any>, id: string) {
    const cob = cobrancasMap[id]
    let statusCobranca: 'pendente' | 'cobrado' | 'sem_cartao' = 'pendente'
    if (cob?.status === 'pago') statusCobranca = 'cobrado'
    else if (!item.clientes?.pagarme_card_id) statusCobranca = 'sem_cartao'
    return { ...item, statusCobranca, cobranca: cob }
  }

  async function confirmarCobranca() {
    if (!modalCobranca) return
    setCobrando(true); setErroCobranca('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setErroCobranca('Sessão expirada.'); setCobrando(false); return }

      const endpoint = aba === 'ct' ? '/api/admin/cobrar-cartao-salvo' : '/api/admin/cobrar-noshow-club'
      const body = aba === 'ct'
        ? { agendamento_id: modalCobranca.id, valor: VALOR_MULTA_CT }
        : { reserva_id: modalCobranca.id, valor: VALOR_MULTA_CLUB }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setErroCobranca(data.error || 'Erro ao processar cobrança'); setCobrando(false); return }
      setSucessoCobranca(data)
      await carregarFaltas()
    } catch { setErroCobranca('Erro de conexão. Tente novamente.') }
    finally { setCobrando(false) }
  }

  const valorMulta      = aba === 'ct' ? VALOR_MULTA_CT : VALOR_MULTA_CLUB
  const faltasFiltradas = faltas.filter(f => filtroStatus === 'todos' || f.statusCobranca === filtroStatus)
  const totalFaltas     = faltas.length
  const totalCobrado    = faltas.filter(f => f.statusCobranca === 'cobrado').length
  const totalPendente   = faltas.filter(f => f.statusCobranca === 'pendente').length
  const totalSemCartao  = faltas.filter(f => f.statusCobranca === 'sem_cartao').length

  if (loading || loadingUnidade || !perfil) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="text-base font-semibold text-gray-900">Cobrança No-Show</div>
          <div className="text-xs text-gray-400">Faltas pendentes de cobrança</div>
        </div>
        <UnidadeSelector />
      </div>

      <div className="max-w-5xl mx-auto px-6 py-5">

        {/* Abas CT / JustClub */}
        <div className="flex gap-2 mb-5">
          <button onClick={() => { setAba('ct'); setFaltas([]) }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${aba === 'ct' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            Just CT
          </button>
          <button onClick={() => { setAba('club'); setFaltas([]) }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${aba === 'club' ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            <Zap size={14} /> JustClub
          </button>
          <div className="ml-2 flex items-center text-xs text-gray-400">
            Multa: <strong className="ml-1 text-gray-700">{formatarMoeda(valorMulta)}</strong>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label:'Faltas', value: totalFaltas, sub:'no período', cor:'text-gray-900', icon:<AlertTriangle size={14} className="text-orange-500"/> },
            { label:'Potencial', value: formatarMoeda(totalFaltas * valorMulta), sub:'total das multas', cor:'text-blue-700', icon:<DollarSign size={14} className="text-blue-500"/> },
            { label:'Cobrado', value: formatarMoeda(totalCobrado * valorMulta), sub:`${totalCobrado} de ${totalFaltas}`, cor:'text-green-700', icon:<Check size={14} className="text-green-500"/> },
            { label:'Pendente', value: formatarMoeda(totalPendente * valorMulta), sub:`${totalPendente} pendente${totalSemCartao > 0 ? ` · ${totalSemCartao} sem cartão` : ''}`, cor:'text-orange-700', icon:<CreditCard size={14} className="text-orange-500"/> },
          ].map(s => (
            <div key={s.label} className="card">
              <div className="flex items-center gap-2 mb-1">{s.icon}<div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{s.label}</div></div>
              <div className={`text-2xl font-bold ${s.cor}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl border border-gray-200 p-3 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-gray-500 font-semibold uppercase tracking-wide"><Filter size={12}/> Período:</div>
            {[{key:'hoje',label:'Hoje'},{key:'semana',label:'7 dias'},{key:'mes',label:'30 dias'},{key:'tudo',label:'12 meses'}].map(p => (
              <button key={p.key} onClick={() => setFiltroPeriodo(p.key as FiltroPeriodo)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filtroPeriodo === p.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {p.label}
              </button>
            ))}
            <div className="w-px h-5 bg-gray-200 mx-1"/>
            <div className="flex items-center gap-1 text-xs text-gray-500 font-semibold uppercase tracking-wide">Status:</div>
            {[{key:'todos',label:'Todos'},{key:'pendente',label:'Pendente'},{key:'cobrado',label:'Cobrado'},{key:'sem_cartao',label:'Sem cartão'}].map(s => (
              <button key={s.key} onClick={() => setFiltroStatus(s.key as FiltroStatus)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filtroStatus === s.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        {loadingFaltas ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/></div>
        ) : faltasFiltradas.length === 0 ? (
          <div className="card text-center py-16">
            <Check size={32} className="mx-auto text-green-300 mb-3"/>
            <div className="text-sm text-gray-500 font-medium">Nenhuma falta encontrada</div>
            <div className="text-xs text-gray-400 mt-1">{filtroStatus === 'todos' ? 'Não há faltas no período.' : `Não há faltas com status "${filtroStatus}".`}</div>
          </div>
        ) : (
          <div className="space-y-2">
            {faltasFiltradas.map((f: any) => {
              const cliente  = f.clientes
              const temCartao = !!cliente?.pagarme_card_id
              const cobrado   = f.statusCobranca === 'cobrado'
              return (
                <div key={f.id} className={`card border-l-4 ${cobrado ? 'border-l-green-400' : !temCartao ? 'border-l-red-400' : 'border-l-orange-400'}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${cobrado ? 'bg-green-50' : !temCartao ? 'bg-red-50' : 'bg-orange-50'}`}>
                      <div className={`text-sm font-bold leading-none ${cobrado ? 'text-green-700' : !temCartao ? 'text-red-700' : 'text-orange-700'}`}>
                        {f.data ? new Date(f.data + 'T12:00:00').getDate() : '—'}
                      </div>
                      <div className={`text-xs uppercase ${cobrado ? 'text-green-500' : !temCartao ? 'text-red-500' : 'text-orange-500'}`}>
                        {f.data ? new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }) : ''}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{cliente?.nome || 'Cliente removido'}</span>
                        <span className="font-mono text-xs text-gray-500">{(f.horario || '').slice(0, 5)}</span>
                        {aba === 'club' && f.unidadeNome && <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 font-semibold">{f.unidadeNome}</span>}
                        {cobrado && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold flex items-center gap-1"><Check size={10}/> Cobrado</span>}
                        {!temCartao && !cobrado && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Sem cartão</span>}
                        {temCartao && !cobrado && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Pendente</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                        {f.coaches?.nome && <span>Coach: <strong>{f.coaches.nome}</strong></span>}
                        {f.tipo_credito && <span>· {nomePacote(f.tipo_credito)}</span>}
                        {temCartao && <span>· {cliente.pagarme_card_brand} •••• {cliente.pagarme_card_last4}</span>}
                      </div>
                      {cobrado && f.cobranca?.pago_em && (
                        <div className="text-xs text-green-600 mt-1">Cobrado em {new Date(f.cobranca.pago_em).toLocaleDateString('pt-BR')} · {formatarMoeda(f.cobranca.valor || valorMulta)}</div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {cobrado ? (
                        <div className="text-xs text-green-700 font-bold">✓ {formatarMoeda(f.cobranca?.valor || valorMulta)}</div>
                      ) : !temCartao ? (
                        <button disabled className="btn btn-sm bg-gray-100 text-gray-400 cursor-not-allowed">Sem cartão</button>
                      ) : (
                        <button onClick={() => { setModalCobranca(f); setErroCobranca(''); setSucessoCobranca(null) }}
                          className="btn btn-sm gap-1 bg-orange-500 text-white hover:bg-orange-600">
                          <CreditCard size={12}/> Cobrar {formatarMoeda(valorMulta)}
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

      {/* Modal cobrança */}
      {modalCobranca && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900 flex items-center gap-2">
                <CreditCard size={18} className="text-orange-600"/>
                {sucessoCobranca ? 'Cobrança realizada' : 'Confirmar cobrança'}
              </div>
              <button onClick={() => { setModalCobranca(null); setErroCobranca(''); setSucessoCobranca(null) }} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            {!sucessoCobranca ? (
              <>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
                  <div className="text-sm text-orange-900 leading-relaxed">
                    Cobrar <strong>{formatarMoeda(valorMulta)}</strong> no cartão de <strong>{modalCobranca.clientes?.nome}</strong>.
                  </div>
                  <div className="mt-3 pt-3 border-t border-orange-200 text-xs text-orange-800 space-y-1">
                    <div>Cartão: <strong>{modalCobranca.clientes?.pagarme_card_brand} •••• {modalCobranca.clientes?.pagarme_card_last4}</strong></div>
                    <div>Motivo: <strong>Falta em {formatarBR(modalCobranca.data)} às {(modalCobranca.horario || '').slice(0, 5)}</strong></div>
                    {aba === 'club' && modalCobranca.unidadeNome && <div>Unidade: <strong>{modalCobranca.unidadeNome}</strong></div>}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 text-xs text-blue-800">
                  💡 Após cobrança aprovada, o cliente será <strong>desbloqueado automaticamente</strong>.
                </div>
                {erroCobranca && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600 flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>{erroCobranca}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setModalCobranca(null); setErroCobranca(''); setSucessoCobranca(null) }} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
                  <button onClick={confirmarCobranca} disabled={cobrando}
                    className="btn flex-1 bg-orange-500 text-white hover:bg-orange-600 gap-1 disabled:opacity-50">
                    <CreditCard size={14}/> {cobrando ? 'Cobrando...' : `Cobrar ${formatarMoeda(valorMulta)}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
                  <Check size={36} className="text-green-600 mx-auto mb-2"/>
                  <div className="text-sm font-bold text-green-900">Cobrança aprovada!</div>
                  <div className="text-xs text-green-700 mt-1 leading-relaxed">
                    {formatarMoeda(sucessoCobranca.valor)} cobrados no {sucessoCobranca.cartao}.<br/>
                    Cliente desbloqueado automaticamente.
                  </div>
                </div>
                <button onClick={() => { setModalCobranca(null); setErroCobranca(''); setSucessoCobranca(null) }} className="w-full btn bg-primary-600 text-white hover:bg-primary-700">Entendi</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
