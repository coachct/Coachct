-- ============================================================================
-- Acompanhamento de parcelamentos fiscais (RFB / PGFN / PMSP / PGM)
-- Decisões do Ricardo em 28/09/2026:
--   * DRE por CAIXA: a despesa nasce com a data real de pagamento;
--   * parcelas futuras entram em Contas a Pagar por JANELA ROLANTE (mês
--     corrente + próximo). O horizonte completo (até 2031) fica só na aba
--     nova — lançar 300 despesas futuras inflaria o DRE por competência de
--     todos os meses e triplicaria o "em aberto" de Contas a Pagar;
--   * centro de custo Geral já existe no financeiro (unidade_id = null),
--     então os acordos nascem em Geral — é dívida do CNPJ, não de unidade.
--
-- Tabelas novas: fiscal_acordos, fiscal_parcelas, fiscal_pendencias.
-- Nenhuma tabela existente é alterada. A ligação com o financeiro é o
-- fiscal_parcelas.despesa_id, sincronizado nos dois sentidos por trigger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Categoria própria no DRE (dentro do grupo Impostos, ao lado de "Impostos")
-- ---------------------------------------------------------------------------
INSERT INTO public.categorias_despesa (nome, grupo, ordem, ativo)
SELECT 'Parcelamentos Fiscais', 'Impostos', 121, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.categorias_despesa WHERE nome = 'Parcelamentos Fiscais'
);

-- ---------------------------------------------------------------------------
-- 2. Acordos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_acordos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao             text NOT NULL CHECK (orgao IN ('RFB', 'PGFN', 'PMSP', 'PGM', 'INSS')),
  numero            text,
  descricao         text NOT NULL,
  tipo              text NOT NULL DEFAULT 'parcelamento'
                      CHECK (tipo IN ('simplificado', 'transacao', 'parcsn', 'tdm', 'parcelamento', 'a_vista')),
  valor_consolidado numeric CHECK (valor_consolidado >= 0),
  qtd_parcelas      integer CHECK (qtd_parcelas >= 1),
  dia_vencimento    integer CHECK (dia_vencimento BETWEEN 1 AND 31),
  -- simulado  = ainda não formalizado (serve pra dimensionar o caixa antes de assinar)
  -- ativo     = em vigor, gera Contas a Pagar
  -- suspenso  = exigibilidade suspensa, não gera cobrança
  -- rescindido / quitado = encerrados
  status            text NOT NULL DEFAULT 'ativo'
                      CHECK (status IN ('simulado', 'ativo', 'suspenso', 'quitado', 'rescindido')),
  -- Lei 10.522/2002: 3 parcelas em atraso (consecutivas ou não) rescindem.
  limite_rescisao   integer NOT NULL DEFAULT 3 CHECK (limite_rescisao >= 1),
  unidade_id        uuid REFERENCES public.unidades(id),        -- null = Geral
  categoria_id      uuid REFERENCES public.categorias_despesa(id),
  observacao        text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  criado_por        uuid
);

CREATE INDEX IF NOT EXISTS fiscal_acordos_status_idx ON public.fiscal_acordos (status);
CREATE INDEX IF NOT EXISTS fiscal_acordos_orgao_idx  ON public.fiscal_acordos (orgao);

-- ---------------------------------------------------------------------------
-- 3. Parcelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_parcelas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acordo_id       uuid NOT NULL REFERENCES public.fiscal_acordos(id) ON DELETE CASCADE,
  numero          integer NOT NULL CHECK (numero >= 1),
  competencia     date NOT NULL,
  vencimento      date NOT NULL,
  valor           numeric NOT NULL CHECK (valor >= 0),
  -- true quando o valor/vencimento foi inferido e ainda precisa bater com o
  -- extrato do e-CAC / Regularize. A tela mostra "~" nesses casos.
  estimado        boolean NOT NULL DEFAULT false,
  pago            boolean NOT NULL DEFAULT false,
  pago_em         date,
  valor_pago      numeric CHECK (valor_pago >= 0),
  despesa_id      uuid REFERENCES public.despesas(id) ON DELETE SET NULL,
  comprovante_url text,
  observacao      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (acordo_id, numero)
);

CREATE INDEX IF NOT EXISTS fiscal_parcelas_acordo_idx     ON public.fiscal_parcelas (acordo_id, numero);
CREATE INDEX IF NOT EXISTS fiscal_parcelas_vencimento_idx ON public.fiscal_parcelas (vencimento) WHERE pago = false;
CREATE INDEX IF NOT EXISTS fiscal_parcelas_despesa_idx    ON public.fiscal_parcelas (despesa_id) WHERE despesa_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Pendências que ainda NÃO viraram acordo
--    (inscrições a ajuizar, execução fiscal em curso, NFS-e sem recolhimento,
--     débito a pagar à vista, prazos como a exclusão do Simples)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_pendencias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao       text NOT NULL CHECK (orgao IN ('RFB', 'PGFN', 'PMSP', 'PGM', 'INSS')),
  descricao   text NOT NULL,
  valor       numeric CHECK (valor >= 0),      -- null = valor ainda desconhecido
  risco       text NOT NULL DEFAULT 'medio' CHECK (risco IN ('baixo', 'medio', 'alto')),
  situacao    text NOT NULL DEFAULT 'aberta'
                CHECK (situacao IN ('aberta', 'em_negociacao', 'resolvida')),
  prazo       date,
  acordo_id   uuid REFERENCES public.fiscal_acordos(id) ON DELETE SET NULL,
  observacao  text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_pendencias_situacao_idx ON public.fiscal_pendencias (situacao, risco);

-- ---------------------------------------------------------------------------
-- 5. GRANTs + RLS + policies (regra do projeto de 23/09/2026)
--    Mesmo recorte do resto do financeiro: admin e coordenadora.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_acordos    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_parcelas   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_pendencias TO authenticated, service_role;

ALTER TABLE public.fiscal_acordos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_parcelas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_pendencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_equipe_all ON public.fiscal_acordos;
CREATE POLICY fin_equipe_all ON public.fiscal_acordos
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('admin', 'coordenadora')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('admin', 'coordenadora')));

DROP POLICY IF EXISTS fin_equipe_all ON public.fiscal_parcelas;
CREATE POLICY fin_equipe_all ON public.fiscal_parcelas
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('admin', 'coordenadora')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('admin', 'coordenadora')));

DROP POLICY IF EXISTS fin_equipe_all ON public.fiscal_pendencias;
CREATE POLICY fin_equipe_all ON public.fiscal_pendencias
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('admin', 'coordenadora')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role IN ('admin', 'coordenadora')));

-- ---------------------------------------------------------------------------
-- 6. Sincronização parcela <-> despesa (os dois sentidos)
--    Guarda anti-loop: cada lado só escreve quando o valor REALMENTE muda
--    (IS DISTINCT FROM), então o segundo disparo não faz nada e para ali.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_parcela_sync_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_acordo   record;
  v_cat      uuid;
  v_desc     text;
BEGIN
  SELECT * INTO v_acordo FROM fiscal_acordos WHERE id = NEW.acordo_id;

  -- Acordo apenas simulado nunca vira despesa.
  IF v_acordo.status = 'simulado' THEN
    RETURN NEW;
  END IF;

  v_cat := COALESCE(
    v_acordo.categoria_id,
    (SELECT id FROM categorias_despesa WHERE nome = 'Parcelamentos Fiscais' LIMIT 1)
  );
  v_desc := v_acordo.orgao || ' · ' || v_acordo.descricao ||
            ' · parcela ' || NEW.numero ||
            COALESCE('/' || v_acordo.qtd_parcelas, '');

  -- Já existe despesa: mantém em dia.
  IF NEW.despesa_id IS NOT NULL THEN
    UPDATE despesas d
       SET pago        = NEW.pago,
           pago_em     = CASE WHEN NEW.pago THEN COALESCE(NEW.pago_em, CURRENT_DATE) ELSE NULL END,
           valor       = COALESCE(NEW.valor_pago, NEW.valor),
           vencimento  = NEW.vencimento,
           competencia = NEW.competencia
     WHERE d.id = NEW.despesa_id
       AND (d.pago        IS DISTINCT FROM NEW.pago
         OR d.pago_em     IS DISTINCT FROM CASE WHEN NEW.pago THEN COALESCE(NEW.pago_em, CURRENT_DATE) ELSE NULL END
         OR d.valor       IS DISTINCT FROM COALESCE(NEW.valor_pago, NEW.valor)
         OR d.vencimento  IS DISTINCT FROM NEW.vencimento
         OR d.competencia IS DISTINCT FROM NEW.competencia);
    RETURN NEW;
  END IF;

  -- Sem despesa ainda: só cria quando a parcela é paga. As futuras entram
  -- por janela rolante, via fiscal_sync_contas_a_pagar().
  IF NEW.pago THEN
    INSERT INTO despesas (unidade_id, categoria_id, descricao, valor, competencia,
                          vencimento, pago, pago_em, origem, observacao)
    VALUES (v_acordo.unidade_id, v_cat, v_desc,
            COALESCE(NEW.valor_pago, NEW.valor), NEW.competencia, NEW.vencimento,
            true, COALESCE(NEW.pago_em, CURRENT_DATE), 'fiscal',
            'Gerada pelo acompanhamento de parcelamentos')
    RETURNING id INTO NEW.despesa_id;

    UPDATE fiscal_parcelas SET despesa_id = NEW.despesa_id WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fiscal_parcela_sync ON public.fiscal_parcelas;
CREATE TRIGGER trg_fiscal_parcela_sync
AFTER INSERT OR UPDATE OF pago, pago_em, valor, valor_pago, vencimento, competencia
ON public.fiscal_parcelas
FOR EACH ROW EXECUTE FUNCTION public.fiscal_parcela_sync_despesa();

-- Sentido inverso: baixou em Contas a Pagar, a parcela fica paga.
CREATE OR REPLACE FUNCTION public.fiscal_despesa_sync_parcela()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.origem <> 'fiscal' THEN
    RETURN NEW;
  END IF;

  UPDATE fiscal_parcelas p
     SET pago       = NEW.pago,
         pago_em    = NEW.pago_em,
         valor_pago = CASE WHEN NEW.pago THEN NEW.valor ELSE NULL END
   WHERE p.despesa_id = NEW.id
     AND (p.pago    IS DISTINCT FROM NEW.pago
       OR p.pago_em IS DISTINCT FROM NEW.pago_em);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_fiscal_despesa_sync ON public.despesas;
CREATE TRIGGER trg_fiscal_despesa_sync
AFTER UPDATE OF pago, pago_em ON public.despesas
FOR EACH ROW EXECUTE FUNCTION public.fiscal_despesa_sync_parcela();

-- ---------------------------------------------------------------------------
-- 7. Gerador da grade de parcelas
--    p_valor_primeira diferente do resto cobre a entrada da PGM (20%) e da PGFN.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_gerar_parcelas(
  p_acordo_id        uuid,
  p_primeiro_venc    date,
  p_qtd              integer,
  p_valor_demais     numeric,
  p_valor_primeira   numeric DEFAULT NULL,
  p_estimado         boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role  text;
  i       integer;
  v_venc  date;
  v_criadas integer := 0;
BEGIN
  -- Guarda: staff logado, service_role, ou o próprio SQL Editor (postgres).
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_role FROM perfis WHERE id = auth.uid();
    IF COALESCE(v_role, '') NOT IN ('admin', 'coordenadora') THEN
      RAISE EXCEPTION 'sem permissao';
    END IF;
  ELSIF COALESCE(auth.role(), '') <> 'service_role'
        AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'sem permissao';
  END IF;

  FOR i IN 1..p_qtd LOOP
    v_venc := (p_primeiro_venc + ((i - 1) || ' month')::interval)::date;

    INSERT INTO fiscal_parcelas (acordo_id, numero, competencia, vencimento, valor, estimado)
    VALUES (
      p_acordo_id,
      i,
      date_trunc('month', v_venc)::date,
      v_venc,
      CASE WHEN i = 1 THEN COALESCE(p_valor_primeira, p_valor_demais) ELSE p_valor_demais END,
      p_estimado
    )
    ON CONFLICT (acordo_id, numero) DO NOTHING;

    IF FOUND THEN v_criadas := v_criadas + 1; END IF;
  END LOOP;

  UPDATE fiscal_acordos
     SET qtd_parcelas   = GREATEST(COALESCE(qtd_parcelas, 0), p_qtd),
         dia_vencimento = EXTRACT(DAY FROM p_primeiro_venc)::int
   WHERE id = p_acordo_id;

  RETURN v_criadas;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_gerar_parcelas(uuid, date, integer, numeric, numeric, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_gerar_parcelas(uuid, date, integer, numeric, numeric, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Janela rolante para Contas a Pagar
--    Joga em despesas só as parcelas em aberto de acordos ATIVOS que vencem
--    até o fim do mês seguinte. Idempotente: pula quem já tem despesa_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_sync_contas_a_pagar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role     text;
  v_hoje     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_limite   date;
  v_cat_pad  uuid;
  r          record;
  v_despesa  uuid;
  v_criadas  integer := 0;
BEGIN
  -- Guarda: staff logado, service_role, ou o próprio SQL Editor (postgres).
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_role FROM perfis WHERE id = auth.uid();
    IF COALESCE(v_role, '') NOT IN ('admin', 'coordenadora') THEN
      RAISE EXCEPTION 'sem permissao';
    END IF;
  ELSIF COALESCE(auth.role(), '') <> 'service_role'
        AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'sem permissao';
  END IF;

  -- fim do mês seguinte
  v_limite := (date_trunc('month', v_hoje) + interval '2 month' - interval '1 day')::date;

  SELECT id INTO v_cat_pad FROM categorias_despesa WHERE nome = 'Parcelamentos Fiscais' LIMIT 1;

  FOR r IN
    SELECT p.id, p.numero, p.competencia, p.vencimento, p.valor,
           a.orgao, a.descricao, a.qtd_parcelas, a.unidade_id, a.categoria_id
      FROM fiscal_parcelas p
      JOIN fiscal_acordos  a ON a.id = p.acordo_id
     WHERE a.status = 'ativo'
       AND p.pago = false
       -- sem despesa, ou com despesa excluída em Contas a Pagar (soft delete)
       AND (p.despesa_id IS NULL
            OR EXISTS (SELECT 1 FROM despesas d
                        WHERE d.id = p.despesa_id AND d.excluido_em IS NOT NULL))
       AND p.vencimento <= v_limite
     ORDER BY p.vencimento
  LOOP
    INSERT INTO despesas (unidade_id, categoria_id, descricao, valor, competencia,
                          vencimento, pago, origem, observacao)
    VALUES (
      r.unidade_id,
      COALESCE(r.categoria_id, v_cat_pad),
      r.orgao || ' · ' || r.descricao || ' · parcela ' || r.numero ||
        COALESCE('/' || r.qtd_parcelas, ''),
      r.valor,
      r.competencia,
      r.vencimento,
      false,
      'fiscal',
      'Gerada pelo acompanhamento de parcelamentos'
    )
    RETURNING id INTO v_despesa;

    UPDATE fiscal_parcelas SET despesa_id = v_despesa WHERE id = r.id;
    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN v_criadas;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_sync_contas_a_pagar() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_sync_contas_a_pagar() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Resumo por acordo (alimenta os cartões e o alerta de rescisão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_resumo_acordos()
RETURNS TABLE (
  acordo_id          uuid,
  orgao              text,
  numero             text,
  descricao          text,
  tipo               text,
  status             text,
  unidade_id         uuid,
  valor_consolidado  numeric,
  qtd_parcelas       integer,
  limite_rescisao    integer,
  parcelas_total     integer,
  parcelas_pagas     integer,
  parcelas_atrasadas integer,
  valor_pago         numeric,
  saldo_aberto       numeric,
  valor_atrasado     numeric,
  proximo_vencimento date,
  proximo_valor      numeric,
  risco              text
)
LANGUAGE sql
-- INVOKER: a RLS fin_equipe_all das tabelas já restringe a admin/coordenadora.
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
  agg AS (
    SELECT p.acordo_id,
           count(*)::int                                                  AS total,
           count(*) FILTER (WHERE p.pago)::int                            AS pagas,
           count(*) FILTER (WHERE NOT p.pago AND p.vencimento < h.d)::int AS atrasadas,
           COALESCE(SUM(COALESCE(p.valor_pago, p.valor)) FILTER (WHERE p.pago), 0)        AS pago,
           COALESCE(SUM(p.valor) FILTER (WHERE NOT p.pago), 0)                            AS aberto,
           COALESCE(SUM(p.valor) FILTER (WHERE NOT p.pago AND p.vencimento < h.d), 0)     AS atrasado
      FROM fiscal_parcelas p CROSS JOIN hoje h
     GROUP BY p.acordo_id
  ),
  prox AS (
    SELECT DISTINCT ON (p.acordo_id) p.acordo_id, p.vencimento, p.valor
      FROM fiscal_parcelas p CROSS JOIN hoje h
     WHERE NOT p.pago AND p.vencimento >= h.d
     ORDER BY p.acordo_id, p.vencimento
  )
  SELECT a.id, a.orgao, a.numero, a.descricao, a.tipo, a.status, a.unidade_id,
         a.valor_consolidado, a.qtd_parcelas, a.limite_rescisao,
         COALESCE(g.total, 0), COALESCE(g.pagas, 0), COALESCE(g.atrasadas, 0),
         COALESCE(g.pago, 0), COALESCE(g.aberto, 0), COALESCE(g.atrasado, 0),
         x.vencimento, x.valor,
         CASE
           WHEN a.status = 'rescindido'                           THEN 'rescindido'
           WHEN a.status IN ('quitado', 'suspenso', 'simulado')   THEN 'ok'
           WHEN COALESCE(g.atrasadas, 0) >= a.limite_rescisao     THEN 'rescisao_iminente'
           WHEN COALESCE(g.atrasadas, 0) =  a.limite_rescisao - 1 THEN 'atencao'
           WHEN COALESCE(g.atrasadas, 0) >  0                     THEN 'atraso'
           ELSE 'ok'
         END
    FROM fiscal_acordos a
    LEFT JOIN agg  g ON g.acordo_id = a.id
    LEFT JOIN prox x ON x.acordo_id = a.id;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_resumo_acordos() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_resumo_acordos() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Fluxo futuro mês a mês (é aqui que se dimensiona o caixa pra frente)
--     p_incluir_simulado = true soma os acordos ainda não formalizados.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_fluxo_futuro(
  p_meses            integer DEFAULT 12,
  p_incluir_simulado boolean DEFAULT true
)
RETURNS TABLE (competencia date, total numeric, total_simulado numeric, parcelas integer)
LANGUAGE sql
-- INVOKER: a RLS fin_equipe_all das tabelas já restringe a admin/coordenadora.
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH hoje AS (SELECT date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date AS d),
  meses AS (
    SELECT (h.d + (n || ' month')::interval)::date AS competencia
      FROM hoje h, generate_series(0, GREATEST(p_meses, 1) - 1) n
  )
  SELECT m.competencia,
         COALESCE(SUM(p.valor) FILTER (WHERE a.status = 'ativo'), 0)::numeric,
         COALESCE(SUM(p.valor) FILTER (WHERE a.status = 'simulado' AND p_incluir_simulado), 0)::numeric,
         COALESCE(count(p.id) FILTER (
           WHERE a.status = 'ativo' OR (a.status = 'simulado' AND p_incluir_simulado)
         ), 0)::int
    FROM meses m
    LEFT JOIN fiscal_parcelas p
           ON date_trunc('month', p.vencimento)::date = m.competencia
          AND p.pago = false
    LEFT JOIN fiscal_acordos a ON a.id = p.acordo_id
   GROUP BY m.competencia
   ORDER BY m.competencia;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_fluxo_futuro(integer, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_fluxo_futuro(integer, boolean) TO authenticated, service_role;

-- ============================================================================
-- 11. CARGA INICIAL — JUST RUN
--     Fontes: relatório RFB/PGFN de 21/09/2026 (o mais recente), PGM e PMSP de
--     08/09/2026, relatório de reenquadramento do Simples e a tabela da
--     contabilidade. Onde o relatório não trouxe o dado, a parcela entra com
--     estimado = true e a tela marca com "~" pra conferir no e-CAC.
--
--     O relatório de 21/09 corrigiu o de 08/09 em três pontos: o PARCSN passou
--     de 2 para 3 parcelas em atraso (entrou no limite de rescisão), o SIEFPAR
--     suspenso é de R$ 3.912,36 e apareceu IRRF novo de 08/2026.
-- ============================================================================
DO $seed$
DECLARE
  v_cat     uuid;
  v_siefpar1 uuid; v_siefpar2 uuid; v_parcsn uuid;
  v_rfb_sim uuid; v_pgfn_sim uuid; v_pgm_sim uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM fiscal_acordos LIMIT 1) THEN
    RAISE NOTICE 'fiscal_acordos já populado — carga inicial ignorada.';
    RETURN;
  END IF;

  SELECT id INTO v_cat FROM categorias_despesa WHERE nome = 'Parcelamentos Fiscais' LIMIT 1;

  -- ---------- Acordos ATIVOS com parcelas em atraso (risco de rescisão) ------
  INSERT INTO fiscal_acordos (orgao, numero, descricao, tipo, valor_consolidado,
                              status, limite_rescisao, categoria_id, observacao)
  VALUES ('RFB', '0211.00012.0083423774.23-01', 'Parcelamento simplificado 2023',
          'simplificado', NULL, 'ativo', 3, v_cat,
          '3 parcelas em atraso (R$ 12.379,08) no relatório de 08/09/2026. No limite da rescisão pela Lei 10.522/2002. Grade completa a conferir no e-CAC.')
  RETURNING id INTO v_siefpar1;

  INSERT INTO fiscal_acordos (orgao, numero, descricao, tipo, valor_consolidado,
                              status, limite_rescisao, categoria_id, observacao)
  VALUES ('RFB', '0211.00012.0127135428.25-01', 'Parcelamento simplificado 2025',
          'simplificado', NULL, 'ativo', 3, v_cat,
          '3 parcelas em atraso (R$ 10.025,40) no relatório de 08/09/2026. No limite da rescisão. Grade completa a conferir no e-CAC.')
  RETURNING id INTO v_siefpar2;

  INSERT INTO fiscal_acordos (orgao, numero, descricao, tipo, valor_consolidado,
                              status, limite_rescisao, categoria_id, observacao)
  VALUES ('RFB', NULL, 'PARCSN — parcelamento do Simples Nacional',
          'parcsn', NULL, 'ativo', 3, v_cat,
          'ATENÇÃO: passou de 2 parcelas em atraso (08/09/2026) para 3 em 21/09/2026 — entrou no limite de rescisão. É o acordo que segura a dívida do Simples, justamente o regime que se quer manter. O relatório não informa os valores; pedir à contabilidade.')
  RETURNING id INTO v_parcsn;

  -- Parcelas em atraso conhecidas. Vencimento estimado no último dia dos três
  -- meses anteriores ao relatório (convenção dos parcelamentos federais).
  INSERT INTO fiscal_parcelas (acordo_id, numero, competencia, vencimento, valor, estimado, observacao) VALUES
    (v_siefpar1, 1, '2026-06-01', '2026-06-30', 4126.36, true, 'Valor = 1/3 do atraso informado; conferir no e-CAC'),
    (v_siefpar1, 2, '2026-07-01', '2026-07-31', 4126.36, true, 'Valor = 1/3 do atraso informado; conferir no e-CAC'),
    (v_siefpar1, 3, '2026-08-01', '2026-08-31', 4126.36, true, 'Valor = 1/3 do atraso informado; conferir no e-CAC'),
    (v_siefpar2, 1, '2026-06-01', '2026-06-30', 3341.80, true, 'Valor = 1/3 do atraso informado; conferir no e-CAC'),
    (v_siefpar2, 2, '2026-07-01', '2026-07-31', 3341.80, true, 'Valor = 1/3 do atraso informado; conferir no e-CAC'),
    (v_siefpar2, 3, '2026-08-01', '2026-08-31', 3341.80, true, 'Valor = 1/3 do atraso informado; conferir no e-CAC'),
    (v_parcsn,   1, '2026-06-01', '2026-06-30', 0,       true, 'Valor não informado no relatório — preencher'),
    (v_parcsn,   2, '2026-07-01', '2026-07-31', 0,       true, 'Valor não informado no relatório — preencher'),
    (v_parcsn,   3, '2026-08-01', '2026-08-31', 0,       true, '3ª em atraso conforme relatório de 21/09/2026 — valor a preencher');

  -- ---------- Acordos em dia / suspensos -------------------------------------
  INSERT INTO fiscal_acordos (orgao, numero, descricao, tipo, valor_consolidado, status, categoria_id, observacao) VALUES
    ('PGFN', '008442205', 'Transação PGDAU 3/2023 — demais débitos',   'transacao', NULL, 'ativo',    v_cat, 'Conta SISPAR 008442205. Demais pessoas jurídicas, até 120 meses, redução de até 65%. Dívida de 2019–2023, exigibilidade suspensa. Sem atraso em 21/09/2026 — é o acordo mais valioso a preservar.'),
    ('PGFN', '008442230', 'Transação PGDAU 3/2023 — Simples Nacional', 'transacao', NULL, 'ativo',    v_cat, 'Conta SISPAR 008442230. Até 120 meses, redução de até 65%. Cobre 4 inscrições do Simples (2019 a 2022). Sem atraso em 21/09/2026.'),
    ('PGFN', '008756229', 'Transação PGDAU 3/2023 — previdenciários',  'transacao', NULL, 'ativo',    v_cat, 'Conta SISPAR 008756229. Até 60 meses, redução de até 65%. Cobre as 6 inscrições do Sistema DIVIDA (16.619.782-3, 16.619.783-1, 16.953.152-0, 16.953.153-8, 18.997.545-8, 18.997.546-6). Sem atraso em 21/09/2026.'),
    ('RFB',  '0211.00012.0004299945.26-01', 'Parcelamento simplificado suspenso', 'simplificado', 3912.36, 'suspenso', v_cat, 'Valor suspenso de R$ 3.912,36 no relatório de 21/09/2026.'),
    ('PGFN', '19.952.983-3', 'Sistema DIVIDA — parcelamento rescindido', 'parcelamento', 3789.97, 'rescindido', v_cat, 'Rescindido. É o único débito da PGFN apontado como impedimento ao reenquadramento no Simples. A tabela da contabilidade traz R$ 4.168,97 (diferença de R$ 379 a esclarecer).'),
    ('PMSP', NULL, 'TDM — parcelamento de autos de infração de ISS', 'tdm', 7822.14, 'ativo', v_cat, 'Homologado, porém marcado com pendência. A soma dos autos de 02/2022 a 07/2024 dá R$ 7.822,76 — confirmar com a contabilidade se o TDM cobre esses autos.');

  -- ---------- Simulações da contabilidade (ainda não formalizadas) -----------
  INSERT INTO fiscal_acordos (orgao, numero, descricao, tipo, valor_consolidado, qtd_parcelas, status, categoria_id, observacao)
  VALUES ('RFB', NULL, 'Simulação — parcelamento Simples Nacional 60x', 'parcsn', 55501.92, 60, 'simulado', v_cat,
          'Simulação da contabilidade. Os R$ 55.501,92 batem exatamente com a soma das 13 linhas do SIEF em 21/09/2026 (os R$ 55.343,17 do resumo são a foto de 08/09 — a diferença é juros de 13 dias). Parcelas de R$ 925,03 corrigidas pela Selic. ATENÇÃO: R$ 41.097,20 (74%) são IRRF cód. 3208, retido na fonte — a Lei 10.522/2002 veda parcelar tributo retido, e a vedação alcançaria também a CP-SEGUR descontada dos funcionários. Confirmar no e-CAC antes de programar o caixa.')
  RETURNING id INTO v_rfb_sim;

  INSERT INTO fiscal_acordos (orgao, numero, descricao, tipo, valor_consolidado, qtd_parcelas, status, categoria_id, observacao)
  VALUES ('PGFN', NULL, 'Simulação — transação com desconto de 65%', 'transacao', 2204.72, 6, 'simulado', v_cat,
          'Consolidado de R$ 4.168,97 com 65% de desconto = R$ 2.204,72. As parcelas simuladas (125,06 + 5 × 488,64) somam R$ 2.568,26 — R$ 363,54 a mais que o consolidado. Pendente de esclarecimento com a contabilidade.')
  RETURNING id INTO v_pgfn_sim;

  INSERT INTO fiscal_acordos (orgao, numero, descricao, tipo, valor_consolidado, qtd_parcelas, status, categoria_id, observacao)
  VALUES ('PGM', NULL, 'Simulação — ISS em dívida ativa municipal 60x', 'parcelamento', 25160.64, 60, 'simulado', v_cat,
          'Entrada informada como "20% do consolidado", mas R$ 4.612,72 são 18,3%. A soma das parcelas dá R$ 25.341,78, acima do consolidado. Inclui os exercícios de 2017 e 2020, já em execução fiscal. Verificar se há PPI municipal aberto antes de fechar sem desconto.')
  RETURNING id INTO v_pgm_sim;

  PERFORM fiscal_gerar_parcelas(v_rfb_sim,  '2026-10-30', 60,  925.03, NULL,    true);
  PERFORM fiscal_gerar_parcelas(v_pgfn_sim, '2026-10-30',  6,  488.64,  125.06, true);
  PERFORM fiscal_gerar_parcelas(v_pgm_sim,  '2026-10-10', 60,  351.34, 4612.72, true);

  -- ---------- Pendências fora de acordo --------------------------------------
  INSERT INTO fiscal_pendencias (orgao, descricao, valor, risco, prazo, observacao) VALUES
    ('PGFN', '16 inscrições em dívida ativa "a ser ajuizada"', NULL, 'alto', NULL,
     'Relatório de 21/09/2026: campo "Ajuizado em" vazio nas 16 — ainda dá tempo de negociar. Saem de 5 processos, 2 deles concentram 13: 14966.357.218/2024-15 (7 inscrições previdenciárias e IRPJ fonte, 22/07/2024) e 19414.360.466/2025-94 (6 inscrições, 29/09/2025). Os outros 3: 10136.345.260/2024-13 (IRPJ), 10136.345.261/2024-50 (contribuição social) e 10642.103.727/2024-21 (multa isolada). Sem valores no relatório — consultar o Regularize. Não aparecem como impedimento ao Simples.'),
    ('RFB',  'IRRF e CP-SEGUR de 08/2026 — débito novo, a analisar', 4587.42, 'alto', NULL,
     'Apareceu no relatório de 21/09/2026 e NÃO está nos R$ 85.466,42: IRRF cód. 3208 de R$ 4.535,60 e CP-SEGUR de R$ 51,82, ambos vencidos em 18/09/2026. Mostra que o IRRF mensal continua sem recolhimento — parcelar sem cortar a origem recria a dívida. Entender com a contabilidade de onde vem o IRRF 3208 recorrente (aluguel ou royalty a pessoa física). Conferir também por que 07/2026 não aparece em lugar nenhum do relatório.'),
    ('PGM',  'Execução fiscal — ISS Simples Nacional 2017 e 2020', 17162.51, 'alto', NULL,
     'R$ 6.069,88 (2017) + R$ 11.092,63 (2020), já ajuizados. Valores dentro dos R$ 25.160,64 da dívida ativa municipal. Risco de bloqueio de conta.'),
    ('PMSP', 'NFS-e de 12/2025 sem recolhimento — 279 notas', NULL, 'alto', NULL,
     'Volume do mês inteiro, ainda sem auto de infração lavrado. Resolver antes que vire multa.'),
    ('PMSP', 'ISS de 12/2025 — pagamento à vista obrigatório', 793.64, 'medio', NULL,
     'Fora do acordo. A contabilidade informou que precisa ser pago à vista para o reenquadramento no Simples.'),
    ('PMSP', 'Autos de infração de ISS (18 autos, 02/2022 a 12/2024)', 8313.80, 'medio', NULL,
     '14 de ISS fonte (R$ 11 a R$ 209) e 4 de ISS próprio, sendo R$ 5.606,75 em 01/2023. Possivelmente já cobertos pelo TDM — confirmar.'),
    ('RFB',  'Exclusão do Simples Nacional em 31/12/2026', NULL, 'alto', '2027-01-29',
     'Período atual de opção: 01/01/2026 a 31/12/2026 (a empresa já entrou e saiu do Simples em 2016-2017 e 2020-2021). Reenquadramento indeferido enquanto houver pendências. Confirmar o prazo real: se já houve Termo de Exclusão com ciência, são 30 dias a partir dela, não o fim de janeiro de 2027.'),
    ('RFB',  'Certidão (CPEN) vencida desde 25/07/2026', NULL, 'medio', NULL,
     'Emitida em 26/01/2026. Nova emissão tende a sair Positiva enquanto houver débito sem exigibilidade suspensa.'),
    ('PMSP', 'PGDAS de 11/2021 e 12/2021', 670.00, 'baixo', NULL,
     'Cerca de R$ 670 em diferenças. A própria Prefeitura informa que não impedem certidão enquanto não forem inscritos em dívida ativa.');

  RAISE NOTICE 'Carga inicial concluída.';
END;
$seed$;

-- Joga a janela rolante em Contas a Pagar já na aplicação da migration.
-- (Como roda pelo SQL Editor, auth.role() é service_role e passa na guarda.)
SELECT public.fiscal_sync_contas_a_pagar() AS despesas_criadas;
