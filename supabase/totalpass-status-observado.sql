-- totalpass-status-observado.sql
-- Amplia a trava de status de entradas_walkin pra aceitar 'observado' — o
-- status que o receiver TotalPass usa no modo observação (kill switch OFF):
-- grava o check-in real SEM confirmar nem cobrar, só pra inspeção.
-- Aditivo e seguro: só amplia o CHECK, não altera nenhuma linha existente.

ALTER TABLE public.entradas_walkin
  DROP CONSTRAINT IF EXISTS entradas_walkin_status_check;

ALTER TABLE public.entradas_walkin
  ADD CONSTRAINT entradas_walkin_status_check
  CHECK (status = ANY (ARRAY['recebido'::text, 'validado'::text, 'erro'::text, 'observado'::text]));
