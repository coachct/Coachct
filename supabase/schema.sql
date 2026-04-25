-- =============================================
-- IRON SYSTEM — Schema do Banco de Dados
-- Execute este arquivo no SQL Editor do Supabase
-- =============================================

-- Habilitar extensão de UUID
create extension if not exists "uuid-ossp";

-- =============================================
-- PERFIS DE USUÁRIO
-- =============================================
create table public.perfis (
  id uuid references auth.users on delete cascade primary key,
  nome text not null,
  role text not null check (role in ('admin', 'coach', 'coordenadora')),
  ativo boolean default true,
  criado_em timestamptz default now()
);

alter table public.perfis enable row level security;

create policy "Usuário vê próprio perfil" on public.perfis
  for select using (auth.uid() = id);

create policy "Admin vê todos os perfis" on public.perfis
  for all using (
    exists (select 1 from public.perfis where id = auth.uid() and role = 'admin')
  );

-- =============================================
-- COACHES
-- =============================================
create table public.coaches (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete set null,
  nome text not null,
  cpf text unique not null,
  email text unique not null,
  contrato text not null check (contrato in ('CLT', 'PJ', 'Autônomo')),
  salario_fixo numeric(10,2) default 0,
  adicional_por_aula numeric(10,2) default 0,
  valor_cliente_aula numeric(10,2) default 0,
  ativo boolean default true,
  criado_em timestamptz default now()
);

alter table public.coaches enable row level security;

create policy "Admin gerencia coaches" on public.coaches
  for all using (
    exists (select 1 from public.perfis where id = auth.uid() and role = 'admin')
  );

create policy "Coach vê próprio cadastro" on public.coaches
  for select using (user_id = auth.uid());

-- =============================================
-- HORÁRIOS DOS COACHES
-- =============================================
create table public.coach_horarios (
  id uuid default uuid_generate_v4() primary key,
  coach_id uuid references public.coaches on delete cascade not null,
  dia_semana int not null check (dia_semana between 0 and 6), -- 0=Dom, 1=Seg...6=Sab
  hora int not null check (hora between 0 and 23),
  ativo boolean default true
);

alter table public.coach_horarios enable row level security;

create policy "Admin gerencia horários" on public.coach_horarios
  for all using (
    exists (select 1 from public.perfis where id = auth.uid() and role = 'admin')
  );

create policy "Coach vê próprios horários" on public.coach_horarios
  for select using (
    exists (select 1 from public.coaches where id = coach_id and user_id = auth.uid())
  );

-- =============================================
-- CATEGORIAS DE EXERCÍCIOS (Biblioteca da Ju)
-- =============================================
create table public.categorias (
  id uuid default uuid_generate_v4() primary key,
  nome text not null unique,
  ordem int default 0,
  criado_em timestamptz default now()
);

alter table public.categorias enable row level security;

create policy "Todos leem categorias" on public.categorias
  for select using (true);

create policy "Coordenadora e admin gerenciam categorias" on public.categorias
  for all using (
    exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
  );

-- Categorias padrão
insert into public.categorias (nome, ordem) values
  ('Peito', 1), ('Costas', 2), ('Pernas', 3), ('Ombros', 4),
  ('Bíceps', 5), ('Tríceps', 6), ('Core / Abdômen', 7),
  ('Glúteos', 8), ('Cardio / Funcional', 9);

-- =============================================
-- EXERCÍCIOS (Biblioteca da Ju)
-- =============================================
create table public.exercicios (
  id uuid default uuid_generate_v4() primary key,
  categoria_id uuid references public.categorias on delete restrict not null,
  nome text not null,
  numero_maquina text,
  series_padrao int default 3,
  reps_padrao text default '12',
  descanso_segundos int default 60,
  observacoes text,
  ativo boolean default true,
  criado_em timestamptz default now()
);

alter table public.exercicios enable row level security;

create policy "Todos leem exercícios ativos" on public.exercicios
  for select using (ativo = true);

create policy "Coordenadora e admin gerenciam exercícios" on public.exercicios
  for all using (
    exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
  );

-- =============================================
-- TREINOS DO MÊS (Ju monta os treinos A, B, C...)
-- =============================================
create table public.treinos (
  id uuid default uuid_generate_v4() primary key,
  nome text not null,              -- Ex: "Treino A"
  descricao text,                  -- Ex: "Peito + Tríceps"
  mes int not null,                -- 1-12
  ano int not null,
  publicado boolean default false,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

alter table public.treinos enable row level security;

create policy "Todos leem treinos publicados" on public.treinos
  for select using (publicado = true);

create policy "Coordenadora e admin gerenciam treinos" on public.treinos
  for all using (
    exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
  );

-- =============================================
-- EXERCÍCIOS DE CADA TREINO
-- =============================================
create table public.treino_exercicios (
  id uuid default uuid_generate_v4() primary key,
  treino_id uuid references public.treinos on delete cascade not null,
  exercicio_id uuid references public.exercicios on delete restrict not null,
  ordem int default 0,
  series_override int,
  reps_override text,
  descanso_override int,
  observacoes_override text
);

alter table public.treino_exercicios enable row level security;

create policy "Todos leem treino_exercicios" on public.treino_exercicios
  for select using (true);

create policy "Coordenadora e admin gerenciam treino_exercicios" on public.treino_exercicios
  for all using (
    exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
  );

-- =============================================
-- ALUNOS
-- =============================================
create table public.alunos (
  id uuid default uuid_generate_v4() primary key,
  nome text not null,
  cpf text unique not null,
  telefone text,
  data_nascimento date,
  observacoes text,
  ativo boolean default true,
  cadastrado_por uuid references public.coaches on delete set null,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

alter table public.alunos enable row level security;

create policy "Coaches e admin veem alunos" on public.alunos
  for select using (
    exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coach','coordenadora'))
  );

create policy "Coaches criam alunos" on public.alunos
  for insert with check (
    exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coach'))
  );

create policy "Coaches e admin atualizam alunos" on public.alunos
  for update using (
    exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coach'))
  );

-- =============================================
-- AULAS REGISTRADAS
-- =============================================
create table public.aulas (
  id uuid default uuid_generate_v4() primary key,
  coach_id uuid references public.coaches on delete restrict not null,
  aluno_id uuid references public.alunos on delete restrict not null,
  treino_id uuid references public.treinos on delete set null,
  horario_agendado timestamptz not null,
  iniciada_em timestamptz,
  finalizada_em timestamptz,
  observacoes text,
  status text default 'em_andamento' check (status in ('em_andamento','finalizada','cancelada')),
  criado_em timestamptz default now()
);

alter table public.aulas enable row level security;

create policy "Admin vê todas as aulas" on public.aulas
  for all using (
    exists (select 1 from public.perfis where id = auth.uid() and role = 'admin')
  );

create policy "Coach vê e cria suas aulas" on public.aulas
  for all using (
    exists (select 1 from public.coaches where id = coach_id and user_id = auth.uid())
  );

-- =============================================
-- REGISTROS DE CARGA (autosave por exercício)
-- =============================================
create table public.registros_carga (
  id uuid default uuid_generate_v4() primary key,
  aula_id uuid references public.aulas on delete cascade not null,
  exercicio_id uuid references public.exercicios on delete restrict not null,
  maquina text,
  carga_kg numeric(6,2),
  reps_realizadas text,
  observacoes text,
  salvo_em timestamptz default now()
);

alter table public.registros_carga enable row level security;

create policy "Coach acessa registros de suas aulas" on public.registros_carga
  for all using (
    exists (
      select 1 from public.aulas a
      join public.coaches c on c.id = a.coach_id
      where a.id = aula_id and c.user_id = auth.uid()
    )
  );

create policy "Admin vê todos os registros" on public.registros_carga
  for select using (
    exists (select 1 from public.perfis where id = auth.uid() and role = 'admin')
  );

-- =============================================
-- HISTÓRICO DE CARGAS POR MÁQUINA (view)
-- Facilita o coach ver a última carga do aluno numa máquina
-- =============================================
create or replace view public.historico_maquina as
select
  rc.exercicio_id,
  rc.maquina,
  a.aluno_id,
  al.nome as aluno_nome,
  rc.carga_kg,
  rc.reps_realizadas,
  a.horario_agendado as data_aula,
  a.coach_id
from public.registros_carga rc
join public.aulas a on a.id = rc.aula_id
join public.alunos al on al.id = a.aluno_id
where rc.carga_kg is not null
order by a.horario_agendado desc;

-- =============================================
-- FUNÇÃO: Criar perfil ao cadastrar usuário
-- =============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.perfis (id, nome, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'coach')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- ÍNDICES para performance
-- =============================================
create index idx_aulas_coach on public.aulas(coach_id);
create index idx_aulas_aluno on public.aulas(aluno_id);
create index idx_aulas_horario on public.aulas(horario_agendado);
create index idx_registros_aula on public.registros_carga(aula_id);
create index idx_registros_maquina on public.registros_carga(maquina, exercicio_id);
create index idx_treino_exercicios_treino on public.treino_exercicios(treino_id);
create index idx_exercicios_categoria on public.exercicios(categoria_id);
