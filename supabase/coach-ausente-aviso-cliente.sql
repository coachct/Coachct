-- Coach ausente → cliente PRO continua agendado, sem coach, com aviso no painel.
-- Quando entra um período em coach_ferias (férias/ausência manual ou encerramento),
-- os agendamentos futuros em que o PRÓPRIO CLIENTE escolheu esse coach
-- (alocado_por = clientes.user_id) perdem o coach e ganham o aviso.
-- Alocações feitas pela recepção/admin NÃO são tocadas (fluxo atual intacto).
--
-- Sem FK em coach_ausente_id de propósito: um 2º FK para coaches deixaria
-- ambíguo todo select com embed `coaches(nome)` em agendamentos.

alter table public.agendamentos
  add column if not exists coach_ausente_id uuid,
  add column if not exists coach_ausente_nome text,
  add column if not exists coach_ausente_em timestamptz;

create index if not exists idx_agendamentos_coach_ausente
  on public.agendamentos (cliente_id) where coach_ausente_id is not null;

-- Aplica a ausência de um coach num intervalo. À prova de falha.
create or replace function public.aplicar_coach_ausente(p_coach_id uuid, p_inicio date, p_fim date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_nome text;
  v_qtd integer := 0;
begin
  if p_coach_id is null or p_inicio is null or p_fim is null then return 0; end if;
  select nome into v_nome from coaches where id = p_coach_id;

  update agendamentos a
     set coach_ausente_id   = a.coach_id,
         coach_ausente_nome = v_nome,
         coach_ausente_em   = now(),
         coach_id           = null
    from clientes c
   where c.id = a.cliente_id
     and a.coach_id = p_coach_id
     and a.alocado_por = c.user_id
     and a.status in ('agendado', 'confirmado')
     and a.data between greatest(p_inicio, v_hoje) and p_fim;
  get diagnostics v_qtd = row_count;
  return v_qtd;
exception when others then
  return 0;
end $$;

create or replace function public.trg_coach_ferias_avisa_clientes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.aplicar_coach_ausente(new.coach_id, new.data_inicio, new.data_fim);
  return new;
exception when others then
  return new; -- nunca derruba o lançamento da ausência
end $$;

drop trigger if exists on_coach_ferias_avisa_clientes on public.coach_ferias;
create trigger on_coach_ferias_avisa_clientes
  after insert or update of data_inicio, data_fim, coach_id on public.coach_ferias
  for each row execute function public.trg_coach_ferias_avisa_clientes();

-- Cliente resolve o aviso: escolhe outro coach livre no horário, ou fica sem coach (p_coach_id null).
create or replace function public.resolver_coach_ausente_cliente(p_agendamento_id uuid, p_coach_id uuid)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_ag agendamentos%rowtype;
begin
  select a.* into v_ag from agendamentos a
    join clientes c on c.id = a.cliente_id
   where a.id = p_agendamento_id and c.user_id = auth.uid();
  if not found then return json_build_object('ok', false, 'erro', 'NAO_ENCONTRADO'); end if;
  if v_ag.coach_ausente_id is null then return json_build_object('ok', true); end if;
  if v_ag.status not in ('agendado', 'confirmado') then return json_build_object('ok', false, 'erro', 'STATUS'); end if;

  if p_coach_id is not null then
    if not exists (select 1 from coaches where id = p_coach_id and ativo)
       or exists (select 1 from coach_ferias f where f.coach_id = p_coach_id and v_ag.data between f.data_inicio and f.data_fim)
       or exists (select 1 from agendamentos o where o.data = v_ag.data and o.horario = v_ag.horario
                    and o.unidade_id = v_ag.unidade_id and o.status <> 'cancelado'
                    and o.coach_id = p_coach_id and o.id <> v_ag.id)
    then
      return json_build_object('ok', false, 'erro', 'COACH_INDISPONIVEL');
    end if;
  end if;

  update agendamentos
     set coach_id = p_coach_id,
         alocado_por = case when p_coach_id is null then alocado_por else auth.uid() end,
         alocado_em  = case when p_coach_id is null then alocado_em else now() end,
         coach_ausente_id = null, coach_ausente_nome = null, coach_ausente_em = null
   where id = v_ag.id;
  return json_build_object('ok', true);
end $$;

revoke all on function public.aplicar_coach_ausente(uuid, date, date) from public, anon, authenticated;
grant execute on function public.resolver_coach_ausente_cliente(uuid, uuid) to authenticated;

-- Backfill: ausências já lançadas que pegam agendamentos futuros escolhidos pelo cliente.
select public.aplicar_coach_ausente(f.coach_id, f.data_inicio, f.data_fim)
  from public.coach_ferias f
 where f.data_fim >= (now() at time zone 'America/Sao_Paulo')::date;
