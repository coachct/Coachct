// src/lib/totalpass/booking-api.ts
//
// Cliente HTTP da Booking API da TotalPass (SAÍDA — chamadas que NÓS fazemos).
// MULTI-UNIDADE: cada função recebe a `placeKey` (place_api_key da unidade) como
// primeiro argumento; o JWT é cacheado POR place. Quem resolve qual place usar é
// o chamador (via src/lib/totalpass/places.ts). Shapes confirmados na doc oficial:
//   POST   /partner/auth                              -> JWT (por place)
//   POST   /partner/event-occurrence                 -> cria ocorrência avulsa
//   PUT    /partner/event-occurrence/{occurrenceUuid}-> atualiza (inclui slots/capacidade)
//   GET    /partner/events                            -> lista eventos
//   GET    /partner/slot                             -> lista reservas (polling)
//   DELETE /partner/slot/{slotId}                    -> cancela reserva
//   DELETE /partner/event-occurrence/{uuid}          -> deleta ocorrência
//
// Este módulo só FALA com a API — não decide nada nem grava no banco. Sempre
// atrás do kill switch TOTALPASS_BOOKING_ATIVO (checado nos routes).

const API_BASE_PADRAO = 'https://booking-api.totalpass.com';
const VALIDADE_MS = 23 * 60 * 60 * 1000; // renova o JWT com folga (vale 24h)
const TIMEOUT_MS = 8000;

export type TPResult = { ok: boolean; status: number; body: any; erro?: string };

// ── Auth (JWT por place, cache em memória do processo) ────────────────────────
const cacheTokens = new Map<string, { token: string; expira: number }>();

async function tokenDoPlace(placeKey: string, forcar = false): Promise<{ token: string | null; erro: string | null }> {
  if (!placeKey) return { token: null, erro: 'place_api_key ausente' };
  const cached = cacheTokens.get(placeKey);
  if (!forcar && cached && Date.now() < cached.expira) {
    return { token: cached.token, erro: null };
  }
  const partnerKey = process.env.TOTALPASS_PARTNER_API_KEY;
  const base = process.env.TOTALPASS_API_BASE ?? API_BASE_PADRAO;
  if (!partnerKey) return { token: null, erro: 'TOTALPASS_PARTNER_API_KEY ausente' };

  let res: Response;
  try {
    res = await fetch(`${base}/partner/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_api_key: partnerKey, place_api_key: placeKey }),
    });
  } catch (e: any) {
    return { token: null, erro: `falha de rede no auth: ${e?.message ?? e}` };
  }
  const texto = await res.text();
  let corpo: any = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  if (!res.ok) return { token: null, erro: `auth HTTP ${res.status}: ${texto?.slice(0, 200)}` };

  const token: string | null =
    corpo?.token ?? corpo?.access_token ?? corpo?.jwt ?? corpo?.data?.token ?? null;
  if (!token) return { token: null, erro: `auth sem token: ${texto?.slice(0, 200)}` };

  cacheTokens.set(placeKey, { token, expira: Date.now() + VALIDADE_MS });
  return { token, erro: null };
}

// ── Fetch autenticado (por place) com timeout ────────────────────────────────
async function tpFetch(
  placeKey: string,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown
): Promise<TPResult> {
  const { token, erro } = await tokenDoPlace(placeKey);
  if (!token) {
    console.error('[totalpass/booking] sem token:', erro);
    return { ok: false, status: 0, body: null, erro: erro ?? 'sem token' };
  }
  const base = process.env.TOTALPASS_API_BASE ?? API_BASE_PADRAO;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    const msg = e?.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : `falha de rede: ${e?.message ?? e}`;
    console.error(`[totalpass/booking] ${method} ${path} → ${msg}`);
    return { ok: false, status: 0, body: null, erro: msg };
  }
  clearTimeout(timer);

  const texto = await res.text();
  let corpo: any = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  if (!res.ok) console.error(`[totalpass/booking] ${method} ${path} → HTTP ${res.status}`, corpo);
  return { ok: res.ok, status: res.status, body: corpo, erro: res.ok ? undefined : `HTTP ${res.status}` };
}

// ── Ocorrência: cria uma aula avulsa (data + hora + capacidade) ───────────────
// POST /partner/event-occurrence → 201 { eventId, eventOccurrenceUuid, slots, ... }
// startTime "HH:MM AM/PM"; eventDate "YYYY-MM-DD". planId do place.
export type NovaOcorrencia = {
  title: string;
  responsible: string;
  duration: number; // minutos
  slots: number; // capacidade exposta à TotalPass
  planId: number;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // "HH:MM AM/PM"
  timezone?: string; // default 'pt-BR'
  description?: string;
  externalReference?: string; // usamos pra guardar o ocorrencia_id do Club
  maxTimeToCancel?: string; // "YYYY-MM-DD HH:MM AM/PM"
  bookingWindow?: { minTimeToBook: string; maxTimeToBook: string };
};

export function criarOcorrencia(placeKey: string, dados: NovaOcorrencia): Promise<TPResult> {
  return tpFetch(placeKey, '/partner/event-occurrence', 'POST', {
    timezone: 'pt-BR',
    status: 'ACTIVE',
    ...dados,
  });
}

// ── Ocorrência: atualiza dados, INCLUINDO `slots` (capacidade) ────────────────
export function atualizarOcorrencia(
  placeKey: string,
  occurrenceUuid: string,
  dados: Partial<Pick<NovaOcorrencia, 'title' | 'responsible' | 'duration' | 'slots' | 'description' | 'externalReference' | 'bookingWindow'>>
): Promise<TPResult> {
  return tpFetch(placeKey, `/partner/event-occurrence/${occurrenceUuid}`, 'PUT', dados);
}

// ── Ocorrência: deleta (tira da grade) ────────────────────────────────────────
export function deletarOcorrencia(placeKey: string, occurrenceUuid: string): Promise<TPResult> {
  return tpFetch(placeKey, `/partner/event-occurrence/${occurrenceUuid}`, 'DELETE');
}

// ── Eventos: lista o que existe no place (diagnóstico) ────────────────────────
export function listarEventos(placeKey: string): Promise<TPResult> {
  return tpFetch(placeKey, '/partner/events', 'GET');
}

// ── GET genérico autenticado (diagnóstico: descobrir planos etc.) ─────────────
export function tpGet(placeKey: string, path: string): Promise<TPResult> {
  return tpFetch(placeKey, path, 'GET');
}

// ── Slots (reservas): polling. Janela máx. 30 dias. ──────────────────────────
export function listarSlots(placeKey: string, params?: {
  eventOccurrenceUuid?: string;
  userId?: string;
  slotDateFrom?: string; // ISO
  slotDateTo?: string; // ISO
}): Promise<TPResult> {
  const qs = new URLSearchParams();
  if (params?.eventOccurrenceUuid) qs.set('eventOccurrenceUuid', params.eventOccurrenceUuid);
  if (params?.userId) qs.set('userId', params.userId);
  if (params?.slotDateFrom) qs.set('slotDateFrom', params.slotDateFrom);
  if (params?.slotDateTo) qs.set('slotDateTo', params.slotDateTo);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return tpFetch(placeKey, `/partner/slot${suffix}`, 'GET');
}

// ── Slot: cancela uma reserva ativa. DELETE /partner/slot/{slotId} ────────────
export function cancelarSlot(placeKey: string, slotId: string): Promise<TPResult> {
  return tpFetch(placeKey, `/partner/slot/${slotId}`, 'DELETE');
}
