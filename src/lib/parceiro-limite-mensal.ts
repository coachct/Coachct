// src/lib/parceiro-limite-mensal.ts
//
// Teto mensal do plano do parceiro (ex.: 12 treinos/mês) nas reservas que chegam
// pelo APP do Wellhub/TotalPass. Até 14/09/2026 a gente confiava que o próprio
// parceiro barrava quem estourou — não barra (caso Gabriela, VO: 17 treinos em
// agosto, 16 reservados no app da TotalPass).
//
// Usa a MESMA conta do site: saldo_creditos_cliente do mês da aula, na unidade da
// aula (já soma site + recepção + app no mesmo pote; falta de parceiro não consome).
//
// FAIL-OPEN: sem pote do parceiro cadastrado na unidade (cadastro sem plano, mês
// fora do que a RPC gera) ou qualquer erro → NÃO bloqueia. A trava nunca pode
// derrubar reserva de quem não tem como ser contado.

import { SupabaseClient } from '@supabase/supabase-js'

export async function parceiroSemSaldoNoMes(
  supabase: SupabaseClient,
  parceiro: 'wellhub' | 'totalpass',
  clienteId: string,
  ocorrenciaId: string
): Promise<{ bloquear: boolean; motivo?: string }> {
  try {
    const { data: oc } = await supabase
      .from('club_ocorrencias')
      .select('data, club_aulas(unidade_id)')
      .eq('id', ocorrenciaId).maybeSingle()
    const dataAula = (oc as any)?.data as string | undefined
    const unidadeId = (oc as any)?.club_aulas?.unidade_id as string | undefined
    if (!dataAula || !unidadeId) return { bloquear: false }

    const [ano, mes] = dataAula.split('-').map(Number)
    const { data: saldo, error } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteId, p_mes: mes, p_ano: ano, p_unidade_id: unidadeId,
    })
    if (error || !saldo) return { bloquear: false }

    const pote: any = Object.values(saldo as Record<string, any>)
      .find((p: any) => p?.tipo_plano === parceiro && p?.unidade_id === unidadeId)
    if (!pote || pote.disponivel == null || pote.disponivel > 0) return { bloquear: false }

    return { bloquear: true, motivo: `sem-saldo-mes (${pote.usado}/${pote.total})` }
  } catch (e: any) {
    console.warn('[parceiro-limite-mensal] falha ao conferir saldo — liberando:', e?.message ?? e)
    return { bloquear: false }
  }
}
