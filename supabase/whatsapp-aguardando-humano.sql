-- =============================================
-- AGENTE WHATSAPP — sinalizador "aguardando atendimento humano"
-- =============================================
-- Marca conversas em que o cliente PEDIU para falar com um atendente, para
-- aparecerem destacadas no painel /admin/conversas (contador + badge).
-- O bot continua respondendo normalmente; isto é só um alerta visual pra equipe.
-- Aditivo/idempotente. Rodar no SQL Editor do Supabase.

alter table public.whatsapp_controle add column if not exists aguardando_humano boolean not null default false;
alter table public.whatsapp_controle add column if not exists aguardando_em timestamptz;
