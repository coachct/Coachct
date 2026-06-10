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
import { createClient } from '@supabase/supabase-js';
import { validarCheckin } from '@/lib/wellhub/validar-checkin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// UUID da unidade CT no nosso banco
const UNIDADE_CT = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef';

// Mapeia o gym_id do Wellhub -> unidade_id nosso.
// Hoje só temos a unidade CT, nos dois ambientes do Wellhub.
const GYM_MAP: Record<string, string> = {
  '465': UNIDADE_CT,    // sandbox
  '542542': UNIDADE_CT, // produção
};

// Fallback: enquanto só existe CT, qualquer gym_id não mapeado cai na CT.
// Quando entrar uma segunda unidade, preencher o GYM_MAP e remover o fallback.
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
  //    .select('id') devolve o id da linha criada, usado na validação.
  const { data: inserida, error } = await supabase
    .from('entradas_walkin')
    .insert({
      unidade_id: unidadeId,
      origem: 'wellhub',
      id_externo: String(gympassId),
      evento_id: eventoId ? String(eventoId) : null,
      produto: produto ?? null,
      status: 'recebido',
      raw: payload,
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = violação de unique -> evento já processado (reentrega).
    //   NÃO revalida: o validate é uso único e a entrada já existe.
    if ((error as any).code === '23505') {
      return new NextResponse(null, { status: 200 });
    }
    console.error('[wellhub/checkin] erro ao gravar:', error);
    return new NextResponse('erro ao gravar', { status: 500 });
  }

  // 6. Dispara a validação em segundo plano (Etapa 1): responde 200 já e
  //    valida logo em seguida. waitUntil garante a execução pós-resposta.
  if (inserida?.id) {
    waitUntil(
      validarCheckin({
        entradaId: inserida.id,
        gympassId,
        produtoId,
        produtoDescricao,
      })
    );
  }

  // 7. 200 rápido (sem corpo)
  return new NextResponse(null, { status: 200 });
}
