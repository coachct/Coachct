// src/lib/wellhub/horario-restrito.ts
//
// Trava do plano "Musculação Horário Restrito" (Wellhub / CT).
//
// Esse plano do Wellhub é mais barato justamente porque só vale no horário de
// baixo movimento. Regra combinada com a operação:
//   - Segunda a sexta: valida das 09:00 às 16:59 (17:00 em diante NÃO valida).
//   - Sábado e domingo: valida normal, em qualquer horário (sem trava).
//
// Fora da janela o check-in NÃO é confirmado no Wellhub (não vira repasse) e a
// entrada fica 'observado' pra recepção/financeiro — mesmo tratamento que o
// "Coach CT agendado + modo livre". Se for exceção, a recepção revalida pelo
// /api/wellhub/revalidar.
//
// Só existe no Wellhub: no TotalPass a unidade CT tem apenas Musculação Livre e
// Musculação com Personal (ver supabase/totalpass-plan-codes.sql).

const FUSO = 'America/Sao_Paulo';
const DIAS_UTEIS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
const HORA_ABRE = 9; // 09:00 já vale
const HORA_FECHA = 17; // 17:00 já está fora (última entrada é 16:59)

// Produto do Wellhub que é o plano restrito. 914079 = "Musculação Horário
// Restrito" (R$ 32,00), confirmado em valores_checkin. Casar pelo id é mais
// firme que pelo nome (acento/caixa/renome do lado deles não quebram).
const PRODUTOS_RESTRITOS = new Set(['914079']);

// O produto é o do plano restrito? Casa pelo id; o nome que vem no payload
// (gym.product.description) fica como rede de segurança pra um id novo.
export function ehHorarioRestrito(
  produtoId: string | null | undefined,
  ...textos: (string | null | undefined)[]
): boolean {
  if (produtoId && PRODUTOS_RESTRITOS.has(String(produtoId))) return true;
  return /restrit/i.test(textos.filter(Boolean).join(' '));
}

// Momento do check-in a partir do event_data.timestamp (unix). Sem timestamp,
// cai pra agora — o webhook chega em segundos, então a diferença é irrelevante.
export function momentoDoCheckin(timestamp: number | null | undefined): Date {
  if (timestamp == null || !Number.isFinite(timestamp)) return new Date();
  // Aceita segundos (formato do Wellhub) ou milissegundos, por segurança.
  return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
}

// A hora tem que ser lida no fuso de São Paulo: a função roda em UTC na Vercel,
// então getHours() daria 3h de diferença e travaria o horário errado.
export function foraDaJanelaRestrita(quando: Date): boolean {
  if (Number.isNaN(quando.getTime())) return false; // data inválida: não trava

  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(quando);

  const dia = partes.find((p) => p.type === 'weekday')?.value ?? '';
  const hora = Number(partes.find((p) => p.type === 'hour')?.value);

  if (!DIAS_UTEIS.has(dia)) return false; // sábado/domingo: valida normal
  if (!Number.isFinite(hora)) return false; // na dúvida, não trava

  return hora < HORA_ABRE || hora >= HORA_FECHA;
}

// Kill switch: WELLHUB_TRAVA_HORARIO_RESTRITO=off desliga a trava sem deploy.
// Ausente = ligada.
export function travaHorarioRestritoAtiva(): boolean {
  const v = (process.env.WELLHUB_TRAVA_HORARIO_RESTRITO ?? '').trim().toLowerCase();
  return !['off', 'false', '0', 'nao', 'não'].includes(v);
}
