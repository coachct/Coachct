'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fmt } from '@/lib/utils'
import { KpiCard, PageHeader, Spinner } from '@/components/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Faturamento por aula · Club
//
// Tudo vem da RPC club_faturamento_aulas (uma linha por ocorrência). A regra de
// valor de cada presença/falta está documentada em supabase/club-faturamento-aulas.sql
// e os valores ficam em club_valores_faturamento (aba "Valores").
// Custo = coaches.adicional_por_aula de cada aula dada.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = createClient()

type Linha = {
  ocorrencia_id: string
  data: string
  horario: string
  dia_semana: number
  unidade_id: string
  unidade_nome: string
  tipo: string
  coach_id: string | null
  coach_nome: string | null
  custo_coach: number
  capacidade: number
  presentes: number
  faltas: number
  qtd_wellhub: number
  fat_wellhub: number
  primeiras_visitas: number
  qtd_totalpass: number
  fat_totalpass: number
  qtd_classpass: number
  fat_classpass: number
  qtd_creditos: number
  fat_creditos: number
  qtd_migracao: number
  fat_migracao: number
  qtd_multas: number
  fat_multas: number
  faturamento: number
  sem_valor: number
}

type ValorCfg = { chave: string; descricao: string; valor: number | null; ordem: number }

type Grupo = {
  chave: string
  label: string
  sub?: string
  aulas: number
  presentes: number
  faturamento: number
  custo: number
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const ORIGENS = [
  { k: 'wellhub',   label: 'Wellhub',                    qtd: 'qtd_wellhub',   fat: 'fat_wellhub',   cor: 'bg-orange-400' },
  { k: 'totalpass', label: 'TotalPass',                  qtd: 'qtd_totalpass', fat: 'fat_totalpass', cor: 'bg-indigo-400' },
  { k: 'classpass', label: 'ClassPass',                  qtd: 'qtd_classpass', fat: 'fat_classpass', cor: 'bg-sky-400' },
  { k: 'creditos',  label: 'Avulso / pacote / ilimitado', qtd: 'qtd_creditos', fat: 'fat_creditos',  cor: 'bg-[#ff2d9b]' },
  { k: 'migracao',  label: 'Migração (sistema antigo)',  qtd: 'qtd_migracao',  fat: 'fat_migracao',  cor: 'bg-gray-400' },
  { k: 'multas',    label: 'Multas no-show pagas',       qtd: 'qtd_multas',    fat: 'fat_multas',    cor: 'bg-red-400' },
] as const

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function tipoLabel(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')    return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t || '—'
}
function nomeCurto(n: string) { return (n || '').replace(/^just\s*club\s*/i, '').trim() || n }
function dataCurta(d: string) { const [, m, dia] = d.split('-'); return `${dia}/${m}` }
function pct(n: number) { return `${(n * 100).toFixed(1)}%` }

function agrupar(linhas: Linha[], chave: (l: Linha) => string, rotulo: (l: Linha) => { label: string; sub?: string }): Grupo[] {
  const acc: Record<string, Grupo> = {}
  for (const l of linhas) {
    const k = chave(l)
    const g = (acc[k] ||= { chave: k, ...rotulo(l), aulas: 0, presentes: 0, faturamento: 0, custo: 0 })
    g.aulas++
    g.presentes += l.presentes
    g.faturamento += Number(l.faturamento)
    g.custo += Number(l.custo_coach)
  }
  return Object.values(acc).sort((a, b) => (b.faturamento - b.custo) - (a.faturamento - a.custo))
}

function Margem({ fat, custo }: { fat: number; custo: number }) {
  const m = fat - custo
  return (
    <span className={m >= 0 ? 'text-primary-700' : 'text-danger-600'}>
      {fmt(m)}
      <span className="ml-1 text-xs text-gray-400">{fat > 0 ? pct(m / fat) : '—'}</span>
    </span>
  )
}

function TabelaGrupos({ grupos, colNome }: { grupos: Grupo[]; colNome: string }) {
  if (!grupos.length) return <div className="py-10 text-center text-sm text-gray-400">Nada no período.</div>
  return (
    <>
      {/* Celular: um cartão por linha */}
      <div className="divide-y divide-gray-100 md:hidden">
        {grupos.map(g => (
          <div key={g.chave} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-gray-900">{g.label}</div>
                {g.sub && <div className="text-xs text-gray-400">{g.sub}</div>}
              </div>
              <div className="text-right text-sm font-semibold"><Margem fat={g.faturamento} custo={g.custo} /></div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {g.aulas} aula{g.aulas !== 1 ? 's' : ''} · {(g.presentes / g.aulas).toFixed(1)} alunos/aula ·
              {' '}fat. {fmt(g.faturamento)} ({fmt(g.faturamento / g.aulas)}/aula) · custo {fmt(g.custo)}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2 font-medium">{colNome}</th>
              <th className="px-3 py-2 text-right font-medium">Aulas</th>
              <th className="px-3 py-2 text-right font-medium">Alunos/aula</th>
              <th className="px-3 py-2 text-right font-medium">Faturamento</th>
              <th className="px-3 py-2 text-right font-medium">Fat./aula</th>
              <th className="px-3 py-2 text-right font-medium">Custo</th>
              <th className="px-3 py-2 text-right font-medium">Margem</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <tr key={g.chave} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{g.label}</div>
                  {g.sub && <div className="text-xs text-gray-400">{g.sub}</div>}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">{g.aulas}</td>
                <td className="px-3 py-2 text-right text-gray-600">{(g.presentes / g.aulas).toFixed(1)}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(g.faturamento)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{fmt(g.faturamento / g.aulas)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{fmt(g.custo)}</td>
                <td className="px-3 py-2 text-right font-semibold"><Margem fat={g.faturamento} custo={g.custo} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

type Aba = 'aulas' | 'coaches' | 'horarios' | 'tipos' | 'valores'

export default function FaturamentoClubPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()

  const hoje = new Date()
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([])
  const [unidadeSel, setUnidadeSel] = useState<string>('ambas')
  const [periodo, setPeriodo] = useState<'mes' | 'mes_anterior' | '30' | 'custom'>('mes')
  const [dataIni, setDataIni] = useState(dataLocalStr(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [dataFim, setDataFim] = useState(dataLocalStr(hoje))

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [aba, setAba] = useState<Aba>('aulas')
  const [ordemAulas, setOrdemAulas] = useState<'mais' | 'menos'>('mais')
  const [verTodas, setVerTodas] = useState(false)

  const [valores, setValores] = useState<ValorCfg[]>([])
  const [edicao, setEdicao] = useState<Record<string, string>>({})
  const [salvandoChave, setSalvandoChave] = useState<string | null>(null)

  const ehAdmin = perfil?.role === 'admin'

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => {
    if (!perfil) return
    carregarUnidades()
    carregarValores()
  }, [perfil])

  useEffect(() => {
    if (periodo === 'custom') return
    const d = new Date()
    if (periodo === 'mes') {
      setDataIni(dataLocalStr(new Date(d.getFullYear(), d.getMonth(), 1)))
      setDataFim(dataLocalStr(d))
    } else if (periodo === 'mes_anterior') {
      setDataIni(dataLocalStr(new Date(d.getFullYear(), d.getMonth() - 1, 1)))
      setDataFim(dataLocalStr(new Date(d.getFullYear(), d.getMonth(), 0)))
    } else {
      setDataIni(dataLocalStr(new Date(Date.now() - 29 * 86400000)))
      setDataFim(dataLocalStr(d))
    }
  }, [periodo])

  useEffect(() => {
    if (perfil && dataIni && dataFim) carregar()
  }, [perfil, unidadeSel, dataIni, dataFim])

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades')
      .select('id, nome').eq('tipo', 'club').eq('ativo', true).order('nome')
    setUnidades((data as any[]) || [])
  }

  async function carregarValores() {
    const { data } = await supabase.from('club_valores_faturamento')
      .select('chave, descricao, valor, ordem').order('ordem')
    const lista = ((data as any[]) || []).map(v => ({ ...v, valor: v.valor == null ? null : Number(v.valor) }))
    setValores(lista)
    setEdicao(Object.fromEntries(lista.map(v => [v.chave, v.valor == null ? '' : String(v.valor).replace('.', ',')])))
  }

  async function carregar() {
    setCarregando(true)
    setErro(null)
    // Busca em blocos: o PostgREST corta em 1000 linhas por resposta.
    const TAM = 1000
    const todas: Linha[] = []
    for (let ini = 0; ; ini += TAM) {
      const { data, error } = await supabase
        .rpc('club_faturamento_aulas', {
          p_inicio: dataIni,
          p_fim: dataFim,
          p_unidade_id: unidadeSel === 'ambas' ? null : unidadeSel,
        })
        .order('data').order('horario').order('ocorrencia_id')
        .range(ini, ini + TAM - 1)
      if (error) {
        setErro('Não foi possível calcular o faturamento.')
        setCarregando(false)
        return
      }
      const bloco = (data as Linha[]) || []
      todas.push(...bloco)
      if (bloco.length < TAM) break
    }
    setLinhas(todas)
    setVerTodas(false)
    setCarregando(false)
  }

  async function salvarValor(v: ValorCfg) {
    const txt = (edicao[v.chave] ?? '').trim()
    let novo: number | null = null
    if (txt) {
      const t = txt.includes(',') ? txt.replace(/\./g, '').replace(',', '.') : txt
      novo = parseFloat(t)
      if (isNaN(novo) || novo < 0) return
    }
    setSalvandoChave(v.chave)
    const { error } = await supabase.from('club_valores_faturamento')
      .update({ valor: novo, atualizado_em: new Date().toISOString() })
      .eq('chave', v.chave)
    setSalvandoChave(null)
    if (error) { setErro('Não foi possível salvar o valor.'); return }
    await carregarValores()
    carregar()
  }

  const totais = useMemo(() => {
    const t = {
      faturamento: 0, custo: 0, aulas: linhas.length, presentes: 0, faltas: 0, semValor: 0, primeiras: 0,
      origens: Object.fromEntries(ORIGENS.map(o => [o.k, { qtd: 0, valor: 0 }])) as Record<string, { qtd: number; valor: number }>,
    }
    for (const l of linhas) {
      t.faturamento += Number(l.faturamento)
      t.custo += Number(l.custo_coach)
      t.presentes += l.presentes
      t.faltas += l.faltas
      t.semValor += l.sem_valor
      t.primeiras += l.primeiras_visitas
      for (const o of ORIGENS) {
        t.origens[o.k].qtd += Number((l as any)[o.qtd])
        t.origens[o.k].valor += Number((l as any)[o.fat])
      }
    }
    return t
  }, [linhas])

  const porCoach = useMemo(() => agrupar(linhas, l => l.coach_id || 'sem', l => ({ label: l.coach_nome || 'A definir' })), [linhas])
  const porHorario = useMemo(() => agrupar(
    linhas,
    l => `${l.dia_semana}|${l.horario}|${l.unidade_id}|${l.tipo}`,
    l => ({
      label: `${DIAS[l.dia_semana]} ${l.horario.slice(0, 5)}`,
      sub: `${tipoLabel(l.tipo)} · ${nomeCurto(l.unidade_nome)}`,
    })
  ), [linhas])
  const porTipo = useMemo(() => agrupar(
    linhas,
    l => `${l.tipo}|${unidadeSel === 'ambas' ? l.unidade_id : ''}`,
    l => ({ label: tipoLabel(l.tipo), sub: unidadeSel === 'ambas' ? nomeCurto(l.unidade_nome) : undefined })
  ), [linhas, unidadeSel])

  const aulasOrdenadas = useMemo(() => {
    const m = (l: Linha) => Number(l.faturamento) - Number(l.custo_coach)
    return [...linhas].sort((a, b) => ordemAulas === 'mais' ? m(b) - m(a) : m(a) - m(b))
  }, [linhas, ordemAulas])
  const aulasVisiveis = verTodas ? aulasOrdenadas : aulasOrdenadas.slice(0, 50)

  const inputCls = 'rounded-xl border border-gray-200 px-3 py-2 text-base text-gray-900 outline-none focus:border-[#ff2d9b] md:text-sm'
  const margemT = totais.faturamento - totais.custo

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Faturamento por aula · Club"
        subtitle="Quanto cada aula gerou (apps, créditos e multas), o custo do coach e a margem"
      />

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Período</label>
          <select value={periodo} onChange={e => setPeriodo(e.target.value as any)} className={inputCls}>
            <option value="mes">Mês atual</option>
            <option value="mes_anterior">Mês anterior</option>
            <option value="30">Últimos 30 dias</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">De</label>
          <input type="date" value={dataIni} onChange={e => { setPeriodo('custom'); setDataIni(e.target.value) }} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Até</label>
          <input type="date" value={dataFim} onChange={e => { setPeriodo('custom'); setDataFim(e.target.value) }} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Unidade</label>
          <select value={unidadeSel} onChange={e => setUnidadeSel(e.target.value)} className={inputCls}>
            <option value="ambas">Todas</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{nomeCurto(u.nome)}</option>)}
          </select>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      {carregando ? <Spinner /> : (
        <>
          {/* KPIs */}
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Faturamento" value={fmt(totais.faturamento)} sub={`${totais.presentes} presenças · ${totais.faltas} faltas`} subColor="text-gray-400" />
            <KpiCard label="Custo coaches" value={fmt(totais.custo)} sub={`${totais.aulas} aulas dadas`} subColor="text-gray-400" />
            <KpiCard
              label="Margem"
              value={fmt(margemT)}
              sub={totais.faturamento > 0 ? pct(margemT / totais.faturamento) : '—'}
              subColor={margemT >= 0 ? 'text-primary-600' : 'text-danger-600'}
            />
            <KpiCard
              label="Por aula / por aluno"
              value={totais.aulas ? fmt(totais.faturamento / totais.aulas) : '—'}
              sub={totais.presentes ? `${fmt(totais.faturamento / totais.presentes)} por presença` : undefined}
              subColor="text-gray-400"
            />
          </div>

          {totais.semValor > 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-warning-50 px-4 py-2 text-xs text-warning-700">
              ⚠ {totais.semValor} presença(s)/falta(s) entraram sem valor (R$ 0) — normalmente créditos da migração. Defina o valor na aba <strong>Valores</strong>.
            </div>
          )}

          {/* Origem do faturamento */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-gray-900">De onde vem o faturamento</div>
            <div className="space-y-2.5">
              {ORIGENS.map(o => {
                const b = totais.origens[o.k]
                const share = totais.faturamento > 0 ? b.valor / totais.faturamento : 0
                return (
                  <div key={o.k}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-gray-700">
                        {o.label}
                        <span className="ml-1.5 text-xs text-gray-400">
                          {b.qtd} {o.k === 'multas' ? 'multa(s)' : 'atend.'}
                          {o.k === 'wellhub' && totais.primeiras > 0 ? ` · ${totais.primeiras} 1ª visita` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-gray-900">
                        {fmt(b.valor)} <span className="text-xs font-normal text-gray-400">{pct(share)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-full rounded-full ${o.cor}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Abas */}
          <div className="mb-3 flex flex-wrap gap-2">
            {([
              ['aulas', 'Aulas'], ['coaches', 'Coaches'], ['horarios', 'Horários'], ['tipos', 'Tipo de aula'], ['valores', 'Valores'],
            ] as [Aba, string][]).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  aba === k ? 'bg-[#ff2d9b] text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            {aba === 'aulas' && (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-gray-500">Cada aula dada no período, ordenada pela margem</div>
                  <select value={ordemAulas} onChange={e => setOrdemAulas(e.target.value as any)} className={inputCls}>
                    <option value="mais">Mais rentáveis primeiro</option>
                    <option value="menos">Menos rentáveis primeiro</option>
                  </select>
                </div>

                {!aulasVisiveis.length ? (
                  <div className="py-10 text-center text-sm text-gray-400">Nenhuma aula no período.</div>
                ) : (
                  <>
                    <div className="divide-y divide-gray-100 md:hidden">
                      {aulasVisiveis.map(l => (
                        <div key={l.ocorrencia_id} className="py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {dataCurta(l.data)} {DIAS[l.dia_semana].slice(0, 3)} · {l.horario.slice(0, 5)} · {tipoLabel(l.tipo)}
                              </div>
                              <div className="text-xs text-gray-400">{nomeCurto(l.unidade_nome)} · {l.coach_nome || 'A definir'}</div>
                            </div>
                            <div className="text-right text-sm font-semibold">
                              <Margem fat={Number(l.faturamento)} custo={Number(l.custo_coach)} />
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {l.presentes}/{l.capacidade} presentes · {l.faltas} falta(s) · fat. {fmt(Number(l.faturamento))} · custo {fmt(Number(l.custo_coach))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                            <th className="px-3 py-2 font-medium">Aula</th>
                            <th className="px-3 py-2 font-medium">Coach</th>
                            <th className="px-3 py-2 text-right font-medium">Presentes</th>
                            <th className="px-3 py-2 text-right font-medium">Apps</th>
                            <th className="px-3 py-2 text-right font-medium">Créditos</th>
                            <th className="px-3 py-2 text-right font-medium">Faturamento</th>
                            <th className="px-3 py-2 text-right font-medium">Custo</th>
                            <th className="px-3 py-2 text-right font-medium">Margem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aulasVisiveis.map(l => {
                            const apps = Number(l.fat_wellhub) + Number(l.fat_totalpass) + Number(l.fat_classpass)
                            const creditos = Number(l.fat_creditos) + Number(l.fat_migracao) + Number(l.fat_multas)
                            return (
                              <tr key={l.ocorrencia_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                                <td className="px-3 py-2">
                                  <div className="font-medium text-gray-900">
                                    {dataCurta(l.data)} {DIAS[l.dia_semana].slice(0, 3)} · {l.horario.slice(0, 5)}
                                  </div>
                                  <div className="text-xs text-gray-400">{tipoLabel(l.tipo)} · {nomeCurto(l.unidade_nome)}</div>
                                </td>
                                <td className="px-3 py-2 text-gray-600">{l.coach_nome || 'A definir'}</td>
                                <td className="px-3 py-2 text-right text-gray-600">
                                  {l.presentes}/{l.capacidade}
                                  {l.faltas > 0 && <span className="ml-1 text-xs text-gray-400">+{l.faltas}F</span>}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600">{fmt(apps)}</td>
                                <td className="px-3 py-2 text-right text-gray-600">{fmt(creditos)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(Number(l.faturamento))}</td>
                                <td className="px-3 py-2 text-right text-gray-600">{fmt(Number(l.custo_coach))}</td>
                                <td className="px-3 py-2 text-right font-semibold">
                                  <Margem fat={Number(l.faturamento)} custo={Number(l.custo_coach)} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {!verTodas && aulasOrdenadas.length > 50 && (
                      <button
                        onClick={() => setVerTodas(true)}
                        className="mt-3 w-full rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Mostrar todas as {aulasOrdenadas.length} aulas
                      </button>
                    )}
                    <p className="mt-3 text-xs text-gray-400">
                      <strong>Apps</strong> = Wellhub + TotalPass + ClassPass. <strong>Créditos</strong> = avulso/pacote/ilimitado + migração + multas pagas.
                    </p>
                  </>
                )}
              </>
            )}

            {aba === 'coaches' && <TabelaGrupos grupos={porCoach} colNome="Coach" />}
            {aba === 'horarios' && <TabelaGrupos grupos={porHorario} colNome="Dia e horário" />}
            {aba === 'tipos' && <TabelaGrupos grupos={porTipo} colNome="Tipo de aula" />}

            {aba === 'valores' && (
              <>
                <div className="mb-3 text-sm text-gray-500">
                  Valor de cada presença/falta usado no cálculo. Avulso, pacote e ilimitado usam o valor real de cada crédito vendido.
                  {!ehAdmin && ' Só o admin pode alterar.'}
                </div>
                <div className="divide-y divide-gray-100">
                  {valores.map(v => (
                    <div key={v.chave} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div className="text-sm text-gray-800">
                        {v.descricao}
                        {v.valor == null && <span className="ml-2 text-xs text-warning-700">sem valor</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={!ehAdmin}
                            value={edicao[v.chave] ?? ''}
                            onChange={e => setEdicao(p => ({ ...p, [v.chave]: e.target.value }))}
                            placeholder="—"
                            className={`${inputCls} w-28 pl-9 disabled:bg-gray-50`}
                          />
                        </div>
                        {ehAdmin && (
                          <button
                            onClick={() => salvarValor(v)}
                            disabled={salvandoChave === v.chave}
                            className="rounded-xl bg-[#ff2d9b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e0277f] disabled:opacity-60"
                          >
                            {salvandoChave === v.chave ? 'Salvando…' : 'Salvar'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-400">
                  Wellhub: a 1ª presença do aluno em qualquer Club vale o valor de &quot;1ª visita&quot; (só a partir de 01/07/2026, início do histórico).
                  Falta de app só conta quando a reserva foi feita pelo app; falta de reserva do site entra só se a multa foi paga.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
