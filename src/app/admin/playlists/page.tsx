'use client'
// Playlists do dia do Club (Lift e Running). Substitui a planilha "Playlists 2026".
// Agenda: escolher a playlist de cada dia, com alerta de quantos reservados já
// ouviram na última semana. Ranking: histórico e nota de música por playlist.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, Badge, Insight, EmptyState } from '@/components/ui'
import { hojeSP } from '@/lib/tempo'

type Modalidade = 'lift' | 'running'
type DiaItem = {
  data: string
  modalidade: Modalidade
  playlist_id: string
  observacao: string | null
  origem: string
  playlists: { nome: string; link: string | null } | null
}
type Stat = {
  playlist_id: string
  nome: string
  link: string | null
  ativo: boolean
  vezes_lift: number
  vezes_running: number
  ultima_vez: string | null
  qtd_notas: number
  nota_media: number | null
  notas_baixas: number
  publico: number | null
  ouviram: number | null
  pct: number | null
}
type Alerta = { data: string; modalidade: Modalidade; publico: number; ouviram: number }

// Regra do Ricardo: alerta quando mais de 20% dos reservados ouviram nos últimos 7 dias.
const LIMITE_PCT = 20

const MODS: { key: Modalidade; label: string }[] = [
  { key: 'lift', label: 'Lift' },
  { key: 'running', label: 'Running' },
]

function addDias(data: string, n: number) {
  const [y, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function segundaDaSemana(data: string) {
  const [y, m, d] = data.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDias(data, dow === 0 ? -6 : 1 - dow)
}

function fmtDia(data: string) {
  const [y, m, d] = data.split('-').map(Number)
  const sem = new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .replace('.', '')
  return { sem, dm: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}` }
}

function fmtData(data: string | null) {
  if (!data) return '—'
  const [y, m, d] = data.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function pctDe(publico: number, ouviram: number) {
  return publico > 0 ? Math.round((100 * ouviram) / publico) : 0
}

export default function PlaylistsPage() {
  const [aba, setAba] = useState<'agenda' | 'ranking'>('agenda')

  return (
    <div>
      <PageHeader
        title="Playlists do dia"
        subtitle="Uma de Lift e uma de Running por dia, iguais nas duas unidades. Lift for Girls usa a do Lift."
      />

      <PinCard />

      <div className="flex gap-2 mb-4">
        {([['agenda', 'Agenda'], ['ranking', 'Ranking']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
              aba === k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'agenda' ? <Agenda /> : <Ranking />}
    </div>
  )
}

// ---- PIN dos coaches ---------------------------------------------------------

function PinCard() {
  const supabase = createClient()
  const [pin, setPin] = useState('')
  const [salvo, setSalvo] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [origem, setOrigem] = useState('')

  useEffect(() => {
    setOrigem(window.location.origin)
    supabase.from('playlist_config').select('pin').eq('id', 1).maybeSingle().then(({ data }) => {
      setSalvo(data?.pin || null)
      setPin(data?.pin || '')
    })
  }, [])

  async function salvar() {
    const novo = pin.trim()
    if (!/^\d{4,8}$/.test(novo)) { setStatus('Use de 4 a 8 números'); return }
    const { error } = await supabase
      .from('playlist_config')
      .upsert({ id: 1, pin: novo, atualizado_em: new Date().toISOString() })
    if (error) { setStatus('Erro ao salvar: ' + error.message); return }
    setSalvo(novo)
    setStatus('PIN salvo')
  }

  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">PIN dos coaches</div>
          <div className="flex gap-2">
            <input
              value={pin}
              onChange={e => { setPin(e.target.value); setStatus('') }}
              inputMode="numeric"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-32"
            />
            <button
              onClick={salvar}
              disabled={pin.trim() === (salvo || '')}
              className="px-3 py-1.5 rounded-lg text-sm bg-gray-900 text-white disabled:opacity-40"
            >
              Salvar
            </button>
          </div>
        </div>
        <div className="text-sm">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Link para os coaches</div>
          <a href="/playlist" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
            {origem}/playlist
          </a>
        </div>
        {status && <div className="text-sm text-gray-500">{status}</div>}
      </div>
      {salvo === null && (
        <div className="text-xs text-amber-700 mt-2">Sem PIN definido: os coaches ainda não conseguem abrir a página.</div>
      )}
    </div>
  )
}

// ---- Agenda ------------------------------------------------------------------

function Agenda() {
  const supabase = createClient()
  const hoje = hojeSP()
  const [inicio, setInicio] = useState(segundaDaSemana(hoje))
  const fim = addDias(inicio, 13)
  const [itens, setItens] = useState<DiaItem[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<{ data: string; modalidade: Modalidade } | null>(null)

  async function carregar() {
    setErro(null)
    const [{ data, error }, al] = await Promise.all([
      supabase
        .from('playlist_dia')
        .select('data, modalidade, playlist_id, observacao, origem, playlists(nome, link)')
        .gte('data', inicio)
        .lte('data', fim),
      // Alerta só faz sentido de hoje em diante: o passado já tocou
      fim >= hoje
        ? supabase.rpc('playlist_alertas', { p_inicio: inicio > hoje ? inicio : hoje, p_fim: fim })
        : Promise.resolve({ data: [], error: null } as any),
    ])
    if (error) setErro(error.message)
    else if (al.error) setErro(al.error.message)
    setItens((data || []) as any)
    setAlertas((al.data || []) as Alerta[])
    setLoading(false)
  }

  useEffect(() => { setLoading(true); carregar() }, [inicio])

  const dias = useMemo(() => Array.from({ length: 14 }, (_, i) => addDias(inicio, i)), [inicio])
  const porChave = useMemo(() => {
    const m = new Map<string, DiaItem>()
    itens.forEach(i => m.set(`${i.data}|${i.modalidade}`, i))
    return m
  }, [itens])
  const alertaPorChave = useMemo(() => {
    const m = new Map<string, Alerta>()
    alertas.forEach(a => m.set(`${a.data}|${a.modalidade}`, a))
    return m
  }, [alertas])

  return (
    <>
      {erro && <Insight variant="red">Erro ao carregar: {erro}</Insight>}

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            <button onClick={() => setInicio(addDias(inicio, -7))} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white">
              ← Semana anterior
            </button>
            <button onClick={() => setInicio(segundaDaSemana(hoje))} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white">
              Hoje
            </button>
            <button onClick={() => setInicio(addDias(inicio, 7))} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white">
              Próxima semana →
            </button>
          </div>
          <div className="text-xs text-gray-400">
            % = reservados do dia que já fizeram aula com a playlist nos 7 dias anteriores
          </div>
        </div>

        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left pb-3 pr-2 w-24">Dia</th>
                  {MODS.map(m => <th key={m.key} className="text-left pb-3 pr-2">{m.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dias.map((d, idx) => {
                  const f = fmtDia(d)
                  return (
                    <tr key={d} className={`${d === hoje ? 'bg-primary-50/40' : ''} ${idx === 7 ? 'border-t-2 border-gray-200' : ''}`}>
                      <td className="py-2 pr-2 align-top">
                        <div className="font-medium text-gray-900">{f.dm}</div>
                        <div className="text-xs text-gray-400 capitalize">{f.sem}{d === hoje ? ' · hoje' : ''}</div>
                      </td>
                      {MODS.map(m => {
                        const k = `${d}|${m.key}`
                        const it = porChave.get(k)
                        const al = alertaPorChave.get(k)
                        const pct = al ? pctDe(al.publico, al.ouviram) : null
                        return (
                          <td key={m.key} className="py-2 pr-2 align-top">
                            <button
                              onClick={() => setEditando({ data: d, modalidade: m.key })}
                              className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-gray-50"
                            >
                              {it ? (
                                <>
                                  <div className="text-gray-900 line-clamp-2">{it.playlists?.nome}</div>
                                  {it.observacao && <div className="text-xs text-amber-700">{it.observacao}</div>}
                                  {al && al.publico > 0 && (
                                    <div className="mt-1">
                                      {pct! > LIMITE_PCT ? (
                                        <Badge variant="red">{pct}% já ouviram ({al.ouviram}/{al.publico})</Badge>
                                      ) : (
                                        <span className="text-xs text-gray-400">{pct}% já ouviram ({al.ouviram}/{al.publico})</span>
                                      )}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-gray-300">+ definir</span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <EditarDia
          data={editando.data}
          modalidade={editando.modalidade}
          atual={porChave.get(`${editando.data}|${editando.modalidade}`) || null}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); carregar() }}
        />
      )}
    </>
  )
}

function EditarDia({ data, modalidade, atual, onClose, onSaved }: {
  data: string
  modalidade: Modalidade
  atual: DiaItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [stats, setStats] = useState<Stat[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [selId, setSelId] = useState<string | null>(atual?.playlist_id || null)
  const [obs, setObs] = useState(atual?.observacao || '')
  const [salvando, setSalvando] = useState(false)
  const [novaAberta, setNovaAberta] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoLink, setNovoLink] = useState('')

  async function carregar() {
    const { data: rows, error } = await supabase.rpc('playlists_estatisticas', { p_data: data, p_modalidade: modalidade })
    if (error) setErro(error.message)
    setStats((rows || []) as Stat[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const vezesMod = (s: Stat) => (modalidade === 'lift' ? s.vezes_lift : s.vezes_running)

  // Primeiro as que já tocaram nessa modalidade; depois menor % e a que tocou há mais tempo
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return stats
      .filter(s => (s.ativo || s.playlist_id === selId) && (!q || s.nome.toLowerCase().includes(q)))
      .sort((a, b) =>
        (vezesMod(b) > 0 ? 1 : 0) - (vezesMod(a) > 0 ? 1 : 0) ||
        (a.pct ?? 0) - (b.pct ?? 0) ||
        (a.ultima_vez || '').localeCompare(b.ultima_vez || '')
      )
  }, [stats, busca, selId])

  const sel = stats.find(s => s.playlist_id === selId) || null
  const f = fmtDia(data)
  const label = MODS.find(m => m.key === modalidade)!.label

  async function salvar() {
    if (!selId) return
    setSalvando(true)
    const { error } = await supabase.from('playlist_dia').upsert(
      { data, modalidade, playlist_id: selId, observacao: obs.trim() || null, origem: 'admin' },
      { onConflict: 'data,modalidade' }
    )
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSaved()
  }

  async function remover() {
    setSalvando(true)
    const { error } = await supabase.from('playlist_dia').delete().eq('data', data).eq('modalidade', modalidade)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSaved()
  }

  async function criar() {
    const nome = novoNome.trim()
    if (!nome) return
    const { data: nova, error } = await supabase
      .from('playlists')
      .insert({ nome, link: novoLink.trim() || null })
      .select('id')
      .single()
    if (error) {
      setErro((error as any).code === '23505' ? 'Já existe uma playlist com esse nome' : error.message)
      return
    }
    setNovaAberta(false)
    setNovoNome('')
    setNovoLink('')
    await carregar()
    setSelId(nova.id)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">{label} · <span className="capitalize">{f.sem}</span> {f.dm}</div>
            {sel?.publico != null && (
              <div className="text-xs text-gray-400">{sel.publico} clientes reservados no {label} nesse dia até agora</div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-3 flex gap-2 border-b border-gray-100">
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar playlist"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
          <button onClick={() => setNovaAberta(v => !v)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white">
            + Nova playlist
          </button>
        </div>

        {novaAberta && (
          <div className="px-5 py-3 flex gap-2 border-b border-gray-100 bg-gray-50">
            <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome" className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <input value={novoLink} onChange={e => setNovoLink(e.target.value)} placeholder="Link (opcional)" className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={criar} className="px-3 py-1.5 rounded-lg text-sm bg-gray-900 text-white">Criar</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5">
          {loading ? <Spinner /> : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left py-2 pr-2">Playlist</th>
                  <th className="text-right py-2 pr-2">Já ouviram</th>
                  <th className="text-right py-2 pr-2">Vezes {label}</th>
                  <th className="text-right py-2 pr-2">Última vez</th>
                  <th className="text-right py-2">Nota música</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(s => {
                  const ativo = s.playlist_id === selId
                  return (
                    <tr
                      key={s.playlist_id}
                      onClick={() => setSelId(s.playlist_id)}
                      className={`cursor-pointer ${ativo ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="py-2 pr-2 text-gray-900">{s.nome}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        {s.publico ? (
                          (s.pct ?? 0) > LIMITE_PCT
                            ? <Badge variant="red">{s.pct}%</Badge>
                            : <span className="text-gray-600">{s.pct}%</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 pr-2 text-right text-gray-600">{vezesMod(s)}</td>
                      <td className="py-2 pr-2 text-right text-gray-600 whitespace-nowrap">{fmtData(s.ultima_vez)}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {s.qtd_notas ? (
                          <span className="text-gray-600">
                            {Number(s.nota_media).toFixed(2)}
                            <span className="text-xs text-gray-400"> ({s.qtd_notas})</span>
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {!loading && lista.length === 0 && <EmptyState message="Nenhuma playlist encontrada." />}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          {erro && <Insight variant="red">{erro}</Insight>}
          {sel && sel.publico != null && sel.publico > 0 && (sel.pct ?? 0) > LIMITE_PCT && (
            <Insight variant="red">
              {sel.ouviram} dos {sel.publico} clientes reservados ({sel.pct}%) já fizeram aula com essa playlist nos 7 dias anteriores.
            </Insight>
          )}
          {sel && sel.notas_baixas > 0 && (
            <Insight variant="amber">
              {sel.notas_baixas} {sel.notas_baixas === 1 ? 'nota' : 'notas'} de música 3 ou menos nos dias em que tocou.
            </Insight>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1 text-sm text-gray-900 truncate">
              {sel ? sel.nome : <span className="text-gray-400">Selecione uma playlist</span>}
            </div>
            <input
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Observação (ex.: iniciar em 02:25)"
              className="w-64 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
            {atual && (
              <button onClick={remover} disabled={salvando} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 text-red-600 bg-white">
                Remover
              </button>
            )}
            <button onClick={salvar} disabled={!selId || salvando} className="px-4 py-1.5 rounded-lg text-sm bg-gray-900 text-white disabled:opacity-40">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Ranking -----------------------------------------------------------------

type Ordem = 'baixas' | 'media' | 'vezes' | 'ultima'

function Ranking() {
  const supabase = createClient()
  const [stats, setStats] = useState<Stat[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<Ordem>('baixas')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Stat | null>(null)

  async function carregar() {
    const { data, error } = await supabase.rpc('playlists_estatisticas', {})
    if (error) setErro(error.message)
    setStats((data || []) as Stat[])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const l = stats.filter(s => !q || s.nome.toLowerCase().includes(q))
    const cmp: Record<Ordem, (a: Stat, b: Stat) => number> = {
      baixas: (a, b) => b.notas_baixas - a.notas_baixas || (a.nota_media ?? 9) - (b.nota_media ?? 9),
      media: (a, b) => (a.nota_media ?? 9) - (b.nota_media ?? 9),
      vezes: (a, b) => (b.vezes_lift + b.vezes_running) - (a.vezes_lift + a.vezes_running),
      ultima: (a, b) => (a.ultima_vez || '').localeCompare(b.ultima_vez || ''),
    }
    return l.sort(cmp[ordem])
  }, [stats, ordem, busca])

  if (loading) return <Spinner />

  return (
    <>
      {erro && <Insight variant="red">Erro ao carregar: {erro}</Insight>}
      <Insight variant="amber">
        A nota de música vem da avaliação das aulas do Club no dia e modalidade em que a playlist tocou.
        As avaliações começaram em 30/05/2026.
      </Insight>

      <div className="card">
        <div className="flex gap-2 mb-3">
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar playlist"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
          <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="baixas">Mais notas baixas</option>
            <option value="media">Menor nota média</option>
            <option value="vezes">Mais tocadas</option>
            <option value="ultima">Tocou há mais tempo</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-3 pr-2">Playlist</th>
                <th className="text-right pb-3 pr-2">Lift</th>
                <th className="text-right pb-3 pr-2">Running</th>
                <th className="text-right pb-3 pr-2">Última vez</th>
                <th className="text-right pb-3 pr-2">Nota média</th>
                <th className="text-right pb-3 pr-2">Notas ≤ 3</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map(s => (
                <tr key={s.playlist_id} className={s.ativo ? '' : 'opacity-50'}>
                  <td className="py-2 pr-2">
                    <div className="text-gray-900">{s.nome}</div>
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline">abrir</a>
                    )}
                    {!s.ativo && <span className="text-xs text-gray-400"> · inativa</span>}
                  </td>
                  <td className="py-2 pr-2 text-right text-gray-600">{s.vezes_lift || '—'}</td>
                  <td className="py-2 pr-2 text-right text-gray-600">{s.vezes_running || '—'}</td>
                  <td className="py-2 pr-2 text-right text-gray-600 whitespace-nowrap">{fmtData(s.ultima_vez)}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">
                    {s.qtd_notas ? (
                      <span className="text-gray-700">
                        {Number(s.nota_media).toFixed(2)}
                        <span className="text-xs text-gray-400"> ({s.qtd_notas})</span>
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 pr-2 text-right">
                    {s.notas_baixas ? <Badge variant="amber">{s.notas_baixas}</Badge> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => setEditando(s)} className="text-xs text-primary-600 hover:underline">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length === 0 && <EmptyState message="Nenhuma playlist encontrada." />}
        </div>
      </div>

      {editando && (
        <EditarPlaylist
          playlist={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); carregar() }}
        />
      )}
    </>
  )
}

function EditarPlaylist({ playlist, onClose, onSaved }: { playlist: Stat; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [nome, setNome] = useState(playlist.nome)
  const [link, setLink] = useState(playlist.link || '')
  const [ativo, setAtivo] = useState(playlist.ativo)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    if (!nome.trim()) return
    const { error } = await supabase
      .from('playlists')
      .update({ nome: nome.trim(), link: link.trim() || null, ativo })
      .eq('id', playlist.playlist_id)
    if (error) {
      setErro((error as any).code === '23505' ? 'Já existe uma playlist com esse nome' : error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="text-base font-semibold text-gray-900 mb-4">Editar playlist</div>
        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm mb-3" />
        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Link</label>
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://soundcloud.com/…" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm mb-3" />
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-1">
          <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
          Ativa
        </label>
        <div className="text-xs text-gray-400 mb-4">Inativa não aparece na escolha nem entra no sorteio da sugestão do dia.</div>
        {erro && <Insight variant="red">{erro}</Insight>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white">Cancelar</button>
          <button onClick={salvar} className="px-4 py-1.5 rounded-lg text-sm bg-gray-900 text-white">Salvar</button>
        </div>
      </div>
    </div>
  )
}
