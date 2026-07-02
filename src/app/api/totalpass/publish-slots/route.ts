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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const params = new URL(req.url).searchParams

  // DIAGNÓSTICO: ?probe=1 lista as env TOTALPASS* que a função enxerga (só nomes)
  // e testa a API, sem criar nada.
  if (params.get('probe')) {
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

  // DRY-RUN: ?dryrun=1 mostra o que publicaria (só lê o nosso banco, NÃO toca na
  // TotalPass e ignora o kill switch) — pra conferir os dados antes de subir.
  const dryrun = !!params.get('dryrun')

  // Kill switch: só bloqueia a publicação REAL. O dry-run sempre roda.
  if (!dryrun && process.env.TOTALPASS_BOOKING_ATIVO !== 'true') {
    return NextResponse.json({ ok: true, msg: 'kill switch OFF — nada publicado' })
  }

  const r = await garantirOcorrencias(supabase, dryrun)
  return NextResponse.json({ ok: true, ...r })
}

export async function GET(req: NextRequest) {
  return POST(req)
}

async function garantirOcorrencias(supabase: SupabaseClient, dryrun: boolean) {
  const hoje = new Date().toISOString().slice(0, 10)
  const fim = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Aulas ATIVAS do Club de Pinheiros — IGUAL ao calendário (ativo=true).
  const { data: aulas } = await supabase
    .from('club_aulas')
    .select('id, tipo, horario, duracao_min, coaches(nome), grupos_musculares(nome)')
    .eq('unidade_id', UNIDADE_PINHEIROS)
    .eq('ativo', true)
  const aulaById: Record<string, any> = {}
  for (const a of (aulas || [])) aulaById[(a as any).id] = a
  const aulaIds = (aulas || []).map((a: any) => a.id)
  if (!aulaIds.length) return { criadas: 0, erros: [], msg: 'sem aulas ativas em Pinheiros' }

  // Ocorrências ATIVAS na janela (14 dias) — IGUAL ao calendário (status='ativa').
  const { data: ocs } = await supabase
    .from('club_ocorrencias')
    .select('id, data, aula_id, status, coach_escalado:coaches!coach_id(nome)')
    .in('aula_id', aulaIds)
    .gte('data', hoje)
    .lte('data', fim)
    .eq('status', 'ativa')
    .order('data', { ascending: true })
    .limit(400)
  const ativas = ocs || []
  if (!ativas.length) return { criadas: 0, erros: [], msg: 'sem ocorrências ativas na janela' }

  // Já publicadas.
  const { data: jaMapeados } = await supabase
    .from('totalpass_slot_map').select('ocorrencia_id')
    .in('ocorrencia_id', ativas.map((o: any) => o.id))
  const mapeadas = new Set((jaMapeados || []).map((m: any) => m.ocorrencia_id))

  const preview: any[] = []
  let criadas = 0
  const erros: any[] = []

  for (const oc of ativas) {
    if (!dryrun && mapeadas.has((oc as any).id)) continue
    const aula = aulaById[(oc as any).aula_id]
    if (!aula) continue
    if (!MODALIDADES_ATIVAS.has(aula.tipo)) continue
    const grupo = aula.grupos_musculares?.nome || undefined
    const base = TITULO[aula.tipo] || aula.tipo
    // Paliativo: grupo muscular no título (ex.: "Lift · Superiores") pra destacar
    // o que importa, já que a TotalPass carimba "Just Run" na descrição.
    const titulo = grupo ? `${base} · ${grupo}` : base
    const responsible =
      (oc as any).coach_escalado?.nome?.trim() || aula.coaches?.nome?.trim() || 'Just Club'

    const { data: numsRaw } = await supabase.rpc('totalpass_slot_numbers', { p_ocorrencia_id: (oc as any).id })
    const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw
    const capacidade = nums?.total_capacity ?? 0

    // DRY-RUN: só coleta o que publicaria, sem tocar na TotalPass.
    if (dryrun) {
      preview.push({ data: (oc as any).data, tipo: aula.tipo, titulo, horario: aula.horario,
        coach: responsible, grupo: grupo ?? null, capacidade })
      continue
    }

    if (capacidade <= 0) continue // nada a expor nessa ocorrência agora

    const r = await criarOcorrencia({
      title: titulo,
      responsible,
      duration: aula.duracao_min ?? 50,
      slots: capacidade,
      planId: PLAN_ID,
      eventDate: (oc as any).data,
      startTime: to12h(aula.horario),
      description: grupo,
      externalReference: (oc as any).id,
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

  if (dryrun) return { dryrun: true, totalNaJanela: ativas.length, publicaria: preview.length, preview: preview.slice(0, 60) }
  return { criadas, erros }
}
