// src/lib/coach-ct/presenca-checkin.ts
//
// Reação da agenda Coach CT ao check-in do parceiro (Wellhub / TotalPass):
//   - modo 'personal' (Coach CT): marca presença no agendamento de hoje.
//   - modo 'walkin'   (musculação livre): NÃO marca presença; só sinaliza que a
//                     pessoa TEM treino Coach CT hoje mas bateu o check-in no
//                     modo errado, pra a recepção corrigir.
//
// Isolado e à prova de falha: roda pós-200 (waitUntil) nos webhooks e engole
// qualquer erro — nunca afeta o check-in, a validação nem a cobrança do parceiro.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ModoCheckin = 'personal' | 'walkin';

// Detecta se o check-in foi no modo Personal (Coach CT) e não musculação livre.
// Regra única pros dois parceiros: a descrição/plano contém "personal".
//   Wellhub   -> "Personal Trainer"
//   TotalPass -> "Musculação com Personal" (nome resolvido de valores_checkin)
// Musculação livre ("Musculação", "Musculação Livre", "Horário Restrito") não bate.
export function ehModoPersonal(...textos: (string | null | undefined)[]): boolean {
  return /personal/i.test(textos.filter(Boolean).join(' '));
}

// Casa o cliente pelo check-in e, no agendamento Coach CT de hoje (Just CT):
//   personal -> marca presença (igual ao clique da recepção) + carimbo de origem
//   walkin   -> sinaliza "modo errado" pra recepção
// Se não casar cliente/agendamento pendente, não faz nada.
export async function registrarCheckinCoachCt(
  supabase: SupabaseClient,
  origem: 'wellhub' | 'totalpass',
  modo: ModoCheckin,
  ident: { cpf?: string | null; wellhubId?: string | null; email?: string | null; nome?: string | null }
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('coach_ct_presenca_por_checkin', {
      p_origem: origem,
      p_modo: modo,
      p_cpf: ident.cpf ?? null,
      p_wellhub_id: ident.wellhubId ?? null,
      p_email: ident.email ?? null,
      p_nome: ident.nome ?? null,
    });
    if (error) console.error(`[coach-ct/checkin] ${modo} falhou:`, error);
    else if (data) console.log(`[coach-ct/checkin] ${modo} no agendamento:`, data);
  } catch (e) {
    console.error(`[coach-ct/checkin] ${modo} excecao:`, e);
  }
}
