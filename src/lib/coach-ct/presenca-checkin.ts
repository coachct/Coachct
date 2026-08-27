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
// Retorna o id do agendamento Coach CT de hoje da pessoa (ou null). Não-nulo =
// a pessoa TEM Coach CT agendado hoje (no personal marca presença; no walkin
// sinaliza modo errado). Usado também pra travar a validação no modo errado.
export async function registrarCheckinCoachCt(
  supabase: SupabaseClient,
  origem: 'wellhub' | 'totalpass',
  modo: ModoCheckin,
  ident: { cpf?: string | null; wellhubId?: string | null; email?: string | null; nome?: string | null }
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('coach_ct_presenca_por_checkin', {
      p_origem: origem,
      p_modo: modo,
      p_cpf: ident.cpf ?? null,
      p_wellhub_id: ident.wellhubId ?? null,
      p_email: ident.email ?? null,
      p_nome: ident.nome ?? null,
    });
    if (error) { console.error(`[coach-ct/checkin] ${modo} falhou:`, error); return null; }
    if (data) console.log(`[coach-ct/checkin] ${modo} no agendamento:`, data);
    return (data as string) ?? null;
  } catch (e) {
    console.error(`[coach-ct/checkin] ${modo} excecao:`, e);
    return null;
  }
}

// Marca a entrada como NÃO validada. Status 'observado' = fora do faturamento;
// erro_motivo deixa claro o porquê pra recepção/financeiro. NÃO confirma no
// parceiro. Motivo padrão: modo errado (Coach CT agendado + Musculação Livre);
// quem trava por outro motivo (ex.: horário restrito) passa o seu.
export async function marcarEntradaSemValidar(
  supabase: SupabaseClient,
  entradaId: string,
  descricao: string | null,
  motivo?: string
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: 'observado',
    erro_motivo:
      motivo ?? 'Coach CT agendado + check-in em Musculação Livre — não validado (modo errado)',
  };
  if (descricao) patch.produto = descricao;
  const { error } = await supabase.from('entradas_walkin').update(patch).eq('id', entradaId);
  if (error) console.error('[coach-ct/checkin] erro ao marcar entrada sem validar:', error);
}
