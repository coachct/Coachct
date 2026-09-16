'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, Badge, Insight, EmptyState, KpiCard, SectionTitle } from '@/components/ui'

// Acompanhamento do e-mail de feedback que sai 48h depois da primeira presença
// no Club. A pergunta que a tela responde: quantos receberam, quantos
// responderam, qual foi a nota, QUAL FOI O MOTIVO — e, no fim das contas, se a
// pessoa voltou a treinar.
//
// Os dados vêm pela rota de admin (e não direto daqui) porque feedback_estreia
// tem RLS sem política nenhuma: só o service_role lê.

type Resposta = {
  cliente_nome: string
  unidade_nome: string
  modalidade: string
  grupo_muscular: string | null
  coach_nome: string | null
  periodo: string
  data_estreia: string
  horario: string
  nota: number | null
  motivo: string | null
  comentario: string | null
  respondido_em: string
  voltou: boolean
}

type SemResposta = {
  cliente_nome: string
  unidade_nome: string
  modalidade: string
  periodo: string
  data_estreia: string
  horario: string
  enviado_em: string | null
  voltou: boolean
}

type Corte = { modalidade?: string; unidade?: string; enviados: number; respondidos: number; voltaram: number }

type Painel = {
  dias: number
  total: number
  enviados: number
  falhas: number
  respondidos: number
  com_comentario: number
  voltaram: number
  nota_media: number | null
  notas: Record<string, number>
  motivos: { motivo: string; caminho: 'bom' | 'ruim'; qtd: number }[]
  por_modalidade: Corte[]
  por_unidade: Corte[]
  respostas: Resposta[]
  sem_resposta: SemResposta[]
}

const CARINHAS: Record<number, string> = { 1: '😖', 2: '😕', 3: '🙂', 4: '😄', 5: '🔥' }

function variantDaNota(n: number | null) {
  if (n === null) return 'gray' as const
  if (n <= 2) return 'red' as const
  if (n === 3) return 'amber' as const
  return 'green' as const
}

function pct(parte: number, todo: number) {
  if (!todo) return '—'
  return `${Math.round((parte / todo) * 100)}%`
}

function fmtData(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}`
}

function fmtDataHora(s: string) {
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fmtHora(h: string) {
  return String(h || '').slice(0, 5)
}

export default function FeedbackEstreiaPage() {
  const supabase = createClient()

  const [painel, setPainel] = useState<Painel | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [dias, setDias] = useState(30)
  const [aba, setAba] = useState<'responderam' | 'nao'>('responderam')

  useEffect(() => {
    let cancelado = false
    async function load() {
      setLoading(true); setErro(null)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) { setErro('Sessão expirada. Recarregue a página e entre novamente.'); setLoading(false); return }

        const res = await fetch(`/api/feedback-estreia/painel?dias=${dias}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (cancelado) return
        if (!res.ok) setErro(json?.error || 'Não consegui carregar.')
        else setPainel(json.painel as Painel)
      } catch (e: any) {
        if (!cancelado) setErro(e?.message || 'Não consegui carregar.')
      }
      if (!cancelado) setLoading(false)
    }
    load()
    return () => { cancelado = true }
  }, [dias])

  const p = painel
  const maiorNota = p ? Math.max(1, ...Object.values(p.notas || {})) : 1
  const motivosBons = (p?.motivos || []).filter(m => m.caminho === 'bom')
  const motivosRuins = (p?.motivos || []).filter(m => m.caminho === 'ruim')

  return (
    <div>
      <PageHeader
        title="Feedback de estreia"
        subtitle="E-mail que sai 48h depois da primeira presença no Club — e o que as pessoas responderam"
      />

      {erro && <Insight variant="red">Erro ao carregar: {erro}</Insight>}

      <Insight variant="amber">
        A série começa em 16/09/2026 — antes disso ninguém recebeu, então não há dado retroativo.
        Cada pessoa recebe uma única vez, na estreia. Quem já tinha remarcado antes do disparo não
        recebe, de propósito.
      </Insight>

      <div className="card mb-4">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Período</div>
        <select
          value={dias}
          onChange={e => setDias(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-base md:text-sm bg-white"
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={365}>Último ano</option>
        </select>
      </div>

      {loading ? <Spinner /> : !p ? null : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard
              label="E-mails enviados"
              value={String(p.enviados)}
              sub={p.falhas ? `${p.falhas} falharam no envio` : undefined}
              subColor={p.falhas ? 'text-danger-600' : undefined}
            />
            <KpiCard
              label="Responderam"
              value={pct(p.respondidos, p.enviados)}
              sub={`${p.respondidos} de ${p.enviados}`}
            />
            <KpiCard
              label="Nota média"
              value={p.nota_media !== null ? String(p.nota_media).replace('.', ',') : '—'}
              sub={p.com_comentario ? `${p.com_comentario} escreveram algo` : undefined}
            />
            <KpiCard
              label="Voltaram a treinar"
              value={pct(p.voltaram, p.enviados)}
              sub={`${p.voltaram} de ${p.enviados} estreantes`}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="card">
              <SectionTitle>Como foi a estreia</SectionTitle>
              {p.respondidos === 0 ? (
                <EmptyState message="Ninguém clicou nenhuma carinha ainda." />
              ) : (
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map(n => {
                    const q = p.notas?.[String(n)] || 0
                    return (
                      <div key={n} className="flex items-center gap-3">
                        <span className="text-lg w-6 text-center">{CARINHAS[n]}</span>
                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${n <= 2 ? 'bg-danger-400' : n === 3 ? 'bg-warning-400' : 'bg-primary-400'}`}
                            style={{ width: `${(q / maiorNota) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-500 w-8 text-right">{q}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <SectionTitle>Por modalidade e unidade</SectionTitle>
              <div className="space-y-2 text-sm">
                {[...p.por_modalidade, ...p.por_unidade].length === 0 ? (
                  <EmptyState message="Sem dados no período." />
                ) : (
                  <>
                    {p.por_modalidade.map(c => (
                      <div key={`m-${c.modalidade}`} className="flex items-center justify-between gap-2">
                        <span className="text-gray-900 capitalize">{c.modalidade}</span>
                        <span className="text-gray-500 text-xs">
                          {c.enviados} enviados · {c.respondidos} responderam · <strong className="text-gray-900">{pct(c.voltaram, c.enviados)}</strong> voltaram
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-gray-100 pt-2 mt-2" />
                    {p.por_unidade.map(c => (
                      <div key={`u-${c.unidade}`} className="flex items-center justify-between gap-2">
                        <span className="text-gray-900">{c.unidade}</span>
                        <span className="text-gray-500 text-xs">
                          {c.enviados} enviados · {c.respondidos} responderam · <strong className="text-gray-900">{pct(c.voltaram, c.enviados)}</strong> voltaram
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* O motivo é o ativo da entrega: é o que diz se a próxima ação é
              grade, localização ou capacidade. */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="card">
              <SectionTitle>O que não fez marcar o próximo</SectionTitle>
              {motivosBons.length === 0 ? (
                <EmptyState message="Nenhum motivo respondido ainda." />
              ) : (
                <div className="space-y-1.5 text-sm">
                  {motivosBons.map(m => (
                    <div key={m.motivo} className="flex items-center justify-between gap-3">
                      <span className="text-gray-900">{m.motivo}</span>
                      <span className="text-gray-500">{m.qtd}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <SectionTitle>O que não rolou (nota 1 e 2)</SectionTitle>
              {motivosRuins.length === 0 ? (
                <EmptyState message="Nenhuma resposta negativa no período." />
              ) : (
                <div className="space-y-1.5 text-sm">
                  {motivosRuins.map(m => (
                    <div key={m.motivo} className="flex items-center justify-between gap-3">
                      <span className="text-gray-900">{m.motivo}</span>
                      <span className="text-gray-500">{m.qtd}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setAba('responderam')}
                className={`btn btn-sm ${aba === 'responderam' ? 'btn-primary' : ''}`}
              >
                Responderam ({p.respostas.length})
              </button>
              <button
                onClick={() => setAba('nao')}
                className={`btn btn-sm ${aba === 'nao' ? 'btn-primary' : ''}`}
              >
                Não responderam ({p.sem_resposta.length})
              </button>
            </div>

            {aba === 'responderam' ? (
              p.respostas.length === 0 ? (
                <EmptyState message="Nenhuma resposta no período." />
              ) : (
                <>
                  {/* Celular: um cartão por resposta. A tabela aparece a partir de md. */}
                  <div className="md:hidden divide-y divide-gray-100">
                    {p.respostas.map((r, i) => (
                      <div key={`${r.cliente_nome}-${r.respondido_em}-${i}`} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 text-sm font-medium text-gray-900">{r.cliente_nome}</div>
                          <div className="shrink-0 text-lg">{r.nota ? CARINHAS[r.nota] : '—'}</div>
                        </div>
                        <div className="mt-0.5 text-xs text-gray-400">
                          {fmtData(r.data_estreia)} · {fmtHora(r.horario)} · <span className="capitalize">{r.modalidade}</span> · {r.unidade_nome}
                        </div>
                        {r.motivo && <div className="mt-1.5 text-sm text-gray-900">{r.motivo}</div>}
                        {r.comentario && (
                          <div className="mt-1 text-sm text-gray-600 italic">“{r.comentario}”</div>
                        )}
                        <div className="mt-1.5">
                          <Badge variant={r.voltou ? 'green' : 'gray'}>
                            {r.voltou ? 'Voltou a treinar' : 'Não voltou'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                          <th className="text-left pb-3 pr-2">Respondeu</th>
                          <th className="text-left pb-3 pr-2">Cliente</th>
                          <th className="text-left pb-3 pr-2">Estreia</th>
                          <th className="text-left pb-3 pr-2">Nota</th>
                          <th className="text-left pb-3 pr-2">Motivo</th>
                          <th className="text-left pb-3 pr-2">O que escreveu</th>
                          <th className="text-left pb-3">Voltou?</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {p.respostas.map((r, i) => (
                          <tr key={`${r.cliente_nome}-${r.respondido_em}-${i}`}>
                            <td className="py-2.5 pr-2 text-gray-600 whitespace-nowrap">{fmtDataHora(r.respondido_em)}</td>
                            <td className="py-2.5 pr-2 font-medium text-gray-900">{r.cliente_nome}</td>
                            <td className="py-2.5 pr-2 text-xs text-gray-500 whitespace-nowrap">
                              {fmtData(r.data_estreia)} {fmtHora(r.horario)}
                              <div className="capitalize">{r.modalidade} · {r.unidade_nome}</div>
                            </td>
                            <td className="py-2.5 pr-2 whitespace-nowrap">
                              <Badge variant={variantDaNota(r.nota)}>
                                {r.nota ? `${CARINHAS[r.nota]} ${r.nota}` : '—'}
                              </Badge>
                            </td>
                            <td className="py-2.5 pr-2 text-gray-900">{r.motivo || '—'}</td>
                            <td className="py-2.5 pr-2 text-gray-600 italic max-w-xs">
                              {r.comentario ? `“${r.comentario}”` : <span className="text-gray-300 not-italic">—</span>}
                            </td>
                            <td className="py-2.5">
                              <Badge variant={r.voltou ? 'green' : 'gray'}>{r.voltou ? 'Sim' : 'Não'}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            ) : p.sem_resposta.length === 0 ? (
              <EmptyState message="Todo mundo respondeu." />
            ) : (
              <>
                <div className="md:hidden divide-y divide-gray-100">
                  {p.sem_resposta.map((r, i) => (
                    <div key={`${r.cliente_nome}-${r.data_estreia}-${i}`} className="py-3 first:pt-0 last:pb-0">
                      <div className="text-sm font-medium text-gray-900">{r.cliente_nome}</div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {fmtData(r.data_estreia)} · {fmtHora(r.horario)} · <span className="capitalize">{r.modalidade}</span> · {r.unidade_nome}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {!r.enviado_em && <Badge variant="red">Não saiu o e-mail</Badge>}
                        <Badge variant={r.voltou ? 'green' : 'gray'}>
                          {r.voltou ? 'Voltou a treinar' : 'Não voltou'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        <th className="text-left pb-3 pr-2">Estreia</th>
                        <th className="text-left pb-3 pr-2">Cliente</th>
                        <th className="text-left pb-3 pr-2">Modalidade</th>
                        <th className="text-left pb-3 pr-2">Unidade</th>
                        <th className="text-left pb-3 pr-2">E-mail</th>
                        <th className="text-left pb-3">Voltou?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {p.sem_resposta.map((r, i) => (
                        <tr key={`${r.cliente_nome}-${r.data_estreia}-${i}`}>
                          <td className="py-2.5 pr-2 text-gray-600 whitespace-nowrap">
                            {fmtData(r.data_estreia)} {fmtHora(r.horario)}
                          </td>
                          <td className="py-2.5 pr-2 font-medium text-gray-900">{r.cliente_nome}</td>
                          <td className="py-2.5 pr-2 text-gray-600 capitalize">{r.modalidade}</td>
                          <td className="py-2.5 pr-2 text-gray-600">{r.unidade_nome}</td>
                          <td className="py-2.5 pr-2 text-xs whitespace-nowrap">
                            {r.enviado_em
                              ? <span className="text-gray-500">{fmtDataHora(r.enviado_em)}</span>
                              : <Badge variant="red">Não saiu</Badge>}
                          </td>
                          <td className="py-2.5">
                            <Badge variant={r.voltou ? 'green' : 'gray'}>{r.voltou ? 'Sim' : 'Não'}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
