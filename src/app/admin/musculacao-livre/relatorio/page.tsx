'use client'

// Relatório da Musculação Livre (Just CT).
//
// A tela /admin/musculacao-livre é operacional: mostra quem entrou HOJE e
// pronto. Esta aqui é a leitura histórica em cima das mesmas entradas
// (Wellhub + TotalPass + walk-in com crédito nosso): volume, horários que
// lotam, dias melhores, frequência por pessoa, cruzamento com o Coach CT e
// quem parou de vir.
//
// Tudo vem agregado da RPC musculacao_livre_relatorio (supabase/musculacao-
// livre-relatorio.sql). Não dá pra puxar as entradas cruas no client: são
// ~7.8 mil linhas e o PostgREST corta em 1000 sem reclamar.
//
// A RPC resolve a identidade da pessoa por CPF/e-mail do payload do parceiro,
// então cada linha aqui é uma PESSOA, não uma conta de app: quem usa Wellhub
// e TotalPass aparece uma vez só, e quem tem cadastro nosso fica ligado aos
// treinos de Coach CT e às aulas do Club.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, KpiCard, EmptyState } from '@/components/ui'
import { Download, Search, AlertCircle, Info } from 'lucide-react'

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const ORIGENS: Record<string, { label: string; classe: string }> = {
  credito:   { label: 'Crédito',   classe: 'bg-blue-100 text-blue-700' },
  wellhub:   { label: 'Wellhub',   classe: 'bg-purple-100 text-purple-700' },
  totalpass: { label: 'TotalPass', classe: 'bg-teal-100 text-teal-700' },
}

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
// Datas vêm como 'YYYY-MM-DD'; o T12:00 evita o dia voltar um por causa do fuso.
function dia(iso: string) { return new Date(iso + 'T12:00:00') }
function ddmm(iso: string) { return dia(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
function ddmmyy(iso: string) { return dia(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
function diasEntre(a: string, b: string) {
  return Math.round((dia(b).getTime() - dia(a).getTime()) / 86400000)
}
function media(ns: number[]) { return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : 0 }

type Aba = 'geral' | 'pessoas' | 'coach' | 'retorno'

export default function MusculacaoLivreRelatorioPage() {
  const supabase = createClient()
  const hojeStr = dataLocalStr(new Date())

  const [inicio, setInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return dataLocalStr(d)
  })
  const [fim, setFim] = useState(hojeStr)
  const [dados, setDados] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState<Aba>('geral')
  const [busca, setBusca] = useState('')

  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [inicio, fim])

  async function carregar() {
    setLoading(true); setErro('')
    const { data, error } = await supabase.rpc('musculacao_livre_relatorio', { p_inicio: inicio, p_fim: fim })
    if (error) {
      setErro(error.message.includes('NAO_AUTORIZADO')
        ? 'Você não tem permissão para ver este relatório.'
        : 'Erro ao carregar: ' + error.message)
      setDados(null)
    } else {
      setDados(data)
    }
    setLoading(false)
  }

  function preset(tipo: '7' | '30' | '90' | 'mes' | 'tudo') {
    const hoje = new Date()
    if (tipo === 'tudo') { setInicio('2020-01-01'); setFim(hojeStr); return }
    if (tipo === 'mes') {
      setInicio(dataLocalStr(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
      setFim(hojeStr); return
    }
    const d = new Date(); d.setDate(d.getDate() - (Number(tipo) - 1))
    setInicio(dataLocalStr(d)); setFim(hojeStr)
  }

  const presetAtivo = useMemo(() => {
    if (fim !== hojeStr) return ''
    const hoje = new Date()
    if (inicio === '2020-01-01') return 'tudo'
    if (inicio === dataLocalStr(new Date(hoje.getFullYear(), hoje.getMonth(), 1))) return 'mes'
    for (const n of [7, 30, 90]) {
      const d = new Date(); d.setDate(d.getDate() - (n - 1))
      if (inicio === dataLocalStr(d)) return String(n)
    }
    return ''
  }, [inicio, fim, hojeStr])

  const resumo    = dados?.resumo  || {}
  const porDia: any[]   = dados?.por_dia  || []
  const heat: any[]     = dados?.heatmap  || []
  const pessoas: any[]  = dados?.pessoas  || []
  const coachOnly: any[] = dados?.coach_sem_musculacao || []
  const hoje: string    = dados?.hoje || hojeStr

  // ─── Série do gráfico: por dia até ~10 semanas; acima disso agrupa por semana ───
  const serie = useMemo(() => {
    if (porDia.length <= 70) return porDia.map(d => ({ rotulo: ddmm(d.dia), total: d.total, titulo: `${ddmmyy(d.dia)} · ${d.total} entradas` }))
    const semanas: Record<string, { total: number; ini: string }> = {}
    for (const d of porDia) {
      const dt = dia(d.dia)
      const seg = new Date(dt); seg.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)) // segunda da semana
      const k = dataLocalStr(seg)
      if (!semanas[k]) semanas[k] = { total: 0, ini: k }
      semanas[k].total += d.total
    }
    return Object.values(semanas)
      .sort((a, b) => a.ini.localeCompare(b.ini))
      .map(s => ({ rotulo: ddmm(s.ini), total: s.total, titulo: `Semana de ${ddmmyy(s.ini)} · ${s.total} entradas` }))
  }, [porDia])

  const maxSerie = Math.max(1, ...serie.map(s => s.total))

  // ─── Dias da semana: média de entradas por ocorrência do dia no período ───
  const porDow = useMemo(() => {
    const acc = Array.from({ length: 7 }, () => ({ total: 0, dias: 0 }))
    for (const d of porDia) {
      const i = dia(d.dia).getDay()
      acc[i].total += d.total
      acc[i].dias  += 1
    }
    return acc.map((a, i) => ({ dow: i, media: a.dias ? a.total / a.dias : 0 }))
  }, [porDia])

  const maxDow = Math.max(1, ...porDow.map(d => d.media))

  // ─── Heatmap hora × dia da semana ───
  const horas = useMemo(() => {
    if (!heat.length) return []
    const min = Math.min(...heat.map(h => h.hora))
    const max = Math.max(...heat.map(h => h.hora))
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }, [heat])

  const heatMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const h of heat) m[`${h.dow}-${h.hora}`] = h.total
    return m
  }, [heat])

  const maxHeat = Math.max(1, ...heat.map(h => h.total))

  const semanasPeriodo = Math.max(1, (diasEntre(inicio, fim) + 1) / 7)

  // ─── Ranking de frequência (só quem entrou no período) ───
  const ranking = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return pessoas
      .filter(p => p.entradas > 0)
      .filter(p => !termo || (p.nome || '').toLowerCase().includes(termo))
  }, [pessoas, busca])

  // ══════════ COACH CT × TREINO SOZINHO ══════════
  // Quem treinou com coach no período, com ou sem musculação livre.
  const fazemOsDois = useMemo(() =>
    pessoas.filter(p => p.coach_periodo > 0 && p.entradas > 0)
           .sort((a, b) => b.entradas - a.entradas),
  [pessoas])

  // Só coach no período: separa quem nunca pisou na musculação de quem já
  // treinou sozinho antes mas parou.
  const soCoach = useMemo(() => {
    const parou = pessoas
      .filter(p => p.coach_periodo > 0 && p.entradas === 0)
      .map(p => ({ chave: p.chave, nome: p.nome, coach: p.coach_periodo, coach_total: p.coach_total,
                   musc_total: p.total_geral, ultima_musc: p.ultima }))
    const nunca = coachOnly
      .map(c => ({ chave: c.chave, nome: c.nome, coach: c.coach_periodo, coach_total: c.coach_total,
                   musc_total: 0, ultima_musc: null as string | null }))
    return [...parou, ...nunca].sort((a, b) => b.coach - a.coach)
  }, [pessoas, coachOnly])

  // Só musculação: nunca marcou coach no período. São os candidatos a virar
  // aluno de Coach CT — ordenados por quem mais treina.
  const soMusculacao = useMemo(() =>
    pessoas.filter(p => p.entradas > 0 && p.coach_periodo === 0)
           .sort((a, b) => b.entradas - a.entradas),
  [pessoas])

  const totalCoach = fazemOsDois.length + soCoach.length

  // ══════════ QUEM PAROU DE VIR ══════════
  // Regra: a evasão olha ultima_qualquer (musculação + Club + Coach CT). Quem
  // trocou a musculação pelas aulas do Club não sumiu, e antes aparecia aqui.
  const umaVezSo = useMemo(() =>
    pessoas.filter(p => p.total_geral === 1 && diasEntre(p.ultima_qualquer, hoje) >= 14)
           .sort((a, b) => b.ultima.localeCompare(a.ultima)),
  [pessoas, hoje])

  const sumidos = useMemo(() =>
    pessoas.filter(p => p.total_geral >= 3 && diasEntre(p.ultima_qualquer, hoje) >= 30)
           .sort((a, b) => b.total_geral - a.total_geral),
  [pessoas, hoje])

  // Continuam na casa, só não na musculação livre: trocaram de modalidade.
  const migraram = useMemo(() =>
    pessoas.filter(p => p.total_geral >= 3
                     && diasEntre(p.ultima, hoje) >= 30
                     && diasEntre(p.ultima_qualquer, hoje) < 30)
           .sort((a, b) => b.total_geral - a.total_geral),
  [pessoas, hoje])

  function baixarCSV(linhas: any[], nome: string, colunas?: [string, (p: any) => any][]) {
    const cols: [string, (p: any) => any][] = colunas || [
      ['Nome', p => p.nome],
      ['Origem', p => ORIGENS[p.origem]?.label || p.origem],
      ['Cadastrado', p => p.cadastrado ? 'sim' : 'não'],
      ['Entradas no período', p => p.entradas],
      ['Dias no período', p => p.dias],
      ['Total de sempre', p => p.total_geral],
      ['Treinos com coach no período', p => p.coach_periodo],
      ['Primeira visita', p => p.primeira],
      ['Última musculação', p => p.ultima],
      ['Última aula no Club', p => p.ultima_club || ''],
      ['Último treino com coach', p => p.ultima_coach || ''],
    ]
    const body = linhas.map(p => cols.map(([, f]) => String(f(p) ?? '').replace(/;/g, ',')).join(';'))
    const blob = new Blob(['﻿' + [cols.map(([h]) => h).join(';'), ...body].join('\n')],
      { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${nome}-${inicio}-a-${fim}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <PageHeader
        title="Relatório · Musculação Livre"
        subtitle="Just CT · entradas por Wellhub, TotalPass e crédito avulso"
      />

      {/* ─── Filtro de período ─── */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {([['7','7 dias'],['30','30 dias'],['90','90 dias'],['mes','Este mês'],['tudo','Tudo']] as const).map(([k, label]) => (
            <button key={k} onClick={() => preset(k)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                presetAtivo === k ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" className="input text-xs py-1.5" value={inicio} max={fim}
              onChange={e => setInicio(e.target.value)} />
            <span className="text-xs text-gray-400">até</span>
            <input type="date" className="input text-xs py-1.5" value={fim} min={inicio} max={hojeStr}
              onChange={e => setFim(e.target.value)} />
          </div>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{erro}
        </div>
      )}

      {loading ? <Spinner /> : !dados ? null : (
        <>
          {/* ─── Abas ─── */}
          <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
            {([['geral','Visão geral'],['pessoas','Frequência por pessoa'],['coach','Coach CT × sozinho'],['retorno','Quem parou de vir']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setAba(k as Aba)}
                className={`text-sm px-4 py-2 font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  aba === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* ══════════ VISÃO GERAL ══════════ */}
          {aba === 'geral' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Entradas no período" value={String(resumo.entradas ?? 0)} />
                <KpiCard label="Pessoas diferentes" value={String(resumo.pessoas ?? 0)} />
                <KpiCard label="Média por dia aberto"
                  value={resumo.dias ? (resumo.entradas / resumo.dias).toFixed(1) : '0'}
                  sub={`${resumo.dias ?? 0} dias com movimento`} />
                <KpiCard label="Estrearam no período" value={String(resumo.novatos ?? 0)}
                  sub="primeira vez na musculação" subColor="text-emerald-600" />
              </div>

              <div className="card">
                <div className="text-sm font-semibold text-gray-900 mb-3">De onde vêm</div>
                <div className="space-y-2">
                  {(['totalpass','wellhub','credito'] as const).map(o => {
                    const v = resumo[o] ?? 0
                    const pct = resumo.entradas ? (v / resumo.entradas) * 100 : 0
                    return (
                      <div key={o} className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-20 text-center flex-shrink-0 ${ORIGENS[o].classe}`}>
                          {ORIGENS[o].label}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-600 w-24 text-right flex-shrink-0">{v} · {pct.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-900">Entradas no tempo</div>
                  <span className="text-xs text-gray-400">{porDia.length > 70 ? 'por semana' : 'por dia'}</span>
                </div>
                {serie.length === 0 ? <EmptyState message="Sem entradas neste período." /> : (
                  <>
                    <div className="flex items-end gap-[2px] h-40">
                      {serie.map((s, i) => (
                        <div key={i} className="flex-1 min-w-[3px] flex flex-col justify-end h-full" title={s.titulo}>
                          <div className="w-full rounded-t bg-emerald-500 hover:bg-emerald-600 transition-colors"
                            style={{ height: `${Math.max(2, (s.total / maxSerie) * 100)}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
                      <span>{serie[0].rotulo}</span>
                      <span>pico: {maxSerie}</span>
                      <span>{serie[serie.length - 1].rotulo}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="card">
                <div className="text-sm font-semibold text-gray-900 mb-3">Dias da semana <span className="font-normal text-xs text-gray-400">· média de entradas por dia</span></div>
                <div className="space-y-1.5">
                  {porDow.map(d => (
                    <div key={d.dow} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-8 flex-shrink-0">{DOW[d.dow]}</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(d.media / maxDow) * 100}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 w-20 text-right flex-shrink-0">{d.media.toFixed(1)}/dia</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="text-sm font-semibold text-gray-900 mb-3">Horários que lotam <span className="font-normal text-xs text-gray-400">· total de entradas por hora</span></div>
                {horas.length === 0 ? <EmptyState message="Sem entradas neste período." /> : (
                  <div className="overflow-x-auto">
                    <table className="border-separate border-spacing-[2px]">
                      <thead>
                        <tr>
                          <th className="w-8"></th>
                          {horas.map(h => <th key={h} className="text-[10px] font-normal text-gray-400 w-8">{h}h</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {[1,2,3,4,5,6,0].map(dow => (
                          <tr key={dow}>
                            <td className="text-[11px] text-gray-500 pr-1 text-right">{DOW[dow]}</td>
                            {horas.map(h => {
                              const v = heatMap[`${dow}-${h}`] || 0
                              const alpha = v ? 0.10 + 0.90 * (v / maxHeat) : 0
                              return (
                                <td key={h} className="p-0">
                                  <div className="h-7 rounded flex items-center justify-center text-[10px] font-medium"
                                    style={{ backgroundColor: v ? `rgba(16,185,129,${alpha})` : '#f9fafb',
                                             color: alpha > 0.55 ? '#fff' : '#6b7280' }}
                                    title={`${DOW[dow]} ${h}h · ${v} entradas`}>
                                    {v || ''}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════ FREQUÊNCIA POR PESSOA ══════════ */}
          {aba === 'pessoas' && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                  <input className="input pl-9 w-full text-sm py-1.5" placeholder="Buscar por nome..."
                    value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
                <span className="text-xs text-gray-400">{ranking.length} pessoas</span>
                <button onClick={() => baixarCSV(ranking, 'musculacao-livre-frequencia')}
                  className="btn gap-1.5 text-xs py-1.5 px-3 ml-auto border border-gray-200 text-gray-600 hover:bg-gray-50">
                  <Download size={13} /> CSV
                </button>
              </div>

              {ranking.length === 0 ? <EmptyState message="Ninguém entrou neste período." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        <th className="text-left pb-3 pr-3">#</th>
                        <th className="text-left pb-3 pr-3">Pessoa</th>
                        <th className="text-left pb-3 pr-3">Origem</th>
                        <th className="text-right pb-3 pr-3">Entradas</th>
                        <th className="text-right pb-3 pr-3">x/semana</th>
                        <th className="text-right pb-3 pr-3">Coach</th>
                        <th className="text-right pb-3 pr-3">Total sempre</th>
                        <th className="text-left pb-3">Última</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {ranking.map((p, i) => {
                        const o = ORIGENS[p.origem] || { label: p.origem, classe: 'bg-gray-100 text-gray-600' }
                        return (
                          <tr key={p.chave}>
                            <td className="py-2.5 pr-3 text-gray-400 text-xs">{i + 1}</td>
                            <td className="py-2.5 pr-3 font-medium text-gray-900">{p.nome}</td>
                            <td className="py-2.5 pr-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.classe}`}>{o.label}</span>
                            </td>
                            <td className="py-2.5 pr-3 text-right font-semibold text-primary-700">{p.entradas}</td>
                            <td className="py-2.5 pr-3 text-right text-gray-600">{(p.dias / semanasPeriodo).toFixed(1)}</td>
                            <td className="py-2.5 pr-3 text-right text-xs">
                              {p.coach_periodo > 0
                                ? <span className="text-emerald-700 font-semibold">{p.coach_periodo}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="py-2.5 pr-3 text-right text-gray-500 text-xs">{p.total_geral}</td>
                            <td className="py-2.5 text-xs text-gray-500">{ddmmyy(p.ultima)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════════ COACH CT × TREINO SOZINHO ══════════ */}
          {aba === 'coach' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Treinaram com coach" value={String(totalCoach)} sub="no período" />
                <KpiCard label="Também treinam sozinhos" value={String(fazemOsDois.length)}
                  sub={totalCoach ? `${((fazemOsDois.length / totalCoach) * 100).toFixed(0)}% dos alunos de coach` : '—'}
                  subColor="text-emerald-600" />
                <KpiCard label="Só coach" value={String(soCoach.length)}
                  sub="não usaram a musculação livre" />
                <KpiCard label="Só musculação" value={String(soMusculacao.length)}
                  sub="nunca marcaram coach no período" />
              </div>

              <div className="card">
                <div className="text-sm font-semibold text-gray-900 mb-3">Quanto cada grupo treina <span className="font-normal text-xs text-gray-400">· média no período</span></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Coach + sozinho</div>
                    <div className="text-gray-900">
                      <strong>{media(fazemOsDois.map(p => p.coach_periodo)).toFixed(1)}</strong> treinos com coach
                    </div>
                    <div className="text-gray-900">
                      <strong>{media(fazemOsDois.map(p => p.entradas)).toFixed(1)}</strong> entradas livres
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {(media(fazemOsDois.map(p => p.dias)) / semanasPeriodo).toFixed(1)}x por semana sozinho
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Só coach</div>
                    <div className="text-gray-900">
                      <strong>{media(soCoach.map(p => p.coach)).toFixed(1)}</strong> treinos com coach
                    </div>
                    <div className="text-gray-400">nenhuma entrada livre</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">Só musculação</div>
                    <div className="text-gray-900">
                      <strong>{media(soMusculacao.map(p => p.entradas)).toFixed(1)}</strong> entradas livres
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {(media(soMusculacao.map(p => p.dias)) / semanasPeriodo).toFixed(1)}x por semana
                    </div>
                  </div>
                </div>
              </div>

              <TabelaCoach
                titulo="Fazem coach e também treinam sozinhos"
                descricao="Alunos de Coach CT que também entram na musculação livre"
                linhas={fazemOsDois}
                semanas={semanasPeriodo}
                modo="dois"
                onCSV={() => baixarCSV(fazemOsDois, 'coach-e-sozinho')} />

              <TabelaCoach
                titulo="Só coach"
                descricao="Treinaram com coach no período e não usaram a musculação livre"
                linhas={soCoach}
                semanas={semanasPeriodo}
                modo="socoach"
                onCSV={() => baixarCSV(soCoach, 'so-coach', [
                  ['Nome', p => p.nome],
                  ['Treinos com coach no período', p => p.coach],
                  ['Treinos com coach de sempre', p => p.coach_total],
                  ['Entradas livres de sempre', p => p.musc_total],
                  ['Última musculação', p => p.ultima_musc || 'nunca'],
                ])} />

              <TabelaCoach
                titulo="Só musculação livre"
                descricao="Treinam sozinhos e não marcaram coach no período — os mais frequentes são os melhores candidatos"
                linhas={soMusculacao}
                semanas={semanasPeriodo}
                modo="somusc"
                onCSV={() => baixarCSV(soMusculacao, 'so-musculacao')} />
            </div>
          )}

          {/* ══════════ QUEM PAROU DE VIR ══════════ */}
          {aba === 'retorno' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-start gap-2">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  Estas listas olham o <strong>histórico inteiro</strong>, não o período do filtro, e a conta de
                  "sem vir" considera <strong>musculação livre, aulas do Club e Coach CT</strong> — quem trocou de
                  modalidade sai daqui e aparece no último bloco. Quem não tem cadastro nosso
                  (<em>Cadastrado: não</em>) dá pra ver, mas não dá pra contatar por aqui.
                </span>
              </div>

              <ListaRetorno
                titulo="Vieram uma vez e nunca voltaram"
                descricao="Primeira e única visita há 14 dias ou mais, sem aparecer em nenhuma modalidade"
                linhas={umaVezSo} hoje={hoje} onCSV={() => baixarCSV(umaVezSo, 'musculacao-livre-nao-voltaram')} />

              <ListaRetorno
                titulo="Eram frequentes e sumiram"
                descricao="3 entradas ou mais, sem aparecer em nenhuma modalidade há 30 dias"
                linhas={sumidos} hoje={hoje} onCSV={() => baixarCSV(sumidos, 'musculacao-livre-sumidos')} />

              <ListaRetorno
                titulo="Trocaram a musculação por outra coisa"
                descricao="Pararam a musculação livre há 30+ dias, mas continuam vindo nas aulas do Club ou no Coach CT"
                linhas={migraram} hoje={hoje} migrou
                onCSV={() => baixarCSV(migraram, 'musculacao-livre-migraram')} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Tabela das listas de cruzamento com o Coach CT ───
function TabelaCoach({ titulo, descricao, linhas, semanas, modo, onCSV }: {
  titulo: string; descricao: string; linhas: any[]; semanas: number
  modo: 'dois' | 'socoach' | 'somusc'; onCSV: () => void
}) {
  const [aberto, setAberto] = useState(modo !== 'somusc')
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {titulo} <span className="text-primary-700">· {linhas.length}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{descricao}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCSV} className="btn gap-1.5 text-xs py-1.5 px-3 border border-gray-200 text-gray-600 hover:bg-gray-50">
            <Download size={13} /> CSV
          </button>
          <button onClick={() => setAberto(a => !a)} className="text-xs text-gray-500 hover:text-gray-700">
            {aberto ? 'Esconder' : 'Mostrar'}
          </button>
        </div>
      </div>

      {aberto && (linhas.length === 0 ? <EmptyState message="Ninguém nesta lista." /> : (
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-3 pr-3">Pessoa</th>
                {modo !== 'somusc' && <th className="text-right pb-3 pr-3">Com coach</th>}
                {modo !== 'socoach' && <th className="text-right pb-3 pr-3">Sozinho</th>}
                {modo !== 'socoach' && <th className="text-right pb-3 pr-3">x/semana</th>}
                {modo === 'socoach' && <th className="text-left pb-3 pr-3">Já treinou sozinho?</th>}
                {modo !== 'socoach' && <th className="text-left pb-3">Última entrada</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linhas.map(p => (
                <tr key={p.chave}>
                  <td className="py-2.5 pr-3 font-medium text-gray-900">{p.nome}</td>
                  {modo !== 'somusc' && (
                    <td className="py-2.5 pr-3 text-right font-semibold text-emerald-700">
                      {modo === 'socoach' ? p.coach : p.coach_periodo}
                    </td>
                  )}
                  {modo !== 'socoach' && (
                    <td className="py-2.5 pr-3 text-right font-semibold text-primary-700">{p.entradas}</td>
                  )}
                  {modo !== 'socoach' && (
                    <td className="py-2.5 pr-3 text-right text-gray-600">{(p.dias / semanas).toFixed(1)}</td>
                  )}
                  {modo === 'socoach' && (
                    <td className="py-2.5 pr-3 text-xs text-gray-500">
                      {p.musc_total > 0
                        ? <>já entrou {p.musc_total}x · última em {ddmmyy(p.ultima_musc)}</>
                        : <span className="text-gray-300">nunca</span>}
                    </td>
                  )}
                  {modo !== 'socoach' && (
                    <td className="py-2.5 text-xs text-gray-500">{ddmmyy(p.ultima)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ─── Tabela das listas de evasão ───
function ListaRetorno({ titulo, descricao, linhas, hoje, onCSV, migrou }: {
  titulo: string; descricao: string; linhas: any[]; hoje: string; onCSV: () => void; migrou?: boolean
}) {
  const [aberto, setAberto] = useState(true)
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {titulo} <span className="text-primary-700">· {linhas.length}</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{descricao}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCSV} className="btn gap-1.5 text-xs py-1.5 px-3 border border-gray-200 text-gray-600 hover:bg-gray-50">
            <Download size={13} /> CSV
          </button>
          <button onClick={() => setAberto(a => !a)} className="text-xs text-gray-500 hover:text-gray-700">
            {aberto ? 'Esconder' : 'Mostrar'}
          </button>
        </div>
      </div>

      {aberto && (linhas.length === 0 ? <EmptyState message="Ninguém nesta lista." /> : (
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-3 pr-3">Pessoa</th>
                <th className="text-left pb-3 pr-3">Origem</th>
                <th className="text-center pb-3 pr-3">Cadastrado</th>
                <th className="text-right pb-3 pr-3">Entradas</th>
                <th className="text-left pb-3 pr-3">Última musculação</th>
                <th className="text-left pb-3">{migrou ? 'Onde está agora' : 'Sem vir há'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linhas.map(p => {
                const o = ORIGENS[p.origem] || { label: p.origem, classe: 'bg-gray-100 text-gray-600' }
                const clubRecente  = p.ultima_club  && diasEntre(p.ultima_club, hoje) < 30
                const coachRecente = p.ultima_coach && diasEntre(p.ultima_coach, hoje) < 30
                return (
                  <tr key={p.chave}>
                    <td className="py-2.5 pr-3 font-medium text-gray-900">{p.nome}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.classe}`}>{o.label}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-center text-xs">
                      {p.cadastrado ? <span className="text-emerald-600 font-medium">sim</span> : <span className="text-gray-300">não</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-primary-700">{p.total_geral}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500">{ddmmyy(p.ultima)}</td>
                    <td className="py-2.5 text-xs text-gray-500">
                      {migrou ? (
                        <span className="flex flex-wrap gap-1">
                          {coachRecente && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Coach CT · {ddmmyy(p.ultima_coach)}</span>}
                          {clubRecente  && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Club · {ddmmyy(p.ultima_club)}</span>}
                        </span>
                      ) : `${diasEntre(p.ultima_qualquer, hoje)} dias`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
