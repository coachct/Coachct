// ─────────────────────────────────────────────────────────────────────────────
// Escala de FDS/feriado do CT que REALMENTE abre vaga num dia.
//
// escala_fds.coach_id guarda o USER_ID do coach, enquanto coach_ferias.coach_id
// guarda coaches.id. Comparar os dois direto nunca bate — por isso coach de férias
// (ou encerrado, que vira férias via trigger) continuava abrindo vaga na tela.
//
// Mesma regra do banco (public.vagas_livres_ct): só conta coach com cadastro
// ativo e fora de férias/ausência na data. Mexeu aqui, confere lá.
// ─────────────────────────────────────────────────────────────────────────────

export async function escalaFdsValida(
  sb: any,
  unidadeId: string,
  dataStr: string,
): Promise<{ coach_id: string; turno: number | null }[]> {
  const { data: escala } = await sb.from('escala_fds').select('coach_id, turno')
    .eq('unidade_id', unidadeId).eq('data', dataStr)
  const linhas = (escala || []) as { coach_id: string; turno: number | null }[]
  const userIds = Array.from(new Set(linhas.map((e) => e.coach_id).filter(Boolean)))
  if (userIds.length === 0) return []

  const { data: coaches } = await sb.from('coaches').select('id, user_id')
    .in('user_id', userIds).eq('ativo', true)
  const idPorUser: Record<string, string> = {}
  for (const c of (coaches || []) as any[]) idPorUser[c.user_id] = c.id
  const ids = Object.values(idPorUser)
  if (ids.length === 0) return []

  const { data: ferias } = await sb.from('coach_ferias').select('coach_id')
    .in('coach_id', ids).lte('data_inicio', dataStr).gte('data_fim', dataStr)
  const deFerias = new Set((ferias || []).map((f: any) => f.coach_id))

  return linhas.filter((e) => {
    const id = idPorUser[e.coach_id]
    return !!id && !deFerias.has(id)
  })
}
