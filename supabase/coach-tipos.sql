-- =============================================
-- COACH_TIPOS — capacidade (tipo de aula Club) por coach
-- Espelha coach_unidades. coach_id = coaches.id (NÃO user_id).
-- Se o coach dá um tipo, fica elegível pra esse tipo em qualquer unidade Club.
-- =============================================
create table public.coach_tipos (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.coaches(id) on delete cascade,
  tipo       text not null check (tipo in ('lift', 'lift_for_girls', 'running_funcional')),
  ativo      boolean not null default true,
  criado_em  timestamptz default now(),
  unique (coach_id, tipo)
);

create index idx_coach_tipos_coach on public.coach_tipos(coach_id) where ativo;

alter table public.coach_tipos enable row level security;

-- RLS espelhada de coach_unidades (admin + coordenadora ativos), policy única ALL.
create policy "admin_coordenadora_coach_tipos" on public.coach_tipos
  for all
  using (
    exists (
      select 1 from public.perfis
      where perfis.id = auth.uid()
        and perfis.role = any (array['admin'::text, 'coordenadora'::text])
        and perfis.ativo = true
    )
  )
  with check (
    exists (
      select 1 from public.perfis
      where perfis.id = auth.uid()
        and perfis.role = any (array['admin'::text, 'coordenadora'::text])
        and perfis.ativo = true
    )
  );
