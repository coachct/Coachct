import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Grade extra por período (coach_horarios_extra)
//
// A grade normal (coach_horarios) é semanal e recorrente. A grade extra tem
// data_inicio/data_fim: escala o coach em horários adicionais só dentro daquele
// período (ex.: cobertura, reforço).
//
// REGRA FORTE — não pode quebrar o fluxo de reserva:
//  • ADITIVO: a extra só ACRESCENTA coach/horário na disponibilidade. Nunca
//    remove nem reduz a grade base.
//  • À PROVA DE FALHA: qualquer erro/exception → retorna [] → o chamador fica
//    exatamente com o comportamento de hoje (só a grade base).
//  • KILL SWITCH: enquanto NEXT_PUBLIC_GRADE_EXTRA_ATIVO !== 'true', retorna []
//    e a consulta nem roda. Dark launch: liga só depois de testar como cliente.
//  • Feriado/FDS NÃO usam grade extra (seguem escala_fds). Por isso o chamador
//    só deve usar isto no ramo de DIA ÚTIL.
// ─────────────────────────────────────────────────────────────────────────────

export const GRADE_EXTRA_ATIVO = process.env.NEXT_PUBLIC_GRADE_EXTRA_ATIVO === 'true'

export type SlotExtra = { coach_id: string; hora: string; nome: string }

// Retorna os slots de grade extra vigentes numa data (dia útil), para uma
// unidade. `hora` opcional restringe a um horário específico. hora normalizada
// para 'HH:MM' (igual à grade base nos chamadores). Traz o nome do coach para
// os chamadores que montam o seletor (agenda admin/recepção).
export async function gradeExtraDoDia(
  supabase: SupabaseClient,
  params: { unidadeId: string; dataStr: string; diaSemana: number; hora?: string }
): Promise<SlotExtra[]> {
  if (!GRADE_EXTRA_ATIVO) return []
  try {
    let q = supabase.from('coach_horarios_extra')
      .select('coach_id, hora, coaches(id, nome, ativo)')
      .eq('unidade_id', params.unidadeId)
      .eq('dia_semana', params.diaSemana)
      .lte('data_inicio', params.dataStr)
      .gte('data_fim', params.dataStr)
    if (params.hora) q = q.eq('hora', params.hora)
    const { data, error } = await q
    if (error) return []
    return (data || [])
      // Coach precisa existir e estar ativo — nunca escala um coach inativo.
      .filter((r: any) => r.coach_id && r.coaches?.ativo !== false)
      .map((r: any) => ({ coach_id: r.coach_id, hora: (r.hora || '').slice(0, 5), nome: r.coaches?.nome || '' }))
  } catch {
    return []
  }
}
