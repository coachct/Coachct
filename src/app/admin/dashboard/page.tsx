'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fmt } from '@/lib/utils'
import { KpiCard, PageHeader, Spinner } from '@/components/ui'
import Link from 'next/link'

type Unidade = {
  id: string
  nome: string
  slug: string
  ativo: boolean
  tipo: string
}

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function tipoLabelClub(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')   return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t || '—'
}

// Rótulo curto da unidade para os botões do header (CT / Club VO / Club PI)
function labelCurtoUnidade(u: { nome: string; tipo: string }) {
  if (u.tipo === 'ct') return 'CT'
  const n = (u.nome || '').toLowerCase()
  if (n.includes('olím') || n.includes('olim') || n.includes('vila')) return 'Club VO'
  if (n.includes('pinhe') || n.includes('pinh')) return 'Club PI'
  return u.nome
}
const ORDEM_UNIDADES = ['CT', 'Club VO', 'Club PI']

// Vendas (online pago + balcão, sem duplicar) — mesma regra da página /admin/vendas.
// Parametrizado por unidade pra servir tanto pro CT quanto pras Clubs.
async function buscarVendas(supabase: any, unidadeId: string) {
  const n = new Date()
  const inicioDia = new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString()
  const fimDia    = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59).toISOString()
  const inicioMes = new Date(n.getFullYear(), n.getMonth(), 1).toISOString()
  const fimMes    = new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59).toISOString()

  const { data: onlineMes } = await supabase
    .from('pagamentos_pendentes')
    .select('valor_total, venda_id, pago_em')
    .eq('unidade_id', unidadeId).eq('status', 'pago').is('excluido_em', null)
    .gte('pago_em', inicioMes).lte('pago_em', fimMes)

  const { data: balcaoMes } = await supabase
    .from('vendas')
    .select('id, valor_total, vendido_em')
    .eq('unidade_id', unidadeId).is('excluido_em', null)
    .gte('vendido_em', inicioMes).lte('vendido_em', fimMes)

  const online = onlineMes || []
  const vendaIdsOnline = new Set(online.map((o: any) => o.venda_id).filter(Boolean))
  const balcao = (balcaoMes || []).filter((v: any) => !vendaIdsOnline.has(v.id))

  const soma = (rows: any[]) => rows.reduce((s, r) => s + Number(r.valor_total || 0), 0)
  const dentro = (iso: string | null | undefined, ini: string, fim: string) => !!iso && iso >= ini && iso <= fim

  return {
    mes: soma(online) + soma(balcao),
    dia: soma(online.filter((o: any) => dentro(o.pago_em, inicioDia, fimDia))) +
         soma(balcao.filter((v: any) => dentro(v.vendido_em, inicioDia, fimDia))),
  }
}

export default function AdminDashboard() {
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string>('')
  const supabase = createClient()

  const now = new Date()
  const mesNome = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // Carregar unidades ativas + selecionar default (do localStorage ou primeira ativa)
  useEffect(() => {
    async function loadUnidades() {
      const { data } = await supabase
        .from('unidades')
        .select('id, nome, slug, ativo, tipo')
        .eq('ativo', true)
        .order('nome')

      if (data && data.length > 0) {
        setUnidades(data)
        const saved = typeof window !== 'undefined' ? localStorage.getItem('admin_unidade_selecionada') : null
        const valida = saved && data.find(u => u.id === saved)
        setUnidadeSelecionada(valida ? saved! : data[0].id)
      }
    }
    loadUnidades()
  }, [])

  // Salvar preferência da unidade
  useEffect(() => {
    if (unidadeSelecionada && typeof window !== 'undefined') {
      localStorage.setItem('admin_unidade_selecionada', unidadeSelecionada)
    }
  }, [unidadeSelecionada])

  const unidadeAtual = unidades.find(u => u.id === unidadeSelecionada)
  const isClub = unidadeAtual?.tipo === 'club'
  const unidadesOrdenadas = [...unidades].sort(
    (a, b) => ORDEM_UNIDADES.indexOf(labelCurtoUnidade(a)) - ORDEM_UNIDADES.indexOf(labelCurtoUnidade(b))
  )

  return (
    <div>
      {/* Header com filtro de unidade */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <PageHeader title="Dashboard" subtitle={mesNome.charAt(0).toUpperCase() + mesNome.slice(1)} />
        {unidades.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {unidadesOrdenadas.map(u => {
              const ativo = unidadeSelecionada === u.id
              return (
                <button
                  key={u.id}
                  onClick={() => setUnidadeSelecionada(u.id)}
                  className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                    ativo
                      ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300 hover:text-primary-700'
                  }`}
                >
                  {labelCurtoUnidade(u)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {!unidadeSelecionada ? (
        <Spinner />
      ) : isClub ? (
        <DashboardClub unidadeId={unidadeSelecionada} unidadeNome={unidadeAtual?.nome} />
      ) : (
        <DashboardCT unidadeId={unidadeSelecionada} unidadeNome={unidadeAtual?.nome} />
      )}
    </div>
  )
}

// ============================================================
// CONTAS A PAGAR — cards "hoje" e "amanhã" (unidade + Geral), em aberto.
// Cada card mostra a somatória; ao clicar, expande quais contas são.
// ============================================================
function ContasPagarCards({ unidadeId }: { unidadeId: string }) {
  const supabase = createClient()
  const [hojeRows, setHojeRows]     = useState<any[]>([])
  const [amanhaRows, setAmanhaRows] = useState<any[]>([])
  const [aberto, setAberto]         = useState<'hoje' | 'amanha' | null>(null)

  useEffect(() => {
    if (!unidadeId) return
    let ativo = true
    async function load() {
      const hojeStr = dataLocalStr(new Date())
      const aDate = new Date(); aDate.setDate(aDate.getDate() + 1)
      const amanhaStr = dataLocalStr(aDate)
      const dDate = new Date(); dDate.setDate(dDate.getDate() + 2)
      const depoisStr = dataLocalStr(dDate) // dia depois de amanhã (limite superior exclusivo)

      // Busca robusta: por intervalo de vencimento (cobre coluna date OU timestamp),
      // sem filtrar pago/unidade no servidor — filtramos no cliente pra evitar
      // gotchas de .or() com UUID e de pago = null.
      const { data, error } = await supabase
        .from('despesas')
        .select('id, descricao, valor, vencimento, pago, unidade_id')
        .is('excluido_em', null)
        .gte('vencimento', hojeStr)
        .lt('vencimento', depoisStr)
      if (error) console.error('Erro ao buscar contas a pagar:', error)
      if (!ativo) return

      const diaDe = (v: any) => String(v || '').slice(0, 10) // normaliza date/timestamp
      const emAberto = (data || []).filter((d: any) =>
        !d.pago && (d.unidade_id === unidadeId || d.unidade_id == null))

      setHojeRows(emAberto.filter((d: any) => diaDe(d.vencimento) === hojeStr))
      setAmanhaRows(emAberto.filter((d: any) => diaDe(d.vencimento) === amanhaStr))
    }
    load()
    return () => { ativo = false }
  }, [unidadeId])

  function Card({ chave, titulo, rows, urgente }: { chave: 'hoje' | 'amanha'; titulo: string; rows: any[]; urgente?: boolean }) {
    const total = rows.reduce((s, d) => s + Number(d.valor || 0), 0)
    const isOpen = aberto === chave
    const cor = total > 0
      ? (urgente ? { bg: 'bg-red-50', bd: 'border-red-100', tit: 'text-red-600', val: 'text-red-900', sub: 'text-red-500' }
                 : { bg: 'bg-amber-50', bd: 'border-amber-100', tit: 'text-amber-600', val: 'text-amber-900', sub: 'text-amber-500' })
      : { bg: 'bg-gray-50', bd: 'border-gray-100', tit: 'text-gray-500', val: 'text-gray-700', sub: 'text-gray-400' }
    return (
      <div className={`rounded-xl border ${cor.bg} ${cor.bd}`}>
        <button onClick={() => setAberto(isOpen ? null : chave)} className="w-full text-left p-4 flex items-start justify-between gap-2">
          <div>
            <div className={`text-xs font-medium uppercase tracking-wide mb-1 ${cor.tit}`}>{titulo}</div>
            <div className={`text-2xl font-semibold ${cor.val}`}>{fmt(total)}</div>
            <div className={`text-xs mt-1 ${cor.sub}`}>{rows.length} {rows.length === 1 ? 'conta' : 'contas'} em aberto</div>
          </div>
          <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 transition-transform ${cor.sub} ${isOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          rows.length === 0 ? (
            <div className="px-4 pb-4 text-xs text-gray-400 italic">Nada vencendo.</div>
          ) : (
            <div className="px-4 pb-4 space-y-1.5">
              {rows.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-sm border-t border-black/5 pt-1.5">
                  <span className="text-gray-700 truncate">{d.descricao || 'Despesa'}</span>
                  <span className="font-semibold text-gray-800 flex-shrink-0">{fmt(Number(d.valor || 0))}</span>
                </div>
              ))}
              <Link href="/admin/financeiro/contas-a-pagar" className="block text-xs text-primary-600 hover:underline pt-1.5">
                Abrir Contas a Pagar →
              </Link>
            </div>
          )
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 mb-6 items-start">
      <Card chave="hoje"   titulo="Vencendo hoje"   rows={hojeRows}   urgente />
      <Card chave="amanha" titulo="Vencendo amanhã" rows={amanhaRows} />
    </div>
  )
}

// ============================================================
// DASHBOARD CT — reservas do dia (expansível) + vendas + contas a pagar
// ============================================================
function statusReserva(s: string) {
  if (s === 'realizado') return { txt: 'Realizada',  cls: 'bg-green-100 text-green-700' }
  if (s === 'falta')     return { txt: 'Falta',      cls: 'bg-red-100 text-red-700' }
  return { txt: 'Confirmada', cls: 'bg-blue-100 text-blue-700' }
}

function DashboardCT({ unidadeId, unidadeNome }: { unidadeId: string; unidadeNome?: string }) {
  const supabase = createClient()
  const hoje = dataLocalStr(new Date())

  const [reservas, setReservas]   = useState<any[]>([])
  const [vendasDia, setVendasDia] = useState(0)
  const [vendasMes, setVendasMes] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [aberto, setAberto]       = useState(false)

  useEffect(() => {
    if (!unidadeId) return
    let ativo = true
    async function load() {
      setLoading(true)
      const { data: ags } = await supabase
        .from('agendamentos')
        .select('id, horario, status, clientes:cliente_id(nome), coaches:coach_id(nome)')
        .eq('data', hoje).eq('unidade_id', unidadeId).neq('status', 'cancelado')
        .order('horario', { ascending: true })
      const v = await buscarVendas(supabase, unidadeId)
      if (!ativo) return
      setReservas(ags || [])
      setVendasDia(v.dia)
      setVendasMes(v.mes)
      setLoading(false)
    }
    load()
    return () => { ativo = false }
  }, [unidadeId])

  if (loading) return <Spinner />

  const dataLabel = new Date(hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div>
      {/* Contas a pagar */}
      <ContasPagarCards unidadeId={unidadeId} />

      {/* Reservas de hoje — card que expande a lista de alunos */}
      <div className="card mb-6">
        <button onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between text-left">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Reservas de hoje</h2>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">
              {dataLabel}{unidadeNome && <span className="text-gray-300"> · {unidadeNome}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-semibold text-gray-900 leading-none">{reservas.length}</span>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {aberto && (
          reservas.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 italic mt-2">Nenhuma reserva pra hoje.</div>
          ) : (
            <div className="space-y-2 mt-4">
              {reservas.map((r: any) => {
                const st = statusReserva(r.status)
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-gray-50 border-gray-100">
                    <div className="text-center flex-shrink-0 w-14">
                      <div className="text-sm font-bold text-gray-700">{(r.horario || '').slice(0, 5)}</div>
                    </div>
                    <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{r.clientes?.nome || 'Aluno'}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">Coach: {r.coaches?.nome || '—'}</div>
                    </div>
                    <div className="flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.txt}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* Vendas */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <KpiCard label="Vendas hoje" value={fmt(vendasDia)} sub={unidadeNome || undefined} />
        <KpiCard label="Vendas no mês" value={fmt(vendasMes)} sub="mês atual" />
      </div>
    </div>
  )
}

// ============================================================
// DASHBOARD CLUB — resumo de ocupação de hoje/amanhã + por aula
// ============================================================
function DashboardClub({ unidadeId, unidadeNome }: { unidadeId: string; unidadeNome?: string }) {
  const supabase = createClient()

  const hoje = dataLocalStr(new Date())
  const amanhaDate = new Date(); amanhaDate.setDate(amanhaDate.getDate() + 1)
  const amanha = dataLocalStr(amanhaDate)

  const [resumoHoje, setResumoHoje]   = useState<any>(null)
  const [resumoAmanha, setResumoAmanha] = useState<any>(null)
  const [vendasDia, setVendasDia]     = useState(0)
  const [vendasMes, setVendasMes]     = useState(0)
  const [dataSel, setDataSel]         = useState(hoje)
  const [detalhe, setDetalhe]         = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)

  // Carrega as aulas (ocorrências) + reservas de um dia, monta resumo
  async function carregarDia(dataStr: string) {
    const { data: ocs } = await supabase
      .from('club_ocorrencias')
      .select('id, data, vagas_bloqueadas, coach_escalado:coaches!coach_id(nome), club_aulas!inner(tipo, horario, capacidade, unidade_id, coaches(nome), grupos_musculares(nome))')
      .eq('data', dataStr)
      .eq('club_aulas.unidade_id', unidadeId)
      .eq('status', 'ativa')

    const ocList = ocs || []
    const ocIds = ocList.map((o: any) => o.id)

    let reservasRows: any[] = []
    if (ocIds.length > 0) {
      const { data: rs } = await supabase
        .from('club_reservas')
        .select('ocorrencia_id, status')
        .in('ocorrencia_id', ocIds)
        .neq('status', 'cancelado')
      reservasRows = rs || []
    }

    const aulas = ocList.map((o: any) => {
      const rs = reservasRows.filter(r => r.ocorrencia_id === o.id)
      const reservas  = rs.length
      const presentes = rs.filter(r => r.status === 'presente').length
      const faltas    = rs.filter(r => r.status === 'falta').length
      const cap  = o.club_aulas?.capacidade || 0
      const bloq = o.vagas_bloqueadas || 0
      const capacidade = Math.max(0, cap - bloq)
      return {
        id: o.id,
        horario: (o.club_aulas?.horario || '').slice(0, 5),
        tipo: o.club_aulas?.tipo,
        grupo: o.club_aulas?.grupos_musculares?.nome || null,
        coach: o.coach_escalado?.nome || o.club_aulas?.coaches?.nome || null,
        reservas, presentes, faltas, capacidade, bloqueadas: bloq,
      }
    }).sort((a: any, b: any) => a.horario.localeCompare(b.horario))

    const totalReservas = aulas.reduce((s: number, a: any) => s + a.reservas, 0)
    const capacidade    = aulas.reduce((s: number, a: any) => s + a.capacidade, 0)
    return { aulas, totalReservas, ocupadas: totalReservas, capacidade, nAulas: aulas.length }
  }

  // Carga inicial: resumos de hoje e amanhã + vendas + detalhe inicial (hoje)
  useEffect(() => {
    if (!unidadeId) return
    let ativo = true
    async function init() {
      setLoading(true)
      const [rh, ra] = await Promise.all([carregarDia(hoje), carregarDia(amanha)])
      if (!ativo) return
      setResumoHoje(rh)
      setResumoAmanha(ra)
      setDataSel(hoje)
      setDetalhe(rh)
      const v = await buscarVendas(supabase, unidadeId)
      if (!ativo) return
      setVendasDia(v.dia)
      setVendasMes(v.mes)
      setLoading(false)
    }
    init()
    return () => { ativo = false }
  }, [unidadeId])

  // Detalhe muda com a data selecionada (reaproveita hoje/amanhã já carregados)
  useEffect(() => {
    if (loading) return
    let ativo = true
    async function loadDet() {
      if (dataSel === hoje && resumoHoje)   { setDetalhe(resumoHoje); return }
      if (dataSel === amanha && resumoAmanha) { setDetalhe(resumoAmanha); return }
      setLoadingDetalhe(true)
      const r = await carregarDia(dataSel)
      if (!ativo) return
      setDetalhe(r)
      setLoadingDetalhe(false)
    }
    loadDet()
    return () => { ativo = false }
  }, [dataSel])

  if (loading) return <Spinner />

  const labelDataSel = (() => {
    if (dataSel === hoje) return 'Hoje'
    if (dataSel === amanha) return 'Amanhã'
    return new Date(dataSel + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  })()
  const ehHoje = dataSel === hoje

  function CardDia({ titulo, dataStr, resumo, destaque }: { titulo: string; dataStr: string; resumo: any; destaque?: boolean }) {
    const cap = resumo?.capacidade || 0
    const occ = resumo?.ocupadas || 0
    const pct = cap > 0 ? Math.round((occ / cap) * 100) : 0
    const dataFmt = new Date(dataStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    return (
      <div className={`rounded-xl p-5 border ${destaque ? 'bg-primary-50 border-primary-100' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className={`text-sm font-semibold ${destaque ? 'text-primary-800' : 'text-gray-800'}`}>{titulo}</div>
            <div className="text-xs text-gray-400 capitalize">{dataFmt}</div>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-semibold leading-none ${destaque ? 'text-primary-900' : 'text-gray-900'}`}>{resumo?.totalReservas ?? 0}</div>
            <div className="text-xs text-gray-400 mt-1">reservas</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-500">Ocupação</span>
          <span className="font-semibold text-gray-700">{occ}/{cap} vagas · {pct}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 85 ? 'bg-red-500' : pct >= 50 ? 'bg-primary-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="text-xs text-gray-400 mt-2">{resumo?.nAulas ?? 0} aula{(resumo?.nAulas ?? 0) !== 1 ? 's' : ''} no dia</div>
      </div>
    )
  }

  return (
    <div>
      {/* Contas a pagar */}
      <ContasPagarCards unidadeId={unidadeId} />

      {/* Resumo HOJE / AMANHÃ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CardDia titulo="Hoje"   dataStr={hoje}   resumo={resumoHoje}   destaque />
        <CardDia titulo="Amanhã" dataStr={amanha} resumo={resumoAmanha} />
      </div>

      {/* Vendas */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <KpiCard label="Vendas hoje" value={fmt(vendasDia)} sub={unidadeNome || undefined} />
        <KpiCard label="Vendas no mês" value={fmt(vendasMes)} sub="mês atual" />
      </div>

      {/* Resumo por aula */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Reservas por aula</h2>
            <p className="text-xs text-gray-400 mt-0.5 capitalize">{labelDataSel}{unidadeNome && <span className="text-gray-300"> · {unidadeNome}</span>}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setDataSel(hoje)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dataSel === hoje ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Hoje
              </button>
              <button
                onClick={() => setDataSel(amanha)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dataSel === amanha ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Amanhã
              </button>
            </div>
            <input
              type="date"
              value={dataSel}
              onChange={(e) => setDataSel(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
            />
          </div>
        </div>

        {loadingDetalhe ? (
          <div className="text-center py-8 text-sm text-gray-400 italic">Carregando…</div>
        ) : !detalhe || detalhe.aulas.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 italic">Nenhuma aula nesse dia.</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="text-gray-500">{detalhe.nAulas} aulas</span>
              <span className="font-semibold text-gray-700">
                {detalhe.ocupadas}/{detalhe.capacidade} vagas ocupadas · {detalhe.capacidade > 0 ? Math.round((detalhe.ocupadas / detalhe.capacidade) * 100) : 0}%
              </span>
            </div>
            <div className="space-y-2">
              {detalhe.aulas.map((a: any) => {
                const pct = a.capacidade > 0 ? Math.round((a.reservas / a.capacidade) * 100) : 0
                return (
                  <Link
                    key={a.id}
                    href={`/admin/justclub/calendario/${a.id}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-gray-50 border-gray-100 hover:bg-gray-100 hover:border-gray-200 transition-colors cursor-pointer"
                  >
                    <div className="text-center flex-shrink-0 w-14">
                      <div className="text-sm font-bold text-gray-700">{a.horario}</div>
                    </div>
                    <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{tipoLabelClub(a.tipo)}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">
                        {a.coach ? `Coach: ${a.coach}` : 'Coach a definir'}
                        {a.bloqueadas > 0 && <span className="text-red-400"> · {a.bloqueadas} bloqueada{a.bloqueadas !== 1 ? 's' : ''}</span>}
                        {ehHoje && (a.presentes > 0 || a.faltas > 0) && (
                          <span className="text-gray-400"> · {a.presentes} pres. / {a.faltas} falta{a.faltas !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-32">
                      <div className="flex items-center justify-end gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-700">{a.reservas}/{a.capacidade}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct >= 85 ? 'bg-red-500' : pct >= 50 ? 'bg-primary-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
