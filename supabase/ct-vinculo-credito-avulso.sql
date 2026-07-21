-- Consumo do credito avulso no Coach CT (Just CT).
--
-- Problema corrigido: o avulso de "Coach CT Avulso" e consumido por um AGENDAMENTO
-- (nao por reserva de Club). A RPC saldo_creditos_cliente so descontava reservas de
-- Club no laco de avulsos por unidade -> o credito pago aparecia SEMPRE disponivel e
-- liberava agendamentos ilimitados (1 por dia). Espelho do que o Club ja fazia em
-- club-vinculo-credito-avulso*.sql, mas para agendamentos do CT.
--
-- Modelo: ao criar o agendamento pago com avulso, amarra o credito valido que expira
-- primeiro (usado = true, agendamento_id = <agendamento>). Ao cancelar, devolve o
-- credito. A RPC volta a ler o saldo por usado (respeita validade, nao bloqueia compra
-- nova). Triggers SECURITY DEFINER e a prova de falha: nunca derrubam o agendamento.

-- 1. Consome (amarra) um credito avulso ao criar o agendamento.
CREATE OR REPLACE FUNCTION public.consumir_avulso_ct_no_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slug text;
  v_credito_id uuid;
BEGIN
  IF NEW.status = 'cancelado' THEN RETURN NEW; END IF;
  IF NEW.tipo_credito IS NULL OR NEW.tipo_credito NOT LIKE 'avulso\_%' THEN
    RETURN NEW;
  END IF;

  SELECT slug INTO v_slug FROM unidades WHERE id = NEW.unidade_id;
  IF v_slug IS NULL OR NEW.tipo_credito <> 'avulso_' || v_slug THEN
    RETURN NEW;
  END IF;

  -- Reprocesso: se este agendamento ja consumiu um credito, nao consome de novo.
  IF EXISTS (SELECT 1 FROM creditos_avulsos WHERE agendamento_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT ca.id INTO v_credito_id
  FROM creditos_avulsos ca
  WHERE ca.cliente_id = NEW.cliente_id
    AND ca.unidade_id = NEW.unidade_id
    AND ca.usado = false
    AND ca.validade >= CURRENT_DATE
    AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%')
  ORDER BY ca.validade ASC, ca.comprado_em ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_credito_id IS NOT NULL THEN
    UPDATE creditos_avulsos
    SET usado = true, agendamento_id = NEW.id
    WHERE id = v_credito_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- nunca derruba o agendamento do cliente
END;
$$;

-- 2. Devolve o credito quando o agendamento e cancelado.
CREATE OR REPLACE FUNCTION public.liberar_avulso_ao_cancelar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'cancelado' AND (OLD.status IS NULL OR OLD.status <> 'cancelado') THEN
    UPDATE creditos_avulsos
    SET usado = false, agendamento_id = NULL
    WHERE agendamento_id = NEW.id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_agendamento_consumir_avulso ON agendamentos;
CREATE TRIGGER on_agendamento_consumir_avulso
AFTER INSERT ON agendamentos
FOR EACH ROW EXECUTE FUNCTION consumir_avulso_ct_no_agendamento();

DROP TRIGGER IF EXISTS on_agendamento_liberar_avulso ON agendamentos;
CREATE TRIGGER on_agendamento_liberar_avulso
AFTER UPDATE ON agendamentos
FOR EACH ROW EXECUTE FUNCTION liberar_avulso_ao_cancelar();

-- 3. Backfill: amarra creditos validos nao-usados aos agendamentos de CT ja ativos
--    (1 pra 1, do que expira primeiro). Agendamentos alem do numero de creditos
--    validos ficam sem vinculo (consumo historico nao recuperavel).
WITH ag AS (
  SELECT a.id AS agend_id, a.cliente_id, a.unidade_id,
         row_number() OVER (PARTITION BY a.cliente_id, a.unidade_id ORDER BY a.data, a.criado_em) AS rn
  FROM agendamentos a
  JOIN unidades u ON u.id = a.unidade_id AND u.tipo = 'ct'
  WHERE a.tipo_credito = 'avulso_' || u.slug
    AND a.status NOT IN ('cancelado')
    AND NOT EXISTS (SELECT 1 FROM creditos_avulsos c WHERE c.agendamento_id = a.id)
),
cr AS (
  SELECT ca.id AS credito_id, ca.cliente_id, ca.unidade_id,
         row_number() OVER (PARTITION BY ca.cliente_id, ca.unidade_id ORDER BY ca.validade ASC, ca.comprado_em ASC) AS rn
  FROM creditos_avulsos ca
  JOIN unidades u ON u.id = ca.unidade_id AND u.tipo = 'ct'
  WHERE ca.usado = false
    AND ca.validade >= CURRENT_DATE
    AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%')
)
UPDATE creditos_avulsos t
SET usado = true, agendamento_id = ag.agend_id
FROM cr
JOIN ag ON ag.cliente_id = cr.cliente_id AND ag.unidade_id = cr.unidade_id AND ag.rn = cr.rn
WHERE t.id = cr.credito_id;

-- 4. A RPC saldo_creditos_cliente volta a calcular o avulso por unidade lendo a flag
--    `usado` (sem descontar a contagem de agendamentos, que bloquearia compra nova).
--    Ver a definicao completa da funcao no schema/migracao correspondente.
