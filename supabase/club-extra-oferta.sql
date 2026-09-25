-- Check ins Extra for Clubs (aprovado pelo Ricardo em 25/09/2026).
-- Pacote de 4 treinos por R$ 99,90, à vista (cartão ou PIX), fora da vitrine.
-- Só aparece no perfil de quem usou 70% ou mais dos check-ins do app
-- (Wellhub/TotalPass) numa Club, no mês atual ou no anterior. Contagem por
-- unidade e por app. Compra liberada sempre que elegível (sem limite).
-- Crédito: pacote com unidade_id nulo → vale em qualquer Club, 30 dias,
-- pelo caminho de sempre do registrar_venda (creditos_avulsos). Nada muda
-- na reserva, no check-in nem no pagamento de quem já existe.

INSERT INTO public.produtos (
  id, nome, tipo, subtipo, valor, creditos_por_venda, dias_validade,
  max_parcelas, unidade_id, visivel_site, ativo
) VALUES (
  '4c1b7e2a-9d3f-4a61-8e25-c1ab5f0e7d99', 'Check ins Extra for Clubs', 'credito_treino', 'pacote',
  99.90, 4, 30, 1, NULL, false, true
) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.club_extra_oferta(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_produto constant uuid := '4c1b7e2a-9d3f-4a61-8e25-c1ab5f0e7d99';
  c_pct     constant numeric := 0.7;
  v_role text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_ini_mes date;
  v_ini_ant date;
  v_atual record;
  v_ant record;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    SELECT role INTO v_role FROM perfis WHERE id = auth.uid();
    IF coalesce(v_role, '') NOT IN ('admin', 'recepcao', 'coordenadora')
       AND NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND user_id = auth.uid()) THEN
      RETURN jsonb_build_object('mostrar', false, 'pode_comprar', false, 'motivo', 'sem_permissao');
    END IF;
  END IF;

  v_ini_mes := date_trunc('month', v_hoje)::date;
  v_ini_ant := (v_ini_mes - interval '1 month')::date;

  -- Uso do app por Club, por app e por mês (sem cancelada e sem falta,
  -- igual ao App PRO). O total vem do plano da unidade (12 hoje).
  WITH uso AS (
    SELECT a.unidade_id, split_part(r.tipo_credito, '_', 1) AS parceiro,
           (o.data >= v_ini_mes) AS mes_atual, count(*) AS usados
    FROM club_reservas r
    JOIN club_ocorrencias o ON o.id = r.ocorrencia_id
    JOIN club_aulas a ON a.id = o.aula_id
    WHERE r.cliente_id = p_cliente_id
      AND (r.tipo_credito LIKE 'wellhub\_%' OR r.tipo_credito LIKE 'totalpass\_%')
      AND r.status NOT IN ('cancelado', 'falta')
      AND o.data >= v_ini_ant AND o.data < (v_ini_mes + interval '1 month')::date
    GROUP BY 1, 2, 3
  ), com_total AS (
    SELECT uso.*, (
      SELECT pd.creditos_mes FROM planos_disponiveis pd
      WHERE pd.unidade_id = uso.unidade_id AND pd.tipo = uso.parceiro AND pd.ativo = true
      ORDER BY pd.creditos_mes DESC LIMIT 1
    ) AS total
    FROM uso
  )
  SELECT * INTO v_atual FROM com_total
  WHERE mes_atual AND total > 0 AND usados::numeric / total >= c_pct
  ORDER BY usados::numeric / total DESC LIMIT 1;

  IF v_atual.unidade_id IS NULL THEN
    SELECT a.unidade_id, split_part(r.tipo_credito, '_', 1) AS parceiro, count(*) AS usados,
           max(pd.creditos_mes) AS total
    INTO v_ant
    FROM club_reservas r
    JOIN club_ocorrencias o ON o.id = r.ocorrencia_id
    JOIN club_aulas a ON a.id = o.aula_id
    JOIN planos_disponiveis pd ON pd.unidade_id = a.unidade_id
         AND pd.tipo = split_part(r.tipo_credito, '_', 1) AND pd.ativo = true
    WHERE r.cliente_id = p_cliente_id
      AND (r.tipo_credito LIKE 'wellhub\_%' OR r.tipo_credito LIKE 'totalpass\_%')
      AND r.status NOT IN ('cancelado', 'falta')
      AND o.data >= v_ini_ant AND o.data < v_ini_mes
    GROUP BY 1, 2
    HAVING max(pd.creditos_mes) > 0 AND count(*)::numeric / max(pd.creditos_mes) >= c_pct
    ORDER BY count(*)::numeric / max(pd.creditos_mes) DESC
    LIMIT 1;
  END IF;

  IF v_atual.unidade_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'mostrar', true, 'pode_comprar', true, 'nivel', 'mes_atual',
      'parceiro', v_atual.parceiro, 'unidade_id', v_atual.unidade_id,
      'usados', v_atual.usados, 'total', v_atual.total, 'produto_id', c_produto);
  ELSIF v_ant.unidade_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'mostrar', true, 'pode_comprar', true, 'nivel', 'mes_anterior',
      'parceiro', v_ant.parceiro, 'unidade_id', v_ant.unidade_id,
      'usados', v_ant.usados, 'total', v_ant.total, 'produto_id', c_produto);
  END IF;

  RETURN jsonb_build_object('mostrar', false, 'pode_comprar', false, 'produto_id', c_produto);
END;
$function$;

REVOKE ALL ON FUNCTION public.club_extra_oferta(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.club_extra_oferta(uuid) TO authenticated, service_role;

-- Medição: reaproveita app_pro_oferta_eventos com locais próprios da Club.
ALTER TABLE public.app_pro_oferta_eventos DROP CONSTRAINT IF EXISTS app_pro_oferta_eventos_local_check;
ALTER TABLE public.app_pro_oferta_eventos ADD CONSTRAINT app_pro_oferta_eventos_local_check
  CHECK (local IN ('conta', 'conta_70', 'agendar', 'pagina', 'renovacao', 'club_70', 'club_mes_anterior'));
