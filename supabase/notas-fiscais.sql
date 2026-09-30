-- ============================================================================
-- Emissão manual de NFS-e (NFE.io) para vendas de balcão
-- Decisões do Ricardo em 30/09/2026:
--   * fica FORA da lista tudo que já passou pelo Pagar.me (a integração nativa
--     Pagar.me -> NFE.io já emite a nota):
--       - venda do site: existe pagamentos_pendentes.venda_id apontando pra ela;
--       - multa cobrada no cartão salvo: vendas.observacao traz "order_id or_...";
--   * cortesia (valor 0) também fica fora: não existe nota de R$ 0;
--   * maquininha e PIX do balcão NÃO são Pagar.me -> entram na lista;
--   * acesso SÓ admin (coordenadora não vê).
--
-- Tabela nova: notas_fiscais. Nenhuma tabela existente é alterada.
-- Escrita só pelo servidor (service_role, rotas /api/admin/nfeio/*);
-- o navegador do admin só LÊ.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.notas_fiscais_vendas(date, date, uuid);
--   DROP TABLE IF EXISTS public.notas_fiscais;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id          uuid NOT NULL REFERENCES public.vendas(id),
  unidade_id        uuid REFERENCES public.unidades(id),
  -- 'teste' = empresa de homologação na NFE.io; 'producao' = nota real.
  -- Separado pra nota de teste não travar a emissão real da mesma venda.
  ambiente          text NOT NULL DEFAULT 'teste' CHECK (ambiente IN ('teste', 'producao')),
  company_id_nfeio  text NOT NULL,
  nfeio_invoice_id  text,
  -- enviando   = registro criado, chamada à API em curso / aguardando processamento
  -- emitida    = NFE.io confirmou a emissão
  -- erro       = API recusou ou a prefeitura rejeitou (mensagem_erro diz o porquê)
  -- cancelando = pedido de cancelamento enviado, aguardando confirmação
  -- cancelada  = cancelamento confirmado
  status            text NOT NULL DEFAULT 'enviando'
                      CHECK (status IN ('enviando', 'emitida', 'erro', 'cancelando', 'cancelada')),
  numero_nota       text,
  pdf_url           text,
  valor             numeric NOT NULL CHECK (valor > 0),
  mensagem_erro     text,
  emitida_por       uuid REFERENCES public.perfis(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  cancelada_em      timestamptz,
  cancelada_por     uuid REFERENCES public.perfis(id)
);

-- Trava 3: uma nota viva por venda (por ambiente). Cancelada libera nova emissão.
-- "Reenviar" reaproveita a própria linha em erro (volta pra 'enviando').
CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_uma_por_venda
  ON public.notas_fiscais (venda_id, ambiente)
  WHERE status <> 'cancelada';

CREATE INDEX IF NOT EXISTS notas_fiscais_venda_idx   ON public.notas_fiscais (venda_id);
CREATE UNIQUE INDEX IF NOT EXISTS notas_fiscais_invoice_idx
  ON public.notas_fiscais (nfeio_invoice_id) WHERE nfeio_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notas_fiscais_status_idx  ON public.notas_fiscais (status);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.notas_fiscais_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notas_fiscais_touch ON public.notas_fiscais;
CREATE TRIGGER notas_fiscais_touch
  BEFORE UPDATE ON public.notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.notas_fiscais_touch();

-- ---------------------------------------------------------------------------
-- 2. GRANTs + RLS + policies (regra do projeto de 23/09/2026)
--    authenticated só lê (e só admin). Escrita é do servidor (service_role).
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.notas_fiscais FROM anon;
GRANT SELECT ON public.notas_fiscais TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_fiscais TO service_role;

ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nf_admin_select ON public.notas_fiscais;
CREATE POLICY nf_admin_select ON public.notas_fiscais
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Lista de vendas elegíveis pra tela "Notas Fiscais"
--    Devolve só balcão puro com valor > 0, com o status da nota mais recente.
--    CPF sai mascarado; o CPF completo só é lido pelo servidor na emissão.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notas_fiscais_vendas(
  p_inicio  date,
  p_fim     date,
  p_unidade uuid DEFAULT NULL
)
RETURNS TABLE (
  venda_id          uuid,
  vendido_em        timestamptz,
  unidade_id        uuid,
  unidade_nome      text,
  cliente_id        uuid,
  cliente_nome      text,
  cpf_mascarado     text,
  tem_cpf           boolean,
  tem_email         boolean,
  produto_id        uuid,
  produto_nome      text,
  valor             numeric,
  forma_pagamento   text,
  nota_id           uuid,
  nota_status       text,
  nota_ambiente     text,
  numero_nota       text,
  pdf_url           text,
  mensagem_erro     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.role = 'admin') THEN
    RAISE EXCEPTION 'acesso_negado';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.vendido_em,
    v.unidade_id,
    u.nome,
    c.id,
    c.nome,
    CASE WHEN length(regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g')) = 11
         THEN '***.' || substr(regexp_replace(c.cpf, '\D', '', 'g'), 4, 3) || '.***-**'
         ELSE NULL END,
    length(regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g')) = 11,
    coalesce(trim(c.email), '') LIKE '%_@_%.%',
    v.produto_id,
    pr.nome,
    v.valor_total,
    v.forma_pagamento,
    nf.id,
    nf.status,
    nf.ambiente,
    nf.numero_nota,
    nf.pdf_url,
    nf.mensagem_erro
  FROM vendas v
  LEFT JOIN unidades u  ON u.id  = v.unidade_id
  LEFT JOIN clientes c  ON c.id  = v.cliente_id
  LEFT JOIN produtos pr ON pr.id = v.produto_id
  LEFT JOIN LATERAL (
    SELECT n.id, n.status, n.ambiente, n.numero_nota, n.pdf_url, n.mensagem_erro
    FROM notas_fiscais n
    WHERE n.venda_id = v.id
    ORDER BY (n.status <> 'cancelada') DESC, n.created_at DESC
    LIMIT 1
  ) nf ON true
  WHERE v.excluido_em IS NULL
    AND v.valor_total > 0
    AND coalesce(v.forma_pagamento, '') <> 'cortesia'
    AND (v.vendido_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_inicio AND p_fim
    AND (p_unidade IS NULL OR v.unidade_id = p_unidade)
    -- fora: venda do site (Pagar.me)
    AND NOT EXISTS (SELECT 1 FROM pagamentos_pendentes pp WHERE pp.venda_id = v.id)
    -- fora: multa cobrada no cartão salvo (Pagar.me)
    AND coalesce(v.observacao, '') !~ 'order_id or_'
  ORDER BY v.vendido_em DESC;
END $$;

REVOKE ALL ON FUNCTION public.notas_fiscais_vendas(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notas_fiscais_vendas(date, date, uuid) TO authenticated, service_role;
