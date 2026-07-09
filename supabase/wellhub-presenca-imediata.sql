-- wellhub-presenca-imediata.sql
-- Marca presença NA HORA do check-in do Wellhub (unidades de aula / Club).
--
-- Chamada pelo receiver de check-in (waitUntil, ~1-2s após o check-in), pra não
-- depender do cron de 2 min (lento pra chegada rápida do cliente). O cron
-- wellhub_conciliar_presencas continua existindo só como rede de segurança.
--
-- Casa a reserva feita pelo APP (via_app = true) daquela pessoa, na aula de HOJE
-- naquela unidade, e marca 'presente'. Reserva feita no nosso site é via_app=false
-- → NÃO casa aqui → a recepção marca presença manual (comportamento desejado).
--
-- ISOLADA e à prova de falha:
--   * Só toca club_reservas com via_app=true e status='reservado' (dupla guarda
--     no UPDATE) — nunca encosta numa reserva normal de cliente.
--   * SECURITY DEFINER + search_path fixo. O receiver ainda engole qualquer erro
--     (roda pós-200), então isto jamais afeta o check-in.
--   * Casa a unidade pelo gym_id do Wellhub (p_gym_id), não por unidade gravada.

CREATE OR REPLACE FUNCTION wellhub_marcar_presenca_por_checkin(
  p_gympass_id text,
  p_gym_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_marcadas integer;
BEGIN
  WITH alvo AS (
    SELECT r.id
    FROM clientes c
    JOIN unidades u         ON u.wellhub_gym_id = p_gym_id
    JOIN club_reservas r    ON r.cliente_id = c.id AND r.via_app = true AND r.status = 'reservado'
    JOIN club_ocorrencias o ON o.id = r.ocorrencia_id
    JOIN club_aulas a       ON a.id = o.aula_id
    WHERE c.wellhub_id = p_gympass_id
      AND a.unidade_id = u.id
      AND o.data = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  )
  UPDATE club_reservas r SET status = 'presente'
  FROM alvo
  WHERE r.id = alvo.id AND r.status = 'reservado';   -- dupla guarda

  GET DIAGNOSTICS v_marcadas = ROW_COUNT;
  RETURN v_marcadas;
END $$;

-- Teste manual (troque pelos valores reais de um check-in que já chegou):
--   SELECT wellhub_marcar_presenca_por_checkin('3407715107736', '525930');
