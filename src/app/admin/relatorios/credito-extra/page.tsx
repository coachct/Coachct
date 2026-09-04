'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fmt } from '@/lib/utils'
import { KpiCard, PageHeader, Spinner } from '@/components/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Crédito extra por aula — adesão, volume e receita
//
// O que a tela responde, nesta ordem de importância:
//  1. VOLUME DE AULAS por semana contra as 4 anteriores. A queda aparece aqui
//     antes do faturamento — é a métrica principal, não a contagem de alunos.
//  2. ADESÃO diária = aulas personal que consumiram crédito ÷ total de aulas
//     personal do dia. Break-even da operação: 35%.
//  3. RECEITA do mês, separando avulso de pacote.
//  4. SALDO EM ABERTO = créditos pagos e ainda não usados. É passivo: o crédito
//     não expira, então essa aula ainda vai ser prestada algum dia.
//
// "Aula personal" = agendamento no CT pago com check-in de app parceiro
// (tipo_credito wellhub_* / totalpass_*), status diferente de cancelado.
// "Com crédito" = a aula tem linha de consumo no razão creditos_extras. Um
// estorno posterior (cancelamento/falta) não tira a aula da conta de adesão:
// no momento em que ela foi marcada, o crédito estava lá.
// ─────────────────────────────────────────────────────────────────────────────

const BREAK_EVEN = 35 // % de adesão que paga a operação de coach

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Segunda-feira da semana da data informada
function segundaDaSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = x.getDay()              // 0 = domingo
  const recuo = dow === 0 ? 6 : dow - 1
  x.setDate(x.getDate() - recuo)
  return x
}

function ehPersonalApp(tipoCredito: string): boolean {
  const t = (tipoCredito || '').toLowerCase()
  return t.startsWith('wellhub') || t.startsWith('totalpass')
}

async function buscarTudo(builder: () => any): Promise<any[]> {
  const tam = 1000
  let inicio = 0
  const todos: any[] = []
  while (true) {
    const { data, error } = await builder().range(inicio, inicio + tam - 1)
    if (error) { console.error('Erro na busca paginada:', error); break }
    todos.push(...(data || []))
    if (!data || data.length < tam) break
    inicio += tam
  }
  return todos
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

type DiaAdesao = { data: string; aulas: number; comCredito: number }
type SemanaVolume = { inicio: string; aulas: number }
type LinhaAluno = {
  cliente_id: string; nome: string; aulas: number
  comprou: boolean; creditosComprados: number; saldo: number
}

export default function RelatorioCreditoExtraPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const hoje = new Date()
  const [unidades, setUnidades] = useState<any[]>([])
  const [unidadeId, setUnidadeId] = useState('')
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [carregando, setCarregando] = useState(true)

  const [dias, setDias] = useState<DiaAdesao[]>([])
  const [semanas, setSemanas] = useState<SemanaVolume[]>([])
  const [receitaAvulso, setReceitaAvulso] = useState(0)
  const [receitaPacote, setReceitaPacote] = useState(0)
  const [creditosVendidosMes, setCreditosVendidosMes] = useState(0)
  const [saldoAberto, setSaldoAberto] = useState(0)
  const [passivoAberto, setPassivoAberto] = useState(0)
  const [alunos, setAlunos] = useState<LinhaAluno[]>([])
  const [modoPlanos, setModoPlanos] = useState<string>('')

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregarUnidades() }, [perfil])
  useEffect(() => { if (perfil && unidadeId) carregar() }, [perfil, unidadeId, mes, ano])

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades').select('id, nome, tipo')
      .eq('tipo', 'ct').eq('ativo', true).order('nome')
    setUnidades(data || [])
    if (data && data[0]) setUnidadeId(data[0].id)
    else setCarregando(false)
  }

  async function carregar() {
    setCarregando(true)

    const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const fimMes = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`

    // Janela do gráfico semanal: 5 semanas fechando na semana corrente
    const segAtual = segundaDaSemana(hoje)
    const inicioSemanas = new Date(segAtual); inicioSemanas.setDate(inicioSemanas.getDate() - 28)
    const inicioBusca = dataLocalStr(inicioSemanas) < inicioMes ? dataLocalStr(inicioSemanas) : inicioMes
    const fimBusca = fimMes > dataLocalStr(hoje) ? fimMes : dataLocalStr(hoje)

    // 1) Aulas personal (app parceiro) da unidade no período
    const ags = (await buscarTudo(() => supabase.from('agendamentos')
      .select('id, data, cliente_id, tipo_credito, status')
      .eq('unidade_id', unidadeId)
      .gte('data', inicioBusca).lte('data', fimBusca)
      .neq('status', 'cancelado')))
      .filter((a: any) => ehPersonalApp(a.tipo_credito))

    // 2) Razão de créditos extras da unidade (histórico inteiro — o saldo em
    //    aberto é acumulado e o crédito não expira)
    const razao = await buscarTudo(() => supabase.from('creditos_extras')
      .select('id, cliente_id, movimento, quantidade, valor_total, produto_id, agendamento_id, criado_em')
      .eq('unidade_id', unidadeId))

    // 3) Produtos de crédito extra, pra separar avulso de pacote na receita
    const { data: prods } = await supabase.from('produtos')
      .select('id, nome, creditos_por_venda').eq('subtipo', 'credito_extra')
    const creditosPorProduto: Record<string, number> = {}
    for (const p of (prods || [])) creditosPorProduto[p.id] = Number(p.creditos_por_venda) || 1

    // 4) Em que modo os planos de app desta unidade estão hoje
    const { data: planos } = await supabase.from('planos_disponiveis')
      .select('tipo, modo_credito_extra, credito_extra_desde')
      .eq('unidade_id', unidadeId).eq('ativo', true).in('tipo', ['wellhub', 'totalpass'])
    setModoPlanos((planos || [])
      .map((p: any) => `${p.tipo}: ${p.modo_credito_extra}${p.credito_extra_desde ? ` (desde ${p.credito_extra_desde})` : ''}`)
      .join(' · '))

    // ── Adesão diária ────────────────────────────────────────────────────────
    const agsComConsumo = new Set(
      razao.filter((r: any) => r.movimento === 'consumo' && r.agendamento_id).map((r: any) => r.agendamento_id)
    )
    const porDia: Record<string, DiaAdesao> = {}
    for (let d = 1; d <= ultimoDia; d++) {
      const key = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      porDia[key] = { data: key, aulas: 0, comCredito: 0 }
    }
    for (const a of ags) {
      const linha = porDia[a.data]
      if (!linha) continue
      linha.aulas++
      if (agsComConsumo.has(a.id)) linha.comCredito++
    }
    // Só até hoje quando o mês é o corrente — dia futuro com 0/0 polui a leitura
    const hojeStr = dataLocalStr(hoje)
    setDias(Object.values(porDia).filter(d => d.data <= hojeStr && d.aulas > 0))

    // ── Volume semanal (5 semanas) ───────────────────────────────────────────
    const sem: SemanaVolume[] = []
    for (let i = 4; i >= 0; i--) {
      const ini = new Date(segAtual); ini.setDate(ini.getDate() - i * 7)
      const fim = new Date(ini); fim.setDate(fim.getDate() + 6)
      const iniStr = dataLocalStr(ini), fimStr = dataLocalStr(fim)
      sem.push({ inicio: iniStr, aulas: ags.filter((a: any) => a.data >= iniStr && a.data <= fimStr).length })
    }
    setSemanas(sem)

    // ── Receita do mês + saldo em aberto ─────────────────────────────────────
    let avulso = 0, pacote = 0, creditosMes = 0
    let receitaTotalHist = 0, creditosCompradosHist = 0
    let saldo = 0
    for (const r of razao) {
      saldo += Number(r.quantidade) || 0
      if (r.movimento !== 'compra') continue
      const valor = Number(r.valor_total) || 0
      const qtd = Number(r.quantidade) || 0
      receitaTotalHist += valor
      creditosCompradosHist += qtd
      const dia = String(r.criado_em || '').slice(0, 10)
      if (dia >= inicioMes && dia <= fimMes) {
        creditosMes += qtd
        if ((creditosPorProduto[r.produto_id] || 1) > 1) pacote += valor
        else avulso += valor
      }
    }
    setReceitaAvulso(avulso)
    setReceitaPacote(pacote)
    setCreditosVendidosMes(creditosMes)
    setSaldoAberto(saldo)
    // Passivo = saldo × preço médio efetivamente pago por crédito
    const precoMedio = creditosCompradosHist > 0 ? receitaTotalHist / creditosCompradosHist : 0
    setPassivoAberto(saldo * precoMedio)

    // ── Alunos de alta frequência no mês ─────────────────────────────────────
    const aulasPorCliente: Record<string, number> = {}
    for (const a of ags) {
      if (a.data < inicioMes || a.data > fimMes) continue
      aulasPorCliente[a.cliente_id] = (aulasPorCliente[a.cliente_id] || 0) + 1
    }
    const compradosPorCliente: Record<string, number> = {}
    const saldoPorCliente: Record<string, number> = {}
    for (const r of razao) {
      saldoPorCliente[r.cliente_id] = (saldoPorCliente[r.cliente_id] || 0) + (Number(r.quantidade) || 0)
      if (r.movimento === 'compra') {
        compradosPorCliente[r.cliente_id] = (compradosPorCliente[r.cliente_id] || 0) + (Number(r.quantidade) || 0)
      }
    }
    const ids = Object.keys(aulasPorCliente)
    const nomes: Record<string, string> = {}
    for (const lote of chunk(ids, 200)) {
      if (!lote.length) continue
      const { data: cs } = await supabase.from('clientes').select('id, nome').in('id', lote)
      for (const c of (cs || [])) nomes[c.id] = c.nome
    }
    setAlunos(ids.map(id => ({
      cliente_id: id,
      nome: nomes[id] || '—',
      aulas: aulasPorCliente[id],
      comprou: (compradosPorCliente[id] || 0) > 0,
      creditosComprados: compradosPorCliente[id] || 0,
      saldo: saldoPorCliente[id] || 0,
    })).sort((a, b) => b.aulas - a.aulas))

    setCarregando(false)
  }

  // ── Agregados de topo ──────────────────────────────────────────────────────
  const totalAulas = dias.reduce((s, d) => s + d.aulas, 0)
  const totalComCredito = dias.reduce((s, d) => s + d.comCredito, 0)
  const adesaoMes = totalAulas > 0 ? (totalComCredito / totalAulas) * 100 : 0
  const receitaMes = receitaAvulso + receitaPacote

  const semanaAtual = semanas[semanas.length - 1]?.aulas ?? 0
  const anteriores = semanas.slice(0, 4)
  const mediaAnteriores = anteriores.length ? anteriores.reduce((s, w) => s + w.aulas, 0) / anteriores.length : 0
  const variacaoSemana = mediaAnteriores > 0 ? ((semanaAtual - mediaAnteriores) / mediaAnteriores) * 100 : 0
  const maxSemana = Math.max(1, ...semanas.map(w => w.aulas))

  const nomeMes = useMemo(
    () => new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    [mes, ano]
  )

  const opcoesMes = useMemo(() => {
    const out: { v: string; label: string }[] = []
    const base = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    for (let i = 0; i < 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
      out.push({
        v: `${d.getFullYear()}-${d.getMonth() + 1}`,
        label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      })
    }
    return out
  }, [])

  if (loading || carregando) return <Spinner />

  return (
    <div>
      <PageHeader title="Crédito extra por aula" subtitle={`Adesão, volume e receita — ${nomeMes}`} />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        {unidades.length > 1 && (
          <select className="input" value={unidadeId} onChange={e => setUnidadeId(e.target.value)}>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        <select className="input" value={`${ano}-${mes}`}
          onChange={e => { const [a, m] = e.target.value.split('-'); setAno(Number(a)); setMes(Number(m)) }}>
          {opcoesMes.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        {modoPlanos && (
          <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            Regra hoje — {modoPlanos}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Adesão no mês"
          value={`${adesaoMes.toFixed(1)}%`}
          sub={`${totalComCredito} de ${totalAulas} aulas · break-even ${BREAK_EVEN}%`}
          subColor={adesaoMes >= BREAK_EVEN ? 'text-primary-600' : 'text-danger-600'}
        />
        <KpiCard
          label="Aulas na semana"
          value={String(semanaAtual)}
          sub={`${variacaoSemana >= 0 ? '+' : ''}${variacaoSemana.toFixed(0)}% vs. média das 4 anteriores`}
          subColor={variacaoSemana >= 0 ? 'text-primary-600' : 'text-danger-600'}
        />
        <KpiCard
          label="Receita no mês"
          value={fmt(receitaMes)}
          sub={`avulso ${fmt(receitaAvulso)} · pacote ${fmt(receitaPacote)}`}
          subColor="text-gray-400"
        />
        <KpiCard
          label="Saldo em aberto"
          value={String(saldoAberto)}
          sub={`${fmt(passivoAberto)} de aula ainda a prestar`}
          subColor="text-warning-700"
        />
      </div>

      {/* ── Volume semanal ─────────────────────────────────────────────────── */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="font-semibold text-gray-900">Volume de aulas por semana</div>
          <span className={`badge badge-${variacaoSemana >= 0 ? 'green' : 'red'}`}>
            {variacaoSemana >= 0 ? '+' : ''}{variacaoSemana.toFixed(0)}%
          </span>
        </div>
        <div className="text-xs text-gray-400 mb-4">
          Aulas personal pagas com check-in de app. A queda de volume aparece aqui antes do faturamento.
        </div>
        <div className="flex items-end gap-3 h-40">
          {semanas.map((w, i) => {
            const atual = i === semanas.length - 1
            const alturaPct = (w.aulas / maxSemana) * 100
            const d = new Date(w.inicio + 'T12:00:00')
            return (
              <div key={w.inicio} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                <div className="text-xs font-semibold text-gray-700">{w.aulas}</div>
                <div className={`w-full rounded-t-lg ${atual ? 'bg-primary-500' : 'bg-gray-200'}`}
                  style={{ height: `${Math.max(alturaPct, 2)}%` }} />
                <div className="text-[10px] text-gray-400 whitespace-nowrap">
                  {atual ? 'esta sem.' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="text-xs text-gray-400 mt-3">
          Média das 4 semanas anteriores: <strong className="text-gray-600">{mediaAnteriores.toFixed(1)} aulas/semana</strong>
        </div>
      </div>

      {/* ── Adesão diária ──────────────────────────────────────────────────── */}
      <div className="card mb-6">
        <div className="font-semibold text-gray-900 mb-1">Adesão diária</div>
        <div className="text-xs text-gray-400 mb-4">
          Aulas que consumiram crédito ÷ aulas personal do dia. A linha do break-even é {BREAK_EVEN}%.
        </div>
        {dias.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">Nenhuma aula personal registrada neste mês.</div>
        ) : (
          <div className="space-y-1.5">
            {dias.map(d => {
              const pct = d.aulas > 0 ? (d.comCredito / d.aulas) * 100 : 0
              const ok = pct >= BREAK_EVEN
              const dd = new Date(d.data + 'T12:00:00')
              return (
                <div key={d.data} className="flex items-center gap-3">
                  <div className="w-16 flex-shrink-0 text-xs text-gray-500 font-mono">
                    {dd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </div>
                  <div className="flex-1 h-5 bg-gray-100 rounded-md relative overflow-hidden">
                    <div className={`h-full ${ok ? 'bg-primary-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                    <div className="absolute top-0 bottom-0 border-l border-dashed border-gray-400"
                      style={{ left: `${BREAK_EVEN}%` }} />
                  </div>
                  <div className="w-28 flex-shrink-0 text-right text-xs">
                    <span className={`font-semibold ${ok ? 'text-primary-700' : 'text-amber-700'}`}>{pct.toFixed(0)}%</span>
                    <span className="text-gray-400"> · {d.comCredito}/{d.aulas}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Receita ────────────────────────────────────────────────────────── */}
      <div className="card mb-6">
        <div className="font-semibold text-gray-900 mb-1">Receita do mês</div>
        <div className="text-xs text-gray-400 mb-4">
          {creditosVendidosMes} crédito(s) vendido(s) em {nomeMes}.
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { l: 'Avulso', v: fmt(receitaAvulso), c: 'text-gray-900' },
            { l: 'Pacote mensal', v: fmt(receitaPacote), c: 'text-gray-900' },
            { l: 'Total', v: fmt(receitaMes), c: 'text-primary-700' },
          ].map(item => (
            <div key={item.l} className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-xs text-gray-400 mb-1">{item.l}</div>
              <div className={`text-sm font-semibold ${item.c}`}>{item.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Alunos ─────────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="font-semibold text-gray-900 mb-1">Alunos por frequência no mês</div>
        <div className="text-xs text-gray-400 mb-4">
          Quem mais treina é quem mais sente a mudança. Ordenado por aulas no mês.
        </div>
        {alunos.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">Nenhum aluno com aula personal neste mês.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Aluno</th>
                  <th className="py-2 px-3 font-medium text-right">Aulas no mês</th>
                  <th className="py-2 px-3 font-medium text-center">Comprou</th>
                  <th className="py-2 px-3 font-medium text-right">Créditos comprados</th>
                  <th className="py-2 pl-3 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {alunos.map(a => (
                  <tr key={a.cliente_id} className="border-b border-gray-50">
                    <td className="py-2 pr-3 text-gray-900">{a.nome}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700">{a.aulas}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`badge badge-${a.comprou ? 'green' : 'red'}`}>{a.comprou ? 'Sim' : 'Não'}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-500">{a.creditosComprados}</td>
                    <td className={`py-2 pl-3 text-right font-mono ${a.saldo > 0 ? 'text-primary-700' : 'text-gray-400'}`}>{a.saldo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
