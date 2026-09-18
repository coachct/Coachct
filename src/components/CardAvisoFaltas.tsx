'use client'
// Card "Responderam NÃO ao aviso de faltas" — dashboard admin.
//
// Lista as respostas "Não" ao popup de faltas em /agendar (tabela
// avisos_faltas_respostas) ainda não resolvidas. O botão "Resolvido" só marca
// resolvido_em — não mexe em reserva, crédito nem cobrança.
// Se não houver nada em aberto, o card não aparece.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

type Resposta = {
  id: string
  cliente_id: string
  data_tentada: string | null
  hora_tentada: string | null
  unidade: string | null
  criado_em: string
  nome: string
  contato: string | null
}

export default function CardAvisoFaltas() {
  const supabase = createClient()
  const [linhas, setLinhas] = useState<Resposta[]>([])
  const [carregando, setCarregando] = useState(true)

  async function load() {
    const { data: rows } = await supabase
      .from('avisos_faltas_respostas')
      .select('id, cliente_id, data_tentada, hora_tentada, unidade, criado_em')
      .is('resolvido_em', null)
      .order('criado_em', { ascending: false })

    const lista = rows || []
    const ids = Array.from(new Set(lista.map((r: any) => r.cliente_id)))
    let clientes: any[] = []
    if (ids.length > 0) {
      const { data } = await supabase.from('clientes').select('id, nome, whatsapp, telefone').in('id', ids)
      clientes = data || []
    }
    const porId = new Map(clientes.map((c: any) => [c.id, c]))
    setLinhas(lista.map((r: any) => {
      const c = porId.get(r.cliente_id)
      return { ...r, nome: c?.nome || 'Cliente', contato: c?.whatsapp || c?.telefone || null }
    }))
    setCarregando(false)
  }

  useEffect(() => { load() }, [])

  async function resolver(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('avisos_faltas_respostas')
      .update({ resolvido_em: new Date().toISOString(), resolvido_por: user?.id || null })
      .eq('id', id)
    setLinhas(ls => ls.filter(l => l.id !== id))
  }

  if (carregando || linhas.length === 0) return null

  return (
    <div className="card mb-6 border-l-4 border-l-red-400">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={16} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Responderam NÃO ao aviso de faltas</h2>
          <p className="text-xs text-gray-400 mt-0.5">A reserva não foi feita — vale entrar em contato</p>
        </div>
      </div>

      <div className="space-y-2">
        {linhas.map(l => {
          const tentou = l.data_tentada
            ? new Date(l.data_tentada + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
            : null
          const quando = new Date(l.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          return (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-red-50 border-red-100">
              <Link href={`/admin/clientes?id=${l.cliente_id}`} className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate capitalize">{l.nome}</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  Respondeu em {quando}
                  {tentou && <> · tentou <span className="capitalize">{tentou}</span>{l.hora_tentada ? ` ${l.hora_tentada}` : ''}</>}
                  {l.contato && <> · {l.contato}</>}
                </div>
              </Link>
              <button
                onClick={() => resolver(l.id)}
                className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-[#ff2d9b]/40 hover:text-[#ff2d9b]"
              >
                Resolvido
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
