// src/app/api/totalpass/publish-slots/route.ts
//
// Publica a grade do Club (Pinheiros) na TotalPass (outbound). Diferente do
// Wellhub, cada ocorrência já cria seu próprio evento — então NÃO há passo de
// "classe" separado: pra cada club_ocorrencia futura sem mapa, cria a ocorrência
// na TotalPass (criarOcorrencia) com a capacidade do pool e guarda o uuid em
// totalpass_slot_map, enfileirando a sync. O ajuste fino de capacidade quem faz
// é o worker sync-slots (via fila).
//
// Idempotente: nunca recria ocorrência já mapeada. Protegido pelo CRON_SECRET
// (header Authorization: Bearer, ou ?secret= na URL pra teste manual).
// Atrás do kill switch TOTALPASS_BOOKING_ATIVO — desligado, não cria nada.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { criarOcorrencia, listarEventos } from '@/lib/totalpass/booking-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''
const LOTE = 80
const PLAN_ID = Number(process.env.TOTALPASS_PINHEIROS_PLAN_ID || '16655') // "Just Run"
const PLACE_ID_PINHEIROS = '41407'
const UNIDADE_PINHEIROS = '166a683d-5fe6-4177-8fd6-53deb70b428e'

// Nome exibido por modalidade (club_aulas.tipo).
const TITULO: Record<string, string> = {
  lift: 'Lift',
  lift_for_girls: 'Lift for Girls',
  running_funcional: 'Running Funcional',
}

// Modalidades habilitadas. Running incluído: o pull-bookings auto-atribui a
// posição (primeira esteira livre, depois funcional) na hora da reserva.
const MODALIDADES_ATIVAS = new Set(['lift', 'lift_for_girls', 'running_funcional'])

// horario "HH:MM" (24h) -> "HH:MM AM/PM" (formato que a TotalPass espera).
function to12h(hhmm: string): string {
  const [hRaw, mRaw] = (hhmm || '00:00').slice(0, 5).split(':')
  const h = Number(hRaw), m = Number(mRaw)
  const ampm = h < 12 ? 'AM' : 'PM'
  let h12 = h % 12
  if (h12 === 0) h12 = 12
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const secretQuery = new URL(req.url).searchParams.get('secret') || ''
  const autorizado = !CRON_SECRET || auth === `Bearer ${CRON_SECRET}` || secretQuery === CRON_SECRET
  if (!autorizado) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // Kill switch: sem ele ligado, não cria nada em produção.
  if (process.env.TOTALPASS_BOOKING_ATIVO !== 'true') {
    return NextResponse.json({ ok: true, msg: 'kill switch OFF — nada publicado' })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // DIAGNÓSTICO: ?probe=1 lista as env TOTALPASS* que a função enxerga (só nomes)
  // e testa a API, sem criar nada.
  if (new URL(req.url).searchParams.get('probe')) {
    const envTotalpass = Object.keys(process.env).filter((k) => k.startsWith('TOTALPASS'))
    const ev = await listarEventos()
    return NextResponse.json({
      probe: true,
      envTotalpass,
      temPlaceKey: !!process.env.TOTALPASS_PINHEIROS_PLACE_API_KEY,
      status: ev.status, erro: ev.erro,
      qtd: Array.isArray(ev.body) ? ev.body.length : null,
    })
  }

  const r = await garantirOcorrencias(supabase)
  return NextResponse.json({ ok: true, ...r })
}

export async function GET(req: NextRequest) {
  return POST(req)
}

async function garantirOcorrencias(supabase: SupabaseClient) {
  const hoje = new Date().toISOString().slice(0, 10)

  // Aulas do Club de Pinheiros (com coach pro campo "responsible").
  const { data: aulas } = await supabase
    .from('club_aulas')
    .select('id, tipo, horario, duracao_min, unidade_id, coaches(nome)')
    .eq('unidade_id', UNIDADE_PINHEIROS)
  const aulaById: Record<string, any> = {}
  for (const a of (aulas || [])) aulaById[(a as any).id] = a
  const aulaIds = (aulas || []).map((a: any) => a.id)
  if (!aulaIds.length) return { criadas: 0, erros: [], msg: 'sem aulas em Pinheiros' }

  // Ocorrências futuras (não canceladas) dessas aulas.
  const { data: ocs } = await supabase
    .from('club_ocorrencias')
    .select('id, data, aula_id, status, coach_escalado:coaches!coach_id(nome)')
    .in('aula_id', aulaIds)
    .gte('data', hoje)
    .limit(LOTE)
  const futuras = (ocs || []).filter((o: any) => o.status !== 'cancelada')
  if (!futuras.length) return { criadas: 0, erros: [], msg: 'sem ocorrências futuras' }

  // Quais já foram publicadas.
  const { data: jaMapeados } = await supabase
    .from('totalpass_slot_map')
    .select('ocorrencia_id')
    .in('ocorrencia_id', futuras.map((o: any) => o.id))
  const mapeadas = new Set((jaMapeados || []).map((m: any) => m.ocorrencia_id))

  let criadas = 0
  const erros: any[] = []
  for (const oc of futuras) {
    if (mapeadas.has((oc as any).id)) continue
    const aula = aulaById[(oc as any).aula_id]
    if (!aula) continue
    if (!MODALIDADES_ATIVAS.has(aula.tipo)) continue // Running fica de fora até ter posição
    const titulo = TITULO[aula.tipo] || aula.tipo
    const responsible =
      (oc as any).coach_escalado?.nome || aula.coaches?.nome || 'Equipe Just Club'

    // Capacidade do pool (min(vagas_totalpass, cap - bloqueadas - próprias)).
    const { data: numsRaw } = await supabase.rpc('totalpass_slot_numbers', { p_ocorrencia_id: (oc as any).id })
    const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw
    const capacidade = nums?.total_capacity ?? 0
    if (capacidade <= 0) continue // nada a expor nessa ocorrência agora

    const r = await criarOcorrencia({
      title: titulo,
      responsible,
      duration: aula.duracao_min ?? 50,
      slots: capacidade,
      planId: PLAN_ID,
      eventDate: (oc as any).data,
      startTime: to12h(aula.horario),
      externalReference: (oc as any).id, // guarda o ocorrencia_id do Club
    })
    const uuid = r.body?.eventOccurrenceUuid
    const eventId = r.body?.eventId
    if (!r.ok || !uuid) {
      if (erros.length < 3) erros.push({ ocorrencia: (oc as any).id, status: r.status, resposta: r.body })
      continue
    }

    const { error } = await supabase.from('totalpass_slot_map').insert({
      ocorrencia_id: (oc as any).id,
      place_id: PLACE_ID_PINHEIROS,
      totalpass_event_id: eventId != null ? String(eventId) : '',
      occurrence_uuid: String(uuid),
    })
    if (error) { erros.push({ ocorrencia: (oc as any).id, etapa: 'map', erro: error.message }); continue }

    await supabase.from('totalpass_slot_sync_queue')
      .upsert({ ocorrencia_id: (oc as any).id, enfileirado_em: new Date().toISOString() }, { onConflict: 'ocorrencia_id' })
    criadas++
  }
  return { criadas, erros }
}
