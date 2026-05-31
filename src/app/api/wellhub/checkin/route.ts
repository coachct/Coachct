// src/app/api/wellhub/checkin/route.ts
//
// Webhook de check-in do Wellhub (Access Control) — INGESTÃO apenas.
// Recebe a notificação de check-in, valida a assinatura, grava em
// entradas_walkin com status 'recebido' e responde 200 rápido (SLA ~1s).
//
// A chamada de /access/v1/validate (que gera o pagamento) NÃO está aqui —
// vem num arquivo separado, depois deste testado.
//
// >>> 2 pontos pra ajustar com dados reais (procure por "AJUSTAR" abaixo):
//   1. GYM_MAP  -> o gym_id da unidade CT no Wellhub (quando você tiver à mão)
//   2. extrair() -> os nomes dos campos dentro do payload, que só dá pra
//      confirmar vendo um payload real do sandbox do Wellhub.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// UUID da unidade CT no nosso banco
const UNIDADE_CT = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef';

// AJUSTAR: mapeia o gym_id do Wellhub -> unidade_id nosso.
// Hoje só CT. Quando vier o gym_id real do Wellhub da unidade CT,
// descomente a linha e troque 'GYM_ID_CT_AQUI' por ele.
const GYM_MAP: Record<string, string> = {
  // 'GYM_ID_CT_AQUI': UNIDADE_CT,
};

// Enquanto o GYM_MAP estiver vazio, como só temos CT, qualquer check-in
// cai na unidade CT. Quando entrar uma segunda unidade, preencher o GYM_MAP
// e remover esse fallback.
function resolverUnidade(gymId: string | null): string {
  if (gymId && GYM_MAP[gymId]) return GYM_MAP[gymId];
  return UNIDADE_CT;
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
// Extração de campos do payload (AJUSTAR com payload real do sandbox)
// ---------------------------------------------------------------------------
function extrair(payload: any) {
  // AJUSTAR: confirmar os nomes reais ao ver um payload do sandbox.
  // Deixei várias chaves possíveis como fallback pra facilitar o teste.
  const gympassId =
    payload?.gympass_id ??
    payload?.gpw_id ??
    payload?.unique_token ??
    payload?.user?.id ??
    null;

  const eventoId =
    payload?.event_id ??
    payload?.checkin_id ??
    payload?.id ??
    null;

  const gymId =
    payload?.gym_id ??
    payload?.gym?.id ??
    null;

  const produto =
    payload?.product ??
    payload?.product_name ??
    null;

  return { gympassId, eventoId, gymId, produto };
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

  const { gympassId, eventoId, gymId, produto } = extrair(payload);

  if (!gympassId) {
    // Sem id do usuário não dá pra registrar. Loga e responde 200 mesmo assim
    // pra não entrar em loop de retry do Wellhub.
    console.error('[wellhub/checkin] payload sem gympass_id:', rawBody);
    return new NextResponse(null, { status: 200 });
  }

  const unidadeId = resolverUnidade(gymId);

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

  // 5. Grava. Idempotência garantida pelo índice único (origem, evento_id):
  //    reentrega do mesmo evento devolve 23505 e a gente trata como sucesso.
  const { error } = await supabase.from('entradas_walkin').insert({
    unidade_id: unidadeId,
    origem: 'wellhub',
    id_externo: String(gympassId),
    evento_id: eventoId ? String(eventoId) : null,
    produto: produto ?? null,
    status: 'recebido',
    raw: payload,
  });

  if (error) {
    // 23505 = violação de unique -> evento já processado, tudo certo.
    if ((error as any).code === '23505') {
      return new NextResponse(null, { status: 200 });
    }
    console.error('[wellhub/checkin] erro ao gravar:', error);
    return new NextResponse('erro ao gravar', { status: 500 });
  }

  // 6. 200 rápido (sem corpo)
  return new NextResponse(null, { status: 200 });
}
