import { hojeSP } from '@/lib/tempo'

// --- Campanha SUMMER MODE: ON (08/09 a 30/09/2026) --------------------------
// Os dois pacotes são produtos normais (tipo credito_treino, subtipo pacote,
// unidade_id NULL). O que os torna "campanha" são as colunas novas de produtos:
// campanha, venda_inicio, venda_fim, validade_fixa, limite_por_cliente,
// bonus_creditos e bonus_data_corte.
//
// Quem controla a exibição é a DATA, não o deploy: fora da janela o banner some
// da home, a seção some do /comprar e a landing continua no ar (links antigos)
// só que em modo encerrado.
export const CAMPANHA_SUMMER = 'summer_mode'

/** O produto está dentro da janela de venda? Sem janela definida = sempre. */
export function dentroDaJanela(p: any, hoje: string = hojeSP()): boolean {
  if (!p) return false
  if (p.venda_inicio && hoje < String(p.venda_inicio).slice(0, 10)) return false
  if (p.venda_fim && hoje > String(p.venda_fim).slice(0, 10)) return false
  return true
}

/** 'YYYY-MM-DD' -> 'DD/MM/AAAA'. Vazio se não vier data. */
export function dataBR(iso?: string | null): string {
  if (!iso) return ''
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-')
  if (!ano || !mes || !dia) return ''
  return `${dia}/${mes}/${ano}`
}

/** 'YYYY-MM-DD' -> 'DD.MM' (usado nas tags mono do banner/landing). */
export function dataCurta(iso?: string | null): string {
  if (!iso) return ''
  const [, mes, dia] = String(iso).slice(0, 10).split('-')
  if (!mes || !dia) return ''
  return `${dia}.${mes}`
}

/** R$ sem centavos quando são zerados: 599 -> "R$ 599", 33.3 -> "R$ 33,30". */
export function reais(v: number): string {
  const inteiro = Math.round(v * 100) % 100 === 0
  return `R$ ${v.toLocaleString('pt-BR', {
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

// ── Textos da campanha ──────────────────────────────────────────────────────
// Copiados do canvas aprovado "Summer Mode: ON" (Ricardo, 06/09/2026).
// Qualquer ajuste de copy é aqui — as telas não têm texto solto.

// A arte anuncia a janela como 08.09 → 30.09, e é isso que a regra 1 diz.
// A venda abre tecnicamente às 21h do dia 07 (decisão do Ricardo, 06/09), ou
// seja, produtos.venda_inicio é 07/09. Por isso a data ANUNCIADA mora aqui e
// não sai de venda_inicio — senão as tags diriam 07.09 e brigariam com o
// regulamento. O fim continua saindo de venda_fim, que é a verdade do banco.
export const JANELA_LABEL_INICIO = '2026-09-08'
export const JANELA_LABEL_FIM    = '2026-09-30'

// Banner da home
export const BANNER_TAG_PREFIXO = '// dia do cliente'
export const BANNER_TITULO      = 'SUMMER MODE:'
export const BANNER_DAYS        = '100 DAYS TO GO'
export const BANNER_PRECO_2     = 'PRA DAR INÍCIO AO SEU PROJETO VERÃO.'
export const BANNER_CTA         = 'SABER MAIS →'

// Cabeçalho da seção em /comprar
export const COMPRAR_TITULO = '100 DAYS TO GO'
export const COMPRAR_SUB    = 'Pacotes de 15 e 30 treinos pro seu projeto verão.'

// Hero da landing
export const LANDING_TAG_PREFIXO = '// 100 dias pro verão'
export const LANDING_SUB_ON      = 'PACOTES DE 15 E 30 TREINOS'
export const LANDING_TEXTO_ON =
  'Treinos a partir de R$ 33,30 pra dar início ao seu projeto verão. ' +
  'Clubs e musculação livre do CT, até 31/03/2027.'
export const LANDING_TEXTO_OFF =
  'Desligado tudo bem, sem julgamento. Mas o verão vem de qualquer jeito. ' +
  'Toca no botão e a gente conversa.'

// // a ideia  (o ponto final do título sai em rosa)
export const IDEIA_TITULO =
  'O VERÃO NÃO COMEÇA NO VERÃO. COMEÇA NO DIA EM QUE VOCÊ LIGA O MODO'
export const IDEIA_TEXTO =
  'Setembro é o mês em que as desculpas acabam. Faltam 100 dias, e 100 dias é tempo ' +
  'de sobra pra treinar 15 ou 30 vezes, do jeito que couber na sua rotina. ' +
  'Acredite: você não vai se arrepender de ter começado agora.'

// // os pacotes  (o "ON." sai em rosa)
export const PACOTES_TITULO = 'DOIS PACOTES. UMA DECISÃO: SUMMER '

// // o bônus
export const BONUS_TITULO = 'USOU TUDO ATÉ 31/12? A JUST PAGA A PRÓXIMA RODADA.'
export const BONUS_SUB =
  'Não é sorteio, não é cupom. Quem usa o pacote inteiro dentro dos 100 dias ganha ' +
  'treinos extras pra começar o ano. Quanto antes ligar, mais folga tem.'

export const BONUS_PASSOS = [
  {
    num: '01',
    titulo: 'LIGA O MODO',
    texto: 'Compra o de 15 ou o de 30 até 30/09. Os créditos caem na hora e valem até 31/03/2027.',
  },
  {
    num: '02',
    titulo: 'TREINA ATÉ 31/12',
    texto: 'Usa todos os créditos até o último dia do ano, no ritmo que quiser. Falta não conta.',
  },
  {
    num: '03',
    titulo: 'GANHA +3 OU +5',
    texto: 'No dia 02/01 os treinos bônus entram na sua conta, válidos até 31/03. Janeiro começa com saldo.',
  },
]

// #regras — cada item é "forte" (início em negrito) + o resto da frase
export const REGRAS_TAG    = '// as regras, sem letra miúda'
export const REGRAS_TITULO = 'COMBINADO NÃO SAI CARO.'

export const REGRAS: { forte: string; resto: string }[] = [
  { forte: 'Venda de 08/09 a 30/09/2026.',
    resto: 'Depois disso o modo desliga e volta só no ano que vem.' },
  { forte: 'Vale em qualquer JustClub e na musculação livre do Just CT.',
    resto: 'Não vale para Coach CT (personal) nem Coach CT Pro.' },
  { forte: 'Validade até 31/03/2027,',
    resto: 'pacote e bônus, independente da data da compra.' },
  { forte: 'Um pacote de cada por CPF.',
    resto: 'Pode levar o 15 e o 30; não pode levar dois iguais.' },
  { forte: 'Só o titular usa.',
    resto: 'Uma reserva por treino, no seu nome. Não reserva vaga de acompanhante.' },
  { forte: 'Falta não conta pro bônus.',
    resto: 'Só treino com presença registrada. Cancelou no prazo, o crédito volta.' },
  { forte: 'Bônus creditado em 02/01/2027',
    resto: 'pra quem zerou o pacote até 31/12, válido até 31/03/2027.' },
  { forte: 'Pagamento único, em até 3x no cartão.',
    resto: 'Os créditos entram na hora, todos de uma vez.' },
]

export const RODAPE_REGRAS =
  'Só o titular usa · uma reserva por treino · falta não conta pro bônus · não vale para Coach CT personal · um de cada por CPF'

export const ERRO_LIMITE_POR_CLIENTE =
  'Você já tem este pacote. O Summer Mode é um de cada por pessoa.'
