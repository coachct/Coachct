'use client'
// Card "Clientes em acompanhamento" — dashboard admin.
//
// Lista os clientes marcados com clientes.acompanhar = true e mostra a PRÓXIMA
// aula de cada um (Club e/ou CT), pra o admin saber quando a pessoa volta a
// treinar sem ficar caçando na ficha.
//
// Só leitura: não escreve nada e não entra em nenhum fluxo de reserva/check-in.
// Se ninguém estiver marcado, o componente não renderiza nada (card some).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { Eye, ChevronRight } from 'lucide-react'

type Proxima = {
  data: string      // 'YYYY-MM-DD'
  horario: string   // 'HH:MM'
  label: string     // 'Running + Funcional' / 'Coach CT'
  unidade: string
}

type Acompanhado = {
  id: string
  nome: string
  nota: string | null
  proxima: Proxima | null
}

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tipoLabelClub(t?: string | null) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')    return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t || 'Aula'
}

// 'seg, 1 set' — com "Hoje"/"Amanhã" quando for o caso
function rotuloData(dataStr: string, hoje: string, amanha: string) {
  if (dataStr === hoje)   return 'Hoje'
  if (dataStr === amanha) return 'Amanhã'
  return new Date(dataStr + 'T12:00:00')
    .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Quantos dias faltam (pra colorir o destaque)
function diasAte(dataStr: string, hoje: string) {
  const a = new Date(hoje + 'T12:00:00').getTime()
  const b = new Date(dataStr + 'T12:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

export default function CardAcompanhados() {
  const supabase = createClient()
  const [linhas, setLinhas] = useState<Acompanhado[]>([])
  const [carregando, setCarregando] = useState(true)

  const hoje = dataLocalStr(new Date())
  const amanhaDate = new Date(); amanhaDate.setDate(amanhaDate.getDate() + 1)
  const amanha = dataLocalStr(amanhaDate)

  useEffect(() => {
    let ativo = true

    async function load() {
      // 1. Quem está marcado
      const { data: clientes } = await supabase
        .from('clientes')
        .select('id, nome, acompanhar_nota')
        .eq('acompanhar', true)
        .order('nome')

      const marcados = clientes || []
      if (!ativo) return
      if (marcados.length === 0) { setLinhas([]); setCarregando(false); return }

      const ids = marcados.map((c: any) => c.id)

      // Nome das unidades (mapa id -> nome)
      const { data: unidadesRows } = await supabase.from('unidades').select('id, nome')
      const nomeUnidade = new Map<string, string>((unidadesRows || []).map((u: any) => [u.id, u.nome]))

      // 2. Reservas do Club ainda em aberto (consultas simples, sem embed —
      //    são poucos clientes marcados, então o volume é mínimo)
      const { data: reservas } = await supabase
        .from('club_reservas')
        .select('cliente_id, ocorrencia_id')
        .in('cliente_id', ids)
        .eq('status', 'reservado')

      const ocIds = Array.from(new Set((reservas || []).map((r: any) => r.ocorrencia_id).filter(Boolean)))

      let ocorrencias: any[] = []
      let aulas: any[] = []
      if (ocIds.length > 0) {
        const { data: ocs } = await supabase
          .from('club_ocorrencias')
          .select('id, data, aula_id, status')
          .in('id', ocIds)
          .gte('data', hoje)
          .eq('status', 'ativa')
        ocorrencias = ocs || []

        const aulaIds = Array.from(new Set(ocorrencias.map((o: any) => o.aula_id).filter(Boolean)))
        if (aulaIds.length > 0) {
          const { data: as } = await supabase
            .from('club_aulas')
            .select('id, horario, tipo, unidade_id')
            .in('id', aulaIds)
          aulas = as || []
        }
      }

      const ocById   = new Map(ocorrencias.map((o: any) => [o.id, o]))
      const aulaById = new Map(aulas.map((a: any) => [a.id, a]))

      // 3. Agendamentos do Coach CT ainda em aberto
      const { data: ags } = await supabase
        .from('agendamentos')
        .select('cliente_id, data, horario, unidade_id, status')
        .in('cliente_id', ids)
        .in('status', ['agendado', 'confirmado'])
        .gte('data', hoje)

      // 4. Monta a próxima de cada cliente (Club + CT no mesmo bolo)
      const porCliente = new Map<string, Proxima[]>(ids.map((id: string) => [id, []]))

      for (const r of reservas || []) {
        const oc = ocById.get(r.ocorrencia_id)
        if (!oc) continue
        const aula = aulaById.get(oc.aula_id)
        if (!aula) continue
        porCliente.get(r.cliente_id)?.push({
          data: oc.data,
          horario: String(aula.horario || '').slice(0, 5),
          label: tipoLabelClub(aula.tipo),
          unidade: nomeUnidade.get(aula.unidade_id) || 'Club',
        })
      }

      for (const a of ags || []) {
        porCliente.get(a.cliente_id)?.push({
          data: a.data,
          horario: String(a.horario || '').slice(0, 5),
          label: 'Coach CT',
          unidade: nomeUnidade.get(a.unidade_id) || 'Just CT',
        })
      }

      // Só entra quem TEM aula marcada — cliente marcado sem reserva não vira
      // linha no dashboard (seria ruído); ele volta a aparecer quando agendar.
      const resultado: Acompanhado[] = marcados
        .map((c: any) => {
          const lista = (porCliente.get(c.id) || [])
            .sort((x, y) => (x.data + x.horario).localeCompare(y.data + y.horario))
          return { id: c.id, nome: c.nome, nota: c.acompanhar_nota || null, proxima: lista[0] || null }
        })
        .filter((l): l is Acompanhado & { proxima: Proxima } => l.proxima !== null)

      // Aula mais próxima no topo
      resultado.sort((a, b) =>
        (a.proxima!.data + a.proxima!.horario).localeCompare(b.proxima!.data + b.proxima!.horario))

      if (!ativo) return
      setLinhas(resultado)
      setCarregando(false)
    }

    load()
    return () => { ativo = false }
  }, [])

  // Ninguém marcado (ou ainda carregando) => card não aparece
  if (carregando || linhas.length === 0) return null

  return (
    <div className="card mb-6 border-l-4 border-l-amber-400">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
          <Eye size={16} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Clientes em acompanhamento</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {linhas.length} cliente{linhas.length !== 1 ? 's' : ''} com aula marcada
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {linhas.map(l => {
          const dias = l.proxima ? diasAte(l.proxima.data, hoje) : null
          const urgente = dias !== null && dias <= 1
          return (
            <Link
              key={l.id}
              href={`/admin/clientes?id=${l.id}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                urgente
                  ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                  : 'bg-gray-50 border-gray-100 hover:bg-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate capitalize">{l.nome}</div>
                {l.nota && <div className="text-xs text-gray-400 mt-0.5 truncate">{l.nota}</div>}
              </div>

              <div className="flex-shrink-0 text-right">
                <div className={`text-sm font-semibold ${urgente ? 'text-amber-800' : 'text-gray-700'}`}>
                  <span className="capitalize">{rotuloData(l.proxima!.data, hoje, amanha)}</span> · {l.proxima!.horario}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 truncate">
                  {l.proxima!.label} · {l.proxima!.unidade}
                </div>
              </div>

              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
