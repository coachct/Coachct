-- Rotina de cobrança automática de no-show (22h SP, /api/noshow/cobrar-automatico).
-- Cada falta que a rotina olha vira uma linha aqui (simulada, cobrada, recusada ou pulada).
create table if not exists public.noshow_auto_log (
  id            uuid primary key default gen_random_uuid(),
  executado_em  timestamptz not null default now(),
  data_ref      date not null,
  modo          text not null check (modo in ('simulacao','cobranca')),
  origem        text not null check (origem in ('ct','club')),
  ref_id        uuid not null,
  cliente_id    uuid,
  cliente_nome  text,
  valor         numeric(10,2),
  resultado     text not null check (resultado in ('simulado','cobrado','recusado','pulado','erro')),
  motivo        text,
  order_id      text
);
create index if not exists noshow_auto_log_data_idx on public.noshow_auto_log (data_ref desc);
create index if not exists noshow_auto_log_ref_idx  on public.noshow_auto_log (ref_id);

alter table public.noshow_auto_log enable row level security;
drop policy if exists noshow_auto_log_admin_select on public.noshow_auto_log;
create policy noshow_auto_log_admin_select on public.noshow_auto_log
  for select using (exists (select 1 from perfis where perfis.id = auth.uid() and perfis.role in ('admin','coordenadora')));
revoke insert, update, delete on public.noshow_auto_log from anon, authenticated;
