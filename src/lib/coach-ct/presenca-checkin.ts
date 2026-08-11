// src/lib/coach-ct/presenca-checkin.ts
//
// Presença automática no agendamento Coach CT a partir do check-in do parceiro
// (Wellhub / TotalPass), SOMENTE quando o cliente bateu o check-in no modo
// PERSONAL (Coach CT) e não musculação livre.
//
// Isolado e à prova de falha: roda pós-200 (waitUntil) nos webhooks e engole
// qualquer erro — nunca afeta o check-in, a validação nem a cobrança do parceiro.

import type { SupabaseClient } from '@supabase/supabase-js';

// Detecta se o check-in foi no modo Personal (Coach CT). Regra única pros dois
// parceiros: a descrição/plano do produto contém "personal".
//   Wellhub   -> "Personal Trainer"
//   TotalPass -> "Musculação com Personal"
// Musculação livre ("Musculação", "Musculação Livre", "Horário Restrito") não bate.
export function ehModoPersonal(...textos: (string | null | undefined)[]): boolean {
  return /personal/i.test(textos.filter(Boolean).join(' '));
}

// Marca presença no agendamento Coach CT de hoje (unidade Just CT) casando o
// cliente pelo check-in. Idêntico ao clique de "Presença" da recepção + carimbo
// de origem (presenca_checkin). Se não casar cliente/agendamento, não faz nada.
export async function marcarPresencaCoachCt(
  supabase: SupabaseClient,
  origem: 'wellhub' | 'totalpass',
  ident: { cpf?: string | null; wellhubId?: string | null; email?: string | null; nome?: string | null }
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('coach_ct_presenca_por_checkin', {
      p_origem: origem,
      p_cpf: ident.cpf ?? null,
      p_wellhub_id: ident.wellhubId ?? null,
      p_email: ident.email ?? null,
      p_nome: ident.nome ?? null,
    });
    if (error) console.error('[coach-ct/checkin] presenca falhou:', error);
    else if (data) console.log('[coach-ct/checkin] presenca marcada no agendamento:', data);
  } catch (e) {
    console.error('[coach-ct/checkin] presenca excecao:', e);
  }
}
