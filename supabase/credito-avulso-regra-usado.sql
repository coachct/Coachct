-- ============================================================================
-- REGRA DO CREDITO AVULSO: a flag `usado` e a unica verdade.
--
--   Comprou -> disponivel.  Usou -> `usado = true`, acabou, nao conta mais pra nada.
--   Cancelou -> volta a `usado = false`.  Vencido (validade < hoje) -> nao conta.
--
--   disponivel = COUNT(*) FILTER (WHERE usado = false AND validade >= CURRENT_DATE)
--
-- NAO existe "deduzir consumo contando reserva/agendamento antigo". Essa gambiarra
-- era o bug: a RPC descontava TODAS as reservas de Club que o cliente ja tinha feito
-- na vida, sem recorte. Credito antigo vencia e saia do saldo bruto, mas a reserva
-- que ele pagou continuava descontando pra sempre -> a reserva orfa comia o credito
-- novo. Sintoma real (21/07/2026): cliente comprou Treino Avulso e ele nao aparecia.
--
-- Os 3 fluxos de consumo agora marcam `usado`:
--   Coach CT   -> trigger em agendamentos      (ct-vinculo-credito-avulso.sql)
--   walk-in    -> registrar_acesso_livre_ct    (ct-vinculo-credito-avulso.sql)
--   Club       -> trigger em club_reservas     (este arquivo)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PASSO 1 — o Club passa a marcar o credito (e acerta o que ja existia).
-- ---------------------------------------------------------------------------

-- 1a. Amarra as reservas de Club ativas que ainda nao tinham credito vinculado.
DO $$
DECLARE r record; v_cred uuid;
BEGIN
  FOR r IN
    SELECT cr.id, cr.cliente_id, cr.tipo_credito, co.data
    FROM club_reservas cr
    JOIN club_ocorrencias co ON co.id = cr.ocorrencia_id
    WHERE cr.status NOT IN ('cancelado')
      AND cr.tipo_credito LIKE 'avulso%'
      AND cr.credito_avulso_id IS NULL
    ORDER BY co.data
  LOOP
    SELECT ca.id INTO v_cred
    FROM creditos_avulsos ca
    LEFT JOIN unidades u ON u.id = ca.unidade_id
    WHERE ca.cliente_id = r.cliente_id
      AND NOT EXISTS (SELECT 1 FROM club_reservas c2
                      WHERE c2.credito_avulso_id = ca.id AND c2.status NOT IN ('cancelado'))
      AND (
        (r.tipo_credito = 'avulso' AND ca.unidade_id IS NULL
           AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%'))
        OR (r.tipo_credito = 'avulso_importado' AND ca.observacao LIKE 'Migração%')
        OR (r.tipo_credito = 'avulso_' || u.slug
           AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%'))
      )
    ORDER BY (ca.validade >= r.data) DESC, ca.validade ASC, ca.comprado_em ASC
    LIMIT 1;

    IF v_cred IS NOT NULL THEN
      UPDATE club_reservas SET credito_avulso_id = v_cred WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 1b. Marca como usado todo credito com reserva de Club ativa.
UPDATE creditos_avulsos ca SET usado = true
WHERE ca.usado = false
  AND EXISTS (SELECT 1 FROM club_reservas cr
              WHERE cr.credito_avulso_id = ca.id AND cr.status NOT IN ('cancelado'));

-- 1c. Daqui pra frente: reservar marca o credito, cancelar devolve.
--     SECURITY DEFINER + a prova de falha: nunca derruba a reserva do cliente.
CREATE OR REPLACE FUNCTION public.consumir_credito_avulso_club()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.credito_avulso_id IS NOT NULL
     AND (NEW.credito_avulso_id IS DISTINCT FROM OLD.credito_avulso_id
          OR NEW.status = 'cancelado') THEN
    UPDATE creditos_avulsos SET usado = false
    WHERE id = OLD.credito_avulso_id
      AND NOT EXISTS (SELECT 1 FROM club_reservas c2
                      WHERE c2.credito_avulso_id = OLD.credito_avulso_id
                        AND c2.status NOT IN ('cancelado'));
  END IF;

  IF NEW.status NOT IN ('cancelado') AND NEW.credito_avulso_id IS NOT NULL THEN
    UPDATE creditos_avulsos SET usado = true WHERE id = NEW.credito_avulso_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_consumir_credito_avulso_club ON club_reservas;
CREATE TRIGGER trg_consumir_credito_avulso_club
AFTER INSERT OR UPDATE ON club_reservas
FOR EACH ROW EXECUTE FUNCTION consumir_credito_avulso_club();

-- ---------------------------------------------------------------------------
-- PASSO 2 — saldo_creditos_cliente para de contar reserva/agendamento antigo.
--
-- Nos 3 blocos de avulso (importado, por unidade, pote sem unidade) o disponivel
-- passa a ser so `usado = false AND validade >= CURRENT_DATE`. Os blocos de PLANO
-- (cliente_creditos e planos acumulativos) seguem iguais — la a contagem por mes/
-- periodo esta correta, porque o total e uma cota, nao um credito comprado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.saldo_creditos_cliente(p_cliente_id uuid, p_mes integer, p_ano integer, p_unidade_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  resultado jsonb := '{}'::jsonb;
  r record;
  v_usado int;
  v_disponivel int;
  v_plano_ativo boolean;
  v_hoje date := CURRENT_DATE;
  v_mes_atual int := EXTRACT(MONTH FROM v_hoje)::int;
  v_ano_atual int := EXTRACT(YEAR FROM v_hoje)::int;
  v_mes_prox int := CASE WHEN v_mes_atual = 12 THEN 1 ELSE v_mes_atual + 1 END;
  v_ano_prox int := CASE WHEN v_mes_atual = 12 THEN v_ano_atual + 1 ELSE v_ano_atual END;
  v_unidade_tipo text;
  v_imp_total int; v_imp_bruto int; v_imp_usado int;
  v_imp_unidade uuid; v_imp_unidade_nome text; v_imp_nome text;
  v_av_total int; v_av_bruto int; v_av_usado int; v_av_nome text;
BEGIN
  IF (p_mes = v_mes_atual AND p_ano = v_ano_atual)
     OR (p_mes = v_mes_prox AND p_ano = v_ano_prox) THEN
    PERFORM garantir_creditos_cliente(p_cliente_id, p_mes, p_ano);
  END IF;

  FOR r IN
    SELECT cc.tipo, cc.unidade_id, cc.total, u.slug AS unidade_slug, u.nome AS unidade_nome
    FROM cliente_creditos cc
    JOIN unidades u ON u.id = cc.unidade_id
    WHERE cc.cliente_id = p_cliente_id
      AND cc.mes = p_mes AND cc.ano = p_ano
      AND (p_unidade_id IS NULL OR cc.unidade_id = p_unidade_id)
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM cliente_planos cp
      JOIN planos_disponiveis pd ON pd.id = cp.plano_id
      WHERE cp.cliente_id = p_cliente_id AND cp.ativo = true
        AND pd.tipo = r.tipo AND pd.unidade_id = r.unidade_id
    ) INTO v_plano_ativo;
    IF NOT v_plano_ativo THEN CONTINUE; END IF;

    SELECT COUNT(*) INTO v_usado FROM (
      SELECT id FROM agendamentos a
      WHERE a.cliente_id = p_cliente_id
        AND a.tipo_credito = r.tipo || '_' || r.unidade_slug
        AND a.unidade_id = r.unidade_id
        AND EXTRACT(MONTH FROM a.data) = p_mes
        AND EXTRACT(YEAR FROM a.data) = p_ano
        AND a.status NOT IN ('cancelado')
        AND NOT (r.tipo IN ('wellhub','totalpass') AND a.status = 'falta')
      UNION ALL
      SELECT cr.id FROM club_reservas cr
      JOIN club_ocorrencias co ON co.id = cr.ocorrencia_id
      JOIN club_aulas ca ON ca.id = co.aula_id
      WHERE cr.cliente_id = p_cliente_id
        AND cr.tipo_credito = r.tipo || '_' || r.unidade_slug
        AND ca.unidade_id = r.unidade_id
        AND EXTRACT(MONTH FROM co.data) = p_mes
        AND EXTRACT(YEAR FROM co.data) = p_ano
        AND cr.status NOT IN ('cancelado')
        AND NOT (r.tipo IN ('wellhub','totalpass') AND cr.status = 'falta')
    ) used_credits;

    v_disponivel := GREATEST(0, r.total - v_usado);
    resultado := resultado || jsonb_build_object(
      r.tipo || '_' || r.unidade_slug,
      jsonb_build_object('total', r.total, 'usado', v_usado, 'disponivel', v_disponivel,
        'tipo_plano', r.tipo, 'unidade_id', r.unidade_id, 'unidade_nome', r.unidade_nome));
  END LOOP;

  IF p_unidade_id IS NOT NULL THEN
    SELECT tipo INTO v_unidade_tipo FROM unidades WHERE id = p_unidade_id;
  ELSE
    v_unidade_tipo := NULL;
  END IF;

  IF p_unidade_id IS NULL OR v_unidade_tipo = 'club' THEN
    SELECT COUNT(*),
      COUNT(*) FILTER (WHERE ca.usado = false AND ca.validade >= CURRENT_DATE),
      COUNT(*) FILTER (WHERE ca.usado = true),
      CASE WHEN COUNT(DISTINCT ca.observacao) = 1
           THEN regexp_replace(MAX(ca.observacao), '^Migração[^A-Za-z0-9]*', '')
           ELSE NULL END
    INTO v_imp_total, v_imp_bruto, v_imp_usado, v_imp_nome
    FROM creditos_avulsos ca
    WHERE ca.cliente_id = p_cliente_id AND ca.observacao LIKE 'Migração%';

    IF v_imp_total > 0 THEN
      IF p_unidade_id IS NOT NULL THEN
        v_imp_unidade := p_unidade_id;
      ELSE
        SELECT ca.unidade_id INTO v_imp_unidade
        FROM creditos_avulsos ca
        WHERE ca.cliente_id = p_cliente_id AND ca.observacao LIKE 'Migração%'
        ORDER BY ca.unidade_id LIMIT 1;
      END IF;
      SELECT nome INTO v_imp_unidade_nome FROM unidades WHERE id = v_imp_unidade;

      resultado := resultado || jsonb_build_object('avulso_importado',
        jsonb_build_object('total', v_imp_total, 'usado', v_imp_usado,
          'disponivel', v_imp_bruto, 'tipo_plano', 'avulso',
          'nome_pacote', COALESCE(NULLIF(TRIM(v_imp_nome), ''), 'Avulso'),
          'unidade_id', v_imp_unidade, 'unidade_nome', v_imp_unidade_nome));
    END IF;
  END IF;

  -- Avulso por unidade. No CT (tipo 'ct') so conta credito_coach: credito de
  -- treino e walk-in e nunca vale para agendar Coach CT.
  FOR r IN
    SELECT ca.unidade_id, u.slug AS unidade_slug, u.nome AS unidade_nome,
      COUNT(*) FILTER (WHERE ca.usado = false AND ca.validade >= CURRENT_DATE) AS disponivel_bruto,
      COUNT(*) FILTER (WHERE ca.usado = true) AS usado_marcado,
      COUNT(*) AS total,
      CASE WHEN COUNT(DISTINCT ca.observacao) = 1 THEN MAX(ca.observacao) ELSE NULL END AS nome_pacote
    FROM creditos_avulsos ca
    JOIN unidades u ON u.id = ca.unidade_id
    WHERE ca.cliente_id = p_cliente_id
      AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%')
      AND (p_unidade_id IS NULL OR ca.unidade_id = p_unidade_id)
      AND (u.tipo <> 'ct' OR ca.tipo = 'credito_coach')
    GROUP BY ca.unidade_id, u.slug, u.nome
  LOOP
    resultado := resultado || jsonb_build_object('avulso_' || r.unidade_slug,
      jsonb_build_object('total', r.total, 'usado', r.usado_marcado,
        'disponivel', r.disponivel_bruto, 'tipo_plano', 'avulso',
        'nome_pacote', COALESCE(r.nome_pacote, 'Avulso'),
        'unidade_id', r.unidade_id, 'unidade_nome', r.unidade_nome));
  END LOOP;

  -- Pote de avulso sem unidade (vale em Club e consultas gerais, nunca no Coach CT).
  IF p_unidade_id IS NULL OR v_unidade_tipo = 'club' THEN
    SELECT COUNT(*),
      COUNT(*) FILTER (WHERE ca.usado = false AND ca.validade >= CURRENT_DATE),
      COUNT(*) FILTER (WHERE ca.usado = true),
      CASE WHEN COUNT(DISTINCT ca.observacao) = 1 THEN MAX(ca.observacao) ELSE NULL END
    INTO v_av_total, v_av_bruto, v_av_usado, v_av_nome
    FROM creditos_avulsos ca
    WHERE ca.cliente_id = p_cliente_id
      AND ca.unidade_id IS NULL
      AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%');

    IF v_av_total > 0 THEN
      resultado := resultado || jsonb_build_object('avulso',
        jsonb_build_object('total', v_av_total, 'usado', v_av_usado,
          'disponivel', v_av_bruto, 'tipo_plano', 'avulso',
          'nome_pacote', COALESCE(v_av_nome, 'Avulso'),
          'unidade_id', null, 'unidade_nome', 'Todas as unidades'));
    END IF;
  END IF;

  FOR r IN
    SELECT pd.id AS plano_id, pd.tipo AS plano_tipo, pd.total_creditos,
      pd.unidade_id, u.slug AS unidade_slug, u.nome AS unidade_nome, cp.inicio, cp.fim
    FROM cliente_planos cp
    JOIN planos_disponiveis pd ON pd.id = cp.plano_id
    JOIN unidades u ON u.id = pd.unidade_id
    WHERE cp.cliente_id = p_cliente_id AND cp.ativo = true
      AND pd.creditos_acumulativos = true AND pd.total_creditos IS NOT NULL
      AND CURRENT_DATE BETWEEN cp.inicio AND cp.fim
      AND (p_unidade_id IS NULL OR pd.unidade_id = p_unidade_id)
  LOOP
    SELECT COUNT(*) INTO v_usado
    FROM agendamentos a
    WHERE a.cliente_id = p_cliente_id
      AND a.tipo_credito = r.plano_tipo || '_' || r.unidade_slug
      AND a.unidade_id = r.unidade_id
      AND a.data BETWEEN r.inicio AND r.fim
      AND a.status NOT IN ('cancelado');

    v_disponivel := GREATEST(0, r.total_creditos - v_usado);
    resultado := resultado || jsonb_build_object(
      r.plano_tipo || '_' || r.unidade_slug,
      jsonb_build_object('total', r.total_creditos, 'usado', v_usado, 'disponivel', v_disponivel,
        'tipo_plano', r.plano_tipo, 'unidade_id', r.unidade_id,
        'unidade_nome', r.unidade_nome, 'fim', r.fim));
  END LOOP;

  RETURN resultado;
END;
$function$;
