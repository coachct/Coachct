-- ═══════════════════════════════════════════════════════════════════════════
-- TROCA DE HORÁRIO PELO CLIENTE — Coach CT + JustClub
--
-- O QUE É: o próprio cliente move a reserva dele para o horário VIZINHO
-- (um pra frente ou um pra trás), no mesmo dia e na mesma unidade.
-- NÃO é cancelamento: o crédito não volta, não mexe em fila, não gera multa.
-- As regras de cancelamento continuam exatamente como estão.
--
-- REGRAS (fechadas com o Ricardo):
--   1. A aula de ORIGEM não pode estar lotada. Aula cheia = troca proibida.
--   2. Destino = só o horário imediatamente anterior ou o seguinte do dia,
--      no máximo 2h de diferença (evita "de manhã pra de noite" quando a
--      grade tem buraco). Nunca outro dia, nunca outra unidade.
--   3. Destino precisa ter vaga de verdade (e posição livre, no Running).
--   4. Uma troca por reserva. Trocou, acabou (não dá pra ir pulando o dia).
--   5. Só reserva feita por nós. Reserva nascida no app do parceiro não troca.
--   6. Pode trocar mesmo com a aula já começada — mas o DESTINO não pode ter
--      começado ainda (não dá pra "antecipar" pras 18h se já são 19h).
--   7. Se já bateu check-in/presença, não troca mais.
--   8. No Club, pode trocar de modalidade (Lift ↔ Running), igual recepção.
--
-- SEGURANÇA: as funções são SECURITY DEFINER e só aceitam a reserva do
-- PRÓPRIO usuário logado (auth.uid() → clientes.user_id). Passar o id de
-- outro cliente devolve NAO_E_SUA_RESERVA.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) Marca da troca (regra 4: uma por reserva) — aditivo, não mexe em nada.
-- ───────────────────────────────────────────────────────────────────────────
alter table agendamentos  add column if not exists trocado_pelo_cliente_em timestamptz;
alter table agendamentos  add column if not exists troca_cliente_de        text;
alter table club_reservas add column if not exists trocado_pelo_cliente_em timestamptz;
alter table club_reservas add column if not exists troca_cliente_de        text;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) Grade do Coach CT no servidor.
--
-- Hoje essa conta só existe no navegador (src/app/agendar/page.tsx). Sem ela
-- no banco, "não está lotado" seria só uma sugestão da tela. Espelha:
--   • dia útil  → coach_horarios (grade semanal do coach)
--   • fds/feriado → escala_fds, na lista fixa 08:00–12:00
--   • coach de férias/ausência não conta
--   • ocupados = agendamentos não cancelados
--   • bloqueadas = vagas_bloqueadas ativas
--   • horário 100% bloqueado não existe pro cliente (some do site)
--
-- NÃO inclui a grade extra (coach_horarios_extra) de propósito: ela está em
-- dark launch (NEXT_PUBLIC_GRADE_EXTRA_ATIVO=false) e o site ainda não a
-- mostra. Ficar de fora só deixa a conta mais conservadora — no máximo
-- bloqueia uma troca, nunca cria vaga que não existe. Quando o switch ligar,
-- é só somar a extra aqui.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function ct_grade_do_dia(p_unidade_id uuid, p_data date)
returns table(horario text, total int, ocupados int, bloqueadas int, livres int)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dow     int := extract(dow from p_data);
  v_usa_fds boolean;
begin
  select (exists (
           select 1 from feriados f
            where f.unidade_id = p_unidade_id and f.data = p_data and f.ativo is true
         ) or v_dow in (0, 6))
    into v_usa_fds;

  return query
  with ferias as (
    -- Coach fora na data. Junta coaches.id E coaches.user_id porque
    -- escala_fds.coach_id guarda USER_ID e coach_horarios.coach_id guarda coaches.id.
    select cf.coach_id as pessoa
      from coach_ferias cf
     where p_data between cf.data_inicio and cf.data_fim
    union
    select c.user_id
      from coach_ferias cf
      join coaches c on c.id = cf.coach_id
     where p_data between cf.data_inicio and cf.data_fim
       and c.user_id is not null
  ),
  base as (
    -- Fim de semana / feriado: escala do dia vale pra lista fixa de horários
    select h.hora as horario,
           (select count(distinct e.coach_id)::int
              from escala_fds e
             where e.unidade_id = p_unidade_id
               and e.data = p_data
               and e.coach_id not in (select pessoa from ferias)) as total
      from (values ('08:00'),('09:00'),('10:00'),('11:00'),('12:00')) as h(hora)
     where v_usa_fds
    union all
    -- Dia útil: grade semanal
    select left(ch.hora, 5) as horario, count(distinct ch.coach_id)::int
      from coach_horarios ch
     where not v_usa_fds
       and ch.unidade_id = p_unidade_id
       and ch.dia_semana = v_dow
       and ch.ativo is true
       and ch.coach_id not in (select pessoa from ferias)
     group by 1
  ),
  ocup as (
    select to_char(a.horario, 'HH24:MI') as horario, count(*)::int as n
      from agendamentos a
     where a.unidade_id = p_unidade_id and a.data = p_data and a.status <> 'cancelado'
     group by 1
  ),
  bloq as (
    select to_char(v.horario, 'HH24:MI') as horario, sum(coalesce(v.quantidade, 1))::int as n
      from vagas_bloqueadas v
     where v.unidade_id = p_unidade_id and v.data = p_data and v.ativo is true
     group by 1
  )
  select b.horario,
         b.total,
         coalesce(o.n, 0),
         coalesce(x.n, 0),
         greatest(0, b.total - coalesce(o.n, 0) - coalesce(x.n, 0))
    from base b
    left join ocup o on o.horario = b.horario
    left join bloq x on x.horario = b.horario
   where b.total > 0
     and coalesce(x.n, 0) < b.total
   order by 1;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3) O que o cliente pode fazer com ESTA reserva.
--
-- Devolve json e NUNCA levanta exceção: a tela usa isso pra decidir se mostra
-- o botão "Trocar horário" e quais opções oferecer.
--   { pode, motivo, tipo, origem:{...}, opcoes:[...] }
-- motivo: SEM_CLIENTE | NAO_E_SUA_RESERVA | STATUS_INVALIDO | JA_FEZ_CHECKIN
--         | JA_TROCOU | RESERVA_APP_PARCEIRO | SEM_GRADE | ORIGEM_LOTADA
--         | SEM_OPCAO | TIPO_INVALIDO
-- ───────────────────────────────────────────────────────────────────────────
create or replace function opcoes_troca_cliente(p_tipo text, p_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cli       uuid;
  v_agora     timestamp := (now() at time zone 'America/Sao_Paulo');
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
  v_opcoes    json;
begin
  select c.id into v_cli from clientes c where c.user_id = auth.uid();
  if v_cli is null then
    return json_build_object('pode', false, 'motivo', 'SEM_CLIENTE');
  end if;

  -- ═══ COACH CT ═══
  if p_tipo = 'ct' then
    select * into v_ag from agendamentos where id = p_id;
    if not found or v_ag.cliente_id <> v_cli then
      return json_build_object('pode', false, 'motivo', 'NAO_E_SUA_RESERVA');
    end if;
    if v_ag.status not in ('agendado', 'confirmado') then
      return json_build_object('pode', false, 'motivo', 'STATUS_INVALIDO');
    end if;
    if v_ag.presenca_checkin is true then
      return json_build_object('pode', false, 'motivo', 'JA_FEZ_CHECKIN');
    end if;
    if v_ag.trocado_pelo_cliente_em is not null then
      return json_build_object('pode', false, 'motivo', 'JA_TROCOU');
    end if;

    v_hora_orig := to_char(v_ag.horario, 'HH24:MI');

    select g.livres into v_livres_o
      from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) g
     where g.horario = v_hora_orig;
    if v_livres_o is null then
      return json_build_object('pode', false, 'motivo', 'SEM_GRADE');
    end if;
    if v_livres_o < 1 then
      return json_build_object('pode', false, 'motivo', 'ORIGEM_LOTADA',
                               'origem', json_build_object('horario', v_hora_orig, 'data', v_ag.data));
    end if;

    -- vizinhos: o horário existente logo antes e logo depois
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
              where a2.cliente_id = v_cli
                and a2.data = v_ag.data
                and a2.unidade_id = v_ag.unidade_id
                and to_char(a2.horario, 'HH24:MI') = x.horario
                and a2.status <> 'cancelado');

    return json_build_object(
      'pode',   json_array_length(v_opcoes) > 0,
      'motivo', case when json_array_length(v_opcoes) > 0 then null else 'SEM_OPCAO' end,
      'tipo',   'ct',
      'origem', json_build_object('horario', v_hora_orig, 'data', v_ag.data, 'vagas', v_livres_o),
      'opcoes', v_opcoes
    );

  -- ═══ JUSTCLUB ═══
  elsif p_tipo = 'club' then
    select * into v_res from club_reservas where id = p_id;
    if not found or v_res.cliente_id <> v_cli then
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
    if v_res.trocado_pelo_cliente_em is not null then
      return json_build_object('pode', false, 'motivo', 'JA_TROCOU');
    end if;

    select * into v_oc   from club_ocorrencias where id = v_res.ocorrencia_id;
    select * into v_aula from club_aulas       where id = v_oc.aula_id;
    v_hora_orig := to_char(v_aula.horario, 'HH24:MI');

    -- Origem lotada? Mesma conta do trocar_aula_club: conta TODAS as reservas
    -- não canceladas (falta NÃO reabre vaga pra efeito desta trava).
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
    if v_usadas >= v_cap then
      return json_build_object('pode', false, 'motivo', 'ORIGEM_LOTADA',
                               'origem', json_build_object('horario', v_hora_orig, 'data', v_oc.data));
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
           and to_char(a.horario, 'HH24:MI') in (coalesce(v_ant, ''), coalesce(v_prox, ''))
           and abs(extract(epoch from (a.horario - v_aula.horario)) / 60) <= 120
           and (o.data + a.horario) > v_agora
           and not exists (select 1 from club_reservas r2
                            where r2.ocorrencia_id = o.id and r2.cliente_id = v_cli
                              and r2.status <> 'cancelado')
      ) t
     where t.vagas >= 1;

    return json_build_object(
      'pode',   json_array_length(v_opcoes) > 0,
      'motivo', case when json_array_length(v_opcoes) > 0 then null else 'SEM_OPCAO' end,
      'tipo',   'club',
      'origem', json_build_object('horario', v_hora_orig, 'data', v_oc.data,
                                  'aula_tipo', v_aula.tipo, 'vagas', v_cap - v_usadas),
      'opcoes', v_opcoes
    );

  else
    return json_build_object('pode', false, 'motivo', 'TIPO_INVALIDO');
  end if;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 4) Executa a troca no Coach CT.
-- Revalida TUDO (a tela nunca é a fonte da verdade) e trava o horário de
-- destino com advisory lock, pra dois clientes não pegarem a mesma vaga.
-- O coach já alocado é limpo: quem realoca no horário novo é a recepção.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function trocar_horario_ct_cliente(p_agendamento_id uuid, p_novo_horario text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cli       uuid;
  v_agora     timestamp := (now() at time zone 'America/Sao_Paulo');
  v_ag        agendamentos%rowtype;
  v_hora_orig text;
  v_hora_dest text := left(trim(coalesce(p_novo_horario, '')), 5);
  v_livres_o  int;
  v_livres_d  int;
  v_ant       text;
  v_prox      text;
begin
  select c.id into v_cli from clientes c where c.user_id = auth.uid();
  if v_cli is null then raise exception 'SEM_CLIENTE'; end if;

  select * into v_ag from agendamentos where id = p_agendamento_id;
  if not found or v_ag.cliente_id <> v_cli then raise exception 'NAO_E_SUA_RESERVA'; end if;
  if v_ag.status not in ('agendado', 'confirmado')  then raise exception 'STATUS_INVALIDO'; end if;
  if v_ag.presenca_checkin is true                  then raise exception 'JA_FEZ_CHECKIN';  end if;
  if v_ag.trocado_pelo_cliente_em is not null       then raise exception 'JA_TROCOU';       end if;

  v_hora_orig := to_char(v_ag.horario, 'HH24:MI');
  if v_hora_dest = v_hora_orig then raise exception 'DESTINO_IGUAL_ORIGEM'; end if;

  -- Trava o par (unidade, data, horário destino) durante a transação
  perform pg_advisory_xact_lock(
    hashtextextended(v_ag.unidade_id::text || '|' || v_ag.data::text || '|' || v_hora_dest, 0));

  select g.livres into v_livres_o
    from ct_grade_do_dia(v_ag.unidade_id, v_ag.data) g where g.horario = v_hora_orig;
  if v_livres_o is null then raise exception 'SEM_GRADE';     end if;
  if v_livres_o < 1     then raise exception 'ORIGEM_LOTADA'; end if;

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
              where a2.cliente_id = v_cli and a2.data = v_ag.data
                and a2.unidade_id = v_ag.unidade_id
                and to_char(a2.horario, 'HH24:MI') = v_hora_dest
                and a2.status <> 'cancelado') then
    raise exception 'JA_TEM_NESSE_HORARIO';
  end if;

  update agendamentos
     set horario                 = v_hora_dest::time,
         coach_id                = null,
         alocado_por             = null,
         alocado_em              = null,
         trocado_pelo_cliente_em = now(),
         troca_cliente_de        = v_hora_orig
   where id = v_ag.id;

  return json_build_object('ok', true, 'agendamento_id', v_ag.id,
                           'de', v_hora_orig, 'para', v_hora_dest);
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5) Executa a troca no JustClub.
-- Mesmas travas do trocar_aula_club (que a recepção usa) + dono da reserva,
-- vizinho ≤ 2h, destino que ainda não começou e uma troca por reserva.
-- Posição nula no Running = o sistema pega a primeira livre.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function trocar_aula_club_cliente(
  p_reserva_id uuid,
  p_destino_ocorrencia_id uuid,
  p_nova_posicao text default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cli       uuid;
  v_agora     timestamp := (now() at time zone 'America/Sao_Paulo');
  v_res       club_reservas%rowtype;
  v_oc        club_ocorrencias%rowtype;
  v_aula      club_aulas%rowtype;
  v_doc       club_ocorrencias%rowtype;
  v_daula     club_aulas%rowtype;
  v_hora_orig text;
  v_hora_dest text;
  v_ant       text;
  v_prox      text;
  v_usadas    int;
  v_cap       int;
  v_pos       text := nullif(trim(coalesce(p_nova_posicao, '')), '');
begin
  select c.id into v_cli from clientes c where c.user_id = auth.uid();
  if v_cli is null then raise exception 'SEM_CLIENTE'; end if;

  select * into v_res from club_reservas where id = p_reserva_id;
  if not found or v_res.cliente_id <> v_cli then raise exception 'NAO_E_SUA_RESERVA'; end if;
  if v_res.status <> 'reservado' then raise exception 'STATUS_INVALIDO'; end if;
  if v_res.via_app is true
     or v_res.wellhub_booking_number is not null
     or v_res.totalpass_slot_id is not null then raise exception 'RESERVA_APP_PARCEIRO'; end if;
  if v_res.trocado_pelo_cliente_em is not null then raise exception 'JA_TROCOU'; end if;

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

  -- Origem não pode estar lotada (conta TODAS as reservas não canceladas)
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
  if v_usadas >= v_cap then raise exception 'ORIGEM_LOTADA'; end if;

  -- Destino tem que ser o horário vizinho (≤ 2h) e ainda não ter começado
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
  if v_hora_dest is distinct from coalesce(v_ant, '')
     and v_hora_dest is distinct from coalesce(v_prox, '') then
    raise exception 'NAO_E_VIZINHO';
  end if;
  if abs(extract(epoch from (v_daula.horario - v_aula.horario)) / 60) > 120 then
    raise exception 'LONGE_DEMAIS';
  end if;
  if (v_doc.data + v_daula.horario) <= v_agora then raise exception 'DESTINO_JA_COMECOU'; end if;

  if exists (select 1 from club_reservas r2
              where r2.ocorrencia_id = v_doc.id and r2.cliente_id = v_cli
                and r2.status <> 'cancelado') then
    raise exception 'JA_TEM_NESSA_AULA';
  end if;

  -- Destino precisa de vaga física (aqui falta LIBERA vaga: só reservado+presente)
  select count(*) into v_usadas
    from club_reservas where ocorrencia_id = v_doc.id and status in ('reservado', 'presente');

  if v_daula.tipo = 'running_funcional' then
    if v_pos is null then
      -- primeira posição realmente livre (respeita bloqueio global e pontual)
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

  update club_reservas
     set ocorrencia_id           = p_destino_ocorrencia_id,
         posicao                 = v_pos,
         trocado_pelo_cliente_em = now(),
         troca_cliente_de        = v_hora_orig || ' | ' || v_oc.id::text
   where id = v_res.id;

  return json_build_object('ok', true, 'reserva_id', v_res.id,
                           'de', v_hora_orig, 'para', v_hora_dest, 'posicao', v_pos);
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6) Permissões: só usuário logado. Anônimo não tem auth.uid() — nem chama.
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function ct_grade_do_dia(uuid, date)                    from public, anon;
revoke all on function opcoes_troca_cliente(text, uuid)               from public, anon;
revoke all on function trocar_horario_ct_cliente(uuid, text)          from public, anon;
revoke all on function trocar_aula_club_cliente(uuid, uuid, text)     from public, anon;

grant execute on function ct_grade_do_dia(uuid, date)                 to authenticated;
grant execute on function opcoes_troca_cliente(text, uuid)            to authenticated;
grant execute on function trocar_horario_ct_cliente(uuid, text)       to authenticated;
grant execute on function trocar_aula_club_cliente(uuid, uuid, text)  to authenticated;
