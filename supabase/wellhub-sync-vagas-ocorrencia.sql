-- wellhub-sync-vagas-ocorrencia.sql
-- Enfileira o sync do Wellhub quando as vagas de uma OCORRÊNCIA mudam
-- (vagas_wellhub via botão "Vagas no Wellhub", ou vagas_bloqueadas).
--
-- Sem isso, mudar o número no botão só alterava o banco — o app do Wellhub não
-- atualizava. Agora a ocorrência é reenfileirada e o cron sync-slots empurra o
-- novo total em ~2 min.
--
-- À prova de falha (SECURITY DEFINER + EXCEPTION): nunca derruba o update da
-- ocorrência (que é fluxo crítico — cancelar aula, bloquear vaga, etc.).

CREATE OR REPLACE FUNCTION enfileirar_sync_wellhub_ocorrencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO wellhub_slot_sync_queue (ocorrencia_id, enfileirado_em)
    VALUES (NEW.id, now())
    ON CONFLICT (ocorrencia_id) DO UPDATE SET enfileirado_em = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[wellhub] enfileirar sync (ocorrencia) falhou (ignorado): %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_wellhub_ocorrencia ON club_ocorrencias;
CREATE TRIGGER trg_sync_wellhub_ocorrencia
AFTER UPDATE OF vagas_wellhub, vagas_bloqueadas ON club_ocorrencias
FOR EACH ROW EXECUTE FUNCTION enfileirar_sync_wellhub_ocorrencia();
