'use client'
// Playlists do dia do Club (Lift e Running). Substitui a planilha "Playlists 2026".
// Pensada pro celular (é onde o Ricardo usa): atalho pro dia de hoje no topo,
// próximos dias em cartões, e a tela do dia já abre com os campos da playlist.
import { useEffect, useMemo, useRef, useState } from 'react'
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

async function lerClipboard(): Promise<string | null> {
  try {
    const t = await navigator.clipboard.readText()
    return t ? t.trim() : null
  } catch {
    return null
  }
}

// Texto do "compartilhar" do SoundCloud:
//   "Just Club Sessions #36 by Just Club on #SoundCloud https://on.soundcloud.com/..."
// Separa link, título e artista. Sem o "on #SoundCloud", o texto todo é o nome.
function desmembrar(texto: string) {
  const link = texto.match(/https?:\/\/\S+/)?.[0] || null
  let resto = (link ? texto.replace(link, ' ') : texto).replace(/\s+/g, ' ').trim()
  const doSoundCloud = /\s*on #?SoundCloud\s*$/i.test(resto)
  resto = resto.replace(/\s*on #?SoundCloud\s*$/i, '').trim()
  const m = doSoundCloud ? /^(.*)\s+by\s+(.+)$/i.exec(resto) : null
  return { titulo: m ? m[1].trim() : resto, artista: m ? m[2].trim() : null, link }
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base md:text-sm bg-white'

export default function PlaylistsPage() {
  const [aba, setAba] = useState<'agenda' | 'ranking'>('agenda')

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Playlists do dia"
        subtitle="Uma de Lift e uma de Running por dia, iguais nas duas unidades. Lift for Girls usa a do Lift."
      />

      <div className="flex gap-2 mb-4">
        {([['agenda', 'Agenda'], ['ranking', 'Ranking']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-medium ${
              aba === k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'agenda' ? <Agenda /> : <Ranking />}

      <PinCard />
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
    <div className="card mt-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">PIN dos coaches</div>
          <div className="flex gap-2">
            <input
              value={pin}
              onChange={e => { setPin(e.target.value); setStatus('') }}
              inputMode="numeric"
              className="border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm w-32"
            />
            <button
              onClick={salvar}
              disabled={pin.trim() === (salvo || '')}
              className="px-4 py-2 rounded-lg text-sm bg-gray-900 text-white disabled:opacity-40"
            >
              Salvar
            </button>
          </div>
        </div>
        <div className="text-sm min-w-0">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Link para os coaches</div>
          <a href="/playlist" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline break-all">
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
  // Próximos dias começam amanhã; setas andam de 7 em 7
  const [inicio, setInicio] = useState(addDias(hoje, 1))
  const fim = addDias(inicio, 6)
  const [itens, setItens] = useState<DiaItem[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<{ data: string; modalidade: Modalidade } | null>(null)

  async function carregar() {
    setErro(null)
    const de = inicio < hoje ? inicio : hoje
    const ate = fim > hoje ? fim : hoje
    const [{ data, error }, al] = await Promise.all([
      supabase
        .from('playlist_dia')
        .select('data, modalidade, playlist_id, observacao, origem, playlists(nome, link)')
        .gte('data', de)
        .lte('data', ate),
      // Alerta só faz sentido de hoje em diante: o passado já tocou
      supabase.rpc('playlist_alertas', { p_inicio: hoje, p_fim: ate }),
    ])
    if (error) setErro(error.message)
    else if (al.error) setErro(al.error.message)
    setItens((data || []) as any)
    setAlertas((al.data || []) as Alerta[])
    setLoading(false)
  }

  useEffect(() => { setLoading(true); carregar() }, [inicio])

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDias(inicio, i)), [inicio])
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

  const fHoje = fmtDia(hoje)
  const fIni = fmtDia(inicio)
  const fFim = fmtDia(fim)

  if (loading) return <Spinner />

  return (
    <>
      {erro && <Insight variant="red">Erro ao carregar: {erro}</Insight>}

      {/* Atalho: hoje */}
      <div className="card mb-5">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
          Hoje · <span className="capitalize">{fHoje.sem}</span> {fHoje.dm}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {MODS.map(m => (
            <Slot
              key={m.key}
              grande
              label={m.label}
              item={porChave.get(`${hoje}|${m.key}`)}
              alerta={alertaPorChave.get(`${hoje}|${m.key}`)}
              onClick={() => setEditando({ data: hoje, modalidade: m.key })}
            />
          ))}
        </div>
      </div>

      {/* Próximos dias */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setInicio(addDias(inicio, -7))} className="w-10 h-10 rounded-lg border border-gray-200 bg-white text-lg">‹</button>
        <div className="text-center">
          <div className="text-sm font-medium text-gray-900">{fIni.dm} – {fFim.dm}</div>
          {inicio !== addDias(hoje, 1) && (
            <button onClick={() => setInicio(addDias(hoje, 1))} className="text-xs text-primary-600">voltar para os próximos dias</button>
          )}
        </div>
        <button onClick={() => setInicio(addDias(inicio, 7))} className="w-10 h-10 rounded-lg border border-gray-200 bg-white text-lg">›</button>
      </div>

      <div className="space-y-2">
        {dias.map(d => {
          const f = fmtDia(d)
          return (
            <div key={d} className={`card !p-3 ${d === hoje ? 'ring-1 ring-primary-200' : ''}`}>
              <div className="text-sm font-medium text-gray-900 mb-1.5">
                <span className="capitalize">{f.sem}</span> {f.dm}{d === hoje ? ' · hoje' : ''}
              </div>
              <div className="grid gap-1.5 md:grid-cols-2">
                {MODS.map(m => (
                  <Slot
                    key={m.key}
                    label={m.label}
                    item={porChave.get(`${d}|${m.key}`)}
                    alerta={d >= hoje ? alertaPorChave.get(`${d}|${m.key}`) : undefined}
                    onClick={() => setEditando({ data: d, modalidade: m.key })}
                  />
                ))}
              </div>
            </div>
          )
        })}
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

function Slot({ label, item, alerta, onClick, grande }: {
  label: string
  item?: DiaItem
  alerta?: Alerta
  onClick: () => void
  grande?: boolean
}) {
  const pct = alerta ? pctDe(alerta.publico, alerta.ouviram) : null
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border border-gray-100 bg-gray-50/60 active:bg-gray-100 flex items-center gap-3 ${grande ? 'px-3 py-3' : 'px-3 py-2'}`}
    >
      <div className="w-16 shrink-0 text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="flex-1 min-w-0">
        {item ? (
          <>
            <div className={`text-gray-900 ${grande ? 'text-base' : 'text-sm'} line-clamp-2`}>{item.playlists?.nome}</div>
            {item.observacao && <div className="text-xs text-amber-700">{item.observacao}</div>}
            {alerta && alerta.publico > 0 && (
              <div className="mt-0.5">
                {pct! > LIMITE_PCT ? (
                  <Badge variant="red">{pct}% já ouviram ({alerta.ouviram}/{alerta.publico})</Badge>
                ) : (
                  <span className="text-xs text-gray-400">{pct}% já ouviram ({alerta.ouviram}/{alerta.publico})</span>
                )}
              </div>
            )}
          </>
        ) : (
          <span className={`text-gray-400 ${grande ? 'text-base' : 'text-sm'}`}>+ definir</span>
        )}
      </div>
      <span className="text-gray-300 text-lg">›</span>
    </button>
  )
}

// Tela do dia: em cima os campos (playlist, link, observação) e o Sugerir;
// embaixo a lista de todas as playlists. Salvar cria a playlist se o nome é novo.
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
  // Nome e link num campo só (cola o texto do compartilhar do SoundCloud)
  const [texto, setTexto] = useState(
    atual?.playlists ? [atual.playlists.nome, atual.playlists.link].filter(Boolean).join('\n') : ''
  )
  const [obs, setObs] = useState(atual?.observacao || '')
  const [salvando, setSalvando] = useState(false)
  const [posSugestao, setPosSugestao] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.rpc('playlists_estatisticas', { p_data: data, p_modalidade: modalidade }).then(({ data: rows, error }) => {
      if (error) setErro(error.message)
      setStats((rows || []) as Stat[])
      setLoading(false)
    })
    // Trava o fundo enquanto a tela está aberta (no celular o fundo rolava junto)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [])

  const vezesMod = (s: Stat) => (modalidade === 'lift' ? s.vezes_lift : s.vezes_running)

  // Ordem = ordem da sugestão: primeiro as que já tocaram nessa modalidade; depois
  // menos gente que já ouviu na última semana; depois melhor nota de música.
  const ordenar = (a: Stat, b: Stat) =>
    (vezesMod(b) > 0 ? 1 : 0) - (vezesMod(a) > 0 ? 1 : 0) ||
    (a.pct ?? 0) - (b.pct ?? 0) ||
    (b.nota_media ?? 0) - (a.nota_media ?? 0) ||
    b.qtd_notas - a.qtd_notas

  // A planilha gravava "título artista"; o SoundCloud manda "título by artista".
  // Procura a playlist nos dois formatos; nova ganha "título artista" (sem repetir
  // o artista quando ele já está no título, ex.: Just Club Sessions #36).
  const partes = desmembrar(texto)
  const candidatos = partes.artista
    ? [`${partes.titulo} ${partes.artista}`, partes.titulo, `${partes.titulo} by ${partes.artista}`]
    : [partes.titulo]
  const sel = candidatos
    .map(c => stats.find(s => s.nome.toLowerCase() === c.toLowerCase()))
    .find(Boolean) || null
  const nomeLimpo = sel
    ? sel.nome
    : partes.artista && !partes.titulo.toLowerCase().includes(partes.artista.toLowerCase())
      ? `${partes.titulo} ${partes.artista}`
      : partes.titulo
  // Sem link no texto, mantém o que a playlist já tem
  const linkFinal = partes.link || sel?.link || null

  // Digitando um nome que ainda não existe, a lista filtra; com uma escolhida, mostra tudo
  const lista = useMemo(() => {
    const q = !sel ? partes.titulo.toLowerCase() : ''
    return stats
      .filter(s => (s.ativo || s.playlist_id === sel?.playlist_id) && (!q || s.nome.toLowerCase().includes(q)))
      .sort(ordenar)
  }, [stats, texto, sel])

  // Sugestão do admin: qualquer dia da semana, só da mesma modalidade. Cada toque vai pra próxima.
  const sugestoes = useMemo(() => stats.filter(s => s.ativo && vezesMod(s) > 0).sort(ordenar), [stats])
  const selEhSugestao = posSugestao >= 0 && sugestoes[posSugestao]?.playlist_id === sel?.playlist_id

  function escolher(s: Stat) {
    setTexto([s.nome, s.link].filter(Boolean).join('\n'))
    setErro(null)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function sugerir() {
    if (!sugestoes.length) return
    const pos = (posSugestao + 1) % sugestoes.length
    setPosSugestao(pos)
    escolher(sugestoes[pos])
  }

  async function colar() {
    const t = await lerClipboard()
    if (t) { setTexto(t); setPosSugestao(-1); setErro(null) }
    else setErro('Não foi possível colar. Toque e segure no campo para colar.')
  }

  async function salvar() {
    // Campo vazio = deixar o dia em branco de novo (ex.: desfazer a sugestão que o
    // coach gerou). Apaga mesmo sem "atual": a sugestão pode ter sido gerada depois
    // que a agenda carregou.
    if (!nomeLimpo) { await remover(); return }
    setSalvando(true)
    setErro(null)
    const novoLink = linkFinal
    let playlistId = sel?.playlist_id

    if (!sel) {
      const { data: nova, error } = await supabase
        .from('playlists').insert({ nome: nomeLimpo, link: novoLink }).select('id').single()
      if (error || !nova) {
        setSalvando(false)
        setErro((error as any)?.code === '23505' ? 'Já existe uma playlist com esse nome' : 'Não foi possível criar a playlist' + (error ? `: ${error.message}` : ''))
        return
      }
      playlistId = nova.id
    } else if (novoLink !== (sel.link || null)) {
      const { data: upd, error } = await supabase
        .from('playlists').update({ link: novoLink }).eq('id', sel.playlist_id).select('id')
      // RLS barrando o update não devolve erro, só 0 linhas
      if (error || !upd?.length) {
        setSalvando(false)
        setErro('Não foi possível salvar o link' + (error ? `: ${error.message}` : ''))
        return
      }
    }

    const { error } = await supabase.from('playlist_dia').upsert(
      { data, modalidade, playlist_id: playlistId, observacao: obs.trim() || null, origem: 'admin' },
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

  const f = fmtDia(data)
  const label = MODS.find(m => m.key === modalidade)!.label
  const publico = stats[0]?.publico

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 md:flex md:items-center md:justify-center md:p-4" onClick={onClose}>
      <div
        className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900">
              {label} · <span className="capitalize">{f.sem}</span> {f.dm}
            </div>
            {publico != null && (
              <div className="text-xs text-gray-400">{publico} reservados no {label} até agora</div>
            )}
          </div>
          <button onClick={onClose} className="w-10 h-10 -mr-2 text-gray-400 text-2xl leading-none">×</button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-3 border-b border-gray-100">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Playlist (nome e link)</label>
              <div className="flex gap-2 items-stretch">
                <textarea
                  value={texto}
                  onChange={e => { setTexto(e.target.value); setPosSugestao(-1) }}
                  rows={3}
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="Cole aqui o texto do SoundCloud ou digite o nome"
                  className={`${inputCls} resize-none`}
                />
                <button onClick={colar} className="shrink-0 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium">
                  Colar
                </button>
              </div>
              {nomeLimpo && (
                <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs space-y-0.5">
                  <div className="text-gray-900"><span className="text-gray-400">Nome:</span> {nomeLimpo}</div>
                  <div className="text-gray-900 truncate">
                    <span className="text-gray-400">Link:</span> {linkFinal || <span className="text-gray-400">sem link</span>}
                  </div>
                  {sel ? (
                    <div className="text-gray-400">
                      Já cadastrada · {sel.pct ?? 0}% já ouviram · {vezesMod(sel)}x no {label}
                      {sel.qtd_notas ? ` · nota ${Number(sel.nota_media).toFixed(2)} (${sel.qtd_notas})` : ''}
                      {selEhSugestao ? ` · sugestão ${posSugestao + 1} de ${sugestoes.length}` : ''}
                    </div>
                  ) : (
                    <div className="text-primary-700">Nova playlist: será criada ao salvar</div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Observação</label>
              <input
                value={obs}
                onChange={e => setObs(e.target.value)}
                placeholder="ex.: iniciar em 02:25"
                className={inputCls}
              />
            </div>

            <button
              onClick={sugerir}
              disabled={loading || !sugestoes.length}
              className="w-full py-2.5 rounded-lg border border-gray-900 text-gray-900 text-sm font-medium disabled:opacity-40"
            >
              {posSugestao < 0 ? 'Sugerir' : 'Próxima sugestão'}
            </button>

            {sel && sel.publico != null && sel.publico > 0 && (sel.pct ?? 0) > LIMITE_PCT && (
              <Insight variant="red">
                {sel.ouviram} dos {sel.publico} reservados ({sel.pct}%) já fizeram aula com essa playlist nos 7 dias anteriores.
              </Insight>
            )}
            {sel && sel.notas_baixas > 0 && (
              <Insight variant="amber">
                {sel.notas_baixas} {sel.notas_baixas === 1 ? 'nota' : 'notas'} de música 3 ou menos nos dias em que tocou.
              </Insight>
            )}
          </div>

          <div className="px-4 pt-3 pb-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              {sel || !nomeLimpo ? 'Todas as playlists' : 'Playlists com esse nome'}
            </div>
            {loading ? <Spinner /> : (
              <div className="divide-y divide-gray-50">
                {lista.map(s => {
                  const ativo = s.playlist_id === sel?.playlist_id
                  return (
                    <button
                      key={s.playlist_id}
                      onClick={() => escolher(s)}
                      className={`w-full text-left py-2.5 px-2 rounded-lg ${ativo ? 'bg-primary-50' : 'active:bg-gray-50'}`}
                    >
                      <div className="text-sm text-gray-900">{s.nome}</div>
                      <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                        {s.publico ? (
                          (s.pct ?? 0) > LIMITE_PCT
                            ? <Badge variant="red">{s.pct}% já ouviram</Badge>
                            : <span>{s.pct}% já ouviram</span>
                        ) : null}
                        <span>{vezesMod(s)}x no {label}</span>
                        <span>última {fmtData(s.ultima_vez)}</span>
                        {s.qtd_notas ? <span>nota {Number(s.nota_media).toFixed(2)} ({s.qtd_notas})</span> : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {!loading && lista.length === 0 && <EmptyState message="Nenhuma playlist com esse nome." />}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-100 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {erro && <Insight variant="red">{erro}</Insight>}
          <div className="flex gap-2">
            {atual && (
              <button onClick={remover} disabled={salvando} className="px-4 py-3 rounded-lg text-sm border border-gray-200 text-red-600 bg-white">
                Remover
              </button>
            )}
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex-1 py-3 rounded-lg text-base font-medium bg-gray-900 text-white disabled:opacity-40"
            >
              {salvando ? 'Salvando…' : nomeLimpo ? 'Salvar' : 'Salvar em branco'}
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
  // Playlists que um coach marcou como "não abriu no app"
  const [erros, setErros] = useState<Map<string, string>>(new Map())

  async function carregar() {
    const [{ data, error }, { data: comErro }] = await Promise.all([
      supabase.rpc('playlists_estatisticas', {}),
      supabase.from('playlists').select('id, erro_em').not('erro_em', 'is', null),
    ])
    if (error) setErro(error.message)
    setStats((data || []) as Stat[])
    setErros(new Map((comErro || []).map((p: any) => [p.id, p.erro_em])))
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
        <div className="flex flex-col md:flex-row gap-2 mb-3">
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar playlist"
            className={inputCls}
          />
          <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} className="border border-gray-200 rounded-lg px-3 py-2.5 text-base md:text-sm bg-white">
            <option value="baixas">Mais notas baixas</option>
            <option value="media">Menor nota média</option>
            <option value="vezes">Mais tocadas</option>
            <option value="ultima">Tocou há mais tempo</option>
          </select>
        </div>

        <div className="divide-y divide-gray-50">
          {lista.map(s => (
            <button
              key={s.playlist_id}
              onClick={() => setEditando(s)}
              className={`w-full text-left py-2.5 px-1 active:bg-gray-50 ${s.ativo ? '' : 'opacity-50'}`}
            >
              <div className="text-sm text-gray-900">
                {s.nome}
                {!s.ativo && (
                  erros.has(s.playlist_id)
                    ? <span className="text-xs text-red-600"> · não abriu no app ({new Date(erros.get(s.playlist_id)!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})</span>
                    : <span className="text-xs text-gray-400"> · inativa</span>
                )}
                {s.link && <span className="text-xs text-primary-600"> · com link</span>}
              </div>
              <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                <span>Lift {s.vezes_lift}x</span>
                <span>Running {s.vezes_running}x</span>
                <span>última {fmtData(s.ultima_vez)}</span>
                {s.qtd_notas ? <span>nota {Number(s.nota_media).toFixed(2)} ({s.qtd_notas})</span> : <span>sem nota</span>}
                {s.notas_baixas ? <Badge variant="amber">{s.notas_baixas} notas ≤ 3</Badge> : null}
              </div>
            </button>
          ))}
        </div>
        {lista.length === 0 && <EmptyState message="Nenhuma playlist encontrada." />}
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

  async function colar() {
    const t = await lerClipboard()
    if (t) setLink(t)
    else setErro('Não foi possível colar. Toque e segure no campo Link para colar.')
  }

  async function salvar() {
    if (!nome.trim()) return
    const { data: upd, error } = await supabase
      .from('playlists')
      // Reativar limpa a marca de "não abriu no app"
      .update({ nome: nome.trim(), link: link.trim() || null, ativo, ...(ativo ? { erro_em: null } : {}) })
      .eq('id', playlist.playlist_id)
      .select('id')
    if (error) {
      setErro((error as any).code === '23505' ? 'Já existe uma playlist com esse nome' : error.message)
      return
    }
    // RLS barrando o update não devolve erro, só 0 linhas
    if (!upd?.length) { setErro('Não foi possível salvar'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
      <div
        className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-xl p-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-semibold text-gray-900">Editar playlist</div>
          <button onClick={onClose} className="w-10 h-10 -mr-2 text-gray-400 text-2xl leading-none">×</button>
        </div>
        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} className={`${inputCls} mb-3`} />
        <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">Link</label>
        <div className="flex gap-2 mb-3">
          <input
            value={link}
            onChange={e => setLink(e.target.value)}
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="https://…"
            className={inputCls}
          />
          <button onClick={colar} className="shrink-0 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium">Colar</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-1">
          <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="w-5 h-5" />
          Ativa
        </label>
        <div className="text-xs text-gray-400 mb-4">Inativa não aparece na escolha nem entra no sorteio da sugestão do dia.</div>
        {erro && <Insight variant="red">{erro}</Insight>}
        <button onClick={salvar} className="w-full py-3 rounded-lg text-base font-medium bg-gray-900 text-white">Salvar</button>
      </div>
    </div>
  )
}
