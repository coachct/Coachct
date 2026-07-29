-- ============================================================================
-- FIX: a promoção da fila de espera do Club NÃO pode derrubar o cancelamento
-- ============================================================================
-- Bug (incidentes Viviane 21/07 e Amanda 28/07): ao cancelar uma reserva do Club
-- que tem fila, o AFTER UPDATE promove o 1º da fila via processar_fila_espera_club,
-- que faz INSERT em club_reservas. Se esse 1º da fila é Wellhub/TotalPass e JÁ tem
-- reserva no mesmo dia/unidade, o trigger BEFORE INSERT validar_duplicidade_reserva_club
-- lança exceção -> a exceção sobe na MESMA transação -> o cancelamento é REVERTIDO.
-- (A mensagem "Você já tem uma reserva..." é sobre o PROMOVIDO, não sobre quem cancela.)
--
-- Correção (espelha o que o Coach CT já faz em processar_fila_espera):
--  (1) processar_fila_espera_club: antes de inserir, se o próximo é Wellhub/TotalPass
--      e já tem reserva no dia/unidade, marca a fila como 'duplicado' e SEGUE pro
--      próximo (recursão) — a vaga vai pra quem pode receber.
--  (2) trigger_processar_fila_apos_cancelamento_club: envolve a promoção em
--      BEGIN/EXCEPTION — qualquer erro na promoção NUNCA derruba o cancelamento
--      (mesmo padrão do trigger_processar_fila_club_desbloqueio).
-- Idempotente (CREATE OR REPLACE). Aditivo: não muda o fluxo de quem cancela nem
-- de quem já é promovido normalmente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.processar_fila_espera_club(p_ocorrencia_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_proximo record;
  v_nova_reserva_id uuid;
  v_horas_restantes numeric;
  v_data_hora_aula timestamptz;
  v_mensagem text;
  v_oc record;
  v_cap int;
  v_usadas int;
  v_bloqueadas int;
  v_livres int;
  v_tel_limpo text;
  v_canal text;
  v_destino text;
BEGIN
  SELECT co.*, ca.capacidade, ca.tipo, ca.horario AS aula_horario, ca.unidade_id, u.nome as unidade_nome
  INTO v_oc
  FROM club_ocorrencias co
  JOIN club_aulas ca ON ca.id = co.aula_id
  JOIN unidades u ON u.id = ca.unidade_id
  WHERE co.id = p_ocorrencia_id;

  IF v_oc IS NULL THEN RETURN jsonb_build_object('sucesso', false, 'motivo', 'ocorrencia_nao_encontrada'); END IF;

  IF v_oc.fila_pausada THEN RETURN jsonb_build_object('sucesso', false, 'motivo', 'fila_pausada'); END IF;

  v_data_hora_aula := (v_oc.data::text || ' ' || v_oc.aula_horario::text)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_horas_restantes := EXTRACT(EPOCH FROM (v_data_hora_aula - now())) / 3600;
  IF v_horas_restantes < 3 THEN
    RETURN jsonb_build_object('sucesso', false, 'motivo', 'fora_do_prazo');
  END IF;

  SELECT COUNT(*) INTO v_usadas FROM club_reservas WHERE ocorrencia_id = p_ocorrencia_id AND status IN ('reservado','presente');
  SELECT COUNT(*) INTO v_bloqueadas FROM club_posicoes WHERE unidade_id = v_oc.unidade_id AND ativo = true AND bloqueado = true;
  v_cap := v_oc.capacidade;
  IF v_oc.tipo = 'running_funcional' THEN v_cap := GREATEST(0, v_cap - v_bloqueadas); END IF;
  v_livres := GREATEST(0, v_cap - v_usadas);

  IF v_livres <= 0 THEN RETURN jsonb_build_object('sucesso', false, 'motivo', 'sem_vagas'); END IF;

  SELECT f.*, c.nome AS cliente_nome, c.email, c.telefone, c.bloqueado
  INTO v_proximo
  FROM fila_espera f
  JOIN clientes c ON c.id = f.cliente_id
  WHERE f.ocorrencia_id = p_ocorrencia_id
    AND f.status = 'aguardando'
    AND c.bloqueado = false
  ORDER BY f.criado_em ASC
  LIMIT 1;

  IF v_proximo IS NULL THEN RETURN jsonb_build_object('sucesso', false, 'motivo', 'fila_vazia'); END IF;

  -- [FIX 1] Wellhub/TotalPass: se o próximo da fila JÁ tem reserva ativa no mesmo
  -- dia/unidade/tipo, promovê-lo iria estourar o trigger de duplicidade e derrubar
  -- o cancelamento. Então pula esse (marca 'duplicado') e segue pro próximo da fila.
  IF (v_proximo.tipo_credito LIKE 'wellhub%' OR v_proximo.tipo_credito LIKE 'totalpass%') THEN
    IF EXISTS (
      SELECT 1
      FROM club_reservas cr
      JOIN club_ocorrencias co2 ON co2.id = cr.ocorrencia_id
      JOIN club_aulas ca2 ON ca2.id = co2.aula_id
      WHERE cr.cliente_id   = v_proximo.cliente_id
        AND cr.tipo_credito = v_proximo.tipo_credito
        AND cr.status       NOT IN ('cancelado')
        AND co2.data        = v_oc.data
        AND ca2.unidade_id  = v_oc.unidade_id
    ) THEN
      UPDATE fila_espera SET status = 'duplicado', confirmado_em = now() WHERE id = v_proximo.id;
      RETURN processar_fila_espera_club(p_ocorrencia_id);
    END IF;
  END IF;

  INSERT INTO club_reservas (ocorrencia_id, cliente_id, tipo_credito, status)
  VALUES (p_ocorrencia_id, v_proximo.cliente_id, v_proximo.tipo_credito, 'reservado')
  RETURNING id INTO v_nova_reserva_id;

  UPDATE fila_espera SET status = 'confirmado', confirmado_em = now() WHERE id = v_proximo.id;

  v_mensagem := format(
    'Olá %s! Uma vaga abriu e você foi confirmado automaticamente na fila de espera. %s · %s · %s. Bons treinos! 💪',
    split_part(v_proximo.cliente_nome, ' ', 1),
    v_oc.unidade_nome,
    to_char(v_oc.data, 'DD/MM'),
    to_char(v_oc.aula_horario, 'HH24:MI')
  );

  -- Canal: WhatsApp quando há telefone válido (10-11 dígitos); senão email (fallback).
  v_tel_limpo := regexp_replace(coalesce(v_proximo.telefone, ''), '\D', '', 'g');
  IF length(v_tel_limpo) IN (10, 11) THEN
    v_canal := 'whatsapp';
    v_destino := v_tel_limpo;
  ELSE
    v_canal := 'email';
    v_destino := v_proximo.email;
  END IF;

  INSERT INTO notificacoes_pendentes (cliente_id, tipo, canal, destino, mensagem, unidade_id)
  VALUES (v_proximo.cliente_id, 'fila_confirmada', v_canal, v_destino, v_mensagem, v_oc.unidade_id);

  RETURN jsonb_build_object('sucesso', true, 'cliente_id', v_proximo.cliente_id, 'reserva_id', v_nova_reserva_id);
END;
$function$;


CREATE OR REPLACE FUNCTION public.trigger_processar_fila_apos_cancelamento_club()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status != 'cancelado'
     AND NEW.status = 'cancelado'
     AND COALESCE(NEW.via_app, false) = false THEN
    -- [FIX 2] A promoção da fila NUNCA pode derrubar o cancelamento do cliente.
    BEGIN
      PERFORM processar_fila_espera_club(NEW.ocorrencia_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'processar_fila_espera_club falhou para ocorrencia %: %', NEW.ocorrencia_id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
