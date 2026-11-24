-- supabase/hibrido-fase2.sql
--
-- Treino Híbrido — fase 2: a modalidade entra na grade do Club (JustClub Vila Olímpia,
-- sala de Running). Reserva só por vagas, sem mapa (mesmo caminho do Lift), 40 vagas.
--
-- NÃO APLICAR antes do ok do Ricardo (primeira data prevista: 29/11/2026).
-- Ordem no dia do ok: 1) este arquivo  2) hibrido-virada-grade.sql (cria as aulas)  3) deploy do código.
--
-- Só aditivo: amplia checks, mapeia a modalidade nas funções que separam Running × Lift,
-- e copia valores/elegibilidade do Running para o Híbrido. Nada existente muda de comportamento.

begin;

-- ── 1) Tipo novo na grade e na elegibilidade de coach ────────────────────────
alter table public.club_aulas drop constraint if exists club_aulas_tipo_check;
alter table public.club_aulas add constraint club_aulas_tipo_check
  check (tipo = any (array['lift', 'lift_for_girls', 'running_funcional', 'treino_hibrido']));

alter table public.coach_tipos drop constraint if exists coach_tipos_tipo_check;
alter table public.coach_tipos add constraint coach_tipos_tipo_check
  check (tipo in ('lift', 'lift_for_girls', 'running_funcional', 'treino_hibrido'));

-- ── 2) Coach recebe por aula de Híbrido o mesmo que no Running (decisão do Ricardo) ──
insert into public.coach_valores (coach_id, unidade_id, tipo_aula, valor_por_aula)
select coach_id, unidade_id, 'treino_hibrido', valor_por_aula
  from public.coach_valores
 where tipo_aula = 'running_funcional'
on conflict (coach_id, unidade_id, tipo_aula) do nothing;

-- Quem dá Running pode dar Híbrido (mesma sala); a Ju ajusta na escala se precisar.
insert into public.coach_tipos (coach_id, tipo)
select coach_id, 'treino_hibrido' from public.coach_tipos where tipo = 'running_funcional' and ativo
on conflict (coach_id, tipo) do nothing;

-- ── 3) Playlist: Híbrido usa a playlist do Running (mesma sala) ───────────────
create or replace function public.playlist_modalidade(p_tipo text)
returns text
language sql
immutable
as $$
  select case
    when p_tipo in ('lift', 'lift_for_girls') then 'lift'
    when p_tipo in ('running_funcional', 'treino_hibrido') then 'running'
  end
$$;

-- ── 4) E-mail de estreia: Híbrido conta como Running (mesma sala), não como Lift ──
create or replace function public.feedback_estreia_candidatos(p_data date)
 returns table(reserva_id uuid, cliente_id uuid, cliente_nome text, email text, tipo_credito text, data_estreia date, horario time without time zone, unidade_id uuid, unidade_nome text, modalidade text, grupo_muscular text, coach_nome text, coach_genero text, periodo text, ja_recebeu boolean, descadastrado boolean, bloqueado boolean, tem_reserva_futura boolean)
 language sql
 stable
 set search_path to 'public'
as $function$
  with do_dia as (
    -- Uma linha por cliente: se treinou duas vezes no mesmo dia, vale a
    -- primeira reserva criada.
    select distinct on (r.cliente_id)
           r.id as reserva_id, r.cliente_id, r.tipo_credito, r.ocorrencia_id
      from club_reservas r
      join club_ocorrencias o on o.id = r.ocorrencia_id
     where r.status = 'presente'
       and o.status = 'ativa'
       and o.data = p_data
       and r.cliente_id <> '66f7e3a4-ba7f-4cbb-9a05-5cbead08cc25'::uuid
     order by r.cliente_id, r.created_at
  )
  select
    d.reserva_id,
    d.cliente_id,
    cl.nome                                      as cliente_nome,
    cl.email,
    d.tipo_credito,
    o.data                                       as data_estreia,
    a.horario,
    a.unidade_id,
    u.nome                                       as unidade_nome,
    case when a.tipo in ('running_funcional', 'treino_hibrido') then 'running' else 'lift' end as modalidade,
    g.nome                                       as grupo_muscular,
    btrim(co.nome)                               as coach_nome,
    co.genero                                    as coach_genero,
    case when extract(dow from o.data) in (0,6) then 'fds' else 'semana' end as periodo,
    (fe.cliente_id is not null)                  as ja_recebeu,
    (cl.marketing_descadastro_em is not null)    as descadastrado,
    coalesce(cl.bloqueado, false)                as bloqueado,
    exists (
      select 1
        from club_reservas rf
        join club_ocorrencias of2 on of2.id = rf.ocorrencia_id
       where rf.cliente_id = d.cliente_id
         and rf.status in ('reservado','presente')
         and of2.data > p_data
    )                                            as tem_reserva_futura
  from do_dia d
  join club_ocorrencias o on o.id = d.ocorrencia_id
  join club_aulas a       on a.id = o.aula_id
  join unidades u         on u.id = a.unidade_id
  join clientes cl        on cl.id = d.cliente_id
  left join grupos_musculares g on g.id = a.grupo_muscular_id
  left join coaches co    on co.id = coalesce(o.coach_id, a.coach_id)
  left join feedback_estreia fe on fe.cliente_id = d.cliente_id
 where not exists (
   -- estreia de verdade: nenhuma presença anterior a esta data
   select 1
     from club_reservas ra
     join club_ocorrencias oa on oa.id = ra.ocorrencia_id
    where ra.cliente_id = d.cliente_id
      and ra.status = 'presente'
      and oa.data < p_data
 );
$function$;

-- ── 5) Faixas prováveis: média de reservas do horário, Running e Híbrido juntos ──
-- (no começo não há histórico de Híbrido; o Running do mesmo horário serve de base)
create or replace function public.hibrido_media_reservas(p_unidade uuid)
returns table (dia_semana int, horario time, media numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')) then
    raise exception 'sem permissão';
  end if;
  return query
  with por_ocorrencia as (
    select a.dia_semana, a.horario, o.id,
           count(r.id) filter (where r.status in ('presente', 'falta')) as n
      from club_ocorrencias o
      join club_aulas a on a.id = o.aula_id
      left join club_reservas r on r.ocorrencia_id = o.id
     where a.unidade_id = p_unidade
       and a.tipo in ('running_funcional', 'treino_hibrido')
       and o.status <> 'cancelada'
       and o.data between (now() at time zone 'America/Sao_Paulo')::date - 56
                      and (now() at time zone 'America/Sao_Paulo')::date - 1
     group by a.dia_semana, a.horario, o.id
  )
  select p.dia_semana, p.horario, round(avg(p.n), 1)
    from por_ocorrencia p
   group by p.dia_semana, p.horario
   order by 1, 2;
end;
$$;
revoke all on function public.hibrido_media_reservas(uuid) from public, anon;
grant execute on function public.hibrido_media_reservas(uuid) to authenticated, service_role;

commit;
