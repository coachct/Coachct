-- =============================================
-- AGENTE WHATSAPP — idempotência de mensagens recebidas
-- =============================================
-- A Meta Cloud API entrega cada webhook "pelo menos uma vez": em latência, retry
-- interno ou reentrega, o MESMO inbound (mesmo wamid) pode chegar duas vezes. Sem
-- trava, o webhook processa de novo → salva a msg do cliente outra vez, chama o
-- agente de novo e envia OUTRA resposta. Resultado: mensagens duplicadas.
--
-- Esta tabela guarda os ids (wamid) já vistos. O webhook insere o wamid ANTES de
-- processar; se o id já existir (conflito na primary key), é reentrega → ignora.
-- A trava fica no banco (atômica), então é segura mesmo com entregas concorrentes.
--
-- Aditivo e idempotente. Rodar no SQL Editor do Supabase.

create table if not exists public.whatsapp_processadas (
  wamid     text primary key,          -- id da mensagem recebida da Meta (wamid...)
  criado_em timestamptz not null default now()
);

-- Acelera a limpeza periódica por data (ver função abaixo).
create index if not exists idx_whatsapp_processadas_criado_em
  on public.whatsapp_processadas (criado_em);

alter table public.whatsapp_processadas enable row level security;
-- Sem policies: só o webhook (service role) escreve aqui, e service role bypassa RLS.

-- Limpeza opcional: a Meta só reentrega dentro de poucos minutos/horas, então não
-- precisamos guardar wamids para sempre. Esta função apaga registros com mais de
-- 7 dias; agende-a num pg_cron se quiser (ex.: 1x por dia). Sem agendamento, a
-- tabela só cresce devagar e não atrapalha a dedup.
create or replace function public.limpar_whatsapp_processadas()
returns void
language sql
as $$
  delete from public.whatsapp_processadas
  where criado_em < now() - interval '7 days';
$$;
