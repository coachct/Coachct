// --- Campanha BLACK FRIDAY 2026 (09/11 a 30/11/2026) ------------------------
// Decisão do Ricardo (08–09/11): pacotes de 5, 10 e 40 treinos com o DOBRO de
// créditos pelo MESMO preço e a MESMA validade. Comunicação em dois impactos:
// "X TREINOS + X FREE" e "50% OFF por treino".
//
// No banco são produtos normais (credito_treino / pacote / unidade_id NULL)
// com campanha = 'black_friday_2026' e venda_fim = 2026-11-30. O
// creditos_por_venda já é o TOTAL (10 / 20 / 80): a entrega de créditos e o
// pagamento não mudam. O "pague X + X FREE" é só como a tela mostra.
//
// venda_fim controla a vitrine E a compra: depois de 30/11 a API recusa
// (src/app/api/pagamento/criar). A data NÃO aparece na comunicação.
export const CAMPANHA_BF = 'black_friday_2026'

export const ehBlackFriday = (p: any) => p?.campanha === CAMPANHA_BF

/** Treinos pagos = metade do total (o resto é o FREE). */
export const treinosPagos = (p: any) => Math.round((Number(p?.creditos_por_venda) || 0) / 2)

// Preço por treino do pacote normal equivalente (tabela praticada antes da
// campanha). É a referência do "50% OFF": 295/5, 549/10, 1796/40.
const PRECO_REF_POR_TREINO: Record<number, number> = { 5: 59, 10: 54.9, 40: 44.9 }

export function precoRefPorTreino(p: any): number | null {
  return PRECO_REF_POR_TREINO[treinosPagos(p)] ?? null
}

// ── Textos ──────────────────────────────────────────────────────────────────
export const BF_TAG       = '// black november'
export const BF_TITULO    = 'BLACK NOVEMBER'
export const BF_SUB       = 'Treinos em dobro: 50% OFF por treino.'
export const BF_SELO      = '50% OFF por treino'
export const BF_FREE      = 'FREE'

export const bfDestaque = (p: any) => {
  const n = treinosPagos(p)
  return `${n} TREINOS + ${n} ${BF_FREE}`
}

export const bfApoio = (p: any, valorFmt: string) =>
  `Pague ${valorFmt} e treine ${Number(p.creditos_por_venda)} vezes · válido por ${p.dias_validade} dias. Just CT (musculação livre) + JustClubs.`

export const bfResumoCheckout = (p: any) => {
  const n = treinosPagos(p)
  return `${n} treinos + ${n} ${BF_FREE} · ${p.creditos_por_venda} créditos válidos por ${p.dias_validade} dias a partir da compra · Todas as unidades`
}
