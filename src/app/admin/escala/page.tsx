'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUnidade } from '@/hooks/useUnidade'
import { PageHeader, Spinner } from '@/components/ui'

const DIAS_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function formatarData(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatarDataPT(dataStr: string): string {
  const d = new Date(dataStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ─── Mês de escala (Disponibilidade / Montar / Resumo) — datas sempre locais (SP) ───
function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Datas de fds (sáb/dom) de uma competência 'YYYY-MM'.
function fdsDoMes(comp: string) {
  const [y, m] = comp.split('-').map(Number)
  const dias: { data: string; dow: number }[] = []
  const d = new Date(y, m - 1, 1)
  while (d.getMonth() === m - 1) {
    const dow = d.getDay()
    if (dow === 0 || dow === 6) dias.push({ data: dataLocalStr(d), dow })
    d.setDate(d.getDate() + 1)
  }
  return dias
}
function competenciaLabel(comp: string) {
  const [y, m] = comp.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}
function addMes(comp: string, delta: number) {
  const [y, m] = comp.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function mesSeguinte() {
  const h = new Date()
  const p = new Date(h.getFullYear(), h.getMonth() + 1, 1)
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`
}
function rotuloDia(dataStr: string) {
  const d = new Date(dataStr + 'T12:00:00')
  const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()]
  return `${wd} ${dataStr.slice(8, 10)}/${dataStr.slice(5, 7)}`
}
// Sábado de referência do fim de semana (domingo agrupa com o sábado anterior).
function sabadoDoFds(dataStr: string) {
  const d = new Date(dataStr + 'T12:00:00')
  if (d.getDay() === 0) d.setDate(d.getDate() - 1)
  return dataLocalStr(d)
}
const META_KEY = 'escala_ct_meta_dia'

export default function AdminEscalaPage() {
  const supabase = createClient()
  const { unidadeAtiva, setUnidadeAtiva, unidadesPermitidas, loading: loadingUnidade } = useUnidade()

  const [aba, setAba] = useState<'fds' | 'feriados' | 'disponibilidade' | 'montar' | 'resumo'>('fds')
  const [coachesDisponiveis, setCoachesDisponiveis] = useState<any[]>([])
  const [escalas, setEscalas] = useState<any[]>([])
  const [feriados, setFeriados] = useState<any[]>([])
  const [feriasRows, setFeriasRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [modalAdicionar, setModalAdicionar] = useState<{ data: string } | null>(null)
  const [coachesSelecionados, setCoachesSelecionados] = useState<Set<string>>(new Set())
  const [salvandoCoach, setSalvandoCoach] = useState(false)

  const [modalNovoFeriado, setModalNovoFeriado] = useState(false)
  const [novoFeriadoData, setNovoFeriadoData] = useState('')
  const [novoFeriadoDescricao, setNovoFeriadoDescricao] = useState('')
  const [salvandoFeriado, setSalvandoFeriado] = useState(false)
  const [erroFeriado, setErroFeriado] = useState('')

  // Disponibilidade (ct_disponibilidade_fds, coach_id = coaches.id) usada no modal da aba Final de Semana.
  const [dispFds, setDispFds] = useState<Set<string>>(new Set()) // `${coachId}|${data}`

  // Mês de escala: compartilhado por Disponibilidade, Montar e Resumo. Default = mês seguinte.
  const [mesSel, setMesSel] = useState<string>(mesSeguinte())
  const [dispMes, setDispMes] = useState<Set<string>>(new Set())    // `${coachId}|${data}`
  const [escalasMes, setEscalasMes] = useState<any[]>([])           // escala_fds do mês (coach_id = user_id)
  const [feriasMes, setFeriasMes] = useState<any[]>([])
  const [loadingMes, setLoadingMes] = useState(false)
  const [salvandoDisp, setSalvandoDisp] = useState<string | null>(null) // `${coachId}|${data}`
  const [salvandoMontar, setSalvandoMontar] = useState<string | null>(null) // `${userId}|${data}` ou 'mes'
  const [meta, setMeta] = useState<number>(5)
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(META_KEY))
      if (v >= 1 && v <= 20) setMeta(v)
    } catch (e) {}
  }, [])

  useEffect(() => {
    if (unidadeAtiva) loadDados()
  }, [unidadeAtiva?.id])

  useEffect(() => {
    if (unidadeAtiva && (aba === 'disponibilidade' || aba === 'montar' || aba === 'resumo')) carregarMes()
  }, [aba, mesSel, unidadeAtiva?.id])

  const proximosFDS = (() => {
    const datas: { data: string; nome: string }[] = []
    const hoje = new Date()
    hoje.setHours(12, 0, 0, 0)
    let count = 0
    let cursor = new Date(hoje)
    while (count < 12) {
      const diaSem = cursor.getDay()
      if (diaSem === 0 || diaSem === 6) {
        datas.push({ data: formatarData(cursor), nome: DIAS_SEMANA_LABEL[diaSem] })
        count++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return datas
  })()

  // silencioso = recarrega sem trocar a tela pelo spinner (usado pelas abas do mês).
  async function loadDados(silencioso = false) {
    if (!unidadeAtiva) return
    if (!silencioso) setLoading(true)
    const dataInicio = formatarData(new Date())
    const dataLimite = new Date()
    dataLimite.setMonth(dataLimite.getMonth() + 3)

    // Coaches habilitados NESTA unidade (via coach_unidades) — mesma fonte do cadastro de coach.
    // Sem este filtro a lista trazia TODOS os coaches, inclusive os exclusivos de outra unidade.
    const { data: cu } = await supabase.from('coach_unidades')
      .select('coach_id').eq('unidade_id', unidadeAtiva.id).eq('ativo', true)
    const coachIds = (cu || []).map((u: any) => u.coach_id)
    const { data: coaches } = coachIds.length
      ? await supabase.from('coaches').select('id, nome, user_id').eq('ativo', true).in('id', coachIds).order('nome')
      : { data: [] as any[] }

    // Férias/ausências dos coaches desta unidade que tocam a janela exibida (coach_ferias.coach_id = coaches.id).
    const { data: ferias } = coachIds.length
      ? await supabase.from('coach_ferias').select('coach_id, data_inicio, data_fim').in('coach_id', coachIds).lte('data_inicio', formatarData(dataLimite)).gte('data_fim', dataInicio)
      : { data: [] as any[] }

    const [{ data: esc }, { data: fer }, { data: disp }] = await Promise.all([
      supabase.from('escala_fds')
        .select('*')
        .eq('unidade_id', unidadeAtiva.id)
        .gte('data', dataInicio)
        .lte('data', formatarData(dataLimite))
        .order('data'),
      supabase.from('feriados')
        .select('*')
        .eq('unidade_id', unidadeAtiva.id)
        .gte('data', dataInicio)
        .order('data'),
      supabase.from('ct_disponibilidade_fds')
        .select('coach_id, data')
        .eq('unidade_id', unidadeAtiva.id)
        .in('data', proximosFDS.map(p => p.data)),
    ])

    const ds = new Set<string>()
    for (const d of (disp || [])) ds.add(`${d.coach_id}|${d.data}`)
    setDispFds(ds)
    setCoachesDisponiveis(coaches || [])
    setEscalas(esc || [])
    setFeriados(fer || [])
    setFeriasRows(ferias || [])
    setLoading(false)
  }

  function nomeCoach(coachUserId: string): string {
    const c = coachesDisponiveis.find(c => c.user_id === coachUserId)
    return c?.nome || 'Coach'
  }

  function coachesDaData(data: string): any[] {
    return escalas.filter(e => e.data === data)
  }
  // escala_fds.coach_id guarda user_id; coach_ferias.coach_id guarda coaches.id — resolve antes de checar.
  function coachIdReal(coachUserId: string): string | undefined {
    return coachesDisponiveis.find(c => c.user_id === coachUserId)?.id
  }
  function estaDeFerias(coachRealId: string | undefined, data: string): boolean {
    if (!coachRealId) return false
    return feriasRows.some(f => f.coach_id === coachRealId && f.data_inicio <= data && f.data_fim >= data)
  }
  function coachesNaoEscalados(data: string): any[] {
    const idsEscalados = new Set(coachesDaData(data).map(e => e.coach_id))
    return coachesDisponiveis.filter(c => !idsEscalados.has(c.user_id) && !estaDeFerias(c.id, data))
  }

  function toggleCoachSelecionado(userId: string) {
    setCoachesSelecionados(prev => {
      const novo = new Set(prev)
      if (novo.has(userId)) novo.delete(userId)
      else novo.add(userId)
      return novo
    })
  }

  function abrirModalAdicionar(data: string) {
    setModalAdicionar({ data })
    setCoachesSelecionados(new Set())
  }

  async function adicionarCoachesNaEscala() {
    if (coachesSelecionados.size === 0 || !modalAdicionar || !unidadeAtiva) return
    setSalvandoCoach(true)

    const registros = Array.from(coachesSelecionados).map(userId => ({
      unidade_id: unidadeAtiva.id,
      data: modalAdicionar.data,
      coach_id: userId,
    }))

    const { error } = await supabase.from('escala_fds').insert(registros)

    if (!error) {
      setModalAdicionar(null)
      setCoachesSelecionados(new Set())
      await loadDados()
    }
    setSalvandoCoach(false)
  }

  async function removerCoachDaEscala(escalaId: string) {
    if (!confirm('Remover este coach da escala?')) return
    await supabase.from('escala_fds').delete().eq('id', escalaId)
    await loadDados()
  }

  async function criarFeriado() {
    if (!novoFeriadoData) { setErroFeriado('Selecione a data.'); return }
    if (!novoFeriadoDescricao.trim()) { setErroFeriado('Descreva o feriado.'); return }
    if (!unidadeAtiva) return
    setSalvandoFeriado(true)
    setErroFeriado('')
    const { error } = await supabase.from('feriados').insert({
      unidade_id: unidadeAtiva.id,
      data: novoFeriadoData,
      descricao: novoFeriadoDescricao.trim(),
      ativo: true,
    })
    if (error) {
      if (error.code === '23505') setErroFeriado('Já existe feriado nesta data.')
      else setErroFeriado('Erro ao criar feriado.')
      setSalvandoFeriado(false)
      return
    }
    setModalNovoFeriado(false)
    setNovoFeriadoData('')
    setNovoFeriadoDescricao('')
    setSalvandoFeriado(false)
    await loadDados()
  }

  async function toggleFeriadoAtivo(id: string, ativo: boolean) {
    await supabase.from('feriados').update({ ativo: !ativo }).eq('id', id)
    await loadDados()
  }

  async function removerFeriado(id: string) {
    if (!confirm('Remover este feriado? A grade fixa voltará a valer nesta data.')) return
    await supabase.from('feriados').delete().eq('id', id)
    await loadDados()
  }

  // ─── Modal da aba Final de Semana: quem não marcou disponibilidade aparece apagado ───
  // Só vale se alguém já marcou disponibilidade na data; sem nenhuma marcação o modal segue como antes.
  function semDisponibilidade(coachRealId: string, data: string): boolean {
    const dataTemDisp = Array.from(dispFds).some(k => k.endsWith(`|${data}`))
    return dataTemDisp && !dispFds.has(`${coachRealId}|${data}`)
  }

  // ─── Mês de escala (Disponibilidade / Montar / Resumo) ───
  async function carregarMes() {
    if (!unidadeAtiva) return
    setLoadingMes(true)
    const datas = fdsDoMes(mesSel).map(f => f.data)
    if (datas.length === 0) { setDispMes(new Set()); setEscalasMes([]); setFeriasMes([]); setLoadingMes(false); return }
    const minD = datas[0], maxD = datas[datas.length - 1]
    const [{ data: disp }, { data: esc }, { data: fer }] = await Promise.all([
      supabase.from('ct_disponibilidade_fds').select('coach_id, data').eq('unidade_id', unidadeAtiva.id).in('data', datas),
      supabase.from('escala_fds').select('*').eq('unidade_id', unidadeAtiva.id).in('data', datas).order('data'),
      supabase.from('coach_ferias').select('coach_id, data_inicio, data_fim').lte('data_inicio', maxD).gte('data_fim', minD),
    ])
    const s = new Set<string>()
    for (const d of (disp || [])) s.add(`${d.coach_id}|${d.data}`)
    setDispMes(s)
    setEscalasMes(esc || [])
    setFeriasMes(fer || [])
    setLoadingMes(false)
  }

  function deFeriasMes(coachRealId: string, data: string): boolean {
    return feriasMes.some(f => f.coach_id === coachRealId && f.data_inicio <= data && f.data_fim >= data)
  }

  async function toggleDisp(coachId: string, data: string) {
    if (!unidadeAtiva) return
    const key = `${coachId}|${data}`
    setSalvandoDisp(key)
    if (dispMes.has(key)) {
      const { error } = await supabase.from('ct_disponibilidade_fds')
        .delete().eq('unidade_id', unidadeAtiva.id).eq('coach_id', coachId).eq('data', data)
      if (error) { setSalvandoDisp(null); return }
    } else {
      const { error } = await supabase.from('ct_disponibilidade_fds')
        .upsert({ competencia: mesSel, unidade_id: unidadeAtiva.id, coach_id: coachId, data },
          { onConflict: 'unidade_id,coach_id,data' })
      if (error) { setSalvandoDisp(null); return }
    }
    setDispMes(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
    setSalvandoDisp(null)
    loadDados(true) // mantém o modal da aba Final de Semana em dia
  }

  function mudarMeta(v: number) {
    const n = Math.max(1, Math.min(20, Math.round(v) || 1))
    setMeta(n)
    try { localStorage.setItem(META_KEY, String(n)) } catch (e) {}
  }

  // Coaches que podem ser escalados no dia pela montagem: marcaram disponibilidade, sem férias e ainda fora da escala.
  function candidatosMontar(data: string, escaladosUserIds: Set<string>) {
    return coachesDisponiveis.filter(c =>
      c.user_id &&
      !escaladosUserIds.has(c.user_id) &&
      dispMes.has(`${c.id}|${data}`) &&
      !deFeriasMes(c.id, data))
  }

  // Dias escalados no mês por coach (user_id) — base do rodízio.
  function diasNoMes(escs: any[]) {
    const cont: Record<string, number> = {}
    for (const e of escs) cont[e.coach_id] = (cont[e.coach_id] || 0) + 1
    return cont
  }

  // Completa cada dia do mês (de hoje em diante) até a meta. Não remove ninguém já escalado.
  // Entre os disponíveis, entra quem tem menos dias escalados no mês (empate: ordem alfabética).
  async function montarSugestaoMes() {
    if (!unidadeAtiva) return
    setSalvandoMontar('mes')
    const hoje = dataLocalStr(new Date())
    const cont = diasNoMes(escalasMes)
    const registros: any[] = []
    for (const { data } of fdsDoMes(mesSel)) {
      if (data < hoje) continue
      const esc = new Set(escalasMes.filter(e => e.data === data).map(e => e.coach_id))
      const falta = meta - esc.size
      if (falta <= 0) continue
      const escolhidos = candidatosMontar(data, esc)
        .sort((a, b) => ((cont[a.user_id] || 0) - (cont[b.user_id] || 0)) || (a.nome || '').localeCompare(b.nome || ''))
        .slice(0, falta)
      for (const c of escolhidos) {
        registros.push({ unidade_id: unidadeAtiva.id, data, coach_id: c.user_id })
        cont[c.user_id] = (cont[c.user_id] || 0) + 1
      }
    }
    if (registros.length > 0) await supabase.from('escala_fds').insert(registros)
    await Promise.all([carregarMes(), loadDados(true)])
    setSalvandoMontar(null)
  }

  async function escalarNoDia(userId: string, data: string) {
    if (!unidadeAtiva) return
    setSalvandoMontar(`${userId}|${data}`)
    await supabase.from('escala_fds').insert({ unidade_id: unidadeAtiva.id, data, coach_id: userId })
    await Promise.all([carregarMes(), loadDados(true)])
    setSalvandoMontar(null)
  }

  async function removerDoDia(escalaId: string) {
    if (!confirm('Remover este coach da escala?')) return
    await supabase.from('escala_fds').delete().eq('id', escalaId)
    await Promise.all([carregarMes(), loadDados(true)])
  }

  // ─── Resumo do mês (copiável p/ WhatsApp): só sáb/dom do mês, reflete a escala salva ───
  function montarResumo() {
    const datas = fdsDoMes(mesSel).map(f => f.data)
    const mesTxt = competenciaLabel(mesSel)
    const nomeUnid = (unidadeAtiva?.nome || 'Coach CT').toUpperCase()
    const nomesDoDia = (data: string) =>
      escalasMes.filter(e => e.data === data).map(e => nomeCoach(e.coach_id)).sort((a, b) => a.localeCompare(b))
    const plural = (n: number) => `${n} dia${n === 1 ? '' : 's'}`
    const linhasDia = (data: string) => {
      const nomes = nomesDoDia(data)
      return [rotuloDia(data), ...(nomes.length ? nomes.map(n => `• ${n}`) : ['• A definir'])]
    }

    const linhasMes = [`*ESCALA FDS — ${nomeUnid}*`, mesTxt, '']
    for (const d of datas) linhasMes.push(...linhasDia(d), '')
    const bMes = [{ id: 'mes', titulo: unidadeAtiva?.nome || 'Coach CT', sub: plural(datas.length), texto: linhasMes.join('\n').trim() }]

    const sabKeys = Array.from(new Set(datas.map(sabadoDoFds))).sort()
    const bFds = sabKeys.map(sab => {
      const dias = datas.filter(d => sabadoDoFds(d) === sab).sort()
      const titulo = dias.map(rotuloDia).join(' + ')
      const linhas = [`*ESCALA FDS — ${titulo}*`, '']
      for (const d of dias) linhas.push(...linhasDia(d), '')
      return { id: `fds:${sab}`, titulo, sub: plural(dias.length), texto: linhas.join('\n').trim() }
    })

    const porCoach: Record<string, string[]> = {}
    for (const e of escalasMes) {
      if (!porCoach[e.coach_id]) porCoach[e.coach_id] = []
      porCoach[e.coach_id].push(e.data)
    }
    const bCoach = Object.keys(porCoach)
      .sort((a, b) => nomeCoach(a).localeCompare(nomeCoach(b)))
      .map(uid => {
        const dias = porCoach[uid].sort()
        const linhas = [`*${nomeCoach(uid)} — ${mesTxt}*`, '', ...dias.map(d => `• ${rotuloDia(d)}`), '', `Total: ${plural(dias.length)}`]
        return { id: `coach:${uid}`, titulo: nomeCoach(uid), sub: plural(dias.length), texto: linhas.join('\n').trim() }
      })

    return { bMes, bFds, bCoach }
  }

  async function copiarResumo(texto: string, qual: string) {
    try { await navigator.clipboard.writeText(texto) } catch (e) {}
    setCopiado(qual)
    setTimeout(() => setCopiado(c => (c === qual ? null : c)), 2000)
  }

  if (loadingUnidade || loading) return <Spinner />

  const VERDE = '#16a34a'
  const VERDE_HOVER = '#15803d'
  const VERDE_LIGHT = '#dcfce7'

  // Seletor de mês (◀ mês ▶) das abas Disponibilidade, Montar e Resumo.
  const seletorMes = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
      <button onClick={() => setMesSel(c => addMes(c, -1))}
        style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#4b5563' }}>◀</button>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#111827', textTransform: 'capitalize', minWidth: 170, textAlign: 'center' }}>
        {competenciaLabel(mesSel)}
      </div>
      <button onClick={() => setMesSel(c => addMes(c, 1))}
        style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14, color: '#4b5563' }}>▶</button>
    </div>
  )

  return (
    <div>
      <PageHeader title="Escala" subtitle="Final de semana e feriados — coaches escalados pontualmente" />

      {/* Seletor de unidade */}
      {unidadesPermitidas.length > 1 && (
        <div className="mb-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Unidade</div>
          <div className="flex gap-2 flex-wrap">
            {unidadesPermitidas.map(u => {
              const ativa = unidadeAtiva?.id === u.id
              return (
                <button key={u.id} onClick={() => setUnidadeAtiva(u)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 8,
                    border: `1.5px solid ${ativa ? VERDE : '#e5e7eb'}`,
                    background: ativa ? VERDE_LIGHT : '#fff',
                    color: ativa ? '#15803d' : '#4b5563',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}>
                  {u.nome}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-2 border-b border-gray-200 mb-6" style={{ overflowX: 'auto' }}>
        {[
          { key: 'fds', label: 'Final de Semana' },
          { key: 'feriados', label: 'Feriados' },
          { key: 'disponibilidade', label: 'Disponibilidade' },
          { key: 'montar', label: 'Montar' },
          { key: 'resumo', label: 'Resumo' },
        ].map(t => (
          <button key={t.key} onClick={() => setAba(t.key as any)}
            style={{
              whiteSpace: 'nowrap',
              flexShrink: 0,
              padding: '0.6rem 1rem',
              fontSize: 14,
              fontWeight: 500,
              borderBottom: `2px solid ${aba === t.key ? VERDE : 'transparent'}`,
              color: aba === t.key ? VERDE : '#6b7280',
              background: 'transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {!unidadeAtiva ? (
        <div className="card text-center text-gray-400 py-8">
          Selecione uma unidade.
        </div>
      ) : aba === 'disponibilidade' ? (
        /* ===== ABA DISPONIBILIDADE: coach × sáb/dom do mês ===== */
        <>
          {seletorMes}
          <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, color: '#1d4ed8' }}>
              💡 Marque os dias em que cada coach pode trabalhar. A aba <strong>Montar</strong> e o <strong>+ Adicionar coach</strong> usam essas marcações.
            </p>
          </div>
          {loadingMes ? (
            <div className="card text-center text-gray-400 py-8">Carregando disponibilidade...</div>
          ) : coachesDisponiveis.length === 0 ? (
            <div className="card text-center text-gray-400 py-8">Nenhum coach ativo nesta unidade.</div>
          ) : (
            <div className="card" style={{ overflowX: 'auto', padding: '0.75rem' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', borderBottom: '1px solid #f3f4f6', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Coach</th>
                    {fdsDoMes(mesSel).map(f => (
                      <th key={f.data} style={{ padding: '0.4rem 0.2rem', borderBottom: '1px solid #f3f4f6', minWidth: 42 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', lineHeight: 1 }}>{f.data.slice(8, 10)}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: f.dow === 6 ? VERDE : '#6b7280', textTransform: 'uppercase' }}>{f.dow === 6 ? 'Sáb' : 'Dom'}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coachesDisponiveis.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontSize: 13, fontWeight: 500, color: '#1f2937', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{c.nome}</td>
                      {fdsDoMes(mesSel).map(f => {
                        const key = `${c.id}|${f.data}`
                        const on = dispMes.has(key)
                        const ferias = deFeriasMes(c.id, f.data)
                        const carregando = salvandoDisp === key
                        return (
                          <td key={f.data} style={{ padding: '0.25rem', textAlign: 'center' }}>
                            <button onClick={() => toggleDisp(c.id, f.data)} disabled={carregando}
                              title={ferias ? 'de férias' : ''}
                              style={{
                                width: 30, height: 30, borderRadius: 8, cursor: carregando ? 'default' : 'pointer',
                                border: `1.5px solid ${on ? VERDE : ferias ? '#fdba74' : '#e5e7eb'}`,
                                background: on ? VERDE_LIGHT : ferias ? '#fff7ed' : '#fff',
                                color: on ? VERDE : '#ea580c', fontSize: on ? 15 : 10, fontWeight: 700,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                opacity: carregando ? 0.5 : 1,
                              }}>
                              {carregando ? '·' : on ? '✓' : ferias ? 'F' : ''}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                <span style={{ color: '#ea580c', fontWeight: 700 }}>F</span> = de férias nesse dia
              </div>
            </div>
          )}
        </>
      ) : aba === 'montar' ? (
        /* ===== ABA MONTAR: completa cada dia até a meta, por rodízio ===== */
        <>
          {seletorMes}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' }}>
            <label style={{ fontSize: 14, color: '#4b5563', display: 'flex', alignItems: 'center', gap: 8 }}>
              Meta por dia
              <button onClick={() => mudarMeta(meta - 1)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>−</button>
              <strong style={{ minWidth: 20, textAlign: 'center', fontSize: 16, color: '#111827' }}>{meta}</strong>
              <button onClick={() => mudarMeta(meta + 1)} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>+</button>
              coaches
            </label>
            <button onClick={montarSugestaoMes} disabled={salvandoMontar !== null || loadingMes}
              style={{ marginLeft: 'auto', background: salvandoMontar === 'mes' ? '#d1d5db' : VERDE, color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.2rem', fontSize: 14, fontWeight: 600, cursor: salvandoMontar !== null ? 'default' : 'pointer' }}>
              {salvandoMontar === 'mes' ? 'Montando...' : 'Montar sugestão do mês'}
            </button>
            <p style={{ fontSize: 12, color: '#9ca3af', width: '100%' }}>
              Completa cada dia (de hoje em diante) até a meta com quem marcou disponibilidade e não está de férias. Quem tem menos dias no mês entra primeiro. Ninguém já escalado é removido.
            </p>
          </div>

          {loadingMes ? (
            <div className="card text-center text-gray-400 py-8">Carregando...</div>
          ) : (() => {
            const cont = diasNoMes(escalasMes)
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fdsDoMes(mesSel).map(({ data, dow }) => {
                  const escs = escalasMes.filter(e => e.data === data)
                  const escSet = new Set(escs.map(e => e.coach_id))
                  const cands = candidatosMontar(data, escSet)
                    .sort((a, b) => ((cont[a.user_id] || 0) - (cont[b.user_id] || 0)) || (a.nome || '').localeCompare(b.nome || ''))
                  const semDisp = coachesDisponiveis.filter(c => c.user_id && !escSet.has(c.user_id) && !dispMes.has(`${c.id}|${data}`) && !deFeriasMes(c.id, data))
                  const ferias = coachesDisponiveis.filter(c => !escSet.has(c.user_id) && deFeriasMes(c.id, data))
                  const completo = escs.length >= meta
                  const dataObj = new Date(data + 'T12:00:00')
                  return (
                    <div key={data} className="card">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="text-center flex-shrink-0 w-14">
                          <div className="text-2xl font-bold text-gray-800 leading-none">{dataObj.getDate()}</div>
                          <div className="text-xs text-gray-400 uppercase mt-0.5">{dataObj.toLocaleDateString('pt-BR', { month: 'short' })}</div>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{DIAS_SEMANA_LABEL[dow]}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: completo ? VERDE : '#ea580c' }}>
                            {escs.length}/{meta} coaches
                          </div>
                        </div>
                      </div>

                      {escs.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {escs.map(e => {
                            const real = coachIdReal(e.coach_id)
                            const aviso = real && deFeriasMes(real, data) ? 'de férias'
                              : real && !dispMes.has(`${real}|${data}`) ? 'sem disponibilidade' : ''
                            return (
                              <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                                <span className="text-gray-800 flex items-center gap-2">
                                  {nomeCoach(e.coach_id)}
                                  {aviso && <span style={{ fontSize: 11, fontWeight: 600, color: '#ea580c', background: '#ffedd5', borderRadius: 6, padding: '1px 6px' }}>{aviso}</span>}
                                </span>
                                <button onClick={() => removerDoDia(e.id)}
                                  style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>
                                  ×
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {cands.length > 0 ? (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Disponíveis</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {cands.map(c => {
                              const k = `${c.user_id}|${data}`
                              return (
                                <button key={c.id} onClick={() => escalarNoDia(c.user_id, data)} disabled={salvandoMontar !== null}
                                  style={{ border: `1.5px dashed ${VERDE}`, background: '#fff', color: VERDE, borderRadius: 999, padding: '0.3rem 0.7rem', fontSize: 13, fontWeight: 500, cursor: salvandoMontar !== null ? 'default' : 'pointer', opacity: salvandoMontar === k ? 0.5 : 1 }}>
                                  + {c.nome} <span style={{ color: '#9ca3af', fontSize: 11 }}>({cont[c.user_id] || 0}d)</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginBottom: 8 }}>
                          {escs.length === 0 ? 'Ninguém marcou disponibilidade nesse dia.' : 'Nenhum outro coach disponível.'}
                        </div>
                      )}

                      {semDisp.length > 0 && (
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          <strong style={{ color: '#9ca3af' }}>Sem disponibilidade:</strong> {semDisp.map(c => c.nome).join(', ')}
                        </div>
                      )}
                      {ferias.length > 0 && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                          <strong style={{ color: '#ea580c' }}>De férias:</strong> {ferias.map(c => c.nome).join(', ')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </>
      ) : aba === 'resumo' ? (
        /* ===== ABA RESUMO: blocos copiáveis p/ WhatsApp ===== */
        <>
          {seletorMes}
          {loadingMes ? (
            <div className="card text-center text-gray-400 py-8">Gerando resumo...</div>
          ) : (() => {
            const { bMes, bFds, bCoach } = montarResumo()
            const card = (b: any) => (
              <div key={b.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.titulo}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{b.sub}</div>
                  </div>
                  <button onClick={() => copiarResumo(b.texto, b.id)}
                    style={{ flexShrink: 0, padding: '0.4rem 0.85rem', borderRadius: 8, border: 'none', background: copiado === b.id ? VERDE_HOVER : VERDE, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {copiado === b.id ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <pre style={{ margin: 0, maxHeight: 220, overflow: 'auto', borderRadius: 8, border: '1px solid #f3f4f6', background: '#f9fafb', padding: '0.7rem', fontSize: 12, color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{b.texto}</pre>
              </div>
            )
            const secao = (titulo: string, desc: string, blocos: any[]) => (
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{titulo}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{desc}</div>
                </div>
                {blocos.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>Ninguém escalado neste mês.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{blocos.map(card)}</div>
                )}
              </div>
            )
            return (
              <>
                {secao('Mês todo', 'todos os fins de semana do mês', bMes)}
                {secao('Por fim de semana', 'sábado + domingo', bFds)}
                {secao('Por coach', 'cada coach, mês todo — mandar individual', bCoach)}
              </>
            )
          })()}
        </>
      ) : aba === 'fds' ? (
        <>
          <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, color: '#1d4ed8' }}>
              💡 Horários no FDS: <strong>08:00, 09:00, 10:00, 11:00, 12:00</strong>. Cada coach escalado cobre todos os 5 horários.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {proximosFDS.map(({ data, nome }) => {
              const coachesEsc = coachesDaData(data)
              const disp = coachesNaoEscalados(data)
              const dataObj = new Date(data + 'T12:00:00')
              const diaNum = dataObj.getDate()
              const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })

              return (
                <div key={data} className="card">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-center flex-shrink-0 w-14">
                      <div className="text-2xl font-bold text-gray-800 leading-none">{diaNum}</div>
                      <div className="text-xs text-gray-400 uppercase mt-0.5">{mesNome}</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{nome}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {coachesEsc.length === 0
                          ? 'Nenhum coach escalado'
                          : `${coachesEsc.length} coach${coachesEsc.length > 1 ? 'es' : ''} · ${coachesEsc.length} vaga${coachesEsc.length > 1 ? 's' : ''}/horário`}
                      </div>
                    </div>
                  </div>

                  {coachesEsc.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {coachesEsc.map(e => (
                        <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                          <span className="text-gray-800 flex items-center gap-2">
                            {nomeCoach(e.coach_id)}
                            {estaDeFerias(coachIdReal(e.coach_id), e.data) && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#ea580c', background: '#ffedd5', borderRadius: 6, padding: '1px 6px' }}>de férias</span>
                            )}
                          </span>
                          <button onClick={() => removerCoachDaEscala(e.id)}
                            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {disp.length > 0 ? (
                    <button onClick={() => abrirModalAdicionar(data)}
                      style={{ width: '100%', background: 'transparent', border: `1.5px dashed ${VERDE}`, borderRadius: 8, padding: '0.5rem', color: VERDE, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                      + Adicionar coach
                    </button>
                  ) : (
                    <div className="text-center text-xs text-gray-400 py-2">
                      Todos os coaches escalados
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, color: '#1d4ed8' }}>
              💡 Datas marcadas como <strong>feriado ativo</strong> ignoram a grade fixa e usam só os coaches escalados aqui, com horários de FDS.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <button onClick={() => setModalNovoFeriado(true)}
              style={{ background: VERDE, color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.2rem', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              + Novo feriado
            </button>
          </div>

          {feriados.length === 0 ? (
            <div className="card text-center text-gray-400 py-8" style={{ borderStyle: 'dashed' }}>
              Nenhum feriado cadastrado para esta unidade.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {feriados.map(f => {
                const coachesEsc = coachesDaData(f.data)
                const disp = coachesNaoEscalados(f.data)
                const dataObj = new Date(f.data + 'T12:00:00')
                const diaNum = dataObj.getDate()
                const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })
                const diaSemNome = DIAS_SEMANA_LABEL[dataObj.getDay()]

                return (
                  <div key={f.id} className="card" style={f.ativo ? { borderColor: '#fed7aa' } : {}}>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="text-center flex-shrink-0 w-14">
                        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: f.ativo ? '#f97316' : '#9ca3af' }}>{diaNum}</div>
                        <div className="text-xs text-gray-400 uppercase mt-0.5">{mesNome}</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{f.descricao}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{diaSemNome}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: f.ativo ? '#ea580c' : '#9ca3af' }}>
                          {f.ativo ? '● Ativo' : '○ Inativo'}
                        </div>
                      </div>
                      <button onClick={() => removerFeriado(f.id)}
                        style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>
                        ×
                      </button>
                    </div>

                    <button onClick={() => toggleFeriadoAtivo(f.id, f.ativo)}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: `1px solid ${f.ativo ? '#fdba74' : '#e5e7eb'}`,
                        borderRadius: 8,
                        padding: '0.4rem',
                        color: f.ativo ? '#ea580c' : '#6b7280',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginBottom: 12,
                      }}>
                      {f.ativo ? 'Desativar feriado' : 'Ativar feriado'}
                    </button>

                    {coachesEsc.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {coachesEsc.map(e => (
                          <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                            <span className="text-gray-800 flex items-center gap-2">
                              {nomeCoach(e.coach_id)}
                              {estaDeFerias(coachIdReal(e.coach_id), e.data) && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#ea580c', background: '#ffedd5', borderRadius: 6, padding: '1px 6px' }}>de férias</span>
                              )}
                            </span>
                            <button onClick={() => removerCoachDaEscala(e.id)}
                              style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {coachesEsc.length === 0 && (
                      <div className="text-center text-xs text-gray-400 mb-2">
                        Nenhum coach escalado
                      </div>
                    )}

                    {disp.length > 0 && (
                      <button onClick={() => abrirModalAdicionar(f.data)}
                        style={{ width: '100%', background: 'transparent', border: `1.5px dashed ${VERDE}`, borderRadius: 8, padding: '0.5rem', color: VERDE, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                        + Adicionar coach
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Modal adicionar coach (MULTI-SELEÇÃO) */}
      {modalAdicionar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, padding: '1.5rem' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 4 }}>Adicionar coaches</h3>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 4, textTransform: 'capitalize' }}>
              {formatarDataPT(modalAdicionar.data)}
            </p>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
              Marque um ou mais coaches para escalar neste dia.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 320, overflowY: 'auto' }}>
              {coachesNaoEscalados(modalAdicionar.data)
                .map(c => ({ c, bloqueado: aba === 'fds' && semDisponibilidade(c.id, modalAdicionar.data) }))
                .sort((a, b) => Number(a.bloqueado) - Number(b.bloqueado))
                .map(({ c, bloqueado }) => {
                const selecionado = coachesSelecionados.has(c.user_id)
                return (
                  <label key={c.id}
                    title={bloqueado ? 'sem disponibilidade' : ''}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '0.6rem 1rem',
                      borderRadius: 8,
                      border: `1.5px solid ${selecionado ? VERDE : '#e5e7eb'}`,
                      background: selecionado ? VERDE_LIGHT : '#fff',
                      cursor: bloqueado ? 'not-allowed' : 'pointer',
                      opacity: bloqueado ? 0.45 : 1,
                    }}>
                    <input
                      type="checkbox"
                      checked={selecionado}
                      disabled={bloqueado}
                      onChange={() => toggleCoachSelecionado(c.user_id)}
                      style={{ width: 16, height: 16, accentColor: VERDE, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 14, color: '#1f2937', flex: 1 }}>{c.nome}</span>
                    {bloqueado && (
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>sem disponibilidade</span>
                    )}
                    {selecionado && (
                      <span style={{ fontSize: 12, color: VERDE, fontWeight: 600 }}>✓ Selecionado</span>
                    )}
                  </label>
                )
              })}
            </div>

            {coachesSelecionados.size > 0 && (
              <div style={{ background: VERDE_LIGHT, border: `1px solid ${VERDE}55`, borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 14, color: '#166534', marginBottom: 12 }}>
                {coachesSelecionados.size} coach{coachesSelecionados.size > 1 ? 'es' : ''} selecionado{coachesSelecionados.size > 1 ? 's' : ''}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setModalAdicionar(null); setCoachesSelecionados(new Set()) }}
                style={{ flex: 1, background: '#fff', border: '1px solid #e5e7eb', color: '#4b5563', borderRadius: 8, padding: '0.5rem', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={adicionarCoachesNaEscala} disabled={coachesSelecionados.size === 0 || salvandoCoach}
                style={{
                  flex: 2,
                  background: coachesSelecionados.size > 0 && !salvandoCoach ? VERDE : '#d1d5db',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.5rem',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: coachesSelecionados.size > 0 && !salvandoCoach ? 'pointer' : 'default',
                }}>
                {salvandoCoach
                  ? 'Salvando...'
                  : coachesSelecionados.size === 0
                    ? 'Adicionar'
                    : `Adicionar ${coachesSelecionados.size} coach${coachesSelecionados.size > 1 ? 'es' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal novo feriado */}
      {modalNovoFeriado && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, padding: '1.5rem' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 16 }}>Novo feriado</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#4b5563', marginBottom: 4, display: 'block' }}>Data</label>
              <input type="date" value={novoFeriadoData}
                onChange={e => setNovoFeriadoData(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 14, outline: 'none' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#4b5563', marginBottom: 4, display: 'block' }}>Descrição</label>
              <input type="text" value={novoFeriadoDescricao}
                onChange={e => setNovoFeriadoDescricao(e.target.value)}
                placeholder="Ex: Corpus Christi"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 14, outline: 'none' }} />
            </div>

            {erroFeriado && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 14, marginBottom: 12 }}>
                {erroFeriado}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setModalNovoFeriado(false); setNovoFeriadoData(''); setNovoFeriadoDescricao(''); setErroFeriado('') }}
                style={{ flex: 1, background: '#fff', border: '1px solid #e5e7eb', color: '#4b5563', borderRadius: 8, padding: '0.5rem', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={criarFeriado} disabled={salvandoFeriado}
                style={{ flex: 2, background: salvandoFeriado ? '#d1d5db' : VERDE, color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem', fontSize: 14, fontWeight: 600, cursor: salvandoFeriado ? 'default' : 'pointer' }}>
                {salvandoFeriado ? 'Salvando...' : 'Criar feriado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
