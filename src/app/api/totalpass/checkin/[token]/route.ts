// src/app/api/totalpass/checkin/[token]/route.ts
//
// Webhook de check-in da TotalPass (CHECK_IN_CREATED) — INGESTÃO apenas.
// Espelho do receiver do Wellhub (/api/wellhub/checkin), com as diferenças
// da TotalPass:
//   - Autenticação por TOKEN no PATH da URL (não HMAC). A TotalPass chama a
//     URL que registramos, que já carrega o token secreto no fim do caminho.
//   - Resposta esperada: HTTP 200 com corpo "1" (não vazio).
//   - Usuário identificado por CPF (user.document_number) + code estável.
//
// Fluxo: valida o token, grava em entradas_walkin (origem='totalpass') com
// status 'recebido', responde 200 "1" rápido, e dispara em segundo plano
// (waitUntil) a confirmação + valor (validarCheckinTotalpass).
//
// SEGURANÇA / ISOLAMENTO:
//   - Atrás do kill switch TOTALPASS_CHECKIN_ATIVO: enquanto != 'true', responde
//     200 "1" e IGNORA (não grava, não confirma). O teste roda em PRODUÇÃO,
//     então nasce desligado.
//   - Só LÊ/escreve a própria tabela entradas_walkin. Não encosta em reserva,
//     check-in nem pagamento do fluxo atual.

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { createClient } from '@supabase/supabase-js';
import { validarCheckinTotalpass } from '@/lib/totalpass/validar-checkin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// UUID da unidade Just CT (mesma do receiver Wellhub).
const UNIDADE_CT = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef';

// Resposta padrão que a TotalPass espera: 200 com corpo "1".
function ok1() {
  return new NextResponse('1', { status: 200 });
}

// Extrai os campos do payload CHECK_IN_CREATED.
//   user.code         -> id estável do usuário (id_externo)
//   user.document_number -> CPF (casamento com clientes na Fase 3)
//   check_in.plan_code   -> produto/plano (chave do valor por check-in)
//   place.code        -> código da unidade na TotalPass (63122 = Just CT)
//   check_in.started_at  -> momento do check-in (idempotência + validado_em)
function extrair(payload: any) {
  const userCode: string | null = payload?.user?.code ?? null;
  const cpf: string | null = payload?.user?.document_number ?? null;
  const planCode: string | null = payload?.check_in?.plan_code ?? null;
  const placeCode: string | null = payload?.place?.code ?? null;
  const startedAt: string | null = payload?.check_in?.started_at ?? null;
  const endpoint: string | null = payload?.endpoint ?? null;

  // Idempotência: mesmo usuário + mesmo started_at = mesmo check-in.
  const eventoId: string | null =
    userCode && startedAt ? `${userCode}:${startedAt}` : null;

  return { userCode, cpf, planCode, placeCode, startedAt, endpoint, eventoId };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  // 1. Autenticação: o token do path tem que bater com o nosso segredo.
  const segredo = process.env.TOTALPASS_WEBHOOK_TOKEN;
  if (!segredo || params.token !== segredo) {
    return new NextResponse('nao autorizado', { status: 401 });
  }

  // 2. Corpo
  const rawBody = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse('payload invalido', { status: 400 });
  }

  // 3. Kill switch: enquanto desligado, reconhece com 200 "1" e ignora.
  if (process.env.TOTALPASS_CHECKIN_ATIVO !== 'true') {
    console.log('[totalpass/checkin] kill switch OFF — ignorado:', rawBody.slice(0, 300));
    return ok1();
  }

  // 4. Só tratamos CHECK_IN_CREATED. Outros tipos: reconhece e ignora.
  if (payload?.type !== 'CHECK_IN_CREATED') {
    return ok1();
  }

  const { userCode, cpf, planCode, placeCode, startedAt, endpoint, eventoId } =
    extrair(payload);

  if (!userCode) {
    // Sem id do usuário não dá pra registrar de forma idempotente. Loga e
    // responde 200 "1" pra não entrar em loop de reentrega.
    console.error('[totalpass/checkin] payload sem user.code:', rawBody);
    return ok1();
  }

  // 5. Supabase service role (passa por cima da RLS).
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[totalpass/checkin] env do Supabase ausente');
    return new NextResponse('config ausente', { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 5a. Resolve a unidade pelo place.code. Hoje só Just CT; fallback na CT.
  let unidadeId = UNIDADE_CT;
  if (placeCode) {
    const { data: uni } = await supabase
      .from('unidades')
      .select('id')
      .eq('totalpass_place_id', placeCode)
      .maybeSingle();
    if (uni?.id) unidadeId = uni.id as string;
  }

  // 6. Grava. Idempotência pelo índice único (origem, evento_id): reentrega do
  //    mesmo check-in devolve 23505 e tratamos como sucesso (sem revalidar).
  const { data: inserida, error } = await supabase
    .from('entradas_walkin')
    .insert({
      unidade_id: unidadeId,
      origem: 'totalpass',
      id_externo: String(userCode),
      evento_id: eventoId ? String(eventoId) : null,
      produto: planCode ?? null,
      status: 'recebido',
      raw: payload,
    })
    .select('id')
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      return ok1(); // já processado (reentrega)
    }
    console.error('[totalpass/checkin] erro ao gravar:', error);
    return new NextResponse('erro ao gravar', { status: 500 });
  }

  // 7. Segundo plano: confirma de volta na TotalPass + marca validado + valor.
  if (inserida?.id) {
    waitUntil(
      validarCheckinTotalpass({
        entradaId: inserida.id,
        planCode,
        startedAt,
        endpoint,
        cpf,
      })
    );
  }

  // 8. 200 "1" rápido.
  return ok1();
}
