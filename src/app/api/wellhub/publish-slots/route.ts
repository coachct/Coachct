// src/app/api/wellhub/publish-slots/route.ts
//
// Publica a grade Club no catálogo do Wellhub (outbound). Fluxo (doc oficial):
//   1) product_id do gym (GET /setup/v1/.../products)
//   2) CLASSE (modalidade) por gym  → wellhub_class_map
//   3) SLOT (horário) por ocorrência → wellhub_slot_map + enfileira sync
//   4) o PATCH de totais quem faz é o worker sync-slots (via fila).
//
// Idempotente: nunca recria classe/slot já mapeado. Protegido pelo segredo do
// cron (Authorization: Bearer CRON_SECRET) OU ?secret= na URL (teste manual).

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createClass, createSlot, getProducts, getCategories, listClasses } from '@/lib/wellhub/booking-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''
const LOTE_SLOTS = 100

// Modalidades espelhadas. tipo = club_aulas.tipo. name/description = como aparece
// no app do Wellhub. Descrição final com grupos musculares pendente do Ricardo.
const MODALIDADES = [
  { tipo: 'lift',               name: 'Lift',              description: 'Treino de força em circuito.' },
  { tipo: 'lift_for_girls',     name: 'Lift for Girls',    description: 'Treino de força em circuito (turma feminina).' },
  { tipo: 'running_funcional',  name: 'Running Funcional', description: 'Corrida em esteira + treino funcional.' },
]

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  // Aceita o segredo pelo header (cron) OU por ?secret= na URL (disparo manual de teste).
  const secretQuery = new URL(req.url).searchParams.get('secret') || ''
  const autorizado = !CRON_SECRET || auth === `Bearer ${CRON_SECRET}` || secretQuery === CRON_SECRET
  if (!autorizado) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // DIAGNÓSTICO: ?probe=1 só testa os GETs e retorna cru, sem criar nada.
  if (new URL(req.url).searchParams.get('probe')) {
    const { data: u } = await supabase.from('unidades').select('wellhub_gym_id')
      .eq('wellhub_estado', 'ativo').not('wellhub_gym_id', 'is', null).limit(1).maybeSingle()
    const gym = (u as any)?.wellhub_gym_id || '465'
    const prods = await getProducts(gym)
    const cats = await getCategories(gym)
    const cls = await listClasses(gym)
    return NextResponse.json({ probe: true, gym,
      temToken: !!(process.env.WELLHUB_BOOKING_API_KEY ?? process.env.WELLHUB_API_KEY),
      tokenFonte: process.env.WELLHUB_BOOKING_API_KEY ? 'WELLHUB_BOOKING_API_KEY (ainda existe!)' : 'WELLHUB_API_KEY (fallback prod)',
      tokenIss: (() => { try { const t = (process.env.WELLHUB_BOOKING_API_KEY ?? process.env.WELLHUB_API_KEY ?? ''); return JSON.parse(Buffer.from((t.split('.')[1] || '') + '==', 'base64').toString()).iss } catch { return '?' } })(),
      base: process.env.WELLHUB_BOOKING_API_BASE ?? '(default sandbox)',
      products: { status: prods.status, erro: prods.erro, body: prods.body },
      categories: { status: cats.status, erro: cats.erro, body: cats.body },
      classes: { status: cls.status, erro: cls.erro, body: cls.body } })
  }

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

// product_id do gym (obrigatório em createClass/createSlot). Override por env.
async function resolverProdutoId(gymId: string): Promise<{ id: number | null; status: number; body: any }> {
  if (process.env.WELLHUB_PRODUCT_ID) return { id: Number(process.env.WELLHUB_PRODUCT_ID), status: 0, body: 'env' }
  const r = await getProducts(gymId)
  const lista = r.body?.products ?? []
  // Preferir produto presencial (virtual=false) — as aulas Club são presenciais.
  const first = Array.isArray(lista) ? (lista.find((p: any) => p.virtual === false) ?? lista[0]) : null
  return { id: first?.product_id ?? null, status: r.status, body: r.body }
}

// Ids nas respostas: createClass → { classes:[{id}] } ; createSlot → { results:[{id}] }
const extrairClassId = (body: any): string | null => {
  const id = body?.classes?.[0]?.id ?? body?.id
  return id != null ? String(id) : null
}
const extrairSlotId = (body: any): string | null => {
  const id = body?.results?.[0]?.id ?? body?.id
  return id != null ? String(id) : null
}

// occur_date no fuso de São Paulo (-03:00 fixo; Brasil sem horário de verão).
function montarOccurDate(data: string, horario: string): string {
  const hhmmss = (horario || '00:00').length === 5 ? `${horario}:00` : (horario || '00:00:00')
  return `${data}T${hhmmss}-03:00`
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
    const faltando = MODALIDADES.filter((m) => !tiposExistentes.has(m.tipo))
    if (!faltando.length) continue

    const prod = await resolverProdutoId(gymId)
    if (!prod.id) { erros.push({ etapa: 'getProducts', gymId, status: prod.status, resposta: prod.body }); continue }

    for (const mod of faltando) {
      const r = await createClass(gymId, { name: mod.name, description: mod.description, product_id: prod.id })
      const classId = extrairClassId(r.body)
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

  // product_id por gym (obrigatório no slot).
  const prodPorGym: Record<string, number | null> = {}
  for (const u of ativas) prodPorGym[u.wellhub_gym_id] = (await resolverProdutoId(u.wellhub_gym_id)).id

  const { data: aulas } = await supabase
    .from('club_aulas').select('id, tipo, horario, unidade_id, duracao_min').in('unidade_id', unidadeIds)
  const aulaById: Record<string, any> = {}
  for (const a of (aulas || [])) aulaById[(a as any).id] = a
  const aulaIds = (aulas || []).map((a: any) => a.id)
  if (!aulaIds.length) return { slotsCriados: 0, slotErros: 0, slotsErrosDetalhe: [] }

  const { data: ocs } = await supabase
    .from('club_ocorrencias').select('id, data, aula_id, status')
    .in('aula_id', aulaIds).gte('data', hoje).limit(LOTE_SLOTS)
  const futuras = (ocs || []).filter((o: any) => o.status !== 'cancelada')
  if (!futuras.length) return { slotsCriados: 0, slotErros: 0, slotsErrosDetalhe: [] }

  const { data: jaMapeados } = await supabase
    .from('wellhub_slot_map').select('ocorrencia_id').in('ocorrencia_id', futuras.map((o: any) => o.id))
  const mapeadas = new Set((jaMapeados || []).map((m: any) => m.ocorrencia_id))

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
    const productId = prodPorGym[gymId]
    if (!productId) continue

    const { data: numsRaw } = await supabase.rpc('wellhub_slot_numbers', { p_ocorrencia_id: (oc as any).id })
    const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw

    const r = await createSlot(gymId, classId, {
      occur_date: montarOccurDate((oc as any).data, aula.horario),
      length_in_minutes: aula.duracao_min ?? 50,
      total_capacity: nums?.total_capacity ?? 0,
      total_booked: nums?.total_booked ?? 0,
      product_id: productId,
    })
    const slotId = extrairSlotId(r.body)
    if (!r.ok || !slotId) {
      if (errosSlots.length < 3) errosSlots.push({ etapa: 'createSlot', ocorrencia: (oc as any).id, status: r.status, resposta: r.body })
      slotErros++
      continue
    }
    const { error } = await supabase.from('wellhub_slot_map')
      .insert({ ocorrencia_id: (oc as any).id, gym_id: gymId, wellhub_class_id: classId, wellhub_slot_id: slotId })
    if (error) { slotErros++; continue }
    await supabase.from('wellhub_slot_sync_queue')
      .upsert({ ocorrencia_id: (oc as any).id, enfileirado_em: new Date().toISOString() }, { onConflict: 'ocorrencia_id' })
    slotsCriados++
  }
  return { slotsCriados, slotErros, slotsErrosDetalhe: errosSlots }
}
