// src/lib/wellhub/booking-api.ts
//
// Cliente HTTP da Booking API do Wellhub (SAÍDA — chamadas que NÓS fazemos).
// Shapes confirmados na doc oficial: https://developers.wellhub.com/product/booking-api/1.0/endpoints
//
// Credenciais PRÓPRIAS do Booking (WELLHUB_BOOKING_API_BASE / _KEY), isoladas do
// Access Control (check-in) que roda em produção — o teste no sandbox não encosta
// no check-in. Default = sandbox.

const SANDBOX_BASE = 'https://apitesting.partners.gympass.com';

const SPEC = {
  paths: {
    classes:    (gym: string) => `/booking/v1/gyms/${gym}/classes`,
    class:      (gym: string, cls: string) => `/booking/v1/gyms/${gym}/classes/${cls}`,
    slots:      (gym: string, cls: string) => `/booking/v1/gyms/${gym}/classes/${cls}/slots`,
    slot:       (gym: string, cls: string, slot: string) => `/booking/v1/gyms/${gym}/classes/${cls}/slots/${slot}`,
    booking:    (gym: string, bk: string) => `/booking/v2/gyms/${gym}/bookings/${bk}`,
    categories: (gym: string) => `/booking/v1/gyms/${gym}/categories`,
    products:   (gym: string) => `/setup/v1/gyms/${gym}/products`,
  },
  // Status aceitos pelo PATCH de booking (doc). RESERVED = confirma, REJECTED = rejeita.
  bookingStatus: {
    confirmar: 'RESERVED',
    rejeitar:  'REJECTED',
  },
} as const;

export type WellhubResult = { ok: boolean; status: number; body: any; erro?: string };

const TIMEOUT_MS = 5000;

function apiBase(): string {
  return process.env.WELLHUB_BOOKING_API_BASE ?? SANDBOX_BASE;
}

async function wellhubFetch(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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
        Accept: 'application/json',
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

// ── Booking: confirmar (RESERVED) ou rejeitar (REJECTED) uma reserva ─────────
// PATCH /booking/v2/gyms/:gym/bookings/:booking_number   (janela de 15 min!)
export function patchBookingStatus(
  gymId: string,
  bookingNumber: string,
  status: 'confirmar' | 'rejeitar',
  reasonCategory: string = 'SPOT_NOT_AVAILABLE'
): Promise<WellhubResult> {
  const body: any = { status: SPEC.bookingStatus[status] };
  if (status === 'rejeitar') {
    body.reason_category = reasonCategory; // obrigatório quando REJECTED
    body.reason = 'Sem vaga disponível';
  }
  return wellhubFetch(SPEC.paths.booking(gymId, bookingNumber), 'PATCH', body);
}

// ── Slot: empurra os números absolutos do pool (PATCH capacity) ──────────────
// PATCH .../slots/:slot   body: { total_capacity, total_booked }   → 204
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

// ── Classe: cria a modalidade no catálogo do Wellhub ─────────────────────────
// POST /booking/v1/gyms/:gym/classes   body: { classes: [{ ... }] }
// product_id é OBRIGATÓRIO (vem de getProducts). categories é opcional.
export function createClass(
  gymId: string,
  data: { name: string; description: string; product_id: number; categories?: number[] }
): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.classes(gymId), 'POST', {
    classes: [
      {
        name: data.name,
        description: data.description,
        bookable: true,
        visible: true,
        product_id: data.product_id,
        ...(data.categories?.length ? { categories: data.categories } : {}),
      },
    ],
  });
}

// ── Slot: cria um horário específico daquela classe ──────────────────────────
// POST .../classes/:class/slots   → 201 { results: [{ id, ... }] }
export function createSlot(
  gymId: string,
  classId: string,
  data: {
    occur_date: string;
    length_in_minutes: number;
    total_capacity: number;
    total_booked: number;
    product_id: number;
  }
): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.slots(gymId, classId), 'POST', {
    occur_date: data.occur_date,
    length_in_minutes: data.length_in_minutes,
    total_capacity: data.total_capacity,
    total_booked: data.total_booked,
    product_id: data.product_id,
  });
}

// ── Kill switch: PUT da classe com visible=false/true ────────────────────────
// ⚠️ O PUT exige o objeto COMPLETO da classe (name, description, bookable,
// visible, product_id). Ajustar no kill switch pra reenviar os dados atuais.
export function setClassVisibility(
  gymId: string,
  classId: string,
  visible: boolean
): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.class(gymId, classId), 'PUT', { visible });
}

// ── Setup ────────────────────────────────────────────────────────────────────
// GET /setup/v1/gyms/:gym/products  → { products: [{ product_id, name, ... }] }
export function getProducts(gymId: string): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.products(gymId), 'GET');
}

// GET /booking/v1/gyms/:gym/categories?locale=pt  → { results: [{ id, name }] }
export function getCategories(gymId: string, locale: string = 'pt'): Promise<WellhubResult> {
  return wellhubFetch(`${SPEC.paths.categories(gymId)}?locale=${locale}`, 'GET');
}

// GET das classes já existentes — usado pra diagnóstico e pro kill switch.
export function listClasses(gymId: string): Promise<WellhubResult> {
  return wellhubFetch(SPEC.paths.classes(gymId), 'GET');
}
