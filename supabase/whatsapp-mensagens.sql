-- =============================================
-- AGENTE WHATSAPP — Histórico de mensagens
-- =============================================
-- Guarda o ida-e-volta da conversa (pro agente lembrar do contexto entre
-- mensagens) e atende a retenção da LGPD. Aditivo/idempotente.

create table if not exists public.whatsapp_mensagens (
  id          uuid default uuid_generate_v4() primary key,
  telefone    text not null,                         -- número normalizado (DDD+num)
  cliente_id  uuid references public.clientes on delete set null,
  role        text not null check (role in ('user', 'assistant')),
  conteudo    text not null,
  criado_em   timestamptz default now()
);

create index if not exists idx_whatsapp_msg_tel on public.whatsapp_mensagens(telefone, criado_em);

alter table public.whatsapp_mensagens enable row level security;

-- Escrita pelo webhook (service role, bypassa RLS). Leitura só admin.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='whatsapp_mensagens' and policyname='Admin vê mensagens WhatsApp'
  ) then
    create policy "Admin vê mensagens WhatsApp" on public.whatsapp_mensagens
      for select using (
        exists (select 1 from public.perfis where id = auth.uid() and role = 'admin')
      );
  end if;
end $$;
