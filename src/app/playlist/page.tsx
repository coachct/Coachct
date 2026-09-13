'use client'
// Página dos coaches do Club: playlist de hoje (Lift e Running), entrada por PIN.
// Dia sem playlist mostra o botão "Sugestão do dia".
import { useEffect, useState } from 'react'
import { Copy, Check } from 'lucide-react'

type Item = { nome: string; link: string | null; observacao: string | null }
type Dia = { data: string; lift: Item | null; running: Item | null }
type Modalidade = 'lift' | 'running'

const CHAVE_PIN = 'playlist_pin'

const MODS: { key: Modalidade; label: string; sub?: string }[] = [
  { key: 'lift', label: 'Lift', sub: 'inclui Lift for Girls' },
  { key: 'running', label: 'Running' },
]

function lerPin() {
  try { return localStorage.getItem(CHAVE_PIN) || '' } catch { return '' }
}
function gravarPin(pin: string | null) {
  try {
    if (pin) localStorage.setItem(CHAVE_PIN, pin)
    else localStorage.removeItem(CHAVE_PIN)
  } catch {}
}

function fmtDia(data: string) {
  const [y, m, d] = data.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
}

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Celular antigo sem Clipboard API
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch { return false }
  }
}

async function chamar(url: string, body: any) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, j }
}

export default function PlaylistCoachPage() {
  const [fase, setFase] = useState<'carregando' | 'pin' | 'ok'>('carregando')
  const [pinDigitado, setPinDigitado] = useState('')
  const [dia, setDia] = useState<Dia | null>(null)
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState<Modalidade | null>(null)
  const [copiado, setCopiado] = useState<Modalidade | null>(null)

  async function copiar(m: Modalidade, texto: string) {
    if (await copiarTexto(texto)) {
      setCopiado(m)
      setTimeout(() => setCopiado(c => (c === m ? null : c)), 2000)
    }
  }

  async function carregar(pin: string) {
    const { ok, j } = await chamar('/api/playlist/hoje', { pin })
    if (ok) {
      gravarPin(pin)
      setDia(j)
      setErro('')
      setFase('ok')
    } else {
      gravarPin(null)
      setErro(j.error || 'Não foi possível abrir')
      setFase('pin')
    }
  }

  useEffect(() => {
    const salvo = lerPin()
    if (salvo) carregar(salvo)
    else setFase('pin')

    // Aba esquecida aberta de um dia pro outro: recarrega ao voltar pra ela
    const aoVoltar = () => {
      const pin = lerPin()
      if (document.visibilityState === 'visible' && pin) carregar(pin)
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [])

  async function sugerir(modalidade: Modalidade) {
    setGerando(modalidade)
    setErro('')
    const { ok, status, j } = await chamar('/api/playlist/sugerir', { pin: lerPin(), modalidade })
    setGerando(null)
    if (status === 401) {
      gravarPin(null)
      setErro(j.error || 'PIN incorreto')
      setFase('pin')
      return
    }
    if (!ok) { setErro(j.error || 'Não foi possível gerar a sugestão'); return }
    setDia(j)
    if (!j[modalidade]) setErro('Nenhuma sugestão disponível para hoje')
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white px-5 py-8">
      <div className="max-w-md mx-auto">
        <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Just Club</div>
        <h1 className="text-3xl font-semibold mt-1">Playlist do dia</h1>

        {fase === 'carregando' && (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-white/70 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {fase === 'pin' && (
          <form
            className="mt-10"
            onSubmit={e => { e.preventDefault(); if (pinDigitado.trim()) { setFase('carregando'); carregar(pinDigitado.trim()) } }}
          >
            <label className="block text-sm text-gray-300 mb-2">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pinDigitado}
              onChange={e => setPinDigitado(e.target.value)}
              className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-2xl tracking-[0.4em] text-center outline-none focus:border-white/40"
            />
            {erro && <div className="mt-3 text-sm text-red-400">{erro}</div>}
            <button type="submit" className="mt-4 w-full rounded-xl bg-white text-gray-950 font-semibold py-3">
              Entrar
            </button>
          </form>
        )}

        {fase === 'ok' && dia && (
          <>
            <div className="text-gray-400 mt-1 capitalize">{fmtDia(dia.data)}</div>
            <div className="mt-8 space-y-4">
              {MODS.map(m => {
                const item = dia[m.key]
                return (
                  <section key={m.key} className="rounded-2xl bg-white/[0.06] border border-white/10 p-5">
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-lg font-semibold">{m.label}</h2>
                      {m.sub && <span className="text-xs text-gray-500">{m.sub}</span>}
                    </div>
                    {item ? (
                      <>
                        <div className="mt-3 flex items-start gap-3">
                          {item.link ? (
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 text-base leading-snug underline decoration-white/30 underline-offset-4"
                            >
                              {item.nome}
                            </a>
                          ) : (
                            <div className="flex-1 text-base leading-snug">{item.nome}</div>
                          )}
                          <button
                            onClick={() => copiar(m.key, item.nome)}
                            aria-label="Copiar nome da playlist"
                            className={`shrink-0 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs ${
                              copiado === m.key ? 'border-green-400/40 text-green-400' : 'border-white/15 text-gray-300'
                            }`}
                          >
                            {copiado === m.key ? <Check size={16} /> : <Copy size={16} />}
                            {copiado === m.key ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                        {item.observacao && (
                          <div className="mt-2 text-sm text-amber-300">{item.observacao}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="mt-3 text-gray-400">Sem playlist definida para hoje.</div>
                        <button
                          onClick={() => sugerir(m.key)}
                          disabled={gerando !== null}
                          className="mt-4 w-full rounded-xl bg-white text-gray-950 font-semibold py-3 disabled:opacity-60"
                        >
                          {gerando === m.key ? 'Gerando…' : 'Sugestão do dia'}
                        </button>
                      </>
                    )}
                  </section>
                )
              })}
            </div>
            {erro && <div className="mt-4 text-sm text-red-400">{erro}</div>}
          </>
        )}
      </div>
    </main>
  )
}
