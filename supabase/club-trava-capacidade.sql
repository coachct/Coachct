-- club-trava-capacidade.sql
-- Trava de capacidade server-side para aulas Lift / LFG em club_reservas.
--
-- PROBLEMA: a capacidade só é checada no front (vagasInfo() em aulas/page.tsx
-- decide qual botão mostrar), mas confirmarReserva() faz o INSERT em
-- club_reservas SEM validação server-side. É um check-then-act sem lock: dois
-- clientes simultâneos (sábado de pico) leem usadas < capacidade ao mesmo tempo
-- e ambos inserem -> overbooking (caso real: aula com 25 reservas, capacidade 24).
--
-- Running NÃO é afetado: é por posição e já está protegido pelo índice único
-- parcial club_reservas_posicao_unique. O furo é exclusivo de Lift/LFG.
--
-- SOLUÇÃO: trigger BEFORE INSERT OR UPDATE OF status que, só em aulas não-Running
-- e só quando a operação ADICIONA um ocupante, tira pg_advisory_xact_lock na
-- ocorrência (mata a race), conta ocupantes (status IN reservado/presente) e
-- rejeita acima de capacidade - vagas_bloqueadas. Cobre os 7 caminhos de escrita
-- (app, recepção walk-in, recepção/clientes, admin calendário, WhatsApp, booking
-- Wellhub futuro; mapa/Running é ignorado).
--
-- ADITIVO e reversível em segundos (rollback no fim). NÃO conserta overbook
-- legado — só impede novos.
--
-- Pré-checagens já confirmadas contra o código de produção:
--   * vagasInfo() (aulas/page.tsx:466): cap - (vagas_bloqueadas||0) p/ não-Running.
--   * Ocupação = status IN ('reservado','presente') (aulas/page.tsx 237/318/344;
--     recepcao/club/[id]/page.tsx).
--   * tipo discriminador 'running_funcional' em club_aulas.
--   * join club_ocorrencias.aula_id = club_aulas.id.


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 0a — Diagnóstico: quão espalhado está o overbooking hoje
-- (últimos 7 dias, Lift/LFG). Rodar ANTES de aplicar. Não altera nada.
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT o.id AS ocorrencia_id, o.data, a.tipo, a.capacidade,
--        COALESCE(o.vagas_bloqueadas,0) AS bloqueadas,
--        count(*) FILTER (WHERE r.status IN ('reservado','presente')) AS ocupadas
-- FROM club_ocorrencias o
-- JOIN club_aulas a ON a.id = o.aula_id
-- LEFT JOIN club_reservas r ON r.ocorrencia_id = o.id
-- WHERE a.tipo <> 'running_funcional'
--   AND o.data >= current_date - 7
-- GROUP BY o.id, o.data, a.tipo, a.capacidade, o.vagas_bloqueadas
-- HAVING count(*) FILTER (WHERE r.status IN ('reservado','presente'))
--        > a.capacidade - COALESCE(o.vagas_bloqueadas,0)
-- ORDER BY o.data DESC;

-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 0b — Confirmar que não há trigger de mesmo nome
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'club_reservas'::regclass AND NOT tgisinternal;


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 1 — A trava
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION club_reservas_check_capacidade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tipo          text;
  v_capacidade    int;
  v_bloqueadas    int;
  v_ocupadas      int;
  v_cap_efetiva   int;
  v_adiciona_vaga boolean;
BEGIN
  -- Só checa quando a operação ADICIONA um ocupante:
  --   INSERT entrando como reservado/presente, OU
  --   UPDATE de um status que não ocupava -> que ocupa.
  -- Assim reservado<->presente não dispara, e marcar presença numa aula com
  -- overbook legado (ex.: a de 25) continua funcionando.
  IF TG_OP = 'INSERT' THEN
    v_adiciona_vaga := NEW.status IN ('reservado','presente');
  ELSE -- UPDATE
    v_adiciona_vaga := (OLD.status IS DISTINCT FROM NEW.status)
                       AND NEW.status IN ('reservado','presente')
                       AND OLD.status NOT IN ('reservado','presente');
  END IF;

  IF NOT v_adiciona_vaga THEN
    RETURN NEW;
  END IF;

  SELECT a.tipo, a.capacidade, COALESCE(o.vagas_bloqueadas,0)
    INTO v_tipo, v_capacidade, v_bloqueadas
  FROM club_ocorrencias o
  JOIN club_aulas a ON a.id = o.aula_id
  WHERE o.id = NEW.ocorrencia_id;

  -- Running é por posição (índice único parcial já protege). Não aplica.
  IF v_tipo IS NULL OR v_tipo = 'running_funcional' THEN
    RETURN NEW;
  END IF;

  -- Serializa inserts concorrentes da MESMA ocorrência (mata a race).
  PERFORM pg_advisory_xact_lock(
    hashtext('club_reservas_cap'),
    hashtext(NEW.ocorrencia_id::text)
  );

  v_cap_efetiva := GREATEST(0, v_capacidade - v_bloqueadas);

  SELECT count(*) INTO v_ocupadas
  FROM club_reservas
  WHERE ocorrencia_id = NEW.ocorrencia_id
    AND status IN ('reservado','presente')
    AND id <> NEW.id;

  IF v_ocupadas + 1 > v_cap_efetiva THEN
    RAISE EXCEPTION 'AULA_LOTADA: capacidade % atingida (% ocupadas)',
      v_cap_efetiva, v_ocupadas
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_club_reservas_capacidade ON club_reservas;
CREATE TRIGGER trg_club_reservas_capacidade
  BEFORE INSERT OR UPDATE OF status ON club_reservas
  FOR EACH ROW
  EXECUTE FUNCTION club_reservas_check_capacidade();


-- ───────────────────────────────────────────────────────────────────────────
-- PASSO 2 — Validação pós-aplicação
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'club_reservas'::regclass
--   AND tgname = 'trg_club_reservas_capacidade';
--
-- Teste com ROLLBACK (não grava):
-- BEGIN;
--   -- pegue um ocorrencia_id Lift/LFG cheio e um cliente_id qualquer:
--   -- INSERT INTO club_reservas (ocorrencia_id, cliente_id, tipo_credito, status)
--   --   VALUES ('<oc_cheia>', '<cliente>', 'avulso', 'reservado');
--   -- deve falhar com: ERROR: AULA_LOTADA: capacidade N atingida ...
-- ROLLBACK;


-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (reversível em segundos, sem efeito colateral em dados)
-- ───────────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_club_reservas_capacidade ON club_reservas;
-- DROP FUNCTION IF EXISTS club_reservas_check_capacidade();
