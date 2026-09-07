-- ============================================================================
-- CAMPANHA SUMMER MODE: ON  (set/2026)
-- ----------------------------------------------------------------------------
-- Tudo aqui é ADITIVO. Com as colunas novas nulas, o sistema se comporta
-- exatamente como antes:
--   * validade_fixa NULL  -> a validade continua saindo de dias_validade
--   * limite_por_cliente NULL -> não há trava de "um por CPF"
--   * venda_inicio/venda_fim NULL -> o produto não some do site por data
--   * campanha NULL -> o produto não entra em nenhum bloco de campanha
--
-- venda_id em creditos_avulsos é ganho geral (não só da campanha): a partir
-- daqui todo crédito de pacote/avulso sabe de qual venda veio.
-- ============================================================================

-- ── 1. Colunas novas em produtos ────────────────────────────────────────────
alter table produtos
  add column if not exists validade_fixa      date,   -- vence NESTA data, ignorando dias_validade
  add column if not exists venda_inicio       date,   -- janela de exibição/venda no site
  add column if not exists venda_fim          date,
  add column if not exists limite_por_cliente int,    -- 1 = um por CPF
  add column if not exists bonus_creditos     int,    -- 3 / 5
  add column if not exists bonus_data_corte   date,   -- 2026-12-31
  add column if not exists campanha           text;   -- 'summer_mode'

comment on column produtos.validade_fixa      is 'Quando preenchida, os créditos vencem nesta data e dias_validade é ignorado.';
comment on column produtos.venda_inicio       is 'Primeiro dia em que o produto aparece/vende no site. NULL = sempre.';
comment on column produtos.venda_fim          is 'Último dia em que o produto aparece/vende no site. NULL = sempre.';
comment on column produtos.limite_por_cliente is 'Máximo de vendas não excluídas deste produto por cliente. NULL = sem limite.';
comment on column produtos.bonus_creditos     is 'Créditos de bônus se o cliente zerar o pacote até bonus_data_corte.';
comment on column produtos.bonus_data_corte   is 'Data limite para consumir tudo e ganhar o bônus.';
comment on column produtos.campanha           is 'Agrupador de campanha para o front e os relatórios. Ex.: summer_mode.';

create index if not exists idx_produtos_campanha on produtos (campanha) where campanha is not null;

-- ── 2. Vínculo crédito -> venda ─────────────────────────────────────────────
alter table creditos_avulsos
  add column if not exists venda_id uuid references vendas(id);

create index if not exists idx_creditos_avulsos_venda on creditos_avulsos (venda_id);

comment on column creditos_avulsos.venda_id is 'Venda que originou este crédito. Preenchido a partir de set/2026 (créditos antigos ficam nulos).';

-- ── 3. registrar_venda ──────────────────────────────────────────────────────
-- Corpo idêntico ao que estava em produção, com TRÊS mudanças, todas
-- inertes quando as colunas novas estão nulas:
--   a) trava de limite_por_cliente (antes de inserir a venda)
--   b) guarda para pacote/crédito sem nenhuma fonte de validade
--   c) validade := COALESCE(validade_fixa, CURRENT_DATE + dias_validade)
--      e venda_id gravado no INSERT de creditos_avulsos
CREATE OR REPLACE FUNCTION public.registrar_venda(
  p_produto_id uuid,
  p_cliente_id uuid,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_forma_pagamento text,
  p_vendido_por uuid,
  p_unidade_id uuid,
  p_observacao text DEFAULT NULL::text,
  p_desconto_percentual numeric DEFAULT 0,
  p_codigo_liberacao text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  v_uni_extra uuid;
  v_ja_comprou int;
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

  -- NOVO: um de cada por CPF (produtos de campanha). Trava final — as telas
  -- checam antes para não gerar cobrança à toa, mas aqui é o que garante.
  IF COALESCE(v_produto.limite_por_cliente, 0) > 0 THEN
    SELECT count(*) INTO v_ja_comprou
      FROM vendas v
     WHERE v.cliente_id = p_cliente_id
       AND v.produto_id = p_produto_id
       AND v.excluido_em IS NULL;

    IF v_ja_comprou >= v_produto.limite_por_cliente THEN
      RETURN jsonb_build_object(
        'sucesso', false, 'motivo', 'limite_por_cliente',
        'limite', v_produto.limite_por_cliente, 'ja_comprou', v_ja_comprou
      );
    END IF;
  END IF;

  -- NOVO: pacote/crédito precisa de alguma fonte de validade (fixa ou em dias).
  -- Checado aqui, antes de inserir a venda, pra não deixar venda órfã.
  IF (v_produto.subtipo IN ('credito', 'pacote') OR v_produto.subtipo IS NULL)
     AND v_produto.validade_fixa IS NULL
     AND v_produto.dias_validade IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'motivo', 'produto_sem_validade');
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

  -- SUBTIPO: CREDITO_EXTRA (credito extra por aula, apps parceiros)
  -- Uma unica linha no razao creditos_extras, sem validade.
  IF v_produto.subtipo = 'credito_extra' THEN
    v_uni_extra := COALESCE(v_produto.unidade_id, p_unidade_id);
    v_total_creditos := p_quantidade * COALESCE(v_produto.creditos_por_venda, 1);
    v_valor_por_credito := v_valor_total / NULLIF(v_total_creditos, 0);

    INSERT INTO creditos_extras (
      cliente_id, unidade_id, movimento, quantidade,
      valor_unitario, valor_total, produto_id, venda_id,
      origem, criado_por, observacao
    ) VALUES (
      p_cliente_id, v_uni_extra, 'compra', v_total_creditos,
      v_valor_por_credito, v_valor_total, p_produto_id, v_venda_id,
      CASE WHEN p_vendido_por IS NULL THEN 'site' ELSE 'recepcao' END,
      p_vendido_por, v_produto.nome
    );

    RETURN jsonb_build_object(
      'sucesso', true, 'venda_id', v_venda_id, 'subtipo', 'credito_extra',
      'produto', v_produto.nome, 'creditos_gerados', v_total_creditos,
      'saldo', saldo_credito_extra(p_cliente_id, v_uni_extra),
      'valor_original', v_valor_original,
      'desconto_percentual', p_desconto_percentual, 'valor_total', v_valor_total
    );
  END IF;

  -- SUBTIPO: CREDITO ou PACOTE
  IF v_produto.subtipo IN ('credito', 'pacote') OR v_produto.subtipo IS NULL THEN
    v_total_creditos := p_quantidade * COALESCE(v_produto.creditos_por_venda, 1);
    -- MUDOU: validade_fixa manda quando existe; senão, o comportamento de sempre.
    v_validade := COALESCE(
      v_produto.validade_fixa,
      (CURRENT_DATE + (v_produto.dias_validade || ' days')::interval)::date
    );
    v_valor_por_credito := v_valor_total / v_total_creditos;

    FOR i IN 1..v_total_creditos LOOP
      INSERT INTO creditos_avulsos (
        cliente_id, comprado_em, validade, valor_pago,
        forma_pagamento, vendido_por, unidade_id, tipo, observacao, venda_id
      ) VALUES (
        p_cliente_id, now(), v_validade, v_valor_por_credito,
        p_forma_pagamento, p_vendido_por, v_produto.unidade_id,
        v_produto.tipo, v_produto.nome, v_venda_id
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
        forma_pagamento, vendido_por, unidade_id, tipo, observacao, venda_id
      ) VALUES (
        p_cliente_id, now(), CURRENT_DATE + 30, v_valor_por_credito,
        p_forma_pagamento, p_vendido_por, null, 'credito_treino', v_produto.nome, v_venda_id
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

-- ── 4. Os dois produtos da campanha ─────────────────────────────────────────
-- JÁ APLICADO em 06/09/2026, com visivel_site = false de propósito: enquanto o
-- front novo não estiver no ar, o produto apareceria na seção genérica de
-- "Pacotes & Avulsos" do /comprar antigo. Fica invisível até o go-live.
--
-- insert into produtos (nome, tipo, subtipo, valor, dias_validade, validade_fixa,
--                       creditos_por_venda, max_parcelas, visivel_site, ativo, unidade_id,
--                       venda_inicio, venda_fim, limite_por_cliente,
--                       bonus_creditos, bonus_data_corte, campanha, descricao)
-- values
--  ('Summer Mode · 15 treinos', 'credito_treino', 'pacote', 599.00, null, '2027-03-31', 15, 3,
--   false, true, null, '2026-09-08', '2026-09-30', 1, 3, '2026-12-31', 'summer_mode',
--   'Quinze treinos pra encaixar onde couber: no seu ritmo, no seu horário, em qualquer unidade.'),
--  ('Summer Mode · 30 treinos', 'credito_treino', 'pacote', 999.00, null, '2027-03-31', 30, 3,
--   false, true, null, '2026-09-08', '2026-09-30', 1, 5, '2026-12-31', 'summer_mode',
--   'Trinta treinos pra fazer do verão um projeto de verdade. Quanto mais você usa, mais perto do bônus.');

-- ── 5. GO-LIVE agendado: 07/09/2026 às 21:00 de São Paulo ───────────────────
-- APLICADO em 06/09. O pg_cron do Supabase roda em UTC (cron.timezone = GMT),
-- e São Paulo é UTC-3 o ano inteiro — então 08/09 00:00 UTC é exatamente
-- 07/09 21:00 em SP.
--
-- LIGA TUDO de uma vez às 21h: visibilidade + abertura da venda no dia 07.
-- Banner da home, seção do /comprar, landing e compra entram juntos.
-- É idempotente e se desagenda sozinho; a trava de data ainda impede que ele
-- reabra a campanha se sobreviver até setembro de 2027.
--
-- select cron.schedule(
--   'summer-mode-go-live',
--   '0 0 8 9 *',
--   $job$
--     update produtos
--        set visivel_site = true,
--            venda_inicio = date '2026-09-07'
--      where campanha = 'summer_mode'
--        and now() < timestamptz '2026-10-01 00:00:00+00';
--     select cron.unschedule('summer-mode-go-live');
--   $job$
-- );
--
-- As datas ANUNCIADAS nas tags do banner e da landing são texto fixo em
-- JANELA_LABEL_INICIO / JANELA_LABEL_FIM (src/lib/summer.ts), como no canvas.
-- Não derivar de venda_inicio/venda_fim: quando o produto não carrega, o texto
-- some e a tela sai diferente da arte.
--
-- Para adiantar/atrasar: cron.unschedule('summer-mode-go-live') e reagendar.
-- Para subir na mão, agora: as duas linhas do update acima.

-- ── 6. ENCERRAMENTO (01/10/2026) ────────────────────────────────────────────
-- O front já para de mostrar em 01/10 sozinho (venda_fim). Desativar o produto
-- é só a faxina, pra ele sumir também do balcão:
--
-- update produtos set ativo = false where campanha = 'summer_mode';
