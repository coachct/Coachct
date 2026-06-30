-- wellhub-presenca.sql
-- Conciliação de PRESENÇA das reservas via app do Wellhub.
--
-- Casa o check-in do Access Control (entradas_walkin) com a reserva via_app
-- aberta e marca 'presente'. Chamada pela rota /api/wellhub/marcar-presenca
-- (cron). É ISOLADA do fluxo atual:
--   * Só LÊ entradas_walkin (não toca o receiver de check-in).
--   * Só atualiza club_reservas com via_app=true e status='reservado' — nunca
--     encosta numa reserva normal de cliente.
--   * Casa a unidade pelo gym.id do PAYLOAD (e.raw), não pela unidade_id
--     gravada, pra não depender do GYM_MAP do check-in (que hoje só mapeia o CT).
--
-- Matching do usuário: clientes.wellhub_id == entradas_walkin.id_externo
-- (gympass_id de 13 dígitos, estável — confirmado com dado real).
--
-- SECURITY DEFINER + search_path: roda com privilégio do dono (consistência);
-- a rota já chama por service role.

CREATE OR REPLACE FUNCTION wellhub_conciliar_presencas(p_janela_horas integer DEFAULT 6)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_marcadas integer;
BEGIN
  WITH alvo AS (
    SELECT r.id
    FROM entradas_walkin e
    JOIN clientes c         ON c.wellhub_id = e.id_externo
    JOIN unidades u         ON u.wellhub_gym_id = (e.raw->'event_data'->'gym'->>'id')
    JOIN club_reservas r    ON r.cliente_id = c.id AND r.via_app = true AND r.status = 'reservado'
    JOIN club_ocorrencias o ON o.id = r.ocorrencia_id
    JOIN club_aulas a       ON a.id = o.aula_id
    WHERE e.origem = 'wellhub'
      AND e.status <> 'erro'
      AND e.recebido_em > now() - make_interval(hours => p_janela_horas)
      AND a.unidade_id = u.id
      AND o.data = (e.recebido_em AT TIME ZONE 'America/Sao_Paulo')::date
  )
  UPDATE club_reservas r SET status = 'presente'
  FROM alvo
  WHERE r.id = alvo.id AND r.status = 'reservado';   -- dupla guarda: nunca toca o que não é 'reservado'

  GET DIAGNOSTICS v_marcadas = ROW_COUNT;
  RETURN v_marcadas;
END $$;

-- Teste: roda a conciliação na janela de 6h e retorna quantas marcou.
-- Seguro rodar agora — como ainda NÃO há reservas via app em produção, marca 0.
--   SELECT wellhub_conciliar_presencas(6);
