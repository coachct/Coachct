'use client'

// Guias enviadas pela equipe: o sistema lê a guia (rota /api/admin/fiscal/guias),
// sugere a parcela/pendência correspondente e mostra lado a lado com o nosso
// relatório. Quem subiu confere e confirma — aí o valor da guia vira o valor da
// parcela (sai o "~"). Nada é aplicado sem o clique em Confirmar.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Upload, Loader2, FileText, Check, X, ExternalLink, AlertTriangle } from 'lucide-react'

const supabase = createClient()

type Guia = {
  id: string
  arquivo_path: string
  arquivo_nome: string | null
  status: 'lida' | 'confirmada' | 'descartada' | 'erro'
  dados: any
  orgao: string | null
  valor_total: number | null
  vencimento: string | null
  parcela_id: string | null
  pendencia_id: string | null
  valor_anterior: number | null
  erro: string | null
  criado_em: string
  confirmado_em: string | null
}

type ItemAberto = {
  chave: string // p:<id> | d:<id>
  rotulo: string
  grupo: string
  valor: number | null
  vencimento: string | null
  estimado: boolean
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.slice(0, 10).split('-')
  return `${dd}/${m}/${y}`
}

const STATUS_LABEL: Record<string, string> = {
  lida: 'Aguardando conferência',
  confirmada: 'Confirmada',
  descartada: 'Descartada',
  erro: 'Não lida',
}
const STATUS_BADGE: Record<string, string> = {
  lida: 'bg-amber-100 text-amber-800',
  confirmada: 'bg-green-100 text-green-700',
  descartada: 'bg-gray-100 text-gray-500',
  erro: 'bg-red-100 text-red-700',
}

export default function GuiasPanel({ onAlterado }: { onAlterado: () => void }) {
  const [guias, setGuias] = useState<Guia[]>([])
  const [itens, setItens] = useState<ItemAberto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [escolha, setEscolha] = useState<Record<string, string>>({}) // guia -> chave do item
  const [agindo, setAgindo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function carregar() {
    const [rg, rp, rd] = await Promise.all([
      supabase
        .from('fiscal_guias')
        .select('id, arquivo_path, arquivo_nome, status, dados, orgao, valor_total, vencimento, parcela_id, pendencia_id, valor_anterior, erro, criado_em, confirmado_em')
        .order('criado_em', { ascending: false })
        .limit(30),
      supabase
        .from('fiscal_parcelas')
        .select('id, numero, vencimento, valor, estimado, fiscal_acordos!inner(orgao, descricao, qtd_parcelas, status)')
        .eq('pago', false)
        .in('fiscal_acordos.status', ['ativo', 'simulado'])
        .order('vencimento', { ascending: true })
        .limit(400),
      supabase.from('fiscal_pendencias').select('id, orgao, descricao, valor').neq('situacao', 'resolvida'),
    ])
    const lista: ItemAberto[] = [
      ...((rp.data as any[]) || []).map((p) => ({
        chave: `p:${p.id}`,
        grupo: `${p.fiscal_acordos.orgao} · ${p.fiscal_acordos.descricao}`,
        rotulo: `Parcela ${p.numero}${p.fiscal_acordos.qtd_parcelas ? '/' + p.fiscal_acordos.qtd_parcelas : ''} · venc. ${fmtData(p.vencimento)}`,
        valor: Number(p.valor),
        vencimento: p.vencimento,
        estimado: p.estimado,
      })),
      ...((rd.data as any[]) || []).map((d) => ({
        chave: `d:${d.id}`,
        grupo: 'Fora de acordo',
        rotulo: `${d.orgao} · ${d.descricao}`,
        valor: d.valor === null ? null : Number(d.valor),
        vencimento: null,
        estimado: false,
      })),
    ]
    setGuias((rg.data as Guia[]) || [])
    setItens(lista)
    const esc: Record<string, string> = {}
    for (const g of (rg.data as Guia[]) || []) {
      if (g.parcela_id) esc[g.id] = `p:${g.parcela_id}`
      else if (g.pendencia_id) esc[g.id] = `d:${g.pendencia_id}`
      else esc[g.id] = ''
    }
    setEscolha(esc)
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  const itensPorChave = useMemo(() => new Map(itens.map((i) => [i.chave, i])), [itens])
  const grupos = useMemo(() => {
    const m = new Map<string, ItemAberto[]>()
    for (const i of itens) m.set(i.grupo, [...(m.get(i.grupo) || []), i])
    return Array.from(m.entries())
  }, [itens])

  async function token() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function enviar(files: FileList | null) {
    if (!files || files.length === 0) return
    setErro(null)
    setAviso(null)
    const tk = await token()
    let ok = 0
    for (const f of Array.from(files)) {
      setEnviando(f.name)
      const fd = new FormData()
      fd.append('file', f)
      try {
        const r = await fetch('/api/admin/fiscal/guias', { method: 'POST', headers: { Authorization: `Bearer ${tk}` }, body: fd })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) setErro(`${f.name}: ${d.error || 'erro ao enviar'}`)
        else ok++
      } catch {
        setErro(`${f.name}: erro ao enviar`)
      }
    }
    setEnviando(null)
    if (inputRef.current) inputRef.current.value = ''
    if (ok) setAviso(`${ok} guia${ok > 1 ? 's' : ''} lida${ok > 1 ? 's' : ''}. Confira abaixo e confirme.`)
    carregar()
  }

  async function abrirArquivo(g: Guia) {
    const tk = await token()
    const r = await fetch(`/api/admin/fiscal/guias?path=${encodeURIComponent(g.arquivo_path)}`, {
      headers: { Authorization: `Bearer ${tk}` },
    })
    const d = await r.json().catch(() => ({}))
    if (d.url) window.open(d.url, '_blank')
    else setErro('Não foi possível abrir o arquivo.')
  }

  async function confirmar(g: Guia) {
    const ch = escolha[g.id]
    if (!ch) {
      setErro('Escolha a parcela ou pendência que esta guia paga.')
      return
    }
    setAgindo(g.id)
    setErro(null)
    const { error } = await supabase.rpc('fiscal_confirmar_guia', {
      p_guia_id: g.id,
      p_parcela_id: ch.startsWith('p:') ? ch.slice(2) : null,
      p_pendencia_id: ch.startsWith('d:') ? ch.slice(2) : null,
    })
    setAgindo(null)
    if (error) {
      setErro('Não foi possível confirmar a guia.')
      return
    }
    setAviso('Guia confirmada. O valor da guia passou a valer no relatório.')
    carregar()
    onAlterado()
  }

  async function descartar(g: Guia) {
    setAgindo(g.id)
    const { error } = await supabase.from('fiscal_guias').update({ status: 'descartada' }).eq('id', g.id)
    setAgindo(null)
    if (error) setErro('Não foi possível descartar.')
    else carregar()
  }

  const pendentes = guias.filter((g) => g.status === 'lida' || g.status === 'erro')
  const historico = guias.filter((g) => g.status === 'confirmada' || g.status === 'descartada')

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Guias</h2>
          <p className="text-xs text-gray-500">
            Suba a guia recebida da contabilidade. O sistema lê, compara com o nosso relatório e
            você confirma.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => enviar(e.target.files)}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={!!enviando}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#ff2d9b] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0267f] disabled:opacity-50"
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {enviando ? 'Lendo a guia…' : 'Subir guia'}
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        {erro && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{erro}</div>
        )}
        {aviso && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">{aviso}</div>
        )}

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando…
          </div>
        ) : pendentes.length === 0 && historico.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">Nenhuma guia enviada ainda.</div>
        ) : null}

        {/* Aguardando conferência */}
        {pendentes.map((g) => {
          const d = g.dados || {}
          const item = escolha[g.id] ? itensPorChave.get(escolha[g.id]) : undefined
          const total = g.valor_total
          const dif = item && item.valor !== null && total !== null ? total - item.valor : null
          const semValor = item && (item.valor === null || item.valor === 0)
          return (
            <div key={g.id} className="rounded-xl border border-amber-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText size={15} className="shrink-0 text-amber-700" />
                  <span className="truncate text-sm font-medium text-gray-900">{g.arquivo_nome || 'guia'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[g.status]}`}>
                    {STATUS_LABEL[g.status]}
                  </span>
                </div>
                <button
                  onClick={() => abrirArquivo(g)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                >
                  <ExternalLink size={13} />
                  Ver guia
                </button>
              </div>

              {g.status === 'erro' ? (
                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <span className="flex items-center gap-1.5 text-sm text-red-700">
                    <AlertTriangle size={15} />
                    {g.erro}
                  </span>
                  <button
                    onClick={() => descartar(g)}
                    disabled={agindo === g.id}
                    className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Descartar
                  </button>
                </div>
              ) : (
                <div className="px-3 py-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    {/* O que está na guia */}
                    <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs">
                      <div className="mb-1.5 font-bold uppercase tracking-wide text-gray-400">Na guia</div>
                      <Linha r="Documento" v={[d.tipo_documento, d.orgao].filter(Boolean).join(' · ') || '—'} />
                      <Linha r="Parcelamento" v={d.numero_parcelamento || '—'} mono />
                      <Linha r="Parcela" v={d.numero_parcela ?? '—'} />
                      <Linha r="Período" v={d.periodo_apuracao || '—'} />
                      <Linha r="Vencimento" v={fmtData(g.vencimento)} />
                      {d.valor_principal != null && <Linha r="Principal" v={fmtBRL(Number(d.valor_principal))} />}
                      {d.valor_multa != null && <Linha r="Multa" v={fmtBRL(Number(d.valor_multa))} />}
                      {d.valor_juros != null && <Linha r="Juros" v={fmtBRL(Number(d.valor_juros))} />}
                      <Linha r="Total" v={total !== null ? fmtBRL(Number(total)) : '—'} forte />
                    </div>

                    {/* O nosso relatório */}
                    <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs">
                      <div className="mb-1.5 font-bold uppercase tracking-wide text-gray-400">No nosso relatório</div>
                      <select
                        value={escolha[g.id] || ''}
                        onChange={(e) => setEscolha({ ...escolha, [g.id]: e.target.value })}
                        className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-[#ff2d9b]"
                      >
                        <option value="">— escolha o que esta guia paga —</option>
                        {grupos.map(([nome, arr]) => (
                          <optgroup key={nome} label={nome}>
                            {arr.map((i) => (
                              <option key={i.chave} value={i.chave}>
                                {i.rotulo}
                                {i.valor !== null ? ` · ${fmtBRL(i.valor)}` : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      {item ? (
                        <>
                          <Linha r="Item" v={item.grupo} />
                          <Linha r="Detalhe" v={item.rotulo} />
                          <Linha
                            r="Valor"
                            v={item.valor !== null ? `${fmtBRL(item.valor)}${item.estimado ? ' ~' : ''}` : 'a apurar'}
                          />
                          <div
                            className={`mt-2 rounded-md px-2 py-1.5 font-semibold ${
                              semValor
                                ? 'bg-sky-100 text-sky-800'
                                : dif === null || Math.abs(dif) < 0.01
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {semValor
                              ? 'Relatório sem valor — a guia vai preencher'
                              : dif === null || Math.abs(dif) < 0.01
                                ? 'Valores batem'
                                : `Diferença de ${fmtBRL(Math.abs(dif))} ${dif > 0 ? 'a mais na guia' : 'a menos na guia'}`}
                          </div>
                        </>
                      ) : (
                        <div className="text-gray-500">Nenhum item correspondente encontrado.</div>
                      )}
                    </div>
                  </div>

                  {d.observacao && (
                    <p className="mt-2 text-xs leading-relaxed text-gray-600">
                      <span className="font-semibold">Leitura: </span>
                      {d.observacao}
                      {d.match_confianca && (
                        <span className="text-gray-400"> (confiança {d.match_confianca})</span>
                      )}
                    </p>
                  )}

                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => descartar(g)}
                      disabled={agindo === g.id}
                      className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <X size={15} />
                      Descartar
                    </button>
                    <button
                      onClick={() => confirmar(g)}
                      disabled={agindo === g.id || total === null}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#ff2d9b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#e0267f] disabled:opacity-50"
                    >
                      {agindo === g.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      Confirmar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Histórico */}
        {historico.length > 0 && (
          <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
            {historico.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[g.status]}`}>
                  {STATUS_LABEL[g.status]}
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-700">{g.arquivo_nome || 'guia'}</span>
                {g.status === 'confirmada' && g.valor_total !== null && (
                  <span className="text-gray-500">
                    {g.valor_anterior !== null ? `${fmtBRL(Number(g.valor_anterior))} → ` : ''}
                    <span className="font-semibold text-gray-900">{fmtBRL(Number(g.valor_total))}</span>
                  </span>
                )}
                <span className="text-gray-400">{fmtData(g.confirmado_em || g.criado_em)}</span>
                <button onClick={() => abrirArquivo(g)} className="text-gray-400 hover:text-gray-700" title="Ver guia">
                  <ExternalLink size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Linha({ r, v, mono, forte }: { r: string; v: React.ReactNode; mono?: boolean; forte?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-gray-500">{r}</span>
      <span className={`text-right ${mono ? 'font-mono' : ''} ${forte ? 'font-bold text-gray-900' : 'text-gray-800'}`}>
        {v}
      </span>
    </div>
  )
}
