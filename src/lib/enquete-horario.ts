import { hojeSP } from '@/lib/tempo'

// --- Enquete de horário da noite (JustClub Vila Olímpia) ---------------------
// Caixinha na confirmação de reserva das aulas de 18:30 e 19:30. Vale nos DOIS
// caminhos de reserva do site: /aulas (Lift, Lift for Girls) e /mapa (Running,
// que sai do /aulas direto pro mapa de posições).
// Cada cliente responde uma única vez por horário (unique enquete+cliente no banco).
// Responder é obrigatório pra confirmar a reserva (decisão do Ricardo: senão a
// pesquisa não fecha). Sem opção neutra de propósito: ou a pessoa quer antecipar,
// ou prefere manter — 'tanto faz' não ajuda na decisão.
// O voto é gravado DEPOIS que a reserva já entrou, fire-and-forget: se a gravação
// falhar, a reserva vale do mesmo jeito (e a pergunta volta na próxima reserva).
// Para encerrar antes do prazo, é só mudar ENQUETE_HORARIO_ATE para uma data passada.
export const ENQUETE_HORARIO_UNIDADE = '05eeab3e-5eae-4140-bc3a-1c1d56ac95be' // JustClub Vila Olímpia
export const ENQUETE_HORARIO_ATE     = '2026-09-19' // último dia em que a caixinha aparece

export type EnqueteHorario = {
  chave: string
  pergunta: string
  opcoes: { valor: string; label: string }[]
}

export const ENQUETE_HORARIO: Record<string, EnqueteHorario> = {
  '18:30': {
    chave: 'horario_noite_vo_1830',
    pergunta: 'Esta aula das 18:30 seria melhor em outro horário?',
    opcoes: [
      { valor: '18:00',  label: 'Sim, às 18:00' },
      { valor: '18:15',  label: 'Sim, às 18:15' },
      { valor: 'manter', label: 'Prefiro manter às 18:30' },
    ],
  },
  '19:30': {
    chave: 'horario_noite_vo_1930',
    pergunta: 'Esta aula das 19:30 seria melhor em outro horário?',
    opcoes: [
      { valor: '19:00',  label: 'Sim, às 19:00' },
      { valor: '19:15',  label: 'Sim, às 19:15' },
      { valor: 'manter', label: 'Prefiro manter às 19:30' },
    ],
  },
}

export function enqueteDoHorario(unidadeId: string, horario: string): EnqueteHorario | null {
  if (unidadeId !== ENQUETE_HORARIO_UNIDADE) return null
  if (hojeSP() > ENQUETE_HORARIO_ATE) return null
  return ENQUETE_HORARIO[(horario || '').slice(0, 5)] || null
}
