'use client'
// Treinos de Running & Hybrid do coach logado. O que ele salva cai na biblioteca geral,
// onde a Ju/admin vê todos e aloca para uma data. Aqui o coach só vê os próprios.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Spinner } from '@/components/ui'
import { estacoesUsadas, labelEstacao, mmss } from '@/lib/hibrido'
import { cls } from '@/app/ju/hibrido/ui'

type Item = { id: string; nome: string; faixa: number; duracao_seg: number; atualizado_em: string; estacoes: string[]; datas: string[] }

export default function CoachTreinosHibridoPage() {
  const supabase = createClient()
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: u } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('hibrido_treinos')
        .select('id, nome, faixa, duracao_seg, atualizado_em, hibrido_blocos(hibrido_estacoes(estacao))')
        .eq('criado_por', u?.user?.id || '')
        .order('atualizado_em', { ascending: false })
      if (error) setErro(error.message)
      setItens((data || []).map((t: any) => ({
        id: t.id, nome: t.nome, faixa: t.faixa, duracao_seg: t.duracao_seg, atualizado_em: t.atualizado_em,
        estacoes: estacoesUsadas((t.hibrido_blocos || []).map((b: any) => ({ estacoes: b.hibrido_estacoes || [] }))).map(labelEstacao),
        datas: [],
      })))
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-[#a1a1aa] tracking-[0.04em]">Área do coach › Running &amp; Hybrid</div>
          <h1 className={`${cls.titulo} m-0 text-[26px] md:text-[32px] font-bold tracking-[-0.01em]`}>Meus treinos</h1>
          <div className={cls.muted}>Monte o treino aqui (pode colar do Notes do celular). Ele vai para a biblioteca da Just, e a Ju escolhe a data.</div>
        </div>
        <Link href="/coach/hibrido/novo" className={`${cls.btnRosa} inline-flex items-center justify-center w-full md:w-auto`}>Novo treino</Link>
      </div>

      {erro && <div className="px-4 py-3 rounded-xl bg-[#3a0f16] text-[#ff8a9a] font-medium">{erro}</div>}

      <section className={`${cls.card} overflow-hidden`}>
        {itens.length === 0 ? (
          <div className="px-5 py-8 text-[#a1a1aa]">Você ainda não subiu nenhum treino.</div>
        ) : (
          <div className="divide-y divide-[#2a2a31]">
            {itens.map(t => (
              <Link key={t.id} href={`/coach/hibrido/${t.id}`} className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-x-4 gap-y-1 px-4 md:px-5 py-3.5 hover:bg-[#1f1f24]">
                <span className="font-medium md:flex-1 md:min-w-[200px] break-words">{t.nome}</span>
                <span className="text-[13px] text-[#a1a1aa]">Faixa {t.faixa} · {mmss(t.duracao_seg)}</span>
                <span className="text-[13px] text-[#a1a1aa]">{t.estacoes.join(', ') || 'sem estações'}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
