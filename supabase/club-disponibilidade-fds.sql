-- =============================================
-- CLUB_DISPONIBILIDADE_FDS — disponibilidade de coach por data de fim de semana
-- A coordenadora (Ju) lança quem está livre em cada sáb/dom do mês.
-- coach_id = coaches.id (NÃO user_id). Uma marcação por (coach, data).
-- =============================================
create table public.club_disponibilidade_fds (
  id          uuid primary key default gen_random_uuid(),
  competencia text not null,                 -- 'YYYY-MM' do mês sendo montado
  coach_id    uuid not null references public.coaches(id) on delete cascade,
  data        date not null,
  criado_por  uuid,
  criado_em   timestamptz default now(),
  unique (coach_id, data)                    -- livre/não por data, independente da competência
);

create index idx_disp_fds_comp on public.club_disponibilidade_fds(competencia);
create index idx_disp_fds_data on public.club_disponibilidade_fds(data);

alter table public.club_disponibilidade_fds enable row level security;

-- RLS espelhada de coach_unidades (admin + coordenadora ativos), policy única ALL.
create policy "admin_coordenadora_club_disp_fds" on public.club_disponibilidade_fds
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
