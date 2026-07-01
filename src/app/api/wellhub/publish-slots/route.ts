// src/app/api/wellhub/publish-slots/route.ts
//
// Publica a grade Club no catálogo do Wellhub (outbound). Fluxo do Wellhub:
//   1) garantir a CLASSE (modalidade) por gym  → wellhub_class_map
//   2) garantir o SLOT (horário) por ocorrência → wellhub_slot_map + enfileira sync
//   3) o PATCH de totais quem faz é o worker sync-slots (via fila).
//
// Idempotente: nunca recria classe/slot já mapeado. Protegido pelo segredo do
// cron (Authorization: Bearer CRON_SECRET). Rodar 1x/hora + manualmente no setup.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ ⚠️  É a etapa que MAIS depende de confirmação no sandbox. Os pontos estão  │
// │     centralizados nos helpers SPEC abaixo (resolverCategoria, extrairId,   │
// │     montarDatetime) e nos nomes/descrições de MODALIDADES.                 │
// └──────────────────────────────────────────────────────────────────────────┘

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createClass, createSlot, getCategories } from '@/lib/wellhub/booking-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''
const LOTE_SLOTS = 100

// Modalidades espelhadas. tipo = club_aulas.tipo. name/description = como aparece
// no app do Wellhub (decisão de negócio). Descrição final com grupos musculares
// está pendente da definição do Ricardo (fora de escopo Fase 1).
const MODALIDADES = [
  { tipo: 'lift',               name: 'Lift',              description: 'Treino de força em circuito.' },
  { tipo: 'lift_for_girls',     name: 'Lift for Girls',    description: 'Treino de força em circuito (turma feminina).' },
  { tipo: 'running_funcional',  name: 'Running Funcional', description: 'Corrida em esteira + treino funcional.' },
]

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Unidades integradas e ativas.
  const { data: unidades } = await supabase
    .from('unidades').select('id, wellhub_gym_id').eq('wellhub_estado', 'ativo')
  const ativas = (unidades || []).filter((u: any) => u.wellhub_gym_id)
  if (!ativas.length) return NextResponse.json({ ok: true, msg: 'nenhuma unidade ativa' })

  const classes = await garantirClasses(supabase, ativas)
  const slots = await garantirSlots(supabase, ativas)

  return NextResponse.json({ ok: true, classesCriadas: classes.criadas, classesErros: classes.erros, ...slots })
}

export async function GET(req: NextRequest) {
  return POST(req)
}

// ── Fase 1: classes (1x por gym × modalidade) ────────────────────────────────
async function garantirClasses(supabase: SupabaseClient, ativas: any[]): Promise<{ criadas: number; erros: any[] }> {
  let criadas = 0
  const erros: any[] = []
  for (const u of ativas) {
    const gymId = u.wellhub_gym_id as string
    const { data: jaMapeadas } = await supabase
      .from('wellhub_class_map').select('tipo_aula').eq('gym_id', gymId)
    const tiposExistentes = new Set((jaMapeadas || []).map((c: any) => c.tipo_aula))

    for (const mod of MODALIDADES) {
      if (tiposExistentes.has(mod.tipo)) continue

      const categoryId = await resolverCategoria(gymId)
      if (!categoryId) { erros.push({ etapa: 'getCategories', gymId, tipo: mod.tipo, motivo: 'sem category_id' }); continue }

      const r = await createClass(gymId, { name: mod.name, description: mod.description, category_id: categoryId })
      const classId = extrairId(r.body)
      if (!r.ok || !classId) {
        erros.push({ etapa: 'createClass', gymId, tipo: mod.tipo, status: r.status, resposta: r.body })
        continue
      }
      const { error } = await supabase.from('wellhub_class_map')
        .insert({ gym_id: gymId, tipo_aula: mod.tipo, wellhub_class_id: classId })
      if (!error) criadas++
    }
  }
  return { criadas, erros }
}

// ── Fase 2: slots (ocorrências futuras ainda sem mapa) ───────────────────────
async function garantirSlots(supabase: SupabaseClient, ativas: any[]) {
  const gymPorUnidade: Record<string, string> = {}
  for (const u of ativas) gymPorUnidade[u.id] = u.wellhub_gym_id
  const unidadeIds = ativas.map((u: any) => u.id)
  const hoje = new Date().toISOString().slice(0, 10)

  // Aulas das unidades ativas.
  const { data: aulas } = await supabase
    .from('club_aulas').select('id, tipo, horario, unidade_id').in('unidade_id', unidadeIds)
  const aulaById: Record<string, any> = {}
  for (const a of (aulas || [])) aulaById[(a as any).id] = a
  const aulaIds = (aulas || []).map((a: any) => a.id)
  if (!aulaIds.length) return { slotsCriados: 0, slotErros: 0 }

  // Ocorrências futuras dessas aulas.
  const { data: ocs } = await supabase
    .from('club_ocorrencias').select('id, data, aula_id, status')
    .in('aula_id', aulaIds).gte('data', hoje).limit(LOTE_SLOTS)
  const futuras = (ocs || []).filter((o: any) => o.status !== 'cancelada')
  if (!futuras.length) return { slotsCriados: 0, slotErros: 0 }

  // Já mapeadas → pular.
  const { data: jaMapeados } = await supabase
    .from('wellhub_slot_map').select('ocorrencia_id').in('ocorrencia_id', futuras.map((o: any) => o.id))
  const mapeadas = new Set((jaMapeados || []).map((m: any) => m.ocorrencia_id))

  // Classes por (gym, tipo).
  const { data: classMaps } = await supabase.from('wellhub_class_map').select('gym_id, tipo_aula, wellhub_class_id')
  const classKey = (gym: string, tipo: string) => `${gym}::${tipo}`
  const classByKey: Record<string, string> = {}
  for (const c of (classMaps || [])) classByKey[classKey((c as any).gym_id, (c as any).tipo_aula)] = (c as any).wellhub_class_id

  let slotsCriados = 0, slotErros = 0
  const errosSlots: any[] = []
  for (const oc of futuras) {
    if (mapeadas.has((oc as any).id)) continue
    const aula = aulaById[(oc as any).aula_id]
    if (!aula) continue
    const gymId = gymPorUnidade[aula.unidade_id]
    const classId = classByKey[classKey(gymId, aula.tipo)]
    if (!classId) continue // classe dessa modalidade ainda não publicada

    const { data: numsRaw } = await supabase.rpc('wellhub_slot_numbers', { p_ocorrencia_id: (oc as any).id })
    const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw
    const totalCapacity = nums?.total_capacity ?? 0

    const r = await createSlot(gymId, classId, {
      datetime: montarDatetime((oc as any).data, aula.horario),
      total_capacity: totalCapacity,
    })
    const slotId = extrairId(r.body)
    if (!r.ok || !slotId) {
      if (errosSlots.length < 3) errosSlots.push({ etapa: 'createSlot', ocorrencia: (oc as any).id, status: r.status, resposta: r.body })
      slotErros++
      continue
    }
    const { error } = await supabase.from('wellhub_slot_map')
      .insert({ ocorrencia_id: (oc as any).id, gym_id: gymId, wellhub_class_id: classId, wellhub_slot_id: slotId })
    if (error) { slotErros++; continue }
    // Enfileira pro worker empurrar total_capacity/total_booked atuais.
    await supabase.from('wellhub_slot_sync_queue')
      .upsert({ ocorrencia_id: (oc as any).id, enfileirado_em: new Date().toISOString() }, { onConflict: 'ocorrencia_id' })
    slotsCriados++
  }
  return { slotsCriados, slotErros, slotsErrosDetalhe: errosSlots }
}

// ── Helpers SPEC (⚠️ confirmar no sandbox) ───────────────────────────────────

// Resolve o category_id que createClass exige. O shape de getCategories ainda
// não foi capturado — tenta as formas mais prováveis e permite override por env.
async function resolverCategoria(gymId: string): Promise<string | null> {
  if (process.env.WELLHUB_CATEGORY_ID) return process.env.WELLHUB_CATEGORY_ID
  const r = await getCategories(gymId)
  if (!r.ok) return null
  const lista = Array.isArray(r.body) ? r.body : (r.body?.categories ?? r.body?.data ?? [])
  const primeira = Array.isArray(lista) ? lista[0] : null
  return primeira ? String(primeira.id ?? primeira.category_id ?? primeira.uuid) : null
}

// Extrai o id criado da resposta de createClass/createSlot (nomes a confirmar).
function extrairId(body: any): string | null {
  if (!body) return null
  const id = body.id ?? body.class_id ?? body.slot_id ?? body.uuid ?? body?.data?.id
  return id != null ? String(id) : null
}

// Monta o datetime do slot no fuso de São Paulo (-03:00 fixo; Brasil sem horário
// de verão). ⚠️ confirmar o formato exato que o Wellhub espera.
function montarDatetime(data: string, horario: string): string {
  const hhmmss = (horario || '00:00').length === 5 ? `${horario}:00` : (horario || '00:00:00')
  return `${data}T${hhmmss}-03:00`
}
