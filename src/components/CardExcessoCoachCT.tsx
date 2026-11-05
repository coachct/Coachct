'use client'
// Card "Horários do CT com mais clientes que coaches" — dashboard admin.
//
// Usa a RPC ct_horarios_excedidos (só leitura): de hoje (horários que ainda
// não passaram) até 14 dias à frente, compara agendados x coaches da grade do
// dia (fixa + extra − férias/afastamentos). Não mexe em reserva nenhuma.
// Se não houver nenhum horário estourado, o card não aparece.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

type Linha = {
  unidade_id: string
  unidade_nome: string
  data: string
  horario: string
  coaches: number
  agendados: number
  excesso: number
}

export default function CardExcessoCoachCT() {
  const supabase = createClient()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('ct_horarios_excedidos', { p_dias: 14 })
      setLinhas((data as Linha[]) || [])
      setCarregando(false)
    }
    load()
  }, [])

  if (carregando || linhas.length === 0) return null

  return (
    <div className="card mb-6 border-l-4 border-l-red-400">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={16} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">CT com mais clientes que coaches</h2>
          <p className="text-xs text-gray-400 mt-0.5">Próximos 14 dias — vale remanejar ou chamar mais um coach</p>
        </div>
      </div>

      <div className="space-y-2">
        {linhas.map(l => {
          const dia = new Date(l.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
          return (
            <Link
              key={`${l.unidade_id}-${l.data}-${l.horario}`}
              href="/admin/agenda"
              className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-red-50 border-red-100 hover:border-red-200"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  <span className="capitalize">{dia}</span> · {l.horario}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  {l.agendados} agendados para {l.coaches} {l.coaches === 1 ? 'coach' : 'coaches'}
                </div>
              </div>
              <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-100 text-red-700">
                +{l.excesso}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
