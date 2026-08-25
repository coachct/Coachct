-- Recompra do Coach CT Pro: o pacote novo cobre o que for agendado A PARTIR da compra
--
-- CONTEXTO: o saldo do PRO nao usa credito avulso. saldo_creditos_cliente conta
-- os agendamentos com data BETWEEN cp.inicio AND cp.fim (bloco creditos_acumulativos).
-- Na recompra a janela reinicia em CURRENT_DATE, entao um treino JA marcado para
-- uma data futura passava a consumir o pacote novo — mas ele ja tinha sido pago
-- pelo pacote anterior. Caso real: Thais Meirelles esgotou os 12 e o 12o treino
-- dela e 29/08 (marcado em 24/08 19:17, antes da recompra).
--
-- REGRA: o pacote novo cobre o que for agendado DEPOIS da compra. O que ja estava
-- marcado antes pertence ao pacote velho e nao consome o novo. A cliente segue
-- agendando normalmente a partir do dia da venda.
--
-- COMO: cliente_planos.contar_desde (timestamptz), gravado com now() na venda do
-- PRO. O saldo so conta agendamento com criado_em >= contar_desde.
-- FAIL-SAFE: contar_desde NULL = comportamento de hoje. Todas as linhas antigas
-- ficam NULL, nada muda para quem ja tem plano. Nao precisa de backfill: a
-- proxima venda grava o marco sozinha.
--
-- ALCANCE: creditos_acumulativos = true so existe nos 3 planos Coach CT Pro
-- (App Coach CT PRO, Trimestral, Semestral). Nenhum outro plano e afetado, e o
-- resto da saldo_creditos_cliente (mes a mes, avulso, importado) esta identico.

-- 1. Coluna do marco
ALTER TABLE cliente_planos ADD COLUMN IF NOT EXISTS contar_desde timestamptz;

COMMENT ON COLUMN cliente_planos.contar_desde IS
  'Coach CT Pro: so agendamentos criados a partir deste instante consomem o pacote. NULL = conta tudo na janela (comportamento antigo).';

-- 2. saldo_creditos_cliente: respeita o marco no bloco dos planos acumulativos
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
        AND cr.tipo_credito IN (r.tipo || '_' || r.unidade_slug, r.tipo || '_app')
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

  -- Avulso importado (migração): usado = usado. Sem contar reserva.
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

  -- Avulso por unidade. No CT (tipo 'ct') só conta credito_coach: crédito de
  -- treino é walk-in e nunca vale para agendar Coach CT.
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

  -- Planos acumulativos (Coach CT Pro): a conta é a janela do plano, e só entram
  -- os agendamentos criados a partir de cp.contar_desde (marco da compra).
  FOR r IN
    SELECT pd.id AS plano_id, pd.tipo AS plano_tipo, pd.total_creditos,
      pd.unidade_id, u.slug AS unidade_slug, u.nome AS unidade_nome,
      cp.inicio, cp.fim, cp.contar_desde
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
      AND a.status NOT IN ('cancelado')
      AND (r.contar_desde IS NULL OR a.criado_em >= r.contar_desde);

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

-- 3. registrar_venda: grava o marco na venda do PRO (compra nova e recompra)
CREATE OR REPLACE FUNCTION public.registrar_venda(
  p_produto_id uuid, p_cliente_id uuid, p_quantidade integer, p_valor_unitario numeric,
  p_forma_pagamento text, p_vendido_por uuid, p_unidade_id uuid,
  p_observacao text DEFAULT NULL::text, p_desconto_percentual numeric DEFAULT 0,
  p_codigo_liberacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_produto record;
  v_plano record;
  v_venda_id uuid;
  v_validade date;
  v_total_creditos int;
  v_valor_original numeric;
  v_valor_total numeric;
  v_fim date;
  v_planos_desativados int := 0;
  v_valor_por_credito numeric;
  i int;
  v_role text;
  v_lib record;
  v_lib_id uuid;
  v_lib_gerado_por uuid;
  v_pro_renovacao boolean := false;
BEGIN
  SELECT * INTO v_produto FROM produtos WHERE id = p_produto_id AND ativo = true;

  IF v_produto IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'motivo', 'produto_nao_encontrado_ou_inativo');
  END IF;

  IF p_quantidade < 1 OR p_quantidade > 20 THEN
    RETURN jsonb_build_object('sucesso', false, 'motivo', 'quantidade_invalida');
  END IF;

  IF v_produto.unidade_id IS NOT NULL AND v_produto.unidade_id != p_unidade_id THEN
    RETURN jsonb_build_object('sucesso', false, 'motivo', 'produto_de_outra_unidade');
  END IF;

  IF p_desconto_percentual < 0 OR p_desconto_percentual > 100 THEN
    RETURN jsonb_build_object('sucesso', false, 'motivo', 'desconto_invalido');
  END IF;

  -- ===== CONTROLE DE VALORES DA RECEPCAO =====
  IF p_vendido_por IS NOT NULL THEN
    SELECT role INTO v_role FROM perfis WHERE id = p_vendido_por;
  END IF;

  IF v_role = 'recepcao' THEN
    IF round(p_valor_unitario, 2) <> round(v_produto.valor, 2) THEN
      RETURN jsonb_build_object('sucesso', false, 'motivo', 'preco_alterado_sem_autorizacao');
    END IF;

    IF COALESCE(p_desconto_percentual, 0) > 0 THEN
      IF p_codigo_liberacao IS NULL THEN
        RETURN jsonb_build_object('sucesso', false, 'motivo', 'desconto_sem_liberacao');
      END IF;

      SELECT * INTO v_lib FROM liberacoes_desconto
       WHERE codigo = p_codigo_liberacao
         AND usado_em IS NULL
         AND expira_em > now()
       FOR UPDATE;

      IF v_lib IS NULL THEN
        RETURN jsonb_build_object('sucesso', false, 'motivo', 'codigo_invalido_ou_expirado');
      END IF;

      IF p_desconto_percentual > v_lib.desconto_maximo THEN
        RETURN jsonb_build_object('sucesso', false, 'motivo', 'desconto_acima_do_teto', 'teto', v_lib.desconto_maximo);
      END IF;

      v_lib_id := v_lib.id;
      v_lib_gerado_por := v_lib.gerado_por;
    END IF;
  END IF;
  -- ===== FIM DO CONTROLE =====

  v_valor_original := p_valor_unitario * p_quantidade;
  v_valor_total := v_valor_original * (1 - p_desconto_percentual / 100);

  INSERT INTO vendas (
    produto_id, cliente_id, quantidade, valor_unitario, valor_total, valor_original,
    desconto_percentual, forma_pagamento, vendido_por, observacao, unidade_id,
    autorizado_por, liberacao_id
  ) VALUES (
    p_produto_id, p_cliente_id, p_quantidade, p_valor_unitario,
    v_valor_total, v_valor_original, p_desconto_percentual,
    p_forma_pagamento, p_vendido_por, p_observacao, p_unidade_id,
    v_lib_gerado_por, v_lib_id
  ) RETURNING id INTO v_venda_id;

  IF v_lib_id IS NOT NULL THEN
    UPDATE liberacoes_desconto
       SET usado_em = now(), usado_por = p_vendido_por, venda_id = v_venda_id
     WHERE id = v_lib_id;
  END IF;

  -- SUBTIPO: CREDITO ou PACOTE
  IF v_produto.subtipo IN ('credito', 'pacote') OR v_produto.subtipo IS NULL THEN
    v_total_creditos := p_quantidade * COALESCE(v_produto.creditos_por_venda, 1);
    v_validade := CURRENT_DATE + (v_produto.dias_validade || ' days')::interval;
    v_valor_por_credito := v_valor_total / v_total_creditos;

    FOR i IN 1..v_total_creditos LOOP
      INSERT INTO creditos_avulsos (
        cliente_id, comprado_em, validade, valor_pago,
        forma_pagamento, vendido_por, unidade_id, tipo, observacao
      ) VALUES (
        p_cliente_id, now(), v_validade, v_valor_por_credito,
        p_forma_pagamento, p_vendido_por, v_produto.unidade_id,
        v_produto.tipo, v_produto.nome
      );
    END LOOP;

    RETURN jsonb_build_object(
      'sucesso', true, 'venda_id', v_venda_id, 'subtipo', v_produto.subtipo,
      'produto', v_produto.nome, 'creditos_gerados', v_total_creditos,
      'validade', v_validade, 'valor_original', v_valor_original,
      'desconto_percentual', p_desconto_percentual, 'valor_total', v_valor_total
    );
  END IF;

  -- SUBTIPO: ILIMITADO_CLUB
  IF v_produto.subtipo = 'ilimitado_club' THEN
    v_total_creditos := GREATEST(1, round(COALESCE(v_produto.dias_validade, 180) / 30.0)::int);
    v_valor_por_credito := v_valor_total / (v_total_creditos * 30);

    FOR i IN 1..30 LOOP
      INSERT INTO creditos_avulsos (
        cliente_id, comprado_em, validade, valor_pago,
        forma_pagamento, vendido_por, unidade_id, tipo, observacao
      ) VALUES (
        p_cliente_id, now(), CURRENT_DATE + 30, v_valor_por_credito,
        p_forma_pagamento, p_vendido_por, null, 'credito_treino', v_produto.nome
      );
    END LOOP;

    INSERT INTO assinaturas_ilimitado_club (
      cliente_id, venda_id, data_inicio, proxima_renovacao, renovacoes_restantes
    ) VALUES (
      p_cliente_id, v_venda_id, CURRENT_DATE, CURRENT_DATE + 30, v_total_creditos - 1
    );

    RETURN jsonb_build_object(
      'sucesso', true, 'venda_id', v_venda_id, 'subtipo', 'ilimitado_club',
      'produto', v_produto.nome, 'creditos_gerados', 30, 'meses_total', v_total_creditos,
      'proxima_renovacao', CURRENT_DATE + 30, 'renovacoes_restantes', v_total_creditos - 1,
      'valor_total', v_valor_total
    );
  END IF;

  -- SUBTIPO: ACESSO
  IF v_produto.subtipo = 'acesso' THEN
    v_fim := CURRENT_DATE + ((v_produto.dias_validade * p_quantidade) || ' days')::interval;

    INSERT INTO cliente_planos (
      cliente_id, produto_id, venda_id, ativo, contrato_aceito_em, inicio, fim
    ) VALUES (
      p_cliente_id, p_produto_id, v_venda_id, true, now(), CURRENT_DATE, v_fim
    );

    RETURN jsonb_build_object(
      'sucesso', true, 'venda_id', v_venda_id, 'subtipo', 'acesso',
      'produto', v_produto.nome, 'inicio', CURRENT_DATE, 'fim', v_fim,
      'valor_original', v_valor_original, 'desconto_percentual', p_desconto_percentual,
      'valor_total', v_valor_total
    );
  END IF;

  -- SUBTIPO: COACH_CT_PRO
  IF v_produto.subtipo = 'coach_ct_pro' THEN
    IF v_produto.plano_id IS NULL THEN
      RETURN jsonb_build_object('sucesso', false, 'motivo', 'produto_coach_ct_pro_sem_plano_vinculado');
    END IF;

    SELECT * INTO v_plano FROM planos_disponiveis WHERE id = v_produto.plano_id AND ativo = true;

    IF v_plano IS NULL THEN
      RETURN jsonb_build_object('sucesso', false, 'motivo', 'plano_vinculado_nao_encontrado_ou_inativo');
    END IF;

    IF v_plano.duracao_meses IS NULL OR v_plano.total_creditos IS NULL THEN
      RETURN jsonb_build_object('sucesso', false, 'motivo', 'plano_sem_duracao_ou_creditos');
    END IF;

    v_fim := CURRENT_DATE + (v_plano.duracao_meses * 30 || ' days')::interval;

    SELECT EXISTS (
      SELECT 1 FROM cliente_planos cp
      WHERE cp.cliente_id = p_cliente_id AND cp.plano_id = v_produto.plano_id
    ) INTO v_pro_renovacao;

    UPDATE cliente_planos cp
    SET ativo = false, atualizado_em = now()
    WHERE cp.cliente_id = p_cliente_id
      AND cp.ativo = true
      AND NOT EXISTS (
        SELECT 1 FROM planos_disponiveis pd
        WHERE pd.id = cp.plano_id AND pd.tipo IN ('wellhub','totalpass')
      );

    GET DIAGNOSTICS v_planos_desativados = ROW_COUNT;

    -- Recompra do MESMO plano cai no ON CONFLICT (UNIQUE cliente_id + plano_id):
    -- renova a linha que ja existe. contar_desde = now() faz o pacote novo cobrir
    -- so o que for agendado a partir de agora.
    INSERT INTO cliente_planos (
      cliente_id, plano_id, produto_id, venda_id, ativo, contrato_aceito_em, inicio, fim, contar_desde
    ) VALUES (
      p_cliente_id, v_produto.plano_id, p_produto_id, v_venda_id, true, now(), CURRENT_DATE, v_fim, now()
    )
    ON CONFLICT (cliente_id, plano_id) DO UPDATE
      SET produto_id         = EXCLUDED.produto_id,
          venda_id           = EXCLUDED.venda_id,
          ativo              = true,
          contrato_aceito_em = now(),
          inicio             = EXCLUDED.inicio,
          fim                = EXCLUDED.fim,
          contar_desde       = EXCLUDED.contar_desde,
          atualizado_em      = now();

    RETURN jsonb_build_object(
      'sucesso', true, 'venda_id', v_venda_id, 'subtipo', 'coach_ct_pro',
      'produto', v_produto.nome, 'plano', v_plano.nome, 'total_creditos', v_plano.total_creditos,
      'duracao_meses', v_plano.duracao_meses, 'inicio', CURRENT_DATE, 'fim', v_fim,
      'renovacao', v_pro_renovacao,
      'planos_desativados', v_planos_desativados, 'valor_original', v_valor_original,
      'desconto_percentual', p_desconto_percentual, 'valor_total', v_valor_total
    );
  END IF;

  RETURN jsonb_build_object('sucesso', false, 'motivo', 'subtipo_invalido');
END;
$function$;
