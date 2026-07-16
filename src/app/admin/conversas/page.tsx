'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { MessageCircle, Search, Bot, User, Send, Headset, Paperclip, FileText, ArrowLeft } from 'lucide-react'

// Quantas mensagens trazer (volume ainda baixo; subir depois se precisar).
const LIMITE_MSGS = 3000

type Msg = {
  id: string
  telefone: string
  cliente_id: string | null
  role: 'user' | 'assistant'
  conteudo: string
  criado_em: string
  autor?: string | null
  midia_tipo?: string | null
  midia_path?: string | null
  midia_nome?: string | null
  midia_mime?: string | null
}

type Conversa = {
  telefone: string
  nome: string | null
  ultima: string
  ultimaEm: string
  total: number
}

function fmtTel(t: string) {
  const d = (t || '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}

function fmtDataHora(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtHora(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function diaStr(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

function rotuloMidia(tipo?: string | null) {
  switch (tipo) {
    case 'image': return '🖼️ Imagem'
    case 'document': return '📎 Documento'
    case 'audio': return '🎵 Áudio'
    case 'video': return '🎥 Vídeo'
    case 'sticker': return 'Figurinha'
    default: return '📎 Arquivo'
  }
}

export default function ConversasPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [msgs, setMsgs] = useState<Msg[]>([])
  const [controle, setControle] = useState<Record<string, boolean>>({})
  const [aguardando, setAguardando] = useState<Record<string, boolean>>({})
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [desde, setDesde] = useState('') // AAAA-MM-DD opcional
  const [telSel, setTelSel] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [midiaUrls, setMidiaUrls] = useState<Record<string, string>>({}) // path -> URL assinada

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregar() }, [perfil])

  async function carregar() {
    setCarregando(true)
    const { data: linhas } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(LIMITE_MSGS)
    const lista = (linhas || []) as Msg[]

    // Nomes dos clientes vinculados.
    const cids = Array.from(new Set(lista.map((m) => m.cliente_id).filter(Boolean))) as string[]
    const nomeMap: Record<string, string> = {}
    if (cids.length) {
      const { data: cls } = await supabase.from('clientes').select('id, nome').in('id', cids)
      for (const c of (cls || [])) nomeMap[c.id] = c.nome
    }
    setMsgs(lista.map((m) => ({ ...m, _nome: m.cliente_id ? nomeMap[m.cliente_id] : null } as any)))

    // Estado de atendimento humano + "aguardando atendimento" por telefone.
    // select('*') p/ não quebrar se a coluna aguardando_humano ainda não existir.
    const { data: ctrl } = await supabase.from('whatsapp_controle').select('*')
    const cmap: Record<string, boolean> = {}
    const amap: Record<string, boolean> = {}
    for (const c of (ctrl || [])) {
      cmap[(c as any).telefone] = (c as any).modo_humano
      amap[(c as any).telefone] = !!(c as any).aguardando_humano
    }
    setControle(cmap)
    setAguardando(amap)

    setCarregando(false)
  }

  async function toggleHumano(telefone: string, ligar: boolean) {
    setControle((m) => ({ ...m, [telefone]: ligar })) // otimista
    if (ligar) setAguardando((m) => ({ ...m, [telefone]: false })) // assumir limpa o "aguardando"
    const payload: any = { telefone, modo_humano: ligar, atualizado_em: new Date().toISOString() }
    if (ligar) payload.aguardando_humano = false
    const { error } = await supabase
      .from('whatsapp_controle')
      .upsert(payload, { onConflict: 'telefone' })
    if (error) {
      setControle((m) => ({ ...m, [telefone]: !ligar })) // desfaz
      alert('Não consegui mudar o atendimento agora. Tente de novo.')
    }
  }

  /** Marca a conversa como resolvida (limpa o "aguardando atendimento") sem assumir. */
  async function resolverAguardando(telefone: string) {
    setAguardando((m) => ({ ...m, [telefone]: false })) // otimista
    const { error } = await supabase
      .from('whatsapp_controle')
      .upsert({ telefone, aguardando_humano: false, atualizado_em: new Date().toISOString() }, { onConflict: 'telefone' })
    if (error) {
      setAguardando((m) => ({ ...m, [telefone]: true }))
      alert('Não consegui marcar como resolvido agora. Tente de novo.')
    }
  }

  async function enviarMensagem() {
    const txt = rascunho.trim()
    if (!txt || !telSel || enviando) return
    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/admin/whatsapp/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ telefone: telSel, texto: txt }),
      })
      if (resp.ok) {
        setRascunho('')
        await carregar()
      } else {
        const e = await resp.json().catch(() => ({}))
        alert(e.error || 'Falha ao enviar a mensagem.')
      }
    } catch {
      alert('Falha ao enviar a mensagem.')
    } finally {
      setEnviando(false)
    }
  }

  async function enviarArquivo(file: File) {
    if (!file || !telSel || enviandoArquivo) return
    setEnviandoArquivo(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const fd = new FormData()
      fd.append('telefone', telSel)
      fd.append('file', file)
      const resp = await fetch('/api/admin/whatsapp/enviar-arquivo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: fd,
      })
      if (resp.ok) {
        await carregar()
      } else {
        const e = await resp.json().catch(() => ({}))
        alert(e.error || 'Falha ao enviar o arquivo.')
      }
    } catch {
      alert('Falha ao enviar o arquivo.')
    } finally {
      setEnviandoArquivo(false)
    }
  }

  // Agrupa por telefone → lista de conversas (mais recente primeiro).
  const conversas = useMemo<Conversa[]>(() => {
    const porTel: Record<string, Conversa> = {}
    for (const m of msgs) {
      if (!porTel[m.telefone]) {
        porTel[m.telefone] = {
          telefone: m.telefone,
          nome: (m as any)._nome ?? null,
          ultima: m.conteudo || (m.midia_tipo ? rotuloMidia(m.midia_tipo) : ''),
          ultimaEm: m.criado_em,
          total: 0,
        }
      } else if (!porTel[m.telefone].nome && (m as any)._nome) {
        porTel[m.telefone].nome = (m as any)._nome
      }
      porTel[m.telefone].total++
    }
    return Object.values(porTel).sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm))
  }, [msgs])

  const conversasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const qDig = q.replace(/\D/g, '')
    const filtradas = conversas.filter((c) => {
      if (desde && c.ultimaEm.slice(0, 10) < desde) return false
      if (!q) return true
      const nomeOk = (c.nome || '').toLowerCase().includes(q)
      const telOk = qDig.length >= 3 && c.telefone.replace(/\D/g, '').includes(qDig)
      return nomeOk || telOk
    })
    // Conversas aguardando atendimento sobem para o topo.
    return filtradas.sort((a, b) => {
      const aa = aguardando[a.telefone] ? 1 : 0
      const bb = aguardando[b.telefone] ? 1 : 0
      if (aa !== bb) return bb - aa
      return b.ultimaEm.localeCompare(a.ultimaEm)
    })
  }, [conversas, busca, desde, aguardando])

  // Mensagens da conversa selecionada (ordem cronológica).
  const thread = useMemo(() => {
    if (!telSel) return [] as Msg[]
    return msgs.filter((m) => m.telefone === telSel).slice().sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  }, [msgs, telSel])

  // Busca URLs assinadas (temporárias) dos anexos da conversa aberta, sob demanda.
  useEffect(() => {
    const pend = thread.map((m) => m.midia_path).filter((p): p is string => !!p && !midiaUrls[p])
    if (!pend.length) return
    let cancel = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const novos: Record<string, string> = {}
      await Promise.all(
        pend.map(async (path) => {
          try {
            const r = await fetch('/api/admin/whatsapp/midia', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ path }),
            })
            if (r.ok) { const d = await r.json(); if (d.url) novos[path] = d.url }
          } catch {}
        }),
      )
      if (!cancel && Object.keys(novos).length) setMidiaUrls((m) => ({ ...m, ...novos }))
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread])

  // Ao abrir/atualizar a conversa, rola a thread pro FIM (a mensagem mais nova é
  // o que interessa). Mexe só no scroll do painel — nunca no scroll da página.
  const threadRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread, telSel])

  const convSel = conversas.find((c) => c.telefone === telSel) || null
  const humanoAtivo = telSel ? !!controle[telSel] : false
  const qtdAguardando = conversas.filter((c) => aguardando[c.telefone]).length

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 md:px-6 md:py-4 sticky top-0 z-10">
        <h1 className="text-base md:text-lg font-semibold text-gray-900">Conversas do WhatsApp</h1>
        <p className="text-xs text-gray-400 mt-0.5">Atendimentos do assistente virtual com os clientes</p>
      </div>

      <div className="max-w-6xl mx-auto px-3 py-3 md:px-6 md:py-5">
        {/* No celular é master-detail: mostra a LISTA ou a CONVERSA (uma de cada
            vez). No desktop (md+) volta a ser lado a lado, como sempre foi. */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[calc(100dvh-104px)] md:h-[calc(100vh-140px)]">

          {/* Lista de conversas */}
          <div className={`${telSel ? 'hidden md:flex' : 'flex'} md:col-span-5 card p-0 flex-col overflow-hidden`}>
            <div className="p-3 border-b border-gray-100 space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou telefone…"
                  className="w-full pl-9 pr-3 py-2 text-base md:text-sm rounded-xl border border-gray-200 focus:border-primary-400 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Desde</label>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 text-base md:text-sm rounded-lg border border-gray-200 focus:border-primary-400 focus:outline-none"
                />
                {desde && (
                  <button onClick={() => setDesde('')} className="text-xs text-primary-600 hover:underline">limpar</button>
                )}
              </div>
            </div>

            {qtdAguardando > 0 && (
              <div className="px-3 py-2 bg-red-50 border-b border-red-100 text-xs font-semibold text-red-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                {qtdAguardando} {qtdAguardando === 1 ? 'conversa aguardando atendimento' : 'conversas aguardando atendimento'}
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {carregando ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-7 h-7 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : conversasFiltradas.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  <MessageCircle size={32} className="mx-auto mb-3 text-gray-300" />
                  Nenhuma conversa encontrada.
                </div>
              ) : (
                conversasFiltradas.map((c) => (
                  <button
                    key={c.telefone}
                    onClick={() => { setTelSel(c.telefone); setRascunho('') }}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                      telSel === c.telefone ? 'bg-primary-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                        {aguardando[c.telefone] && <span title="Aguardando atendimento" className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                        {controle[c.telefone] && <Headset size={13} className="text-green-600 flex-shrink-0" />}
                        {c.nome || 'Não identificado'}
                      </div>
                      <div className="text-[11px] text-gray-400 flex-shrink-0">{fmtDataHora(c.ultimaEm)}</div>
                    </div>
                    <div className="text-xs text-gray-400">{fmtTel(c.telefone)}</div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">{c.ultima}</div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Conversa aberta */}
          <div className={`${telSel ? 'flex' : 'hidden md:flex'} md:col-span-7 card p-0 flex-col overflow-hidden`}>
            {!convSel ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm">
                <MessageCircle size={36} className="mb-3 text-gray-300" />
                Selecione uma conversa para ler.
              </div>
            ) : (
              <>
                <div className="px-3 md:px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2 md:gap-3">
                  <div className="min-w-0 flex items-center gap-1.5">
                    {/* Voltar pra lista — só no celular (no desktop a lista está do lado). */}
                    <button
                      onClick={() => setTelSel(null)}
                      aria-label="Voltar para a lista de conversas"
                      className="md:hidden -ml-1 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{convSel.nome || 'Não identificado'}</div>
                      <div className="text-xs text-gray-400 truncate">{fmtTel(convSel.telefone)} · {convSel.total} mensagens</div>
                      {aguardando[convSel.telefone] && !humanoAtivo && (
                        <div className="text-[11px] font-semibold text-red-600 flex items-center gap-1 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" /> Cliente pediu atendimento
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
                    {aguardando[convSel.telefone] && !humanoAtivo && (
                      <button
                        onClick={() => resolverAguardando(convSel.telefone)}
                        className="px-2.5 md:px-3 py-2 rounded-xl text-xs font-medium border bg-white text-gray-600 border-gray-200 hover:border-primary-300 whitespace-nowrap"
                      >
                        <span className="md:hidden">Resolver</span>
                        <span className="hidden md:inline">Marcar resolvido</span>
                      </button>
                    )}
                    <button
                      onClick={() => toggleHumano(convSel.telefone, !humanoAtivo)}
                      className={`px-2.5 md:px-3 py-2 rounded-xl text-xs font-medium border transition-all whitespace-nowrap ${
                        humanoAtivo
                          ? 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                          : 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                      }`}
                    >
                      <span className="md:hidden">{humanoAtivo ? 'Devolver' : 'Assumir'}</span>
                      <span className="hidden md:inline">{humanoAtivo ? 'Devolver ao assistente' : 'Assumir conversa'}</span>
                    </button>
                  </div>
                </div>

                <div ref={threadRef} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 bg-gray-50">
                  {thread.map((m, i) => {
                    const novoDia = i === 0 || diaStr(thread[i - 1].criado_em) !== diaStr(m.criado_em)
                    const ehCliente = m.role === 'user'
                    const ehHumano = !ehCliente && m.autor === 'humano'
                    const bolha = ehCliente ? 'bg-white border border-gray-200' : ehHumano ? 'bg-green-600 text-white' : 'bg-primary-600 text-white'
                    const tagCor = ehCliente ? 'text-gray-400' : ehHumano ? 'text-green-100' : 'text-primary-100'
                    const horaCor = ehCliente ? 'text-gray-300' : ehHumano ? 'text-green-200' : 'text-primary-200'
                    const quem = ehCliente ? (convSel.nome || 'Cliente') : ehHumano ? 'Atendente' : 'Assistente'
                    return (
                      <div key={m.id}>
                        {novoDia && (
                          <div className="text-center my-3">
                            <span className="text-[11px] text-gray-400 bg-white border border-gray-100 rounded-full px-3 py-1">
                              {diaStr(m.criado_em)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${ehCliente ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[85%] md:max-w-[78%] rounded-2xl px-3.5 py-2 ${bolha}`}>
                            <div className={`flex items-center gap-1.5 mb-0.5 text-[10px] uppercase tracking-wide ${tagCor}`}>
                              {ehCliente ? <User size={11} /> : ehHumano ? <Headset size={11} /> : <Bot size={11} />}
                              {quem}
                            </div>
                            {m.midia_tipo && (
                              <div className="mb-1">
                                {m.midia_tipo === 'image' && m.midia_path && midiaUrls[m.midia_path] ? (
                                  <a href={midiaUrls[m.midia_path]} target="_blank" rel="noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={midiaUrls[m.midia_path]} alt={m.midia_nome || 'imagem'} className="rounded-lg max-h-60 object-contain" />
                                  </a>
                                ) : (
                                  <a
                                    href={m.midia_path ? midiaUrls[m.midia_path] : undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${ehCliente ? 'bg-gray-100 text-gray-700' : 'bg-white/15'} ${m.midia_path && midiaUrls[m.midia_path] ? '' : 'pointer-events-none opacity-80'}`}
                                  >
                                    <FileText size={16} className="flex-shrink-0" />
                                    <span className="truncate">{m.midia_nome || rotuloMidia(m.midia_tipo)}</span>
                                  </a>
                                )}
                              </div>
                            )}
                            {m.conteudo && <div className="text-sm whitespace-pre-wrap break-words">{m.conteudo}</div>}
                            <div className={`text-[10px] mt-1 text-right ${horaCor}`}>{fmtHora(m.criado_em)}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Rodapé: responder (modo humano) ou aviso (modo assistente) */}
                {humanoAtivo ? (
                  <div className="border-t border-gray-100 p-3 flex items-end gap-2">
                    <label
                      className={`flex-shrink-0 p-2 rounded-lg ${enviandoArquivo ? 'text-primary-600' : 'text-gray-400 hover:text-primary-600 cursor-pointer'}`}
                      title="Enviar arquivo (documento, imagem...)"
                    >
                      <Paperclip size={18} />
                      <input
                        type="file"
                        className="hidden"
                        disabled={enviandoArquivo}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.currentTarget.value = '' }}
                      />
                    </label>
                    <textarea
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem() } }}
                      rows={1}
                      placeholder="Escreva sua resposta…"
                      className="flex-1 min-w-0 resize-none px-3 py-2 text-base md:text-sm rounded-xl border border-gray-200 focus:border-primary-400 focus:outline-none max-h-32"
                    />
                    <button
                      onClick={enviarMensagem}
                      disabled={enviando || !rascunho.trim()}
                      className="flex-shrink-0 px-3 md:px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Send size={15} />
                      <span className="hidden md:inline">{enviando ? 'Enviando…' : 'Enviar'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400 text-center">
                    O assistente está respondendo automaticamente. Clique em <span className="font-medium text-gray-600">Assumir conversa</span> para responder você mesmo.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
