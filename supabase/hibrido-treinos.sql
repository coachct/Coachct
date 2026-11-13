-- Treino Híbrido (fase 1): montagem, biblioteca e calendário de treinos da sala de Running
-- da JustClub Vila Olímpia. Só aditivo: tabelas novas, nada nas existentes.
-- Tempos guardados em segundos; a tela mostra mm:ss.

create table if not exists public.hibrido_treinos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  faixa smallint not null check (faixa between 1 and 4),
  duracao_seg int not null default 3000 check (duracao_seg > 0),
  aquecimento_desc text,
  aquecimento_seg int not null default 0 check (aquecimento_seg >= 0),
  explicacao_desc text,
  explicacao_seg int not null default 0 check (explicacao_seg >= 0),
  modelo boolean not null default false,
  unidade_id uuid not null references public.unidades(id),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists hibrido_treinos_unidade_idx on public.hibrido_treinos (unidade_id, faixa);

create table if not exists public.hibrido_blocos (
  id uuid primary key default gen_random_uuid(),
  treino_id uuid not null references public.hibrido_treinos(id) on delete cascade,
  ordem int not null default 0,
  nome text not null default '',
  formato text not null default 'grupos_ab' check (formato in ('grupos_ab', 'circuito', 'todos')),
  etapa_seg int not null default 0 check (etapa_seg >= 0),
  transicao_seg int not null default 0 check (transicao_seg >= 0),
  rounds int not null default 1 check (rounds >= 1),
  -- grupos_ab: {"a_comeca": "corrida" | "estacoes"}; circuito/todos: {"ordem": [estacao_id, ...]}
  rodizio jsonb not null default '{}'::jsonb,
  alunos_corrida int not null default 0 check (alunos_corrida >= 0),
  corrida_em_dupla boolean not null default false
);
create index if not exists hibrido_blocos_treino_idx on public.hibrido_blocos (treino_id, ordem);

create table if not exists public.hibrido_estacoes (
  id uuid primary key default gen_random_uuid(),
  bloco_id uuid not null references public.hibrido_blocos(id) on delete cascade,
  ordem int not null default 0,
  estacao text not null check (estacao in ('corrida', 'remo', 'ski', 'wall_ball', 'sled', 'funcional')),
  rotulo text,
  postos int,
  pessoas int,
  modo_dupla text not null default 'individual' check (modo_dupla in ('individual', 'alternado', 'juntos', 'meta_dividida')),
  instrucao text,
  meta text,
  carga_f text,
  carga_m text
);
create index if not exists hibrido_estacoes_bloco_idx on public.hibrido_estacoes (bloco_id, ordem);

-- Qual treino vale em cada dia e faixa. É o que o calendário usa e o que a TV vai ler na fase 2.
create table if not exists public.hibrido_programacao (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  faixa smallint not null check (faixa between 1 and 4),
  unidade_id uuid not null references public.unidades(id),
  treino_id uuid not null references public.hibrido_treinos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (data, faixa, unidade_id)
);
create index if not exists hibrido_programacao_treino_idx on public.hibrido_programacao (treino_id, data);

-- Dias com aula híbrida marcados à mão, enquanto a modalidade não existe na grade (fase 2).
create table if not exists public.hibrido_dias (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  unidade_id uuid not null references public.unidades(id),
  criado_em timestamptz not null default now(),
  unique (data, unidade_id)
);

-- GRANTs por papel: authenticated e service_role; anon não.
revoke all on public.hibrido_treinos, public.hibrido_blocos, public.hibrido_estacoes,
  public.hibrido_programacao, public.hibrido_dias from anon;
grant select, insert, update, delete on public.hibrido_treinos, public.hibrido_blocos, public.hibrido_estacoes,
  public.hibrido_programacao, public.hibrido_dias to authenticated;
grant all on public.hibrido_treinos, public.hibrido_blocos, public.hibrido_estacoes,
  public.hibrido_programacao, public.hibrido_dias to service_role;

alter table public.hibrido_treinos enable row level security;
alter table public.hibrido_blocos enable row level security;
alter table public.hibrido_estacoes enable row level security;
alter table public.hibrido_programacao enable row level security;
alter table public.hibrido_dias enable row level security;

-- Leitura e escrita só para admin/coordenadora. A TV (fase 2) vai passar pela API (service role).
drop policy if exists hibrido_treinos_admin on public.hibrido_treinos;
create policy hibrido_treinos_admin on public.hibrido_treinos for all to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')))
  with check (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')));

drop policy if exists hibrido_blocos_admin on public.hibrido_blocos;
create policy hibrido_blocos_admin on public.hibrido_blocos for all to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')))
  with check (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')));

drop policy if exists hibrido_estacoes_admin on public.hibrido_estacoes;
create policy hibrido_estacoes_admin on public.hibrido_estacoes for all to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')))
  with check (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')));

drop policy if exists hibrido_programacao_admin on public.hibrido_programacao;
create policy hibrido_programacao_admin on public.hibrido_programacao for all to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')))
  with check (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')));

drop policy if exists hibrido_dias_admin on public.hibrido_dias;
create policy hibrido_dias_admin on public.hibrido_dias for all to authenticated
  using (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')))
  with check (exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')));

-- Média de reservas (presenças + faltas) por dia da semana e horário das aulas de Running
-- da unidade nas últimas 8 semanas. O calendário usa para achar as faixas prováveis do dia.
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
       and a.tipo = 'running_funcional'
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
