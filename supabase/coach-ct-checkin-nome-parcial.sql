-- coach_ct_presenca_por_checkin: casamento por NOME PARCIAL (19/10/2026)
--
-- Caso: Rafael Azoubel reservou Coach CT com Wellhub, sem wellhub_id/wellhub_email
-- no cadastro, e o e-mail do Wellhub era o corporativo. O nome do payload veio
-- "Rafael Azoubel Sales Dantas" e o cadastro tinha "Rafael Azoubel" — o fallback
-- exigia nome IDÊNTICO, não casou, e o check-in em Musculação (modo errado) validou.
--
-- Agora: tenta nome idêntico; se não achar, aceita um nome contido no outro a
-- partir do início ("Rafael Azoubel" x "Rafael Azoubel Sales Dantas"), exigindo
-- pelo menos 2 palavras no nome mais curto. Continua valendo SÓ se der 1 único
-- cliente com agendamento Coach CT do parceiro hoje. Resto da função inalterado.

CREATE OR REPLACE FUNCTION public.coach_ct_presenca_por_checkin(p_origem text, p_cpf text DEFAULT NULL::text, p_wellhub_id text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_nome text DEFAULT NULL::text, p_modo text DEFAULT 'personal'::text, p_checkin_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_unidade   uuid := 'c28bf4bb-56f8-44ff-818a-c7836e58bcef';
  v_cliente   uuid;
  v_ids       uuid[];
  v_checkin   timestamp := coalesce(p_checkin_em at time zone 'America/Sao_Paulo',
                                    now()        at time zone 'America/Sao_Paulo');
  v_hoje      date      := v_checkin::date;
  v_hora      time      := v_checkin::time;
  v_janela    interval  := interval '90 minutes';
  v_antes     interval  := interval '3 hours';
  v_depois    interval  := interval '2 hours';
  v_ag        uuid;
  v_status    text;
  v_inicio    timestamp;
  v_cli_ag    uuid;
  v_pendente  uuid;
  v_nome      text := lower(regexp_replace(trim(coalesce(p_nome,'')), '\s+', ' ', 'g'));
  v_parceiro  text := case when p_origem = 'totalpass' then 'totalpass%' else 'wellhub%' end;
begin
  if p_origem = 'totalpass' then
    if coalesce(p_cpf,'') <> '' then
      select id into v_cliente from clientes
       where regexp_replace(coalesce(cpf,''),'\D','','g') = regexp_replace(p_cpf,'\D','','g')
         and regexp_replace(p_cpf,'\D','','g') <> ''
       limit 1;
    end if;
  else
    if coalesce(p_wellhub_id,'') <> '' then
      select id into v_cliente from clientes where wellhub_id = p_wellhub_id limit 1;
    end if;
    if v_cliente is null and coalesce(p_email,'') <> '' then
      select id into v_cliente from clientes
       where lower(email) = lower(p_email) or lower(wellhub_email) = lower(p_email)
       limit 1;
    end if;
  end if;

  -- Fallback por nome: 1º idêntico, 2º parcial (um contido no outro a partir do
  -- início, nome mais curto com 2+ palavras). Só aceita se der 1 único cliente.
  if v_cliente is null and v_nome <> '' then
    select array_agg(distinct a.cliente_id) into v_ids
    from agendamentos a
    join clientes c on c.id = a.cliente_id
    where a.unidade_id = v_unidade and a.data = v_hoje
      and a.status in ('agendado','confirmado','falta')
      and a.tipo_credito ilike v_parceiro
      and lower(regexp_replace(trim(c.nome), '\s+', ' ', 'g')) = v_nome;
    if array_length(v_ids,1) = 1 then v_cliente := v_ids[1]; end if;

    if v_cliente is null and coalesce(array_length(v_ids,1),0) = 0 then
      select array_agg(distinct a.cliente_id) into v_ids
      from agendamentos a
      join clientes c on c.id = a.cliente_id
      cross join lateral (select lower(regexp_replace(trim(c.nome), '\s+', ' ', 'g')) as n) cn
      where a.unidade_id = v_unidade and a.data = v_hoje
        and a.status in ('agendado','confirmado','falta')
        and a.tipo_credito ilike v_parceiro
        and (
          (position(' ' in cn.n) > 0 and v_nome like cn.n || ' %')
          or (position(' ' in v_nome) > 0 and cn.n like v_nome || ' %')
        );
      if array_length(v_ids,1) = 1 then v_cliente := v_ids[1]; end if;
    end if;
  end if;

  -- Self-heal do vínculo (como antes).
  if v_cliente is not null then
    if p_origem = 'totalpass' and coalesce(p_cpf,'') <> '' then
      update clientes set cpf = p_cpf
       where id = v_cliente
         and (cpf is null or regexp_replace(cpf,'\D','','g') = '');
    elsif p_origem <> 'totalpass' and coalesce(p_wellhub_id,'') <> '' then
      update clientes set wellhub_id = p_wellhub_id
       where id = v_cliente and coalesce(wellhub_id,'') <> p_wellhub_id;
    end if;
  end if;

  if v_cliente is null then return null; end if;

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
