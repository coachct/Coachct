-- Playlists do dia do Club (Lift e Running). Substitui a planilha "Playlists 2026".
-- Uma playlist de Lift e uma de Running por dia; tocam o dia todo nas duas unidades.
-- Lift for Girls usa a playlist do Lift.

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  link text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists playlists_nome_uidx on public.playlists (lower(nome));

create table if not exists public.playlist_dia (
  data date not null,
  modalidade text not null check (modalidade in ('lift', 'running')),
  playlist_id uuid not null references public.playlists(id) on delete restrict,
  observacao text,
  -- admin = Ricardo escolheu; sugestao = coach apertou "Sugestão do dia"; planilha = import
  origem text not null default 'admin' check (origem in ('admin', 'sugestao', 'planilha')),
  criado_em timestamptz not null default now(),
  primary key (data, modalidade)
);
create index if not exists playlist_dia_playlist_idx on public.playlist_dia (playlist_id, data);

-- PIN único que o Ricardo passa pros coaches abrirem /playlist.
create table if not exists public.playlist_config (
  id int primary key default 1 check (id = 1),
  pin text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.playlists enable row level security;
alter table public.playlist_dia enable row level security;
alter table public.playlist_config enable row level security;

-- Só admin/coordenadora mexe pelo admin. A página dos coaches passa pela API (service role).
drop policy if exists playlists_admin on public.playlists;
create policy playlists_admin on public.playlists for all to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')))
  with check (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')));

drop policy if exists playlist_dia_admin on public.playlist_dia;
create policy playlist_dia_admin on public.playlist_dia for all to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')))
  with check (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')));

drop policy if exists playlist_config_admin on public.playlist_config;
create policy playlist_config_admin on public.playlist_config for all to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')))
  with check (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')));

-- Tipo da aula do Club -> modalidade da playlist.
create or replace function public.playlist_modalidade(p_tipo text)
returns text
language sql
immutable
as $$
  select case
    when p_tipo in ('lift', 'lift_for_girls') then 'lift'
    when p_tipo = 'running_funcional' then 'running'
  end
$$;

-- Para cada playlist: quantos dos clientes reservados em p_data (na modalidade,
-- somando as duas unidades) fizeram aula com ela nos 7 dias anteriores.
-- Conta aula de qualquer modalidade em que ela tocou: o cliente ouviu do mesmo jeito.
create or replace function public._playlist_exposicao(p_data date, p_modalidade text)
returns table (playlist_id uuid, publico int, ouviram int)
language sql
stable
security definer
set search_path to 'public'
as $$
  with publico as (
    select distinct r.cliente_id
      from club_reservas r
      join club_ocorrencias o on o.id = r.ocorrencia_id
      join club_aulas a on a.id = o.aula_id
     where o.data = p_data
       and o.status <> 'cancelada'
       and r.status in ('reservado', 'presente')
       and playlist_modalidade(a.tipo) = p_modalidade
  ),
  tot as (select count(*)::int as n from publico),
  ouviu as (
    select pd.playlist_id, count(distinct r.cliente_id)::int as n
      from playlist_dia pd
      join club_ocorrencias o on o.data = pd.data and o.status <> 'cancelada'
      join club_aulas a on a.id = o.aula_id and playlist_modalidade(a.tipo) = pd.modalidade
      join club_reservas r on r.ocorrencia_id = o.id and r.status in ('reservado', 'presente')
      join publico p on p.cliente_id = r.cliente_id
     where pd.data between p_data - 7 and p_data - 1
     group by pd.playlist_id
  )
  select pl.id, tot.n, coalesce(ouviu.n, 0)
    from playlists pl
   cross join tot
    left join ouviu on ouviu.playlist_id = pl.id
$$;

-- Admin: catálogo com histórico e notas. Com p_data + p_modalidade, traz também
-- a exposição (quantos reservados daquele dia já ouviram na última semana).
create or replace function public.playlists_estatisticas(p_data date default null, p_modalidade text default null)
returns table (
  playlist_id uuid,
  nome text,
  link text,
  ativo boolean,
  vezes_lift int,
  vezes_running int,
  ultima_vez date,
  qtd_notas int,
  nota_media numeric,
  notas_baixas int,
  publico int,
  ouviram int,
  pct numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  return query
  with hist as (
    select d.playlist_id,
           count(*) filter (where d.modalidade = 'lift')::int as vl,
           count(*) filter (where d.modalidade = 'running')::int as vr,
           max(d.data) as ult
      from playlist_dia d
     where d.data <= v_hoje
     group by d.playlist_id
  ),
  notas as (
    select d.playlist_id,
           count(av.nota_musica)::int as qn,
           round(avg(av.nota_musica), 2) as media,
           count(*) filter (where av.nota_musica <= 3)::int as baixas
      from playlist_dia d
      join avaliacoes_aula av
        on av.origem = 'club'
       and av.data_aula = d.data
       and playlist_modalidade(av.tipo_aula) = d.modalidade
       and av.nota_musica is not null
     where d.data <= v_hoje
     group by d.playlist_id
  ),
  expo as (
    select * from _playlist_exposicao(p_data, p_modalidade)
     where p_data is not null and p_modalidade is not null
  )
  select pl.id, pl.nome, pl.link, pl.ativo,
         coalesce(h.vl, 0), coalesce(h.vr, 0), h.ult,
         coalesce(n.qn, 0), n.media, coalesce(n.baixas, 0),
         e.publico, e.ouviram,
         case when e.publico > 0 then round(100.0 * e.ouviram / e.publico, 0) else case when e.publico is null then null else 0 end end
    from playlists pl
    left join hist h on h.playlist_id = pl.id
    left join notas n on n.playlist_id = pl.id
    left join expo e on e.playlist_id = pl.id
   order by pl.nome;
end;
$$;

-- Coach apertou "Sugestão do dia" num dia sem playlist. Sorteia entre as que o
-- Ricardo já colocou no mesmo dia da semana, na mesma modalidade, e que não
-- passam de 20% dos reservados de hoje que ouviram na última semana. Se nenhuma
-- passa, pega a de menor %. A escolha fica gravada: quem abrir depois vê a mesma.
-- Só a API (service role) chama, depois de conferir o PIN.
create or replace function public.playlist_sugerir(p_modalidade text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid;
  v_obs text;
begin
  if p_modalidade not in ('lift', 'running') then
    raise exception 'MODALIDADE_INVALIDA';
  end if;

  if exists (select 1 from playlist_dia where data = v_hoje and modalidade = p_modalidade) then
    return;
  end if;

  select c.playlist_id into v_id
    from (
      select distinct d.playlist_id
        from playlist_dia d
        join playlists pl on pl.id = d.playlist_id and pl.ativo
       where d.modalidade = p_modalidade
         and d.data < v_hoje
         and extract(dow from d.data) = extract(dow from v_hoje)
    ) c
    join _playlist_exposicao(v_hoje, p_modalidade) e on e.playlist_id = c.playlist_id
   order by
     case when e.publico = 0 or e.ouviram * 100 <= e.publico * 20 then 0 else 1 end,
     case when e.publico = 0 or e.ouviram * 100 <= e.publico * 20 then 0 else e.ouviram::numeric / e.publico end,
     random()
   limit 1;

  if v_id is null then return; end if;

  -- Observação da última vez que tocou (ex.: "iniciar em 02:25")
  select d.observacao into v_obs
    from playlist_dia d
   where d.playlist_id = v_id and d.modalidade = p_modalidade
   order by d.data desc
   limit 1;

  insert into playlist_dia (data, modalidade, playlist_id, observacao, origem)
  values (v_hoje, p_modalidade, v_id, v_obs, 'sugestao')
  on conflict (data, modalidade) do nothing;
end;
$$;

-- Admin: exposição das playlists já escolhidas num intervalo (selo de alerta na agenda).
-- O número muda conforme entram reservas, então é recalculado a cada abertura.
create or replace function public.playlist_alertas(p_inicio date, p_fim date)
returns table (data date, modalidade text, publico int, ouviram int)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  if not exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  return query
  select d.data, d.modalidade, e.publico, e.ouviram
    from playlist_dia d
   cross join lateral _playlist_exposicao(d.data, d.modalidade) e
   where d.data between p_inicio and p_fim
     and e.playlist_id = d.playlist_id;
end;
$$;

revoke all on function public._playlist_exposicao(date, text) from public, anon, authenticated;
revoke all on function public.playlist_alertas(date, date) from public, anon;
grant execute on function public.playlist_alertas(date, date) to authenticated;
revoke all on function public.playlists_estatisticas(date, text) from public, anon;
grant execute on function public.playlists_estatisticas(date, text) to authenticated;
revoke all on function public.playlist_sugerir(text) from public, anon, authenticated;
grant execute on function public.playlist_sugerir(text) to service_role;
