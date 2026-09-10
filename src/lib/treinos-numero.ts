// src/lib/treinos-numero.ts
//
// Numeração dos treinos de um cliente DENTRO do mês, por pool de crédito
// (tipo_credito) — ex.: "3/10". Usado na ficha do cliente (admin) e na área do
// aluno (site) para deixar claro qual treino do mês é aquele.
//
// Regras:
//  - Conta só os treinos que CONSOMEM crédito (tudo menos 'cancelado').
//  - Agrupa por (ano-mês do treino, tipo_credito) — cada mês reinicia a contagem
//    e cada pool de crédito é numerado separadamente.
//  - Só emite o rótulo "X/N" quando há um teto mensal conhecido para aquele
//    (tipo_credito, mês): a função `totalDoMes` devolve N; se devolver null
//    (avulso/pacote, ou mês sem saldo carregado), o treino fica SEM rótulo.
//
// É pura e sem dependências — pode rodar em client component.

export type TreinoContavel = {
  id: string
  data: string // YYYY-MM-DD
  horario?: string | null // HH:MM(:SS)
  status: string
  tipo_credito?: string | null
}

/**
 * Retorna Map<id, "X/N"> só para os treinos que têm teto mensal conhecido.
 * `totalDoMes(tipoCredito, anoMes)` deve devolver o total de créditos daquele
 * pool naquele mês, ou null quando não houver teto (não numerar).
 */
export function numerarTreinosDoMes(
  itens: TreinoContavel[],
  totalDoMes: (tipoCredito: string, anoMes: string) => number | null,
): Map<string, string> {
  const consumidores = (itens || [])
    .filter((t) => t && t.id && t.data && t.tipo_credito && t.status !== 'cancelado')
    .slice()
    .sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1
      const ha = String(a.horario ?? '').slice(0, 5)
      const hb = String(b.horario ?? '').slice(0, 5)
      return ha < hb ? -1 : ha > hb ? 1 : 0
    })

  const contador = new Map<string, number>() // "anoMes|tipo" -> quantos já vistos
  const out = new Map<string, string>()
  for (const t of consumidores) {
    const anoMes = t.data.slice(0, 7)
    const tipo = String(t.tipo_credito)
    const chave = `${anoMes}|${tipo}`
    const n = (contador.get(chave) ?? 0) + 1
    contador.set(chave, n)
    const total = totalDoMes(tipo, anoMes)
    if (total && total > 0) out.set(t.id, `${n}/${total}`)
  }
  return out
}

/** Pools SEM teto mensal — nunca recebem "X/N". */
export const PLANOS_SEM_TETO = new Set(['avulso', 'pacote'])

/**
 * Chave do pool de crédito de uma reserva de Club, no mesmo formato das chaves
 * do saldo (`<tipo>_<slug da unidade>`, ex.: `totalpass_just_club_vila_olimpia`).
 *
 * Reserva feita pelo app do parceiro grava `<tipo>_app` (sem unidade), mas
 * consome o MESMO pote da unidade da aula — o RPC de saldo já soma os dois.
 * Aqui resolvemos `_app` para a chave da unidade, senão a contagem se quebraria
 * em dois grupos e o "X/N" sairia errado.
 */
export function poolReservaClub(
  tipoCredito: string | null | undefined,
  unidadeIdAula: string | null | undefined,
  saldo: Record<string, any> | null | undefined,
): string | null {
  const tipo = String(tipoCredito || '')
  if (!tipo) return null
  if (saldo && saldo[tipo]) return tipo
  if (tipo.endsWith('_app') && unidadeIdAula && saldo) {
    const prefixo = tipo.slice(0, -'_app'.length)
    for (const [chave, info] of Object.entries(saldo)) {
      const i = info as any
      if (i?.tipo_plano === prefixo && i?.unidade_id === unidadeIdAula) return chave
    }
  }
  return tipo
}
