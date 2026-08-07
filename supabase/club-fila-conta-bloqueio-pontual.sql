-- club-fila-conta-bloqueio-pontual.sql
--
-- PROBLEMA (2 furos na promoção da fila, aula de Running):
--   1) A checagem de vaga só descontava bloqueio GLOBAL (club_posicoes.bloqueado).
--      Bloqueio PONTUAL da ocorrência (club_posicoes_bloqueios_ocorrencia) era
--      ignorado. Numa aula com 26 posições e 2 travadas pontualmente, a fila
--      enxergava 26 vagas e promovia além da lotação real -> overbooking
--      (caso real: 25 reservas numa aula de 24 lugares úteis).
--   2) O INSERT da promoção nunca escolhia posição -> o promovido caía
--      "sem posição" (posicao NULL) em aula de Running.
--
-- SOLUÇÃO: para tipo 'running_funcional', a vaga passa a ser definida pela
-- primeira POSIÇÃO realmente livre — ativa, fora de bloqueio global E pontual,
-- e não ocupada por reserva 'reservado'/'presente'. Sem posição livre = sem
-- vaga (não promove). Havendo, promove JÁ gravando a posição. Mesma regra de
-- escolha do app (escolherPosicao): esteira 'R' antes de funcional 'F', menor
-- número primeiro. Lift/LFG (ELSE) segue idêntico: capacidade - usadas.
--
-- Aditivo e à prova de falha: a promoção continua sendo um EFEITO do
-- cancelamento (trigger blindado inalterado). Só a função de promoção muda.

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
  v_usadas int;
  v_livres int;
  v_pos_livre text;   -- NOVO: primeira posição livre (só Running)
  v_tel_limpo text;
  v_canal text;
  v_destino text;
  v_promovido boolean;
  v_pulados int := 0;
  v_ultimo_erro text;
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

  -- VAGA:
  --  * Running: existe se houver POSIÇÃO livre (desconta bloqueio global E pontual
  --    e as posições já ocupadas). A posição escolhida é gravada na reserva.
  --  * Lift/LFG: capacidade - reservas usadas, como antes.
  IF v_oc.tipo = 'running_funcional' THEN
    SELECT (p.tipo || lpad(p.numero::text, 2, '0'))
    INTO v_pos_livre
    FROM club_posicoes p
    WHERE p.unidade_id = v_oc.unidade_id
      AND p.ativo = true
      AND p.bloqueado = false                                             -- bloqueio global
      AND (p.tipo || lpad(p.numero::text, 2, '0')) NOT IN (               -- bloqueio pontual desta aula
        SELECT posicao FROM club_posicoes_bloqueios_ocorrencia
        WHERE ocorrencia_id = p_ocorrencia_id
      )
      AND (p.tipo || lpad(p.numero::text, 2, '0')) NOT IN (               -- já ocupadas
        SELECT posicao FROM club_reservas
        WHERE ocorrencia_id = p_ocorrencia_id
          AND status IN ('reservado','presente')
          AND posicao IS NOT NULL
      )
    ORDER BY CASE WHEN p.tipo = 'R' THEN 0 ELSE 1 END, p.numero
    LIMIT 1;

    IF v_pos_livre IS NULL THEN
      RETURN jsonb_build_object('sucesso', false, 'motivo', 'sem_vagas');
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_usadas FROM club_reservas WHERE ocorrencia_id = p_ocorrencia_id AND status IN ('reservado','presente');
    v_livres := GREATEST(0, v_oc.capacidade - v_usadas);
    IF v_livres <= 0 THEN RETURN jsonb_build_object('sucesso', false, 'motivo', 'sem_vagas'); END IF;
  END IF;

  -- Percorre a fila na ordem de chegada. Se o candidato não puder ser promovido
  -- (ex.: já tem reserva no dia pelo mesmo app -> trg_validar_duplicidade_reserva_club),
  -- ele é PULADO e a vaga vai para o próximo, em vez de a exceção derrubar o
  -- cancelamento. Promove exatamente UM (RETURN dentro do loop). Como só um entra,
  -- a v_pos_livre calculada acima é dele.
  FOR v_proximo IN
    SELECT f.*, c.nome AS cliente_nome, c.email, c.telefone
    FROM fila_espera f
    JOIN clientes c ON c.id = f.cliente_id
    WHERE f.ocorrencia_id = p_ocorrencia_id
      AND f.status = 'aguardando'
      AND c.bloqueado = false
    ORDER BY f.criado_em ASC
  LOOP
    BEGIN
      INSERT INTO club_reservas (ocorrencia_id, cliente_id, tipo_credito, status, posicao)
      VALUES (
        p_ocorrencia_id, v_proximo.cliente_id, v_proximo.tipo_credito, 'reservado',
        CASE WHEN v_oc.tipo = 'running_funcional' THEN v_pos_livre ELSE NULL END
      )
      RETURNING id INTO v_nova_reserva_id;
      v_promovido := true;
    EXCEPTION WHEN OTHERS THEN
      v_promovido := false;
      v_pulados := v_pulados + 1;
      v_ultimo_erro := SQLERRM;
      RAISE WARNING '[fila club] cliente % pulado na ocorrencia %: %', v_proximo.cliente_id, p_ocorrencia_id, SQLERRM;
    END;

    IF NOT v_promovido THEN
      CONTINUE;  -- tenta o proximo da fila
    END IF;

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

    RETURN jsonb_build_object('sucesso', true, 'cliente_id', v_proximo.cliente_id, 'reserva_id', v_nova_reserva_id, 'posicao', v_pos_livre, 'pulados', v_pulados);
  END LOOP;

  RETURN jsonb_build_object('sucesso', false, 'motivo', CASE WHEN v_pulados > 0 THEN 'ninguem_elegivel' ELSE 'fila_vazia' END, 'pulados', v_pulados, 'ultimo_erro', v_ultimo_erro);
END;
$function$;
