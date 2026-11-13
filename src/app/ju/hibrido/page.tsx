'use client'
// Biblioteca de treinos híbridos: todos os treinos e modelos, com uso (vezes e última data)
// para não repetir treino em pouco tempo — mesma ideia de admin/playlists.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import { hojeSP } from '@/lib/tempo'
import {
  Estacao, ESTACOES, FAIXAS, UNIDADE_VO,
  listarTreinos, carregarTreino, salvarTreino, clonarBlocos, programar, estacoesUsadas, labelEstacao, mmss, fmtData, fmtDia,
} from '@/lib/hibrido'
import { cls, Modal } from './ui'

type Item = {
  id: string
  nome: string
  faixa: number
  duracao_seg: number
  modelo: boolean
  estacoes: Estacao[]
  vezes: number
  ultima: string | null
}

type FiltroEst = Partial<Record<Estacao, 'com' | 'sem'>>

export default function BibliotecaHibridoPage() {
  const supabase = createClient()
  const router = useRouter()
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [faixa, setFaixa] = useState<number | null>(null)
  const [filtroEst, setFiltroEst] = useState<FiltroEst>({})
  const [usar, setUsar] = useState<Item | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  async function carregar() {
    const hoje = hojeSP()
    const [{ data, error }, { data: progs }] = await Promise.all([
      listarTreinos(supabase),
      supabase.from('hibrido_programacao').select('treino_id, data').eq('unidade_id', UNIDADE_VO).lte('data', hoje),
    ])
    if (error) setErro(error.message)
    // Uso = dias já programados até hoje
    const uso = new Map<string, { vezes: number; ultima: string | null }>()
    ;(progs || []).forEach((p: any) => {
      const u = uso.get(p.treino_id) || { vezes: 0, ultima: null }
      u.vezes++
      if (!u.ultima || p.data > u.ultima) u.ultima = p.data
      uso.set(p.treino_id, u)
    })
    setItens(data.map((t: any) => ({
      id: t.id,
      nome: t.nome,
      faixa: t.faixa,
      duracao_seg: t.duracao_seg,
      modelo: t.modelo,
      estacoes: estacoesUsadas((t.hibrido_blocos || []).map((b: any) => ({ estacoes: b.hibrido_estacoes || [] }))),
      vezes: uso.get(t.id)?.vezes || 0,
      ultima: uso.get(t.id)?.ultima || null,
    })))
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const lista = useMemo(() => itens.filter(t =>
    (faixa === null || t.faixa === faixa) &&
    Object.entries(filtroEst).every(([e, f]) => (f === 'com' ? t.estacoes.includes(e as Estacao) : !t.estacoes.includes(e as Estacao)))
  ), [itens, faixa, filtroEst])

  function ciclar(e: Estacao) {
    setFiltroEst(f => {
      const n = { ...f }
      if (!f[e]) n[e] = 'com'
      else if (f[e] === 'com') n[e] = 'sem'
      else delete n[e]
      return n
    })
  }

  function aviso(m: string) {
    setMsg(m)
    setTimeout(() => setMsg(''), 2500)
  }

  async function duplicar(t: Item) {
    setOcupado(t.id)
    const tr = await carregarTreino(supabase, t.id)
    if (!tr) { setOcupado(null); setErro('Treino não encontrado'); return }
    const { id, erro: e } = await salvarTreino(supabase, { ...tr, id: null, nome: `${tr.nome} (cópia)`, blocos: clonarBlocos(tr.blocos) })
    setOcupado(null)
    if (e || !id) { setErro(e || 'Não foi possível duplicar'); return }
    aviso('Treino duplicado')
    carregar()
  }

  if (loading) return <Spinner />

  return (
    <div className="max-w-[1380px] mx-auto flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-[#a1a1aa] tracking-[0.04em]">Área da Ju › Treinos híbridos</div>
          <h1 className={`${cls.titulo} m-0 text-[32px] font-bold tracking-[-0.01em]`}>Treinos híbridos</h1>
          <div className={cls.muted}>JustClub Vila Olímpia · sala de Running (dias híbridos)</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/ju/hibrido/calendario" className={`${cls.btn} inline-flex items-center`}>Calendário híbrido</Link>
          <Link href="/ju/hibrido/novo" className={`${cls.btnRosa} inline-flex items-center`}>Novo treino</Link>
        </div>
      </div>

      {msg && <div className="px-4 py-3 rounded-xl bg-[#0f2a1e] text-[#7ff0bd] font-medium">{msg}</div>}
      {erro && <div className="px-4 py-3 rounded-xl bg-[#3a0f16] text-[#ff8a9a] font-medium">{erro}</div>}

      <section className={`${cls.card} p-5 flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#a1a1aa] w-16">Faixa</span>
          {[null, 1, 2, 3, 4].map(f => (
            <button key={String(f)} onClick={() => setFaixa(f)}
              className={`min-h-[36px] px-3 rounded-full text-[13px] border ${faixa === f ? 'border-[#ff2d9b] bg-[#2a0f1e] text-[#ffd6ea]' : 'border-[#3a3a42] text-[#d4d4d8]'}`}>
              {f === null ? 'Todas' : `Faixa ${f}`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#a1a1aa] w-16">Estações</span>
          {ESTACOES.map(e => {
            const f = filtroEst[e.key]
            return (
              <button key={e.key} onClick={() => ciclar(e.key)}
                className={`min-h-[36px] px-3 rounded-full text-[13px] border ${
                  f === 'com' ? 'border-[#7ff0bd] bg-[#0f2a1e] text-[#7ff0bd]'
                    : f === 'sem' ? 'border-[#ff8a9a] bg-[#3a0f16] text-[#ff8a9a]'
                      : 'border-[#3a3a42] text-[#d4d4d8]'
                }`}>
                {f ? `${f} ${e.label.toLowerCase()}` : e.label}
              </button>
            )
          })}
          <span className="text-xs text-[#a1a1aa]">toque: com → sem → tanto faz</span>
        </div>
      </section>

      <section className={`${cls.card} overflow-x-auto`}>
        <div className="min-w-[860px] grid grid-cols-[2fr_0.6fr_0.6fr_1.8fr_0.6fr_0.8fr_auto] text-[13px]">
          {['Treino', 'Faixa', 'Duração', 'Estações', 'Usado', 'Última vez', ''].map((h, k) => (
            <div key={k} className="px-3 py-2.5 bg-[#222228] text-[#a1a1aa] text-xs">{h}</div>
          ))}
          {lista.length === 0 && (
            <div className="col-span-7 px-3 py-6 text-[#a1a1aa] border-t border-[#2a2a31]">
              {itens.length ? 'Nenhum treino com esses filtros.' : 'Nenhum treino montado ainda.'}
            </div>
          )}
          {lista.map(t => (
            <Linha key={t.id} t={t} ocupado={ocupado === t.id}
              onAbrir={() => router.push(`/ju/hibrido/${t.id}`)}
              onDuplicar={() => duplicar(t)}
              onUsar={() => setUsar(t)} />
          ))}
        </div>
      </section>

      {usar && <UsarNoDia t={usar} onClose={() => setUsar(null)} onDone={m => { setUsar(null); aviso(m); carregar() }} />}
    </div>
  )
}

function Linha({ t, ocupado, onAbrir, onDuplicar, onUsar }: { t: Item; ocupado: boolean; onAbrir: () => void; onDuplicar: () => void; onUsar: () => void }) {
  const cel = 'px-3 py-2.5 border-t border-[#2a2a31] flex items-center'
  return (
    <>
      <div className={`${cel} gap-2 min-w-0`}>
        <Link href={`/ju/hibrido/${t.id}`} className="font-medium hover:text-[#ff6db8] truncate">{t.nome}</Link>
        {t.modelo && <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#2a0f1e] text-[#ffb3d8] text-[11px]">modelo</span>}
      </div>
      <div className={cel}>Faixa {t.faixa}</div>
      <div className={cel}>{mmss(t.duracao_seg)}</div>
      <div className={`${cel} text-[#d4d4d8]`}>{t.estacoes.map(labelEstacao).join(', ') || '—'}</div>
      <div className={cel}>{t.vezes}x</div>
      <div className={`${cel} text-[#a1a1aa]`}>{fmtData(t.ultima)}</div>
      <div className={`${cel} gap-1.5 justify-end`}>
        <button onClick={onAbrir} className={`${cls.btn} !min-h-[36px] !px-3 text-[13px]`}>Abrir</button>
        <button onClick={onDuplicar} disabled={ocupado} className={`${cls.btn} !min-h-[36px] !px-3 text-[13px]`}>{ocupado ? 'Duplicando…' : 'Duplicar'}</button>
        <button onClick={onUsar} className={`${cls.btn} !min-h-[36px] !px-3 text-[13px] !border-[#ff2d9b] text-[#ffb3d8]`}>Usar neste dia</button>
      </div>
    </>
  )
}

function UsarNoDia({ t, onClose, onDone }: { t: Item; onClose: () => void; onDone: (m: string) => void }) {
  const supabase = createClient()
  const [data, setData] = useState(hojeSP())
  const [faixa, setFaixa] = useState(t.faixa)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    if (!data) return
    setSalvando(true)
    setErro('')
    const { data: atual } = await supabase.from('hibrido_programacao').select('treino_id, hibrido_treinos(nome)')
      .eq('data', data).eq('faixa', faixa).eq('unidade_id', UNIDADE_VO).maybeSingle()
    if (atual && atual.treino_id !== t.id &&
      !confirm(`${fmtDia(data).completo}, Faixa ${faixa} já tem "${(atual as any).hibrido_treinos?.nome}". Substituir?`)) {
      setSalvando(false)
      return
    }
    const e = await programar(supabase, data, faixa, t.id)
    setSalvando(false)
    if (e) { setErro(e); return }
    onDone(`Programado em ${fmtDia(data).completo}, Faixa ${faixa}`)
  }

  return (
    <Modal titulo="Usar neste dia" onClose={onClose}>
      <p className="text-[#a1a1aa] mb-4 truncate">{t.nome}</p>
      <label className={`${cls.label} mb-3`}>Data
        <input type="date" value={data} onChange={e => setData(e.target.value)} className={cls.input} />
      </label>
      <label className={`${cls.label} mb-4`}>Faixa
        <select value={faixa} onChange={e => setFaixa(Number(e.target.value))} className={cls.input}>
          {FAIXAS.map(f => <option key={f.n} value={f.n}>Faixa {f.n} · {f.curto}</option>)}
        </select>
      </label>
      {faixa !== t.faixa && <div className="text-xs text-[#ffd27a] mb-3">Este treino foi montado para a Faixa {t.faixa}.</div>}
      {erro && <div className="text-[#ff8a9a] mb-3">{erro}</div>}
      <button onClick={confirmar} disabled={salvando || !data} className={`${cls.btnRosa} w-full`}>
        {salvando ? 'Salvando…' : 'Programar'}
      </button>
    </Modal>
  )
}
