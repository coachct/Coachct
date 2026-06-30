// src/lib/totalpass/auth.ts
//
// Autenticação da TotalPass (Booking/Partner API).
//
// Troca partner_api_key + place_api_key por um JWT (válido 24h) em
//   POST {base}/partner/auth
// e devolve esse token. O JWT vai como `Authorization: Bearer` em TODA chamada
// seguinte (registrar webhook, etc) — sem ele a API recusa.
//
// Cache em memória do processo: guarda o JWT e só re-autentica quando está
// perto de vencer. Em serverless o cache vale enquanto a função está "quente";
// quando esfria, re-autentica numa boa (a TotalPass aceita re-login).
//
// Esta função SÓ pega o token. Não registra webhook nem grava nada — quem usa
// o token decide o que fazer com ele.
//
// Envs (ver totalpass-fase0.sql):
//   TOTALPASS_PARTNER_API_KEY  -> partner_api_key
//   TOTALPASS_PLACE_API_KEY    -> place_api_key
//   TOTALPASS_API_BASE         -> default https://booking-api.totalpass.com

const API_BASE_PADRAO = 'https://booking-api.totalpass.com';

// Renova com folga: trata o token como válido por 23h, não 24h, pra nunca
// usar um JWT que vence no meio de uma chamada.
const VALIDADE_MS = 23 * 60 * 60 * 1000;

export type ResultadoAuth = {
  token: string | null;
  erro: string | null; // mensagem legível se falhou
};

// Cache no escopo do módulo (vive enquanto a função serverless estiver quente).
let cacheToken: string | null = null;
let cacheExpiraEm = 0; // epoch ms

export async function getTotalpassToken(forcar = false): Promise<ResultadoAuth> {
  // Reaproveita o cache se ainda válido.
  if (!forcar && cacheToken && Date.now() < cacheExpiraEm) {
    return { token: cacheToken, erro: null };
  }

  const partnerKey = process.env.TOTALPASS_PARTNER_API_KEY;
  const placeKey = process.env.TOTALPASS_PLACE_API_KEY;
  const base = process.env.TOTALPASS_API_BASE ?? API_BASE_PADRAO;

  if (!partnerKey) return { token: null, erro: 'TOTALPASS_PARTNER_API_KEY ausente' };
  if (!placeKey) return { token: null, erro: 'TOTALPASS_PLACE_API_KEY ausente' };

  let res: Response;
  try {
    res = await fetch(`${base}/partner/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_api_key: partnerKey,
        place_api_key: placeKey,
      }),
    });
  } catch (e: any) {
    return { token: null, erro: `falha de rede no auth: ${e?.message ?? e}` };
  }

  const texto = await res.text();
  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }

  if (!res.ok) {
    return { token: null, erro: `auth HTTP ${res.status}: ${texto?.slice(0, 200)}` };
  }

  // A doc retorna o JWT no corpo; o nome do campo pode variar entre versões
  // da API (token / access_token / jwt). Tenta os mais comuns.
  const token: string | null =
    corpo?.token ?? corpo?.access_token ?? corpo?.jwt ?? corpo?.data?.token ?? null;

  if (!token) {
    return { token: null, erro: `auth sem token no corpo: ${texto?.slice(0, 200)}` };
  }

  cacheToken = token;
  cacheExpiraEm = Date.now() + VALIDADE_MS;
  return { token, erro: null };
}
