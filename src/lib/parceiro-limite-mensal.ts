// src/lib/parceiro-limite-mensal.ts
//
// Teto mensal (12 treinos/mês) nas reservas que chegam pelo APP do Wellhub/
// TotalPass. Até 14/09/2026 a gente confiava que o próprio parceiro barrava quem
// estourou — não barra (caso Gabriela, VO: 17 treinos em agosto, 16 pelo app).
//
// Regra do Ricardo: bateu reserva de TotalPass ou Wellhub, CONTA — tenha o
// cliente plano cadastrado aqui ou não (muito cadastro de app é shell sem plano,
// ou tem o plano do outro parceiro). Por isso a contagem é direta nas reservas,
// e não pelo pote do saldo_creditos_cliente (que só existe com plano ativo).
//
// Conta: reservas do cliente na unidade da aula, no mês da aula, com tipo_credito
// do parceiro (site/recepção `<parceiro>_<slug>` + app `<parceiro>_app`), fora
// cancelado e falta (falta de parceiro não consome — mesma regra do saldo).
// Teto: o total do pote do parceiro quando existir; senão 12.
//
// Erro na consulta → NÃO bloqueia (a trava nunca pode derrubar a entrada de reserva).

import { SupabaseClient } from '@supabase/supabase-js'

const TETO_PADRAO = 12

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
    const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`
    const fimMes = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10)

    // Poucas linhas (um cliente num mês) — a unidade é filtrada aqui, sem filtro
    // aninhado de 2 níveis no PostgREST.
    const { data: reservas, error } = await supabase
      .from('club_reservas')
      .select('id, club_ocorrencias!inner(data, club_aulas(unidade_id))')
      .eq('cliente_id', clienteId)
      .like('tipo_credito', `${parceiro}_%`)
      .not('status', 'in', '(cancelado,falta)')
      .gte('club_ocorrencias.data', inicioMes)
      .lte('club_ocorrencias.data', fimMes)
    if (error || !reservas) {
      console.warn('[parceiro-limite-mensal] falha ao contar reservas — liberando:', error?.message)
      return { bloquear: false }
    }
    const count = reservas.filter((r: any) => r?.club_ocorrencias?.club_aulas?.unidade_id === unidadeId).length

    // Teto: o do plano cadastrado (se houver pote do parceiro na unidade), senão 12.
    let teto = TETO_PADRAO
    const { data: saldo } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: clienteId, p_mes: mes, p_ano: ano, p_unidade_id: unidadeId,
    })
    const pote: any = saldo && Object.values(saldo as Record<string, any>)
      .find((p: any) => p?.tipo_plano === parceiro && p?.unidade_id === unidadeId)
    if (pote?.total > 0) teto = pote.total

    if (count < teto) return { bloquear: false }
    return { bloquear: true, motivo: `sem-saldo-mes (${count}/${teto})` }
  } catch (e: any) {
    console.warn('[parceiro-limite-mensal] falha ao conferir saldo — liberando:', e?.message ?? e)
    return { bloquear: false }
  }
}
