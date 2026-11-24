'use client'
// TV da sala de Running (Vila Olímpia) nos dias de Running & Hybrid.
// Entra com o PIN dos coaches, escolhe a aula de hoje; a faixa vem das reservas
// (dá para trocar) e roda o treino programado para hoje nessa faixa.
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { FAIXAS, FAIXA_PADRAO, Treino } from '@/lib/hibrido'
import Player, { Centro } from './Player'

const CHAVE_PIN = 'playlist_pin' // mesmo PIN da página de playlist dos coaches
const G = 'font-[family-name:var(--font-grotesk)]'

type Aula = { id: string; horario: string; reservas: number; faixa: number }
type Dia = { data: string; aulas: Aula[]; programacao: Record<number, { treino_id: string; nome: string; da_faixa?: number }> }

function lerPin() { try { return localStorage.getItem(CHAVE_PIN) || '' } catch { return '' } }
function gravarPin(p: string | null) { try { p ? localStorage.setItem(CHAVE_PIN, p) : localStorage.removeItem(CHAVE_PIN) } catch {} }

async function chamar(body: any) {
  const r = await fetch('/api/hibrido/tv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, j }
}

export default function HibridoTvSalaPage() {
  const [fase, setFase] = useState<'carregando' | 'pin' | 'lista' | 'tv'>('carregando')
  const [pin, setPin] = useState('')
  const [dia, setDia] = useState<Dia | null>(null)
  const [aula, setAula] = useState<Aula | null>(null)
  const [faixa, setFaixa] = useState<number | null>(null)
  const [treino, setTreino] = useState<Treino | null>(null)
  const [erro, setErro] = useState('')

  async function carregarDia(p: string) {
    const { ok, status, j } = await chamar({ pin: p })
    if (!ok) {
      if (status === 401) { gravarPin(null); setFase('pin') }
      setErro(j.error || 'Não foi possível carregar.')
      return
    }
    gravarPin(p)
    setErro('')
    setDia(j)
    setFase('lista')
  }

  useEffect(() => {
    const p = lerPin()
    if (p) { setPin(p); carregarDia(p) } else setFase('pin')
  }, [])

  async function abrir(f: number) {
    setErro('')
    const { ok, j } = await chamar({ pin, faixa: f })
    if (!ok || !j.treino) { setErro(j.error || 'Não foi possível abrir o treino.'); return }
    setFaixa(f)
    setTreino(j.treino)
    setFase('tv')
  }

  if (fase === 'carregando') return <Centro>Carregando…</Centro>

  if (fase === 'pin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={e => { e.preventDefault(); if (pin.trim()) carregarDia(pin.trim()) }}
          className="w-full max-w-sm flex flex-col gap-4 bg-[#18181c] border border-[#2a2a31] rounded-2xl p-6"
        >
          <h1 className={`${G} text-2xl font-bold m-0`}>Running & Hybrid · TV</h1>
          <label className="flex flex-col gap-1.5 text-xs text-[#a1a1aa]">PIN dos coaches
            <input value={pin} onChange={e => setPin(e.target.value)} inputMode="numeric" autoFocus
              className="min-h-[52px] px-4 rounded-xl border border-[#3a3a42] bg-[#0e0e11] text-[#f2f2f4] text-xl tracking-[0.3em] outline-none focus:border-[#ff2d9b]" />
          </label>
          {erro && <div className="text-[#ff8a9a]">{erro}</div>}
          <button className="min-h-[52px] rounded-xl bg-[#ff2d9b] text-[#1a0010] font-semibold text-lg">Entrar</button>
        </form>
      </div>
    )
  }

  if (fase === 'tv' && treino && aula !== undefined) {
    const cab = aula ? `Aula ${aula.horario} · ${aula.reservas} reservas · Faixa ${faixa}` : `Faixa ${faixa}`
    return <Player treino={treino} cabecalho={cab} onFechar={() => { setFase('lista'); setTreino(null); carregarDia(pin) }} />
  }

  const d = dia!
  const sugerida = FAIXA_PADRAO ?? aula?.faixa ?? null
  return (
    <div className="min-h-[100dvh] p-[calc(var(--u)*3)] flex flex-col gap-[calc(var(--u)*2)]" style={{ ['--u' as any]: 'min(1vw, 1.7778vh)' }}>
      <div className="flex items-center justify-between">
        <h1 className={`${G} text-[calc(var(--u)*3)] font-bold m-0`}>Running & Hybrid · hoje</h1>
        <button onClick={() => carregarDia(pin)} className="min-h-[48px] px-5 rounded-xl border border-[#3a3a42] text-[#d4d4d8] inline-flex items-center gap-2">
          <RefreshCw size={18} /> Atualizar reservas
        </button>
      </div>
      {erro && <div className="text-[#ff8a9a] text-lg">{erro}</div>}

      <div className="flex flex-col gap-3">
        <div className="text-[#a1a1aa] text-lg">1 · Escolha a aula</div>
        {d.aulas.length === 0 ? (
          <div className="text-[#a1a1aa] text-lg">Nenhuma aula de Running & Hybrid hoje. Dá para abrir direto pela faixa abaixo.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {d.aulas.map(a => (
              <button key={a.id} onClick={() => setAula(a)}
                className={`rounded-2xl p-5 text-left border-2 ${aula?.id === a.id ? 'border-[#ff2d9b] bg-[#2a0f1e]' : 'border-[#2a2a31] bg-[#18181c]'}`}>
                <div className={`${G} text-[calc(var(--u)*3)] font-bold leading-none`}>{a.horario}</div>
                <div className="text-[#d4d4d8] text-lg mt-2">{a.reservas} reservas · Faixa {a.faixa}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[#a1a1aa] text-lg">2 · Faixa {sugerida ? (FAIXA_PADRAO ? `(padrão: Faixa ${sugerida})` : `(sugerida pelas reservas: Faixa ${sugerida})`) : ''}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FAIXAS.map(f => {
            const prog = d.programacao[f.n]
            return (
              <button key={f.n} onClick={() => abrir(f.n)} disabled={!prog}
                className={`rounded-2xl p-5 text-left border-2 disabled:opacity-40 ${sugerida === f.n ? 'border-[#ff2d9b] bg-[#2a0f1e]' : 'border-[#2a2a31] bg-[#18181c]'}`}>
                <div className={`${G} text-[calc(var(--u)*2.4)] font-bold`}>Faixa {f.n}</div>
                <div className="text-[#a1a1aa]">{f.alunos}</div>
                <div className={`mt-2 text-lg ${prog ? 'text-[#7ff0bd]' : 'text-[#a1a1aa]'}`}>{prog ? (prog.da_faixa && prog.da_faixa !== f.n ? `(${prog.nome} (treino da Faixa ${prog.da_faixa})` : prog.nome) : 'sem treino hoje'}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
