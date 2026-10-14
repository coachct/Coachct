-- ─────────────────────────────────────────────────────────────────────────────
-- Turnos do fim de semana do Coach CT (a partir de 17/10/2026)
--
--  • Sábado: turno 1 = 08, 09, 10, 11 · turno 2 = 11, 12, 13, 14
--    (coach sem turno não abre vaga)
--  • Domingo e feriado: 09, 10, 11, 12, 13 (turno ignorado)
--  • Antes de 17/10/2026: grade antiga 08–12 para todos
--
-- Espelho em TS: src/lib/fds-ct.ts. Mexeu aqui, mexe lá.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.escala_fds
  add column if not exists turno smallint check (turno in (1, 2));

create or replace function public.ct_fds_horarios_coach(p_data date, p_feriado boolean, p_turno smallint)
returns text[]
language sql
immutable
as $$
  select case
    when p_data < date '2026-10-17' then array['08:00','09:00','10:00','11:00','12:00']
    when p_feriado or extract(dow from p_data) <> 6 then array['09:00','10:00','11:00','12:00','13:00']
    when p_turno = 1 then array['08:00','09:00','10:00','11:00']
    when p_turno = 2 then array['11:00','12:00','13:00','14:00']
    else array[]::text[]
  end
$$;

-- ct_grade_do_dia: grade de FDS conta, por horário, só os coaches que atendem naquele horário
create or replace function public.ct_grade_do_dia(p_unidade_id uuid, p_data date)
 returns table(horario text, total integer, ocupados integer, bloqueadas integer, livres integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_dow     int := extract(dow from p_data);
  v_feriado boolean;
  v_usa_fds boolean;
begin
  select exists (
           select 1 from feriados f
            where f.unidade_id = p_unidade_id and f.data = p_data and f.ativo is true
         )
    into v_feriado;
  v_usa_fds := v_feriado or v_dow in (0, 6);

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
  fds as (
    select h.hora as horario, e.coach_id
      from escala_fds e
      cross join lateral unnest(ct_fds_horarios_coach(p_data, v_feriado, e.turno)) as h(hora)
     where v_usa_fds
       and e.unidade_id = p_unidade_id
       and e.data = p_data
       and e.coach_id not in (select pessoa from ferias)
  ),
  base as (
    select f.horario, count(distinct f.coach_id)::int as total
      from fds f
     group by 1
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

-- vagas_livres_ct: no FDS conta só quem atende o horário pedido
create or replace function public.vagas_livres_ct(p_data date, p_horario time without time zone, p_unidade_id uuid)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_dow        int  := extract(dow from p_data)::int;
  v_hora_txt   text := to_char(p_horario, 'HH24:MI');
  v_feriado    boolean;
  v_usa_fds    boolean;
  v_total      int := 0;
  v_ocupados   int := 0;
  v_bloqueadas int := 0;
begin
  v_feriado := exists (select 1 from feriados fr
                       where fr.unidade_id = p_unidade_id
                         and fr.data = p_data and fr.ativo = true);
  v_usa_fds := v_dow in (0, 6) or v_feriado;

  if v_usa_fds then
    select count(distinct c.id) into v_total
    from escala_fds e
    join coaches c on c.user_id = e.coach_id and c.ativo = true
    where e.unidade_id = p_unidade_id
      and e.data = p_data
      and v_hora_txt = any (ct_fds_horarios_coach(p_data, v_feriado, e.turno))
      and not exists (select 1 from coach_ferias cf
                      where cf.coach_id = c.id
                        and p_data between cf.data_inicio and cf.data_fim);
  else
    select count(distinct ch.coach_id) into v_total
    from coach_horarios ch
    join coaches c on c.id = ch.coach_id and c.ativo = true
    where ch.unidade_id = p_unidade_id
      and ch.ativo = true
      and ch.dia_semana = v_dow
      and left(ch.hora, 5) = v_hora_txt
      and not exists (select 1 from coach_ferias cf
                      where cf.coach_id = ch.coach_id
                        and p_data between cf.data_inicio and cf.data_fim)
      and not exists (select 1 from coach_horarios_extra sx
                      where sx.coach_id = ch.coach_id
                        and sx.unidade_id = p_unidade_id
                        and sx.dia_semana = v_dow
                        and p_data between sx.data_inicio and sx.data_fim
                        and sx.substitui_fixa is true);
  end if;

  select count(*) into v_ocupados
  from agendamentos a
  where a.unidade_id = p_unidade_id and a.data = p_data
    and a.horario = p_horario and a.status <> 'cancelado';

  select coalesce(sum(vb.quantidade), 0) into v_bloqueadas
  from vagas_bloqueadas vb
  where vb.unidade_id = p_unidade_id and vb.data = p_data
    and vb.horario = p_horario and vb.ativo = true;

  return greatest(0, v_total - v_ocupados - v_bloqueadas);
end;
$function$;
