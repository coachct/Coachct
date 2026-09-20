-- Bloqueio de posição passa a empurrar a capacidade nova pros parceiros.
--
-- Até aqui, a capacidade que vai pra TotalPass/Wellhub só era recalculada quando
-- ENTRAVA OU SAÍA RESERVA (triggers em club_reservas / club_ocorrencias). Bloquear
-- uma posição — que é exatamente tirar uma vaga da aula — não disparava nada: a vaga
-- travada continuava anunciada no app do parceiro até alguém reservar ou cancelar
-- por acaso. Incidente 20/09/2026, Vila Olímpia, Running 11:00: R04 bloqueada às
-- 07:16 e a aula seguiu oferecendo a mesma capacidade nos dois apps.
--
-- Dois caminhos, porque o alcance é diferente:
--   1) bloqueio PONTUAL (club_posicoes_bloqueios_ocorrencia): mexe em UMA ocorrência
--      → enfileira + push imediato, igual a uma reserva.
--   2) bloqueio GLOBAL (club_posicoes.bloqueado / ativo): vale pra TODA aula futura
--      da unidade → só ENFILEIRA as ocorrências futuras já publicadas. O cron de 2
--      min drena. Push imediato aqui viraria uma rajada de dezenas de chamadas na API
--      deles num clique só.
--
-- À prova de falha: erro no sync nunca derruba o bloqueio (tudo em exception block).

-- 1) BLOQUEIO PONTUAL — uma ocorrência, push na hora.
create or replace function enfileirar_sync_bloqueio_posicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc uuid;
begin
  v_oc := coalesce(new.ocorrencia_id, old.ocorrencia_id);

  begin
    insert into totalpass_slot_sync_queue (ocorrencia_id, enfileirado_em)
    values (v_oc, now())
    on conflict (ocorrencia_id) do update
      set enfileirado_em = now(), tentativas = 0, ultimo_erro = null;
  exception when others then
    raise warning '[totalpass] enfileirar sync (bloqueio posicao) falhou (ignorado): %', sqlerrm;
  end;

  begin
    insert into wellhub_slot_sync_queue (ocorrencia_id, enfileirado_em)
    values (v_oc, now())
    on conflict (ocorrencia_id) do update set enfileirado_em = now();
  exception when others then
    raise warning '[wellhub] enfileirar sync (bloqueio posicao) falhou (ignorado): %', sqlerrm;
  end;

  perform push_sync_totalpass(v_oc);
  perform push_sync_wellhub(v_oc);

  return null;
end $$;

drop trigger if exists trg_sync_parceiros_bloqueio_posicao on club_posicoes_bloqueios_ocorrencia;
create trigger trg_sync_parceiros_bloqueio_posicao
after insert or delete on club_posicoes_bloqueios_ocorrencia
for each row execute function enfileirar_sync_bloqueio_posicao();

-- 2) BLOQUEIO GLOBAL — toda aula futura da unidade, só enfileira.
create or replace function enfileirar_sync_bloqueio_posicao_global()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  begin
    insert into totalpass_slot_sync_queue (ocorrencia_id, enfileirado_em)
    select m.ocorrencia_id, now()
    from totalpass_slot_map m
    join club_ocorrencias o on o.id = m.ocorrencia_id
    join club_aulas a on a.id = o.aula_id
    where a.unidade_id = new.unidade_id
      and a.tipo = 'running_funcional'   -- só o modelo por posição usa bloqueio de posição
      and o.data >= v_hoje
      and o.status <> 'cancelada'
    on conflict (ocorrencia_id) do update
      set enfileirado_em = now(), tentativas = 0, ultimo_erro = null;
  exception when others then
    raise warning '[totalpass] enfileirar sync (bloqueio global) falhou (ignorado): %', sqlerrm;
  end;

  begin
    insert into wellhub_slot_sync_queue (ocorrencia_id, enfileirado_em)
    select m.ocorrencia_id, now()
    from wellhub_slot_map m
    join club_ocorrencias o on o.id = m.ocorrencia_id
    join club_aulas a on a.id = o.aula_id
    where a.unidade_id = new.unidade_id
      and a.tipo = 'running_funcional'
      and o.data >= v_hoje
      and o.status <> 'cancelada'
    on conflict (ocorrencia_id) do update set enfileirado_em = now();
  exception when others then
    raise warning '[wellhub] enfileirar sync (bloqueio global) falhou (ignorado): %', sqlerrm;
  end;

  return null;
end $$;

drop trigger if exists trg_sync_parceiros_bloqueio_global on club_posicoes;
create trigger trg_sync_parceiros_bloqueio_global
after update of bloqueado, ativo on club_posicoes
for each row
when (old.bloqueado is distinct from new.bloqueado or old.ativo is distinct from new.ativo)
execute function enfileirar_sync_bloqueio_posicao_global();
