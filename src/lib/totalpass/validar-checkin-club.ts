// src/lib/totalpass/validar-checkin-club.ts
//
// Validação de volta (repasse) do check-in TotalPass das unidades CLUB — espelho
// do que o CT já faz (confirmarNaTotalpass), mas ISOLADO e com as diferenças do
// Club:
//   - Autentica com a place_api_key da PRÓPRIA unidade Club (não a do CT).
//   - MANTÉM o status 'aula' (não vira 'validado' como o CT) — só carimba
//     validado_em + valor, igual ao padrão do Club do Wellhub. Assim as telas do
//     Club não quebram.
//
// À prova de falha: roda pós-200 (waitUntil) e engole erro — nunca afeta o
// check-in, a presença nem o fluxo do CT.

import { createClient } from '@supabase/supabase-js';
import { apiKeyPorPlace } from '@/lib/totalpass/places';

const AUTH_BASE = process.env.TOTALPASS_API_BASE ?? 'https://booking-api.totalpass.com';

type ValidarClubInput = {
  entradaId: string;           // linha em entradas_walkin
  endpoint: string | null;     // payload.endpoint (URL de confirmação/repasse)
  cpf: string | null;          // user.document_number (log)
  planCode: string | null;     // check_in.plan_code (valor/descrição)
  placeId: string | null;      // totalpass_place_id da unidade Club (41407/6242)
  startedAt: string | null;    // check_in.started_at (validado_em)
};

// JWT autenticado com a chave do PLACE Club (mesmo /partner/auth do booking).
async function jwtDoPlaceClub(placeId: string): Promise<string | null> {
  const placeKey = apiKeyPorPlace(placeId);
  const partnerKey = process.env.TOTALPASS_PARTNER_API_KEY;
  if (!placeKey || !partnerKey) return null;
  try {
    const r = await fetch(`${AUTH_BASE}/partner/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_api_key: partnerKey, place_api_key: placeKey }),
    });
    if (!r.ok) return null;
    const b: any = await r.json().catch(() => null);
    return b?.token ?? b?.access_token ?? b?.jwt ?? b?.data?.token ?? null;
  } catch {
    return null;
  }
}

export async function validarCheckinClubTotalpass(input: ValidarClubInput): Promise<void> {
  const { entradaId, endpoint, cpf, planCode, placeId, startedAt } = input;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[totalpass/club-validar] env do Supabase ausente');
    return;
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Confirma de volta na TotalPass (aceite do check-in = garante o repasse).
  //    Usa o JWT do PLACE Club. Best-effort: loga e não derruba o resto.
  if (endpoint) {
    try {
      const jwt = placeId ? await jwtDoPlaceClub(placeId) : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
      const res = await fetch(endpoint, { method: 'POST', headers });
      const corpo = (await res.text())?.slice(0, 200);
      if (!res.ok || corpo?.trim() !== '1') {
        console.warn(`[totalpass/club-validar] confirmacao nao OK (cpf=${cpf}, status=${res.status}): ${corpo}`);
      } else {
        console.log(`[totalpass/club-validar] confirmado (cpf=${cpf})`);
      }
    } catch (e: any) {
      console.error(`[totalpass/club-validar] falha ao confirmar (cpf=${cpf}):`, e?.message ?? e);
    }
  } else {
    console.warn('[totalpass/club-validar] payload sem endpoint de confirmacao');
  }

  // 2. Valor + nome legível (se o plan_code já estiver mapeado em valores_checkin).
  //    MANTÉM status 'aula' — só carimba validado_em + valor.
  let valor: number | null = null;
  let descricao: string | null = null;
  if (planCode) {
    const { data } = await supabase
      .from('valores_checkin')
      .select('valor, descricao')
      .eq('origem', 'totalpass')
      .eq('produto_id', planCode)
      .eq('ativo', true)
      .maybeSingle();
    if (data) {
      valor = Number((data as any).valor);
      descricao = (data as any).descricao ?? null;
    } else {
      console.warn(`[totalpass/club-validar] plan_code sem valor cadastrado (${planCode}) — mapear em valores_checkin`);
    }
  }

  const patch: Record<string, unknown> = {
    validado_em: startedAt ?? new Date().toISOString(),
    valor,
  };
  if (descricao) patch.produto = descricao;

  const { error } = await supabase.from('entradas_walkin').update(patch).eq('id', entradaId);
  if (error) console.error('[totalpass/club-validar] erro ao carimbar validado_em:', error);
}
