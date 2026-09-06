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
// TEXTO PROVISÓRIO: o canvas aprovado não veio no repositório. Os títulos e as
// frases citados no brief estão literais; os parágrafos e as descrições dos
// passos foram escritos a partir das regras de negócio. Substituir por copiar
// e colar do canvas quando ele estiver à mão — este arquivo é o único lugar.

export const IDEIA_TITULO =
  'O VERÃO NÃO COMEÇA NO VERÃO. COMEÇA NO DIA EM QUE VOCÊ LIGA O MODO.'

export const IDEIA_TEXTO =
  'Setembro não parece verão. Mas é setembro que decide como dezembro vai ser. ' +
  'São cem dias: tempo de sobra pra fazer diferença e pouco o bastante pra não dar ' +
  'pra deixar pra depois. O Summer Mode é isso — um pacote de treinos, uma data pra ' +
  'zerar e um bônus se você chegar lá. Acredite: você não vai se arrepender de ter ' +
  'começado agora.'

export const BONUS_TITULO = 'USOU TUDO ATÉ 31/12? A JUST PAGA A PRÓXIMA RODADA.'

export const BONUS_PASSOS = [
  {
    num: '01',
    titulo: 'LIGA O MODO',
    texto: 'Escolha o pacote de 15 ou o de 30 e feche a compra. Os créditos entram na hora, todos de uma vez.',
  },
  {
    num: '02',
    titulo: 'TREINA ATÉ 31/12',
    texto: 'Use os treinos em qualquer JustClub e na musculação livre do Just CT, no ritmo que couber na sua rotina.',
  },
  {
    num: '03',
    titulo: 'GANHA +3 OU +5',
    texto: 'Zerou o pacote até 31/12? Em 02/01/2027 a gente credita o bônus, válido até 31/03/2027.',
  },
]

export const REGRAS_TITULO = 'COMBINADO NÃO SAI CARO.'

export const REGRAS = [
  'Vale nas unidades JustClub e na musculação livre do Just CT. Não vale para Coach CT (personal) nem para o Coach CT Pro.',
  'Só o titular usa. Uma reserva por treino — o pacote não reserva acompanhante.',
  'Os créditos valem até 31 de março de 2027. O que sobrar depois dessa data expira.',
  'Zerou os treinos até 31 de dezembro de 2026? Ganha +3 no pacote de 15 ou +5 no pacote de 30.',
  'O bônus entra na conta em 02 de janeiro de 2027 e também vale até 31 de março de 2027.',
  'Falta não conta pro bônus. Só entra na conta o treino em que você apareceu.',
  'Um pacote de cada por CPF, dentro da janela de 08 a 30 de setembro de 2026.',
  'Pagamento único, em até 3x no cartão. Os créditos entram na hora, todos de uma vez.',
]

export const RODAPE_REGRAS =
  'Só o titular usa · uma reserva por treino · falta não conta pro bônus · não vale para Coach CT personal · um de cada por CPF'

export const ERRO_LIMITE_POR_CLIENTE =
  'Você já tem este pacote. O Summer Mode é um de cada por pessoa.'
