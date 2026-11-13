'use client'
// Montagem do treino híbrido. Layout = esboço aprovado no canvas "Montagem de Treino Híbrido — esboço".
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUp, ArrowDown, Copy, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import {
  Bloco, EstacaoRow, Estacao, Formato, ModoDupla, Treino, MediaHorario,
  FAIXAS, FORMATOS, ESTACOES, MODOS_DUPLA, UNIDADE_VO,
  mmss, resumo, totalBloco, limiteEsteira, passouEsteira, ordemCircuito, nomeEstacao,
  labelEstacao, estacoesUsadas, treinoVazio, blocoVazio, estacaoVazia, clonarBlocos,
  carregarTreino, salvarTreino, programar, carregarMedias, faixasProvaveis, fmtDia,
  estacoesChao, rodizioChaoLigado, roteiroAB, estacaoNaVolta,
} from '@/lib/hibrido'
import { cls, Modal } from './ui'
import { hojeSP } from '@/lib/tempo'

type Acao = 'treino' | 'modelo'

// Tempo em dois campos: minutos e segundos, cada um só com número.
function TempoInput({ valor, onChange, ariaLabel }: {
  valor: number
  onChange: (seg: number) => void
  className?: string
  ariaLabel?: string
}) {
  const min = Math.floor(valor / 60)
  const seg = valor % 60
  const num = (v: string) => {
    const n = parseInt(v.replace(/\D/g, ''), 10)
    return Number.isFinite(n) ? n : 0
  }
  const campo = 'min-h-[44px] w-full min-w-0 pl-3 pr-9 rounded-[10px] border border-[#3a3a42] bg-[#0e0e11] text-[#f2f2f4] outline-none focus:border-[#ff2d9b] text-right'
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <div className="relative">
        <input
          value={String(min)}
          inputMode="numeric"
          aria-label={`${ariaLabel || 'Tempo'}: minutos`}
          onFocus={e => e.target.select()}
          onChange={e => onChange(num(e.target.value) * 60 + seg)}
          className={campo}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#a1a1aa] pointer-events-none">min</span>
      </div>
      <div className="relative">
        <input
          value={String(seg)}
          inputMode="numeric"
          aria-label={`${ariaLabel || 'Tempo'}: segundos`}
          onFocus={e => e.target.select()}
          onChange={e => onChange(min * 60 + Math.min(59, num(e.target.value)))}
          className={campo}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#a1a1aa] pointer-events-none">s</span>
      </div>
    </div>
  )
}

function NumInput({ valor, onChange, min = 0, ariaLabel }: { valor: number; onChange: (n: number) => void; min?: number; ariaLabel?: string }) {
  return (
    <input
      value={String(valor)}
      aria-label={ariaLabel}
      inputMode="numeric"
      onChange={e => {
        const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
        onChange(Number.isFinite(n) ? Math.max(min, n) : min)
      }}
      className={cls.input}
    />
  )
}

export default function EditorHibrido({ treinoId, dataInicial, faixaInicial }: {
  treinoId?: string
  dataInicial?: string
  faixaInicial?: number
}) {
  const supabase = createClient()
  const router = useRouter()
  const [t, setT] = useState<Treino>(() => treinoVazio(faixaInicial && faixaInicial >= 1 && faixaInicial <= 4 ? faixaInicial : 1))
  const [data, setData] = useState(dataInicial || '')
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(!!treinoId)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [pedirOk, setPedirOk] = useState<Acao | null>(null)
  const [modalDuplicar, setModalDuplicar] = useState(false)
  const [medias, setMedias] = useState<MediaHorario[]>([])
  const [progDia, setProgDia] = useState<Map<number, string>>(new Map())
  const alertaRef = useRef<HTMLElement>(null)
  const blocosRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    carregarMedias(supabase).then(setMedias)
    if (!treinoId) return
    ;(async () => {
      const tr = await carregarTreino(supabase, treinoId)
      if (!tr) { setErro('Treino não encontrado'); setLoading(false); return }
      setT(tr)
      setAbertos(new Set(tr.blocos[0] ? [tr.blocos[0].id] : []))
      if (!dataInicial && !tr.modelo) {
        // Sem data na URL: a próxima data em que o treino está programado
        const { data: pr } = await supabase
          .from('hibrido_programacao').select('data').eq('treino_id', treinoId)
          .gte('data', hojeSP()).order('data').limit(1)
        if (pr?.[0]) setData(pr[0].data)
      }
      setLoading(false)
    })()
  }, [treinoId])

  // "Este dia nas outras faixas"
  useEffect(() => {
    if (!data) { setProgDia(new Map()); return }
    supabase.from('hibrido_programacao').select('faixa, treino_id')
      .eq('data', data).eq('unidade_id', UNIDADE_VO)
      .then(({ data: rows }: any) => setProgDia(new Map((rows || []).map((r: any) => [r.faixa, r.treino_id]))))
  }, [data, msg])

  const r = resumo(t)

  // ---- edição ----------------------------------------------------------------

  const set = <K extends keyof Treino>(k: K, v: Treino[K]) => setT(p => ({ ...p, [k]: v }))
  const setBloco = (id: string, patch: Partial<Bloco>) =>
    setT(p => ({ ...p, blocos: p.blocos.map(b => (b.id === id ? { ...b, ...patch } : b)) }))
  const setEstacao = (bid: string, eid: string, patch: Partial<EstacaoRow>) =>
    setT(p => ({
      ...p,
      blocos: p.blocos.map(b => (b.id !== bid ? b : { ...b, estacoes: b.estacoes.map(e => (e.id === eid ? { ...e, ...patch } : e)) })),
    }))

  function addBloco() {
    const b = blocoVazio()
    setT(p => ({ ...p, blocos: [...p.blocos, b] }))
    setAbertos(s => new Set(s).add(b.id))
  }
  function duplicarBloco(i: number) {
    const [c] = clonarBlocos([t.blocos[i]])
    setT(p => ({ ...p, blocos: [...p.blocos.slice(0, i + 1), c, ...p.blocos.slice(i + 1)] }))
    setAbertos(s => new Set(s).add(c.id))
  }
  function moverBloco(i: number, d: -1 | 1) {
    const j = i + d
    if (j < 0 || j >= t.blocos.length) return
    setT(p => {
      const arr = [...p.blocos]
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...p, blocos: arr }
    })
  }
  function excluirBloco(i: number) {
    if (!confirm('Excluir este bloco?')) return
    setT(p => ({ ...p, blocos: p.blocos.filter((_, k) => k !== i) }))
  }
  function toggle(id: string) {
    setAbertos(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function addEstacao(b: Bloco, e: Estacao) {
    setBloco(b.id, { estacoes: [...b.estacoes, estacaoVazia(e, b.estacoes)] })
  }
  function removerEstacao(b: Bloco, eid: string) {
    setBloco(b.id, {
      estacoes: b.estacoes.filter(e => e.id !== eid),
      rodizio: { ...b.rodizio, ordem: (b.rodizio.ordem || []).filter(id => id !== eid) },
    })
  }

  // ---- salvar ----------------------------------------------------------------

  function aviso(m: string) {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  async function salvar(acao: Acao, ignorarCorrida = false) {
    setErro('')
    if (!r.fecha) { setErro(`A soma precisa dar exatamente ${mmss(t.duracao_seg)} para salvar.`); return }
    if (r.poucaCorrida && !ignorarCorrida) {
      setPedirOk(acao)
      alertaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setPedirOk(null)
    setSalvando(true)

    if (acao === 'modelo') {
      // Modelo fica na biblioteca sem data. Treino já salvo vira uma cópia-modelo; o original segue igual.
      const modelo: Treino = t.id && !t.modelo
        ? { ...t, id: null, modelo: true, blocos: clonarBlocos(t.blocos) }
        : { ...t, modelo: true }
      const { id, erro: e } = await salvarTreino(supabase, modelo)
      setSalvando(false)
      if (e || !id) { setErro(e || 'Não foi possível salvar'); return }
      if (!t.id) { router.replace(`/ju/hibrido/${id}`); setT(p => ({ ...p, id, modelo: true })) }
      else if (t.modelo) setT(p => ({ ...p, id }))
      aviso('Modelo salvo na biblioteca')
      return
    }

    if (data && !t.modelo) {
      const outro = progDia.get(t.faixa)
      if (outro && outro !== t.id && !confirm(`Já existe um treino na Faixa ${t.faixa} em ${fmtDia(data).completo}. Substituir por este?`)) {
        setSalvando(false)
        return
      }
    }
    const { id, erro: e } = await salvarTreino(supabase, t)
    if (e || !id) { setSalvando(false); setErro(e || 'Não foi possível salvar'); return }
    if (data && !t.modelo) {
      const ep = await programar(supabase, data, t.faixa, id)
      if (ep) { setSalvando(false); setErro('Treino salvo, mas não foi possível programar o dia: ' + ep); return }
    }
    setSalvando(false)
    if (!t.id) {
      setT(p => ({ ...p, id }))
      router.replace(`/ju/hibrido/${id}${data ? `?data=${data}` : ''}`)
    }
    aviso('Treino salvo')
  }

  async function duplicarParaFaixa(faixa: number) {
    setErro('')
    if (!r.fecha) { setErro(`A soma precisa dar exatamente ${mmss(t.duracao_seg)} para salvar.`); setModalDuplicar(false); return }
    setSalvando(true)
    const copia: Treino = { ...t, id: null, faixa, modelo: false, blocos: clonarBlocos(t.blocos) }
    const { id, erro: e } = await salvarTreino(supabase, copia)
    setSalvando(false)
    setModalDuplicar(false)
    if (e || !id) { setErro(e || 'Não foi possível duplicar'); return }
    router.push(`/ju/hibrido/${id}${data ? `?data=${data}` : ''}`)
  }

  // ---- derivados ---------------------------------------------------------------

  const provaveis = useMemo(() => (data ? faixasProvaveis(medias, data) : new Set<number>()), [medias, data])
  const todasDupla = t.blocos.length > 0 && t.blocos.filter(b => b.alunos_corrida > 0).every(b => b.corrida_em_dupla)
    && t.blocos.some(b => b.alunos_corrida > 0)
  const cores = ['#ff2d9b', '#c3307f']

  if (loading) return <Spinner />

  const ultimo = t.blocos.length - 1

  return (
    <div className="max-w-[1380px] mx-auto flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-[#a1a1aa] tracking-[0.04em]">
            Área da Ju › <Link href="/ju/hibrido" className="hover:text-[#ff6db8]">Treinos híbridos</Link> › {t.id ? (t.nome || 'Treino') : 'Novo treino'}
          </div>
          <h1 className={`${cls.titulo} m-0 text-[32px] font-bold tracking-[-0.01em]`}>Montar treino híbrido</h1>
          <div className={cls.muted}>
            JustClub Vila Olímpia · sala de Running (dias híbridos){t.modelo ? ' · modelo' : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModalDuplicar(true)} disabled={salvando} className={cls.btn}>Duplicar para outra faixa</button>
          <button onClick={() => salvar('modelo')} disabled={salvando || !r.fecha} className={cls.btn}
            title={r.fecha ? '' : `A soma precisa dar ${mmss(t.duracao_seg)}`}>Salvar como modelo</button>
          <button onClick={() => salvar('treino')} disabled={salvando || !r.fecha} className={cls.btnRosa}
            title={r.fecha ? '' : `A soma precisa dar ${mmss(t.duracao_seg)}`}>{salvando ? 'Salvando…' : 'Salvar treino'}</button>
        </div>
      </div>

      {msg && <div className="px-4 py-3 rounded-xl bg-[#0f2a1e] text-[#7ff0bd] font-medium">{msg}</div>}
      {erro && <div className="px-4 py-3 rounded-xl bg-[#3a0f16] text-[#ff8a9a] font-medium">{erro}</div>}

      <div className="flex flex-wrap gap-6 items-start">
        {/* Coluna principal */}
        <div ref={blocosRef} className="flex-[999_1_560px] min-w-0 flex flex-col gap-5">
          <section className={`${cls.card} p-6 flex flex-col gap-5`}>
            <h2 className={`${cls.titulo} m-0 text-lg font-semibold`}>1 · Dados do treino</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className={cls.label}>Nome do treino
                <input value={t.nome} onChange={e => set('nome', e.target.value)} className={cls.input} />
              </label>
              <label className={cls.label}>Data das aulas
                {t.modelo ? (
                  <input value="modelo · sem data" disabled className={`${cls.input} opacity-60`} />
                ) : (
                  <input type="date" value={data} onChange={e => setData(e.target.value)} className={cls.input} />
                )}
              </label>
              <label className={cls.label}>Duração da aula
                <TempoInput valor={t.duracao_seg} onChange={v => set('duracao_seg', v)} />
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-xs text-[#a1a1aa]">Faixa de ocupação</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {FAIXAS.map(f => {
                  const sel = t.faixa === f.n
                  return (
                    <button
                      key={f.n}
                      onClick={() => set('faixa', f.n)}
                      className={`min-h-[64px] rounded-xl flex flex-col items-center justify-center gap-0.5 ${
                        sel ? 'border-2 border-[#ff2d9b] bg-[#2a0f1e] text-[#ffd6ea]' : 'border border-[#3a3a42] bg-[#0e0e11] text-[#f2f2f4]'
                      }`}
                    >
                      <span className="font-semibold">Faixa {f.n}</span>
                      <span className={`text-xs ${sel ? 'text-[#ffb3d8]' : 'text-[#a1a1aa]'}`}>{f.alunos}</span>
                    </button>
                  )
                })}
              </div>
              <div className="text-xs text-[#a1a1aa]">
                Único limite da montagem: no máximo 10 alunos correndo ao mesmo tempo (20 em dupla). Chão e funcional livres.
              </div>
            </div>
          </section>

          <section className={`${cls.card} p-6 flex flex-col gap-3.5`}>
            <h2 className={`${cls.titulo} m-0 text-lg font-semibold`}>2 · Abertura</h2>
            <div className="grid grid-cols-[minmax(0,1fr)_170px] md:grid-cols-[220px_minmax(0,1fr)_170px] gap-3 items-center">
              <div className="font-medium col-span-2 md:col-span-1">Aquecimento</div>
              <input value={t.aquecimento_desc} onChange={e => set('aquecimento_desc', e.target.value)} aria-label="Descrição do aquecimento" className={cls.input} />
              <TempoInput valor={t.aquecimento_seg} onChange={v => set('aquecimento_seg', v)} className="text-center" ariaLabel="Tempo do aquecimento" />
              <div className="font-medium col-span-2 md:col-span-1">Explicação e arrumação</div>
              <input value={t.explicacao_desc} onChange={e => set('explicacao_desc', e.target.value)} aria-label="Descrição da explicação e arrumação" className={cls.input} />
              <TempoInput valor={t.explicacao_seg} onChange={v => set('explicacao_seg', v)} className="text-center" ariaLabel="Tempo da explicação e arrumação" />
            </div>
          </section>

          {t.blocos.map((b, i) => (
            <BlocoCard
              key={b.id}
              b={b}
              i={i}
              ultimo={i === ultimo}
              aberto={abertos.has(b.id)}
              onToggle={() => toggle(b.id)}
              onAbrir={() => setAbertos(s => new Set(s).add(b.id))}
              setBloco={patch => setBloco(b.id, patch)}
              setEstacao={(eid, patch) => setEstacao(b.id, eid, patch)}
              addEstacao={e => addEstacao(b, e)}
              removerEstacao={eid => removerEstacao(b, eid)}
              onMover={d => moverBloco(i, d)}
              onDuplicar={() => duplicarBloco(i)}
              onExcluir={() => excluirBloco(i)}
              onAddBloco={addBloco}
              total={t.blocos.length}
            />
          ))}
          {t.blocos.length === 0 && (
            <button onClick={addBloco} className={cls.btnTracejado}>+ Adicionar bloco</button>
          )}
        </div>

        {/* Coluna lateral */}
        <aside className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <section className={`${cls.card} p-5 flex flex-col gap-3.5`}>
            <div className="flex justify-between items-baseline">
              <div className="text-xs text-[#a1a1aa]">Soma do treino</div>
              <div className={`text-xs font-medium ${r.fecha ? 'text-[#7ff0bd]' : r.diff > 0 ? 'text-[#ffd27a]' : 'text-[#ff8a9a]'}`}>
                {r.fecha ? 'fecha certinho' : r.diff > 0 ? `faltam ${mmss(r.diff)}` : `passou ${mmss(-r.diff)}`}
              </div>
            </div>
            <div className={`${cls.titulo} text-[44px] font-bold leading-none`}>
              {mmss(r.soma)} <span className="text-lg text-[#a1a1aa] font-medium">/ {mmss(t.duracao_seg)}</span>
            </div>
            <div className="flex h-3.5 rounded-full overflow-hidden gap-0.5 bg-[#0e0e11]">
              {t.aquecimento_seg > 0 && <div style={{ flex: t.aquecimento_seg, background: '#6b6b76' }} />}
              {t.explicacao_seg > 0 && <div style={{ flex: t.explicacao_seg, background: '#4a4a54' }} />}
              {t.blocos.map((b, i) => totalBloco(b) > 0 && <div key={b.id} style={{ flex: totalBloco(b), background: cores[i % 2] }} />)}
              {r.diff > 0 && <div style={{ flex: r.diff }} />}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px]">
              <div>Aquecimento</div><div className="text-[#a1a1aa]">{mmss(t.aquecimento_seg)}</div>
              <div>Explicação e arrumação</div><div className="text-[#a1a1aa]">{mmss(t.explicacao_seg)}</div>
              {t.blocos.map((b, i) => (
                <FragmentoEtapa key={b.id} nome={`Bloco ${i + 1} — ${b.nome || 'sem nome'}${i === ultimo ? ' (fim em alta)' : ''}`} tempo={mmss(totalBloco(b))} />
              ))}
            </div>
          </section>

          {r.poucaCorrida && (
            <section
              ref={alertaRef}
              className={`rounded-2xl p-5 flex flex-col gap-2.5 bg-[#2a210b] border ${pedirOk ? 'border-[#ffd27a] ring-2 ring-[#ffd27a]/40' : 'border-[#6b4f12]'}`}
            >
              <div className="font-semibold text-[#ffd27a]">Pouco tempo de corrida</div>
              <div className="text-[#f3dfb2]">
                Cada {todasDupla ? 'dupla' : 'aluno'} fica {mmss(r.corrida)} na esteira de {mmss(r.blocos)} de blocos ({r.pctCorrida}%). O ideal é pelo menos metade.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setPedirOk(null); blocosRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
                  className="min-h-[44px] px-3.5 rounded-[10px] border border-[#6b4f12] bg-transparent text-[#ffd27a]"
                >
                  Ajustar blocos
                </button>
                <button
                  onClick={() => salvar(pedirOk || 'treino', true)}
                  disabled={salvando || !r.fecha}
                  className="min-h-[44px] px-3.5 rounded-[10px] bg-[#ffd27a] text-[#2a1d00] font-semibold disabled:opacity-40"
                >
                  Ok, salvar assim
                </button>
              </div>
            </section>
          )}

          <PreviaTV t={t} />

          <section className={`${cls.card} p-5 flex flex-col gap-2`}>
            <div className="text-xs text-[#a1a1aa]">Este dia nas outras faixas</div>
            {!data || t.modelo ? (
              <div className="text-[13px] text-[#a1a1aa]">Escolha a data das aulas para ver as outras faixas.</div>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[13px]">
                {FAIXAS.map(f => {
                  const st = f.n === t.faixa
                    ? { txt: 'editando', cor: 'text-[#ff6db8]' }
                    : progDia.has(f.n)
                      ? { txt: 'pronto', cor: 'text-[#7ff0bd]' }
                      : provaveis.has(f.n)
                        ? { txt: 'falta montar', cor: 'text-[#ffd27a]' }
                        : { txt: 'sem treino', cor: 'text-[#a1a1aa]' }
                  return (
                    <FragmentoFaixa key={f.n} nome={`Faixa ${f.n} · ${f.curto}`} st={st.txt} cor={st.cor}
                      href={f.n !== t.faixa ? (progDia.has(f.n) ? `/ju/hibrido/${progDia.get(f.n)}?data=${data}` : `/ju/hibrido/novo?data=${data}&faixa=${f.n}`) : null} />
                  )
                })}
              </div>
            )}
          </section>
        </aside>
      </div>

      {modalDuplicar && (
        <Modal titulo="Duplicar para outra faixa" onClose={() => setModalDuplicar(false)}>
          <p className="text-[#a1a1aa] mb-4">Copia tudo e troca a faixa. Depois é só enxugar ou ampliar.</p>
          <div className="grid grid-cols-1 gap-2">
            {FAIXAS.filter(f => f.n !== t.faixa).map(f => (
              <button key={f.n} onClick={() => duplicarParaFaixa(f.n)} disabled={salvando} className={`${cls.btn} text-left`}>
                <span className="font-semibold">Faixa {f.n}</span> <span className="text-[#a1a1aa] text-xs">· {f.alunos}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function FragmentoEtapa({ nome, tempo }: { nome: string; tempo: string }) {
  return (<><div className="min-w-0 truncate">{nome}</div><div className="text-[#a1a1aa]">{tempo}</div></>)
}

function FragmentoFaixa({ nome, st, cor, href }: { nome: string; st: string; cor: string; href: string | null }) {
  return (
    <>
      <div>{nome}</div>
      {href ? <Link href={href} className={`${cor} hover:underline`}>{st}</Link> : <div className={cor}>{st}</div>}
    </>
  )
}

// ---- Bloco -------------------------------------------------------------------

function BlocoCard(p: {
  b: Bloco
  i: number
  ultimo: boolean
  aberto: boolean
  total: number
  onToggle: () => void
  onAbrir: () => void
  setBloco: (patch: Partial<Bloco>) => void
  setEstacao: (eid: string, patch: Partial<EstacaoRow>) => void
  addEstacao: (e: Estacao) => void
  removerEstacao: (eid: string) => void
  onMover: (d: -1 | 1) => void
  onDuplicar: () => void
  onExcluir: () => void
  onAddBloco: () => void
}) {
  const { b, i } = p
  const lim = limiteEsteira(b)
  const estourou = passouEsteira(b)
  const labelTempo = b.formato === 'grupos_ab' ? 'Tempo em cada lado' : 'Tempo por estação'
  const formatoLabel = FORMATOS.find(f => f.key === b.formato)!.label
  const usadas = estacoesUsadas([b]).map(e => labelEstacao(e).toLowerCase())
  const ordem = ordemCircuito(b)
  const unidade = b.corrida_em_dupla ? 'duplas' : 'alunos'
  const grupo = b.corrida_em_dupla ? Math.ceil(b.alunos_corrida / 2) : b.alunos_corrida
  const aComeca = b.rodizio.a_comeca || 'corrida'
  const txtEsteira = 'Começa na esteira → vai para as estações'
  const txtEstacoes = 'Começa nas estações → vai para a esteira'
  const ab = b.formato === 'grupos_ab'
  // Em Grupos A/B a esteira fica no card próprio; a tabela é só do chão
  const linhas = ab ? estacoesChao(b) : b.estacoes

  return (
    <section className={`${cls.card} p-6 flex flex-col gap-4`}>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className={`${cls.titulo} m-0 text-lg font-semibold`}>{i + 3} · Bloco {i + 1} — {b.nome || 'sem nome'}</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <span className={estourou ? cls.seloVermelho : cls.seloVerde}>
            Esteira {b.alunos_corrida} de {lim}{b.corrida_em_dupla ? ' (dupla)' : ''}
          </span>
          <span className={cls.seloCinza}>Total do bloco {mmss(totalBloco(b))}{p.ultimo ? ' · termina a aula' : ''}</span>
          <button onClick={() => p.onMover(-1)} disabled={i === 0} className={cls.btnIcone} aria-label="Mover bloco para cima"><ArrowUp size={14} /></button>
          <button onClick={() => p.onMover(1)} disabled={i === p.total - 1} className={cls.btnIcone} aria-label="Mover bloco para baixo"><ArrowDown size={14} /></button>
          <button onClick={p.onDuplicar} className={cls.btnIcone} aria-label="Duplicar bloco"><Copy size={14} /></button>
          <button onClick={p.onExcluir} className={`${cls.btnIcone} hover:!border-[#ff8a9a] hover:text-[#ff8a9a]`} aria-label="Excluir bloco"><Trash2 size={14} /></button>
          <button onClick={p.onToggle} className={cls.btnIcone} aria-label={p.aberto ? 'Recolher bloco' : 'Abrir bloco'}>
            {p.aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {estourou && (
        <div className="px-3.5 py-2.5 rounded-xl bg-[#3a0f16] text-[#ff8a9a] font-medium">
          Máximo de 10 na esteira (ou 20 em dupla)
        </div>
      )}

      {p.aberto ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className={`${cls.label} col-span-2 ${ab ? 'md:col-span-4' : ''}`}>Nome do bloco
              <input value={b.nome} onChange={e => p.setBloco({ nome: e.target.value })} className={cls.input} />
            </label>
            {!ab && (
              <>
                <label className={cls.label}>Alunos na corrida
                  <NumInput valor={b.alunos_corrida} onChange={n => p.setBloco({ alunos_corrida: n })} />
                </label>
                <label className={cls.label}>Corrida
                  <select value={b.corrida_em_dupla ? 'dupla' : 'individual'} onChange={e => p.setBloco({ corrida_em_dupla: e.target.value === 'dupla' })} className={cls.input}>
                    <option value="individual">Individual</option>
                    <option value="dupla">Em dupla</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className={cls.label}>Formato
              <select value={b.formato} onChange={e => p.setBloco({ formato: e.target.value as Formato })} className={cls.input}>
                {FORMATOS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <label className={cls.label}>{labelTempo}
              <TempoInput valor={b.etapa_seg} onChange={v => p.setBloco({ etapa_seg: v })} />
            </label>
            <label className={cls.label}>Transição
              <TempoInput valor={b.transicao_seg} onChange={v => p.setBloco({ transicao_seg: v })} />
            </label>
            <label className={cls.label}>Rounds
              <NumInput valor={b.rounds} min={1} onChange={n => p.setBloco({ rounds: n })} />
            </label>
          </div>

          {ab ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#0e0e11] border border-[#2a2a31] px-3.5 py-3">
                  <div className="text-xs text-[#a1a1aa]">Grupo A · {grupo} {unidade}</div>
                  <select
                    value={aComeca}
                    onChange={e => p.setBloco({ rodizio: { ...b.rodizio, a_comeca: e.target.value as 'corrida' | 'estacoes' } })}
                    aria-label="Onde o Grupo A começa"
                    className="w-full bg-transparent font-medium text-[#f2f2f4] outline-none -ml-1 py-0.5"
                  >
                    <option value="corrida">{txtEsteira}</option>
                    <option value="estacoes">{txtEstacoes}</option>
                  </select>
                </div>
                <div className="rounded-xl bg-[#0e0e11] border border-[#2a2a31] px-3.5 py-3">
                  <div className="text-xs text-[#a1a1aa]">Grupo B · {grupo} {unidade}</div>
                  <div className="font-medium py-0.5">{aComeca === 'corrida' ? txtEstacoes : txtEsteira}</div>
                </div>
              </div>
              <EsteiraAB b={b} setBloco={p.setBloco} setEstacao={p.setEstacao} />
              <div className="text-xs text-[#a1a1aa] -mb-2">Estações do chão</div>
            </>
          ) : (
            <OrdemEditor b={b} setBloco={p.setBloco} />
          )}

          <div className="overflow-x-auto border border-[#2a2a31] rounded-xl">
            <div className="min-w-[960px] grid grid-cols-[1.3fr_0.55fr_0.65fr_1fr_2.1fr_1.2fr_0.9fr_40px] text-[13px]">
              {['Estação', 'Postos', 'Pessoas', 'Dupla', 'O que fazer', 'Meta', 'Carga F / M', ''].map((h, k) => (
                <div key={k} className="px-3 py-2.5 bg-[#222228] text-[#a1a1aa] text-xs">{h}</div>
              ))}
              {linhas.length === 0 && (
                <div className="col-span-8 px-3 py-4 border-t border-[#2a2a31] text-[#a1a1aa]">{ab ? 'Nenhuma estação no chão ainda.' : 'Nenhuma estação ainda.'}</div>
              )}
              {linhas.map(e => (
                <LinhaEstacao key={e.id} e={e} set={patch => p.setEstacao(e.id, patch)} remover={() => p.removerEstacao(e.id)} />
              ))}
            </div>
          </div>
          <select
            value=""
            onChange={e => { if (e.target.value) p.addEstacao(e.target.value as Estacao) }}
            aria-label="Adicionar estação"
            className={`${cls.btnTracejado} appearance-none cursor-pointer`}
          >
            <option value="">+ Adicionar estação</option>
            {ESTACOES.filter(s => !ab || s.key !== 'corrida').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          {ab && <RoteiroAB b={b} setBloco={p.setBloco} />}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Formato', formatoLabel], [labelTempo, mmss(b.etapa_seg)], ['Transição', mmss(b.transicao_seg)], ['Rounds', String(b.rounds)]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-[#0e0e11] border border-[#2a2a31] px-3.5 py-2.5">
                <div className="text-xs text-[#a1a1aa]">{k}</div>
                <div className="font-medium">{v}</div>
              </div>
            ))}
          </div>
          <div className="text-[#a1a1aa]">
            {b.formato === 'grupos_ab'
              ? `Grupo A começa ${aComeca === 'corrida' ? 'na esteira' : 'nas estações'}, Grupo B ${aComeca === 'corrida' ? 'nas estações' : 'na esteira'}. ${rodizioChaoLigado(b) ? 'A cada volta ao chão, a dupla vai para a próxima estação. ' : ''}`
              : ordem.length ? `${b.formato === 'circuito' ? 'Ordem do circuito' : 'Ordem das estações'}: ${ordem.map(nomeEstacao).join(' → ')}. ` : ''}
            {usadas.length ? `Estações em uso: ${usadas.join(', ')}. ` : 'Sem estações. '}
            <button onClick={p.onAbrir} className="text-[#ff6db8] hover:text-[#ff9fd0] underline">Editar estações</button>
          </div>
        </>
      )}

      {p.ultimo && (
        <button onClick={p.onAddBloco} className={cls.btnTracejado}>+ Adicionar bloco</button>
      )}
    </section>
  )
}

// Esteira do Grupos A/B: fica aqui, fora da tabela (que é só do chão).
function EsteiraAB({ b, setBloco, setEstacao }: {
  b: Bloco
  setBloco: (patch: Partial<Bloco>) => void
  setEstacao: (eid: string, patch: Partial<EstacaoRow>) => void
}) {
  const corrida = b.estacoes.find(e => e.estacao === 'corrida')
  const setCorrida = (patch: Partial<EstacaoRow>) => {
    if (corrida) setEstacao(corrida.id, patch)
    else setBloco({ estacoes: [{ ...estacaoVazia('corrida', b.estacoes), ...patch }, ...b.estacoes] })
  }
  return (
    <div className="rounded-xl bg-[#0e0e11] border border-[#2a2a31] px-3.5 py-3 flex flex-col gap-3">
      <div className="text-xs text-[#ff6db8] font-medium">Esteira</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <label className={cls.label}>Alunos na corrida
          <NumInput valor={b.alunos_corrida} onChange={n => setBloco({ alunos_corrida: n })} />
        </label>
        <label className={cls.label}>Corrida
          <select value={b.corrida_em_dupla ? 'dupla' : 'individual'} onChange={e => setBloco({ corrida_em_dupla: e.target.value === 'dupla' })} className={cls.input}>
            <option value="individual">Individual</option>
            <option value="dupla">Em dupla</option>
          </select>
        </label>
        <label className={cls.label}>Esteiras
          <input value={corrida?.postos || ''} inputMode="numeric" onChange={e => setCorrida({ postos: e.target.value.replace(/\D/g, '') })} className={cls.input} />
        </label>
        <label className={cls.label}>Dupla
          <select value={corrida?.modo_dupla || 'individual'} onChange={e => setCorrida({ modo_dupla: e.target.value as ModoDupla })} className={cls.input}>
            {MODOS_DUPLA.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
        <label className={cls.label}>O que fazer
          <input value={corrida?.instrucao || ''} onChange={e => setCorrida({ instrucao: e.target.value })} className={cls.input} />
        </label>
        <label className={cls.label}>Meta
          <input value={corrida?.meta || ''} onChange={e => setCorrida({ meta: e.target.value })} className={cls.input} />
        </label>
      </div>
    </div>
  )
}

// Roteiro do Grupos A/B: rodízio no chão + etapa por etapa, gerado do que está preenchido.
function RoteiroAB({ b, setBloco }: { b: Bloco; setBloco: (patch: Partial<Bloco>) => void }) {
  const chao = estacoesChao(b)
  const rod = rodizioChaoLigado(b)
  const etapas = roteiroAB(b)
  const n = chao.length
  const voltas = b.rounds
  const grupoChao = (e: { aEsteira: boolean }) => (e.aEsteira ? 'B' : 'A')
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={rod}
          onChange={e => setBloco({ rodizio: { ...b.rodizio, rodizio_chao: e.target.checked } })}
          className="w-5 h-5 mt-0.5 accent-[#ff2d9b]"
        />
        <span>
          <span className="font-medium">Rodízio no chão</span>
          <span className="block text-xs text-[#a1a1aa]">A cada volta ao chão, a dupla vai para a próxima estação, sem repetir.</span>
        </span>
      </label>

      {rod && n > 0 && voltas !== n && (
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[#2a210b] text-[#f3dfb2]">
          <span>
            Com {n} {n === 1 ? 'estação' : 'estações'} no chão, são {n} rounds para todo mundo passar por todas
            {voltas < n ? ` (hoje cada dupla passa por ${voltas}).` : ` (com ${voltas}, ${voltas - n === 1 ? 'uma estação repete' : 'algumas estações repetem'}).`}
          </span>
          <button onClick={() => setBloco({ rounds: n })} className="min-h-[36px] px-3 rounded-lg bg-[#ffd27a] text-[#2a1d00] font-semibold">
            Usar {n} rounds
          </button>
        </div>
      )}

      {n > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-[#a1a1aa]">Rodízio no chão · cada linha é onde a dupla está em cada volta ao chão</div>
          <div className="overflow-x-auto border border-[#2a2a31] rounded-xl">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="bg-[#222228] text-[#a1a1aa] text-xs">
                  <th className="px-3 py-2 text-left font-normal">Posição</th>
                  {Array.from({ length: voltas }, (_, v) => (
                    <th key={v} className="px-3 py-2 text-left font-normal whitespace-nowrap">{v + 1}ª volta</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chao.map((e, p) => (
                  <tr key={e.id} className="border-t border-[#2a2a31]">
                    <td className="px-3 py-2 text-[#a1a1aa] whitespace-nowrap">{p + 1}{e.pessoas ? ` · ${e.pessoas} pessoas` : ''}</td>
                    {Array.from({ length: voltas }, (_, v) => (
                      <td key={v} className="px-3 py-2 whitespace-nowrap">{nomeEstacao(estacaoNaVolta(chao, p, v, rod)!)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-[#a1a1aa]">Quem desce da esteira pela primeira vez escolhe uma posição livre e segue a linha dela.</div>
        </div>
      )}

      {etapas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-[#a1a1aa]">Roteiro do bloco</div>
          <div className="border border-[#2a2a31] rounded-xl divide-y divide-[#2a2a31] text-[13px]">
            {etapas.map(e => (
              <div key={e.n} className="px-3 py-2 flex flex-wrap gap-x-3 gap-y-0.5 items-baseline">
                <span className="text-[#a1a1aa] w-[150px] shrink-0">Etapa {e.n} · {mmss(e.inicio)}–{mmss(e.fim)}</span>
                <span><span className="text-[#ff6db8]">Esteira:</span> Grupo {e.aEsteira ? 'A' : 'B'}</span>
                <span>
                  <span className="text-[#a1a1aa]">Chão:</span> Grupo {grupoChao(e)}
                  {n > 0 ? (rod ? ` · ${e.voltaChao + 1}ª volta (${e.voltaChao === 0 ? 'cada dupla numa posição' : 'próxima estação'})` : ' · mesma estação') : ''}
                </span>
                {b.transicao_seg > 0 && <span className="text-[#a1a1aa]">+ transição {mmss(b.transicao_seg)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OrdemEditor({ b, setBloco }: { b: Bloco; setBloco: (patch: Partial<Bloco>) => void }) {
  const ordem = (b.rodizio.ordem || []).filter(id => b.estacoes.some(e => e.id === id))
  const porId = new Map(b.estacoes.map(e => [e.id, e]))
  const titulo = b.formato === 'circuito' ? 'Ordem do circuito' : 'Ordem das estações'
  const setOrdem = (o: string[]) => setBloco({ rodizio: { ...b.rodizio, ordem: o } })
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-[#a1a1aa]">{titulo}{ordem.length === 0 ? ' · vazia: segue a ordem da tabela' : ''}</div>
      <div className="flex flex-wrap items-center gap-2">
        {ordem.map((id, k) => (
          <span key={k} className="inline-flex items-center gap-1">
            {k > 0 && <span className="text-[#a1a1aa]">→</span>}
            <span className={`inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-[#222228] ${porId.get(id)!.estacao === 'corrida' ? 'text-[#ff6db8]' : 'text-[#f2f2f4]'}`}>
              {nomeEstacao(porId.get(id)!)}
              <button onClick={() => setOrdem(ordem.filter((_, j) => j !== k))} aria-label="Tirar da ordem" className="w-6 h-6 inline-flex items-center justify-center text-[#a1a1aa] hover:text-[#ff8a9a]">
                <X size={12} />
              </button>
            </span>
          </span>
        ))}
        <select
          value=""
          onChange={e => { if (e.target.value) setOrdem([...ordem, e.target.value]) }}
          disabled={!b.estacoes.length}
          aria-label="Adicionar estação na ordem"
          className="min-h-[36px] px-3 rounded-full border border-dashed border-[#4a4a54] bg-transparent text-[#d4d4d8] disabled:opacity-40"
        >
          <option value="">{b.estacoes.length ? '+ estação na ordem' : 'adicione estações na tabela'}</option>
          {b.estacoes.map(e => <option key={e.id} value={e.id}>{nomeEstacao(e)}</option>)}
        </select>
      </div>
    </div>
  )
}

function LinhaEstacao({ e, set, remover }: { e: EstacaoRow; set: (patch: Partial<EstacaoRow>) => void; remover: () => void }) {
  const cel = 'px-1.5 py-1.5 border-t border-[#2a2a31] flex items-center'
  return (
    <>
      <div className={`${cel} flex-col items-stretch gap-1`}>
        <select
          value={e.estacao}
          onChange={ev => set({ estacao: ev.target.value as Estacao })}
          aria-label="Estação"
          className={`${cls.inputTabela} font-medium ${e.estacao === 'corrida' ? '!text-[#ff6db8]' : ''}`}
        >
          {ESTACOES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {e.estacao === 'funcional' && (
          <input value={e.rotulo} onChange={ev => set({ rotulo: ev.target.value })} placeholder="Funcional A" aria-label="Rótulo" className={`${cls.inputTabela} text-xs`} />
        )}
      </div>
      <div className={cel}><input value={e.postos} inputMode="numeric" onChange={ev => set({ postos: ev.target.value.replace(/\D/g, '') })} aria-label="Postos" className={cls.inputTabela} /></div>
      <div className={cel}><input value={e.pessoas} inputMode="numeric" onChange={ev => set({ pessoas: ev.target.value.replace(/\D/g, '') })} aria-label="Pessoas" className={cls.inputTabela} /></div>
      <div className={cel}>
        <select value={e.modo_dupla} onChange={ev => set({ modo_dupla: ev.target.value as ModoDupla })} aria-label="Dupla" className={cls.inputTabela}>
          {MODOS_DUPLA.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>
      <div className={cel}><input value={e.instrucao} onChange={ev => set({ instrucao: ev.target.value })} aria-label="O que fazer" className={cls.inputTabela} /></div>
      <div className={cel}><input value={e.meta} onChange={ev => set({ meta: ev.target.value })} aria-label="Meta" className={cls.inputTabela} /></div>
      <div className={`${cel} gap-1`}>
        <input value={e.carga_f} onChange={ev => set({ carga_f: ev.target.value })} placeholder="F" aria-label="Carga F" className={cls.inputTabela} />
        <span className="text-[#a1a1aa]">/</span>
        <input value={e.carga_m} onChange={ev => set({ carga_m: ev.target.value })} placeholder="M" aria-label="Carga M" className={cls.inputTabela} />
      </div>
      <div className={`${cel} justify-center`}>
        <button onClick={remover} aria-label="Remover estação" className="w-8 h-8 inline-flex items-center justify-center text-[#a1a1aa] hover:text-[#ff8a9a]"><X size={14} /></button>
      </div>
    </>
  )
}

// ---- Prévia da TV (estática na fase 1: mostra o começo do primeiro bloco) ---------

function PreviaTV({ t }: { t: Treino }) {
  const b = t.blocos[0]
  let topo = '', grupos: { k: string; v: string }[] = [], proximo = ''
  if (b) {
    topo = `Bloco 1 · round 1 de ${b.rounds}`
    const corrida = b.estacoes.find(e => e.estacao === 'corrida')
    const txtCorrida = `Esteira${corrida?.instrucao ? ` · ${corrida.instrucao}` : ''}`
    if (b.formato === 'grupos_ab') {
      const aCorre = (b.rodizio.a_comeca || 'corrida') === 'corrida'
      const txtChao = estacoesChao(b).length ? 'Chão · 1ª volta' : 'Chão'
      grupos = [
        { k: 'Grupo A', v: aCorre ? txtCorrida : txtChao },
        { k: 'Grupo B', v: aCorre ? txtChao : txtCorrida },
      ]
      proximo = `Próximo: transição ${mmss(b.transicao_seg)} → troca de lado`
    } else {
      const o = ordemCircuito(b)
      const agora = o[0], depois = o[1] || o[0]
      grupos = [
        { k: 'Agora', v: agora ? nomeEstacao(agora) : '—' },
        { k: 'A seguir', v: depois ? nomeEstacao(depois) : '—' },
      ]
      proximo = `Próximo: transição ${mmss(b.transicao_seg)} → ${depois ? nomeEstacao(depois) : 'próxima estação'}`
    }
  }
  return (
    <section className={`${cls.card} p-5 flex flex-col gap-3`}>
      <div className="text-xs text-[#a1a1aa]">Prévia da TV</div>
      <div className="bg-black rounded-xl p-[18px] flex flex-col gap-2.5 aspect-video justify-between">
        {b ? (
          <>
            <div className="flex justify-between text-xs text-[#a1a1aa]">
              <span>{topo}</span><span>total {mmss(t.aquecimento_seg + t.explicacao_seg)} / {mmss(t.duracao_seg)}</span>
            </div>
            <div className={`${cls.titulo} text-[56px] font-bold text-center text-[#ff2d9b] leading-none`}>{mmss(b.etapa_seg)}</div>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              {grupos.map(g => (
                <div key={g.k} className="bg-[#1c1c22] rounded-lg px-2.5 py-2 min-w-0">
                  <div className="text-[#a1a1aa] text-[11px]">{g.k}</div>
                  <div className="font-semibold truncate">{g.v}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-[#a1a1aa] text-center">{proximo}</div>
          </>
        ) : (
          <div className="m-auto text-[#a1a1aa] text-xs">Adicione um bloco para ver a prévia.</div>
        )}
      </div>
    </section>
  )
}
