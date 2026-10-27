-- Uma pendência ABERTA por falta (agendamento do CT ou reserva do Club).
-- Cada nova tentativa recusada criava outra pendência da mesma falta e o cadastro de
-- cartão cobrava todas (Andrea Mari pagou 2x R$ 99 em 21/10/2026).
-- Antes de criar o índice, as duplicadas abertas foram canceladas (mantida a mais antiga).

create unique index if not exists cobrancas_pendentes_uma_aberta_por_falta
  on public.cobrancas_pendentes (
    cliente_id,
    (substring(observacao from '(?:agendamento_id|reserva_id):\s*([a-f0-9-]{36})'))
  )
  where status = 'pendente'
    and observacao ~ '(agendamento_id|reserva_id):';
