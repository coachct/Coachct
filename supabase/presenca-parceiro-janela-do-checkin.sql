-- Presenca por check-in (Wellhub + TotalPass): so a aula da janela do check-in
--
-- BUG (26/08/2026): clientes apareciam com PRESENCA em aulas que ainda nao tinham
-- acontecido. Duas falhas somadas:
--
--   1) wellhub_conciliar_presencas reprocessa os check-ins das ultimas 6h a cada
--      2 min, mas a RPC compara com "hoje" no fuso de Sao Paulo. Um check-in
--      feito entre 18h e 23h continuava sendo reprocessado depois da meia-noite,
--      quando "hoje" ja era o dia seguinte -> o check-in de ontem caia na reserva
--      de hoje. (Casos reais: Nasta Curi 26/08 12:15 e isabelle silveira costa
--      26/08 19:30, ambas VO, marcadas por check-ins do dia 25.)
--
--   2) As duas RPCs (Wellhub e TotalPass) marcavam presente TODAS as reservas do
--      cliente naquele dia/unidade, sem olhar o horario da aula. Quem fazia
--      check-in as 7h e tinha outra aula as 19h ja saia presente na de 19h.
--
-- CORRECAO:
--   * A conciliacao do Wellhub so reprocessa check-in do proprio dia (SP).
--   * As duas RPCs so marcam a reserva cuja aula esta na janela do check-in.
--     Wellhub: -3h / +1h  (o cron roda a cada 2 min e marca quando a aula entra
--     na janela, entao a folga para frente pode ser curta).
--     TotalPass: -3h / +2h (marca uma vez so, no webhook, sem reconciliacao;
--     check-in que chegar mais de 2h antes da aula fica para a recepcao marcar).

CREATE OR REPLACE FUNCTION public.wellhub_marcar_presenca_por_checkin(p_gympass_id text, p_gym_id text, p_email text DEFAULT NULL::text, p_nome text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_unidade uuid;
  v_cliente uuid;
  v_ids uuid[];
  v_agora timestamp := (now() at time zone 'America/Sao_Paulo');
  v_hoje date := v_agora::date;
  v_marcadas integer := 0;
begin
  select id into v_unidade from unidades where wellhub_gym_id = p_gym_id;
  if v_unidade is null then return 0; end if;

  -- Tier 1: identidade forte (wellhub_id ou email) ENTRE as reservas de hoje
  select array_agg(distinct r.cliente_id) into v_ids
  from club_reservas r
  join club_ocorrencias o on o.id = r.ocorrencia_id
  join club_aulas a       on a.id = o.aula_id
  join clientes c         on c.id = r.cliente_id
  where a.unidade_id = v_unidade and o.data = v_hoje
    and r.status = 'reservado' and r.tipo_credito ilike 'wellhub%'
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
      and r.status = 'reservado' and r.tipo_credito ilike 'wellhub%'
      and lower(c.nome) = lower(p_nome);
    if array_length(v_ids,1) = 1 then v_cliente := v_ids[1]; end if;
  end if;

  if v_cliente is null then return 0; end if;

  -- self-heal: wellhub_id so na conta certa (limpa de fantasmas)
  update clientes set wellhub_id = null where wellhub_id = p_gympass_id and id <> v_cliente;
  update clientes set wellhub_id = p_gympass_id where id = v_cliente and coalesce(wellhub_id,'') <> p_gympass_id;

  with alvo as (
    select r.id from club_reservas r
    join club_ocorrencias o on o.id = r.ocorrencia_id
    join club_aulas a       on a.id = o.aula_id
    where r.cliente_id = v_cliente and a.unidade_id = v_unidade
      and o.data = v_hoje and r.status = 'reservado' and r.tipo_credito ilike 'wellhub%'
      and (o.data + a.horario) between v_agora - interval '3 hours' and v_agora + interval '1 hour'
  )
  update club_reservas r set status = 'presente'
  from alvo where r.id = alvo.id and r.status = 'reservado';
  get diagnostics v_marcadas = row_count;
  return v_marcadas;
end $function$;

CREATE OR REPLACE FUNCTION public.wellhub_conciliar_presencas(p_janela_horas integer DEFAULT 6)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_marcadas integer := 0; v_rec record; v_r integer;
begin
  for v_rec in
    select e.id_externo as gympass_id,
           (e.raw->'event_data'->'gym'->>'id') as gym_id,
           (e.raw->'event_data'->'user'->>'email') as email,
           nullif(trim(coalesce(e.raw->'event_data'->'user'->>'first_name','') || ' ' ||
                       coalesce(e.raw->'event_data'->'user'->>'last_name','')), '') as nome
    from entradas_walkin e
    where e.origem = 'wellhub' and e.status <> 'erro'
      and e.recebido_em > now() - make_interval(hours => p_janela_horas)
      -- so check-in do proprio dia (SP): evita que um check-in da noite anterior
      -- seja reprocessado depois da virada e caia na reserva do dia seguinte
      and (e.recebido_em at time zone 'America/Sao_Paulo')::date
          = (now() at time zone 'America/Sao_Paulo')::date
  loop
    v_r := wellhub_marcar_presenca_por_checkin(v_rec.gympass_id, v_rec.gym_id, v_rec.email, v_rec.nome);
    v_marcadas := v_marcadas + coalesce(v_r, 0);
  end loop;
  return v_marcadas;
end $function$;

CREATE OR REPLACE FUNCTION public.totalpass_marcar_presenca_por_checkin(p_cpf text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agora     timestamp := (now() at time zone 'America/Sao_Paulo');
  v_hoje      date      := v_agora::date;
  v_cpf       text      := regexp_replace(coalesce(p_cpf,''), '\D', '', 'g');
  v_tolerancia interval := interval '30 minutes';
  v_marcadas  int := 0;
begin
  if v_cpf = '' then
    return 0;
  end if;

  with alvo as (
    select r.id
    from club_reservas r
    join club_ocorrencias o on o.id = r.ocorrencia_id
    join club_aulas a       on a.id = o.aula_id
    join clientes c         on c.id = r.cliente_id
    where regexp_replace(coalesce(c.cpf,''), '\D', '', 'g') = v_cpf
      and o.data = v_hoje
      and r.tipo_credito ilike 'totalpass%'
      and (
        (
          r.status = 'reservado'
          and (o.data + a.horario) between v_agora - interval '3 hours'
                                       and v_agora + interval '2 hours'
        )
        or (
          -- atraso: aula ja comecou e a falta automatica pegou antes do check-in
          r.status = 'falta'
          and v_agora >= (o.data + a.horario)
          and v_agora <= (o.data + a.horario + v_tolerancia)
        )
      )
  )
  update club_reservas r
  set status = 'presente'
  from alvo
  where r.id = alvo.id
    and r.status in ('reservado', 'falta');

  get diagnostics v_marcadas = row_count;
  return v_marcadas;
end $function$;
