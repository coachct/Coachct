-- wellhub-booking-fase1.sql
-- Integração Wellhub Booking API (Fase 1) — espelha a grade Club no app deles
-- com pool compartilhado de capacidade e recebe reservas via app de volta.
--
-- Tudo aqui é ADITIVO e idempotente (ADD COLUMN IF NOT EXISTS / CREATE ... IF
-- NOT EXISTS), então pode rodar de cima a baixo sem quebrar nada existente.
-- Recomendado rodar bloco a bloco (M1..M10) e conferir cada um com os SELECTs
-- de verificação no fim do arquivo.
--
-- Pré-checagens já confirmadas contra o schema de produção:
--   * club_ocorrencias.aula_id existe (FK usada no M7).
--   * clientes: únicas NOT NULL relevantes são id (default uuid), nome (sem
--     default — fornecido no M9) e 4 booleanos com DEFAULT false. O INSERT do
--     shell no M9 passa limpo.
--   * Triggers de club_reservas:
--       - validar_duplicidade_reserva_club (BEFORE INSERT): a trava de
--         1/dia/unidade vale pra wellhub%/totalpass%. DECISÃO: vale também no
--         app — NÃO alteramos a função; o handler inbound captura o P0001 e
--         rejeita a 2ª reserva do dia no Wellhub.
--       - trigger_processar_fila_apos_cancelamento_club (AFTER UPDATE): só age
--         na transição p/ 'cancelado'. No LateCancelation marcamos 'falta', que
--         não dispara a fila (a vaga não volta — regra do Ricardo).


-- ───────────────────────────────────────────────────────────────────────────
-- M1 — vagas_wellhub por ocorrência
-- Override de vagas expostas ao Wellhub nesta aula. NULL = usa o default global.
-- 0 = pausado nesta aula específica.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE club_ocorrencias ADD COLUMN IF NOT EXISTS vagas_wellhub integer;
COMMENT ON COLUMN club_ocorrencias.vagas_wellhub IS
  'Override de vagas expostas ao Wellhub nesta ocorrência. NULL = usa wellhub_config.vagas_default. 0 = pausado nesta aula.';


-- ───────────────────────────────────────────────────────────────────────────
-- M2 — config global (vagas default + janela de cancelamento)
-- Linha única (id = true). Default 10 vagas, cancelamento 12h antes.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wellhub_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  vagas_default integer NOT NULL DEFAULT 10,
  cancelamento_horas integer NOT NULL DEFAULT 12,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO wellhub_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────────
-- M3 — estado de integração por unidade + gym_id do Wellhub
-- Pinheiros começa 'ativo'; Vila Olímpia 'desativado' (vira flag depois).
-- ───────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE wellhub_estado AS ENUM ('desativado','ativo','pausado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE unidades ADD COLUMN IF NOT EXISTS wellhub_gym_id text;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS wellhub_estado wellhub_estado NOT NULL DEFAULT 'desativado';

UPDATE unidades SET wellhub_gym_id='525930', wellhub_estado='ativo'
  WHERE id='166a683d-5fe6-4177-8fd6-53deb70b428e';   -- Pinheiros
UPDATE unidades SET wellhub_gym_id='285600', wellhub_estado='desativado'
  WHERE id='05eeab3e-5eae-4140-bc3a-1c1d56ac95be';   -- Vila Olímpia


-- ───────────────────────────────────────────────────────────────────────────
-- M4 — clientes: matching Wellhub (wellhub_id estável + origem do cadastro)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS wellhub_id text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS origem text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_wellhub_id
  ON clientes(wellhub_id) WHERE wellhub_id IS NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- M5 — club_reservas: discriminador via_app + nº de booking pra casar PATCH/cancel
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE club_reservas ADD COLUMN IF NOT EXISTS via_app boolean NOT NULL DEFAULT false;
ALTER TABLE club_reservas ADD COLUMN IF NOT EXISTS wellhub_booking_number text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_club_reservas_wellhub_booking
  ON club_reservas(wellhub_booking_number) WHERE wellhub_booking_number IS NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- M6 — outbox de sync (coalesce: no máx. 1 linha pendente por ocorrência)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wellhub_slot_sync_queue (
  ocorrencia_id uuid PRIMARY KEY REFERENCES club_ocorrencias(id) ON DELETE CASCADE,
  enfileirado_em timestamptz NOT NULL DEFAULT now()
);


-- ───────────────────────────────────────────────────────────────────────────
-- M7 — RPC de capacidade (pool compartilhado)
-- Retorna o par absoluto que o Wellhub espera:
--   total_capacity = min(vagas_wellhub_resolved, capacidade - bloqueadas - proprias)
--   total_booked   = reservas via app (não-canceladas)
-- DEPENDE de M1 (vagas_wellhub), M2 (wellhub_config) e M5 (via_app).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION wellhub_slot_numbers(p_ocorrencia_id uuid)
RETURNS TABLE (total_capacity integer, total_booked integer)
LANGUAGE sql STABLE AS $$
  WITH oc AS (
    SELECT o.id, o.vagas_bloqueadas, o.vagas_wellhub, a.capacidade
    FROM club_ocorrencias o
    JOIN club_aulas a ON a.id = o.aula_id
    WHERE o.id = p_ocorrencia_id
  ),
  cfg AS (SELECT vagas_default FROM wellhub_config WHERE id IS TRUE),
  r AS (
    SELECT
      count(*) FILTER (WHERE via_app = false) AS proprias,
      count(*) FILTER (WHERE via_app = true)  AS via_app
    FROM club_reservas
    WHERE ocorrencia_id = p_ocorrencia_id AND status <> 'cancelado'
  )
  SELECT
    GREATEST(0, LEAST(
      COALESCE(oc.vagas_wellhub, cfg.vagas_default),
      oc.capacidade - COALESCE(oc.vagas_bloqueadas,0) - r.proprias
    ))::int AS total_capacity,
    r.via_app::int AS total_booked
  FROM oc, cfg, r;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- M8 — trigger de enfileiramento (captura TODOS os caminhos de escrita)
-- "Burro" de propósito: sempre enfileira. O worker filtra por unidade integrada.
-- Coalescing pelo PK garante 1 linha pendente por ocorrência.
-- DEPENDE de M6.
--
-- CRÍTICO: roda em TODA escrita de club_reservas, então NUNCA pode derrubar uma
-- reserva. Por isso:
--   * SECURITY DEFINER → o INSERT na fila roda como o dono (bypassa a RLS da
--     fila); senão a reserva feita por um cliente (role authenticated) quebra
--     com "new row violates row-level security policy".
--   * BEGIN/EXCEPTION → se o enfileiramento falhar por qualquer motivo, é
--     ignorado e a reserva passa; o cron de sync reconcilia depois.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enfileirar_sync_wellhub()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_oc uuid;
BEGIN
  v_oc := COALESCE(NEW.ocorrencia_id, OLD.ocorrencia_id);
  BEGIN
    INSERT INTO wellhub_slot_sync_queue (ocorrencia_id, enfileirado_em)
    VALUES (v_oc, now())
    ON CONFLICT (ocorrencia_id) DO UPDATE SET enfileirado_em = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[wellhub] enfileirar_sync falhou (ignorado): %', SQLERRM;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_wellhub ON club_reservas;
CREATE TRIGGER trg_sync_wellhub
AFTER INSERT OR UPDATE OR DELETE ON club_reservas
FOR EACH ROW EXECUTE FUNCTION enfileirar_sync_wellhub();


-- ───────────────────────────────────────────────────────────────────────────
-- M9 — matching de cadastro (wellhub_id → email → shell)
-- SECURITY DEFINER: roda com privilégio do dono pra inserir o shell mesmo via RLS.
-- INSERT mínimo confirmado seguro (id/booleanos têm default; nome é fornecido).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION wellhub_resolver_cliente(
  p_wellhub_id text, p_email text, p_first text, p_last text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_nome text;
BEGIN
  -- 1) já existe por wellhub_id
  SELECT id INTO v_id FROM clientes WHERE wellhub_id = p_wellhub_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 2) match por email (normalizado), se o cadastro ainda não tem outro wellhub_id
  IF p_email IS NOT NULL AND length(trim(p_email)) > 0 THEN
    SELECT id INTO v_id FROM clientes
    WHERE lower(trim(email)) = lower(trim(p_email))
      AND (wellhub_id IS NULL)
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE clientes SET wellhub_id = p_wellhub_id WHERE id = v_id;
      RETURN v_id;
    END IF;
    -- conflito: email casa mas já tem outro wellhub_id → NÃO mescla, cai pra shell e loga
    IF EXISTS (SELECT 1 FROM clientes WHERE lower(trim(email))=lower(trim(p_email)) AND wellhub_id IS NOT NULL AND wellhub_id <> p_wellhub_id) THEN
      RAISE WARNING '[wellhub] conflito de email % com wellhub_id existente — criando shell', p_email;
    END IF;
  END IF;

  -- 3) shell
  v_nome := NULLIF(trim(concat_ws(' ', p_first, p_last)), '');
  INSERT INTO clientes (nome, email, wellhub_id, origem)
  VALUES (COALESCE(v_nome, 'Cliente Wellhub'), NULLIF(trim(p_email),''), p_wellhub_id, 'wellhub')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- M10 — mapas ocorrência↔slot e modalidade↔classe (pro worker achar o que PATCHear)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wellhub_class_map (
  gym_id text NOT NULL,
  tipo_aula text NOT NULL,            -- 'lift' | 'lfg' | 'running_funcional'
  wellhub_class_id text NOT NULL,
  PRIMARY KEY (gym_id, tipo_aula)
);

CREATE TABLE IF NOT EXISTS wellhub_slot_map (
  ocorrencia_id uuid PRIMARY KEY REFERENCES club_ocorrencias(id) ON DELETE CASCADE,
  gym_id text NOT NULL,
  wellhub_class_id text NOT NULL,
  wellhub_slot_id text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois pra confirmar; nada aqui altera dados)
-- ═══════════════════════════════════════════════════════════════════════════
-- M1/M5: colunas novas em club_ocorrencias / club_reservas
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='club_ocorrencias' AND column_name='vagas_wellhub';
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='club_reservas' AND column_name IN ('via_app','wellhub_booking_number');
--
-- M2: config global
--   SELECT * FROM wellhub_config;
--
-- M3: estado por unidade
--   SELECT id, wellhub_gym_id, wellhub_estado FROM unidades
--   WHERE id IN ('166a683d-5fe6-4177-8fd6-53deb70b428e','05eeab3e-5eae-4140-bc3a-1c1d56ac95be');
--
-- M7: RPC de capacidade (troque pelo id de uma ocorrência Club real de Pinheiros)
--   SELECT * FROM wellhub_slot_numbers('<ocorrencia_id>');
--
-- M8: trigger criado
--   SELECT tgname FROM pg_trigger WHERE tgname='trg_sync_wellhub';
--
-- M9: função criada
--   SELECT proname FROM pg_proc WHERE proname='wellhub_resolver_cliente';
