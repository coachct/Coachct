// src/app/api/wellhub/marcar-presenca/route.ts
//
// Reconciliador de PRESENÇA das reservas via app (Opção isolada).
//
// Quando o cliente do app entra na unidade, o check-in do Access Control já
// chega no nosso sistema (entradas_walkin). Esta rota — rodando por cron — casa
// esse check-in com a reserva via_app aberta e marca 'presente'. A tela da aula
// tem realtime, então a presença aparece sozinha quando o status muda.
//
// ISOLAMENTO (regra: não interferir no fluxo atual):
//   * NÃO toca o receiver de check-in (só LÊ entradas_walkin).
//   * Só atualiza reservas via_app=true que estão 'reservado' — nunca encosta
//     numa reserva normal de cliente.
//   * Roda por service role numa rota própria, fora do caminho síncrono de
//     qualquer operação. Se falhar, check-in e reservas seguem 100%.
//   * Toda a lógica vive na RPC wellhub_conciliar_presencas (SQL atômico).
//
// Protegido pelo segredo do cron (Authorization: Bearer CRON_SECRET).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || ''
const JANELA_HORAS = 6

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

  const { data, error } = await supabase.rpc('wellhub_conciliar_presencas', { p_janela_horas: JANELA_HORAS })
  if (error) {
    console.error('[wellhub/presenca] erro ao conciliar:', error)
    return NextResponse.json({ error: 'Erro ao conciliar presenças' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, marcadas: data ?? 0 })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
