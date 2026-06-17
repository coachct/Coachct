'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { MessageCircle, Search, Bot, User } from 'lucide-react'

// Quantas mensagens trazer (volume ainda baixo; subir depois se precisar).
const LIMITE_MSGS = 3000

type Msg = {
  id: string
  telefone: string
  cliente_id: string | null
  role: 'user' | 'assistant'
  conteudo: string
  criado_em: string
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

export default function ConversasPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [msgs, setMsgs] = useState<Msg[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [desde, setDesde] = useState('') // AAAA-MM-DD opcional
  const [telSel, setTelSel] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregar() }, [perfil])

  async function carregar() {
    setCarregando(true)
    const { data: linhas } = await supabase
      .from('whatsapp_mensagens')
      .select('id, telefone, cliente_id, role, conteudo, criado_em')
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
    // Injeta o nome em cada mensagem (quando houver cliente_id).
    setMsgs(lista.map((m) => ({ ...m, _nome: m.cliente_id ? nomeMap[m.cliente_id] : null } as any)))
    setCarregando(false)
  }

  // Agrupa por telefone → lista de conversas (mais recente primeiro).
  const conversas = useMemo<Conversa[]>(() => {
    const porTel: Record<string, Conversa> = {}
    for (const m of msgs) {
      // msgs já vem do mais novo pro mais antigo → a 1ª que vejo de cada tel é a última.
      if (!porTel[m.telefone]) {
        porTel[m.telefone] = {
          telefone: m.telefone,
          nome: (m as any)._nome ?? null,
          ultima: m.conteudo,
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
    return conversas.filter((c) => {
      if (desde && c.ultimaEm.slice(0, 10) < desde) return false
      if (!q) return true
      const nomeOk = (c.nome || '').toLowerCase().includes(q)
      const telOk = qDig.length >= 3 && c.telefone.replace(/\D/g, '').includes(qDig)
      return nomeOk || telOk
    })
  }, [conversas, busca, desde])

  // Mensagens da conversa selecionada (ordem cronológica).
  const thread = useMemo(() => {
    if (!telSel) return [] as Msg[]
    return msgs.filter((m) => m.telefone === telSel).slice().sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  }, [msgs, telSel])

  const convSel = conversas.find((c) => c.telefone === telSel) || null

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-gray-900">Conversas do WhatsApp</h1>
        <p className="text-xs text-gray-400 mt-0.5">Atendimentos do assistente virtual com os clientes</p>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-5">
        <div className="grid grid-cols-12 gap-4" style={{ height: 'calc(100vh - 140px)' }}>

          {/* Lista de conversas */}
          <div className="col-span-5 card p-0 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100 space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou telefone…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 focus:border-primary-400 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-400">Desde</label>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-primary-400 focus:outline-none"
                />
                {desde && (
                  <button onClick={() => setDesde('')} className="text-xs text-primary-600 hover:underline">limpar</button>
                )}
              </div>
            </div>

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
                    onClick={() => setTelSel(c.telefone)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                      telSel === c.telefone ? 'bg-primary-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900 truncate">
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
          <div className="col-span-7 card p-0 flex flex-col overflow-hidden">
            {!convSel ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm">
                <MessageCircle size={36} className="mb-3 text-gray-300" />
                Selecione uma conversa para ler.
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{convSel.nome || 'Não identificado'}</div>
                    <div className="text-xs text-gray-400">{fmtTel(convSel.telefone)} · {convSel.total} mensagens</div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                  {thread.map((m, i) => {
                    const novoDia = i === 0 || diaStr(thread[i - 1].criado_em) !== diaStr(m.criado_em)
                    const ehCliente = m.role === 'user'
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
                          <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
                            ehCliente ? 'bg-white border border-gray-200' : 'bg-primary-600 text-white'
                          }`}>
                            <div className={`flex items-center gap-1.5 mb-0.5 text-[10px] uppercase tracking-wide ${ehCliente ? 'text-gray-400' : 'text-primary-100'}`}>
                              {ehCliente ? <User size={11} /> : <Bot size={11} />}
                              {ehCliente ? (convSel.nome || 'Cliente') : 'Assistente'}
                            </div>
                            <div className="text-sm whitespace-pre-wrap break-words">{m.conteudo}</div>
                            <div className={`text-[10px] mt-1 text-right ${ehCliente ? 'text-gray-300' : 'text-primary-200'}`}>
                              {fmtHora(m.criado_em)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
