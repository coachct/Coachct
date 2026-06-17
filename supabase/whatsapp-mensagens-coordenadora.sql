-- =============================================
-- AGENTE WHATSAPP — leitura das mensagens pela COORDENADORA
-- =============================================
-- A tabela whatsapp_mensagens já tinha policy de leitura só para admin.
-- Aqui liberamos também a coordenadora (mesma dupla que acessa /admin).
-- Aditivo e idempotente. Rodar no SQL Editor do Supabase.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='whatsapp_mensagens' and policyname='Coordenadora vê mensagens WhatsApp'
  ) then
    create policy "Coordenadora vê mensagens WhatsApp" on public.whatsapp_mensagens
      for select using (
        exists (select 1 from public.perfis where id = auth.uid() and role = 'coordenadora')
      );
  end if;
end $$;
