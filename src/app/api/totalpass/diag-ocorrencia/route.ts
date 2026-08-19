// src/app/api/totalpass/diag-ocorrencia/route.ts
//
// DIAGNÓSTICO só-leitura: mostra como uma ocorrência nossa está DO LADO DA TOTALPASS
// (status, slots, slotsInUse) ao lado do que o nosso pool calcula. Serve pra conferir
// se um PUT surtiu efeito de verdade — o app deles pode continuar mostrando vaga
// mesmo depois de a API responder 200.
//
// Uso: POST /api/totalpass/diag-ocorrencia?secret=<CRON_SECRET>
//   &data=2026-08-19            (opcional, default hoje+amanhã)
//   &uuid=<occurrence_uuid>     (opcional, filtra uma só)
//
// Não grava nada e não chama nenhum PUT/DELETE.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listarEventos } from '@/lib/totalpass/booking-api'
import { placesAtivos } from '@/lib/totalpass/places'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') || ''
  const autorizado = !CRON_SECRET || auth === `Bearer ${CRON_SECRET}` || url.searchParams.get('secret') === CRON_SECRET
  if (!autorizado) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const filtroUuid = url.searchParams.get('uuid')
  const filtroData = url.searchParams.get('data')

  // Nossas ocorrências publicadas (mapa) com a capacidade que o pool calcula agora.
  const { data: mapas } = await supabase
    .from('totalpass_slot_map')
    .select('ocorrencia_id, occurrence_uuid, place_id, club_ocorrencias(data, club_aulas(horario, tipo, unidade_id))')
  const nossas: any[] = []
  for (const m of (mapas || [])) {
    const oc = (m as any).club_ocorrencias
    if (!oc) continue
    if (filtroData && oc.data !== filtroData) continue
    if (filtroUuid && (m as any).occurrence_uuid !== filtroUuid) continue
    const { data: numsRaw } = await supabase.rpc('totalpass_slot_numbers', { p_ocorrencia_id: (m as any).ocorrencia_id })
    const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw
    nossas.push({
      uuid: (m as any).occurrence_uuid,
      placeId: (m as any).place_id,
      data: oc.data,
      horario: oc.club_aulas?.horario,
      tipo: oc.club_aulas?.tipo,
      nossa_capacidade: nums?.total_capacity ?? null,
    })
  }

  // Como a TotalPass enxerga essas mesmas ocorrências.
  const porUuid: Record<string, any> = {}
  const errosApi: any[] = []
  for (const place of await placesAtivos(supabase)) {
    const r = await listarEventos(place.apiKey!)
    if (!r.ok) { errosApi.push({ unidade: place.nome, status: r.status, erro: r.erro }); continue }
    const eventos: any[] = Array.isArray(r.body) ? r.body : (r.body?.data ?? r.body?.events ?? [])
    for (const ev of eventos) {
      const ocs: any[] = ev?.eventOccurrences ?? ev?.occurrences ?? (ev?.eventOccurrenceUuid ? [ev] : [])
      for (const o of ocs) {
        const uuid = o?.eventOccurrenceUuid ?? o?.uuid ?? o?.occurrenceUuid
        if (!uuid) continue
        porUuid[String(uuid)] = {
          status: o?.status ?? ev?.status ?? null,
          slots: o?.slots ?? null,
          slotsInUse: o?.slotsInUse ?? o?.slots_in_use ?? null,
          eventDate: o?.eventDate ?? o?.date ?? null,
          startTime: o?.startTime ?? null,
        }
      }
    }
  }

  const linhas = nossas.map((n) => ({
    ...n,
    naTotalpass: porUuid[n.uuid] ?? '(não encontrada na listagem deles)',
  })).sort((a, b) => `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`))

  return NextResponse.json({ ok: true, errosApi, total: linhas.length, linhas })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
