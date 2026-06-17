-- =============================================
-- AGENTE WHATSAPP — controle de atendimento humano
-- =============================================
-- Permite que um atendente (admin/coordenadora) "assuma" uma conversa: enquanto
-- modo_humano = true para aquele telefone, o webhook NÃO aciona o agente (só
-- guarda a mensagem recebida) e o atendente responde pelo painel /admin/conversas.
-- Aditivo e idempotente. Rodar no SQL Editor do Supabase.

create table if not exists public.whatsapp_controle (
  telefone      text primary key,            -- número normalizado (DDD+num)
  modo_humano   boolean not null default false,
  atualizado_em timestamptz default now()
);

alter table public.whatsapp_controle enable row level security;

-- Admin e coordenadora gerenciam (o webhook usa service role e bypassa RLS).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='whatsapp_controle' and policyname='Admin e coordenadora gerenciam controle WhatsApp'
  ) then
    create policy "Admin e coordenadora gerenciam controle WhatsApp" on public.whatsapp_controle
      for all using (
        exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
      ) with check (
        exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
      );
  end if;
end $$;

-- Distingue quem mandou a resposta de saída: 'bot' (agente) ou 'humano' (atendente).
-- Mensagens antigas ficam null = tratadas como bot.
alter table public.whatsapp_mensagens add column if not exists autor text;
