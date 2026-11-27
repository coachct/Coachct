'use client'
// Player da TV do Running & Hybrid: roda o treino com cronômetro, etapa por etapa.
// Usado pelo teste da Ju (/hibrido-tv/[id], logado) e pela TV da sala (/hibrido-tv, com PIN).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SkipBack, SkipForward, Play, Pause, RotateCcw, Maximize, X } from 'lucide-react'
import {
  Treino, Bloco, EstacaoRow, Segmento,
  linhaDoTempo, mmss, estacoesChao, rodizioChaoLigado, ordemCircuito, codChao, SALA_CHAO, circuitoPorCodigo, nomeNaSala,
  nomeEstacao, labelEstacao, MODOS_DUPLA, temTransicaoVariada,
} from '@/lib/hibrido'
import { Pictograma, itensAquecimento } from './Pictogramas'

const G = 'font-[family-name:var(--font-grotesk)]'

// "troca 00:25" ou, com as primeiras mais longas, "2 primeiras trocas 00:45, depois 00:25"
function textoTrocas(b: Bloco) {
  if (!temTransicaoVariada(b)) return `troca ${mmss(b.transicao_seg)}`
  const n = b.rodizio.trans_longas || 0
  return n > 0 && typeof b.rodizio.trans_longa_seg === 'number'
    ? `${n === 1 ? '1ª troca' : `${n} primeiras trocas`} ${mmss(b.rodizio.trans_longa_seg)}, depois ${mmss(b.transicao_seg)}`
    : `trocas variadas (padrão ${mmss(b.transicao_seg)})`
}

function detalhes(e?: EstacaoRow) {
  if (!e) return [] as string[]
  const carga = [e.carga_f, e.carga_m].some(Boolean) ? `F ${e.carga_f || '—'} / M ${e.carga_m || '—'}` : ''
  const dupla = e.modo_dupla !== 'individual' ? MODOS_DUPLA.find(m => m.key === e.modo_dupla)?.label || '' : ''
  return [e.instrucao, e.meta, carga, dupla].filter(Boolean)
}

// Texto do chão sem repetir o que já está no título do card ("E1 Grama: …") e sem o modo da dupla.
function textoChao(e: EstacaoRow, p: number) {
  // Nome mais longo primeiro ("SkiErg" antes de "Ski"); só tira o nome se vier seguido de ":" ou do fim/ponto
  const nomes = [nomeNaSala(e, p), nomeEstacao(e), labelEstacao(e.estacao), 'SkiErg', 'Grama']
    .sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const inicio = new RegExp(`^\\s*(${codChao(p)}\\s*)?((${nomes.join('|')})\\b\\s*)?[:·–-]?\\s*`, 'i')
  const instr = e.instrucao.replace(inicio, '').trim()
  const carga = [e.carga_f, e.carga_m].some(Boolean) ? `F ${e.carga_f || '—'} / M ${e.carga_m || '—'}` : ''
  return [instr, e.meta, carga].filter(Boolean).join(' · ')
}

// Texto que cresce até preencher a caixa (sem cortar): busca o maior tamanho de fonte que cabe.
// Usado nos cards da TV para quem está longe enxergar.
function TextoQueEnche({ texto, className = '', max = 0.22 }: { texto: string; className?: string; max?: number }) {
  const caixa = useRef<HTMLDivElement>(null)
  const dentro = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const cx = caixa.current, el = dentro.current
    if (!cx || !el) return
    const ajustar = () => {
      const H = cx.clientHeight, W = cx.clientWidth
      if (!H || !W) return
      // teto: fração da largura (texto curto não fica gigante demais)
      let lo = 8, hi = Math.max(8, Math.min(H, W * max))
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2
        el.style.fontSize = `${mid}px`
        if (el.offsetHeight <= H && el.scrollWidth <= W) lo = mid
        else hi = mid
      }
      el.style.fontSize = `${Math.floor(lo)}px`
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(cx)
    return () => ro.disconnect()
  }, [texto, max])
  return (
    <div ref={caixa} className={`flex-1 min-h-0 overflow-hidden ${className}`}>
      <div ref={dentro} className="leading-[1.15] break-words">{texto}</div>
    </div>
  )
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

export function Centro({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-[#a1a1aa] text-lg p-8 text-center">{children}</div>
}

export default function Player({ treino: t, onFechar, cabecalho }: {
  treino: Treino
  onFechar: () => void
  cabecalho?: string // ex.: "Aula 09:00 · 32 reservas · Faixa 4"
}) {
  const [idx, setIdx] = useState(0)
  const [rodando, setRodando] = useState(false)
  const [restante, setRestante] = useState(0) // ms
  const fimEm = useRef(0)
  const ultimoSegBip = useRef(-1)
  const bip = useBip()

  const segs = useMemo(() => linhaDoTempo(t), [t])
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
  async function telaCheia() {
    const el = document.documentElement as any
    if (document.fullscreenElement) { document.exitFullscreen?.(); return }
    try { await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()) } catch {}
    // Android/Chrome deixa travar na horizontal em tela cheia; no iPhone é só girar o aparelho
    try { await (screen.orientation as any)?.lock?.('landscape') } catch {}
  }

  // Sabe se já está em tela cheia (o botão grande some quando está)
  const [cheia, setCheia] = useState(false)
  // iPhone (Safari ou Chrome, todos usam o motor da Apple) não deixa o site entrar em tela cheia:
  // lá o caminho é o atalho na tela de início, que abre sem barra do navegador (modoApp).
  const [suportaCheia, setSuportaCheia] = useState(true)
  const [modoApp, setModoApp] = useState(false)
  const [ajudaCheia, setAjudaCheia] = useState(false)
  useEffect(() => {
    const d = document as any
    setSuportaCheia(!!(d.fullscreenEnabled || d.webkitFullscreenEnabled))
    setModoApp(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true)
    const ver = () => setCheia(!!(document.fullscreenElement || (document as any).webkitFullscreenElement))
    ver()
    document.addEventListener('fullscreenchange', ver)
    document.addEventListener('webkitfullscreenchange', ver)
    return () => { document.removeEventListener('fullscreenchange', ver); document.removeEventListener('webkitfullscreenchange', ver) }
  }, [])

  // Celular em pé: pede para girar (espelhado na TV, em pé fica uma faixa estreita no meio)
  const [retrato, setRetrato] = useState(false)
  useEffect(() => {
    const ver = () => setRetrato(window.innerHeight > window.innerWidth && window.innerWidth < 900)
    ver()
    window.addEventListener('resize', ver)
    window.addEventListener('orientationchange', ver)
    return () => { window.removeEventListener('resize', ver); window.removeEventListener('orientationchange', ver) }
  }, [])

  // Comandos somem 3 s depois do último toque enquanto a aula roda; tocar na tela traz de volta.
  // Pausado, ficam sempre à vista.
  const [cutucado, setCutucado] = useState(true)
  const timerCmd = useRef<any>(null)
  useEffect(() => {
    const cutucar = () => {
      setCutucado(true)
      clearTimeout(timerCmd.current)
      timerCmd.current = setTimeout(() => setCutucado(false), 3000)
    }
    cutucar()
    window.addEventListener('pointerdown', cutucar)
    window.addEventListener('pointermove', cutucar)
    window.addEventListener('keydown', cutucar)
    return () => {
      clearTimeout(timerCmd.current)
      window.removeEventListener('pointerdown', cutucar)
      window.removeEventListener('pointermove', cutucar)
      window.removeEventListener('keydown', cutucar)
    }
  }, [rodando])
  const comandosVisiveis = !rodando || cutucado

  // Tela não apaga enquanto a aula roda
  useEffect(() => {
    if (!rodando) return
    let lock: any = null
    ;(navigator as any).wakeLock?.request?.('screen').then((l: any) => { lock = l }).catch(() => {})
    return () => { try { lock?.release?.() } catch {} }
  }, [rodando])

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

  if (!segs.length) return <Centro>Este treino ainda não tem tempos para rodar.</Centro>

  const decorrido = fim ? totalAula : offsets[idx] + (seg.dur - restante / 1000)
  const seg1 = Math.ceil(restante / 1000)
  const proximo = segs[idx + 1]
  // Esteira × chão com corrida por código: as 5 colunas precisam de altura, o relógio encolhe um pouco
  const blocoAtual = !fim && (seg.tipo === 'etapa' || seg.tipo === 'transicao') ? t.blocos[seg.bloco] : null
  const mapaCodigos = !!blocoAtual && blocoAtual.formato === 'grupos_ab' && estacoesChao(blocoAtual).some(e => e.esteira?.trim())
  // Sala com os 5 códigos: relógio no meio da tela, E1/E2 à esquerda, E3 embaixo do relógio, E4/E5 à direita
  const salaEmVoltaBloco = mapaCodigos && estacoesChao(blocoAtual!).length === 5 && !(seg.tipo === 'transicao' && seg.fimBloco)
  // Explicação: mesmo mapa da sala, com o primeiro bloco que tem os 5 códigos e a esteira de cada um
  const blocoExplicacao = !fim && seg.tipo === 'explicacao'
    ? t.blocos.find(b => b.formato === 'grupos_ab' && estacoesChao(b).length === 5 && estacoesChao(b).some(e => e.esteira?.trim())) || null
    : null
  const salaEmVolta = salaEmVoltaBloco || !!blocoExplicacao
  const relogioCentro = salaEmVolta ? (
    <div className={`${G} font-bold leading-none tabular-nums text-[calc(var(--u)*11.5)] ${seg1 <= 3 && rodando ? 'text-[#ff8a9a] animate-pulse' : corRelogio(seg)}`}>
      {mmss(seg1)}
    </div>
  ) : null
  const aSeguir = proximo ? `A seguir: ${resumoProximo(proximo, t)}` : ''

  return (
    // --u = 1% da largura de uma tela 16:9 que cabe na tela atual (celular deitado espelhado, TV ou notebook):
    // tudo cresce junto e a aula ocupa a tela inteira sem cortar nada.
    <div className="h-[100dvh] overflow-hidden flex flex-col p-[calc(var(--u)*2.2)] gap-[calc(var(--u)*1.6)] select-none"
      style={{ ['--u' as any]: 'min(1vw, 1.7778vh)' }}>
      {retrato && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-5 p-8 text-center">
          <div className={`${G} text-3xl font-bold`}>Gire o celular para a horizontal</div>
          <div className="text-[#a1a1aa]">Assim a aula ocupa a TV inteira no espelhamento.</div>
          <button onClick={() => (suportaCheia ? telaCheia() : setAjudaCheia(true))} className="min-h-[52px] px-6 rounded-xl bg-[#ff2d9b] text-[#1a0010] font-semibold">Tela cheia na horizontal</button>
        </div>
      )}
      {/* topo */}
      <div className="flex flex-col gap-[calc(var(--u)*0.8)]">
        <div className="flex justify-between items-baseline text-[calc(var(--u)*1.6)] text-[#a1a1aa]">
          <span>{cabecalho ? `${cabecalho} · ` : ''}{fim ? 'Fim da aula' : tituloSeg(seg, t)}</span>
          <span className={`${G} text-[#f2f2f4]`}>{mmss(decorrido)} <span className="text-[#a1a1aa]">/ {mmss(totalAula)}</span></span>
        </div>
        <div className="h-[calc(var(--u)*0.5)] min-h-[4px] rounded-full bg-[#1c1c22] overflow-hidden">
          <div className="h-full bg-[#ff2d9b] transition-[width] duration-200" style={{ width: `${(100 * decorrido) / Math.max(1, totalAula)}%` }} />
        </div>
      </div>

      {fim ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-[calc(var(--u)*1)]">
          <div className={`${G} text-[calc(var(--u)*9)] font-bold text-[#ff2d9b] leading-none`}>Fim da aula</div>
          <div className="text-[calc(var(--u)*2)] text-[#a1a1aa]">{t.nome}</div>
        </div>
      ) : (
        <>
          {/* cronômetro (na explicação fica compacto numa linha: o mapa do treino precisa da tela) */}
          {salaEmVolta ? null : seg.tipo === 'explicacao' && t.blocos.length ? (
            <div className="flex items-baseline justify-center gap-[calc(var(--u)*1.6)]">
              <div className={`text-[calc(var(--u)*2.2)] font-semibold tracking-[0.12em] uppercase ${corRotulo(seg)}`}>{rotuloSeg(seg, t)}</div>
              <div className={`${G} font-bold leading-none tabular-nums text-[calc(var(--u)*6)] ${seg1 <= 3 && rodando ? 'text-[#ff8a9a] animate-pulse' : corRelogio(seg)}`}>
                {mmss(seg1)}
              </div>
            </div>
          ) : salaEmVolta ? null : (
            <div className="flex flex-col items-center gap-[calc(var(--u)*0.4)]">
              <div className={`text-[calc(var(--u)*2.2)] font-semibold tracking-[0.12em] uppercase ${corRotulo(seg)}`}>{rotuloSeg(seg, t)}</div>
              <div className={`${G} font-bold leading-none tabular-nums ${mapaCodigos ? 'text-[calc(var(--u)*8.5)]' : 'text-[calc(var(--u)*14)]'} ${seg1 <= 3 && rodando ? 'text-[#ff8a9a] animate-pulse' : corRelogio(seg)}`}>
                {mmss(seg1)}
              </div>
            </div>
          )}

          {/* conteúdo */}
          <div className="flex-1 min-h-0">
            {blocoExplicacao
              ? <SalaEmVolta b={blocoExplicacao} relogio={relogioCentro} />
              : <Conteudo seg={seg} t={t} relogio={relogioCentro} aSeguir={aSeguir} />}
          </div>

          {proximo && !salaEmVolta && (
            <div className="text-center text-[calc(var(--u)*1.6)] text-[#a1a1aa]">A seguir: {resumoProximo(proximo, t)}</div>
          )}
        </>
      )}

      {/* controles */}
      {ajudaCheia && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-6" onClick={() => setAjudaCheia(false)}>
          <div className="max-w-[520px] w-full rounded-2xl bg-[#16161a] border border-[#2a2a31] p-6 flex flex-col gap-3 text-[15px]" onClick={e => e.stopPropagation()}>
            <div className={`${G} text-xl font-bold`}>Tela cheia no iPhone</div>
            <div className="text-[#d4d4d8]">O iPhone não deixa a página ocupar a tela sozinha. Faça uma vez:</div>
            <ol className="list-decimal pl-5 flex flex-col gap-1.5 text-[#d4d4d8]">
              <li>Toque em compartilhar (Safari: quadrado com seta · Chrome: o ícone ao lado do endereço).</li>
              <li>Escolha <b>Adicionar à Tela de Início</b>.</li>
              <li>Abra pelo ícone &quot;Just&quot; que aparece na tela do celular: a TV abre sem a barra do navegador.</li>
            </ol>
            <div className="text-[#a1a1aa] text-[13px]">No Android o botão funciona direto.</div>
            <button onClick={() => setAjudaCheia(false)} className="self-end min-h-[44px] px-5 rounded-xl bg-[#ff2d9b] text-[#1a0010] font-semibold">Entendi</button>
          </div>
        </div>
      )}
      {!cheia && !modoApp && (
        <button onClick={() => (suportaCheia ? telaCheia() : setAjudaCheia(true))}
          className="fixed top-3 right-3 z-40 inline-flex items-center gap-2 min-h-[48px] px-5 rounded-xl bg-[#ff2d9b] text-[#1a0010] font-semibold shadow-lg">
          <Maximize size={18} /> Tela cheia
        </button>
      )}
      {/* Comandos flutuam por cima (não ocupam altura): a aula usa a tela inteira */}
      <div className={`fixed bottom-[calc(var(--u)*1.2)] left-1/2 -translate-x-1/2 z-30 flex justify-center items-center gap-2 px-3 py-2 rounded-full bg-black/80 border border-[#2a2a31] transition-opacity duration-500 ${comandosVisiveis ? 'opacity-90 hover:opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <Botao label="Etapa anterior" onClick={() => ir(idx - 1)} disabled={idx === 0}><SkipBack size={20} /></Botao>
        {rodando
          ? <Botao label="Pausar" onClick={pause} grande><Pause size={24} /></Botao>
          : <Botao label="Iniciar" onClick={play} grande disabled={fim}><Play size={24} /></Botao>}
        <Botao label="Próxima etapa" onClick={() => ir(idx + 1)} disabled={idx >= segs.length - 1}><SkipForward size={20} /></Botao>
        <Botao label="Recomeçar" onClick={reiniciar}><RotateCcw size={18} /></Botao>
        <Botao label="Tela cheia" onClick={telaCheia}><Maximize size={18} /></Botao>
        <button onClick={onFechar} aria-label="Fechar" className="w-11 h-11 inline-flex items-center justify-center rounded-full border border-[#3a3a42] text-[#d4d4d8]"><X size={18} /></button>
        <span className="text-xs text-[#a1a1aa] ml-2 hidden xl:inline whitespace-nowrap">espaço: iniciar/pausar · ← →: etapa</span>
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
  if (circuitoPorCodigo(b) && seg.tipo === 'etapa') return `Passagem ${seg.etapa + 1} de ${seg.etapasBloco}`
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

// Explicação: o mapa do treino sai do que já está montado (o coach não precisa escrever).
// O texto que ele escrever, se houver, aparece em cima.
function ConteudoExplicacao({ t, desc }: { t: Treino; desc: string }) {
  return (
    <div className="h-full flex flex-col gap-[calc(var(--u)*1)] overflow-hidden">
      {desc.trim() && <div className="text-center text-[calc(var(--u)*2)] font-semibold leading-tight">{desc}</div>}
      {t.blocos.map((b, bi) => {
        const ab = b.formato === 'grupos_ab'
        const porCod = circuitoPorCodigo(b)
        const linhas = ab ? estacoesChao(b) : ordemCircuito(b)
        const comEsteira = linhas.some(e => e.esteira?.trim())
        const codigos = ab || porCod
        const corrida = b.estacoes.find(e => e.estacao === 'corrida')
        const titulo = ab
          ? `${b.rounds} ${b.rounds === 1 ? 'passagem' : 'passagens'} · ${mmss(b.etapa_seg)} no chão + ${mmss(b.etapa_seg)} na esteira · ${textoTrocas(b)}`
          : porCod
            ? `${linhas.length} passagens · ${mmss(b.etapa_seg)} por código · ${textoTrocas(b)}`
            : b.formato === 'todos'
              ? `Todos juntos · ${mmss(b.etapa_seg)} por estação · ${textoTrocas(b)}`
              : `Circuito · ${b.rounds} ${b.rounds === 1 ? 'volta' : 'voltas'} · ${mmss(b.etapa_seg)} por estação · ${textoTrocas(b)}`
        const regra = ab
          ? (rodizioChaoLigado(b)
            ? 'Cada um faz o chão e a esteira do mesmo código. Depois gira para o código seguinte, sentido horário (E5 → E1).'
            : 'Esteira e chão do mesmo código trocam entre si; cada dupla volta sempre para o mesmo código do chão.')
          : porCod
            ? 'Em cada código, revezem esteira e chão até o tempo acabar. Depois girem para o código seguinte (E5 → E1).'
            : 'A cada troca, cada um vai para a próxima estação.'
        return (
          <div key={bi} className="flex-1 min-h-0 flex flex-col gap-[calc(var(--u)*0.7)]">
            <div className="flex flex-wrap items-baseline gap-x-[calc(var(--u)*1.2)]">
              <span className={`${G} text-[calc(var(--u)*2.6)] font-bold`}>{t.blocos.length > 1 ? `Bloco ${bi + 1} · ` : ''}{b.nome || 'Bloco'}</span>
              <span className="text-[calc(var(--u)*1.8)] text-[#ff6db8] font-semibold">{titulo}</span>
            </div>
            <div className="text-[calc(var(--u)*1.6)] text-[#d4d4d8]">{regra}{ab && !comEsteira && corrida && detalhes(corrida).length ? ` Esteira: ${detalhes(corrida).join(' · ')}` : ''}</div>
            <div className="flex-1 min-h-0 grid gap-[calc(var(--u)*0.7)]" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(5, linhas.length))}, minmax(0, 1fr))` }}>
              {linhas.map((e, p) => (
                <div key={p} className="rounded-[calc(var(--u)*0.9)] p-[calc(var(--u)*0.9)] border-2 border-[#2a2a31] bg-[#16161a] flex flex-col gap-[calc(var(--u)*0.5)] min-w-0">
                  <div className="flex items-baseline gap-[calc(var(--u)*0.6)]">
                    <span className={`${G} text-[calc(var(--u)*2.6)] font-bold text-[#7ff0bd] leading-none`}>{codigos ? codChao(p) : p + 1}</span>
                    <span className={`${G} text-[calc(var(--u)*1.7)] font-bold leading-tight truncate`}>{codigos ? nomeNaSala(e, p) : nomeEstacao(e)}</span>
                  </div>
                  <div className="text-[calc(var(--u)*1.35)] text-[#d4d4d8] leading-snug">{codigos ? textoChao(e, p) : detalhes(e).join(' · ')}</div>
                  {comEsteira && (
                    <div className="mt-auto rounded-[calc(var(--u)*0.6)] bg-[#2a0f1e] border border-[#ff2d9b] px-[calc(var(--u)*0.7)] py-[calc(var(--u)*0.5)]">
                      <span className="text-[calc(var(--u)*1.2)] uppercase tracking-[0.1em] text-[#ff6db8]">Esteira </span>
                      <span className="text-[calc(var(--u)*1.6)] font-semibold">{e.esteira || '—'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Aquecimento em cards: pictograma + quantidade + nome de cada exercício
function ConteudoAquecimento({ desc }: { desc: string }) {
  const itens = itensAquecimento(desc)
  return (
    <div className="h-full flex items-center justify-center">
      <div className="grid gap-[calc(var(--u)*1.4)] w-full" style={{ gridTemplateColumns: `repeat(${Math.min(5, itens.length)}, minmax(0, 1fr))` }}>
        {itens.map((it, i) => (
          <div key={i} className="rounded-[calc(var(--u)*1.2)] border-2 border-[#2a2a31] bg-[#16161a] p-[calc(var(--u)*1)] flex items-center gap-[calc(var(--u)*1)] min-w-0">
            <Pictograma nome={it.nome} className="w-[calc(var(--u)*7)] h-[calc(var(--u)*7)] shrink-0 text-[#7ff0bd]" />
            <div className="flex flex-col gap-[calc(var(--u)*0.3)] min-w-0">
              {it.qtd && <div className={`${G} text-[calc(var(--u)*4.4)] font-bold leading-none text-[#ff2d9b]`}>{it.qtd}</div>}
              <div className="text-[calc(var(--u)*1.7)] font-semibold leading-tight">{it.nome}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Conteudo({ seg, t, relogio, aSeguir }: { seg: Segmento; t: Treino; relogio?: React.ReactNode; aSeguir?: string }) {
  if (seg.tipo === 'explicacao' && t.blocos.length) return <ConteudoExplicacao t={t} desc={seg.desc} />
  if (seg.tipo === 'aquecimento' && itensAquecimento(seg.desc).length >= 2) return <ConteudoAquecimento desc={seg.desc} />
  if (seg.tipo === 'aquecimento' || seg.tipo === 'explicacao') {
    return (
      <div className="h-full flex items-center justify-center text-center">
        <div className="text-[calc(var(--u)*3.4)] font-semibold max-w-[calc(var(--u)*80)] leading-tight">{seg.desc || ' '}</div>
      </div>
    )
  }
  const b = blocoDe(seg, t)!
  if (b.formato === 'grupos_ab') return <ConteudoAB seg={seg} b={b} relogio={relogio} aSeguir={aSeguir} />
  return <ConteudoCircuito seg={seg} b={b} />
}

// Opção A (aprovada 27/11): relógio no meio; E1/E2 à esquerda, E3 embaixo do relógio, E4/E5 à direita.
// Usada nas etapas do bloco e, igual, na explicação (o coach mostra as estações com o mesmo mapa).
function SalaEmVolta({ b, relogio }: { b: Bloco; relogio: React.ReactNode }) {
  const chao = estacoesChao(b)
  const card = (p: number) => {
    const e = chao[p]
    return (
      <div className="h-full rounded-[calc(var(--u)*1.2)] border-2 border-[#3a3550] bg-[#1c1a2c] p-[calc(var(--u)*1)] flex flex-col gap-[calc(var(--u)*0.6)] min-w-0 min-h-0">
        <div className="flex items-baseline gap-[calc(var(--u)*0.8)] shrink-0">
          <span className={`${G} text-[calc(var(--u)*4.2)] font-bold text-[#7ff0bd] leading-none`}>{codChao(p)}</span>
          <span className={`${G} text-[calc(var(--u)*2.6)] font-bold leading-tight truncate`}>{nomeNaSala(e, p)}</span>
        </div>
        <TextoQueEnche texto={textoChao(e, p) || '—'} className="text-[#f2f2f4] font-semibold" max={0.16} />
        <div className="basis-[36%] shrink-0 min-h-0 rounded-[calc(var(--u)*0.8)] bg-[#2a0f1e] border border-[#ff2d9b] px-[calc(var(--u)*0.9)] py-[calc(var(--u)*0.5)] flex flex-col">
          <div className="text-[calc(var(--u)*1.3)] uppercase tracking-[0.1em] text-[#ff6db8] font-semibold shrink-0">Esteira</div>
          <TextoQueEnche texto={e.esteira || '—'} className="text-white font-bold" max={0.16} />
        </div>
      </div>
    )
  }
  return (
    <div className="h-full grid grid-cols-[1fr_1.2fr_1fr] grid-rows-2 gap-[calc(var(--u)*1)]">
      {card(0)}
      <div className="flex flex-col items-center justify-center gap-[calc(var(--u)*0.6)] text-center min-h-0">
        {/* Só o tempo (27/11, pedido do Ricardo): grupos, chão e "a seguir" saíram deste centro */}
        {relogio}
      </div>
      {card(4)}
      {card(1)}
      {card(2)}
      {card(3)}
    </div>
  )
}

function ConteudoAB({ seg, b, relogio, aSeguir }: { seg: Extract<Segmento, { tipo: 'etapa' | 'transicao' }>; b: Bloco; relogio?: React.ReactNode; aSeguir?: string }) {
  if (seg.tipo === 'transicao' && seg.fimBloco) return <FimBloco />
  // Na transição, aEsteira/voltaChao já são da etapa seguinte: mostra para onde cada um vai
  const aEsteira = !!seg.aEsteira
  const voltaChao = seg.voltaChao || 0
  const corrida = b.estacoes.find(e => e.estacao === 'corrida')
  const chao = estacoesChao(b)
  const rod = rodizioChaoLigado(b)
  // Cada código com a sua corrida (a dupla da esteira E1 troca com a do chão E1)
  const porCodigo = chao.some(e => e.esteira?.trim())
  const cards = [
    { g: 'A', esteira: aEsteira },
    { g: 'B', esteira: !aEsteira },
  ]
  // Na 1ª troca do bloco (quem vai ao chão pela 1ª vez) o código é o mesmo; depois o chão gira no sentido horário
  const regraTroca = !rod || voltaChao === 0
    ? 'Esteira E1 ↔ chão E1, E2 ↔ E2… troca com o mesmo código'
    : 'Chão → esteira do mesmo código · Esteira → chão do código seguinte (E5 → E1)'
  // Corrida por código: uma coluna por código (E1…E5) com o chão em cima e a esteira embaixo,
  // texto inteiro (quebra linha, sem cortar). Quem está em cada lado vai no topo.
  if (porCodigo) {
    const grupoEsteira = aEsteira ? 'A' : 'B'
    const grupoChao = aEsteira ? 'B' : 'A'
    const vai = seg.tipo === 'transicao' ? 'vai para ' : ''
    if (relogio && chao.length === 5) return <SalaEmVolta b={b} relogio={relogio} />
    return (
      <div className="h-full flex flex-col gap-[calc(var(--u)*0.9)]">
        {seg.tipo === 'transicao'
          ? <div className="text-center text-[calc(var(--u)*2.1)] font-semibold text-[#ffd27a]">{regraTroca}</div>
          : (
            <div className="flex justify-center gap-[calc(var(--u)*1.2)] text-[calc(var(--u)*2)] font-semibold">
              <span className="px-[calc(var(--u)*1.2)] py-[calc(var(--u)*0.3)] rounded-full bg-[#2a0f1e] border border-[#ff2d9b] text-[#ff6db8]">Grupo {grupoEsteira} {vai}na esteira</span>
              <span className="px-[calc(var(--u)*1.2)] py-[calc(var(--u)*0.3)] rounded-full bg-[#0d2a1f] border border-[#1f5a43] text-[#7ff0bd]">Grupo {grupoChao} {vai}no chão{rod ? ` · ${voltaChao + 1}ª volta` : ''}</span>
            </div>
          )}
        <div className="flex-1 min-h-0 grid gap-[calc(var(--u)*0.8)]" style={{ gridTemplateColumns: `repeat(${chao.length}, minmax(0, 1fr))` }}>
          {chao.map((e, p) => (
            <div key={p} className="rounded-[calc(var(--u)*1)] border-2 border-[#2a2a31] bg-[#16161a] p-[calc(var(--u)*0.9)] flex flex-col gap-[calc(var(--u)*0.6)] min-w-0">
              <div className="flex items-baseline gap-[calc(var(--u)*0.6)]">
                <span className={`${G} text-[calc(var(--u)*2.8)] font-bold text-[#7ff0bd] leading-none`}>{codChao(p)}</span>
                <span className={`${G} text-[calc(var(--u)*1.9)] font-bold leading-tight`}>{nomeNaSala(e, p)}</span>
              </div>
              <div className="text-[calc(var(--u)*1.45)] leading-snug text-[#e4e4e7]">{textoChao(e, p)}</div>
              <div className="mt-auto rounded-[calc(var(--u)*0.6)] bg-[#2a0f1e] border border-[#ff2d9b] px-[calc(var(--u)*0.7)] py-[calc(var(--u)*0.4)]">
                <div className="text-[calc(var(--u)*1.1)] uppercase tracking-[0.1em] text-[#ff6db8]">Esteira</div>
                <div className="text-[calc(var(--u)*1.65)] font-semibold leading-tight">{e.esteira || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="h-full flex flex-col gap-[calc(var(--u)*1)]">
    {seg.tipo === 'transicao' && chao.length > 0 && (
      <div className="text-center text-[calc(var(--u)*2.2)] font-semibold text-[#ffd27a]">{regraTroca}</div>
    )}
    <div className="flex-1 min-h-0 grid grid-cols-2 gap-[calc(var(--u)*1.4)]">
      {cards.map(c => (
        <div key={c.g} className={`rounded-[calc(var(--u)*1.2)] p-[calc(var(--u)*1.6)] flex flex-col gap-[calc(var(--u)*0.8)] ${c.esteira ? 'bg-[#2a0f1e] border-2 border-[#ff2d9b]' : 'bg-[#16161a] border-2 border-[#2a2a31]'}`}>
          <div className="flex items-baseline justify-between">
            <span className={`${G} text-[calc(var(--u)*3)] font-bold`}>Grupo {c.g}</span>
            <span className={`text-[calc(var(--u)*1.8)] font-semibold uppercase tracking-[0.1em] ${c.esteira ? 'text-[#ff6db8]' : 'text-[#7ff0bd]'}`}>
              {seg.tipo === 'transicao' ? 'vai para ' : ''}{c.esteira ? 'Esteira' : `Chão${chao.length && rod ? ` · ${voltaChao + 1}ª volta` : ''}`}
            </span>
          </div>
          {c.esteira ? (
            <div className="flex flex-col gap-[calc(var(--u)*0.5)] text-[calc(var(--u)*2)]">
              {porCodigo ? (
                <>
                  {chao.map((e, p) => (
                    <div key={p} className="flex gap-[calc(var(--u)*0.8)] items-baseline text-[calc(var(--u)*1.8)] leading-snug">
                      <span className={`${G} text-[#ff6db8] font-bold w-[calc(var(--u)*2.8)] shrink-0`}>{codChao(p)}</span>
                      <span className="font-semibold">{e.esteira || '—'}</span>
                    </div>
                  ))}
                  {detalhes(corrida).length > 0 && <div className="text-[calc(var(--u)*1.5)] text-[#d4d4d8]">{detalhes(corrida).join(' · ')}</div>}
                </>
              ) : (
                <>
                  {detalhes(corrida).map((d, i) => <div key={i} className={i === 0 ? 'text-[calc(var(--u)*2.6)] font-semibold' : 'text-[#d4d4d8]'}>{d}</div>)}
                  <div className="text-[calc(var(--u)*1.5)] text-[#a1a1aa]">Esteiras E1 a E5 · duas por código</div>
                </>
              )}
            </div>
          ) : chao.length ? (
            <div className="flex flex-col gap-[calc(var(--u)*0.5)]">
              {chao.map((e, p) => (
                <div key={p} className="flex gap-[calc(var(--u)*0.8)] items-baseline text-[calc(var(--u)*1.6)] leading-snug">
                  <span className={`${G} text-[#7ff0bd] font-bold w-[calc(var(--u)*2.8)] shrink-0`}>{codChao(p)}</span>
                  <span className="font-semibold shrink-0">{nomeNaSala(e, p)}</span>
                  <span className="text-[#d4d4d8] truncate">{detalhes(e).join(' · ')}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[calc(var(--u)*2)] text-[#a1a1aa]">Estações</div>
          )}
        </div>
      ))}
    </div>
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
      <div className="h-full flex flex-col items-center justify-center gap-[calc(var(--u)*1)] text-center">
        <div className={`${G} text-[calc(var(--u)*6)] font-bold`}>{e ? nomeEstacao(e) : labelEstacao('funcional')}</div>
        <div className="text-[calc(var(--u)*2.4)] text-[#d4d4d8]">{detalhes(e).join(' · ')}</div>
      </div>
    )
  }
  // Passagem por código: cada código junta as 2 esteiras e o chão; revezam dentro do tempo e giram no horário
  if (circuitoPorCodigo(b)) {
    return (
      <div className="h-full flex flex-col gap-[calc(var(--u)*0.8)]">
        <div className={`text-center text-[calc(var(--u)*2)] font-semibold ${seg.tipo === 'transicao' ? 'text-[#ffd27a]' : 'text-[#a1a1aa]'}`}>
          {seg.tipo === 'transicao'
            ? 'Gire para o próximo código · E1 → E2 → E3 → E4 → E5 → E1'
            : 'Em cada código: revezem esteira e chão até o tempo acabar'}
        </div>
        <div className="flex-1 min-h-0 grid gap-[calc(var(--u)*0.8)]" style={{ gridTemplateColumns: `repeat(${Math.max(1, o.length)}, minmax(0, 1fr))` }}>
          {o.map((e, p) => (
            <div key={p} className="rounded-[calc(var(--u)*1)] p-[calc(var(--u)*1.1)] border-2 border-[#2a2a31] bg-[#16161a] flex flex-col gap-[calc(var(--u)*0.7)] min-w-0">
              <div className={`${G} text-[calc(var(--u)*3.4)] font-bold text-[#7ff0bd] leading-none`}>{codChao(p)}</div>
              <div className="flex flex-col gap-[calc(var(--u)*0.3)]">
                <div className="text-[calc(var(--u)*1.3)] uppercase tracking-[0.1em] text-[#a1a1aa]">Chão</div>
                <div className={`${G} text-[calc(var(--u)*1.9)] font-bold leading-tight`}>{nomeNaSala(e, p)}</div>
                <div className="text-[calc(var(--u)*1.45)] text-[#d4d4d8] leading-snug">{detalhes(e).join(' · ')}</div>
              </div>
              <div className="mt-auto rounded-[calc(var(--u)*0.7)] bg-[#2a0f1e] border border-[#ff2d9b] p-[calc(var(--u)*0.8)]">
                <div className="text-[calc(var(--u)*1.3)] uppercase tracking-[0.1em] text-[#ff6db8]">Esteira</div>
                <div className="text-[calc(var(--u)*1.9)] font-semibold leading-tight">{e.esteira || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  // Circuito: cada um está numa estação; a cada troca vai para a próxima da ordem
  return (
    <div className="h-full flex flex-col gap-[calc(var(--u)*0.8)]">
      <div className="text-[calc(var(--u)*1.6)] text-[#a1a1aa]">A cada troca, cada um vai para a próxima estação: {o.map(nomeEstacao).join(' → ')}</div>
      <div className="grid gap-[calc(var(--u)*0.8)]" style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, o.length))}, minmax(0, 1fr))` }}>
        {o.map((e, i) => (
          <div key={i} className={`rounded-[calc(var(--u)*1)] p-[calc(var(--u)*1.2)] border-2 ${e.estacao === 'corrida' ? 'border-[#ff2d9b] bg-[#2a0f1e]' : 'border-[#2a2a31] bg-[#16161a]'}`}>
            <div className="flex items-baseline gap-[calc(var(--u)*0.6)]">
              <span className="text-[#a1a1aa] text-[calc(var(--u)*1.4)]">{i + 1}</span>
              <span className={`${G} text-[calc(var(--u)*2.2)] font-bold`}>{nomeEstacao(e)}</span>
            </div>
            <div className="text-[calc(var(--u)*1.5)] text-[#d4d4d8]">{detalhes(e).join(' · ')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FimBloco() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className={`${G} text-[calc(var(--u)*5)] font-bold text-[#ffd27a]`}>Fim do bloco · prepara o próximo</div>
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
