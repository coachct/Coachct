// src/app/api/wellhub/checkin/route.ts
//
// Webhook de check-in do Wellhub (Access Control) — INGESTÃO apenas.
// Recebe a notificação de check-in, valida a assinatura, grava em
// entradas_walkin com status 'recebido' e responde 200 rápido (SLA ~1s).
//
// Após gravar, dispara a validação (validarCheckin) em segundo plano via
// waitUntil — responde 200 rápido e valida o ticket logo em seguida (Etapa 1).
//
// Notas de implementação (confirmadas via doc do sandbox Wellhub):
//   - Payload é ANINHADO em event_data (user / gym / product / timestamp).
//   - Check-in NÃO tem event_id (só booking tem); a chave de idempotência
//     usada aqui é unique_token:timestamp.
//   - A URL é única para todos os eventos (checkin + booking); este handler
//     só processa event_type === 'checkin' e ignora o resto com 200.

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validarCheckin } from '@/lib/wellhub/validar-checkin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// UUID da unidade CT no nosso banco
const UNIDADE_CT = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef';

// Ambientes do Wellhub que são o CT (MUSCULAÇÃO / Access Control). Check-in
// desses entra no fluxo de validação/cobrança de musculação — legado, blindado.
// Qualquer OUTRO gym integrado é unidade de AULAS (Club: Pinheiros/VO).
const GYM_CT = new Set(['465', '542542']); // sandbox + CT produção

// Resolve a unidade do check-in e diz se é unidade de AULAS (Club).
//   - CT (musculação): unidade fixa, tratamento legado (valida como sempre).
//   - Club (aulas): resolve a unidade pela tabela unidades (wellhub_gym_id); NÃO
//     valida como musculação — o check-in só serve pra marcar presença.
//   - Gym desconhecido: cai no CT (não perde o check-in), como era antes.
async function resolverUnidadeInfo(
  supabase: SupabaseClient,
  gymId: string | null
): Promise<{ unidadeId: string; ehClub: boolean }> {
  if (gymId && GYM_CT.has(gymId)) return { unidadeId: UNIDADE_CT, ehClub: false };
  if (gymId) {
    const { data } = await supabase
      .from('unidades').select('id').eq('wellhub_gym_id', gymId).maybeSingle();
    if ((data as any)?.id) return { unidadeId: (data as any).id, ehClub: true };
  }
  return { unidadeId: UNIDADE_CT, ehClub: false };
}

// Marca presença NA HORA do check-in (unidades de aula). Casa a reserva feita
// pelo APP (via_app) da pessoa na aula de hoje e marca 'presente'. Reserva feita
// no nosso site é via_app=false → não casa → recepção marca manual. À prova de
// falha: roda pós-200 (waitUntil) e engole erro — nunca afeta o check-in.
async function marcarPresencaImediata(
  supabase: SupabaseClient,
  gympassId: string | null,
  gymId: string | null
): Promise<void> {
  if (!gympassId || !gymId) return;
  try {
    const { data, error } = await supabase.rpc('wellhub_marcar_presenca_por_checkin', {
      p_gympass_id: String(gympassId),
      p_gym_id: String(gymId),
    });
    if (error) console.error('[wellhub/checkin] presenca imediata falhou:', error);
    else if (data) console.log('[wellhub/checkin] presenca marcada na hora:', data);
  } catch (e) {
    console.error('[wellhub/checkin] presenca imediata excecao:', e);
  }
}

// ---------------------------------------------------------------------------
// Assinatura (HMAC-SHA-1, hex em MAIÚSCULAS, sobre o body cru)
// ---------------------------------------------------------------------------
function assinaturaValida(rawBody: string, header: string | null): boolean {
  const secret = process.env.WELLHUB_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const esperado = crypto
    .createHmac('sha1', secret)
    .update(rawBody, 'utf8')
    .digest('hex')
    .toUpperCase();

  const recebido = header.trim().toUpperCase();

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recebido, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Extração de campos do payload de check-in
//
// Formato real (event_data aninhado):
//   {
//     "event_type": "checkin",
//     "event_data": {
//       "user": { "unique_token", "first_name", "last_name", "email", "phone_number" },
//       "location": { "lat", "lon" },
//       "gym": { "id", "title", "product": { "id", "description" } },
//       "timestamp": <unix>
//     }
//   }
// ---------------------------------------------------------------------------
function extrair(payload: any) {
  const d = payload?.event_data ?? {};

  // unique_token (13 dígitos) é o mesmo valor que o validate pede como gympass_id.
  const gympassId: string | null = d?.user?.unique_token ?? null;

  const gymId: string | null = d?.gym?.id != null ? String(d.gym.id) : null;

  const p = d?.gym?.product;
  const produtoId: string | null = p?.id != null ? String(p.id) : null;
  const produtoDescricao: string | null = p?.description ?? null;
  // produto: "id — descrição" pra ficar legível na listagem (o payload completo
  // fica salvo em raw de qualquer forma).
  const produto: string | null =
    p?.id != null ? `${p.id} — ${p.description ?? ''}`.trim() : (p?.description ?? null);

  const timestamp: number | null = d?.timestamp ?? null;

  // Check-in não traz event_id. Idempotência por unique_token:timestamp —
  // reentrega do mesmo evento gera a mesma chave.
  const eventoId: string | null =
    gympassId && timestamp != null ? `${gympassId}:${timestamp}` : null;

  return { gympassId, eventoId, gymId, produto, produtoId, produtoDescricao };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // 1. Corpo cru (necessário pra validar a assinatura)
  const rawBody = await req.text();

  // 2. Assinatura
  const header = req.headers.get('x-gympass-signature');
  if (!assinaturaValida(rawBody, header)) {
    return new NextResponse('assinatura invalida', { status: 401 });
  }

  // 3. Parse
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('payload invalido', { status: 400 });
  }

  // 3a. URL única recebe todos os eventos (checkin + booking). Aqui só
  // tratamos check-in; o resto é reconhecido com 200 e ignorado.
  if (payload?.event_type !== 'checkin') {
    return new NextResponse(null, { status: 200 });
  }

  const { gympassId, eventoId, gymId, produto, produtoId, produtoDescricao } =
    extrair(payload);

  if (!gympassId) {
    // Sem id do usuário não dá pra registrar. Loga e responde 200 mesmo assim
    // pra não entrar em loop de retry do Wellhub.
    console.error('[wellhub/checkin] payload sem unique_token:', rawBody);
    return new NextResponse(null, { status: 200 });
  }

  // 4. Supabase com service role (passa por cima da RLS)
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('[wellhub/checkin] env do Supabase ausente');
    return new NextResponse('config ausente', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 4a. Roteia por unidade: CT (musculação) x Club (aulas). Separação total —
  //     check-in de aula NÃO entra no fluxo de validação/cobrança de musculação.
  const { unidadeId, ehClub } = await resolverUnidadeInfo(supabase, gymId);

  // 5. Grava. Club entra como 'aula' (não passa pela validação de musculação);
  //    CT entra como 'recebido' (fluxo legado). Idempotência garantida pelo
  //    índice único (origem, evento_id): reentrega devolve 23505 = sucesso.
  const { data: inserida, error } = await supabase
    .from('entradas_walkin')
    .insert({
      unidade_id: unidadeId,
      origem: 'wellhub',
      id_externo: String(gympassId),
      evento_id: eventoId ? String(eventoId) : null,
      produto: produto ?? null,
      status: ehClub ? 'aula' : 'recebido',
      raw: payload,
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = violação de unique -> evento já processado (reentrega).
    if ((error as any).code === '23505') {
      return new NextResponse(null, { status: 200 });
    }
    console.error('[wellhub/checkin] erro ao gravar:', error);
    return new NextResponse('erro ao gravar', { status: 500 });
  }

  // 6. Próximo passo conforme a unidade:
  if (inserida?.id) {
    if (ehClub) {
      // Aulas (Club): marca presença NA HORA (se reservou pelo app). NÃO valida
      // como musculação — some do painel de check-ins do CT.
      waitUntil(marcarPresencaImediata(supabase, gympassId, gymId));
    } else {
      // CT (musculação): validação automática de sempre (Etapa 1). INTOCADO.
      waitUntil(
        validarCheckin({
          entradaId: inserida.id,
          gympassId,
          produtoId,
          produtoDescricao,
        })
      );
    }
  }

  // 7. 200 rápido (sem corpo)
  return new NextResponse(null, { status: 200 });
}
