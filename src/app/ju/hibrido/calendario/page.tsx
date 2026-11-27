'use client'
// Calendário de treinos híbridos: dias com aula híbrida × faixas 1–4.
// Até a modalidade existir na grade (fase 2), o dia híbrido é marcado à mão (hibrido_dias).
// Destaque: faixas prováveis do dia (média de reservas do Running da VO, 8 semanas) sem treino.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import { hojeSP } from '@/lib/tempo'
import {
  FAIXAS, UNIDADE_VO, MediaHorario,
  carregarMedias, faixasProvaveis, diaSemana, faixaDeAlunos, addDias, fmtDia, FAIXA_PADRAO, faixaComTreino,
} from '@/lib/hibrido'
import { cls } from '../ui'

const JANELA = 28

type Prog = { data: string; faixa: number; treino_id: string; nome: string }

export default function CalendarioHibridoPage() {
  const supabase = createClient()
  const hoje = hojeSP()
  const [inicio, setInicio] = useState(hoje)
  const fim = addDias(inicio, JANELA - 1)
  const [dias, setDias] = useState<string[]>([])
  const [progs, setProgs] = useState<Prog[]>([])
  const [medias, setMedias] = useState<MediaHorario[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [novoDia, setNovoDia] = useState('')
  const [gradeHib, setGradeHib] = useState<Map<string, { horario: string; reservas: number }[]>>(new Map())

  async function carregar() {
    setErro('')
    const [d, p, g] = await Promise.all([
      supabase.from('hibrido_dias').select('data').eq('unidade_id', UNIDADE_VO).gte('data', inicio).lte('data', fim),
      supabase.from('hibrido_programacao').select('data, faixa, treino_id, hibrido_treinos(nome)')
        .eq('unidade_id', UNIDADE_VO).gte('data', inicio).lte('data', fim),
      // Aulas de Treino Híbrido da grade (fase 2), com as reservas ativas
      supabase.from('club_ocorrencias').select('data, club_aulas!inner(horario, tipo, unidade_id), club_reservas(status)')
        .gte('data', inicio).lte('data', fim).neq('status', 'cancelada')
        .eq('club_aulas.tipo', 'treino_hibrido').eq('club_aulas.unidade_id', UNIDADE_VO),
    ])
    if (d.error) setErro(d.error.message)
    else if (p.error) setErro(p.error.message)
    const grade = new Map<string, { horario: string; reservas: number }[]>()
    ;(g.data || []).forEach((o: any) => {
      const reservas = (o.club_reservas || []).filter((r: any) => r.status === 'reservado' || r.status === 'presente').length
      const l = grade.get(o.data) || []
      l.push({ horario: String(o.club_aulas.horario).slice(0, 5), reservas })
      grade.set(o.data, l.sort((a, b) => a.horario.localeCompare(b.horario)))
    })
    setGradeHib(grade)
    setDias((d.data || []).map((r: any) => r.data))
    setProgs((p.data || []).map((r: any) => ({ data: r.data, faixa: r.faixa, treino_id: r.treino_id, nome: r.hibrido_treinos?.nome || '' })))
    setLoading(false)
  }

  useEffect(() => { carregarMedias(supabase).then(setMedias) }, [])
  useEffect(() => { setLoading(true); carregar() }, [inicio])

  // Dias marcados + dias que já têm treino programado
  const linhas = useMemo(
    () => Array.from(new Set([...dias, ...progs.map(p => p.data), ...Array.from(gradeHib.keys())])).sort(),
    [dias, progs, gradeHib]
  )
  const porChave = useMemo(() => new Map(progs.map(p => [`${p.data}|${p.faixa}`, p])), [progs])

  async function marcar() {
    if (!novoDia) return
    const { error } = await supabase.from('hibrido_dias')
      .upsert({ data: novoDia, unidade_id: UNIDADE_VO }, { onConflict: 'data,unidade_id', ignoreDuplicates: true })
    if (error) { setErro(error.message); return }
    setNovoDia('')
    if (novoDia < inicio || novoDia > fim) setInicio(novoDia)
    else carregar()
  }

  async function desmarcar(data: string) {
    const temTreino = progs.some(p => p.data === data)
    if (!confirm(temTreino
      ? `Desmarcar ${fmtDia(data).completo} como dia híbrido? Os treinos programados continuam no dia.`
      : `Desmarcar ${fmtDia(data).completo} como dia híbrido?`)) return
    const { error } = await supabase.from('hibrido_dias').delete().eq('data', data).eq('unidade_id', UNIDADE_VO)
    if (error) { setErro(error.message); return }
    carregar()
  }

  const fIni = fmtDia(inicio)
  const fFim = fmtDia(fim)

  // Tudo que a linha de um dia precisa (usado na tabela do desktop e nos cartões do celular)
  function infoDia(d: string) {
    const aulasGrade = gradeHib.get(d)
    const mediasDia = medias.filter(m => m.dia_semana === diaSemana(d))
    // Com aula de Híbrido na grade: faixa de cada aula = maior entre reservas já feitas e a média do horário
    const faixaAula = (a: { horario: string; reservas: number }) => {
      const m = mediasDia.find(x => x.horario.slice(0, 5) === a.horario)
      return faixaDeAlunos(Math.max(a.reservas, Math.round(m?.media || 0)))
    }
    const prov = FAIXA_PADRAO ? new Set([FAIXA_PADRAO]) : aulasGrade ? new Set(aulasGrade.map(faixaAula)) : faixasProvaveis(medias, d)
    const horarios = aulasGrade ? [] : mediasDia
    const programadasDia = FAIXAS.map(x => x.n).filter(n => porChave.has(`${d}|${n}`))
    const faltando = Array.from(prov).filter(n => !faixaComTreino(n, programadasDia))
    return {
      f: fmtDia(d), aulasGrade, faixaAula, prov, horarios, programadasDia, faltando,
      alerta: d >= hoje && faltando.length > 0,
      marcado: dias.includes(d),
    }
  }
  type Info = ReturnType<typeof infoDia>

  function cabecaDia(d: string, x: Info) {
    return (
      <>
        <div className="flex items-center gap-2">
          <span className="font-medium"><span className="capitalize">{x.f.sem}</span> {x.f.dm}{d === hoje ? ' · hoje' : ''}</span>
          {x.marcado && (
            <button onClick={() => desmarcar(d)} aria-label="Desmarcar dia híbrido" className="text-[#a1a1aa] hover:text-[#ff8a9a] text-base leading-none px-1 min-w-[32px] min-h-[32px] md:min-w-0 md:min-h-0">×</button>
          )}
        </div>
        {x.alerta && (
          <div className="text-xs text-[#ffd27a]">
            Falta treino {x.faltando.length === 1 ? 'na faixa provável' : 'nas faixas prováveis'}: {x.faltando.sort().map(n => `Faixa ${n}`).join(', ')}
          </div>
        )}
        {x.aulasGrade && (
          <div className="text-[11px] text-[#a1a1aa]" title="Aulas de Treino Híbrido na grade: reservas feitas até agora e a faixa provável (reservas ou média do horário, o que for maior)">
            Aulas: {x.aulasGrade.map(a => `${a.horario} · ${a.reservas} res. (F${x.faixaAula(a)})`).join(' · ')}
          </div>
        )}
        {x.horarios.length > 0 && (
          <div className="text-[11px] text-[#a1a1aa]" title="Média de reservas (presenças + faltas) do Running nas últimas 8 semanas">
            Reservas: {x.horarios.map(h => `${h.horario.slice(0, 5)} ~${Math.round(h.media)} (F${faixaDeAlunos(Math.round(h.media))})`).join(' · ')}
          </div>
        )}
      </>
    )
  }

  function celulaFaixa(d: string, x: Info, n: number) {
    const p = porChave.get(`${d}|${n}`)
    // Faixa 3 sem treino próprio usa o da Faixa 2
    const emprestado = !p && faixaComTreino(n, x.programadasDia) === 2 ? porChave.get(`${d}|2`) : undefined
    const provavel = x.prov.has(n)
    return p ? (
      <Link href={`/ju/hibrido/${p.treino_id}?data=${d}`}
        className="block h-full rounded-lg px-2.5 py-2 bg-[#0f2a1e] text-[#7ff0bd] hover:ring-1 hover:ring-[#7ff0bd]">
        <div className="font-medium line-clamp-2">{p.nome}</div>
      </Link>
    ) : emprestado ? (
      <Link href={`/ju/hibrido/novo?data=${d}&faixa=${n}`}
        title="Sem treino próprio: a Faixa 3 usa o da Faixa 2. Clique para montar um só da Faixa 3."
        className="block h-full rounded-lg px-2.5 py-2 border border-dashed border-[#2f5a45] text-[#7ff0bd] hover:border-[#7ff0bd]">
        <div className="text-xs text-[#a1a1aa]">usa o da Faixa 2</div>
        <div className="font-medium line-clamp-2">{emprestado.nome}</div>
      </Link>
    ) : (
      <Link href={`/ju/hibrido/novo?data=${d}&faixa=${n}`}
        className={`block h-full rounded-lg px-2.5 py-2 border border-dashed ${
          provavel && d >= hoje
            ? 'border-[#ffd27a] text-[#ffd27a] bg-[#2a210b]'
            : 'border-[#3a3a42] text-[#a1a1aa]'
        } hover:border-[#ff2d9b]`}>
        falta montar
      </Link>
    )
  }

  return (
    <div className="max-w-[1380px] mx-auto flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-[#a1a1aa] tracking-[0.04em]">
            Área da Ju › <Link href="/ju/hibrido" className="hover:text-[#ff6db8]">Treinos híbridos</Link> › Calendário
          </div>
          <h1 className={`${cls.titulo} m-0 text-[26px] md:text-[32px] font-bold tracking-[-0.01em]`}>Calendário híbrido</h1>
          <div className={cls.muted}>JustClub Vila Olímpia · qual treino vale em cada dia e faixa</div>
        </div>
        <div className="flex items-end gap-2 w-full md:w-auto">
          <label className={`${cls.label} flex-1 md:flex-none`}>Marcar dia híbrido
            <input type="date" value={novoDia} onChange={e => setNovoDia(e.target.value)} className={cls.input} />
          </label>
          <button onClick={marcar} disabled={!novoDia} className={cls.btnRosa}>Marcar</button>
        </div>
      </div>

      {erro && <div className="px-4 py-3 rounded-xl bg-[#3a0f16] text-[#ff8a9a] font-medium">{erro}</div>}

      <div className="flex items-center justify-between">
        <button onClick={() => setInicio(addDias(inicio, -JANELA))} aria-label="Semanas anteriores" className={`${cls.btnIcone} !w-11 !h-11 text-lg`}>‹</button>
        <div className="text-center">
          <div className="font-medium">{fIni.dm} – {fFim.dm}</div>
          {inicio !== hoje && (
            <button onClick={() => setInicio(hoje)} className="text-xs text-[#ff6db8] min-h-[32px]">voltar para as próximas semanas</button>
          )}
        </div>
        <button onClick={() => setInicio(addDias(inicio, JANELA))} aria-label="Próximas semanas" className={`${cls.btnIcone} !w-11 !h-11 text-lg`}>›</button>
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* Celular: um cartão por dia, com as faixas uma embaixo da outra */}
          <section className="md:hidden flex flex-col gap-3 text-[13px]">
            {linhas.length === 0 && (
              <div className={`${cls.card} px-4 py-6 text-[#a1a1aa]`}>
                Nenhum dia híbrido nestas semanas. Marque o dia no topo da tela.
              </div>
            )}
            {linhas.map(d => {
              const x = infoDia(d)
              // Só a faixa usada (Faixa 3) + as que já têm treino; as demais ficam de fora para não poluir
              const faixasDia = FAIXAS.filter(fx => x.prov.has(fx.n) || porChave.has(`${d}|${fx.n}`))
              return (
                <div key={d} className={`${cls.card} p-4 flex flex-col gap-2.5 ${x.alerta ? '!border-[#6b4f12] bg-[#1f1a0d]' : ''}`}>
                  <div className="flex flex-col gap-0.5 text-[14px]">{cabecaDia(d, x)}</div>
                  {(faixasDia.length ? faixasDia : FAIXAS).map(fx => (
                    <div key={fx.n} className="flex flex-col gap-1">
                      <div className="text-[11px] text-[#a1a1aa]">Faixa {fx.n} · {fx.curto}</div>
                      {celulaFaixa(d, x, fx.n)}
                    </div>
                  ))}
                </div>
              )
            })}
          </section>

          <section className={`${cls.card} overflow-x-auto hidden md:block`}>
            <div className="min-w-[860px] grid grid-cols-[1.3fr_repeat(3,minmax(0,1fr))] text-[13px]">
              <div className="px-3 py-2.5 bg-[#222228] text-[#a1a1aa] text-xs">Dia</div>
              {FAIXAS.map(f => (
                <div key={f.n} className="px-3 py-2.5 bg-[#222228] text-[#a1a1aa] text-xs">Faixa {f.n} · {f.curto}</div>
              ))}

              {linhas.length === 0 && (
                <div className="col-span-5 px-3 py-6 text-[#a1a1aa] border-t border-[#2a2a31]">
                  Nenhum dia híbrido nestas semanas. Marque o dia no topo da tela.
                </div>
              )}

              {linhas.map(d => {
                const x = infoDia(d)
                const cel = `px-2 py-2 border-t border-[#2a2a31] ${x.alerta ? 'bg-[#1f1a0d]' : ''}`
                return (
                  <div key={d} className="contents">
                    <div className={`${cel} px-3 flex flex-col gap-0.5`}>{cabecaDia(d, x)}</div>
                    {FAIXAS.map(fx => <div key={fx.n} className={cel}>{celulaFaixa(d, x, fx.n)}</div>)}
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
