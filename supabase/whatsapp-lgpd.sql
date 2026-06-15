-- =============================================
-- AGENTE WHATSAPP — Campos e tabelas de LGPD
-- =============================================
-- Aditivo e idempotente: seguro rodar mais de uma vez.
-- Rodar no SQL Editor do Supabase.
--
-- Contexto: o agente de WhatsApp da Just CT acessa dados cadastrais do
-- cliente (nome, plano, agendamentos, créditos) para atender. A LGPD exige:
--   1) registrar o consentimento do titular;
--   2) auditar o acesso a dados sensíveis;
--   3) permitir opt-out ("PARAR").
-- =============================================

-- ---------------------------------------------
-- 1) Consentimento e preferências na tabela clientes
-- ---------------------------------------------
alter table public.clientes
  add column if not exists lgpd_consentimento_em timestamptz,
  add column if not exists lgpd_canal            text,     -- 'whatsapp' | 'web' | 'recepcao'
  add column if not exists marketing_opt_in      boolean not null default false,
  add column if not exists whatsapp_opt_out       boolean not null default false; -- comando PARAR: bloqueia TODAS as mensagens

-- Restringe os valores aceitos em lgpd_canal sem quebrar linhas já existentes (NULL é permitido).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clientes_lgpd_canal_check'
  ) then
    alter table public.clientes
      add constraint clientes_lgpd_canal_check
      check (lgpd_canal is null or lgpd_canal in ('whatsapp', 'web', 'recepcao'));
  end if;
end $$;

-- ---------------------------------------------
-- 2) Auditoria de acesso a dados sensíveis (lgpd_logs)
-- ---------------------------------------------
-- Cada vez que o agente lê/usa dados do cliente, grava uma linha aqui.
-- O telefone é guardado solto para cobrir o caso de número ainda não
-- vinculado a um cliente (primeira mensagem, antes do cadastro).
create table if not exists public.lgpd_logs (
  id          uuid default uuid_generate_v4() primary key,
  cliente_id  uuid references public.clientes on delete set null,
  telefone    text,
  canal       text not null default 'whatsapp',
  acao        text not null,   -- ex.: 'identificacao', 'consulta_saldo', 'consulta_agendamentos'
  detalhe     jsonb,           -- contexto estruturado (NÃO usar para texto livre da conversa)
  criado_em   timestamptz default now()
);

create index if not exists idx_lgpd_logs_cliente on public.lgpd_logs(cliente_id);
create index if not exists idx_lgpd_logs_criado  on public.lgpd_logs(criado_em desc);

-- RLS: a rota/Edge do webhook escreve com o service role (bypassa RLS).
-- A policy abaixo só libera LEITURA para o admin no painel.
alter table public.lgpd_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lgpd_logs' and policyname = 'Admin vê logs LGPD'
  ) then
    create policy "Admin vê logs LGPD" on public.lgpd_logs
      for select using (
        exists (select 1 from public.perfis where id = auth.uid() and role = 'admin')
      );
  end if;
end $$;
