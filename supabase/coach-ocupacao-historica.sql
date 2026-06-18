-- =============================================
-- coach_ocupacao_historica — ocupação média histórica por (coach, tipo, unidade, dia da semana)
-- Base do ranking de sugestão na montagem da escala. Últimos N meses (default 3).
-- Coach EFETIVO = COALESCE(club_ocorrencias.coach_id, club_aulas.coach_id) = coaches.id.
-- Presença = club_reservas.status='presente' (NUNCA reserva). dia_semana de oc.data (date local).
-- =============================================
create or replace function public.coach_ocupacao_historica(p_meses int default 3)
returns table (
  coach_id       uuid,
  tipo           text,
  unidade_id     uuid,
  dia_semana     int,      -- 0=Dom ... 6=Sáb (extract dow de oc.data)
  ocupacao_media numeric,  -- AVG(presentes / NULLIF(capacidade,0))
  n_aulas        int
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      coalesce(oc.coach_id, a.coach_id)        as coach_id,
      a.tipo                                    as tipo,
      a.unidade_id                              as unidade_id,
      extract(dow from oc.data)::int            as dia_semana,
      a.capacidade                              as capacidade,
      (select count(*) from public.club_reservas r
        where r.ocorrencia_id = oc.id and r.status = 'presente') as presentes
    from public.club_ocorrencias oc
    join public.club_aulas a on a.id = oc.aula_id
    where oc.status = 'ativa'
      and oc.data >= (current_date - (p_meses || ' months')::interval)
      and oc.data <  current_date
      and coalesce(oc.coach_id, a.coach_id) is not null
  )
  select
    coach_id,
    tipo,
    unidade_id,
    dia_semana,
    avg(presentes::numeric / nullif(capacidade, 0)) as ocupacao_media,
    count(*)::int                                   as n_aulas
  from base
  group by coach_id, tipo, unidade_id, dia_semana;
$$;
