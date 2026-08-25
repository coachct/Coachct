// src/app/api/marcar-faltas/route.ts
//
// FALTA AUTOMÁTICA (rede de segurança da recepção).
//
// Passada 1h do início da aula, o que ficou "em branco" — sem presença/check-in
// e sem falta — é marcado como falta. Vale para o Just Club (club_reservas) e
// para o Coach CT (agendamentos).
//
// Toda a lógica vive na RPC marcar_faltas_automaticas (SQL atômico). Esta rota
// só chama a RPC com service role, do mesmo jeito que os outros crons.
//
// ISOLAMENTO (regra: não interferir no fluxo atual):
//   * Não toca reserva, check-in nem pagamento — só troca status de registro
//     de aula que JÁ PASSOU, exatamente como o botão da recepção faz.
//   * Kill switch: FALTA_AUTO_ATIVO=false na Vercel desliga sem deploy
//     (a rota passa a responder em modo simulação, sem marcar nada).
//   * Se falhar, devolve 500 e nada mais no sistema é afetado.
//
// Uso manual (admin/debug):
//   ?dry=1           -> só conta quantas marcaria, não marca
//   ?tolerancia=90   -> minutos após o início da aula (padrão 60)
//   ?horas=24        -> não olha nada mais antigo que isso (padrão 24)
//
// Protegido pelo segredo do cron (Authorization: Bearer CRON_SECRET).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || ''
const ATIVO = process.env.FALTA_AUTO_ATIVO !== 'false'

const TOLERANCIA_PADRAO = 60 // minutos após o início da aula
const LIMITE_HORAS_PADRAO = 24 // janela máxima olhada para trás

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

  const url = new URL(req.url)
  const tolerancia = Number(url.searchParams.get('tolerancia')) || TOLERANCIA_PADRAO
  const horas = Number(url.searchParams.get('horas')) || LIMITE_HORAS_PADRAO
  // Kill switch desligado => nunca marca, só simula.
  const dryRun = !ATIVO || url.searchParams.get('dry') === '1'

  const { data, error } = await supabase.rpc('marcar_faltas_automaticas', {
    p_tolerancia_min: tolerancia,
    p_limite_horas: horas,
    p_dry_run: dryRun,
  })

  if (error) {
    console.error('[marcar-faltas] erro:', error)
    return NextResponse.json({ error: 'Erro ao marcar faltas' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ativo: ATIVO, ...(data as object) })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
