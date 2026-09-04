'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, KpiCard, EmptyState } from '@/components/ui'

// Espelha o que o cliente vê em /aulas (src/app/aulas/page.tsx).
// Se mudar as opções lá, mudar aqui também.
const ENQUETES = [
  {
    chave: 'horario_noite_vo_1830',
    titulo: 'Aula das 18:30 · JustClub Vila Olímpia',
    opcoes: [
      { valor: '18:00',     label: 'Antecipar para 18:00' },
      { valor: '18:15',     label: 'Antecipar para 18:15' },
      { valor: 'manter',    label: 'Manter às 18:30' },
      { valor: 'tanto_faz', label: 'Tanto faz' },
    ],
  },
  {
    chave: 'horario_noite_vo_1930',
    titulo: 'Aula das 19:30 · JustClub Vila Olímpia',
    opcoes: [
      { valor: '19:00',     label: 'Antecipar para 19:00' },
      { valor: '19:15',     label: 'Antecipar para 19:15' },
      { valor: 'manter',    label: 'Manter às 19:30' },
      { valor: 'tanto_faz', label: 'Tanto faz' },
    ],
  },
]

function dataHoraBR(ts: string | null): string {
  if (!ts) return '—'
  const dt = new Date(ts)
  if (isNaN(dt.getTime())) return '—'
  const dia = String(dt.getDate()).padStart(2, '0')
  const mes = String(dt.getMonth() + 1).padStart(2, '0')
  const hora = String(dt.getHours()).padStart(2, '0')
  const min = String(dt.getMinutes()).padStart(2, '0')
  return `${dia}/${mes} ${hora}:${min}`
}

export default function EnqueteHorarioPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  // { [chave]: { [opcao]: quantidade } }
  const [contagem, setContagem] = useState<Record<string, Record<string, number>>>({})
  const [respostas, setRespostas] = useState<any[]>([])

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    // Contagem no servidor (count exact): imune ao teto de 1000 linhas do PostgREST
    const pares = ENQUETES.flatMap(e => e.opcoes.map(o => ({ chave: e.chave, opcao: o.valor })))
    const counts = await Promise.all(pares.map(p =>
      supabase.from('enquete_respostas')
        .select('*', { count: 'exact', head: true })
        .eq('enquete', p.chave).eq('opcao', p.opcao)
        .then(r => ({ ...p, n: r.count || 0 }))
    ))
    const mapa: Record<string, Record<string, number>> = {}
    for (const c of counts) {
      if (!mapa[c.chave]) mapa[c.chave] = {}
      mapa[c.chave][c.opcao] = c.n
    }
    setContagem(mapa)

    const { data } = await supabase
      .from('enquete_respostas')
      .select('id, enquete, opcao, horario, criado_em, clientes(nome)')
      .in('enquete', ENQUETES.map(e => e.chave))
      .order('criado_em', { ascending: false })
      .limit(300)
    setRespostas(data || [])
    setLoading(false)
  }

  function labelOpcao(chave: string, valor: string): string {
    const e = ENQUETES.find(x => x.chave === chave)
    return e?.opcoes.find(o => o.valor === valor)?.label || valor
  }

  if (loading) return <Spinner />

  const totalGeral = ENQUETES.reduce((s, e) =>
    s + Object.values(contagem[e.chave] || {}).reduce((a, b) => a + b, 0), 0)

  return (
    <div>
      <PageHeader
        title="Enquete de horário · aulas da noite"
        subtitle="Obrigatória na confirmação de reserva pelo site (Vila Olímpia), uma única vez por cliente por horário. Quem reserva pelo app do Wellhub/TotalPass não passa por essa tela e não é perguntado."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <KpiCard label="Respostas no total" value={String(totalGeral)} />
        {ENQUETES.map(e => {
          const c = contagem[e.chave] || {}
          const total = Object.values(c).reduce((a, b) => a + b, 0)
          return <KpiCard key={e.chave} label={e.titulo.split(' · ')[0]} value={String(total)} sub="respostas" />
        })}
      </div>

      {ENQUETES.map(e => {
        const c = contagem[e.chave] || {}
        const total = Object.values(c).reduce((a, b) => a + b, 0)
        return (
          <div key={e.chave} className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
            <div className="text-sm font-semibold text-gray-900 mb-4">{e.titulo}</div>
            {total === 0 ? (
              <EmptyState message="Nenhuma resposta ainda." />
            ) : (
              <div className="space-y-3">
                {e.opcoes.map(o => {
                  const n = c[o.valor] || 0
                  const pct = total ? Math.round((n / total) * 100) : 0
                  return (
                    <div key={o.valor}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{o.label}</span>
                        <span className="text-gray-500">{n} · {pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
                <div className="text-xs text-gray-400 pt-1">{total} resposta{total !== 1 ? 's' : ''}</div>
              </div>
            )}
          </div>
        )
      })}

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="text-sm font-semibold text-gray-900 mb-3">
          Últimas respostas {respostas.length >= 300 && <span className="font-normal text-gray-400">(300 mais recentes)</span>}
        </div>
        {respostas.length === 0 ? (
          <EmptyState message="Nenhuma resposta ainda." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">Aula</th>
                  <th className="py-2 font-medium">Resposta</th>
                </tr>
              </thead>
              <tbody>
                {respostas.map(r => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{dataHoraBR(r.criado_em)}</td>
                    <td className="py-2 pr-3 text-gray-900">{(r as any).clientes?.nome || '—'}</td>
                    <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{r.horario || '—'}</td>
                    <td className="py-2 text-gray-700">{labelOpcao(r.enquete, r.opcao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
