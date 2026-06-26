// src/app/api/wellhub/booking/route.ts
//
// Webhook inbound de BOOKING do Wellhub (reservas feitas pelo app deles).
// Trata 3 eventos: booking.requested, booking.cancelation, booking.LateCancelation.
//
// Padrão idêntico ao receiver de check-in: valida a assinatura HMAC sobre o body
// cru, responde 200 rápido e processa em segundo plano (waitUntil). A decisão de
// aceitar/rejeitar vai pro Wellhub por um PATCH separado (janela de 15 min), não
// pela resposta deste webhook.
//
// Matching do usuário: gympass_id = número de 13 dígitos ESTÁVEL por pessoa
// (confirmado com dado real de produção do CT). É o mesmo id que chega no
// check-in (entradas_walkin.id_externo) — guardamos em clientes.wellhub_id.

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { assinaturaWellhubValida } from '@/lib/wellhub/assinatura';
import { patchBookingStatus } from '@/lib/wellhub/booking-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENTOS_BOOKING = ['booking.requested', 'booking.cancelation', 'booking.LateCancelation'];

// ── SPEC do payload — ⚠️ confirmar nomes exatos no 1º teste de sandbox ────────
// O formato/estabilidade do id já estão cravados (13 dígitos). Os fallbacks
// cobrem as variações mais prováveis até a captura real.
function extrair(payload: any) {
  const d = payload?.event_data ?? {};
  const u = d?.user ?? {};
  const idUser = u.gympass_id ?? u.unique_token ?? u.id;
  const slot = d?.slot?.id ?? d?.slot_id;
  const bk = d?.booking_number ?? d?.booking?.number ?? d?.booking?.booking_number;
  return {
    gympassId: idUser != null ? String(idUser) : null,
    email: u.email ?? null,
    firstName: u.first_name ?? null,
    lastName: u.last_name ?? null,
    gymId: d?.gym?.id != null ? String(d.gym.id) : null,
    slotId: slot != null ? String(slot) : null,
    bookingNumber: bk != null ? String(bk) : null,
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const header = req.headers.get('x-gympass-signature');
  if (!assinaturaWellhubValida(rawBody, header)) {
    return new NextResponse('assinatura invalida', { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('payload invalido', { status: 400 });
  }

  const tipo = payload?.event_type;
  if (!EVENTOS_BOOKING.includes(tipo)) {
    return new NextResponse(null, { status: 200 }); // não é booking — ignora
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[wellhub/booking] env do Supabase ausente');
    return new NextResponse('config ausente', { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (tipo === 'booking.requested') {
    waitUntil(processarRequest(supabase, payload));
  } else {
    waitUntil(processarCancelamento(supabase, payload, tipo === 'booking.LateCancelation'));
  }
  return new NextResponse(null, { status: 200 });
}

// ── booking.requested: cria a reserva via app (se houver vaga) e confirma ─────
async function processarRequest(supabase: SupabaseClient, payload: any): Promise<void> {
  const { gympassId, email, firstName, lastName, gymId, slotId, bookingNumber } = extrair(payload);
  if (!gymId || !bookingNumber) {
    console.error('[wellhub/booking] requested sem gym_id/booking_number:', JSON.stringify(payload));
    return;
  }

  // 1. Unidade + estado. A fonte da verdade é o NOSSO banco neste instante.
  const { data: unidade } = await supabase
    .from('unidades').select('id, wellhub_estado').eq('wellhub_gym_id', gymId).maybeSingle();
  if (!unidade || (unidade as any).wellhub_estado !== 'ativo') {
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar');
    return;
  }

  // 2. Ocorrência via mapa de slot.
  if (!slotId) { await patchBookingStatus(gymId, bookingNumber, 'rejeitar'); return; }
  const { data: slotMap } = await supabase
    .from('wellhub_slot_map').select('ocorrencia_id')
    .eq('gym_id', gymId).eq('wellhub_slot_id', slotId).maybeSingle();
  if (!slotMap) {
    console.error('[wellhub/booking] slot sem mapa (ocorrência não encontrada):', slotId);
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar');
    return;
  }
  const ocorrenciaId = (slotMap as any).ocorrencia_id;

  // 3. Running é Fase 2 (auto-posição). Por ora rejeita Lift/LFG seguem.
  const { data: oc } = await supabase
    .from('club_ocorrencias').select('id, club_aulas(tipo)').eq('id', ocorrenciaId).maybeSingle();
  if ((oc as any)?.club_aulas?.tipo === 'running_funcional') {
    console.warn('[wellhub/booking] Running ainda não habilitado (Fase 2) — rejeitando', ocorrenciaId);
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar');
    return;
  }

  // 4. Cliente (match wellhub_id → email → shell), via RPC SECURITY DEFINER.
  const { data: clienteId, error: errCli } = await supabase.rpc('wellhub_resolver_cliente', {
    p_wellhub_id: gympassId, p_email: email, p_first: firstName, p_last: lastName,
  });
  if (errCli || !clienteId) {
    console.error('[wellhub/booking] erro ao resolver cliente:', errCli);
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar');
    return;
  }

  // 5. Disponibilidade recomputada do pool (nunca contra cache do Wellhub).
  const { data: numsRaw } = await supabase.rpc('wellhub_slot_numbers', { p_ocorrencia_id: ocorrenciaId });
  const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw;
  const disponivel = nums ? (nums.total_capacity - nums.total_booked) : 0;
  if (disponivel <= 0) {
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar');
    return;
  }

  // 6. Insere a reserva via app. NÃO passa por saldo de plano (autorização é do Wellhub).
  //    A trava validar_duplicidade_reserva_club (1/dia/unidade) VALE no app: se
  //    disparar (P0001), rejeitamos limpo. 23505 = reentrega do mesmo booking → ok.
  const { error: errIns } = await supabase.from('club_reservas').insert({
    ocorrencia_id: ocorrenciaId,
    cliente_id: clienteId,
    tipo_credito: 'wellhub_app',
    status: 'reservado',
    via_app: true,
    wellhub_booking_number: bookingNumber,
  });
  if (errIns) {
    if ((errIns as any).code === '23505') {
      await patchBookingStatus(gymId, bookingNumber, 'confirmar');
      return;
    }
    console.warn('[wellhub/booking] insert recusado:', (errIns as any).code, (errIns as any).message);
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar');
    return;
  }

  // 7. Confirma no Wellhub. O trigger trg_sync_wellhub já reenfileirou o resync da capacidade.
  await patchBookingStatus(gymId, bookingNumber, 'confirmar');
}

// ── cancelation / LateCancelation ────────────────────────────────────────────
// cancelation  → 'cancelado' (libera a vaga; o trigger de fila promove a espera).
// LateCancelation → 'falta'  (NÃO libera a vaga — regra do Ricardo; sem cobrança,
//                              pois via app é excluído da multa). Não dispara fila.
async function processarCancelamento(supabase: SupabaseClient, payload: any, late: boolean): Promise<void> {
  const { bookingNumber } = extrair(payload);
  if (!bookingNumber) {
    console.error('[wellhub/booking] cancelamento sem booking_number:', JSON.stringify(payload));
    return;
  }
  const patch: any = { status: late ? 'falta' : 'cancelado' };
  if (!late) patch.cancelado_em = new Date().toISOString();

  const { error } = await supabase
    .from('club_reservas').update(patch)
    .eq('wellhub_booking_number', bookingNumber)
    .neq('status', 'cancelado');
  if (error) console.error('[wellhub/booking] erro ao processar cancelamento:', error);
}
