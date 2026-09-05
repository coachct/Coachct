-- Wellhub: sincronizar a capacidade NA HORA (espelho do totalpass-sync-instantaneo)
--
-- Mesmo furo do incidente da TotalPass em 05/09/2026: a capacidade só era
-- empurrada pelo worker /api/wellhub/sync-slots, que roda de 2 em 2 minutos.
-- Entre a reserva que lota a aula aqui e o PATCH que fecha a vaga lá cabiam até
-- 2 minutos de aula lotada aparecendo com vaga no app do parceiro.
--
-- A fila continua igual (rede de segurança); o trigger passa a empurrar na hora
-- via pg_net pra /api/wellhub/sync-slots?oc=<ocorrencia>. Só dispara em
-- ocorrência publicada (wellhub_slot_map) e futura, e só em escrita que muda a
-- conta de vagas — presença/falta não geram chamada. Qualquer erro no push vira
-- WARNING: a reserva do cliente nunca cai por causa disso.

create or replace function public.push_sync_wellhub(p_oc uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_vale boolean;
begin
  if p_oc is null then return; end if;

  select exists (
    select 1
    from wellhub_slot_map m
    join club_ocorrencias o on o.id = m.ocorrencia_id
    where m.ocorrencia_id = p_oc
      and o.data >= (now() at time zone 'America/Sao_Paulo')::date
  ) into v_vale;
  if not v_vale then return; end if;

  perform net.http_post(
    url := 'https://coach-ct.vercel.app/api/wellhub/sync-slots?oc=' || p_oc::text,
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer justct-cron-2026"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning '[wellhub] push imediato falhou (ignorado): %', sqlerrm;
end $function$;

create or replace function public.enfileirar_sync_wellhub()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_oc uuid;
  v_muda_conta boolean;
begin
  v_oc := coalesce(new.ocorrencia_id, old.ocorrencia_id);

  begin
    insert into wellhub_slot_sync_queue (ocorrencia_id, enfileirado_em)
    values (v_oc, now())
    on conflict (ocorrencia_id) do update set enfileirado_em = now();

    -- Troca de aula: a ocorrência de origem também mudou de conta (antes ficava
    -- de fora da fila — só o destino era enfileirado).
    if tg_op = 'UPDATE' and old.ocorrencia_id is distinct from new.ocorrencia_id then
      insert into wellhub_slot_sync_queue (ocorrencia_id, enfileirado_em)
      values (old.ocorrencia_id, now())
      on conflict (ocorrencia_id) do update set enfileirado_em = now();
    end if;
  exception when others then
    raise warning '[wellhub] enfileirar_sync falhou (ignorado): %', sqlerrm;
  end;

  v_muda_conta := case tg_op
    when 'INSERT' then new.status is distinct from 'cancelado'
    when 'DELETE' then true
    else
      (old.status = 'cancelado') is distinct from (new.status = 'cancelado')
      or old.ocorrencia_id is distinct from new.ocorrencia_id
      or old.via_app is distinct from new.via_app
  end;

  if coalesce(v_muda_conta, false) then
    perform push_sync_wellhub(v_oc);
    if tg_op = 'UPDATE' and old.ocorrencia_id is distinct from new.ocorrencia_id then
      perform push_sync_wellhub(old.ocorrencia_id);
    end if;
  end if;

  return null;
end $function$;

create or replace function public.enfileirar_sync_wellhub_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    insert into wellhub_slot_sync_queue (ocorrencia_id, enfileirado_em)
    values (new.id, now())
    on conflict (ocorrencia_id) do update set enfileirado_em = now();
  exception when others then
    raise warning '[wellhub] enfileirar sync (ocorrencia) falhou (ignorado): %', sqlerrm;
  end;

  -- O trigger daqui não tem cláusula WHEN (dispara mesmo quando a coluna é só
  -- mencionada no UPDATE), então a guarda de mudança real fica na função.
  if old.status is distinct from new.status
     or old.vagas_wellhub is distinct from new.vagas_wellhub
     or old.vagas_bloqueadas is distinct from new.vagas_bloqueadas then
    perform push_sync_wellhub(new.id);
  end if;

  return new;
end $function$;
