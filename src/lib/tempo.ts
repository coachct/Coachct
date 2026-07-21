// Hora oficial da operação = America/Sao_Paulo.
//
// As telas de reserva comparavam o horário da aula com o relógio DO DISPOSITIVO.
// Cliente em outro fuso (caso real: time da ClassPass fora do Brasil) via a aula
// sumir da lista e levava "Esta aula já começou" horas antes do início real —
// navegador em UTC+2 marca 19:30 quando em SP ainda são 14:30.
//
// Tudo que decidir "já passou" / "é hoje" nas telas de cliente deve passar por aqui.
// Todas as funções são fail-safe: se o Intl não resolver o fuso, caem no
// comportamento antigo (relógio do dispositivo) em vez de travar a reserva.

const TZ = 'America/Sao_Paulo'

/** Data ('YYYY-MM-DD') e hora ('HH:MM') atuais em São Paulo. null se o fuso não resolver. */
export function partesSP(base: Date = new Date()): { data: string; hora: string } | null {
  try {
    const p: Record<string, string> = {}
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(base).forEach(x => { p[x.type] = x.value })
    if (!p.year || !p.month || !p.day || !p.hour || !p.minute) return null
    return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
  } catch { return null }
}

function dataLocalStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/** Hoje em São Paulo, 'YYYY-MM-DD'. */
export function hojeSP(): string {
  return partesSP()?.data ?? dataLocalStr(new Date())
}

/** Hora atual em São Paulo, 'HH:MM'. */
export function horaAgoraSP(): string {
  const p = partesSP()
  if (p) return p.hora
  const d = new Date()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

/** Date do dia de hoje em SP, fixado ao meio-dia local (evita virada por DST ao somar dias). */
export function dataHojeSP(): Date {
  const p = partesSP()
  if (!p) return new Date()
  const [y, m, d] = p.data.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

/**
 * A aula (data 'YYYY-MM-DD' + horário 'HH:MM[:SS]') já começou no horário de SP?
 * Sem data ou horário → false (não bloqueia), mesmo fail-safe da trava original.
 */
export function aulaJaComecou(data?: string | null, horario?: string | null): boolean {
  if (!data || !horario) return false
  const agora = partesSP()
  if (!agora) {
    const inicio = new Date(`${data}T${horario}`)
    return !isNaN(inicio.getTime()) && inicio.getTime() <= Date.now()
  }
  const d = String(data).slice(0, 10)
  if (d !== agora.data) return d < agora.data
  return String(horario).slice(0, 5) <= agora.hora
}
