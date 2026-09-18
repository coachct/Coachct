-- Respostas "Não" ao popup de aviso de faltas em /agendar.
-- Insert só via API (/api/notificacoes/aviso-faltas-resposta, service role);
-- staff vê e marca resolvido no card do dashboard admin.
-- APLICADA no Supabase em 17/09/2026.
create table if not exists public.avisos_faltas_respostas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  data_tentada date,
  hora_tentada text,
  unidade text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid
);
create index if not exists avisos_faltas_respostas_cliente_id_idx on public.avisos_faltas_respostas(cliente_id);
create index if not exists avisos_faltas_respostas_abertos_idx on public.avisos_faltas_respostas(criado_em) where resolvido_em is null;
alter table public.avisos_faltas_respostas enable row level security;
create policy avisos_faltas_respostas_staff_select on public.avisos_faltas_respostas for select using (eh_staff());
create policy avisos_faltas_respostas_staff_update on public.avisos_faltas_respostas for update using (eh_staff()) with check (eh_staff());
