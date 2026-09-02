-- supabase/presenca-reverte-falta-checkin.sql
--
-- CHECK-IN DESFAZ A FALTA (janela de 1h30 do inicio da aula)
--
-- Hoje a falta automatica marca 'falta' 1h depois do inicio da aula
-- (marcar_faltas_automaticas, cron a cada 15 min). Quem chega atrasado e bate o
-- check-in DEPOIS disso fica como no-show mesmo tendo vindo.
--
-- Regra nova: se o check-in do parceiro cai entre o INICIO da aula e o inicio
-- + 1h30, a reserva/agendamento volta para presenca.
--
--   Just Club / Wellhub   -> club_reservas 'falta' -> 'presente'   (NOVO)
--   Just Club / TotalPass -> club_reservas 'falta' -> 'presente'   (ja existia
--                            com 30 min; passa para 1h30)
--   Coach CT              -> agendamentos 'falta' -> 'realizado'   (NOVO)
--
-- DECISAO (Ricardo, 02/09/2026): reverte QUALQUER falta, inclusive a que a
-- recepcao marcou na mao. O check-in prevalece — quem bateu, veio.
--
-- ISOLAMENTO (regra: nao interferir no fluxo atual):
--   * Nao mexe em credito: 'falta' e 'presente'/'realizado' consomem igual
--     (os triggers de credito so reagem a 'cancelado').
--   * Nao cobra, nao valida no parceiro, nao toca reserva/pagamento.
--   * Roda dentro das RPCs de presenca que ja existem, chamadas pos-200 nos
--     webhooks (waitUntil) e pelo cron — se falhar, o check-in segue normal.
--   * Toda reversao fica em presenca_reversao_log (auditoria).
--
-- POR QUE p_checkin_em: a conciliacao do Wellhub reprocessa os check-ins das
-- ultimas 6h a cada 2 min. Se a janela de 1h30 fosse medida contra now(), um
-- check-in das 7h reprocessado as 9h30 desfaria a falta da aula das 8h30 —
-- exatamente o bug de presenca em aula errada corrigido em 26/08/2026. Por isso
-- a janela e medida contra o MOMENTO DO CHECK-IN, nao contra o "agora".
--
-- EFEITO OPERACIONAL: reserva revertida sai da tela admin/cobranca-noshow.

-- ---------------------------------------------------------------------------
-- 1) Log de auditoria das reversoes
-- ---------------------------------------------------------------------------
create table if not exists public.presenca_reversao_log (
  id              uuid primary key default gen_random_uuid(),
  origem          text not null check (origem in ('club','ct')),
  registro_id     uuid not null,
  cliente_id      uuid,
  inicio_aula     timestamp not null,
  status_anterior text not null,
  parceiro        text,
  checkin_em      timestamp not null,
  revertido_em    timestamptz not null default now()
);

create index if not exists idx_presenca_reversao_revertido on public.presenca_reversao_log (revertido_em desc);
create index if not exists idx_presenca_reversao_registro  on public.presenca_reversao_log (registro_id);
create index if not exists idx_presenca_reversao_cliente   on public.presenca_reversao_log (cliente_id);

alter table public.presenca_reversao_log enable row level security;

drop policy if exists presenca_reversao_log_staff_select on public.presenca_reversao_log;
create policy presenca_reversao_log_staff_select on public.presenca_reversao_log
  for select using (eh_staff());

-- ---------------------------------------------------------------------------
-- 2) Just Club / Wellhub
-- ---------------------------------------------------------------------------
-- Assinatura ganha p_checkin_em (com DEFAULT). O receiver continua chamando com
-- 4 parametros; a conciliacao passa o recebido_em do check-in.
drop function if exists public.wellhub_marcar_presenca_por_checkin(text, text, text, text);

create or replace function public.wellhub_marcar_presenca_por_checkin(
  p_gympass_id text,
  p_gym_id     text,
  p_email      text        default null,
  p_nome       text        default null,
  p_checkin_em timestamptz default null
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_unidade  uuid;
  v_cliente  uuid;
  v_ids      uuid[];
  v_checkin  timestamp := coalesce(p_checkin_em at time zone 'America/Sao_Paulo',
                                   now()        at time zone 'America/Sao_Paulo');
  v_hoje     date      := v_checkin::date;
  v_janela   interval  := interval '90 minutes';
  v_marcadas integer   := 0;
begin
  select id into v_unidade from unidades where wellhub_gym_id = p_gym_id;
  if v_unidade is null then return 0; end if;

  -- Tier 1: identidade forte (wellhub_id ou email) ENTRE as reservas de hoje.
  -- 'falta' entra na busca: sem isso a pessoa que ja levou falta nem seria
  -- identificada.
  select array_agg(distinct r.cliente_id) into v_ids
  from club_reservas r
  join club_ocorrencias o on o.id = r.ocorrencia_id
  join club_aulas a       on a.id = o.aula_id
  join clientes c         on c.id = r.cliente_id
  where a.unidade_id = v_unidade and o.data = v_hoje
    and r.status in ('reservado','falta') and r.tipo_credito ilike 'wellhub%'
    and ( c.wellhub_id = p_gympass_id
          or (coalesce(p_email,'') <> '' and (lower(c.email) = lower(p_email) or lower(c.wellhub_email) = lower(p_email))) );
  if array_length(v_ids,1) = 1 then v_cliente := v_ids[1]; end if;

  -- Tier 2: por nome (unico) entre as reservas de hoje
  if v_cliente is null and coalesce(p_nome,'') <> '' then
    select array_agg(distinct r.cliente_id) into v_ids
    from club_reservas r
    join club_ocorrencias o on o.id = r.ocorrencia_id
    join club_aulas a       on a.id = o.aula_id
    join clientes c         on c.id = r.cliente_id
    where a.unidade_id = v_unidade and o.data = v_hoje
      and r.status in ('reservado','falta') and r.tipo_credito ilike 'wellhub%'
      and lower(c.nome) = lower(p_nome);
    if array_length(v_ids,1) = 1 then v_cliente := v_ids[1]; end if;
  end if;

  if v_cliente is null then return 0; end if;

  -- self-heal: wellhub_id so na conta certa (limpa de fantasmas)
  update clientes set wellhub_id = null where wellhub_id = p_gympass_id and id <> v_cliente;
  update clientes set wellhub_id = p_gympass_id where id = v_cliente and coalesce(wellhub_id,'') <> p_gympass_id;

  with alvo as (
    select r.id,
           r.status              as status_ant,
           (o.data + a.horario)  as inicio
    from club_reservas r
    join club_ocorrencias o on o.id = r.ocorrencia_id
    join club_aulas a       on a.id = o.aula_id
    where r.cliente_id = v_cliente and a.unidade_id = v_unidade
      and o.data = v_hoje and r.tipo_credito ilike 'wellhub%'
      and (
        -- fluxo atual, inalterado: reserva pendente na janela -3h / +1h
        ( r.status = 'reservado'
          and (o.data + a.horario) between v_checkin - interval '3 hours'
                                       and v_checkin + interval '1 hour' )
        or
        -- NOVO: atrasado — a aula ja comecou e a falta pegou antes do check-in
        ( r.status = 'falta'
          and v_checkin >= (o.data + a.horario)
          and v_checkin <= (o.data + a.horario) + v_janela )
      )
  ),
  upd as (
    update club_reservas r set status = 'presente'
    from alvo
    where r.id = alvo.id and r.status in ('reservado','falta')
    returning r.id, r.cliente_id, alvo.inicio, alvo.status_ant
  ),
  ins as (
    insert into presenca_reversao_log
      (origem, registro_id, cliente_id, inicio_aula, status_anterior, parceiro, checkin_em)
    select 'club', u.id, u.cliente_id, u.inicio, u.status_ant, 'wellhub', v_checkin
    from upd u where u.status_ant = 'falta'
    returning 1
  )
  select count(*) into v_marcadas from upd;

  return v_marcadas;
end $function$;

-- A conciliacao passa a informar QUANDO o check-in aconteceu.
create or replace function public.wellhub_conciliar_presencas(p_janela_horas integer default 6)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_marcadas integer := 0; v_rec record; v_r integer;
begin
  for v_rec in
    select e.id_externo as gympass_id,
           (e.raw->'event_data'->'gym'->>'id') as gym_id,
           (e.raw->'event_data'->'user'->>'email') as email,
           nullif(trim(coalesce(e.raw->'event_data'->'user'->>'first_name','') || ' ' ||
                       coalesce(e.raw->'event_data'->'user'->>'last_name','')), '') as nome,
           e.recebido_em
    from entradas_walkin e
    where e.origem = 'wellhub' and e.status <> 'erro'
      and e.recebido_em > now() - make_interval(hours => p_janela_horas)
      -- so check-in do proprio dia (SP): evita que um check-in da noite anterior
      -- seja reprocessado depois da virada e caia na reserva do dia seguinte
      and (e.recebido_em at time zone 'America/Sao_Paulo')::date
          = (now() at time zone 'America/Sao_Paulo')::date
  loop
    v_r := wellhub_marcar_presenca_por_checkin(
             v_rec.gympass_id, v_rec.gym_id, v_rec.email, v_rec.nome, v_rec.recebido_em);
    v_marcadas := v_marcadas + coalesce(v_r, 0);
  end loop;
  return v_marcadas;
end $function$;

-- ---------------------------------------------------------------------------
-- 3) Just Club / TotalPass  (tolerancia 30 min -> 1h30)
-- ---------------------------------------------------------------------------
drop function if exists public.totalpass_marcar_presenca_por_checkin(text);

create or replace function public.totalpass_marcar_presenca_por_checkin(
  p_cpf        text,
  p_checkin_em timestamptz default null
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_checkin  timestamp := coalesce(p_checkin_em at time zone 'America/Sao_Paulo',
                                   now()        at time zone 'America/Sao_Paulo');
  v_hoje     date      := v_checkin::date;
  v_cpf      text      := regexp_replace(coalesce(p_cpf,''), '\D', '', 'g');
  v_janela   interval  := interval '90 minutes';
  v_marcadas int := 0;
begin
  if v_cpf = '' then
    return 0;
  end if;

  with alvo as (
    select r.id,
           r.status             as status_ant,
           (o.data + a.horario) as inicio
    from club_reservas r
    join club_ocorrencias o on o.id = r.ocorrencia_id
    join club_aulas a       on a.id = o.aula_id
    join clientes c         on c.id = r.cliente_id
    where regexp_replace(coalesce(c.cpf,''), '\D', '', 'g') = v_cpf
      and o.data = v_hoje
      and r.tipo_credito ilike 'totalpass%'
      and (
        ( r.status = 'reservado'
          and (o.data + a.horario) between v_checkin - interval '3 hours'
                                       and v_checkin + interval '2 hours' )
        or
        -- atraso: aula ja comecou e a falta pegou antes do check-in (1h30)
        ( r.status = 'falta'
          and v_checkin >= (o.data + a.horario)
          and v_checkin <= (o.data + a.horario) + v_janela )
      )
  ),
  upd as (
    update club_reservas r set status = 'presente'
    from alvo
    where r.id = alvo.id and r.status in ('reservado','falta')
    returning r.id, r.cliente_id, alvo.inicio, alvo.status_ant
  ),
  ins as (
    insert into presenca_reversao_log
      (origem, registro_id, cliente_id, inicio_aula, status_anterior, parceiro, checkin_em)
    select 'club', u.id, u.cliente_id, u.inicio, u.status_ant, 'totalpass', v_checkin
    from upd u where u.status_ant = 'falta'
    returning 1
  )
  select count(*) into v_marcadas from upd;

  return v_marcadas;
end $function$;

-- ---------------------------------------------------------------------------
-- 4) Coach CT
-- ---------------------------------------------------------------------------
drop function if exists public.coach_ct_presenca_por_checkin(text, text, text, text, text, text);

create or replace function public.coach_ct_presenca_por_checkin(
  p_origem     text,
  p_cpf        text        default null,
  p_wellhub_id text        default null,
  p_email      text        default null,
  p_nome       text        default null,
  p_modo       text        default 'personal',
  p_checkin_em timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_unidade   uuid := 'c28bf4bb-56f8-44ff-818a-c7836e58bcef';
  v_cliente   uuid;
  v_ids       uuid[];
  v_checkin   timestamp := coalesce(p_checkin_em at time zone 'America/Sao_Paulo',
                                    now()        at time zone 'America/Sao_Paulo');
  v_hoje      date      := v_checkin::date;
  v_hora      time      := v_checkin::time;
  v_janela    interval  := interval '90 minutes';
  v_ag        uuid;
  v_status    text;
  v_inicio    timestamp;
  v_cli_ag    uuid;
begin
  if p_origem = 'totalpass' then
    -- 1) casa por CPF
    if coalesce(p_cpf,'') <> '' then
      select id into v_cliente from clientes
       where regexp_replace(coalesce(cpf,''),'\D','','g') = regexp_replace(p_cpf,'\D','','g')
         and regexp_replace(p_cpf,'\D','','g') <> ''
       limit 1;
    end if;
    -- 2) fallback por nome (cliente sem CPF cadastrado), entre os agendamentos CT de hoje
    if v_cliente is null and coalesce(p_nome,'') <> '' then
      select array_agg(distinct a.cliente_id) into v_ids
      from agendamentos a
      join clientes c on c.id = a.cliente_id
      where a.unidade_id = v_unidade and a.data = v_hoje
        and a.status in ('agendado','confirmado','falta')
        and a.tipo_credito ilike 'totalpass%'
        and lower(c.nome) = lower(p_nome);
      if array_length(v_ids,1) = 1 then v_cliente := v_ids[1]; end if;
    end if;
    -- 3) backfill do CPF quando casou por nome e o cadastro esta sem CPF (self-heal)
    if v_cliente is not null and coalesce(p_cpf,'') <> '' then
      update clientes set cpf = p_cpf
       where id = v_cliente
         and (cpf is null or regexp_replace(cpf,'\D','','g') = '');
    end if;
  else -- wellhub
    if coalesce(p_wellhub_id,'') <> '' then
      select id into v_cliente from clientes where wellhub_id = p_wellhub_id limit 1;
    end if;
    if v_cliente is null and coalesce(p_email,'') <> '' then
      select id into v_cliente from clientes
       where lower(email) = lower(p_email) or lower(wellhub_email) = lower(p_email)
       limit 1;
    end if;
    if v_cliente is null and coalesce(p_nome,'') <> '' then
      select array_agg(distinct a.cliente_id) into v_ids
      from agendamentos a
      join clientes c on c.id = a.cliente_id
      where a.unidade_id = v_unidade and a.data = v_hoje
        and a.status in ('agendado','confirmado','falta')
        and a.tipo_credito ilike 'wellhub%'
        and lower(c.nome) = lower(p_nome);
      if array_length(v_ids,1) = 1 then v_cliente := v_ids[1]; end if;
    end if;
    if v_cliente is not null and coalesce(p_wellhub_id,'') <> '' then
      update clientes set wellhub_id = p_wellhub_id
       where id = v_cliente and coalesce(wellhub_id,'') <> p_wellhub_id;
    end if;
  end if;

  if v_cliente is null then return null; end if;

  -- Agendamento do dia mais proximo do check-in. 'falta' so entra se o check-in
  -- caiu dentro de 1h30 do inicio daquela aula.
  select a.id, a.status, a.cliente_id, (a.data + a.horario)
    into v_ag, v_status, v_cli_ag, v_inicio
  from agendamentos a
  where a.cliente_id = v_cliente
    and a.unidade_id = v_unidade
    and a.data = v_hoje
    and (
      a.status in ('agendado','confirmado')
      or ( a.status = 'falta'
           and v_checkin >= (a.data + a.horario)
           and v_checkin <= (a.data + a.horario) + v_janela )
    )
  order by abs(extract(epoch from (a.horario - v_hora)))
  limit 1;

  if v_ag is null then return null; end if;

  if p_modo = 'walkin' then
    -- so sinaliza pra recepcao; NUNCA muda status nem desfaz falta
    update agendamentos
       set checkin_modo_errado = true, checkin_modo_errado_em = now()
     where id = v_ag and status in ('agendado','confirmado','falta');
    return v_ag;
  end if;

  update agendamentos
     set status = 'realizado',
         presenca_checkin = true,
         presenca_checkin_em = now(),
         presenca_checkin_origem = p_origem,
         checkin_modo_errado = false
   where id = v_ag and status in ('agendado','confirmado','falta');

  if v_status = 'falta' then
    insert into presenca_reversao_log
      (origem, registro_id, cliente_id, inicio_aula, status_anterior, parceiro, checkin_em)
    values ('ct', v_ag, v_cli_ag, v_inicio, 'falta', p_origem, v_checkin);
  end if;

  return v_ag;
end $function$;

-- ---------------------------------------------------------------------------
-- 5) Permissoes
-- ---------------------------------------------------------------------------
-- As tres funcoes ja tinham EXECUTE para PUBLIC/anon/authenticated/service_role.
-- O CREATE recria com o mesmo default (PUBLIC), entao NADA muda de permissao —
-- de proposito: mexer nisso agora poderia quebrar alguma tela que chama a RPC
-- com a chave anon (regra: nao interferir no fluxo atual).
