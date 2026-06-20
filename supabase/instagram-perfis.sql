-- =============================================
-- AGENTE INSTAGRAM — cache de perfis (nome / @usuário)
-- =============================================
-- O Instagram só nos dá o IGSID (id interno). A User Profile API permite obter
-- nome e @usuário de quem nos mandou DM. Cacheamos aqui para o painel mostrar
-- o nome em vez de só números. Aditivo/idempotente.

create table if not exists public.instagram_perfis (
  igsid         text primary key,
  username      text,
  nome          text,
  atualizado_em timestamptz default now()
);

alter table public.instagram_perfis enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='instagram_perfis' and policyname='Admin e coordenadora veem perfis Instagram'
  ) then
    create policy "Admin e coordenadora veem perfis Instagram" on public.instagram_perfis
      for select using (
        exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
      );
  end if;
end $$;
