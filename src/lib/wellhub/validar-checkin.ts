// src/lib/wellhub/validar-checkin.ts
//
// Etapa 1 — validação automática do check-in Wellhub.
//
// Chamada pelo webhook (via waitUntil, logo após o 200) para CADA check-in
// novo. Pergunta ao Wellhub se o ticket é válido (validarTicket), e grava o
// resultado na entrada já criada em entradas_walkin:
//   - válido  -> status='validado', validado_em, valor (buscado por produto)
//   - já validado (uso único) -> trata como validado, sem duplicar
//   - falha   -> status='erro'
//
// Esta função NÃO mexe no Face ID / liberação de acesso (Etapa 2): ela só
// produz o 'validado' + 'valor' que aquela etapa vai ler depois.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validarTicket } from './validate';

type ValidarCheckinInput = {
  entradaId: string; // id da linha em entradas_walkin
  gympassId: string; // unique_token do usuário
  produtoId: string | null; // event_data.gym.product.id (como string)
  produtoDescricao: string | null; // event_data.gym.product.description
};

// Retry curto só pro caso "check-in ainda não propagou" (404 not found).
// Em produção provavelmente nem é preciso; cobre a janela de poucos segundos
// que vimos no sandbox. Mantido curto pra não estourar o tempo da função.
const MAX_TENTATIVAS = 4;
const ESPERA_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function validarCheckin(input: ValidarCheckinInput): Promise<void> {
  const { entradaId, gympassId, produtoId, produtoDescricao } = input;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[wellhub/validar] env do Supabase ausente');
    return;
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Valida no Wellhub, com retry curto enquanto for "not found" (404).
  let resultado = await validarTicket(gympassId);
  let tentativa = 1;
  while (!resultado.valido && resultado.status === 404 && tentativa < MAX_TENTATIVAS) {
    await sleep(ESPERA_MS);
    tentativa++;
    resultado = await validarTicket(gympassId);
  }

  // 2. "Check-In already validated" (400): validate é uso único. Se já foi
  //    validado, consideramos contado — marca validado sem duplicar.
  const jaValidado =
    !resultado.valido &&
    resultado.status === 400 &&
    typeof resultado.raw === 'object' &&
    resultado.raw !== null &&
    (resultado.raw as any)?.errors?.[0]?.key === 'checkin.already.validated';

  // 3. Sucesso (validado agora ou já validado antes).
  if (resultado.valido || jaValidado) {
    const valor = await buscarValor(supabase, produtoId, produtoDescricao);
    const { error } = await supabase
      .from('entradas_walkin')
      .update({
        status: 'validado',
        validado_em: resultado.validatedAt ?? new Date().toISOString(),
        valor,
      })
      .eq('id', entradaId);
    if (error) console.error('[wellhub/validar] erro ao gravar validado:', error);
    return;
  }

  // 4. Falha definitiva -> marca 'erro' pra investigação.
  const { error } = await supabase
    .from('entradas_walkin')
    .update({ status: 'erro' })
    .eq('id', entradaId);
  if (error) console.error('[wellhub/validar] erro ao gravar erro:', error);
  console.warn(
    `[wellhub/validar] check-in nao validado (gympassId=${gympassId}, status=${resultado.status}): ${resultado.erro}`
  );
}

// Preenche SÓ o valor de uma entrada já validada — busca local no cadastro,
// sem chamar a Gympass (não depende da janela de revalidação nem mexe no status).
// Usado pra corrigir entradas validadas que ficaram sem valor.
export async function corrigirValor(input: {
  entradaId: string;
  produtoId: string | null;
  produtoDescricao: string | null;
}): Promise<{ ok: boolean; valor: number | null }> {
  const { entradaId, produtoId, produtoDescricao } = input;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[wellhub/corrigir] env do Supabase ausente');
    return { ok: false, valor: null };
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const valor = await buscarValor(supabase, produtoId, produtoDescricao);
  if (valor == null) return { ok: false, valor: null };

  const { error } = await supabase.from('entradas_walkin').update({ valor }).eq('id', entradaId);
  if (error) {
    console.error('[wellhub/corrigir] erro ao gravar valor:', error);
    return { ok: false, valor: null };
  }
  return { ok: true, valor };
}

// Busca o valor por check-in do produto. Tenta por produto_id; se não achar,
// cai pra descrição (e, casando por descrição, faz o backfill do produto_id no
// cadastro — assim o sistema "aprende" o id no 1o check-in real). Sem match,
// retorna null e loga (produto novo a cadastrar).
async function buscarValor(
  supabase: SupabaseClient,
  produtoId: string | null,
  descricao: string | null
): Promise<number | null> {
  if (produtoId) {
    const { data } = await supabase
      .from('valores_checkin')
      .select('valor')
      .eq('origem', 'wellhub')
      .eq('produto_id', produtoId)
      .eq('ativo', true)
      .maybeSingle();
    if (data) return Number((data as any).valor);
  }

  if (descricao) {
    const { data } = await supabase
      .from('valores_checkin')
      .select('id, valor, produto_id')
      .eq('origem', 'wellhub')
      .ilike('descricao', descricao)
      .eq('ativo', true)
      .maybeSingle();
    if (data) {
      const row = data as any;
      if (produtoId && !row.produto_id) {
        await supabase
          .from('valores_checkin')
          .update({ produto_id: produtoId, atualizado_em: new Date().toISOString() })
          .eq('id', row.id);
      }
      return Number(row.valor);
    }
  }

  console.warn(
    `[wellhub/validar] produto sem valor cadastrado (produto_id=${produtoId}, descricao=${descricao})`
  );
  return null;
}
