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
import { listarEventos, atualizarOcorrencia } from '@/lib/totalpass/booking-api'
import { placesAtivos, apiKeyPorPlace } from '@/lib/totalpass/places'

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

  // ?raw=1: shape cru do GET /partner/events, pra descobrir sob quais chaves vêm
  // as ocorrências (status/slots). Sem PII — evento é grade, não pessoa.
  if (url.searchParams.get('raw')) {
    const out: any[] = []
    for (const place of await placesAtivos(supabase)) {
      const r = await listarEventos(place.apiKey!)
      const b: any = r.body
      const arr: any[] = Array.isArray(b) ? b : (b?.data ?? b?.events ?? [])
      out.push({
        unidade: place.nome, ok: r.ok, status: r.status,
        tipoBody: Array.isArray(b) ? 'array' : typeof b,
        chavesBody: b && !Array.isArray(b) ? Object.keys(b) : null,
        total: arr.length,
        // ⚠️ `Places` traz a placeApiKey em claro — nunca devolver na resposta.
        amostra: arr.slice(0, 2).map(({ Places, ...ev }: any) => ev),
      })
    }
    return NextResponse.json({ raw: true, out })
  }

  // ?acao=inativa|janela&uuid=…: TESTE CONTROLADO de como fechar uma aula lotada na
  // grade deles (a API recusa slots=0). Aplica o PUT num uuid específico e devolve a
  // resposta crua — a releitura sai no modo normal deste endpoint.
  const acao = url.searchParams.get('acao')
  if (acao && filtroUuid) {
    const { data: m } = await supabase
      .from('totalpass_slot_map').select('place_id').eq('occurrence_uuid', filtroUuid).maybeSingle()
    const apiKey = apiKeyPorPlace(String((m as any)?.place_id || ''))
    if (!apiKey) return NextResponse.json({ error: 'uuid sem place/chave' }, { status: 400 })

    let corpo: any
    if (acao === 'inativa') {
      corpo = { status: 'INACTIVE' }
    } else if (acao === 'janela') {
      // Fecha a janela de reserva: maxTimeToBook no passado = ninguém mais reserva.
      const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const fmt = (d: Date) => {
        const p = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: true,
        }).formatToParts(d).reduce((a: any, x) => (a[x.type] = x.value, a), {})
        return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.dayPeriod}`
      }
      corpo = { bookingWindow: { minTimeToBook: fmt(ontem), maxTimeToBook: fmt(ontem) } }
    } else {
      return NextResponse.json({ error: 'acao deve ser inativa ou janela' }, { status: 400 })
    }
    const r = await atualizarOcorrencia(apiKey, filtroUuid, corpo)
    return NextResponse.json({ teste: acao, enviado: corpo, ok: r.ok, status: r.status, resposta: r.body })
  }

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
      const ocs: any[] = ev?.EventOccurrences ?? ev?.eventOccurrences ?? []
      for (const o of ocs) {
        const uuid = o?.uuid ?? o?.eventOccurrenceUuid ?? o?.occurrenceUuid
        if (!uuid) continue
        porUuid[String(uuid)] = {
          statusOcorrencia: o?.status ?? null,
          statusEvento: ev?.status ?? null,
          slots: o?.slots ?? ev?.slots ?? null,
          slotsInUse: o?.slotsInUse ?? o?.slots_in_use ?? null,
          chaves: Object.keys(o || {}), // pra conferir de onde vem cada número
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
