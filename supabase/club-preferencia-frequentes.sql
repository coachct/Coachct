-- Janela preferencial de reserva para clientes frequentes (Club) — 24/11/2026.
--
-- Aulas inaugurais do Running & Hybrid de domingo 29/11/2026 (09:15 e 10:30, Vila Olímpia):
--   25/11 19:00 SP  aulas entram no site (job hibrido-domingo-abre-2511 ativa as club_aulas)
--   até 26/11 12:00 só reserva / entra na fila quem tem 4+ presenças nos últimos 2 meses
--                   (Club 'presente' + Coach CT 'realizado'; presença da conta ClassPass não conta)
--   26/11 12:00 SP  a trava expira sozinha (libera_em) e as aulas vão pro TotalPass
--                   (job hibrido-domingo-totalpass-2611 devolve vagas_totalpass)
-- Admin passa pela trava; recepção não. Reserva que nasce no app do parceiro passa
-- (mesma regra da trava de capacidade), mas na janela a aula nem está publicada lá.
--
-- A trava só existe para ocorrência listada em club_preferencia_janela: qualquer outra
-- aula segue exatamente como antes.

create table if not exists public.club_preferencia_janela (
  ocorrencia_id uuid primary key references public.club_ocorrencias(id) on delete cascade,
  libera_em     timestamptz not null,
  min_presencas int not null,
  meses         int not null,
  criado_em     timestamptz not null default now()
);
alter table public.club_preferencia_janela enable row level security;

-- true = esta reserva deve ser barrada agora (janela aberta, quem pede não é admin e o
-- cliente não tem as presenças mínimas no período).
create or replace function public.club_preferencia_barra(p_ocorrencia_id uuid, p_cliente_id uuid)
returns boolean
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_j     club_preferencia_janela%rowtype;
  v_desde date;
  v_n     int;
begin
  select * into v_j from club_preferencia_janela where ocorrencia_id = p_ocorrencia_id;
  if not found or now() >= v_j.libera_em then return false; end if;

  if exists (select 1 from perfis where id = (select auth.uid()) and role = 'admin') then
    return false;
  end if;

  if p_cliente_id is null then return true; end if;

  v_desde := ((now() at time zone 'America/Sao_Paulo')::date - make_interval(months => v_j.meses))::date;

  select
    (select count(*) from club_reservas r
       join club_ocorrencias o on o.id = r.ocorrencia_id
      where r.cliente_id = p_cliente_id and r.status = 'presente'
        and r.classpass_nome is null and o.data >= v_desde)
    +
    (select count(*) from agendamentos a
      where a.cliente_id = p_cliente_id and a.status = 'realizado' and a.data >= v_desde)
  into v_n;

  return v_n < v_j.min_presencas;
end $$;
revoke all on function public.club_preferencia_barra(uuid, uuid) from public, anon, authenticated;

create or replace function public.club_preferencia_trava_reserva()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.via_app, false) or new.criado_via in ('wellhub','totalpass') then
    return new;
  end if;
  if new.status not in ('reservado','presente') then return new; end if;
  if tg_op = 'UPDATE' and old.ocorrencia_id = new.ocorrencia_id
     and old.status in ('reservado','presente') then
    return new;
  end if;

  if public.club_preferencia_barra(new.ocorrencia_id, new.cliente_id) then
    raise exception 'PREFERENCIA_FREQUENTES: Ops, somente clientes Just frequentes, possuem preferencia de agendamento até dia 26/11 às 12:00. Após isso, todos conseguem agendar livremente.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_club_preferencia_reserva on public.club_reservas;
create trigger trg_club_preferencia_reserva
  before insert or update of ocorrencia_id, status on public.club_reservas
  for each row execute function public.club_preferencia_trava_reserva();

create or replace function public.club_preferencia_trava_fila()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.ocorrencia_id is null then return new; end if;
  if public.club_preferencia_barra(new.ocorrencia_id, new.cliente_id) then
    raise exception 'PREFERENCIA_FREQUENTES: Ops, somente clientes Just frequentes, possuem preferencia de agendamento até dia 26/11 às 12:00. Após isso, todos conseguem agendar livremente.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_club_preferencia_fila on public.fila_espera;
create trigger trg_club_preferencia_fila
  before insert on public.fila_espera
  for each row execute function public.club_preferencia_trava_fila();

-- Para o site avisar no clique em "Reservar": ocorrências em janela que barram quem está logado.
create or replace function public.club_preferencia_minhas_barradas()
returns table(ocorrencia_id uuid, libera_em timestamptz)
language sql stable security definer
set search_path to 'public'
as $$
  select j.ocorrencia_id, j.libera_em
    from club_preferencia_janela j
   where now() < j.libera_em
     and public.club_preferencia_barra(
           j.ocorrencia_id,
           (select c.id from clientes c where c.user_id = (select auth.uid()) limit 1))
$$;
revoke all on function public.club_preferencia_minhas_barradas() from public, anon;
grant execute on function public.club_preferencia_minhas_barradas() to authenticated;

-- ---------------------------------------------------------------------------
-- Dados: as 2 aulas inaugurais de 29/11 (criadas com club_aulas.ativo = false).
insert into public.club_preferencia_janela (ocorrencia_id, libera_em, min_presencas, meses) values
  ('9de328c7-5408-43c4-9b1c-a3fa72c9c4c6', '2026-11-26 12:00:00-03', 4, 2),
  ('842e89fd-42bf-45c5-af2d-48201b1ea8d2', '2026-11-26 12:00:00-03', 4, 2)
on conflict (ocorrencia_id) do nothing;

-- Fora do TotalPass durante a janela (0 vagas = publish-slots não cria a ocorrência lá).
update public.club_ocorrencias set vagas_totalpass = 0
 where id in ('9de328c7-5408-43c4-9b1c-a3fa72c9c4c6','842e89fd-42bf-45c5-af2d-48201b1ea8d2');

-- Agendamentos (pg_cron, horário GMT). Cada job roda uma vez e se remove.
-- 25/11 19:00 SP (22:00 GMT): as aulas entram no site.
select cron.schedule('hibrido-domingo-abre-2511', '0 22 25 11 *', $job$
  update public.club_aulas set ativo = true
   where id in ('491a5673-7e9a-4699-9c7c-c5afb37be1f1','9acef7d5-08dc-48ca-924d-01dd46678987');
  select cron.unschedule('hibrido-domingo-abre-2511');
$job$);

-- 26/11 11:59 SP (14:59 GMT): devolve as vagas do TotalPass, a tempo do publish-slots das 12:00.
select cron.schedule('hibrido-domingo-totalpass-2611', '59 14 26 11 *', $job$
  update public.club_ocorrencias set vagas_totalpass = null
   where id in ('9de328c7-5408-43c4-9b1c-a3fa72c9c4c6','842e89fd-42bf-45c5-af2d-48201b1ea8d2');
  select cron.unschedule('hibrido-domingo-totalpass-2611');
$job$);
