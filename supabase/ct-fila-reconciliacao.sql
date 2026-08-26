-- ════════════════════════════════════════════════════════════════════════════
-- FILA COACH CT — validação de saldo viva + reconciliação de vaga órfã
--
-- CONTEXTO (26/08/2026): 3 clientes estavam na fila de espera com vaga de coach
-- aberta ao lado (27/08 05:30, 28/08 05:30 e 06:30, Just CT). Duas causas:
--
--  1) A fila só era promovida por EVENTO: cancelamento de agendamento
--     (trigger on_agendamento_cancelado) e desbloqueio de vaga
--     (desbloquear_vagas_parcial). Vaga que nasce de mudança de GRADE — coach
--     novo no horário, coach voltando de férias, horário reativado — não tem
--     gatilho nenhum, então fica órfã pra sempre.
--
--  2) A validação de saldo dentro de processar_fila_espera estava MORTA:
--     comparava tipo_credito com 'wellhub'/'totalpass'/'avulso', mas os valores
--     reais têm sufixo de unidade ('wellhub_just_ct'). Nenhum IF casava, então
--     a fila promovia sem conferir o limite mensal do plano.
--
-- NÃO É BUG (conferido antes de mexer): o crédito avulso É baixado, pelo
-- trigger on_agendamento_consumir_avulso no INSERT. O bloco de consumo manual
-- que existia aqui era código morto redundante — mantê-lo passaria a consumir
-- dois créditos. Foi removido, não "corrigido".
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1) Quantas vagas de coach sobram num slot do CT ─────────────────────────
-- Espelha o cálculo do site: grade de coaches − ocupados − bloqueadas.
-- Conservador de propósito: só conta coach ativo e ignora coach_horarios_extra
-- (a grade extra está atrás do kill switch NEXT_PUBLIC_GRADE_EXTRA_ATIVO no
-- app; contá-la aqui promoveria para uma vaga que o site não vende). Se errar,
-- erra pra menos — no pior caso não promove, que é o comportamento de hoje.
CREATE OR REPLACE FUNCTION public.vagas_livres_ct(
  p_data       date,
  p_horario    time without time zone,
  p_unidade_id uuid
) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_dow        int  := EXTRACT(dow FROM p_data)::int;
  v_hora_txt   text := to_char(p_horario, 'HH24:MI');
  v_usa_fds    boolean;
  v_total      int := 0;
  v_ocupados   int := 0;
  v_bloqueadas int := 0;
BEGIN
  v_usa_fds := v_dow IN (0, 6)
            OR EXISTS (SELECT 1 FROM feriados fr
                       WHERE fr.unidade_id = p_unidade_id
                         AND fr.data = p_data AND fr.ativo = true);

  IF v_usa_fds THEN
    -- Fim de semana/feriado: grade vem da escala, e só existem 5 horários.
    IF v_hora_txt NOT IN ('08:00','09:00','10:00','11:00','12:00') THEN
      RETURN 0;
    END IF;
    -- escala_fds.coach_id guarda USER_ID → resolve para coaches.id
    SELECT COUNT(DISTINCT c.id) INTO v_total
    FROM escala_fds e
    JOIN coaches c ON c.user_id = e.coach_id AND c.ativo = true
    WHERE e.unidade_id = p_unidade_id
      AND e.data = p_data
      AND NOT EXISTS (SELECT 1 FROM coach_ferias cf
                      WHERE cf.coach_id = c.id
                        AND p_data BETWEEN cf.data_inicio AND cf.data_fim);
  ELSE
    SELECT COUNT(DISTINCT ch.coach_id) INTO v_total
    FROM coach_horarios ch
    JOIN coaches c ON c.id = ch.coach_id AND c.ativo = true
    WHERE ch.unidade_id = p_unidade_id
      AND ch.ativo = true
      AND ch.dia_semana = v_dow
      AND left(ch.hora, 5) = v_hora_txt
      AND NOT EXISTS (SELECT 1 FROM coach_ferias cf
                      WHERE cf.coach_id = ch.coach_id
                        AND p_data BETWEEN cf.data_inicio AND cf.data_fim);
  END IF;

  SELECT COUNT(*) INTO v_ocupados
  FROM agendamentos a
  WHERE a.unidade_id = p_unidade_id AND a.data = p_data
    AND a.horario = p_horario AND a.status <> 'cancelado';

  SELECT COALESCE(SUM(vb.quantidade), 0) INTO v_bloqueadas
  FROM vagas_bloqueadas vb
  WHERE vb.unidade_id = p_unidade_id AND vb.data = p_data
    AND vb.horario = p_horario AND vb.ativo = true;

  RETURN GREATEST(0, v_total - v_ocupados - v_bloqueadas);
END;
$$;


-- ── 2) Motor da fila, com a validação de saldo viva ─────────────────────────
-- O saldo agora sai de saldo_creditos_cliente (fonte de verdade do app), cujas
-- chaves JÁ são o tipo_credito com sufixo de unidade — e é o saldo do MÊS DA
-- AULA, não o do mês corrente.
--
-- p_exigir_vaga: default false PRESERVA o fluxo atual. Cancelamento e
-- desbloqueio já têm a vaga garantida quando chamam (o trigger é AFTER UPDATE,
-- então o agendamento já está cancelado). Só o cron chama com true.
DROP FUNCTION IF EXISTS public.processar_fila_espera(date, time without time zone, uuid);

CREATE FUNCTION public.processar_fila_espera(
  p_data         date,
  p_horario      time without time zone,
  p_unidade_id   uuid,
  p_exigir_vaga  boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proximo             record;
  v_novo_agendamento_id uuid;
  v_horas_restantes     numeric;
  v_data_hora_aula      timestamptz;
  v_disponivel          int;
  v_mensagem            text;
  v_destino             text;
  v_unidade_nome        text;
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

  -- Já tem aula nesse dia com esse mesmo crédito nessa unidade
  IF EXISTS (
    SELECT 1 FROM agendamentos
    WHERE cliente_id = v_proximo.cliente_id
      AND data = p_data
      AND tipo_credito = v_proximo.tipo_credito
      AND unidade_id = p_unidade_id
      AND status NOT IN ('cancelado')
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
$$;


-- ── 3) Varredura periódica: fila aguardando × vaga livre ────────────────────
-- Chamada pelo cron /api/fila/reconciliar (Vercel, de 10 em 10 min).
-- Idempotente: sem vaga livre, não faz nada.
CREATE OR REPLACE FUNCTION public.reconciliar_fila_ct(p_dias int DEFAULT 21)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s            record;
  v_res        jsonb;
  v_slots      int := 0;
  v_promovidos int := 0;
  v_guarda     int;
  v_detalhe    jsonb := '[]'::jsonb;
BEGIN
  FOR s IN
    SELECT DISTINCT fe.unidade_id, fe.data, fe.horario
    FROM fila_espera fe
    WHERE fe.status = 'aguardando'
      AND fe.ocorrencia_id IS NULL          -- só Coach CT; o Club tem motor próprio
      AND fe.data >= CURRENT_DATE
      AND fe.data <= CURRENT_DATE + p_dias
    ORDER BY fe.data, fe.horario
  LOOP
    v_slots  := v_slots + 1;
    v_guarda := 0;
    -- Promove enquanto sobrar vaga E houver alguém elegível na fila.
    LOOP
      v_guarda := v_guarda + 1;
      EXIT WHEN v_guarda > 20;   -- trava anti-loop, nunca deve ser alcançada
      EXIT WHEN vagas_livres_ct(s.data, s.horario, s.unidade_id) <= 0;

      v_res := processar_fila_espera(s.data, s.horario, s.unidade_id, true);
      EXIT WHEN NOT COALESCE((v_res->>'sucesso')::boolean, false);

      v_promovidos := v_promovidos + 1;
      v_detalhe := v_detalhe || jsonb_build_object(
        'cliente', v_res->>'cliente_nome',
        'data',    s.data,
        'horario', to_char(s.horario, 'HH24:MI'),
        'unidade', (SELECT nome FROM unidades WHERE id = s.unidade_id));
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'slots_checados', v_slots,
    'promovidos',     v_promovidos,
    'detalhe',        v_detalhe);
END;
$$;
