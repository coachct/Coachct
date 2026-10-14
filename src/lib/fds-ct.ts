// ─────────────────────────────────────────────────────────────────────────────
// Grade do Coach CT no fim de semana e feriado (escala_fds)
//
// A partir de 17/10/2026:
//  • Sábado: dois turnos. Turno 1 (entrada 08h, saída 12h) atende 08, 09, 10 e 11.
//    Turno 2 (entrada 11h, saída 15h) atende 11, 12, 13 e 14. Às 11h os dois
//    turnos somam. Coach sem turno (escala_fds.turno nulo) não abre vaga.
//  • Domingo e feriado (qualquer dia da semana): turno único, 09h às 14h,
//    atende 09, 10, 11, 12 e 13. O turno é ignorado.
// Antes de 17/10/2026 vale a grade antiga: 08:00–12:00 para todos.
//
// Espelho em SQL: public.ct_fds_horarios_coach (supabase/ct-fds-turnos.sql).
// Mexeu aqui, mexe lá.
// ─────────────────────────────────────────────────────────────────────────────

export const FDS_GRADE_NOVA_DESDE = '2026-10-17'

export type TurnoFds = 1 | 2

const GRADE_ANTIGA = ['08:00', '09:00', '10:00', '11:00', '12:00']
const SABADO_TURNO_1 = ['08:00', '09:00', '10:00', '11:00']
const SABADO_TURNO_2 = ['11:00', '12:00', '13:00', '14:00']
const DOMINGO_FERIADO = ['09:00', '10:00', '11:00', '12:00', '13:00']

export const TURNOS_SABADO: { turno: TurnoFds; rotulo: string; horario: string }[] = [
  { turno: 1, rotulo: 'Turno 1', horario: '08h às 12h' },
  { turno: 2, rotulo: 'Turno 2', horario: '11h às 15h' },
]

function diaSemana(dataStr: string): number {
  return new Date(dataStr + 'T12:00:00').getDay()
}

// O dia exige turno por coach? Só sábado (que não seja feriado) na grade nova.
export function fdsUsaTurno(dataStr: string, ehFeriado: boolean): boolean {
  return dataStr >= FDS_GRADE_NOVA_DESDE && !ehFeriado && diaSemana(dataStr) === 6
}

// Horários que UM coach escalado atende nesse dia.
export function horariosFdsCoach(dataStr: string, ehFeriado: boolean, turno: number | null | undefined): string[] {
  if (dataStr < FDS_GRADE_NOVA_DESDE) return GRADE_ANTIGA
  if (!fdsUsaTurno(dataStr, ehFeriado)) return DOMINGO_FERIADO
  if (turno === 1) return SABADO_TURNO_1
  if (turno === 2) return SABADO_TURNO_2
  return []
}

// Todos os horários possíveis da grade nesse dia (independe de quem está escalado).
export function horariosFdsDia(dataStr: string, ehFeriado: boolean): string[] {
  if (dataStr < FDS_GRADE_NOVA_DESDE) return GRADE_ANTIGA
  if (!fdsUsaTurno(dataStr, ehFeriado)) return DOMINGO_FERIADO
  return Array.from(new Set([...SABADO_TURNO_1, ...SABADO_TURNO_2])).sort()
}

// A linha da escala atende esse horário?
export function coachFdsAtende(dataStr: string, ehFeriado: boolean, turno: number | null | undefined, hora: string): boolean {
  return horariosFdsCoach(dataStr, ehFeriado, turno).includes(hora.slice(0, 5))
}

// Quantos coaches escalados atendem cada horário do dia.
export function coachesFdsPorHora(
  dataStr: string,
  ehFeriado: boolean,
  escala: { turno?: number | null }[],
): Record<string, number> {
  const porHora: Record<string, number> = {}
  for (const e of escala) {
    for (const hora of horariosFdsCoach(dataStr, ehFeriado, e.turno)) porHora[hora] = (porHora[hora] || 0) + 1
  }
  return porHora
}

// Horas pagas ao professor pelo dia escalado = jornada de entrada a saída, que é
// igual ao nº de horários que ele atende: sábado com turno 4h (08–12 ou 11–15),
// domingo/feriado 5h (09–14), grade antiga 5h (08–13). Sábado sem turno = 0h.
export function horasFdsCoach(dataStr: string, ehFeriado: boolean, turno: number | null | undefined): number {
  return horariosFdsCoach(dataStr, ehFeriado, turno).length
}

// Texto curto do turno para as telas da equipe ("Turno 1 · 08h às 12h").
export function rotuloTurnoFds(turno: number | null | undefined): string {
  const t = TURNOS_SABADO.find(x => x.turno === turno)
  return t ? `${t.rotulo} · ${t.horario}` : 'Sem turno'
}
