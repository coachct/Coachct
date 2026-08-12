// src/app/api/admin/totalpass/registrar-webhook-checkin/route.ts
//
// Registro ONE-OFF do webhook de check-in (CHECK_IN_CREATED) das unidades CLUB
// na TotalPass. Passo a passo confirmado pela TotalPass no chamado:
//   1) POST {gym-service-api}/partner/auth  { partner_api_key, place_api_key } -> JWT
//   2) POST {gym-service-api}/partner/webhook/create  (Bearer JWT)
//        { webhook_url, webhook_type: 'CHECKIN' }  -> 201 = registrado
//
// Faz isso POR PLACE (cada unidade tem a sua place_api_key). Usa as chaves que já
// estão no ambiente (Vercel) — não recebe/loga segredo. Só toca nos places CLUB
// (Pinheiros 41407 e Vila Olímpia 6242); o Just CT (63122) já está ativo e NÃO é
// tocado aqui.
//
// Guard: ?secret= tem que bater com CRON_SECRET. Chamar via POST.

import { NextRequest, NextResponse } from 'next/server';
import { apiKeyPorPlace } from '@/lib/totalpass/places';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Host do registro de webhook (diferente do booking-api usado no booking).
const GYM_SERVICE_BASE =
  process.env.TOTALPASS_GYM_SERVICE_BASE ?? 'https://gym-service-api.totalpass.com';

// Domínio canônico do nosso webhook (o sem-www faz 308 pra cá).
const WEBHOOK_HOST = 'https://www.justclubct.com.br';

// Places CLUB a registrar. Just CT (63122) fica de fora de propósito.
const CLUB_PLACES = ['41407', '6242']; // Pinheiros, Vila Olímpia

type PassoResultado = {
  placeId: string;
  ok: boolean;
  etapa: string;
  status?: number;
  resposta?: string;
  erro?: string;
};

async function registrarPlace(
  placeId: string,
  partnerKey: string,
  webhookUrl: string
): Promise<PassoResultado> {
  const placeKey = apiKeyPorPlace(placeId);
  if (!placeKey) {
    return { placeId, ok: false, etapa: 'config', erro: `place_api_key ausente no ambiente para o place ${placeId}` };
  }

  // 1) auth -> JWT
  let jwt: string | null = null;
  try {
    const r = await fetch(`${GYM_SERVICE_BASE}/partner/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_api_key: partnerKey, place_api_key: placeKey }),
    });
    const txt = await r.text();
    let body: any = null;
    try { body = txt ? JSON.parse(txt) : null; } catch { body = null; }
    if (!r.ok) {
      return { placeId, ok: false, etapa: 'auth', status: r.status, resposta: txt?.slice(0, 300) };
    }
    jwt = body?.token ?? body?.access_token ?? body?.jwt ?? body?.data?.token ?? null;
    if (!jwt) {
      return { placeId, ok: false, etapa: 'auth', erro: 'auth OK mas sem token no corpo', resposta: txt?.slice(0, 300) };
    }
  } catch (e: any) {
    return { placeId, ok: false, etapa: 'auth', erro: e?.message ?? String(e) };
  }

  // 2) webhook/create
  try {
    const r = await fetch(`${GYM_SERVICE_BASE}/partner/webhook/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ webhook_url: webhookUrl, webhook_type: 'CHECKIN' }),
    });
    const txt = await r.text();
    return { placeId, ok: r.ok, etapa: 'webhook/create', status: r.status, resposta: txt?.slice(0, 300) };
  } catch (e: any) {
    return { placeId, ok: false, etapa: 'webhook/create', erro: e?.message ?? String(e) };
  }
}

export async function POST(req: NextRequest) {
  // Guard por segredo.
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse('nao autorizado', { status: 401 });
  }

  const partnerKey = process.env.TOTALPASS_PARTNER_API_KEY;
  const token = process.env.TOTALPASS_WEBHOOK_TOKEN;
  if (!partnerKey) return NextResponse.json({ ok: false, erro: 'TOTALPASS_PARTNER_API_KEY ausente' }, { status: 500 });
  if (!token) return NextResponse.json({ ok: false, erro: 'TOTALPASS_WEBHOOK_TOKEN ausente' }, { status: 500 });

  const webhookUrl = `${WEBHOOK_HOST}/api/totalpass/checkin/${token}`;

  // Permite mirar um place específico (?place=6242); por padrão faz os dois Club.
  const alvo = req.nextUrl.searchParams.get('place');
  const places = alvo ? [alvo] : CLUB_PLACES;

  const resultados: PassoResultado[] = [];
  for (const p of places) {
    resultados.push(await registrarPlace(p, partnerKey, webhookUrl));
  }

  return NextResponse.json({
    ok: resultados.every((r) => r.ok),
    webhook_url: `${WEBHOOK_HOST}/api/totalpass/checkin/${token.slice(0, 4)}…`, // mascarado
    resultados,
  });
}
