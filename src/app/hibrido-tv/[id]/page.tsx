'use client'
// Modo TV de teste (fase 1): roda o treino salvo com cronômetro, etapa por etapa.
// Abre logado (admin/coordenadora). Fase 2: PIN, reservas da aula e faixa automática.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { SkipBack, SkipForward, Play, Pause, RotateCcw, Maximize, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  Treino, Bloco, EstacaoRow, Segmento,
  carregarTreino, linhaDoTempo, mmss, estacoesChao, rodizioChaoLigado, estacaoNaVolta, ordemCircuito,
  nomeEstacao, labelEstacao, MODOS_DUPLA,
} from '@/lib/hibrido'

const G = 'font-[family-name:var(--font-grotesk)]'

function detalhes(e?: EstacaoRow) {
  if (!e) return [] as string[]
  const carga = [e.carga_f, e.carga_m].some(Boolean) ? `F ${e.carga_f || '—'} / M ${e.carga_m || '—'}` : ''
  const dupla = e.modo_dupla !== 'individual' ? MODOS_DUPLA.find(m => m.key === e.modo_dupla)?.label || '' : ''
  return [e.instrucao, e.meta, carga, dupla].filter(Boolean)
}

// Bip curto (WebAudio). Só toca depois do primeiro "iniciar" (o navegador exige um clique).
function useBip() {
  const ctx = useRef<AudioContext | null>(null)
  return {
    liberar() {
      try {
        if (!ctx.current) ctx.current = new (window.AudioContext || (window as any).webkitAudioContext)()
        ctx.current.resume()
      } catch {}
    },
    tocar(freq = 880, ms = 150) {
      const c = ctx.current
      if (!c) return
      try {
        const o = c.createOscillator(), g = c.createGain()
        o.frequency.value = freq
        g.gain.value = 0.25
        o.connect(g); g.connect(c.destination)
        o.start(); o.stop(c.currentTime + ms / 1000)
      } catch {}
    },
  }
}

export default function HibridoTvPage() {
  const { id } = useParams<{ id: string }>()
  const { user, perfil, loading: authLoading } = useAuth()
  const supabase = createClient()
  const [t, setT] = useState<Treino | null>(null)
  const [erro, setErro] = useState('')
  const [idx, setIdx] = useState(0)
  const [rodando, setRodando] = useState(false)
  const [restante, setRestante] = useState(0) // ms
  const fimEm = useRef(0)
  const ultimoSegBip = useRef(-1)
  const bip = useBip()

  useEffect(() => {
    if (authLoading || !user) return
    carregarTreino(supabase, id).then(tr => {
      if (!tr) { setErro('Treino não encontrado (ou sem permissão).'); return }
      setT(tr)
    })
  }, [id, authLoading, user])

  const segs = useMemo(() => (t ? linhaDoTempo(t) : []), [t])
  const offsets = useMemo(() => {
    const o: number[] = []
    segs.reduce((s, x, i) => { o[i] = s; return s + x.dur }, 0)
    return o
  }, [segs])
  const totalAula = segs.reduce((s, x) => s + x.dur, 0)
  const fim = segs.length > 0 && idx >= segs.length
  const seg = segs[idx]

  // Ao trocar de segmento parado, o relógio mostra a duração cheia
  useEffect(() => {
    if (!rodando && seg) setRestante(seg.dur * 1000)
  }, [idx, segs])

  // Relógio: conta pelo horário de término (não acumula atraso)
  useEffect(() => {
    if (!rodando) return
    const tick = setInterval(() => {
      const r = fimEm.current - Date.now()
      if (r <= 0) {
        setIdx(i => {
          const prox = i + 1
          if (prox >= segs.length) { setRodando(false); setRestante(0); bip.tocar(660, 700); return prox }
          fimEm.current += segs[prox].dur * 1000
          setRestante(fimEm.current - Date.now())
          bip.tocar(segs[prox].tipo === 'transicao' ? 660 : 990, 450)
          return prox
        })
      } else {
        setRestante(r)
        const s = Math.ceil(r / 1000)
        if (s <= 3 && s !== ultimoSegBip.current) { ultimoSegBip.current = s; bip.tocar(880, 120) }
        if (s > 3) ultimoSegBip.current = -1
      }
    }, 200)
    return () => clearInterval(tick)
  }, [rodando, segs])

  function play() {
    bip.liberar()
    if (fim) return
    fimEm.current = Date.now() + restante
    setRodando(true)
  }
  function pause() {
    setRodando(false)
    setRestante(Math.max(0, fimEm.current - Date.now()))
  }
  function ir(novo: number) {
    const n = Math.max(0, Math.min(segs.length - 1, novo))
    setIdx(n)
    const ms = segs[n].dur * 1000
    setRestante(ms)
    fimEm.current = Date.now() + ms
  }
  function reiniciar() {
    setRodando(false)
    setIdx(0)
    if (segs[0]) setRestante(segs[0].dur * 1000)
  }
  function telaCheia() {
    const el = document.documentElement
    if (document.fullscreenElement) document.exitFullscreen?.()
    else el.requestFullscreen?.()
  }

  // Controle remoto / teclado: espaço = iniciar/pausar, setas = etapa
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); rodando ? pause() : play() }
      else if (e.key === 'ArrowRight') ir(idx + 1)
      else if (e.key === 'ArrowLeft') ir(idx - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (authLoading) return <Centro>Carregando…</Centro>
  if (!user || !perfil || !['admin', 'coordenadora'].includes(perfil.role)) {
    return <Centro>Entre com o usuário de admin ou coordenadora para abrir a TV. <Link href="/equipe" className="text-[#ff6db8] underline ml-2">Entrar</Link></Centro>
  }
  if (erro) return <Centro>{erro}</Centro>
  if (!t) return <Centro>Carregando treino…</Centro>
  if (!segs.length) return <Centro>Este treino ainda não tem tempos para rodar.</Centro>

  const decorrido = fim ? totalAula : offsets[idx] + (seg.dur - restante / 1000)
  const seg1 = Math.ceil(restante / 1000)
  const proximo = segs[idx + 1]

  return (
    <div className="min-h-screen flex flex-col p-[2.2vw] gap-[1.6vw] select-none">
      {/* topo */}
      <div className="flex flex-col gap-[0.8vw]">
        <div className="flex justify-between items-baseline text-[1.6vw] text-[#a1a1aa]">
          <span>{fim ? 'Fim da aula' : tituloSeg(seg, t)}</span>
          <span className={`${G} text-[#f2f2f4]`}>{mmss(decorrido)} <span className="text-[#a1a1aa]">/ {mmss(totalAula)}</span></span>
        </div>
        <div className="h-[0.5vw] min-h-[4px] rounded-full bg-[#1c1c22] overflow-hidden">
          <div className="h-full bg-[#ff2d9b] transition-[width] duration-200" style={{ width: `${(100 * decorrido) / Math.max(1, totalAula)}%` }} />
        </div>
      </div>

      {fim ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-[1vw]">
          <div className={`${G} text-[9vw] font-bold text-[#ff2d9b] leading-none`}>Fim da aula</div>
          <div className="text-[2vw] text-[#a1a1aa]">{t.nome}</div>
        </div>
      ) : (
        <>
          {/* cronômetro */}
          <div className="flex flex-col items-center gap-[0.4vw]">
            <div className={`text-[2.2vw] font-semibold tracking-[0.12em] uppercase ${corRotulo(seg)}`}>{rotuloSeg(seg, t)}</div>
            <div className={`${G} font-bold leading-none tabular-nums text-[14vw] ${seg1 <= 3 && rodando ? 'text-[#ff8a9a] animate-pulse' : corRelogio(seg)}`}>
              {mmss(seg1)}
            </div>
          </div>

          {/* conteúdo */}
          <div className="flex-1 min-h-0">
            <Conteudo seg={seg} t={t} />
          </div>

          {proximo && (
            <div className="text-center text-[1.6vw] text-[#a1a1aa]">A seguir: {resumoProximo(proximo, t)}</div>
          )}
        </>
      )}

      {/* controles */}
      <div className="flex justify-center items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
        <Botao label="Etapa anterior" onClick={() => ir(idx - 1)} disabled={idx === 0}><SkipBack size={20} /></Botao>
        {rodando
          ? <Botao label="Pausar" onClick={pause} grande><Pause size={24} /></Botao>
          : <Botao label="Iniciar" onClick={play} grande disabled={fim}><Play size={24} /></Botao>}
        <Botao label="Próxima etapa" onClick={() => ir(idx + 1)} disabled={idx >= segs.length - 1}><SkipForward size={20} /></Botao>
        <Botao label="Recomeçar" onClick={reiniciar}><RotateCcw size={18} /></Botao>
        <Botao label="Tela cheia" onClick={telaCheia}><Maximize size={18} /></Botao>
        <Link href={`/ju/hibrido/${t.id}`} aria-label="Fechar" className="w-11 h-11 inline-flex items-center justify-center rounded-full border border-[#3a3a42] text-[#d4d4d8]"><X size={18} /></Link>
        <span className="text-xs text-[#a1a1aa] ml-2 hidden md:inline">espaço: iniciar/pausar · ← →: etapa</span>
      </div>
    </div>
  )
}

// ---- textos ------------------------------------------------------------------

function blocoDe(seg: Segmento, t: Treino): Bloco | null {
  return seg.tipo === 'etapa' || seg.tipo === 'transicao' ? t.blocos[seg.bloco] : null
}

function tituloSeg(seg: Segmento, t: Treino) {
  if (seg.tipo === 'aquecimento') return 'Abertura · aquecimento'
  if (seg.tipo === 'explicacao') return 'Abertura · explicação e arrumação'
  const b = t.blocos[seg.bloco]
  return `Bloco ${seg.bloco + 1}${b.nome ? ` · ${b.nome}` : ''} · round ${seg.round} de ${b.rounds} · etapa ${seg.etapa + 1} de ${seg.etapasBloco}`
}

function rotuloSeg(seg: Segmento, t: Treino) {
  if (seg.tipo === 'aquecimento') return 'Aquecimento'
  if (seg.tipo === 'explicacao') return 'Explicação e arrumação'
  const b = t.blocos[seg.bloco]
  if (seg.tipo === 'transicao') return b.formato === 'grupos_ab' ? 'Troca de lado' : 'Troca de estação'
  if (b.formato === 'grupos_ab') return 'Esteira × chão'
  if (b.formato === 'todos') return 'Todos juntos'
  return 'Circuito'
}

const corRotulo = (seg: Segmento) =>
  seg.tipo === 'transicao' ? 'text-[#ffd27a]' : seg.tipo === 'etapa' ? 'text-[#ff6db8]' : 'text-[#a1a1aa]'
const corRelogio = (seg: Segmento) =>
  seg.tipo === 'transicao' ? 'text-[#ffd27a]' : seg.tipo === 'etapa' ? 'text-[#ff2d9b]' : 'text-[#f2f2f4]'

function resumoProximo(seg: Segmento, t: Treino) {
  if (seg.tipo === 'aquecimento' || seg.tipo === 'explicacao') return `${rotuloSeg(seg, t)} ${mmss(seg.dur)}`
  const b = t.blocos[seg.bloco]
  if (seg.tipo === 'transicao') return `${rotuloSeg(seg, t).toLowerCase()} ${mmss(seg.dur)}`
  if (b.formato === 'grupos_ab') {
    return `Bloco ${seg.bloco + 1}, etapa ${seg.etapa + 1}: Grupo ${seg.aEsteira ? 'A' : 'B'} na esteira, Grupo ${seg.aEsteira ? 'B' : 'A'} no chão`
  }
  const o = ordemCircuito(b)
  const e = o[seg.pos || 0]
  return b.formato === 'todos' && e ? `todos em ${nomeEstacao(e)} ${mmss(seg.dur)}` : `etapa ${seg.etapa + 1} do bloco ${seg.bloco + 1}`
}

// ---- conteúdo do meio ----------------------------------------------------------

function Conteudo({ seg, t }: { seg: Segmento; t: Treino }) {
  if (seg.tipo === 'aquecimento' || seg.tipo === 'explicacao') {
    return (
      <div className="h-full flex items-center justify-center text-center">
        <div className="text-[3.4vw] font-semibold max-w-[80vw] leading-tight">{seg.desc || ' '}</div>
      </div>
    )
  }
  const b = blocoDe(seg, t)!
  if (b.formato === 'grupos_ab') return <ConteudoAB seg={seg} b={b} />
  return <ConteudoCircuito seg={seg} b={b} />
}

function ConteudoAB({ seg, b }: { seg: Extract<Segmento, { tipo: 'etapa' | 'transicao' }>; b: Bloco }) {
  if (seg.tipo === 'transicao' && seg.fimBloco) return <FimBloco />
  // Na transição, aEsteira/voltaChao já são da etapa seguinte: mostra para onde cada um vai
  const aEsteira = !!seg.aEsteira
  const voltaChao = seg.voltaChao || 0
  const corrida = b.estacoes.find(e => e.estacao === 'corrida')
  const chao = estacoesChao(b)
  const rod = rodizioChaoLigado(b)
  const cards = [
    { g: 'A', esteira: aEsteira },
    { g: 'B', esteira: !aEsteira },
  ]
  return (
    <div className="h-full grid grid-cols-2 gap-[1.4vw]">
      {cards.map(c => (
        <div key={c.g} className={`rounded-[1.2vw] p-[1.6vw] flex flex-col gap-[0.8vw] ${c.esteira ? 'bg-[#2a0f1e] border-2 border-[#ff2d9b]' : 'bg-[#16161a] border-2 border-[#2a2a31]'}`}>
          <div className="flex items-baseline justify-between">
            <span className={`${G} text-[3vw] font-bold`}>Grupo {c.g}</span>
            <span className={`text-[1.8vw] font-semibold uppercase tracking-[0.1em] ${c.esteira ? 'text-[#ff6db8]' : 'text-[#7ff0bd]'}`}>
              {seg.tipo === 'transicao' ? 'vai para ' : ''}{c.esteira ? 'Esteira' : `Chão${chao.length && rod ? ` · ${voltaChao + 1}ª volta` : ''}`}
            </span>
          </div>
          {c.esteira ? (
            <div className="flex flex-col gap-[0.5vw] text-[2vw]">
              {detalhes(corrida).map((d, i) => <div key={i} className={i === 0 ? 'text-[2.6vw] font-semibold' : 'text-[#d4d4d8]'}>{d}</div>)}
            </div>
          ) : chao.length ? (
            <div className="flex flex-col gap-[0.5vw]">
              {chao.map((_, p) => {
                const e = estacaoNaVolta(chao, p, voltaChao, rod)!
                return (
                  <div key={p} className="flex gap-[0.8vw] items-baseline text-[1.6vw] leading-snug">
                    <span className="text-[#a1a1aa] w-[2.2vw] shrink-0">{p + 1}</span>
                    <span className="font-semibold shrink-0">{nomeEstacao(e)}</span>
                    <span className="text-[#d4d4d8] truncate">{detalhes(e).join(' · ')}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-[2vw] text-[#a1a1aa]">Estações</div>
          )}
        </div>
      ))}
    </div>
  )
}

function ConteudoCircuito({ seg, b }: { seg: Extract<Segmento, { tipo: 'etapa' | 'transicao' }>; b: Bloco }) {
  if (seg.tipo === 'transicao' && seg.fimBloco) return <FimBloco />
  const o = ordemCircuito(b)
  const pos = seg.pos || 0
  if (b.formato === 'todos') {
    const e = o[pos]
    return (
      <div className="h-full flex flex-col items-center justify-center gap-[1vw] text-center">
        <div className={`${G} text-[6vw] font-bold`}>{e ? nomeEstacao(e) : labelEstacao('funcional')}</div>
        <div className="text-[2.4vw] text-[#d4d4d8]">{detalhes(e).join(' · ')}</div>
      </div>
    )
  }
  // Circuito: cada um está numa estação; a cada troca vai para a próxima da ordem
  return (
    <div className="h-full flex flex-col gap-[0.8vw]">
      <div className="text-[1.6vw] text-[#a1a1aa]">A cada troca, cada um vai para a próxima estação: {o.map(nomeEstacao).join(' → ')}</div>
      <div className="grid gap-[0.8vw]" style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, o.length))}, minmax(0, 1fr))` }}>
        {o.map((e, i) => (
          <div key={i} className={`rounded-[1vw] p-[1.2vw] border-2 ${e.estacao === 'corrida' ? 'border-[#ff2d9b] bg-[#2a0f1e]' : 'border-[#2a2a31] bg-[#16161a]'}`}>
            <div className="flex items-baseline gap-[0.6vw]">
              <span className="text-[#a1a1aa] text-[1.4vw]">{i + 1}</span>
              <span className={`${G} text-[2.2vw] font-bold`}>{nomeEstacao(e)}</span>
            </div>
            <div className="text-[1.5vw] text-[#d4d4d8]">{detalhes(e).join(' · ')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FimBloco() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className={`${G} text-[5vw] font-bold text-[#ffd27a]`}>Fim do bloco · prepara o próximo</div>
    </div>
  )
}

function Botao({ children, label, onClick, disabled, grande }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; grande?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${grande ? 'w-14 h-14 bg-[#ff2d9b] text-[#1a0010] border-transparent' : 'w-11 h-11 border-[#3a3a42] text-[#d4d4d8]'} inline-flex items-center justify-center rounded-full border disabled:opacity-30`}
    >
      {children}
    </button>
  )
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-[#a1a1aa] text-lg p-8 text-center">{children}</div>
}
