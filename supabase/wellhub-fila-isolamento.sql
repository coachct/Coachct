-- wellhub-fila-isolamento.sql
-- Blindagem: cancelamento de reserva via app do Wellhub NÃO promove a nossa
-- fila de espera. A fila só é promovida em cancelamentos dos NOSSOS clientes
-- (via_app = false). Assim o fluxo do Wellhub nunca mexe nas reservas normais.
--
-- Único acréscimo à função original: a condição `AND COALESCE(NEW.via_app,false)
-- = false`. O comportamento para os clientes normais fica IDÊNTICO ao de hoje.

CREATE OR REPLACE FUNCTION public.trigger_processar_fila_apos_cancelamento_club()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status != 'cancelado'
     AND NEW.status = 'cancelado'
     AND COALESCE(NEW.via_app, false) = false THEN
    PERFORM processar_fila_espera_club(NEW.ocorrencia_id);
  END IF;
  RETURN NEW;
END;
$function$;
