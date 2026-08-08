// src/app/api/health/integracoes/route.ts
//
// SENTINELA de saúde das integrações (TotalPass/Wellhub) + capacidade.
// Roda por cron a cada 3h (e sob demanda). Faz:
//   * checagens de BANCO via RPC saude_integracoes() (overbooking, filas de sync,
//     reservas sem posição) — a query pesada mora no banco.
//   * AUTH probe: autentica de fato em cada place TotalPass ativo (pega chave
//     inválida/expirada na hora — foi o que derrubou a Vila Olímpia em 08/08).
//   * grava um snapshot em integracoes_health (o painel do admin lê o último).
//
// Silêncio = tudo verde. `ok=false` + `problemas[]` quando algo está vermelho.
// Protegido pelo CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listarSlots } from '@/lib/totalpass/booking-api'
import { placesAtivos } from '@/lib/totalpass/places'
import { listClasses } from '@/lib/wellhub/booking-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''
const FILA_ATRASO_MIN = 30 // fila de sync acima disso = sync travado/erro

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

  // 1) Checagens de banco.
  const { data: retrato, error: errRpc } = await supabase.rpc('saude_integracoes')
  const rel: any = (retrato && typeof retrato === 'object') ? { ...retrato } : {}
  if (errRpc) rel.erro_rpc = errRpc.message

  // 2) Auth probe TotalPass — autentica + lista uma janela curta por place ativo.
  const agora = new Date()
  const fim = new Date(agora.getTime() + 24 * 60 * 60 * 1000)
  const authTp: Array<{ unidade: string; ok: boolean; erro: string | null }> = []
  try {
    for (const place of await placesAtivos(supabase)) {
      const sl = await listarSlots(place.apiKey!, { slotDateFrom: agora.toISOString(), slotDateTo: fim.toISOString() })
      authTp.push({ unidade: place.nome, ok: sl.ok, erro: sl.ok ? null : (sl.erro || `HTTP ${sl.status}`) })
    }
  } catch (e: any) {
    authTp.push({ unidade: '(falha geral)', ok: false, erro: String(e?.message ?? e) })
  }
  rel.auth_totalpass = authTp

  // 2b) Auth probe Wellhub — lista as classes do gym (autentica na Booking API).
  // gymId único por unidade; chave única (WELLHUB_BOOKING_API_KEY). Só unidades ativas.
  const authWh: Array<{ unidade: string; ok: boolean; erro: string | null }> = []
  try {
    const { data: gyms } = await supabase
      .from('unidades')
      .select('nome, wellhub_gym_id')
      .eq('wellhub_estado', 'ativo')
      .not('wellhub_gym_id', 'is', null)
    for (const u of (gyms || [])) {
      const r = await listClasses(String((u as any).wellhub_gym_id))
      authWh.push({ unidade: (u as any).nome, ok: r.ok, erro: r.ok ? null : (r.erro || `HTTP ${r.status}`) })
    }
  } catch (e: any) {
    authWh.push({ unidade: '(falha geral)', ok: false, erro: String(e?.message ?? e) })
  }
  rel.auth_wellhub = authWh
  rel.verificado_em = agora.toISOString()

  // 3) Semáforo geral.
  const problemas: string[] = []
  const over = Array.isArray(rel.overbooking) ? rel.overbooking : []
  const semPos = Array.isArray(rel.sem_posicao) ? rel.sem_posicao : []
  if (over.length) problemas.push(`${over.length} aula(s) futura(s) com overbooking`)
  if (authTp.some(a => !a.ok)) problemas.push(`auth TotalPass falhando (${authTp.filter(a => !a.ok).map(a => a.unidade).join(', ')})`)
  if (authWh.some(a => !a.ok)) problemas.push(`auth Wellhub falhando (${authWh.filter(a => !a.ok).map(a => a.unidade).join(', ')})`)
  if ((rel.fila_totalpass?.mais_antigo_min ?? 0) > FILA_ATRASO_MIN) problemas.push('fila de sync TotalPass atrasada')
  if ((rel.fila_wellhub?.mais_antigo_min ?? 0) > FILA_ATRASO_MIN) problemas.push('fila de sync Wellhub atrasada')
  if (semPos.length) problemas.push(`${semPos.length} aula(s) com reserva sem posição`)
  const ok = problemas.length === 0
  rel.problemas = problemas

  // 4) Snapshot (não derruba a resposta se falhar).
  try {
    await supabase.from('integracoes_health').insert({ ok, relatorio: rel })
  } catch (e: any) {
    console.warn('[saude] falha ao gravar snapshot:', e?.message ?? e)
  }

  return NextResponse.json({ ok, problemas, relatorio: rel })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
