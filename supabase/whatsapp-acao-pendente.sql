-- =============================================
-- AGENTE WHATSAPP — ação pendente (memória do "Confirmar")
-- =============================================
-- Quando o agente pede o "sim" final (agendar, cancelar, reservar, fila), o
-- contexto de QUAL ação confirmar não sobrevivia entre as mensagens (o histórico
-- só guarda texto, não as tool calls). Resultado: ao receber "Confirmar", o agente
-- não sabia mais o que executar e ficava re-perguntando (loop de confirmação).
--
-- Esta tabela guarda, por telefone, a ação aguardando confirmação (acao + params).
-- O webhook grava ao enviar os botões e, na resposta seguinte do cliente (clique
-- OU texto "sim"), executa a ação de forma determinística — fora do modelo.
--
-- Uma linha por telefone (primary key): um novo pedido de confirmação substitui o
-- anterior. Aditivo e idempotente. Rodar no SQL Editor do Supabase.

create table if not exists public.whatsapp_acao_pendente (
  telefone   text primary key,          -- número normalizado (DDD+num)
  cliente_id uuid,                       -- cliente para quem a ação foi montada
  acao       text not null,             -- ex.: cancelar_agendamento, agendar_treino
  params     jsonb not null default '{}'::jsonb, -- parâmetros da ação (id, data, hora...)
  resumo     text,                       -- texto curto da confirmação (debug)
  criado_em  timestamptz not null default now()
);

alter table public.whatsapp_acao_pendente enable row level security;
-- Sem policies: só o webhook (service role) lê/escreve aqui, e service role bypassa RLS.
