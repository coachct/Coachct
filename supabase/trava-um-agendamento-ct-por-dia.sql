-- ============================================================================
-- TRAVA: Coach CT — um agendamento por dia por cliente, QUALQUER crédito
-- ============================================================================
-- Problema (caso Barbara Monte Marques, 12/11/2026): marcou 05:30 com Wellhub
-- e 06:30 com Coach CT Pro no mesmo dia, pelo site, com 20s de diferença.
-- A trava APP_1_POR_DIA só pegava o mesmo app; créditos diferentes passavam.
-- Na prática a pessoa "segura" dois horários e cancela um na véspera.
--
-- Regra nova (Ricardo, 30/10/2026): no Coach CT o cliente só pode ter UM
-- agendamento ativo por dia, mesmo com créditos diferentes.
--
-- Mesmas origens da trava APP_1_POR_DIA (origem_sujeita_trava_app):
--   trava  -> site (cliente), WhatsApp, recepção e fila (criado_via NULL)
--   passa  -> admin e reserva que chega pelo app do parceiro (wellhub/totalpass)
-- ClassPass (conta proxy) fica fora.
--
-- Só vale para agendamentos NOVOS (e reativação de cancelado). O que já está
-- duplicado no banco continua lá.
-- Idempotente. Aditivo: não mexe em check-in/pagamento.
-- ============================================================================

-- 1) Já tem agendamento ativo no CT nesse dia?
CREATE OR REPLACE FUNCTION public.tem_agendamento_ct_no_dia(
  p_cliente_id uuid,
  p_data date,
  p_ignorar_agendamento_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM agendamentos a
    WHERE a.cliente_id = p_cliente_id
      AND a.data       = p_data
      AND a.status NOT IN ('cancelado')
      AND COALESCE(a.tipo_credito, '') NOT LIKE 'classpass%'
      AND (p_ignorar_agendamento_id IS NULL OR a.id <> p_ignorar_agendamento_id)
  )
$function$;

-- 2) Trigger do CT: trava do dia (qualquer crédito) + trava do app (já existia)
CREATE OR REPLACE FUNCTION public.validar_duplicidade_agendamento_ct()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_app text;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'cancelado' AND NEW.status <> 'cancelado') THEN
    RETURN NEW;
  END IF;

  -- agendamentos não tem via_app; a origem vem toda de criado_via
  IF NOT public.origem_sujeita_trava_app(NEW.criado_via, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.data IS NULL THEN RETURN NEW; END IF;  -- fail-open

  -- Um agendamento por dia no CT, qualquer crédito (ClassPass fora)
  IF COALESCE(NEW.tipo_credito, '') NOT LIKE 'classpass%'
     AND public.tem_agendamento_ct_no_dia(NEW.cliente_id, NEW.data, NEW.id) THEN
    RAISE EXCEPTION 'CT_1_POR_DIA: você já tem um treino agendado no Coach CT nesse dia. É permitido apenas um agendamento por dia.';
  END IF;

  v_app := public.app_parceiro_do_credito(NEW.tipo_credito);
  IF v_app IS NULL THEN RETURN NEW; END IF;

  IF public.tem_treino_do_app_no_dia(NEW.cliente_id, NEW.data, v_app, NEW.id, NULL) THEN
    RAISE EXCEPTION 'APP_1_POR_DIA: você já tem um treino nesse dia usando o %. Cada app permite apenas um treino por dia, em qualquer unidade.',
      public.nome_app_parceiro(v_app);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_duplicidade_agendamento_ct ON public.agendamentos;
CREATE TRIGGER trg_validar_duplicidade_agendamento_ct
  BEFORE INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_duplicidade_agendamento_ct();

-- 3) Fila: quem já tem agendamento no CT no dia não entra na fila do CT
--    (seria promovido pra nada). Club segue só com a trava do app.
CREATE OR REPLACE FUNCTION public.validar_duplicidade_fila_club()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_app  text;
  v_data date;
BEGIN
  IF NEW.ocorrencia_id IS NULL AND NEW.data IS NOT NULL
     AND COALESCE(NEW.tipo_credito, '') NOT LIKE 'classpass%'
     AND public.tem_agendamento_ct_no_dia(NEW.cliente_id, NEW.data) THEN
    RAISE EXCEPTION 'CT_1_POR_DIA: você já tem um treino agendado no Coach CT nesse dia. Como é permitido apenas um agendamento por dia, não dá pra entrar na fila de outro horário.';
  END IF;

  v_app := public.app_parceiro_do_credito(NEW.tipo_credito);
  IF v_app IS NULL THEN RETURN NEW; END IF;

  IF NEW.ocorrencia_id IS NOT NULL THEN
    SELECT co.data INTO v_data FROM club_ocorrencias co WHERE co.id = NEW.ocorrencia_id;
  ELSE
    v_data := NEW.data;  -- fila do Coach CT
  END IF;

  IF v_data IS NULL THEN RETURN NEW; END IF;  -- fail-open

  IF public.tem_treino_do_app_no_dia(NEW.cliente_id, v_data, v_app) THEN
    RAISE EXCEPTION 'APP_1_POR_DIA: você já tem um treino nesse dia usando o %. Como cada app permite apenas um treino por dia (em qualquer unidade), não dá pra entrar na fila de outra aula no mesmo dia.',
      public.nome_app_parceiro(v_app);
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Promoção da fila do CT: pular quem já tem agendamento no dia (qualquer
--    crédito). Sem isso o insert cairia na trava acima e a exceção derrubaria
--    o cancelamento que abriu a vaga. Única mudança: o EXISTS deixou de olhar
--    tipo_credito/unidade. O resto é idêntico ao que está em produção.
CREATE OR REPLACE FUNCTION public.processar_fila_espera(p_data date, p_horario time without time zone, p_unidade_id uuid, p_exigir_vaga boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_proximo             record;
  v_novo_agendamento_id uuid;
  v_horas_restantes     numeric;
  v_data_hora_aula      timestamptz;
  v_disponivel          int;
  v_mensagem            text;
  v_destino             text;
  v_unidade_nome        text;
  v_app                 text;
BEGIN
  v_data_hora_aula  := (p_data || ' ' || p_horario)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_horas_restantes := EXTRACT(EPOCH FROM (v_data_hora_aula - now())) / 3600;

  IF v_horas_restantes < 3 THEN
    RETURN jsonb_build_object('sucesso', false, 'motivo', 'fora_do_prazo',
                              'horas_restantes', v_horas_restantes);
  END IF;

  IF p_exigir_vaga AND vagas_livres_ct(p_data, p_horario, p_unidade_id) <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'motivo', 'sem_vaga');
  END IF;

  SELECT nome INTO v_unidade_nome FROM unidades WHERE id = p_unidade_id;

  SELECT f.*, c.nome AS cliente_nome, c.email, c.telefone, c.whatsapp,
         c.notificacao_preferida, c.bloqueado
  INTO v_proximo
  FROM fila_espera f
  JOIN clientes c ON c.id = f.cliente_id
  WHERE f.data = p_data
    AND f.horario = p_horario
    AND f.unidade_id = p_unidade_id
    AND f.status = 'aguardando'
    AND c.bloqueado = false
  ORDER BY f.criado_em ASC
  LIMIT 1;

  IF v_proximo IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'motivo', 'fila_vazia');
  END IF;

  SELECT COALESCE(
    (saldo_creditos_cliente(
        v_proximo.cliente_id,
        EXTRACT(month FROM p_data)::int,
        EXTRACT(year  FROM p_data)::int,
        p_unidade_id
     ) -> v_proximo.tipo_credito ->> 'disponivel')::int, 0)
  INTO v_disponivel;

  IF v_disponivel <= 0 THEN
    UPDATE fila_espera SET status = 'sem_creditos', confirmado_em = now()
    WHERE id = v_proximo.id;
    RETURN processar_fila_espera(p_data, p_horario, p_unidade_id, p_exigir_vaga);
  END IF;

  v_app := public.app_parceiro_do_credito(v_proximo.tipo_credito);

  -- Já tem agendamento no CT nesse dia (qualquer crédito),
  -- OU já tem treino do mesmo app nesse dia em qualquer unidade (CT + Club).
  IF public.tem_agendamento_ct_no_dia(v_proximo.cliente_id, p_data)
  OR (
    v_app IS NOT NULL
    AND public.tem_treino_do_app_no_dia(v_proximo.cliente_id, p_data, v_app)
  ) THEN
    UPDATE fila_espera SET status = 'duplicado', confirmado_em = now()
    WHERE id = v_proximo.id;
    RETURN processar_fila_espera(p_data, p_horario, p_unidade_id, p_exigir_vaga);
  END IF;

  INSERT INTO agendamentos (cliente_id, data, horario, status, tipo_credito, unidade_id, criado_em)
  VALUES (v_proximo.cliente_id, p_data, p_horario, 'confirmado', v_proximo.tipo_credito, p_unidade_id, now())
  RETURNING id INTO v_novo_agendamento_id;

  UPDATE fila_espera
  SET status = 'confirmado', confirmado_em = now(),
      agendamento_gerado_id = v_novo_agendamento_id
  WHERE id = v_proximo.id;

  IF v_proximo.notificacao_preferida != 'nenhuma' THEN
    v_mensagem := format(
      'Olá %s! Boa notícia: uma vaga abriu na sua aula em %s do dia %s às %s e você foi confirmado automaticamente da fila de espera. Lembrando: cancelamento gratuito até 12h antes (ou 3h se houver fila). Bons treinos! 💪',
      split_part(v_proximo.cliente_nome, ' ', 1), v_unidade_nome,
      to_char(p_data, 'DD/MM'), to_char(p_horario, 'HH24:MI'));

    v_destino := CASE v_proximo.notificacao_preferida
      WHEN 'whatsapp' THEN COALESCE(v_proximo.whatsapp, v_proximo.telefone)
      WHEN 'email'    THEN v_proximo.email
    END;

    INSERT INTO notificacoes_pendentes (
      cliente_id, tipo, canal, destino, mensagem, agendamento_id, unidade_id
    ) VALUES (
      v_proximo.cliente_id, 'fila_confirmada', v_proximo.notificacao_preferida,
      v_destino, v_mensagem, v_novo_agendamento_id, p_unidade_id
    );
  END IF;

  RETURN jsonb_build_object('sucesso', true,
    'cliente_id', v_proximo.cliente_id, 'cliente_nome', v_proximo.cliente_nome,
    'agendamento_id', v_novo_agendamento_id, 'unidade_id', p_unidade_id,
    'notificacao', v_proximo.notificacao_preferida);
END;
$function$;
