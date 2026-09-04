-- TotalPass: enfileirar sync quando a OCORRÊNCIA muda (não só a reserva)
--
-- Lacuna descoberta no feriado de 07/09/2026: as ocorrências da grade normal
-- do Club foram para status='cancelada', mas a fila totalpass_slot_sync_queue
-- só era alimentada pelo trg_sync_totalpass, que dispara em club_reservas.
-- Sem item na fila, o worker /api/totalpass/sync-slots nunca rodou o DELETE —
-- as 20 aulas canceladas continuaram reserváveis no app da TotalPass, com a
-- grade de dia útil em cima do feriado.
--
-- O sync-slots já sabe o que fazer quando chega uma ocorrência cancelada
-- (deletarOcorrencia + limpa o totalpass_slot_map). Só faltava alguém chamar.
--
-- Espelha o trg_sync_wellhub_ocorrencia, com duas diferenças:
--   - cobre `status` além das vagas (é o campo do feriado);
--   - WHEN só dispara em mudança real de valor (AFTER UPDATE OF dispara mesmo
--     quando a coluna é só mencionada no UPDATE) — menos ruído na fila e menos
--     chamada à API deles.
--
-- Ocorrência que volta de cancelada para ativa é reenfileirada, mas o worker
-- não republica (sem mapa, ele pula): quem recria é o publish-slots das 05:00.

create or replace function public.enfileirar_sync_totalpass_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- À prova de falha: a fila é rede de segurança, nunca pode derrubar o UPDATE
  -- da ocorrência (cancelar feriado, bloquear vaga, trocar coach).
  begin
    insert into totalpass_slot_sync_queue (ocorrencia_id, enfileirado_em)
    values (new.id, now())
    on conflict (ocorrencia_id) do update
      set enfileirado_em = now(), tentativas = 0, ultimo_erro = null;
  exception when others then
    raise warning '[totalpass] enfileirar sync (ocorrencia) falhou (ignorado): %', sqlerrm;
  end;
  return new;
end $function$;

drop trigger if exists trg_sync_totalpass_ocorrencia on public.club_ocorrencias;

create trigger trg_sync_totalpass_ocorrencia
after update of status, vagas_totalpass, vagas_bloqueadas on public.club_ocorrencias
for each row
when (
  old.status is distinct from new.status
  or old.vagas_totalpass is distinct from new.vagas_totalpass
  or old.vagas_bloqueadas is distinct from new.vagas_bloqueadas
)
execute function public.enfileirar_sync_totalpass_ocorrencia();
