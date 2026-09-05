-- Running: a vaga oferecida ao parceiro passa a ser a vaga que EXISTE de verdade
--
-- Achado em 05/09/2026, na mesma investigação do sync instantâneo (Vila Olímpia,
-- 11:00): aula com 26 posições, 25 reservas e 1 posição bloqueada — ou seja,
-- LOTADA — e a gente ainda anunciava 1 vaga pra TotalPass. O cliente reservava
-- lá e levava cancelamento no pull seguinte.
--
-- POR QUÊ: o ramo Running contava "posições LIVRES" comparando o rótulo da
-- posição (R01, F03…) com o que as reservas ocupam. Reserva SEM posição — a que
-- a recepção cria pelo balcão, por exemplo — não ocupa rótulo nenhum, então a
-- posição dela seguia contando como livre. Cada reserva sem posição virava uma
-- vaga fantasma no app do parceiro. (Duas reservas na mesma posição dariam no
-- mesmo.) O bloqueio numérico `vagas_bloqueadas` também era ignorado no ramo
-- Running — só o bloqueio POR POSIÇÃO era respeitado.
--
-- COMO FICA: em vez de casar rótulo por rótulo, a conta vira aritmética simples:
--
--   posições utilizáveis = ativas, não bloqueadas (global) e não bloqueadas
--                          pontualmente naquela ocorrência
--   vaga real            = utilizáveis − TODAS as reservas ativas − vagas_bloqueadas
--   slots enviados       = reservas do parceiro + vaga real
--
-- ("slots" é capacidade absoluta na visão deles; eles descontam o slotsInUse
-- próprio, por isso somamos de volta as reservas do parceiro.)
--
-- Impacto conferido antes de aplicar: nas aulas de Running dos próximos 7 dias,
-- uma única ocorrência muda de número — justamente a VO 11:00 de 05/09, de 5
-- para 4, que com 4 já reservados pela TotalPass é o esgotado correto. Nenhuma
-- outra aula perde vaga.
--
-- O ramo Lift/LFG (ELSE) segue igual: capacidade − vagas_bloqueadas − reservas
-- dos outros canais. Lá não existe posição.
--
-- Funções STABLE de leitura: não escrevem nada.

CREATE OR REPLACE FUNCTION public.totalpass_slot_numbers(p_ocorrencia_id uuid)
 RETURNS TABLE(total_capacity integer, total_booked integer)
 LANGUAGE sql
 STABLE
AS $function$
  WITH oc AS (
    SELECT o.id, o.vagas_bloqueadas, o.vagas_totalpass, a.capacidade, a.tipo, a.unidade_id
    FROM club_ocorrencias o
    JOIN club_aulas a ON a.id = o.aula_id
    WHERE o.id = p_ocorrencia_id
  ),
  cfg AS (SELECT vagas_default FROM totalpass_booking_config WHERE id IS TRUE),
  res AS (
    SELECT posicao, totalpass_slot_id
    FROM club_reservas
    WHERE ocorrencia_id = p_ocorrencia_id AND status <> 'cancelado'
  ),
  cnt AS (
    SELECT
      count(*) FILTER (WHERE totalpass_slot_id IS NOT NULL) AS tp_ativas,
      count(*) FILTER (WHERE totalpass_slot_id IS NULL)     AS nao_tp,
      count(*)                                              AS ativas
    FROM res
  ),
  pos AS (
    SELECT count(*) AS utilizaveis
    FROM oc
    JOIN club_posicoes p ON p.unidade_id = oc.unidade_id AND p.ativo = true AND p.bloqueado = false
    WHERE (p.tipo || lpad(p.numero::text,2,'0')) NOT IN (
      SELECT posicao FROM club_posicoes_bloqueios_ocorrencia WHERE ocorrencia_id = p_ocorrencia_id
    )
  )
  SELECT
    GREATEST(0, LEAST(
      COALESCE(oc.vagas_totalpass, cfg.vagas_default),
      CASE WHEN oc.tipo = 'running_funcional'
        THEN cnt.tp_ativas + GREATEST(0, pos.utilizaveis - cnt.ativas - COALESCE(oc.vagas_bloqueadas,0))
        ELSE oc.capacidade - COALESCE(oc.vagas_bloqueadas,0) - cnt.nao_tp
      END
    ))::int AS total_capacity,
    cnt.tp_ativas::int AS total_booked
  FROM oc, cfg, cnt, pos;
$function$;

CREATE OR REPLACE FUNCTION public.wellhub_slot_numbers(p_ocorrencia_id uuid)
 RETURNS TABLE(total_capacity integer, total_booked integer)
 LANGUAGE sql
 STABLE
AS $function$
  WITH oc AS (
    SELECT o.id, o.vagas_bloqueadas, o.vagas_wellhub, a.capacidade, a.tipo, a.unidade_id
    FROM club_ocorrencias o
    JOIN club_aulas a ON a.id = o.aula_id
    WHERE o.id = p_ocorrencia_id
  ),
  cfg AS (SELECT vagas_default FROM wellhub_config WHERE id IS TRUE),
  res AS (
    SELECT posicao, tipo_credito
    FROM club_reservas
    WHERE ocorrencia_id = p_ocorrencia_id AND status <> 'cancelado'
  ),
  cnt AS (
    SELECT
      count(*) FILTER (WHERE tipo_credito =  'wellhub_app') AS wellhub,
      count(*) FILTER (WHERE tipo_credito <> 'wellhub_app') AS outras,
      count(*)                                              AS ativas
    FROM res
  ),
  pos AS (
    SELECT count(*) AS utilizaveis
    FROM oc
    JOIN club_posicoes p ON p.unidade_id = oc.unidade_id AND p.ativo = true AND p.bloqueado = false
    WHERE (p.tipo || lpad(p.numero::text,2,'0')) NOT IN (
      SELECT posicao FROM club_posicoes_bloqueios_ocorrencia WHERE ocorrencia_id = p_ocorrencia_id
    )
  )
  SELECT
    GREATEST(0, LEAST(
      COALESCE(oc.vagas_wellhub, cfg.vagas_default),
      CASE WHEN oc.tipo = 'running_funcional'
        THEN cnt.wellhub + GREATEST(0, pos.utilizaveis - cnt.ativas - COALESCE(oc.vagas_bloqueadas,0))
        ELSE oc.capacidade - COALESCE(oc.vagas_bloqueadas,0) - cnt.outras
      END
    ))::int AS total_capacity,
    cnt.wellhub::int AS total_booked
  FROM oc, cfg, cnt, pos;
$function$;
