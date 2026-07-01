-- totalpass-booking-fase0.sql
-- Integração TotalPass Booking (Fase 0 — FUNDAÇÃO) — espelha a grade do Club
-- no app da TotalPass com pool compartilhado, só PINHEIROS. Espelho direto do
-- wellhub-booking-fase1.sql. Reaproveita o mesmo pool: as reservas via app
-- (Wellhub OU TotalPass) marcam club_reservas.via_app=true, então a capacidade
-- exposta a cada parceiro já desconta as reservas do outro naturalmente.
--
-- ADITIVO e idempotente (ADD COLUMN IF NOT EXISTS / CREATE ... IF NOT EXISTS).
-- Risco ZERO: não altera reserva/aula/pagamento existente. Recomendado rodar
-- bloco a bloco (T1..T10) e conferir com os SELECTs do fim.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ENV (NÃO vão no git — .env.local + Vercel):
--   TOTALPASS_PARTNER_API_KEY          -> já existe (947050ad-…)
--   TOTALPASS_API_BASE                 -> já existe (https://booking-api.totalpass.com)
--   TOTALPASS_PINHEIROS_PLACE_API_KEY  -> 7e8ab4a4-b6fe-4ee5-b468-0508c184f8e9
--   TOTALPASS_BOOKING_ATIVO            -> kill switch; 'true' liga. Nasce desligado.
-- Dados do place Pinheiros: name "Just Club - Pinheiros", unidade id 41407,
--   plano único "Just Run" planId=16655 (usado no POST /partner/events).
-- ─────────────────────────────────────────────────────────────────────────────


-- ───────────────────────────────────────────────────────────────────────────
-- T1 — vagas_totalpass por ocorrência (override do que é exposto à TotalPass)
-- NULL = usa totalpass_booking_config.vagas_default. 0 = pausado nessa aula.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE club_ocorrencias ADD COLUMN IF NOT EXISTS vagas_totalpass integer;
COMMENT ON COLUMN club_ocorrencias.vagas_totalpass IS
  'Override de vagas expostas à TotalPass nesta ocorrência. NULL = totalpass_booking_config.vagas_default. 0 = pausado.';


-- ───────────────────────────────────────────────────────────────────────────
-- T2 — config global do booking TotalPass (linha única id=true)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS totalpass_booking_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  vagas_default integer NOT NULL DEFAULT 10,
  cancelamento_horas integer NOT NULL DEFAULT 12,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO totalpass_booking_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;


-- ───────────────────────────────────────────────────────────────────────────
-- T3 — unidade: place TotalPass do Pinheiros (totalpass_place_id/estado já
-- existem do check-in). Só Pinheiros no escopo do booking.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE unidades
  SET totalpass_place_id = '41407', totalpass_estado = 'ativo'
  WHERE id = '166a683d-5fe6-4177-8fd6-53deb70b428e';   -- Just Club Pinheiros


-- ───────────────────────────────────────────────────────────────────────────
-- T4 — clientes: matching TotalPass (id estável do usuário no app)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS totalpass_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_totalpass_id
  ON clientes(totalpass_id) WHERE totalpass_id IS NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- T5 — club_reservas: nº do slot TotalPass pra casar sync/cancelamento.
-- (via_app já existe do Wellhub — é compartilhado pelos dois apps.)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE club_reservas ADD COLUMN IF NOT EXISTS totalpass_slot_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_club_reservas_totalpass_slot
  ON club_reservas(totalpass_slot_id) WHERE totalpass_slot_id IS NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- T6 — outbox de sync (coalesce: no máx. 1 linha pendente por ocorrência)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS totalpass_slot_sync_queue (
  ocorrencia_id uuid PRIMARY KEY REFERENCES club_ocorrencias(id) ON DELETE CASCADE,
  enfileirado_em timestamptz NOT NULL DEFAULT now()
);


-- ───────────────────────────────────────────────────────────────────────────
-- T7 — RPC de capacidade exposta à TotalPass (pool compartilhado)
--   total_capacity = min(vagas_totalpass_resolved, capacidade - bloqueadas - proprias)
--   total_booked   = reservas via app (Wellhub + TotalPass), não-canceladas
-- proprias = reservas NÃO via_app (nossos alunos). O total_booked contar TODAS
-- as via_app é o que faz o pool ser compartilhado entre os dois apps.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION totalpass_slot_numbers(p_ocorrencia_id uuid)
RETURNS TABLE (total_capacity integer, total_booked integer)
LANGUAGE sql STABLE AS $$
  WITH oc AS (
    SELECT o.id, o.vagas_bloqueadas, o.vagas_totalpass, a.capacidade
    FROM club_ocorrencias o
    JOIN club_aulas a ON a.id = o.aula_id
    WHERE o.id = p_ocorrencia_id
  ),
  cfg AS (SELECT vagas_default FROM totalpass_booking_config WHERE id IS TRUE),
  r AS (
    SELECT
      count(*) FILTER (WHERE via_app = false) AS proprias,
      count(*) FILTER (WHERE via_app = true)  AS via_app
    FROM club_reservas
    WHERE ocorrencia_id = p_ocorrencia_id AND status <> 'cancelado'
  )
  SELECT
    GREATEST(0, LEAST(
      COALESCE(oc.vagas_totalpass, cfg.vagas_default),
      oc.capacidade - COALESCE(oc.vagas_bloqueadas,0) - r.proprias
    ))::int AS total_capacity,
    r.via_app::int AS total_booked
  FROM oc, cfg, r;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- T8 — trigger de enfileiramento (captura TODA escrita de club_reservas).
-- Isolado do trigger do Wellhub (trg_sync_wellhub continua intocado).
-- CRÍTICO: nunca pode derrubar uma reserva →
--   * SECURITY DEFINER (bypassa RLS da fila),
--   * BEGIN/EXCEPTION (se enfileirar falhar, ignora; o cron reconcilia).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enfileirar_sync_totalpass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_oc uuid;
BEGIN
  v_oc := COALESCE(NEW.ocorrencia_id, OLD.ocorrencia_id);
  BEGIN
    INSERT INTO totalpass_slot_sync_queue (ocorrencia_id, enfileirado_em)
    VALUES (v_oc, now())
    ON CONFLICT (ocorrencia_id) DO UPDATE SET enfileirado_em = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[totalpass] enfileirar_sync falhou (ignorado): %', SQLERRM;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_totalpass ON club_reservas;
CREATE TRIGGER trg_sync_totalpass
AFTER INSERT OR UPDATE OR DELETE ON club_reservas
FOR EACH ROW EXECUTE FUNCTION enfileirar_sync_totalpass();


-- ───────────────────────────────────────────────────────────────────────────
-- T9 — matching de cadastro (totalpass_id → CPF → email → shell).
-- SECURITY DEFINER pra inserir o shell mesmo sob RLS. CPF é o casamento forte
-- (o slot.user da TotalPass traz document_number).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION totalpass_resolver_cliente(
  p_totalpass_id text, p_cpf text, p_email text, p_nome text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_cpf text;
BEGIN
  -- 1) já existe por totalpass_id
  SELECT id INTO v_id FROM clientes WHERE totalpass_id = p_totalpass_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 2) match por CPF (só dígitos), se o cadastro ainda não tem outro totalpass_id
  v_cpf := NULLIF(regexp_replace(COALESCE(p_cpf,''), '\D', '', 'g'), '');
  IF v_cpf IS NOT NULL THEN
    SELECT id INTO v_id FROM clientes
    WHERE regexp_replace(COALESCE(cpf,''), '\D', '', 'g') = v_cpf
      AND totalpass_id IS NULL
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE clientes SET totalpass_id = p_totalpass_id WHERE id = v_id;
      RETURN v_id;
    END IF;
  END IF;

  -- 3) match por email (normalizado), se ainda sem totalpass_id
  IF p_email IS NOT NULL AND length(trim(p_email)) > 0 THEN
    SELECT id INTO v_id FROM clientes
    WHERE lower(trim(email)) = lower(trim(p_email)) AND totalpass_id IS NULL
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE clientes SET totalpass_id = p_totalpass_id WHERE id = v_id;
      RETURN v_id;
    END IF;
  END IF;

  -- 4) shell
  INSERT INTO clientes (nome, email, cpf, totalpass_id, origem)
  VALUES (COALESCE(NULLIF(trim(p_nome),''), 'Cliente TotalPass'),
          NULLIF(trim(p_email),''), v_cpf, p_totalpass_id, 'totalpass')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- T10 — mapas modalidade↔evento e ocorrência↔slot (pro worker achar o que sync)
--   tipo_aula: 'lift' | 'lift_for_girls' | 'running_funcional'
--   totalpass_event_id: id retornado pelo POST /partner/events
--   occurrence_uuid: id da ocorrência na TotalPass (pra ler slots e atualizar)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS totalpass_event_map (
  place_id text NOT NULL,
  tipo_aula text NOT NULL,
  totalpass_event_id text NOT NULL,
  PRIMARY KEY (place_id, tipo_aula)
);

CREATE TABLE IF NOT EXISTS totalpass_slot_map (
  ocorrencia_id uuid PRIMARY KEY REFERENCES club_ocorrencias(id) ON DELETE CASCADE,
  place_id text NOT NULL,
  totalpass_event_id text NOT NULL,
  occurrence_uuid text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois; nada aqui altera dados)
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='club_ocorrencias' AND column_name='vagas_totalpass';
--   SELECT * FROM totalpass_booking_config;
--   SELECT id, totalpass_place_id, totalpass_estado FROM unidades
--     WHERE id='166a683d-5fe6-4177-8fd6-53deb70b428e';
--   SELECT tgname FROM pg_trigger WHERE tgname='trg_sync_totalpass';
--   SELECT proname FROM pg_proc WHERE proname IN ('totalpass_slot_numbers','totalpass_resolver_cliente','enfileirar_sync_totalpass');
-- ═══════════════════════════════════════════════════════════════════════════
