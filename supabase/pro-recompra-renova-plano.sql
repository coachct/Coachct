-- Recompra do App Coach CT PRO (e dos demais planos Coach CT Pro)
--
-- SINTOMA: cliente que ESGOTOU os 12 treinos do App Coach CT PRO nao conseguia
-- comprar outro. A venda no balcao falhava com erro de chave duplicada:
--   duplicate key value violates unique constraint
--   "cliente_planos_cliente_id_plano_id_key"
-- Como tudo roda dentro da registrar_venda (uma transacao so), a venda inteira
-- era desfeita: nao gravava venda, nao gravava plano, nada.
--
-- CAUSA: cliente_planos tem UNIQUE (cliente_id, plano_id). O ramo coach_ct_pro
-- da registrar_venda desativava o PRO anterior (ativo = false) e tentava
-- INSERT de uma linha nova do MESMO plano para o MESMO cliente -> viola a UNIQUE.
--
-- REGRA (nao muda nada dos beneficios): a recompra RENOVA a mesma linha.
-- Reativa o plano, zera a janela (inicio = hoje, fim = hoje + duracao) e amarra
-- na venda nova. Os 12 creditos voltam sozinhos porque saldo_creditos_cliente
-- conta os agendamentos DENTRO da janela cp.inicio..cp.fim — janela nova, contador
-- do zero. Nada de credito avulso, nada de tabela nova.
--
-- CONSEQUENCIA (esperada): agendamento ja marcado para uma data DEPOIS da
-- recompra passa a contar no pacote novo. Ex.: Thais Meirelles tem 29/08 marcado;
-- ao recomprar hoje ela fica 1/12 usado (11 livres), nao 0/12.
--
-- O que NAO mudou: a desativacao continua sem tocar em wellhub/totalpass
-- (regra de pro_nao_desativa_plano_de_app, 22/07/2026) e todo o resto da funcao
-- esta identico. A unica diferenca esta no INSERT do ramo coach_ct_pro.

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

    -- O cliente ja tem esse mesmo plano no cadastro? Entao e recompra/renovacao.
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

    -- Recompra do MESMO plano cai no ON CONFLICT: renova a linha que ja existe
    -- (UNIQUE cliente_id + plano_id). Janela nova = 12 creditos novos + validade nova.
    INSERT INTO cliente_planos (
      cliente_id, plano_id, produto_id, venda_id, ativo, contrato_aceito_em, inicio, fim
    ) VALUES (
      p_cliente_id, v_produto.plano_id, p_produto_id, v_venda_id, true, now(), CURRENT_DATE, v_fim
    )
    ON CONFLICT (cliente_id, plano_id) DO UPDATE
      SET produto_id         = EXCLUDED.produto_id,
          venda_id           = EXCLUDED.venda_id,
          ativo              = true,
          contrato_aceito_em = now(),
          inicio             = EXCLUDED.inicio,
          fim                = EXCLUDED.fim,
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
