-- Wellhub: enfileirar sync quando o STATUS da ocorrência muda
--
-- O trg_sync_wellhub_ocorrencia já existia, mas só em
-- `AFTER UPDATE OF vagas_wellhub, vagas_bloqueadas` — cancelar a ocorrência
-- (feriado, por exemplo) não enfileirava nada e o slot seguia reservável no app
-- do Wellhub. Mesma lacuna que a TotalPass tinha
-- (supabase/totalpass-sync-ocorrencia-cancelada.sql).
--
-- Aqui só a LISTA DE COLUNAS muda: `status` entra junto das vagas. Mantido sem
-- cláusula WHEN, igual ao trigger antigo — o worker é idempotente e o custo de
-- um PATCH redundante é baixo; mudar isso agora alteraria um comportamento que
-- já está de pé.
--
-- A função enfileirar_sync_wellhub_ocorrencia() não muda: continua sendo o
-- INSERT ... ON CONFLICT na wellhub_slot_sync_queue, à prova de falha.
--
-- Quem trata a ocorrência cancelada é /api/wellhub/sync-slots (fecharSlot):
-- a Booking API do Wellhub não deleta slot nem classe, então fechar = zerar a
-- capacidade (com fallback para "esgotado" se a conta recusar o zero).

drop trigger if exists trg_sync_wellhub_ocorrencia on public.club_ocorrencias;

create trigger trg_sync_wellhub_ocorrencia
after update of status, vagas_wellhub, vagas_bloqueadas on public.club_ocorrencias
for each row
execute function public.enfileirar_sync_wellhub_ocorrencia();
