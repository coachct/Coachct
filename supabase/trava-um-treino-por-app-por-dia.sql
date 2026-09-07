-- ============================================================================
-- TRAVA: um treino por dia por app de parceiro (Wellhub / TotalPass)
-- ============================================================================
-- Problema (caso Bruna Almeida, 09/09/2026): a pessoa marcou CT 06:30
-- (wellhub_just_ct) E Club Vila Olímpia 07:00 (wellhub_just_club_vila_olimpia)
-- no mesmo dia. A trava antiga (validar_duplicidade_reserva_club) era por
-- dia + UNIDADE + tipo_credito exato — e como o tipo_credito carrega a unidade
-- ('wellhub_just_ct' != 'wellhub_just_club_vila_olimpia'), ela nunca pegava o
-- cruzamento entre unidades. A tabela agendamentos (Coach CT) não tinha trava
-- nenhuma.
--
-- Regra nova: o mesmo APP (wellhub OU totalpass) só permite UM treino por dia,
-- somando Coach CT (agendamentos) + Club (club_reservas), em QUALQUER unidade.
-- Apps diferentes entre si, créditos avulsos, pacotes e planos próprios seguem
-- livres — podem repetir no mesmo dia.
--
-- Decisões do Ricardo (07/09/2026):
--  1. A trava vale só no NOSSO lado: site (criado_via 'cliente'), WhatsApp e
--     recepção. Reserva que chega pelo app do parceiro (webhook Wellhub /
--     TotalPass, criado_via 'wellhub'/'totalpass' ou via_app = true) NÃO é
--     barrada — aquele fluxo é domínio deles e barrar quebraria a integração.
--  2. ClassPass fica FORA da trava: 'Reserva Classpass' é uma conta proxy única
--     que agenda por todos os clientes deles (10 a 30 reservas no mesmo dia no
--     mesmo cliente_id). Ligar a trava ali travaria o ClassPass inteiro.
--  3. Somente ADMIN fura a trava (criado_via = 'admin'). Recepção NÃO fura.
--
-- Idempotente (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). Aditivo: não mexe
-- em reserva/check-in/pagamento existentes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Qual app de parceiro está por trás de um tipo_credito
--    NULL = não é app com trava (avulso, pacote, plano próprio, coach_ct_pro,
--    e também classpass, que fica de fora de propósito — ver decisão 2).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_parceiro_do_credito(p_tipo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_tipo LIKE 'wellhub%'   THEN 'wellhub'
    WHEN p_tipo LIKE 'totalpass%' THEN 'totalpass'
    ELSE NULL
  END
$function$;

-- Nome do app pra mensagem de erro (o aluno lê isso)
CREATE OR REPLACE FUNCTION public.nome_app_parceiro(p_app text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE p_app WHEN 'wellhub' THEN 'Wellhub' WHEN 'totalpass' THEN 'TotalPass' ELSE p_app END
$function$;

-- ---------------------------------------------------------------------------
-- 2) Já existe treino desse app nesse dia? (CT + Club, qualquer unidade)
--    SECURITY DEFINER porque a checagem cruza as duas tabelas e não pode
--    depender do que a RLS do usuário logado enxerga. Retorna só boolean.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tem_treino_do_app_no_dia(
  p_cliente_id uuid,
  p_data date,
  p_app text,
  p_ignorar_agendamento_id uuid DEFAULT NULL,
  p_ignorar_reserva_id uuid DEFAULT NULL
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
      AND public.app_parceiro_do_credito(a.tipo_credito) = p_app
      AND (p_ignorar_agendamento_id IS NULL OR a.id <> p_ignorar_agendamento_id)
    UNION ALL
    SELECT 1
    FROM club_reservas cr
    JOIN club_ocorrencias co ON co.id = cr.ocorrencia_id
    WHERE cr.cliente_id = p_cliente_id
      AND co.data       = p_data
      AND cr.status NOT IN ('cancelado')
      AND public.app_parceiro_do_credito(cr.tipo_credito) = p_app
      AND (p_ignorar_reserva_id IS NULL OR cr.id <> p_ignorar_reserva_id)
  )
$function$;

-- ---------------------------------------------------------------------------
-- 3) A origem do insert está sujeita à trava?
--    Passa livre: webhook do parceiro e admin. Trava: cliente, whatsapp,
--    recepcao e NULL (fila de espera / scripts).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.origem_sujeita_trava_app(p_criado_via text, p_via_app boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT NOT (
    COALESCE(p_via_app, false)
    OR COALESCE(p_criado_via, '') IN ('wellhub', 'totalpass', 'admin')
  )
$function$;

-- ---------------------------------------------------------------------------
-- 4) Club: substitui a trava por unidade pela trava por app/dia
--    INSERT e também a REATIVAÇÃO (a recepção reaproveita uma reserva cancelada
--    com UPDATE em vez de inserir outra — sem isso a trava tinha esse furo).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_duplicidade_reserva_club()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_app  text;
  v_data date;
BEGIN
  -- No UPDATE só interessa a reativação. Marcar presença/falta/cancelar não passa aqui.
  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'cancelado' AND NEW.status <> 'cancelado') THEN
    RETURN NEW;
  END IF;

  v_app := public.app_parceiro_do_credito(NEW.tipo_credito);
  IF v_app IS NULL THEN RETURN NEW; END IF;

  IF NOT public.origem_sujeita_trava_app(NEW.criado_via, NEW.via_app) THEN
    RETURN NEW;
  END IF;

  SELECT co.data INTO v_data FROM club_ocorrencias co WHERE co.id = NEW.ocorrencia_id;
  IF v_data IS NULL THEN RETURN NEW; END IF;  -- fail-open

  IF public.tem_treino_do_app_no_dia(NEW.cliente_id, v_data, v_app, NULL, NEW.id) THEN
    RAISE EXCEPTION 'APP_1_POR_DIA: você já tem um treino nesse dia usando o %. Cada app permite apenas um treino por dia, em qualquer unidade.',
      public.nome_app_parceiro(v_app);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_duplicidade_reserva_club ON public.club_reservas;
CREATE TRIGGER trg_validar_duplicidade_reserva_club
  BEFORE INSERT OR UPDATE ON public.club_reservas
  FOR EACH ROW EXECUTE FUNCTION public.validar_duplicidade_reserva_club();

-- ---------------------------------------------------------------------------
-- 5) Coach CT: trava nova (a tabela agendamentos não tinha nenhuma)
-- ---------------------------------------------------------------------------
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

  v_app := public.app_parceiro_do_credito(NEW.tipo_credito);
  IF v_app IS NULL THEN RETURN NEW; END IF;

  -- agendamentos não tem via_app; a origem vem toda de criado_via
  IF NOT public.origem_sujeita_trava_app(NEW.criado_via, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.data IS NULL THEN RETURN NEW; END IF;  -- fail-open

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

-- ---------------------------------------------------------------------------
-- 6) Fila de espera: quem já tem treino do app no dia não entra na fila
--    (seria promovido pra nada — a trava barraria a promoção).
--    Agora cobre Club (ocorrencia_id) e CT (data + horario), cross-unidade.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_duplicidade_fila_club()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_app  text;
  v_data date;
BEGIN
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

DROP TRIGGER IF EXISTS trg_validar_duplicidade_fila_club ON public.fila_espera;
CREATE TRIGGER trg_validar_duplicidade_fila_club
  BEFORE INSERT ON public.fila_espera
  FOR EACH ROW EXECUTE FUNCTION public.validar_duplicidade_fila_club();

-- ---------------------------------------------------------------------------
-- 7) Promoção da fila do CT: pular quem não pode ser promovido
--    processar_fila_espera insere com criado_via NULL, ou seja, cai na trava.
--    Sem esta checagem prévia a exceção subiria na MESMA transação e derrubaria
--    o cancelamento que abriu a vaga (mesmo bug já corrigido no Club).
--    Única mudança: o bloco "já tem aula nesse dia" agora também olha o app
--    cross-unidade. O resto da função é idêntico ao que está em produção.
-- ---------------------------------------------------------------------------
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

  -- Saldo do mês da aula, na chave exata do tipo_credito.
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

  -- Já tem aula nesse dia com esse mesmo crédito nessa unidade,
  -- OU já tem treino do mesmo app nesse dia em qualquer unidade (CT + Club).
  IF EXISTS (
    SELECT 1 FROM agendamentos
    WHERE cliente_id = v_proximo.cliente_id
      AND data = p_data
      AND tipo_credito = v_proximo.tipo_credito
      AND unidade_id = p_unidade_id
      AND status NOT IN ('cancelado')
  ) OR (
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
