-- =============================================
-- AGENTE INSTAGRAM — controle de atendimento humano + autor
-- =============================================
-- Permite que um atendente (admin/coordenadora) "assuma" uma conversa do Direct:
-- enquanto modo_humano = true para aquele igsid, o webhook do Instagram NÃO
-- aciona o agente (só guarda a mensagem) e o atendente responde pelo painel.
-- Aditivo/idempotente. Rodar no SQL Editor do Supabase.

create table if not exists public.instagram_controle (
  igsid         text primary key,
  modo_humano   boolean not null default false,
  atualizado_em timestamptz default now()
);

alter table public.instagram_controle enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='instagram_controle' and policyname='Admin e coordenadora gerenciam controle Instagram'
  ) then
    create policy "Admin e coordenadora gerenciam controle Instagram" on public.instagram_controle
      for all using (
        exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
      ) with check (
        exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
      );
  end if;
end $$;

-- Distingue a resposta de saída: 'bot' (agente) ou 'humano' (atendente). Nulo = bot.
alter table public.instagram_mensagens add column if not exists autor text;
