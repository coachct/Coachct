-- =============================================
-- AGENTE INSTAGRAM (Direct) — histórico de mensagens
-- =============================================
-- Guarda o ida-e-volta das DMs do Instagram (contexto curto do agente "só
-- informação"). Identificação por IGSID (id do usuário no Instagram; não há
-- telefone/CPF — é só informação pública). Aditivo/idempotente.

create table if not exists public.instagram_mensagens (
  id          uuid default uuid_generate_v4() primary key,
  igsid       text not null,                          -- id do usuário no Instagram
  role        text not null check (role in ('user', 'assistant')),
  conteudo    text not null,
  criado_em   timestamptz default now()
);

create index if not exists idx_instagram_msg on public.instagram_mensagens(igsid, criado_em);

alter table public.instagram_mensagens enable row level security;

-- Escrita pelo webhook (service role, bypassa RLS). Leitura: admin e coordenadora.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='instagram_mensagens' and policyname='Admin e coordenadora veem mensagens Instagram'
  ) then
    create policy "Admin e coordenadora veem mensagens Instagram" on public.instagram_mensagens
      for select using (
        exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
      );
  end if;
end $$;
