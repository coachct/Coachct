-- wellhub-checkin-status-aula.sql
-- Amplia a trava de status de entradas_walkin pra aceitar 'aula'.
--
-- 'aula' = check-in vindo de uma unidade de AULAS (Club: Pinheiros/VO). Esse
-- check-in NÃO passa pela validação/cobrança de musculação (não é do CT); ele
-- só serve pra marcar presença na reserva feita pelo app. Assim ele para de
-- virar 'erro' e some do painel de Check-ins do CT.
--
-- Aditivo e seguro: só amplia o CHECK, não altera nenhuma linha existente.
-- Um único comando (bloco DO) — roda tudo de uma vez.

DO $$
BEGIN
  ALTER TABLE public.entradas_walkin
    DROP CONSTRAINT IF EXISTS entradas_walkin_status_check;
  ALTER TABLE public.entradas_walkin
    ADD CONSTRAINT entradas_walkin_status_check
    CHECK (status = ANY (ARRAY['recebido'::text, 'validado'::text, 'erro'::text, 'observado'::text, 'aula'::text]));
END $$;
