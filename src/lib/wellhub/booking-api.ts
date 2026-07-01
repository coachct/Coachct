// src/lib/wellhub/booking-api.ts
//
// Cliente HTTP da Booking API do Wellhub (SAÍDA — chamadas que NÓS fazemos).
//
// Reutiliza o MESMO token do Access Control (WELLHUB_API_KEY) — confirmado pelo
// contato Wellhub que ele serve também à Booking API. Alterna sandbox <-> prod
// por env (WELLHUB_API_BASE), igual ao validate.ts.
//
// Toda função devolve um resultado claro { ok, status, body } e NUNCA lança pra
// cima — quem chama decide o que fazer. Timeout curto pra não estourar o tempo
// das rotas/worker.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ ⚠️  PONTOS A CONFIRMAR NO 1º TESTE DE SANDBOX (capturados da doc, não de  │
// │     uma chamada real). Estão TODOS centralizados no bloco SPEC abaixo,    │
// │     então ajustar é trocar uma linha — sem caçar pelo arquivo.           │
// │       1. Versões/paths exatos de cada endpoint.                          │
// │       2. Nomes dos campos no body (createClass/createSlot/patch*).       │
// │       3. Valores literais do status de booking (confirmar/rejeitar).     │
// │       4. Se precisa header X-Gym-Id (validate usa) ou se o gym no path   │
// │          basta. Por ora NÃO mandamos (path já tem gym_id).               │
// │       5. Se POST/PATCH exigem assinatura HMAC de saída (validate não).   │
// └─────────────────────────────────────────────────────────────────────────┘

const SANDBOX_BASE = 'https://apitesting.partners.gympass.com';

// ── SPEC: tudo que é "idioma do Wellhub" e pode mudar no teste fica aqui ──────
const SPEC = {
  // Paths por recurso. {gym}/{class}/{slot}/{booking} são interpolados.
  paths: {
    classes:    (gym: string) => `/booking/v1/gyms/${gym}/classes`,
    class:      (gym: string, cls: string) => `/booking/v1/gyms/${gym}/classes/${cls}`,
    slots:      (gym: string, cls: string) => `/booking/v1/gyms/${gym}/classes/${cls}/slots`,
    slot:       (gym: string, cls: string, slot: string) => `/booking/v1/gyms/${gym}/classes/${cls}/slots/${slot}`,
    booking:    (gym: string, bk: string) => `/booking/v2/gyms/${gym}/bookings/${bk}`,
    categories: (gym: string) => `/booking/v1/gyms/${gym}/categories`,
    products:   (gym: string) => `/booking/v1/gyms/${gym}/products`,
  },
  // Valores literais que o Wellhub espera no PATCH de booking. ⚠️ confirmar caixa.
  bookingStatus: {
    confirmar: 'confirmed',
    rejeitar:  'rejected',
  },
} as const;

export type WellhubResult = { ok: boolean; status: number; body: any; erro?: string };

const TIMEOUT_MS = 5000;

// Credenciais PRÓPRIAS do Booking, isoladas do Access Control (check-in) que já
// roda em produção. Assim o teste de Booking no sandbox NÃO encosta no check-in
// atual. Default = sandbox, então nunca vai pra produção por acidente.
function apiBase(): string {
  return process.env.WELLHUB_BOOKING_API_BASE ?? SANDBOX_BASE;
}

// Núcleo: monta auth + timeout, lê o corpo uma vez, devolve resultado padronizado.
async function wellhubFetch(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  body?: unknown
): Promise<WellhubResult> {
  const apiKey = process.env.WELLHUB_BOOKING_API_KEY ?? process.env.WELLHUB_API_KEY;
  if (!apiKey) {
    console.error('[wellhub/booking] token ausente (WELLHUB_BOOKING_API_KEY / WELLHUB_API_KEY)');
    return { ok: false, status: 0, body: null, erro: 'token ausente' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    const erro = e?.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : `falha de rede: ${e?.message ?? e}`;
    console.error(`[wellhub/booking] ${method} ${path} → ${erro}`);
    return { ok: false, status: 0, body: null, erro };
  }
  clearTimeout(timer);

  const texto = await res.text();
  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }

  if (!res.ok) {
    console.error(`[wellhub/booking] ${method} ${path} → HTTP ${res.status}`, corpo);
  }
  return { ok: res.ok, status: res.status, body: corpo, erro: res.ok ? undefined : `HTTP ${res.status}` };
}

// ── Booking: confirmar ou rejeitar uma reserva vinda do app ──────────────────
// PATCH /booking/v2/gyms/:gym/bookings/:booking_number  (janela de 15 min!)
export function patchBookingStatus(
  gymId: string,
  bookingNumber: string,
  status: 'confirmar' | 'rejeitar'
): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.booking(gymId, bookingNumber), 'PATCH', {
    status: SPEC.bookingStatus[status],
  });
}

// ── Slot: empurra os números absolutos do pool (passo 3 do fluxo Wellhub) ─────
// PATCH .../classes/:class/slots/:slot   body: { total_capacity, total_booked }
export function patchSlotNumbers(
  gymId: string,
  classId: string,
  slotId: string,
  nums: { total_capacity: number; total_booked: number }
): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.slot(gymId, classId, slotId), 'PATCH', {
    total_capacity: nums.total_capacity,
    total_booked: nums.total_booked,
  });
}

// ── Classe: cria a modalidade no catálogo do Wellhub (1x por gym) ────────────
// POST /booking/v1/gyms/:gym/classes   body: { name, description, category_id }
export function createClass(
  gymId: string,
  data: { name: string; description: string; category_id: string }
): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.classes(gymId), 'POST', data);
}

// ── Slot: cria um horário específico daquela classe ──────────────────────────
// POST .../classes/:class/slots   body: { datetime, total_capacity }
export function createSlot(
  gymId: string,
  classId: string,
  data: { datetime: string; total_capacity: number }
): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.slots(gymId, classId), 'POST', data);
}

// ── Kill switch: o Wellhub não deleta classe, esconde por visibilidade ───────
// PUT da classe com visibility=false/true.  ⚠️ confirmar se é PUT parcial ou
// se exige o objeto completo da classe (como o customer do Pagar.me exige).
export function setClassVisibility(
  gymId: string,
  classId: string,
  visible: boolean
): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.class(gymId, classId), 'PUT', { visibility: visible });
}

// ── Setup: lê categorias/produtos do gym (pra montar createClass) ────────────
export function getCategories(gymId: string): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.categories(gymId), 'GET');
}

export function getProducts(gymId: string): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.products(gymId), 'GET');
}
