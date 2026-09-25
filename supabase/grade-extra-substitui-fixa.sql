-- Grade extra "Sobrepor a grade fixa" (coach_horarios_extra.substitui_fixa).
-- Quando marcada, nos dias da extra (dentro do período, no dia da semana
-- marcado) o coach fica SÓ com os horários da extra: a grade fixa dele
-- (coach_horarios) sai do dia. Padrão false = comportamento de antes (soma).
-- Espelha src/lib/grade.ts -> coachesComFixaSubstituida().

alter table public.coach_horarios_extra
  add column if not exists substitui_fixa boolean not null default false;

-- ct_grade_do_dia (troca de horário do cliente): tira a fixa do coach substituído.
CREATE OR REPLACE FUNCTION public.ct_grade_do_dia(p_unidade_id uuid, p_data date)
 RETURNS TABLE(horario text, total integer, ocupados integer, bloqueadas integer, livres integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dow     int := extract(dow from p_data);
  v_usa_fds boolean;
begin
  select (exists (
           select 1 from feriados f
            where f.unidade_id = p_unidade_id and f.data = p_data and f.ativo is true
         ) or v_dow in (0, 6))
    into v_usa_fds;

  return query
  with ferias as (
    select cf.coach_id as pessoa
      from coach_ferias cf
     where p_data between cf.data_inicio and cf.data_fim
    union
    select c.user_id
      from coach_ferias cf
      join coaches c on c.id = cf.coach_id
     where p_data between cf.data_inicio and cf.data_fim
       and c.user_id is not null
  ),
  util as (
    select left(ch.hora, 5) as horario, ch.coach_id
      from coach_horarios ch
     where not v_usa_fds
       and ch.unidade_id = p_unidade_id
       and ch.dia_semana = v_dow
       and ch.ativo is true
       and ch.coach_id not in (select pessoa from ferias)
       -- grade extra "Sobrepor a grade fixa": a fixa desse coach sai do dia
       and not exists (select 1 from coach_horarios_extra sx
                        where sx.coach_id = ch.coach_id
                          and sx.unidade_id = p_unidade_id
                          and sx.dia_semana = v_dow
                          and p_data between sx.data_inicio and sx.data_fim
                          and sx.substitui_fixa is true)
    union
    select to_char(e.hora, 'HH24:MI'), e.coach_id
      from coach_horarios_extra e
      join coaches c on c.id = e.coach_id
     where not v_usa_fds
       and e.unidade_id = p_unidade_id
       and e.dia_semana = v_dow
       and p_data between e.data_inicio and e.data_fim
       and c.ativo is not false
       and e.coach_id not in (select pessoa from ferias)
  ),
  base as (
    select h.hora as horario,
           (select count(distinct e.coach_id)::int
              from escala_fds e
             where e.unidade_id = p_unidade_id
               and e.data = p_data
               and e.coach_id not in (select pessoa from ferias)) as total
      from (values ('08:00'),('09:00'),('10:00'),('11:00'),('12:00')) as h(hora)
     where v_usa_fds
    union all
    select u.horario, count(distinct u.coach_id)::int
      from util u
     group by 1
  ),
  ocup as (
    select to_char(a.horario, 'HH24:MI') as horario, count(*)::int as n
      from agendamentos a
     where a.unidade_id = p_unidade_id and a.data = p_data and a.status <> 'cancelado'
     group by 1
  ),
  bloq as (
    select to_char(v.horario, 'HH24:MI') as horario, sum(coalesce(v.quantidade, 1))::int as n
      from vagas_bloqueadas v
     where v.unidade_id = p_unidade_id and v.data = p_data and v.ativo is true
     group by 1
  )
  select b.horario,
         b.total,
         coalesce(o.n, 0),
         coalesce(x.n, 0),
         greatest(0, b.total - coalesce(o.n, 0) - coalesce(x.n, 0))
    from base b
    left join ocup o on o.horario = b.horario
    left join bloq x on x.horario = b.horario
   where b.total > 0
     and coalesce(x.n, 0) < b.total
   order by 1;
end;
$function$;

-- vagas_livres_ct (fila de espera): segue conservadora (não soma a extra), mas
-- também não conta a fixa do coach substituído — senão promoveria a fila numa
-- vaga que não existe mais.
CREATE OR REPLACE FUNCTION public.vagas_livres_ct(p_data date, p_horario time without time zone, p_unidade_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dow        int  := EXTRACT(dow FROM p_data)::int;
  v_hora_txt   text := to_char(p_horario, 'HH24:MI');
  v_usa_fds    boolean;
  v_total      int := 0;
  v_ocupados   int := 0;
  v_bloqueadas int := 0;
BEGIN
  v_usa_fds := v_dow IN (0, 6)
            OR EXISTS (SELECT 1 FROM feriados fr
                       WHERE fr.unidade_id = p_unidade_id
                         AND fr.data = p_data AND fr.ativo = true);

  IF v_usa_fds THEN
    -- Fim de semana/feriado: grade vem da escala, e só existem 5 horários.
    IF v_hora_txt NOT IN ('08:00','09:00','10:00','11:00','12:00') THEN
      RETURN 0;
    END IF;
    -- escala_fds.coach_id guarda USER_ID → resolve para coaches.id
    SELECT COUNT(DISTINCT c.id) INTO v_total
    FROM escala_fds e
    JOIN coaches c ON c.user_id = e.coach_id AND c.ativo = true
    WHERE e.unidade_id = p_unidade_id
      AND e.data = p_data
      AND NOT EXISTS (SELECT 1 FROM coach_ferias cf
                      WHERE cf.coach_id = c.id
                        AND p_data BETWEEN cf.data_inicio AND cf.data_fim);
  ELSE
    SELECT COUNT(DISTINCT ch.coach_id) INTO v_total
    FROM coach_horarios ch
    JOIN coaches c ON c.id = ch.coach_id AND c.ativo = true
    WHERE ch.unidade_id = p_unidade_id
      AND ch.ativo = true
      AND ch.dia_semana = v_dow
      AND left(ch.hora, 5) = v_hora_txt
      AND NOT EXISTS (SELECT 1 FROM coach_ferias cf
                      WHERE cf.coach_id = ch.coach_id
                        AND p_data BETWEEN cf.data_inicio AND cf.data_fim)
      -- grade extra "Sobrepor a grade fixa": a fixa desse coach sai do dia
      AND NOT EXISTS (SELECT 1 FROM coach_horarios_extra sx
                      WHERE sx.coach_id = ch.coach_id
                        AND sx.unidade_id = p_unidade_id
                        AND sx.dia_semana = v_dow
                        AND p_data BETWEEN sx.data_inicio AND sx.data_fim
                        AND sx.substitui_fixa IS TRUE);
  END IF;

  SELECT COUNT(*) INTO v_ocupados
  FROM agendamentos a
  WHERE a.unidade_id = p_unidade_id AND a.data = p_data
    AND a.horario = p_horario AND a.status <> 'cancelado';

  SELECT COALESCE(SUM(vb.quantidade), 0) INTO v_bloqueadas
  FROM vagas_bloqueadas vb
  WHERE vb.unidade_id = p_unidade_id AND vb.data = p_data
    AND vb.horario = p_horario AND vb.ativo = true;

  RETURN GREATEST(0, v_total - v_ocupados - v_bloqueadas);
END;
$function$;
