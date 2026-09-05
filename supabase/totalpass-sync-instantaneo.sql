-- TotalPass: sincronizar a capacidade NA HORA, não só a cada 2 minutos
--
-- Incidente 05/09/2026 (Vila Olímpia): aulas lotadas continuavam aparecendo com
-- vaga no app da TotalPass. O cliente reservava lá e, no poll seguinte, o
-- pull-bookings via que não havia vaga e cancelava o slot dele — reserva feita e
-- desfeita, cliente reclamando.
--
-- A conta em si estava certa (conferido no diag-ocorrencia: slots que mandamos =
-- capacidade que sobra, slotsInUse deles bate). O problema era só de TEMPO: a
-- capacidade só era empurrada pelo worker /api/totalpass/sync-slots, que roda de
-- 2 em 2 minutos (cron job 'totalpass-sync-slots'). Entre a reserva que lotou a
-- aula aqui e o PUT que fecha a vaga lá cabiam até 2 minutos — e o pull de
-- reservas deles roda a cada 1 minuto, então dava tempo de sobra pra entrar
-- reserva no buraco.
--
-- Aqui a fila deixa de ser o único caminho: além de enfileirar (rede de
-- segurança, inalterada), o trigger dispara na hora um POST assíncrono via
-- pg_net pra /api/totalpass/sync-slots?oc=<ocorrencia>, que sincroniza só
-- aquela ocorrência. O cron de 2 min continua ligado e conserta o que o push
-- perder (deploy fora do ar, timeout, kill switch religado).
--
-- Só empurra o que faz diferença:
--   * ocorrência publicada na TotalPass (existe em totalpass_slot_map) e futura;
--   * escrita que MUDA a conta de vagas — entrar, sair, cancelar, descancelar,
--     trocar de aula. Marcar presença/falta não mexe na capacidade e não dispara
--     nada (senão cada check-in viraria uma chamada à API deles).
--
-- Tudo à prova de falha: qualquer erro no push vira WARNING e a reserva do
-- cliente segue normal.

-- ── Push assíncrono de uma ocorrência ────────────────────────────────────────
create or replace function public.push_sync_totalpass(p_oc uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_vale boolean;
begin
  if p_oc is null then return; end if;

  -- Não publicada na grade deles ou aula que já passou → nada a empurrar.
  select exists (
    select 1
    from totalpass_slot_map m
    join club_ocorrencias o on o.id = m.ocorrencia_id
    where m.ocorrencia_id = p_oc
      and o.data >= (now() at time zone 'America/Sao_Paulo')::date
  ) into v_vale;
  if not v_vale then return; end if;

  perform net.http_post(
    url := 'https://coach-ct.vercel.app/api/totalpass/sync-slots?oc=' || p_oc::text,
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer justct-cron-2026"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning '[totalpass] push imediato falhou (ignorado): %', sqlerrm;
end $function$;

-- ── Reservas: enfileira (como antes) + empurra na hora ───────────────────────
create or replace function public.enfileirar_sync_totalpass()
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
    insert into totalpass_slot_sync_queue (ocorrencia_id, enfileirado_em)
    values (v_oc, now())
    on conflict (ocorrencia_id) do update
      set enfileirado_em = now(), tentativas = 0, ultimo_erro = null;

    -- Troca de aula: a ocorrência de ORIGEM também mudou de conta e antes ficava
    -- de fora da fila (só o destino era enfileirado) — a vaga que abriu lá só
    -- aparecia no app deles quando outra escrita qualquer tocasse a aula.
    if tg_op = 'UPDATE' and old.ocorrencia_id is distinct from new.ocorrencia_id then
      insert into totalpass_slot_sync_queue (ocorrencia_id, enfileirado_em)
      values (old.ocorrencia_id, now())
      on conflict (ocorrencia_id) do update
        set enfileirado_em = now(), tentativas = 0, ultimo_erro = null;
    end if;
  exception when others then
    raise warning '[totalpass] enfileirar_sync falhou (ignorado): %', sqlerrm;
  end;

  -- Muda a conta de vagas? (a RPC totalpass_slot_numbers conta tudo que não está
  -- cancelado — então presente/falta/reservado dão na mesma).
  v_muda_conta := case tg_op
    when 'INSERT' then new.status is distinct from 'cancelado'
    when 'DELETE' then true
    else
      (old.status = 'cancelado') is distinct from (new.status = 'cancelado')
      or old.ocorrencia_id is distinct from new.ocorrencia_id
      or old.via_app is distinct from new.via_app
  end;

  if coalesce(v_muda_conta, false) then
    perform push_sync_totalpass(v_oc);
    if tg_op = 'UPDATE' and old.ocorrencia_id is distinct from new.ocorrencia_id then
      perform push_sync_totalpass(old.ocorrencia_id);
    end if;
  end if;

  return null;
end $function$;

-- ── Ocorrência (cancelar aula, bloquear vaga, mudar teto): idem ──────────────
create or replace function public.enfileirar_sync_totalpass_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    insert into totalpass_slot_sync_queue (ocorrencia_id, enfileirado_em)
    values (new.id, now())
    on conflict (ocorrencia_id) do update
      set enfileirado_em = now(), tentativas = 0, ultimo_erro = null;
  exception when others then
    raise warning '[totalpass] enfileirar sync (ocorrencia) falhou (ignorado): %', sqlerrm;
  end;

  -- O trigger já só dispara em mudança real de status/vagas — tudo aqui mexe na
  -- capacidade, então empurra sempre.
  perform push_sync_totalpass(new.id);

  return new;
end $function$;
