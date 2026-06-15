// src/app/api/whatsapp/teste/route.ts
//
// Rota TEMPORÁRIA de teste das ferramentas do agente de WhatsApp.
// Permite validar as consultas (consultas.ts) contra o banco real ANTES de
// ter o número do WhatsApp configurado.
//
// Uso:  GET /api/whatsapp/teste?tel=11999998888&token=SEU_TOKEN
//
// Proteção: exige o header/param `token` igual à env WHATSAPP_TEST_TOKEN.
// Se a env não estiver definida, a rota fica desligada (403). Apagar quando
// o agente estiver no ar.

import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabase,
  identificarClientePorTelefone,
  consultarSaldo,
  proximosAgendamentos,
  proximasReservasClub,
  historicoTreinos,
  posicaoNaFila,
  normalizarTelefone,
} from '@/lib/whatsapp/consultas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') ?? req.headers.get('x-test-token')
  const esperado = process.env.WHATSAPP_TEST_TOKEN

  if (!esperado) {
    return NextResponse.json(
      { error: 'Rota de teste desligada — defina WHATSAPP_TEST_TOKEN no ambiente.' },
      { status: 403 },
    )
  }
  if (token !== esperado) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 403 })
  }

  const tel = searchParams.get('tel')
  if (!tel) {
    return NextResponse.json({ error: 'Informe ?tel=DDD+numero' }, { status: 400 })
  }

  try {
    const supabase = createServiceSupabase()

    const ident = await identificarClientePorTelefone(supabase, tel)

    // Só segue para as demais consultas se identificou um cliente.
    if (ident.status !== 'ok') {
      return NextResponse.json({
        telefone_recebido: tel,
        telefone_normalizado: normalizarTelefone(tel),
        identificacao: ident,
      })
    }

    const clienteId = ident.cliente.id
    const [saldo, agendamentos, reservasClub, historico, filas] = await Promise.all([
      consultarSaldo(supabase, clienteId),
      proximosAgendamentos(supabase, clienteId),
      proximasReservasClub(supabase, clienteId),
      historicoTreinos(supabase, clienteId),
      posicaoNaFila(supabase, clienteId),
    ])

    return NextResponse.json({
      telefone_recebido: tel,
      telefone_normalizado: normalizarTelefone(tel),
      identificacao: ident,
      saldo,
      agendamentos,
      reservas_club: reservasClub,
      historico,
      filas,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
