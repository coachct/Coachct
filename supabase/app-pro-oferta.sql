-- App Coach CT PRO vendido online só para quem treina Coach CT pelo app
-- (Wellhub/TotalPass). Decisões do Ricardo em 24/09/2026:
--  * card fixo em /minha-conta para os elegíveis; vira o card "chamativo" ao
--    passar de 70% dos check-ins do app no mês; aviso em /agendar ao esgotar;
--  * elegível = plano Wellhub/TotalPass ativo no Just CT OU reserva de app no
--    Just CT nos últimos 60 dias (pega quem treina pelo app sem plano cadastrado);
--  * quem já tem Coach CT Pro ativo (qualquer um) não vê a oferta;
--  * renovação aparece quando os créditos do App PRO acabam;
--  * sem e-mail — só o que aparece dentro da conta.
-- A API /api/pagamento/criar chama app_pro_oferta com service_role e só deixa
-- comprar o produto App PRO quem tiver pode_comprar = true.

CREATE OR REPLACE FUNCTION public.app_pro_oferta(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c_unidade  constant uuid := 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'; -- Just CT
  c_slug     constant text := 'just_ct';
  c_plano    constant uuid := '5cbc38a9-c5f5-47c2-aa1b-e74df57b3aaa'; -- App Coach CT PRO
  c_produto  constant uuid := '9a750c9e-3469-465c-a980-4e395f2c0204'; -- Apps Coach CT PRO
  v_role text;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_mes int; v_ano int;
  v_tem_pro_outro boolean;
  v_app_pro record;
  v_pro_usado int; v_pro_disp int := NULL;
  v_elegivel boolean;
  v_parceiro text; v_total int; v_usados int;
  v_melhor_pct numeric := -1;
  p text; t int; u int;
  v_nivel text := 'normal';
  v_renovacao boolean := false;
BEGIN
  -- Guarda: o próprio cliente, staff, ou o servidor (service_role).
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    SELECT role INTO v_role FROM perfis WHERE id = auth.uid();
    IF coalesce(v_role, '') NOT IN ('admin', 'recepcao', 'coordenadora')
       AND NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND user_id = auth.uid()) THEN
      RETURN jsonb_build_object('elegivel', false, 'motivo', 'sem_permissao');
    END IF;
  END IF;

  v_mes := EXTRACT(MONTH FROM v_hoje)::int;
  v_ano := EXTRACT(YEAR FROM v_hoje)::int;

  -- App PRO ativo?
  SELECT cp.inicio, cp.fim, cp.contar_desde INTO v_app_pro
  FROM cliente_planos cp
  WHERE cp.cliente_id = p_cliente_id AND cp.plano_id = c_plano AND cp.ativo = true
    AND v_hoje BETWEEN cp.inicio AND cp.fim
  LIMIT 1;

  -- Outro Coach CT Pro (trimestral/semestral) ativo: já tem os benefícios, sem oferta.
  SELECT EXISTS (
    SELECT 1 FROM cliente_planos cp JOIN planos_disponiveis pd ON pd.id = cp.plano_id
    WHERE cp.cliente_id = p_cliente_id AND cp.ativo = true AND pd.tipo = 'coach_ct_pro'
      AND cp.plano_id <> c_plano AND (cp.fim IS NULL OR cp.fim >= v_hoje)
  ) INTO v_tem_pro_outro;

  -- Elegível: plano de app ativo no Just CT ou reserva de app lá nos últimos 60 dias.
  SELECT EXISTS (
    SELECT 1 FROM cliente_planos cp JOIN planos_disponiveis pd ON pd.id = cp.plano_id
    WHERE cp.cliente_id = p_cliente_id AND cp.ativo = true
      AND pd.tipo IN ('wellhub', 'totalpass') AND pd.unidade_id = c_unidade
  ) OR EXISTS (
    SELECT 1 FROM agendamentos a
    WHERE a.cliente_id = p_cliente_id AND a.unidade_id = c_unidade
      AND a.tipo_credito IN ('wellhub_' || c_slug, 'totalpass_' || c_slug)
      AND a.status <> 'cancelado' AND a.data >= v_hoje - 60
  ) INTO v_elegivel;

  -- Uso do mês por parceiro (mesma conta da saldo_creditos_cliente: sem cancelado
  -- e sem falta). Teto = pote do mês se existir, senão o creditos_mes do plano.
  FOREACH p IN ARRAY ARRAY['wellhub', 'totalpass'] LOOP
    SELECT count(*) INTO u FROM agendamentos a
    WHERE a.cliente_id = p_cliente_id AND a.unidade_id = c_unidade
      AND a.tipo_credito = p || '_' || c_slug
      AND EXTRACT(MONTH FROM a.data) = v_mes AND EXTRACT(YEAR FROM a.data) = v_ano
      AND a.status NOT IN ('cancelado', 'falta');

    SELECT cc.total INTO t FROM cliente_creditos cc
    WHERE cc.cliente_id = p_cliente_id AND cc.unidade_id = c_unidade AND cc.tipo = p
      AND cc.mes = v_mes AND cc.ano = v_ano
    LIMIT 1;
    IF t IS NULL OR t <= 0 THEN
      SELECT pd.creditos_mes INTO t FROM planos_disponiveis pd
      WHERE pd.unidade_id = c_unidade AND pd.tipo = p AND pd.ativo = true
      ORDER BY pd.creditos_mes DESC LIMIT 1;
    END IF;

    -- Parceiro exibido: o que tem plano ativo ou uso no mês; empate = maior % de uso.
    IF t > 0 AND (u > 0 OR EXISTS (
      SELECT 1 FROM cliente_planos cp JOIN planos_disponiveis pd ON pd.id = cp.plano_id
      WHERE cp.cliente_id = p_cliente_id AND cp.ativo = true
        AND pd.tipo = p AND pd.unidade_id = c_unidade)) THEN
      IF u::numeric / t > v_melhor_pct THEN
        v_melhor_pct := u::numeric / t; v_parceiro := p; v_total := t; v_usados := u;
      END IF;
    END IF;
    t := NULL;
  END LOOP;

  -- Sem plano e sem uso no mês, mas elegível pelos 60 dias: parceiro da última reserva.
  IF v_parceiro IS NULL AND v_elegivel THEN
    SELECT split_part(a.tipo_credito, '_', 1) INTO v_parceiro FROM agendamentos a
    WHERE a.cliente_id = p_cliente_id AND a.unidade_id = c_unidade
      AND a.tipo_credito IN ('wellhub_' || c_slug, 'totalpass_' || c_slug)
      AND a.status <> 'cancelado'
    ORDER BY a.data DESC LIMIT 1;
    SELECT pd.creditos_mes INTO v_total FROM planos_disponiveis pd
    WHERE pd.unidade_id = c_unidade AND pd.tipo = v_parceiro AND pd.ativo = true
    ORDER BY pd.creditos_mes DESC LIMIT 1;
    v_usados := 0;
  END IF;

  IF v_total > 0 THEN
    IF v_usados >= v_total THEN v_nivel := 'esgotado';
    ELSIF v_usados::numeric / v_total >= 0.7 THEN v_nivel := 'alerta';
    END IF;
  END IF;

  -- Saldo do App PRO (janela do plano, a partir de contar_desde).
  IF v_app_pro.inicio IS NOT NULL THEN
    SELECT count(*) INTO v_pro_usado FROM agendamentos a
    WHERE a.cliente_id = p_cliente_id AND a.unidade_id = c_unidade
      AND a.tipo_credito = 'coach_ct_pro_' || c_slug
      AND a.data BETWEEN v_app_pro.inicio AND v_app_pro.fim
      AND a.status <> 'cancelado'
      AND (v_app_pro.contar_desde IS NULL OR a.criado_em >= v_app_pro.contar_desde);
    SELECT GREATEST(0, pd.total_creditos - v_pro_usado) INTO v_pro_disp
    FROM planos_disponiveis pd WHERE pd.id = c_plano;
    v_renovacao := v_pro_disp = 0;
  END IF;

  RETURN jsonb_build_object(
    'elegivel',          v_elegivel AND NOT v_tem_pro_outro,
    -- mostrar_oferta: cards 1/2/3 (quem ainda não tem App PRO ativo)
    'mostrar_oferta',    v_elegivel AND NOT v_tem_pro_outro AND v_app_pro.inicio IS NULL,
    'mostrar_renovacao', v_renovacao AND NOT v_tem_pro_outro,
    'pode_comprar',      v_elegivel AND NOT v_tem_pro_outro AND (v_app_pro.inicio IS NULL OR v_renovacao),
    'parceiro',          v_parceiro,
    'usados',            coalesce(v_usados, 0),
    'total',             v_total,
    'nivel',             v_nivel,
    'tem_app_pro',       v_app_pro.inicio IS NOT NULL,
    'app_pro_fim',       v_app_pro.fim,
    'app_pro_disponivel', v_pro_disp,
    'produto_id',        c_produto
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.app_pro_oferta(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.app_pro_oferta(uuid) TO authenticated, service_role;

-- Medição: quem viu e quem clicou (a compra sai de vendas).
CREATE TABLE IF NOT EXISTS public.app_pro_oferta_eventos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  evento     text NOT NULL CHECK (evento IN ('visto', 'clique')),
  local      text NOT NULL CHECK (local IN ('conta', 'conta_70', 'agendar', 'pagina', 'renovacao')),
  dia        date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, evento, local, dia)
);
CREATE INDEX IF NOT EXISTS app_pro_oferta_eventos_cliente_idx ON public.app_pro_oferta_eventos (cliente_id);
ALTER TABLE public.app_pro_oferta_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_pro_oferta_eventos_staff ON public.app_pro_oferta_eventos;
CREATE POLICY app_pro_oferta_eventos_staff ON public.app_pro_oferta_eventos FOR SELECT
  USING (EXISTS (SELECT 1 FROM perfis WHERE id = auth.uid() AND role IN ('admin', 'coordenadora')));

-- Registro do evento pelo próprio cliente (1 por dia por local; à prova de falha).
CREATE OR REPLACE FUNCTION public.app_pro_registrar_evento(p_evento text, p_local text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_cliente uuid;
BEGIN
  SELECT id INTO v_cliente FROM clientes WHERE user_id = auth.uid() LIMIT 1;
  IF v_cliente IS NULL THEN RETURN; END IF;
  INSERT INTO app_pro_oferta_eventos (cliente_id, evento, local)
  VALUES (v_cliente, p_evento, p_local)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN others THEN
  RETURN;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.app_pro_registrar_evento(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.app_pro_registrar_evento(text, text) TO authenticated;

-- Parcelamento online em até 3x (trimestral).
UPDATE public.produtos SET max_parcelas = 3 WHERE id = '9a750c9e-3469-465c-a980-4e395f2c0204';
