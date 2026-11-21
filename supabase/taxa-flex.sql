-- ═══════════════════════════════════════════════════════════════════════════
-- TAXA FORA DO PRAZO — cancelar / trocar pagando (Coach CT + JustClub)
--
-- O QUE É: onde hoje o cliente bate num bloqueio, ele pode pagar uma taxa
-- (R$ 29,90) e seguir:
--   • CANCELAR fora do prazo gratuito, até 1h antes do treino. O crédito volta
--     e a vaga vai pra fila, igual a um cancelamento normal.
--   • TROCAR de horário quando a troca gratuita está travada por "aula de
--     origem lotada" ou por "já trocou uma vez". Sem limite: pagou, troca de novo.
--
-- O QUE NÃO MUDA (decisões do Ricardo, 21/11/2026):
--   • Tudo que hoje é grátis continua grátis — estas funções RECUSAM cobrar
--     quando o caminho gratuito existe (CANCELAMENTO_GRATUITO / TROCA_GRATUITA).
--   • Destino da troca precisa ter vaga; continua sendo o vizinho até 2h.
--   • Reserva nascida no app do parceiro fica de fora.
--   • PRO paga a taxa entre 1h e 3h (acima de 3h já é grátis pra ele no CT).
--
-- ISOLAMENTO: só objetos NOVOS. Nenhuma função, trigger ou tabela existente é
-- alterada. Com taxa_flex_config.ativo = false e clientes_teste vazio, o site
-- se comporta exatamente como antes.
--
-- SEGURANÇA: as funções "_taxa_*" recebem o cliente por parâmetro e só o
-- service_role executa (quem chama é /api/taxa-flex/pagar, DEPOIS de cobrar).
-- As funções "*_cliente" e taxa_flex_info são as únicas liberadas pro logado,
-- e só leem (simulam) — nunca cancelam nem trocam.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) Configuração (1 linha) e registro das cobranças
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists taxa_flex_config (
  id                     int primary key default 1 check (id = 1),
  ativo                  boolean not null default false,       -- liga pra TODOS
  clientes_teste         uuid[]  not null default '{}',        -- enxergam mesmo desligado
  valor_cancelamento     numeric(10,2) not null default 29.90,
  valor_troca            numeric(10,2) not null default 29.90,
  horas_min_cancelamento numeric not null default 1,           -- cancela pagando até Xh antes
  produto_ct_id          uuid,
  produto_club_id        uuid,
  atualizado_em          timestamptz not null default now()
);
alter table taxa_flex_config enable row level security;
insert into taxa_flex_config (id) values (1) on conflict (id) do nothing;

create table if not exists taxa_flex_cobrancas (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references clientes(id),
  acao              text not null check (acao in ('cancelar', 'trocar')),
  tipo              text not null check (tipo in ('ct', 'club')),
  ref_id            uuid not null,                 -- agendamento ou reserva
  destino           text,                          -- troca: horário (CT) ou ocorrência (Club)
  valor             numeric(10,2) not null,
  status            text not null check (status in ('pago', 'recusado', 'estornado', 'erro_estorno')),
  pagarme_order_id  text,
  pagarme_charge_id text,
  venda_id          uuid,
  erro              text,
  criado_em         timestamptz not null default now()
);
create index if not exists taxa_flex_cobrancas_cliente_idx on taxa_flex_cobrancas (cliente_id, criado_em desc);
alter table taxa_flex_cobrancas enable row level security;

-- Produtos da taxa (espelham os de multa: subtipo 'multa' = sem e-mail de compra,
-- fora do catálogo do bot; 0 créditos; invisíveis no site).
insert into produtos (nome, tipo, subtipo, valor, ativo, visivel_site, creditos_por_venda, descricao)
select 'Taxa Fora do Prazo', 'credito_coach', 'multa', 29.90, true, false, 0,
       'Taxa de cancelamento/troca fora do prazo — Coach CT'
 where not exists (select 1 from produtos where nome = 'Taxa Fora do Prazo');
insert into produtos (nome, tipo, subtipo, valor, ativo, visivel_site, creditos_por_venda, descricao)
select 'Taxa Fora do Prazo JustClub', 'avulso', 'multa', 29.90, true, false, 0,
       'Taxa de cancelamento/troca fora do prazo — JustClub'
 where not exists (select 1 from produtos where nome = 'Taxa Fora do Prazo JustClub');

update taxa_flex_config
   set produto_ct_id   = (select id from produtos where nome = 'Taxa Fora do Prazo' limit 1),
       produto_club_id = (select id from produtos where nome = 'Taxa Fora do Prazo JustClub' limit 1)
 where id = 1 and (produto_ct_id is null or produto_club_id is null);


-- ───────────────────────────────────────────────────────────────────────────
-- 2) A taxa vale pra este cliente? (kill switch + lista de teste; ClassPass fora)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function _taxa_flex_ativa(p_cli uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select (c.ativo or p_cli = any(c.clientes_teste))
       and not exists (select 1 from clientes k where k.id = p_cli and k.is_classpass is true)
      from taxa_flex_config c where c.id = 1
  ), false);
$$;

create or replace function taxa_flex_info()
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_cli uuid;
  c     taxa_flex_config%rowtype;
begin
  select k.id into v_cli from clientes k where k.user_id = auth.uid();
  if v_cli is null or not _taxa_flex_ativa(v_cli) then
    return json_build_object('ativo', false);
  end if;
  select * into c from taxa_flex_config where id = 1;
  return json_build_object(
    'ativo', true,
    'valor_cancelamento', c.valor_cancelamento,
    'valor_troca', c.valor_troca,
    'horas_min_cancelamento', c.horas_min_cancelamento
  );
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3) CANCELAR pagando. p_simular = true só valida (nada é gravado).
-- Erros: TAXA_DESLIGADA | NAO_E_SUA_RESERVA | STATUS_INVALIDO | JA_FEZ_CHECKIN
--        | RESERVA_APP_PARCEIRO | FORA_DO_LIMITE | CANCELAMENTO_GRATUITO | TIPO_INVALIDO
-- ───────────────────────────────────────────────────────────────────────────
create or replace function _taxa_cancelar(p_cli uuid, p_tipo text, p_id uuid, p_simular boolean)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agora   timestamp := (now() at time zone 'America/Sao_Paulo');
  c         taxa_flex_config%rowtype;
  v_ag      agendamentos%rowtype;
  v_res     club_reservas%rowtype;
  v_oc      club_ocorrencias%rowtype;
  v_aula    club_aulas%rowtype;
  v_inicio  timestamp;
  v_horas   numeric;
  v_fila    int := 0;
  v_pro     boolean := false;
  v_unidade uuid;
begin
  if p_cli is null or not _taxa_flex_ativa(p_cli) then raise exception 'TAXA_DESLIGADA'; end if;
  select * into c from taxa_flex_config where id = 1;

  if p_tipo = 'ct' then
    select * into v_ag from agendamentos where id = p_id;
    if not found or v_ag.cliente_id is distinct from p_cli then raise exception 'NAO_E_SUA_RESERVA'; end if;
    if v_ag.status not in ('agendado', 'confirmado') then raise exception 'STATUS_INVALIDO'; end if;
    if v_ag.presenca_checkin is true then raise exception 'JA_FEZ_CHECKIN'; end if;
    if coalesce(v_ag.criado_via, '') in ('wellhub', 'totalpass') then raise exception 'RESERVA_APP_PARCEIRO'; end if;
    v_inicio  := v_ag.data + v_ag.horario;
    v_unidade := v_ag.unidade_id;
    v_fila    := coalesce(fila_aguardando_qtd(null, v_ag.unidade_id, v_ag.data, v_ag.horario), 0);
    -- Coach CT Pro: no CT já cancela grátis até 3h (mesma regra de src/lib/planoPro.ts)
    v_pro := exists (
      select 1 from cliente_planos cp
        join planos_disponiveis pd on pd.id = cp.plano_id
       where cp.cliente_id = p_cli and cp.ativo is true and pd.tipo = 'coach_ct_pro'
         and (cp.fim is null or cp.fim >= v_agora::date));

  elsif p_tipo = 'club' then
    select * into v_res from club_reservas where id = p_id;
    if not found or v_res.cliente_id is distinct from p_cli then raise exception 'NAO_E_SUA_RESERVA'; end if;
    if v_res.status <> 'reservado' then raise exception 'STATUS_INVALIDO'; end if;
    if v_res.via_app is true
       or v_res.wellhub_booking_number is not null
       or v_res.totalpass_slot_id is not null
       or coalesce(v_res.criado_via, '') in ('wellhub', 'totalpass') then raise exception 'RESERVA_APP_PARCEIRO'; end if;
    select * into v_oc   from club_ocorrencias where id = v_res.ocorrencia_id;
    select * into v_aula from club_aulas       where id = v_oc.aula_id;
    v_inicio  := v_oc.data + v_aula.horario;
    v_unidade := v_aula.unidade_id;
    v_fila    := coalesce(fila_aguardando_qtd(v_oc.id), 0);

  else
    raise exception 'TIPO_INVALIDO';
  end if;

  v_horas := extract(epoch from (v_inicio - v_agora)) / 3600.0;
  if v_horas < c.horas_min_cancelamento then raise exception 'FORA_DO_LIMITE'; end if;
  -- Mesma régua do site: >12h livre; entre 3h e 12h livre com fila (ou PRO no CT).
  if v_horas > 12 or (v_horas > 3 and (v_fila > 0 or v_pro)) then
    raise exception 'CANCELAMENTO_GRATUITO';
  end if;

  if p_simular then
    return json_build_object('ok', true, 'simulado', true, 'valor', c.valor_cancelamento,
                             'unidade_id', v_unidade, 'inicio', v_inicio);
  end if;

  if p_tipo = 'ct' then
    update agendamentos
       set status = 'cancelado', cancelado_em = now(),
           motivo_cancelamento = 'Cancelado pelo cliente (taxa fora do prazo)'
     where id = v_ag.id;
  else
    update club_reservas
       set status = 'cancelado', cancelado_em = now(), cancelado_via = 'site_cliente_taxa'
     where id = v_res.id;
  end if;

  return json_build_object('ok', true, 'valor', c.valor_cancelamento,
                           'unidade_id', v_unidade, 'inicio', v_inicio);
end;
$$;

-- Pra tela: dá pra cancelar pagando? Nunca levanta exceção.
create or replace function taxa_cancelamento_cliente(p_tipo text, p_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cli uuid;
  v_r   json;
begin
  select k.id into v_cli from clientes k where k.user_id = auth.uid();
  if v_cli is null then return json_build_object('pode', false, 'motivo', 'SEM_CLIENTE'); end if;
  begin
    v_r := _taxa_cancelar(v_cli, p_tipo, p_id, true);
  exception when others then
    return json_build_object('pode', false, 'motivo', sqlerrm);
  end;
  return json_build_object('pode', true, 'valor', v_r->'valor');
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4) TROCAR pagando — opções. Cópia de opcoes_troca_cliente SEM as travas de
-- "origem lotada" e "já trocou"; se nenhuma das duas está travando, devolve
-- TROCA_GRATUITA (o cliente usa o botão de sempre, sem pagar).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function _taxa_troca_opcoes(p_cli uuid, p_tipo text, p_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agora     timestamp := (now() at time zone 'America/Sao_Paulo');
  v_valor     numeric;
  v_ag        agendamentos%rowtype;
  v_res       club_reservas%rowtype;
  v_oc        club_ocorrencias%rowtype;
  v_aula      club_aulas%rowtype;
  v_hora_orig text;
  v_livres_o  int;
  v_usadas    int;
  v_cap       int;
  v_ant       text;
  v_prox      text;
  v_ant_mod   text;
  v_prox_mod  text;
  v_opcoes    json;
begin
  if p_cli is null or not _taxa_flex_ativa(p_cli) then
    return json_build_object('pode', false, 'motivo', 'TAXA_DESLIGADA');
  end if;
  select valor_troca into v_valor from taxa_flex_config where id = 1;

  -- ═══ COACH CT ═══
  if p_tipo = 'ct' then
    select * into v_ag from agendamentos where id = p_id;
    if not found or v_ag.cliente_id is distinct from p_cli then
      return json_build_object('pode', false, 'motivo', 'NAO_E_SUA_RESERVA');
    end if;
    if v_ag.status not in ('agendado', 'confirmado') then
      return json_build_object('pode', false, 'motivo', 'STATUS_INVALIDO');
    end if;
    if v_ag.presenca_checkin is true then
      return json_build_object('pode', false, 'motivo', 'JA_FEZ_CHECKIN');
    end if;

    v_hora_orig := to_char(v_ag.horario, 'HH24:MI');

    select g.livres into v_livres_o
      from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) g
     where g.horario = v_hora_orig;
    if v_livres_o is null then
      return json_build_object('pode', false, 'motivo', 'SEM_GRADE');
    end if;
    if v_livres_o >= 1 and v_ag.trocado_pelo_cliente_em is null then
      return json_build_object('pode', false, 'motivo', 'TROCA_GRATUITA');
    end if;

    select max(g.horario) into v_ant
      from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) g where g.horario < v_hora_orig;
    select min(g.horario) into v_prox
      from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) g where g.horario > v_hora_orig;

    select coalesce(json_agg(json_build_object('horario', x.horario, 'vagas', x.livres)
                             order by x.horario), '[]'::json)
      into v_opcoes
      from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) x
     where x.horario in (coalesce(v_ant, ''), coalesce(v_prox, ''))
       and x.livres >= 1
       and abs(extract(epoch from (x.horario::time - v_ag.horario)) / 60) <= 120
       and (v_ag.data + x.horario::time) > v_agora
       and not exists (
             select 1 from agendamentos a2
              where a2.cliente_id = p_cli
                and a2.data = v_ag.data
                and a2.unidade_id = v_ag.unidade_id
                and to_char(a2.horario, 'HH24:MI') = x.horario
                and a2.status <> 'cancelado');

    return json_build_object(
      'pode',   json_array_length(v_opcoes) > 0,
      'motivo', case when json_array_length(v_opcoes) > 0 then null else 'SEM_OPCAO' end,
      'tipo',   'ct',
      'taxa',   true,
      'valor',  v_valor,
      'origem', json_build_object('horario', v_hora_orig, 'data', v_ag.data, 'vagas', v_livres_o),
      'opcoes', v_opcoes
    );

  -- ═══ JUSTCLUB ═══
  elsif p_tipo = 'club' then
    select * into v_res from club_reservas where id = p_id;
    if not found or v_res.cliente_id is distinct from p_cli then
      return json_build_object('pode', false, 'motivo', 'NAO_E_SUA_RESERVA');
    end if;
    if v_res.status <> 'reservado' then
      return json_build_object('pode', false, 'motivo', 'STATUS_INVALIDO');
    end if;
    if v_res.via_app is true
       or v_res.wellhub_booking_number is not null
       or v_res.totalpass_slot_id is not null then
      return json_build_object('pode', false, 'motivo', 'RESERVA_APP_PARCEIRO');
    end if;

    select * into v_oc   from club_ocorrencias where id = v_res.ocorrencia_id;
    select * into v_aula from club_aulas       where id = v_oc.aula_id;
    v_hora_orig := to_char(v_aula.horario, 'HH24:MI');

    select count(*) into v_usadas
      from club_reservas where ocorrencia_id = v_oc.id and status <> 'cancelado';
    if v_aula.tipo = 'running_funcional' then
      v_cap := v_aula.capacidade
             - (select count(*) from club_posicoes
                 where unidade_id = v_aula.unidade_id and ativo is true and bloqueado is true)
             - (select count(*) from club_posicoes_bloqueios_ocorrencia
                 where ocorrencia_id = v_oc.id);
    else
      v_cap := v_aula.capacidade - coalesce(v_oc.vagas_bloqueadas, 0);
    end if;
    if v_usadas < v_cap and v_res.trocado_pelo_cliente_em is null then
      return json_build_object('pode', false, 'motivo', 'TROCA_GRATUITA');
    end if;

    select max(to_char(a.horario, 'HH24:MI')) into v_ant
      from club_ocorrencias o join club_aulas a on a.id = o.aula_id
     where a.unidade_id = v_aula.unidade_id and a.ativo is true
       and o.data = v_oc.data and coalesce(o.status, 'ativa') = 'ativa'
       and to_char(a.horario, 'HH24:MI') < v_hora_orig;
    select min(to_char(a.horario, 'HH24:MI')) into v_prox
      from club_ocorrencias o join club_aulas a on a.id = o.aula_id
     where a.unidade_id = v_aula.unidade_id and a.ativo is true
       and o.data = v_oc.data and coalesce(o.status, 'ativa') = 'ativa'
       and to_char(a.horario, 'HH24:MI') > v_hora_orig;
    select max(to_char(a.horario, 'HH24:MI')) into v_ant_mod
      from club_ocorrencias o join club_aulas a on a.id = o.aula_id
     where a.unidade_id = v_aula.unidade_id and a.ativo is true and a.tipo = v_aula.tipo
       and o.data = v_oc.data and coalesce(o.status, 'ativa') = 'ativa'
       and to_char(a.horario, 'HH24:MI') < v_hora_orig;
    select min(to_char(a.horario, 'HH24:MI')) into v_prox_mod
      from club_ocorrencias o join club_aulas a on a.id = o.aula_id
     where a.unidade_id = v_aula.unidade_id and a.ativo is true and a.tipo = v_aula.tipo
       and o.data = v_oc.data and coalesce(o.status, 'ativa') = 'ativa'
       and to_char(a.horario, 'HH24:MI') > v_hora_orig;

    select coalesce(json_agg(json_build_object(
             'ocorrencia_id',   t.id,
             'horario',         t.horario,
             'tipo',            t.tipo,
             'vagas',           t.vagas,
             'exige_posicao',   t.tipo = 'running_funcional',
             'posicoes_livres', t.posicoes
           ) order by t.horario, t.tipo), '[]'::json)
      into v_opcoes
      from (
        select o.id,
               to_char(a.horario, 'HH24:MI') as horario,
               a.tipo,
               case when a.tipo = 'running_funcional' then
                 a.capacidade
                 - (select count(*) from club_posicoes cp
                     where cp.unidade_id = a.unidade_id and cp.ativo is true and cp.bloqueado is true)
                 - (select count(*) from club_posicoes_bloqueios_ocorrencia b
                     where b.ocorrencia_id = o.id)
                 - (select count(*) from club_reservas r
                     where r.ocorrencia_id = o.id and r.status in ('reservado','presente'))
               else
                 a.capacidade
                 - coalesce(o.vagas_bloqueadas, 0)
                 - (select count(*) from club_reservas r
                     where r.ocorrencia_id = o.id and r.status in ('reservado','presente'))
               end as vagas,
               case when a.tipo = 'running_funcional' then (
                 select coalesce(json_agg(lbl order by lbl), '[]'::json) from (
                   select (cp.tipo || lpad(cp.numero::text, 2, '0')) as lbl
                     from club_posicoes cp
                    where cp.unidade_id = a.unidade_id
                      and cp.ativo is true and coalesce(cp.bloqueado, false) = false
                      and not exists (select 1 from club_posicoes_bloqueios_ocorrencia b
                                       where b.ocorrencia_id = o.id
                                         and b.posicao = (cp.tipo || lpad(cp.numero::text, 2, '0')))
                      and not exists (select 1 from club_reservas r
                                       where r.ocorrencia_id = o.id
                                         and r.posicao = (cp.tipo || lpad(cp.numero::text, 2, '0'))
                                         and r.status <> 'cancelado')
                 ) p
               ) else '[]'::json end as posicoes
          from club_ocorrencias o
          join club_aulas a on a.id = o.aula_id
         where a.unidade_id = v_aula.unidade_id and a.ativo is true
           and o.data = v_oc.data and coalesce(o.status, 'ativa') = 'ativa'
           and o.id <> v_oc.id
           and (to_char(a.horario, 'HH24:MI') in (coalesce(v_ant, ''), coalesce(v_prox, ''))
                or (a.tipo = v_aula.tipo
                    and to_char(a.horario, 'HH24:MI') in (coalesce(v_ant_mod, ''), coalesce(v_prox_mod, ''))))
           and abs(extract(epoch from (a.horario - v_aula.horario)) / 60) <= 120
           and (o.data + a.horario) > v_agora
           and not exists (select 1 from club_reservas r2
                            where r2.ocorrencia_id = o.id and r2.cliente_id = p_cli
                              and r2.status <> 'cancelado')
      ) t
     where t.vagas >= 1;

    return json_build_object(
      'pode',   json_array_length(v_opcoes) > 0,
      'motivo', case when json_array_length(v_opcoes) > 0 then null else 'SEM_OPCAO' end,
      'tipo',   'club',
      'taxa',   true,
      'valor',  v_valor,
      'origem', json_build_object('horario', v_hora_orig, 'data', v_oc.data,
                                  'aula_tipo', v_aula.tipo, 'vagas', v_cap - v_usadas),
      'opcoes', v_opcoes
    );

  else
    return json_build_object('pode', false, 'motivo', 'TIPO_INVALIDO');
  end if;
end;
$$;

create or replace function opcoes_troca_taxa_cliente(p_tipo text, p_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cli uuid;
begin
  select k.id into v_cli from clientes k where k.user_id = auth.uid();
  if v_cli is null then return json_build_object('pode', false, 'motivo', 'SEM_CLIENTE'); end if;
  begin
    return _taxa_troca_opcoes(v_cli, p_tipo, p_id);
  exception when others then
    return json_build_object('pode', false, 'motivo', 'ERRO');
  end;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5) TROCAR pagando — Coach CT. Cópia de trocar_horario_ct_cliente sem
-- ORIGEM_LOTADA / JA_TROCOU. p_simular = true só valida.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function _taxa_trocar_ct(p_cli uuid, p_agendamento_id uuid, p_novo_horario text, p_simular boolean)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agora     timestamp := (now() at time zone 'America/Sao_Paulo');
  v_valor     numeric;
  v_ag        agendamentos%rowtype;
  v_hora_orig text;
  v_hora_dest text := left(trim(coalesce(p_novo_horario, '')), 5);
  v_livres_o  int;
  v_livres_d  int;
  v_ant       text;
  v_prox      text;
begin
  if p_cli is null or not _taxa_flex_ativa(p_cli) then raise exception 'TAXA_DESLIGADA'; end if;
  select valor_troca into v_valor from taxa_flex_config where id = 1;

  select * into v_ag from agendamentos where id = p_agendamento_id;
  if not found or v_ag.cliente_id is distinct from p_cli then raise exception 'NAO_E_SUA_RESERVA'; end if;
  if v_ag.status not in ('agendado', 'confirmado')  then raise exception 'STATUS_INVALIDO'; end if;
  if v_ag.presenca_checkin is true                  then raise exception 'JA_FEZ_CHECKIN';  end if;

  v_hora_orig := to_char(v_ag.horario, 'HH24:MI');
  if v_hora_dest = v_hora_orig then raise exception 'DESTINO_IGUAL_ORIGEM'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_ag.unidade_id::text || '|' || v_ag.data::text || '|' || v_hora_dest, 0));

  select g.livres into v_livres_o
    from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) g where g.horario = v_hora_orig;
  if v_livres_o is null then raise exception 'SEM_GRADE'; end if;
  if v_livres_o >= 1 and v_ag.trocado_pelo_cliente_em is null then raise exception 'TROCA_GRATUITA'; end if;

  select max(g.horario) into v_ant
    from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) g where g.horario < v_hora_orig;
  select min(g.horario) into v_prox
    from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) g where g.horario > v_hora_orig;
  if v_hora_dest is distinct from coalesce(v_ant, '')
     and v_hora_dest is distinct from coalesce(v_prox, '') then
    raise exception 'NAO_E_VIZINHO';
  end if;
  if abs(extract(epoch from (v_hora_dest::time - v_ag.horario)) / 60) > 120 then
    raise exception 'LONGE_DEMAIS';
  end if;
  if (v_ag.data + v_hora_dest::time) <= v_agora then raise exception 'DESTINO_JA_COMECOU'; end if;

  select g.livres into v_livres_d
    from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) g where g.horario = v_hora_dest;
  if coalesce(v_livres_d, 0) < 1 then raise exception 'DESTINO_LOTADO'; end if;

  if exists (select 1 from agendamentos a2
              where a2.cliente_id = p_cli and a2.data = v_ag.data
                and a2.unidade_id = v_ag.unidade_id
                and to_char(a2.horario, 'HH24:MI') = v_hora_dest
                and a2.status <> 'cancelado') then
    raise exception 'JA_TEM_NESSE_HORARIO';
  end if;

  if p_simular then
    return json_build_object('ok', true, 'simulado', true, 'valor', v_valor,
                             'unidade_id', v_ag.unidade_id, 'de', v_hora_orig, 'para', v_hora_dest);
  end if;

  update agendamentos
     set horario                 = v_hora_dest::time,
         coach_id                = null,
         alocado_por             = null,
         alocado_em              = null,
         trocado_pelo_cliente_em = now(),
         troca_cliente_de        = v_hora_orig
   where id = v_ag.id;

  return json_build_object('ok', true, 'valor', v_valor, 'unidade_id', v_ag.unidade_id,
                           'de', v_hora_orig, 'para', v_hora_dest);
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6) TROCAR pagando — JustClub. Cópia de trocar_aula_club_cliente sem
-- ORIGEM_LOTADA / JA_TROCOU. p_simular = true só valida.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function _taxa_trocar_club(
  p_cli uuid,
  p_reserva_id uuid,
  p_destino_ocorrencia_id uuid,
  p_nova_posicao text,
  p_simular boolean
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agora     timestamp := (now() at time zone 'America/Sao_Paulo');
  v_valor     numeric;
  v_res       club_reservas%rowtype;
  v_oc        club_ocorrencias%rowtype;
  v_aula      club_aulas%rowtype;
  v_doc       club_ocorrencias%rowtype;
  v_daula     club_aulas%rowtype;
  v_hora_orig text;
  v_hora_dest text;
  v_ant       text;
  v_prox      text;
  v_ant_mod   text;
  v_prox_mod  text;
  v_usadas    int;
  v_cap       int;
  v_pos       text := nullif(trim(coalesce(p_nova_posicao, '')), '');
begin
  if p_cli is null or not _taxa_flex_ativa(p_cli) then raise exception 'TAXA_DESLIGADA'; end if;
  select valor_troca into v_valor from taxa_flex_config where id = 1;

  select * into v_res from club_reservas where id = p_reserva_id;
  if not found or v_res.cliente_id is distinct from p_cli then raise exception 'NAO_E_SUA_RESERVA'; end if;
  if v_res.status <> 'reservado' then raise exception 'STATUS_INVALIDO'; end if;
  if v_res.via_app is true
     or v_res.wellhub_booking_number is not null
     or v_res.totalpass_slot_id is not null then raise exception 'RESERVA_APP_PARCEIRO'; end if;

  select * into v_oc   from club_ocorrencias where id = v_res.ocorrencia_id;
  select * into v_aula from club_aulas       where id = v_oc.aula_id;
  select * into v_doc  from club_ocorrencias where id = p_destino_ocorrencia_id;
  if not found then raise exception 'DESTINO_NAO_ENCONTRADO'; end if;
  select * into v_daula from club_aulas where id = v_doc.aula_id;

  if v_doc.id = v_oc.id                                   then raise exception 'DESTINO_IGUAL_ORIGEM'; end if;
  if coalesce(v_doc.status, 'ativa') <> 'ativa'            then raise exception 'DESTINO_INATIVO';     end if;
  if v_daula.ativo is not true                             then raise exception 'DESTINO_INATIVO';     end if;
  if v_aula.unidade_id <> v_daula.unidade_id               then raise exception 'UNIDADE_DIFERENTE';   end if;
  if v_oc.data <> v_doc.data                               then raise exception 'DIA_DIFERENTE';       end if;

  v_hora_orig := to_char(v_aula.horario,  'HH24:MI');
  v_hora_dest := to_char(v_daula.horario, 'HH24:MI');

  perform pg_advisory_xact_lock(hashtextextended(p_destino_ocorrencia_id::text, 0));

  -- Só cobra se a troca gratuita está travada (origem lotada ou já trocou)
  select count(*) into v_usadas
    from club_reservas where ocorrencia_id = v_oc.id and status <> 'cancelado';
  if v_aula.tipo = 'running_funcional' then
    v_cap := v_aula.capacidade
           - (select count(*) from club_posicoes
               where unidade_id = v_aula.unidade_id and ativo is true and bloqueado is true)
           - (select count(*) from club_posicoes_bloqueios_ocorrencia where ocorrencia_id = v_oc.id);
  else
    v_cap := v_aula.capacidade - coalesce(v_oc.vagas_bloqueadas, 0);
  end if;
  if v_usadas < v_cap and v_res.trocado_pelo_cliente_em is null then raise exception 'TROCA_GRATUITA'; end if;

  select max(to_char(a.horario, 'HH24:MI')) into v_ant
    from club_ocorrencias o join club_aulas a on a.id = o.aula_id
   where a.unidade_id = v_aula.unidade_id and a.ativo is true
     and o.data = v_oc.data and coalesce(o.status, 'ativa') = 'ativa'
     and to_char(a.horario, 'HH24:MI') < v_hora_orig;
  select min(to_char(a.horario, 'HH24:MI')) into v_prox
    from club_ocorrencias o join club_aulas a on a.id = o.aula_id
   where a.unidade_id = v_aula.unidade_id and a.ativo is true
     and o.data = v_oc.data and coalesce(o.status, 'ativa') = 'ativa'
     and to_char(a.horario, 'HH24:MI') > v_hora_orig;
  select max(to_char(a.horario, 'HH24:MI')) into v_ant_mod
    from club_ocorrencias o join club_aulas a on a.id = o.aula_id
   where a.unidade_id = v_aula.unidade_id and a.ativo is true and a.tipo = v_aula.tipo
     and o.data = v_oc.data and coalesce(o.status, 'ativa') = 'ativa'
     and to_char(a.horario, 'HH24:MI') < v_hora_orig;
  select min(to_char(a.horario, 'HH24:MI')) into v_prox_mod
    from club_ocorrencias o join club_aulas a on a.id = o.aula_id
   where a.unidade_id = v_aula.unidade_id and a.ativo is true and a.tipo = v_aula.tipo
     and o.data = v_oc.data and coalesce(o.status, 'ativa') = 'ativa'
     and to_char(a.horario, 'HH24:MI') > v_hora_orig;
  if v_hora_dest is distinct from coalesce(v_ant, '')
     and v_hora_dest is distinct from coalesce(v_prox, '')
     and not (v_daula.tipo = v_aula.tipo
              and v_hora_dest in (coalesce(v_ant_mod, ''), coalesce(v_prox_mod, ''))) then
    raise exception 'NAO_E_VIZINHO';
  end if;
  if abs(extract(epoch from (v_daula.horario - v_aula.horario)) / 60) > 120 then
    raise exception 'LONGE_DEMAIS';
  end if;
  if (v_doc.data + v_daula.horario) <= v_agora then raise exception 'DESTINO_JA_COMECOU'; end if;

  if exists (select 1 from club_reservas r2
              where r2.ocorrencia_id = v_doc.id and r2.cliente_id = p_cli
                and r2.status <> 'cancelado') then
    raise exception 'JA_TEM_NESSA_AULA';
  end if;

  select count(*) into v_usadas
    from club_reservas where ocorrencia_id = v_doc.id and status in ('reservado', 'presente');

  if v_daula.tipo = 'running_funcional' then
    if v_pos is null then
      select (cp.tipo || lpad(cp.numero::text, 2, '0')) into v_pos
        from club_posicoes cp
       where cp.unidade_id = v_daula.unidade_id
         and cp.ativo is true and coalesce(cp.bloqueado, false) = false
         and not exists (select 1 from club_posicoes_bloqueios_ocorrencia b
                          where b.ocorrencia_id = v_doc.id
                            and b.posicao = (cp.tipo || lpad(cp.numero::text, 2, '0')))
         and not exists (select 1 from club_reservas r
                          where r.ocorrencia_id = v_doc.id
                            and r.posicao = (cp.tipo || lpad(cp.numero::text, 2, '0'))
                            and r.status <> 'cancelado')
       order by cp.tipo, cp.numero
       limit 1;
      if v_pos is null then raise exception 'DESTINO_LOTADO'; end if;
    else
      if not exists (select 1 from club_posicoes
                      where unidade_id = v_daula.unidade_id
                        and (tipo || lpad(numero::text, 2, '0')) = v_pos
                        and ativo is true and coalesce(bloqueado, false) = false)
        then raise exception 'POSICAO_INVALIDA'; end if;
      if exists (select 1 from club_posicoes_bloqueios_ocorrencia
                  where ocorrencia_id = v_doc.id and posicao = v_pos)
        then raise exception 'POSICAO_BLOQUEADA'; end if;
      if exists (select 1 from club_reservas
                  where ocorrencia_id = v_doc.id and posicao = v_pos and status <> 'cancelado')
        then raise exception 'POSICAO_OCUPADA'; end if;
    end if;

    if (v_daula.capacidade
        - (select count(*) from club_posicoes
            where unidade_id = v_daula.unidade_id and ativo is true and bloqueado is true)
        - (select count(*) from club_posicoes_bloqueios_ocorrencia where ocorrencia_id = v_doc.id)
        - v_usadas) < 1 then
      raise exception 'DESTINO_LOTADO';
    end if;
  else
    v_pos := null;
    if (v_daula.capacidade - coalesce(v_doc.vagas_bloqueadas, 0) - v_usadas) < 1 then
      raise exception 'DESTINO_LOTADO';
    end if;
  end if;

  if p_simular then
    return json_build_object('ok', true, 'simulado', true, 'valor', v_valor,
                             'unidade_id', v_aula.unidade_id, 'de', v_hora_orig, 'para', v_hora_dest);
  end if;

  update club_reservas
     set ocorrencia_id           = p_destino_ocorrencia_id,
         posicao                 = v_pos,
         trocado_pelo_cliente_em = now(),
         troca_cliente_de        = v_hora_orig || ' | ' || v_oc.id::text
   where id = v_res.id;

  return json_build_object('ok', true, 'valor', v_valor, 'unidade_id', v_aula.unidade_id,
                           'de', v_hora_orig, 'para', v_hora_dest, 'posicao', v_pos);
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 7) Permissões. As "_taxa_*" recebem cliente por parâmetro: SÓ service_role.
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function _taxa_flex_ativa(uuid)                          from public, anon, authenticated;
revoke all on function _taxa_cancelar(uuid, text, uuid, boolean)       from public, anon, authenticated;
revoke all on function _taxa_troca_opcoes(uuid, text, uuid)            from public, anon, authenticated;
revoke all on function _taxa_trocar_ct(uuid, uuid, text, boolean)      from public, anon, authenticated;
revoke all on function _taxa_trocar_club(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function _taxa_flex_ativa(uuid)                          to service_role;
grant execute on function _taxa_cancelar(uuid, text, uuid, boolean)       to service_role;
grant execute on function _taxa_troca_opcoes(uuid, text, uuid)            to service_role;
grant execute on function _taxa_trocar_ct(uuid, uuid, text, boolean)      to service_role;
grant execute on function _taxa_trocar_club(uuid, uuid, uuid, text, boolean) to service_role;

revoke all on function taxa_flex_info()                        from public, anon;
revoke all on function taxa_cancelamento_cliente(text, uuid)   from public, anon;
revoke all on function opcoes_troca_taxa_cliente(text, uuid)   from public, anon;
grant execute on function taxa_flex_info()                      to authenticated;
grant execute on function taxa_cancelamento_cliente(text, uuid) to authenticated;
grant execute on function opcoes_troca_taxa_cliente(text, uuid) to authenticated;
