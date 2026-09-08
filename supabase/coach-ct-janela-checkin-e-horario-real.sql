-- ---------------------------------------------------------------------------
-- Coach CT: janela do check-in + registro de treino em outro horario
-- 08/09/2026
--
-- PROBLEMA (caso Priscila Monique Xavier Hsieh, 08/09):
--   Reserva Coach CT as 19:00, check-in TotalPass (modo Personal) as 05:31.
--   A RPC coach_ct_presenca_por_checkin pegava o agendamento do dia MAIS PROXIMO
--   do check-in sem nenhum limite de distancia -> a reserva da noite virou
--   'realizado' as 05:31, 13h30 antes da aula. A vaga das 19:00 ficou ocupada e
--   a tela nao oferece Cancelar em quem esta 'realizado'.
--   A janela ja existia no Club desde 26/08 (Wellhub -3h/+1h, TotalPass -3h/+2h,
--   ver presenca-parceiro-janela-do-checkin.sql) mas o Coach CT ficou de fora.
--
-- O QUE MUDA
--   1) Colunas novas em agendamentos (aditivo):
--      - checkin_fora_janela / _em      -> aviso pra recepcao
--      - movido_horario_real_*          -> trilha de quem moveu o treino
--   2) coach_ct_presenca_por_checkin: no modo PERSONAL a reserva alvo tem que
--      estar na janela -3h/+2h do check-in. Fora dela nao marca nada e sinaliza.
--
-- O QUE NAO MUDA (de proposito)
--   - modo WALKIN: segue sem janela, identico a hoje. O retorno nao-nulo dessa
--     RPC e o que TRAVA a validacao do parceiro (Coach CT reservado + check-in
--     em Musculacao Livre = nao valida, ver src/lib/totalpass/validar-checkin.ts).
--     Aplicar janela ali mudaria faturamento -> fora de escopo.
--   - reversao de falta: continua so entre o inicio da aula e +1h30 (regra de
--     02/09, presenca-reverte-falta-checkin.sql).
--   - falta automatica: nao muda. Reserva com check-in fora da janela fica
--     pendente e leva falta 1h depois do inicio, como qualquer no-show
--     (decisao do Ricardo em 08/09).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1) Colunas
-- ---------------------------------------------------------------------------
alter table public.agendamentos
  add column if not exists checkin_fora_janela      boolean not null default false,
  add column if not exists checkin_fora_janela_em   timestamptz,
  add column if not exists movido_horario_real_em   timestamptz,
  add column if not exists movido_horario_real_de   time,
  add column if not exists movido_horario_real_por  uuid;

comment on column public.agendamentos.checkin_fora_janela is
  'Cliente bateu check-in no modo Personal longe do horario reservado (fora de -3h/+2h). Nao marca presenca: a recepcao decide se move o treino ou libera a vaga.';
comment on column public.agendamentos.checkin_fora_janela_em is
  'Momento do check-in que caiu fora da janela (hora real do check-in, nao do processamento).';
comment on column public.agendamentos.movido_horario_real_de is
  'Horario original da reserva antes de a recepcao mover o treino para o horario em que ele realmente aconteceu.';

-- ---------------------------------------------------------------------------
-- 2) RPC com janela no modo personal
-- ---------------------------------------------------------------------------
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
  v_janela    interval  := interval '90 minutes';  -- reversao de falta (02/09)
  v_antes     interval  := interval '3 hours';     -- janela do check-in, igual ao Club
  v_depois    interval  := interval '2 hours';
  v_ag        uuid;
  v_status    text;
  v_inicio    timestamp;
  v_cli_ag    uuid;
  v_pendente  uuid;
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

  -- -------------------------------------------------------------------------
  -- MODO WALKIN: sem janela, IDENTICO a versao anterior. O retorno nao-nulo
  -- trava a validacao no parceiro (prejuizo) — nao pode encolher.
  -- -------------------------------------------------------------------------
  if p_modo = 'walkin' then
    select a.id into v_ag
    from agendamentos a
    where a.cliente_id = v_cliente
      and a.unidade_id = v_unidade
      and a.data = v_hoje
      and a.status in ('agendado','confirmado','falta')
    order by abs(extract(epoch from (a.horario - v_hora)))
    limit 1;

    if v_ag is null then return null; end if;

    update agendamentos
       set checkin_modo_errado = true, checkin_modo_errado_em = now()
     where id = v_ag and status in ('agendado','confirmado','falta');
    return v_ag;
  end if;

  -- -------------------------------------------------------------------------
  -- MODO PERSONAL: a reserva alvo tem que estar na JANELA do check-in.
  --   agendado/confirmado -> check-in entre -3h e +2h do inicio da aula
  --   falta               -> so reverte entre o inicio e +1h30 (regra de 02/09)
  -- -------------------------------------------------------------------------
  select a.id, a.status, a.cliente_id, (a.data + a.horario)
    into v_ag, v_status, v_cli_ag, v_inicio
  from agendamentos a
  where a.cliente_id = v_cliente
    and a.unidade_id = v_unidade
    and a.data = v_hoje
    and (
      ( a.status in ('agendado','confirmado')
        and v_checkin >= (a.data + a.horario) - v_antes
        and v_checkin <= (a.data + a.horario) + v_depois )
      or
      ( a.status = 'falta'
        and v_checkin >= (a.data + a.horario)
        and v_checkin <= (a.data + a.horario) + v_janela )
    )
  order by abs(extract(epoch from (a.horario - v_hora)))
  limit 1;

  -- Nada na janela: se a pessoa TEM reserva hoje (longe do check-in), ela treinou
  -- fora do horario que reservou. Sinaliza pra recepcao e sai sem mexer no status
  -- — a vaga reservada continua valendo ate alguem resolver.
  if v_ag is null then
    select a.id into v_pendente
    from agendamentos a
    where a.cliente_id = v_cliente
      and a.unidade_id = v_unidade
      and a.data = v_hoje
      and a.status in ('agendado','confirmado')
    order by abs(extract(epoch from (a.horario - v_hora)))
    limit 1;

    if v_pendente is not null then
      update agendamentos
         set checkin_fora_janela = true,
             checkin_fora_janela_em = coalesce(p_checkin_em, now())
       where id = v_pendente;
    end if;
    return null;
  end if;

  update agendamentos
     set status = 'realizado',
         presenca_checkin = true,
         presenca_checkin_em = now(),
         presenca_checkin_origem = p_origem,
         checkin_modo_errado = false,
         checkin_fora_janela = false
   where id = v_ag and status in ('agendado','confirmado','falta');

  if v_status = 'falta' then
    insert into presenca_reversao_log
      (origem, registro_id, cliente_id, inicio_aula, status_anterior, parceiro, checkin_em)
    values ('ct', v_ag, v_cli_ag, v_inicio, 'falta', p_origem, v_checkin);
  end if;

  return v_ag;
end $function$;

-- Permissoes: o CREATE OR REPLACE preserva os grants existentes (PUBLIC/anon/
-- authenticated/service_role), como nas versoes anteriores.
