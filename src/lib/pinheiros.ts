// JustClub Pinheiros encerra em 28/11/2026 às 13:00 (horário de São Paulo).
// A partir daí o site e os bots mostram só Just CT e JustClub Vila Olímpia.
// No banco, o job pg_cron 'pinheiros-encerra-2811' desativa a unidade, as aulas,
// os planos de app e a publicação no Wellhub/TotalPass na mesma hora.

export const PINHEIROS_ID = '166a683d-5fe6-4177-8fd6-53deb70b428e'
export const PINHEIROS_FIM = Date.parse('2026-11-28T13:00:00-03:00')

/** Pinheiros ainda aparece no site? (some sozinho às 13h de 28/11, sem deploy) */
export const pinheirosNoSite = (agora: number = Date.now()) => agora < PINHEIROS_FIM

/** Regra dos bots depois do encerramento. Vazia antes, então não precisa tirar à mão. */
export function avisoPinheirosEncerradaBot(): string {
  if (pinheirosNoSite()) return ''
  return `

# JUSTCLUB PINHEIROS NÃO OPERA MAIS (REGRA, vale acima das outras)
Desde 28/11/2026 a JustClub Pinheiros não tem mais aulas. As unidades em funcionamento são só a JUST CT (Itaim Bibi) e a JUSTCLUB VILA OLÍMPIA (Av. Dr. Cardoso de Melo, 1337). Ignore qualquer menção a Pinheiros nas regras acima: NÃO ofereça horários, grade, reservas, endereço nem planos de Pinheiros. Se perguntarem de Pinheiros, diga que as aulas da JustClub agora acontecem na Vila Olímpia e mande a grade: https://www.justclubct.com.br/aulas?unidade=05eeab3e-5eae-4140-bc3a-1c1d56ac95be`
}
