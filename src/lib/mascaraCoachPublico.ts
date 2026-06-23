// TEMPORÁRIO — máscara de exibição de coach SOMENTE em telas públicas (site do aluno).
// Dai Marques e Kauany Lima aparecem como "Juliana" apenas no calendário Club do cliente.
// NÃO usar em admin/recepção/relatórios/pagamentos — lá os nomes reais devem permanecer.
// Para desativar: remover os imports/chamadas em aulas/page.tsx e mapa/page.tsx (e apagar este arquivo).
const COACHES_MASCARADOS = new Set<string>([
  '49ea2e48-7650-4278-a7d4-1cddd02e8ade', // Dai Marques
  '38faf696-2fa8-436a-9033-222515f81f6b', // Kauany Lima
])
const NOME_MASCARA = 'Juliana'
/**
 * Nome do coach para exibição pública (site do aluno).
 * - Se o coach estiver na lista mascarada: retorna "Juliana".
 * - Caso contrário: retorna o primeiro nome (mesmo comportamento atual das telas).
 * - Sem nome: retorna '' (deixa o fallback '—'/'Coach a definir' agir no chamador).
 */
export function nomeCoachPublico(
  coachId?: string | null,
  nomeCompleto?: string | null
): string {
  if (coachId && COACHES_MASCARADOS.has(coachId)) return NOME_MASCARA
  if (!nomeCompleto) return ''
  return String(nomeCompleto).split(' ')[0]
}
