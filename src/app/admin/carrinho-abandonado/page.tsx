'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, Spinner, Badge, Insight, EmptyState } from '@/components/ui'

type Etapa = 'abriu' | 'pix_nao_pago' | 'cartao_recusado'
type Linha = {
  visita_em: string
  cliente_id: string
  cliente_nome: string
  telefone: string | null
  produto_nome: string
  valor: number
  unidade_id: string | null
  unidade_nome: string | null
  etapa: Etapa
  produto_id: string
  email_enviado_em: string | null
  contato_em: string | null
  contato_por: string | null
}

type FilaItem = {
  nome: string; email: string; produto: string
  valor: number; etapa: Etapa; unidade: string | null; visita_em: string
}

const ETAPAS = {
  abriu:           { label: 'Só abriu o checkout',   variant: 'gray' },
  pix_nao_pago:    { label: 'Gerou Pix e não pagou', variant: 'amber' },
  cartao_recusado: { label: 'Cartão recusado',       variant: 'red' },
} as const

const DIAS = 30

function fmtDataHora(s: string) {
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fmtValor(v: number) {
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`
}

function fmtDia(s: string) {
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * Telefone no formato que o wa.me aceita (55 + DDD + número). O cadastro tem de
 * tudo: '19993828690', '(11) 9-4141-0520', com e sem o 55 na frente. Número que
 * não cabe em nenhum desses formatos volta '' — aí não aparece botão nenhum,
 * em vez de abrir conversa com número errado.
 */
function telefoneWhatsApp(tel?: string | null): string {
  const d = String(tel || '').replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d
  if (d.length === 10 || d.length === 11) return `55${d}`
  return ''
}

function primeiroNome(nome?: string | null): string {
  const n = (nome || '').trim().split(/\s+/)[0] || ''
  if (!n) return ''
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

// RASCUNHO — quem manda é uma pessoa da equipe, não um robô: texto curto, sem
// urgência inventada e sem prometer nada que a gente não controla.
function textoWhatsApp(l: Linha): string {
  const ola = primeiroNome(l.cliente_nome)
  const abre = ola ? `Oi, ${ola}! ` : 'Oi! '
  const casa = 'Aqui é da Just Club & CT. '
  if (l.etapa === 'pix_nao_pago') {
    return `${abre}${casa}Vi que você gerou um Pix do ${l.produto_nome} e ele não consta como pago aqui. Quer que eu te ajude a finalizar?`
  }
  if (l.etapa === 'cartao_recusado') {
    return `${abre}${casa}Vi que o cartão não passou na compra do ${l.produto_nome}. Acontece — quer tentar de outro jeito?`
  }
  return `${abre}${casa}Vi que você começou a compra do ${l.produto_nome} e não finalizou. Ficou alguma dúvida que eu possa resolver?`
}

export default function CarrinhoAbandonadoPage() {
  const supabase = createClient()
  const { perfil } = useAuth()

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [unidadeId, setUnidadeId] = useState('')

  // Resgate automático por e-mail
  const [statusCampanha, setStatusCampanha] = useState<string>('')
  const [fila, setFila] = useState<FilaItem[] | null>(null)
  const [emailTeste, setEmailTeste] = useState('')
  const [etapaTeste, setEtapaTeste] = useState<Etapa>('abriu')
  const [ocupado, setOcupado] = useState('')
  const [msg, setMsg] = useState('')

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  // Marca que alguém já abriu a conversa com essa pessoa sobre esse produto —
  // pra recepção e admin não cutucarem o mesmo cliente duas vezes. Roda junto
  // com o clique no link; se falhar, o WhatsApp abre do mesmo jeito.
  async function marcarContato(l: Linha) {
    const { data, error } = await supabase.rpc('registrar_contato_carrinho', {
      p_cliente_id: l.cliente_id,
      p_produto_id: l.produto_id,
      p_canal: 'whatsapp',
    })
    if (error) return
    const quando = (data as unknown as string) || new Date().toISOString()
    setLinhas(ls => ls.map(x =>
      x.cliente_id === l.cliente_id && x.produto_id === l.produto_id
        ? { ...x, contato_em: quando, contato_por: perfil?.nome || x.contato_por }
        : x
    ))
  }

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc('carrinhos_abandonados', { p_dias: DIAS })
      if (error) setErro(error.message)
      else setLinhas((data || []) as Linha[])

      const { data: camp } = await supabase
        .from('email_campanhas').select('status').eq('campanha', 'carrinho_abandonado').maybeSingle()
      setStatusCampanha((camp?.status as string) || '')

      setLoading(false)
    }
    load()
  }, [])

  // Quem receberia o e-mail AGORA, sem mandar nada. É a conferência antes de ligar.
  async function verFila() {
    setOcupado('fila'); setMsg(''); setErro(null); setFila(null)
    try {
      const r = await fetch('/api/carrinho-abandonado/disparar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ simular: true }),
      })
      const j = await r.json()
      if (!r.ok) setErro(j.error || 'Não deu pra montar a fila.')
      else {
        setFila((j.fila || []) as FilaItem[])
        const p = j.pulados || {}
        setMsg(
          `${j.carrinhos} carrinho(s) na janela · ${j.aprovados} receberia(m) agora` +
          ` · pulados: ${p.ja_recebeu || 0} já receberam, ${p.sem_email || 0} sem e-mail, ` +
          `${p.descadastrado || 0} descadastrados, ${p.bloqueado || 0} bloqueados`
        )
      }
    } catch {
      setErro('Não deu pra falar com o servidor.')
    }
    setOcupado('')
  }

  async function mandarTeste() {
    if (!emailTeste.trim()) { setErro('Digite um e-mail para o teste.'); return }
    setOcupado('teste'); setMsg(''); setErro(null)
    try {
      const r = await fetch('/api/carrinho-abandonado/teste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ email: emailTeste.trim(), etapa: etapaTeste }),
      })
      const j = await r.json()
      if (!r.ok) setErro(j.error || 'O envio do teste falhou.')
      else setMsg(`Teste enviado para ${j.para}.`)
    } catch {
      setErro('Não deu pra falar com o servidor.')
    }
    setOcupado('')
  }

  // Unidades que aparecem na lista (produto sem unidade fica de fora do filtro)
  const unidades = useMemo(() => {
    const m = new Map<string, string>()
    linhas.forEach(l => { if (l.unidade_id && l.unidade_nome) m.set(l.unidade_id, l.unidade_nome) })
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [linhas])

  const filtradas = unidadeId ? linhas.filter(l => l.unidade_id === unidadeId) : linhas

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Carrinho abandonado"
        subtitle={`Clientes logados que abriram o checkout e não compraram em 1 hora — últimos ${DIAS} dias`}
      />

      {erro && <Insight variant="red">Erro ao carregar: {erro}</Insight>}

      <Insight variant="amber">
        O registro das visitas ao checkout começou em 12/09/2026 — antes disso não há dados.
        Só entra quem estava logado como cliente; quem compra depois sai da lista.
      </Insight>

      {/* Resgate automático por e-mail. Enquanto a campanha não estiver
          'recorrente', o cron roda e não manda nada — dá pra conferir a fila à
          vontade antes de ligar. */}
      <div className="card mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-medium text-gray-900">Resgate automático por e-mail</div>
            <div className="text-xs text-gray-500 mt-0.5">
              De hora em hora, entre 9h e 21h, para quem parou entre 3h e 48h atrás. Um e-mail por
              pessoa, nunca repete.
            </div>
          </div>
          <Badge variant={statusCampanha === 'recorrente' ? 'green' : 'gray'}>
            {statusCampanha === 'recorrente' ? 'Ligado' : 'Desligado'}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={verFila}
            disabled={!!ocupado}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {ocupado === 'fila' ? 'Conferindo…' : 'Ver quem receberia agora'}
          </button>

          <input
            type="email"
            value={emailTeste}
            onChange={e => setEmailTeste(e.target.value)}
            placeholder="seu@email.com"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-base md:text-sm"
          />
          <select
            value={etapaTeste}
            onChange={e => setEtapaTeste(e.target.value as Etapa)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-base md:text-sm bg-white"
          >
            {Object.entries(ETAPAS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button
            onClick={mandarTeste}
            disabled={!!ocupado}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {ocupado === 'teste' ? 'Enviando…' : 'Mandar teste'}
          </button>
        </div>

        {msg && <div className="mt-3 text-sm text-gray-600">{msg}</div>}

        {fila && fila.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3 text-sm">
            {fila.map((f, i) => (
              <div key={i} className="flex flex-wrap gap-x-2 py-1 text-gray-600">
                <span className="text-gray-900">{f.nome}</span>
                <span className="text-gray-400">{f.email}</span>
                <span>· {f.produto}</span>
                <span className="text-gray-400">{(ETAPAS[f.etapa] || ETAPAS.abriu).label}</span>
              </div>
            ))}
          </div>
        )}
        {fila && fila.length === 0 && (
          <div className="mt-3 text-sm text-gray-400">Ninguém receberia agora.</div>
        )}
      </div>

      <div className="card mb-4">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Unidade</div>
        <select
          value={unidadeId}
          onChange={e => setUnidadeId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-base md:text-sm bg-white"
        >
          <option value="">Todas as unidades</option>
          {unidades.map(u => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {/* Celular: um cartão por carrinho (sem rolar pro lado). A tabela aparece a partir de md. */}
        <div className="md:hidden divide-y divide-gray-100">
          {filtradas.map(l => {
            const tel = telefoneWhatsApp(l.telefone)
            const etapa = ETAPAS[l.etapa] || ETAPAS.abriu
            return (
              <div key={`${l.cliente_id}-${l.produto_nome}-${l.visita_em}`} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm font-medium text-gray-900">{l.cliente_nome}</div>
                  <div className="shrink-0 text-xs text-gray-500 whitespace-nowrap">{fmtDataHora(l.visita_em)}</div>
                </div>
                <div className="mt-1 text-sm text-gray-900">
                  {l.produto_nome} <span className="text-xs text-gray-400">· {fmtValor(l.valor)}</span>
                </div>
                <div className="mt-0.5 text-xs text-gray-400">{l.unidade_nome || '—'}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Badge variant={etapa.variant}>{etapa.label}</Badge>
                  {l.email_enviado_em && (
                    <span className="text-xs text-green-600">E-mail {fmtDia(l.email_enviado_em)}</span>
                  )}
                  {tel ? (
                    <a
                      href={`https://wa.me/${tel}?text=${encodeURIComponent(textoWhatsApp(l))}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => marcarContato(l)}
                      className="text-sm text-primary-600 hover:underline"
                    >
                      Chamar no WhatsApp
                    </a>
                  ) : (
                    <span className="text-xs text-gray-300">Sem telefone</span>
                  )}
                </div>
                {l.contato_em && (
                  <div className="mt-1 text-xs text-gray-400">
                    Já falaram {fmtDia(l.contato_em)}{l.contato_por ? ` · ${l.contato_por}` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-3 pr-2">Quando</th>
                <th className="text-left pb-3 pr-2">Cliente</th>
                <th className="text-left pb-3 pr-2">Telefone</th>
                <th className="text-left pb-3 pr-2">Produto</th>
                <th className="text-left pb-3 pr-2">Unidade</th>
                <th className="text-left pb-3">Até onde chegou</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map(l => {
                const tel = telefoneWhatsApp(l.telefone)
                const etapa = ETAPAS[l.etapa] || ETAPAS.abriu
                return (
                  <tr key={`${l.cliente_id}-${l.produto_nome}-${l.visita_em}`}>
                    <td className="py-2.5 pr-2 text-gray-600 whitespace-nowrap">{fmtDataHora(l.visita_em)}</td>
                    <td className="py-2.5 pr-2 font-medium text-gray-900">{l.cliente_nome}</td>
                    <td className="py-2.5 pr-2 text-xs whitespace-nowrap">
                      {tel ? (
                        <>
                          <a
                            href={`https://wa.me/${tel}?text=${encodeURIComponent(textoWhatsApp(l))}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => marcarContato(l)}
                            className="text-primary-600 hover:underline"
                            title="Abre a conversa com a mensagem já escrita"
                          >
                            {l.telefone}
                          </a>
                          {l.contato_em && (
                            <div className="mt-1 text-gray-400">
                              Já falaram {fmtDia(l.contato_em)}
                              {l.contato_por ? ` · ${l.contato_por}` : ''}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2">
                      <div className="text-gray-900">{l.produto_nome}</div>
                      <div className="text-xs text-gray-400">{fmtValor(l.valor)}</div>
                    </td>
                    <td className="py-2.5 pr-2 text-gray-600">{l.unidade_nome || '—'}</td>
                    <td className="py-2.5">
                      <Badge variant={etapa.variant}>{etapa.label}</Badge>
                      {l.email_enviado_em && (
                        <div className="mt-1 text-xs text-green-600">
                          E-mail enviado {fmtDia(l.email_enviado_em)}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtradas.length === 0 && (
          <EmptyState message="Nenhum carrinho abandonado no período." />
        )}
      </div>
    </div>
  )
}
