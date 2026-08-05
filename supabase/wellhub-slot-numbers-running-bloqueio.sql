-- wellhub-slot-numbers-running-bloqueio.sql
--
-- PROBLEMA: wellhub_slot_numbers não tinha ramo pra Running/Funcional. Fazia
-- capacidade - vagas_bloqueadas - outras e NUNCA descontava posições bloqueadas
-- (nem globais em club_posicoes.bloqueado, nem pontuais em
-- club_posicoes_bloqueios_ocorrencia). Resultado: em VL Olímpia, com 2 posições
-- bloqueadas, o Wellhub oferecia 2 vagas a mais do que existe fisicamente ->
-- overbooking -> gente reservada "sem posição". O TotalPass já tinha sido
-- corrigido (totalpass_slot_numbers, 02/08); este é o gêmeo que faltava.
--
-- SOLUÇÃO: espelhar o ramo Running do TotalPass — capacidade Running =
-- reservas Wellhub já feitas + posições LIVRES (ativas, não bloqueadas
-- global/pontual e não tomadas). O ramo Lift/LFG (ELSE) fica idêntico ao atual.
-- Função STABLE de leitura: não escreve nada, isolada, à prova de falha.

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
      count(*) FILTER (WHERE tipo_credito <> 'wellhub_app') AS outras
    FROM res
  ),
  pos_free AS (
    SELECT count(*) AS livres
    FROM oc
    JOIN club_posicoes p ON p.unidade_id = oc.unidade_id AND p.ativo = true AND p.bloqueado = false
    WHERE (p.tipo || lpad(p.numero::text,2,'0')) NOT IN (SELECT posicao FROM res WHERE posicao IS NOT NULL)
      AND (p.tipo || lpad(p.numero::text,2,'0')) NOT IN (
        SELECT posicao FROM club_posicoes_bloqueios_ocorrencia WHERE ocorrencia_id = p_ocorrencia_id
      )
  )
  SELECT
    GREATEST(0, LEAST(
      COALESCE(oc.vagas_wellhub, cfg.vagas_default),
      CASE WHEN oc.tipo = 'running_funcional'
        THEN cnt.wellhub + pos_free.livres
        ELSE oc.capacidade - COALESCE(oc.vagas_bloqueadas,0) - cnt.outras
      END
    ))::int AS total_capacity,
    cnt.wellhub::int AS total_booked
  FROM oc, cfg, cnt, pos_free;
$function$;
