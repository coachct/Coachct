// Leitura das cargas registradas em registros_carga.
//
// O banco aceita uma linha por (aula_id, exercicio_id) — constraint
// registros_carga_aula_exercicio_unique. O valor de cada série fica em
// observacoes, no formato "Séries: 40/45/50" ("-" para série em branco).
//
// Registros antigos, gravados uma linha por série ("Série 2"), continuam
// sendo lidos aqui para o histórico não perder o que já existe.

export interface SerieRegistrada {
  serie: number
  carga: number
  reps: string
}

interface RegistroCarga {
  carga_kg: number | null
  reps_realizadas?: string | null
  observacoes?: string | null
}

export function seriesDoRegistro(r: RegistroCarga): SerieRegistrada[] {
  const reps = r.reps_realizadas || ''

  const resumo = (r.observacoes || '').match(/Séries:\s*(.+)/)
  if (resumo) {
    return resumo[1]
      .split('/')
      .map((valor, idx) => ({
        serie: idx + 1,
        carga: parseFloat(valor.trim()),
        reps,
      }))
      .filter(s => !isNaN(s.carga))
  }

  if (r.carga_kg === null || r.carga_kg === undefined) return []
  const antigo = (r.observacoes || '').match(/Série (\d+)/)
  return [{ serie: antigo ? parseInt(antigo[1]) : 1, carga: r.carga_kg, reps }]
}
