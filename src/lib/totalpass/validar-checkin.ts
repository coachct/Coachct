// src/lib/totalpass/validar-checkin.ts
//
// Pós-recebimento do check-in TotalPass (rodado via waitUntil, logo após o
// 200 "1" do receiver). Para CADA check-in novo:
//   1. Confirma de volta na TotalPass (POST no payload.endpoint) — é o "aceite"
//      do check-in do lado deles. Best-effort: loga e não derruba o resto.
//   2. Marca a entrada como 'validado' (o CHECK_IN_CREATED já é um check-in
//      válido feito pelo app dentro do raio; receber = válido) e grava o valor
//      por check-in do plano.
//
// Diferente do Wellhub, o payload da TotalPass NÃO traz a descrição do produto,
// só o plan_code. Então o casamento do valor é por produto_id = plan_code. No
// 1o check-in do teste a gente descobre os plan_codes reais e mapeia em
// valores_checkin (UPDATE produto_id). Até lá, valor fica null e a entrada é
// marcada 'validado' mesmo assim (a falta de valor é sinalizada por log).

import { createClient, SupabaseClient } from '@supabase/supabase-js';

type ValidarInput = {
  entradaId: string; // id da linha em entradas_walkin
  planCode: string | null; // check_in.plan_code
  startedAt: string | null; // check_in.started_at
  endpoint: string | null; // payload.endpoint (URL de confirmação)
  cpf: string | null; // user.document_number (pra log/rastreio)
};

export async function validarCheckinTotalpass(input: ValidarInput): Promise<void> {
  const { entradaId, planCode, startedAt, endpoint, cpf } = input;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[totalpass/validar] env do Supabase ausente');
    return;
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Confirma de volta na TotalPass (aceite do check-in). Best-effort.
  if (endpoint) {
    await confirmarNaTotalpass(endpoint, cpf);
  } else {
    console.warn('[totalpass/validar] payload sem endpoint de confirmacao');
  }

  // 2. Valor + nome legível do plano (por produto_id = plan_code).
  const { valor, descricao } = await buscarProduto(supabase, planCode);

  // 3. Marca validado. O check-in já é válido por definição (CHECK_IN_CREATED).
  //    Grava o nome legível no 'produto' (pras telas) quando conhecido; se não,
  //    mantém o plan_code que já está lá.
  const patch: Record<string, unknown> = {
    status: 'validado',
    validado_em: startedAt ?? new Date().toISOString(),
    valor,
  };
  if (descricao) patch.produto = descricao;

  const { error } = await supabase
    .from('entradas_walkin')
    .update(patch)
    .eq('id', entradaId);
  if (error) console.error('[totalpass/validar] erro ao gravar validado:', error);
}

// POST de confirmação no endpoint que veio no payload. A URL já carrega um
// token no path; mandamos o JWT no header por garantia (a doc diz que o JWT
// vai em toda chamada). Sucesso esperado: 200 com corpo "1".
async function confirmarNaTotalpass(endpoint: string, cpf: string | null): Promise<void> {
  // Import tardio pra não acoplar o auth no caminho do receiver.
  const { getTotalpassToken } = await import('./auth');
  const { token } = await getTotalpassToken();

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(endpoint, { method: 'POST', headers });
    const corpo = (await res.text())?.slice(0, 200);

    if (!res.ok || corpo?.trim() !== '1') {
      console.warn(
        `[totalpass/validar] confirmacao nao OK (cpf=${cpf}, status=${res.status}): ${corpo}`
      );
    }
  } catch (e: any) {
    console.error(`[totalpass/validar] falha ao confirmar (cpf=${cpf}):`, e?.message ?? e);
  }
}

// Valor + nome legível do plano TotalPass. Casa por produto_id = plan_code.
// O payload do TotalPass NÃO traz o nome do plano (só o code), então o nome
// legível pra exibir nas telas vem daqui (valores_checkin.descricao).
// Sem match, retorna nulos e loga (plan_code novo a mapear em valores_checkin).
async function buscarProduto(
  supabase: SupabaseClient,
  planCode: string | null
): Promise<{ valor: number | null; descricao: string | null }> {
  if (planCode) {
    const { data } = await supabase
      .from('valores_checkin')
      .select('valor, descricao')
      .eq('origem', 'totalpass')
      .eq('produto_id', planCode)
      .eq('ativo', true)
      .maybeSingle();
    if (data) {
      return {
        valor: Number((data as any).valor),
        descricao: (data as any).descricao ?? null,
      };
    }
  }

  console.warn(
    `[totalpass/validar] plan_code sem valor cadastrado (plan_code=${planCode}) — mapear em valores_checkin`
  );
  return { valor: null, descricao: null };
}
