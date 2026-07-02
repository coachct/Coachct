// src/app/api/wellhub/booking/route.ts
//
// Webhook inbound de BOOKING do Wellhub. Eventos (nomes REAIS, com hífen):
//   booking-requested, booking-canceled, booking-late-canceled.
//
// Fluxo confirmado pelo Marco (Wellhub):
//   - booking-requested: aceitar (PATCH booking → RESERVED) + atualizar o
//     total_booked do slot (PATCH capacity) NA HORA.
//   - booking-canceled / booking-late-canceled: atualizar o total_booked (o
//     Wellhub cancela o agendamento do usuário sozinho).
//
// Payload real: event_data.user.unique_token (13 dígitos) + event_data.slot
//   { id, gym_id, class_id, booking_number }.

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { assinaturaWellhubValida } from '@/lib/wellhub/assinatura';
import { patchBookingStatus, patchSlotNumbers } from '@/lib/wellhub/booking-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVT_REQUESTED = 'booking-requested';
const EVT_LATE = 'booking-late-canceled';
const EVENTOS = [EVT_REQUESTED, 'booking-canceled', EVT_LATE];

function extrair(payload: any) {
  const d = payload?.event_data ?? {};
  const u = d?.user ?? {};
  const s = d?.slot ?? {};
  const idUser = u.unique_token ?? u.gympass_id ?? u.id;
  return {
    gympassId: idUser != null ? String(idUser) : null,
    email: u.email ?? null,
    nome: u.name ?? null,
    gymId: s.gym_id != null ? String(s.gym_id) : (d?.gym?.id != null ? String(d.gym.id) : null),
    slotId: s.id != null ? String(s.id) : null,
    classId: s.class_id != null ? String(s.class_id) : null,
    bookingNumber: s.booking_number ?? d?.booking_number ?? null,
  };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const header = req.headers.get('x-gympass-signature');
  if (!assinaturaWellhubValida(rawBody, header)) {
    return new NextResponse('assinatura invalida', { status: 401 });
  }
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return new NextResponse('payload invalido', { status: 400 }); }

  const tipo = payload?.event_type;
  if (!EVENTOS.includes(tipo)) return new NextResponse(null, { status: 200 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[wellhub/booking] env do Supabase ausente');
    return new NextResponse('config ausente', { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (tipo === EVT_REQUESTED) waitUntil(processarRequest(supabase, payload));
  else waitUntil(processarCancelamento(supabase, payload, tipo === EVT_LATE));

  return new NextResponse(null, { status: 200 });
}

// Recalcula o pool e empurra total_capacity/total_booked pro slot do Wellhub AGORA.
async function empurrarTotais(
  supabase: SupabaseClient, gymId: string | null, classId: string | null, slotId: string | null, ocorrenciaId: string
): Promise<void> {
  if (!gymId || !classId || !slotId) return;
  const { data: numsRaw } = await supabase.rpc('wellhub_slot_numbers', { p_ocorrencia_id: ocorrenciaId });
  const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw;
  if (!nums) return;
  await patchSlotNumbers(gymId, classId, slotId, { total_capacity: nums.total_capacity, total_booked: nums.total_booked });
}

// ── booking-requested ────────────────────────────────────────────────────────
async function processarRequest(supabase: SupabaseClient, payload: any): Promise<void> {
  const { gympassId, email, nome, gymId, slotId, classId, bookingNumber } = extrair(payload);
  if (!gymId || !bookingNumber || !slotId) {
    console.error('[wellhub/booking] requested sem gym/slot/booking:', JSON.stringify(payload));
    return;
  }

  const { data: unidade } = await supabase
    .from('unidades').select('id, wellhub_estado').eq('wellhub_gym_id', gymId).maybeSingle();
  if (!unidade || (unidade as any).wellhub_estado !== 'ativo') {
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar'); return;
  }

  const { data: slotMap } = await supabase
    .from('wellhub_slot_map').select('ocorrencia_id, wellhub_class_id')
    .eq('gym_id', gymId).eq('wellhub_slot_id', slotId).maybeSingle();
  if (!slotMap) {
    console.error('[wellhub/booking] slot sem mapa:', slotId);
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar'); return;
  }
  const ocorrenciaId = (slotMap as any).ocorrencia_id;
  const classIdFinal = (slotMap as any).wellhub_class_id ?? classId;

  const { data: oc } = await supabase
    .from('club_ocorrencias').select('id, club_aulas(tipo)').eq('id', ocorrenciaId).maybeSingle();
  if ((oc as any)?.club_aulas?.tipo === 'running_funcional') {
    console.warn('[wellhub/booking] Running é Fase 2 — rejeitando', ocorrenciaId);
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar'); return;
  }

  const { data: clienteId, error: errCli } = await supabase.rpc('wellhub_resolver_cliente', {
    p_wellhub_id: gympassId, p_email: email, p_first: nome, p_last: null,
  });
  if (errCli || !clienteId) {
    console.error('[wellhub/booking] erro resolver cliente:', errCli);
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar'); return;
  }

  const { data: numsRaw } = await supabase.rpc('wellhub_slot_numbers', { p_ocorrencia_id: ocorrenciaId });
  const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw;
  if (!nums || (nums.total_capacity - nums.total_booked) <= 0) {
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar'); return;
  }

  const { error: errIns } = await supabase.from('club_reservas').insert({
    ocorrencia_id: ocorrenciaId, cliente_id: clienteId, tipo_credito: 'wellhub_app',
    status: 'reservado', via_app: true, wellhub_booking_number: bookingNumber,
  });
  if (errIns) {
    // 23505 = reentrega do mesmo booking → confirma de novo e resincroniza.
    if ((errIns as any).code === '23505') {
      await patchBookingStatus(gymId, bookingNumber, 'confirmar');
      await empurrarTotais(supabase, gymId, classIdFinal, slotId, ocorrenciaId);
      return;
    }
    console.warn('[wellhub/booking] insert recusado:', (errIns as any).code, (errIns as any).message);
    await patchBookingStatus(gymId, bookingNumber, 'rejeitar'); return;
  }

  // Aceita a reserva E atualiza o total_booked do slot NA HORA (o que faltava).
  await patchBookingStatus(gymId, bookingNumber, 'confirmar');
  await empurrarTotais(supabase, gymId, classIdFinal, slotId, ocorrenciaId);
}

// ── booking-canceled / booking-late-canceled ─────────────────────────────────
// cancelamento normal → 'cancelado' (libera a vaga do pool). late → 'falta'
// (regra do Ricardo: não libera pro nosso pool). Em ambos, empurra o total_booked.
async function processarCancelamento(supabase: SupabaseClient, payload: any, late: boolean): Promise<void> {
  const { gymId, slotId, classId, bookingNumber } = extrair(payload);
  if (!bookingNumber) { console.error('[wellhub/booking] cancelamento sem booking_number'); return; }

  const patch: any = { status: late ? 'falta' : 'cancelado' };
  if (!late) patch.cancelado_em = new Date().toISOString();

  const { data: reservas } = await supabase
    .from('club_reservas').update(patch)
    .eq('wellhub_booking_number', bookingNumber).neq('status', 'cancelado')
    .select('ocorrencia_id');
  const ocorrenciaId = reservas?.[0]?.ocorrencia_id;
  if (!ocorrenciaId) return;

  // Resolve gym/class/slot pra o PATCH (do payload; completa pelo mapa se faltar).
  let gymFinal = gymId, classFinal = classId, slotFinal = slotId;
  if (!gymFinal || !classFinal || !slotFinal) {
    const { data: m } = await supabase.from('wellhub_slot_map')
      .select('gym_id, wellhub_class_id, wellhub_slot_id').eq('ocorrencia_id', ocorrenciaId).maybeSingle();
    if (m) {
      gymFinal = gymFinal ?? (m as any).gym_id;
      classFinal = classFinal ?? (m as any).wellhub_class_id;
      slotFinal = slotFinal ?? (m as any).wellhub_slot_id;
    }
  }
  await empurrarTotais(supabase, gymFinal, classFinal, slotFinal, ocorrenciaId);
}
