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
import { hojeSP } from '@/lib/tempo'

export const CAMPANHA_BF = 'black_friday_2026'
export const BF_VENDA_FIM = '2026-11-30'

/** Campanha no ar hoje (horário SP)? Some sozinha depois de 30/11. */
export const bfNoAr = (hoje: string = hojeSP()) => hoje <= BF_VENDA_FIM

/**
 * Regra dos bots (WhatsApp e Instagram) sobre preços durante a campanha.
 * Vazia fora da janela, então não precisa tirar à mão no dia 01/12.
 */
export function avisoBlackNovemberBot(): string {
  if (!bfNoAr()) return ''
  return `

# BLACK NOVEMBER — campanha no ar (REGRA de preços, vale acima das outras)
Quando perguntarem de valores, preços, planos ou pacotes (mesmo de forma geral), AVISE que estamos com a BLACK NOVEMBER e deixe claros os DOIS pontos:
1) TREINOS EM DOBRO nos pacotes: pague 5 e ganhe 5 FREE (R$ 295, válido por 60 dias) · pague 10 e ganhe 10 FREE (R$ 549, 90 dias) · pague 40 e ganhe 40 FREE (R$ 1.796, 360 dias);
2) consequentemente, 50% OFF POR TREINO.
Mande o link https://www.justclubct.com.br/comprar. Os pacotes normais de 5/10/40 NÃO estão à venda durante a campanha — ofereça só os da Black November. Os pacotes valem na musculação livre do Just CT e nas aulas do JustClub (NÃO são Coach CT/personal). NÃO informe data de término e NÃO crie urgência ("últimos dias", "corre", "acaba logo") — só a oferta.`
}

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
