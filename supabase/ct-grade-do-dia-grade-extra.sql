-- ct_grade_do_dia passa a somar a GRADE EXTRA (coach_horarios_extra), igual ao
-- site (/agendar -> gradeExtraDoDia). Antes a troca de horário do cliente via
-- a hora com o coach extra como lotada (ex.: 24/09/2026 07:00 — site mostrava
-- 1 vaga, a troca dizia lotado).
--
-- Regra igual à do site: extra só vale em dia útil, coach ativo, fora de férias,
-- e o mesmo coach não conta duas vezes na mesma hora.
-- Só é usada por opcoes_troca_cliente e trocar_horario_ct_cliente.

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
    -- Coach fora na data. Junta coaches.id E coaches.user_id porque
    -- escala_fds.coach_id guarda USER_ID e coach_horarios.coach_id guarda coaches.id.
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
    -- Dia útil: grade semanal + grade extra do período (coach ativo)
    select left(ch.hora, 5) as horario, ch.coach_id
      from coach_horarios ch
     where not v_usa_fds
       and ch.unidade_id = p_unidade_id
       and ch.dia_semana = v_dow
       and ch.ativo is true
       and ch.coach_id not in (select pessoa from ferias)
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
    -- Fim de semana / feriado: escala do dia vale pra lista fixa de horários
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
