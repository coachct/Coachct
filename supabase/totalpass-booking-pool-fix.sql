-- totalpass-booking-pool-fix.sql
-- Corrige totalpass_slot_numbers pra descontar TAMBÉM as reservas via app do
-- outro parceiro (Wellhub), não só as do site. Assim o pool é de fato
-- compartilhado: capacidade − bloqueadas − reservas do site − reservas do outro
-- app, com teto por aula (vagas_totalpass / vagas_default). A TotalPass conta as
-- reservas dela (slotsInUse) do lado dela, por isso subtraímos só os OUTROS
-- canais — a conta fecha certinho.
-- Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION totalpass_slot_numbers(p_ocorrencia_id uuid)
RETURNS TABLE (total_capacity integer, total_booked integer)
LANGUAGE sql STABLE AS $$
  WITH oc AS (
    SELECT o.id, o.vagas_bloqueadas, o.vagas_totalpass, a.capacidade
    FROM club_ocorrencias o
    JOIN club_aulas a ON a.id = o.aula_id
    WHERE o.id = p_ocorrencia_id
  ),
  cfg AS (SELECT vagas_default FROM totalpass_booking_config WHERE id IS TRUE),
  r AS (
    SELECT
      count(*) FILTER (WHERE via_app = false) AS proprias,
      count(*) FILTER (WHERE via_app = true)  AS via_app,
      count(*) FILTER (WHERE via_app = true AND totalpass_slot_id IS NULL) AS outros_apps
    FROM club_reservas
    WHERE ocorrencia_id = p_ocorrencia_id AND status <> 'cancelado'
  )
  SELECT
    GREATEST(0, LEAST(
      COALESCE(oc.vagas_totalpass, cfg.vagas_default),
      oc.capacidade - COALESCE(oc.vagas_bloqueadas,0) - r.proprias - r.outros_apps
    ))::int AS total_capacity,
    r.via_app::int AS total_booked
  FROM oc, cfg, r;
$$;
