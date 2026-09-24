-- =============================================
-- CT_DISPONIBILIDADE_FDS — disponibilidade de coach por data de fim de semana (Coach CT)
-- Espelho de club_disponibilidade_fds, mas por unidade (a escala_fds do CT é por unidade).
-- coach_id = coaches.id (NÃO user_id, que é o que a escala_fds guarda). Uma marcação por (unidade, coach, data).
-- =============================================
create table public.ct_disponibilidade_fds (
  id          uuid primary key default gen_random_uuid(),
  competencia text not null,                 -- 'YYYY-MM' do mês sendo montado
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  coach_id    uuid not null references public.coaches(id) on delete cascade,
  data        date not null,
  criado_por  uuid,
  criado_em   timestamptz default now(),
  unique (unidade_id, coach_id, data)
);

create index idx_ct_disp_fds_data on public.ct_disponibilidade_fds(unidade_id, data);
create index idx_ct_disp_fds_coach on public.ct_disponibilidade_fds(coach_id);

alter table public.ct_disponibilidade_fds enable row level security;

-- Mesma regra da escala_fds: admin, recepção e coordenadora gerenciam.
create policy "equipe_ct_disp_fds" on public.ct_disponibilidade_fds
  for all
  using (
    (select perfis.role from public.perfis where perfis.id = auth.uid())
      = any (array['admin'::text, 'recepcao'::text, 'coordenadora'::text])
  )
  with check (
    (select perfis.role from public.perfis where perfis.id = auth.uid())
      = any (array['admin'::text, 'recepcao'::text, 'coordenadora'::text])
  );
