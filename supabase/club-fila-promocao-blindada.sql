-- club-fila-promocao-blindada.sql
--
-- Incidente 21/07/2026: cliente com +12h de antecedencia recebia "Erro ao cancelar"
-- na tela /minha-conta. A causa NAO era a janela de 3h/12h nem RLS:
--
--   cancelar (UPDATE club_reservas) -> trigger_processar_fila_apos_cancelamento_club
--   -> processar_fila_espera_club() -> INSERT da reserva do 1o da fila
--   -> trg_validar_duplicidade_reserva_club barra (o 1o da fila JA tinha reserva no
--      mesmo dia/unidade pelo mesmo app) -> excecao na MESMA transacao
--   -> o cancelamento de quem estava saindo e revertido.
--
-- A mensagem que o cliente via ("Voce ja tem uma reserva nesta unidade neste dia...")
-- era sobre o PROMOVIDO, nao sobre quem cancelava. Confirmado na pratica: bastou tirar
-- o 1o da fila (impedido) para o cancelamento passar e o 2o ser promovido normalmente.
--
-- Dois consertos, ambos aditivos (nada de regra nova de negocio):
--   1. processar_fila_espera_club: em vez de LIMIT 1, percorre a fila NA MESMA ORDEM e
--      pula quem nao pode ser promovido (o INSERT de cada candidato vai num bloco
--      BEGIN/EXCEPTION proprio). O 1o que entrar e promovido, igual antes.
--   2. trigger_processar_fila_apos_cancelamento_club: a promocao NUNCA pode derrubar o
--      cancelamento. Se falhar por qualquer motivo, vira WARNING e a vaga fica livre.
--
-- O resto (prazo de 3h, capacidade, fila pausada, cliente bloqueado, mensagem, canal
-- whatsapp/email) fica IDENTICO ao que ja rodava.

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

  SELECT COUNT(*) INTO v_usadas FROM club_reservas WHERE ocorrencia_id = p_ocorrencia_id AND status IN ('reservado','presente');
  SELECT COUNT(*) INTO v_bloqueadas FROM club_posicoes WHERE unidade_id = v_oc.unidade_id AND ativo = true AND bloqueado = true;
  v_cap := v_oc.capacidade;
  IF v_oc.tipo = 'running_funcional' THEN v_cap := GREATEST(0, v_cap - v_bloqueadas); END IF;
  v_livres := GREATEST(0, v_cap - v_usadas);

  IF v_livres <= 0 THEN RETURN jsonb_build_object('sucesso', false, 'motivo', 'sem_vagas'); END IF;

  -- Percorre a fila na ordem de chegada (mesma ordem de antes). A unica diferenca em
  -- relacao ao LIMIT 1 anterior: se o candidato nao puder ser promovido (ex.: ja tem
  -- reserva no dia pelo mesmo app -> trg_validar_duplicidade_reserva_club), ele e
  -- PULADO e a vaga vai para o proximo, em vez de a excecao derrubar o cancelamento.
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
      INSERT INTO club_reservas (ocorrencia_id, cliente_id, tipo_credito, status)
      VALUES (p_ocorrencia_id, v_proximo.cliente_id, v_proximo.tipo_credito, 'reservado')
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

    RETURN jsonb_build_object('sucesso', true, 'cliente_id', v_proximo.cliente_id, 'reserva_id', v_nova_reserva_id, 'pulados', v_pulados);
  END LOOP;

  RETURN jsonb_build_object('sucesso', false, 'motivo', CASE WHEN v_pulados > 0 THEN 'ninguem_elegivel' ELSE 'fila_vazia' END, 'pulados', v_pulados, 'ultimo_erro', v_ultimo_erro);
END;
$function$;


-- A promocao da fila e um EFEITO do cancelamento, nunca uma condicao dele: se falhar,
-- o cancelamento tem que passar assim mesmo e a vaga fica livre para quem quiser.
-- Mesmo padrao dos triggers de sync Wellhub/TotalPass.
CREATE OR REPLACE FUNCTION public.trigger_processar_fila_apos_cancelamento_club()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status != 'cancelado'
     AND NEW.status = 'cancelado'
     AND COALESCE(NEW.via_app, false) = false THEN
    BEGIN
      PERFORM processar_fila_espera_club(NEW.ocorrencia_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[fila club] promocao falhou (ignorado, cancelamento mantido): %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
