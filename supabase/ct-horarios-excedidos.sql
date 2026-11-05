-- Horários do CT com mais clientes agendados do que coaches na grade do dia
-- (grade fixa + extra − férias/afastamentos; fds/feriado pela escala).
-- Hoje (só horários que ainda não passaram) até p_dias à frente. Só leitura.
-- Usado pelo card CardExcessoCoachCT no dashboard admin.
-- Aplicado em 05/11/2026 (migration ct_horarios_excedidos).
CREATE OR REPLACE FUNCTION public.ct_horarios_excedidos(p_dias int DEFAULT 14)
 RETURNS TABLE(unidade_id uuid, unidade_nome text, data date, horario text, coaches int, agendados int, excesso int)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role  text;
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    SELECT role INTO v_role FROM perfis WHERE id = auth.uid();
    IF coalesce(v_role, '') NOT IN ('admin', 'recepcao', 'coordenadora') THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT u.id AS uid, u.nome AS unome, d::date AS dia
      FROM unidades u
     CROSS JOIN generate_series(v_hoje, v_hoje + greatest(p_dias, 0), interval '1 day') d
     WHERE u.tipo = 'ct' AND u.ativo IS TRUE
  ),
  grade AS (
    SELECT di.uid, di.dia, g.horario AS hr, g.total
      FROM dias di
     CROSS JOIN LATERAL ct_grade_do_dia(di.uid, di.dia) g
  ),
  ocup AS (
    SELECT a.unidade_id AS uid, a.data AS dia, to_char(a.horario, 'HH24:MI') AS hr, count(*)::int AS n
      FROM agendamentos a
      JOIN dias di ON di.uid = a.unidade_id AND di.dia = a.data
     WHERE a.status <> 'cancelado'
     GROUP BY 1, 2, 3
  )
  SELECT o.uid, di.unome, o.dia, o.hr,
         coalesce(g.total, 0), o.n, o.n - coalesce(g.total, 0)
    FROM ocup o
    JOIN (SELECT DISTINCT uid, unome FROM dias) di ON di.uid = o.uid
    LEFT JOIN grade g ON g.uid = o.uid AND g.dia = o.dia AND g.hr = o.hr
   WHERE o.n > coalesce(g.total, 0)
     AND (o.dia + o.hr::time) > v_agora
   ORDER BY o.dia, o.hr;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ct_horarios_excedidos(int) TO authenticated;
