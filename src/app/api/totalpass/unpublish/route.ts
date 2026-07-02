// src/app/api/totalpass/unpublish/route.ts
//
// Limpeza: apaga da TotalPass TODAS as ocorrências que publicamos (via
// totalpass_slot_map) e limpa o mapa. Usado pra tirar do ar uma grade errada
// e recomeçar. Protegido pelo CRON_SECRET (?secret= ou Bearer). NÃO gated pelo
// kill switch — limpeza tem que funcionar mesmo com o booking desligado.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deletarOcorrencia } from '@/lib/totalpass/booking-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''

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

  const { data: mapa } = await supabase
    .from('totalpass_slot_map').select('ocorrencia_id, occurrence_uuid')

  let apagadas = 0, falhas = 0
  for (const m of (mapa || [])) {
    const uuid = (m as any).occurrence_uuid as string
    const del = await deletarOcorrencia(uuid)
    if (del.ok) {
      await supabase.from('totalpass_slot_map').delete().eq('ocorrencia_id', (m as any).ocorrencia_id)
      apagadas++
    } else {
      falhas++
    }
  }
  // Limpa também a fila de sync (não faz sentido sincronizar o que não existe mais).
  await supabase.from('totalpass_slot_sync_queue').delete().neq('ocorrencia_id', '00000000-0000-0000-0000-000000000000')

  return NextResponse.json({ ok: true, apagadas, falhas })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
