-- Fila de espera: só promove no cancelamento se ainda houver vaga real.
-- Aplicado em 05/11/2026 (migration fila_cancelamento_exige_vaga).
--
-- Bug: o gatilho chamava processar_fila_espera sem p_exigir_vaga, então
-- todo cancelamento repunha 1:1 da fila. Quando um coach era afastado
-- depois do horário lotar (ex.: Dai Marques 03/11), o horário ficava
-- acima da capacidade (7 clientes p/ 6 coaches) e a fila mantinha o excesso.
-- Agora a fila só promove se vagas_livres_ct > 0 (coaches - ocupados - bloqueadas).

CREATE OR REPLACE FUNCTION public.trigger_processar_fila_apos_cancelamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Só promove da fila se ainda houver vaga real (coaches - ocupados - bloqueadas).
  -- Evita repor 1:1 num horário que já está acima da capacidade (ex.: coach afastado depois de lotar).
  IF NEW.status = 'cancelado' AND (OLD.status IS NULL OR OLD.status != 'cancelado') THEN
    PERFORM processar_fila_espera(NEW.data, NEW.horario, NEW.unidade_id, true);
  END IF;
  RETURN NEW;
END;
$function$;
