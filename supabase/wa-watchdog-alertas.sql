-- Controle de cooldown do vigia do WhatsApp (/api/whatsapp/watchdog): guarda quando
-- um alerta de "inbound parado" foi enviado, pra não mandar e-mail repetido a cada
-- checagem. Aplicado em produção 2026-08-14 (migration wa_watchdog_alertas).
CREATE TABLE IF NOT EXISTS public.wa_watchdog_alertas (
  id bigint generated always as identity primary key,
  alertado_em timestamptz NOT NULL DEFAULT now(),
  minutos_sem_inbound integer
);
