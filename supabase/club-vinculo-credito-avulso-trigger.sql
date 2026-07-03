CREATE OR REPLACE FUNCTION public.atribuir_credito_avulso_club()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_slug text;
  v_credito_id uuid;
  v_is_avulso boolean;
BEGIN
  v_is_avulso := (NEW.tipo_credito = 'avulso'
                  OR NEW.tipo_credito = 'avulso_importado'
                  OR NEW.tipo_credito LIKE 'avulso\_%');

  -- Reserva cancelada não segura crédito: libera o vínculo.
  IF NEW.status = 'cancelado' THEN
    NEW.credito_avulso_id := NULL;
    RETURN NEW;
  END IF;

  -- Não-avulso, ou já vinculado: nada a fazer.
  IF NOT v_is_avulso OR NEW.credito_avulso_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serializa a atribuição por cliente (evita dois avulsos simultâneos
  -- pegarem o mesmo crédito). Vínculo display-only, mas mantemos coerente.
  PERFORM pg_advisory_xact_lock(hashtext('cred_avulso:' || NEW.cliente_id::text));

  IF NEW.tipo_credito = 'avulso' THEN
    -- pool global (sem unidade), não-migração
    SELECT ca.id INTO v_credito_id
    FROM creditos_avulsos ca
    WHERE ca.cliente_id = NEW.cliente_id
      AND ca.unidade_id IS NULL
      AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%')
      AND NOT EXISTS (
        SELECT 1 FROM club_reservas cr2
        WHERE cr2.credito_avulso_id = ca.id
          AND cr2.status <> 'cancelado'
          AND cr2.id <> NEW.id)
    ORDER BY (ca.validade >= CURRENT_DATE) DESC, ca.validade ASC, ca.comprado_em ASC, ca.id ASC
    LIMIT 1;

  ELSIF NEW.tipo_credito = 'avulso_importado' THEN
    -- pool importado (migração do sistema antigo)
    SELECT ca.id INTO v_credito_id
    FROM creditos_avulsos ca
    WHERE ca.cliente_id = NEW.cliente_id
      AND ca.observacao LIKE 'Migração%'
      AND NOT EXISTS (
        SELECT 1 FROM club_reservas cr2
        WHERE cr2.credito_avulso_id = ca.id
          AND cr2.status <> 'cancelado'
          AND cr2.id <> NEW.id)
    ORDER BY (ca.validade >= CURRENT_DATE) DESC, ca.validade ASC, ca.comprado_em ASC, ca.id ASC
    LIMIT 1;

  ELSE
    -- pool por unidade: avulso_<slug>
    v_slug := substring(NEW.tipo_credito FROM 'avulso_(.+)');
    SELECT ca.id INTO v_credito_id
    FROM creditos_avulsos ca
    JOIN unidades u ON u.id = ca.unidade_id
    WHERE ca.cliente_id = NEW.cliente_id
      AND u.slug = v_slug
      AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%')
      AND NOT EXISTS (
        SELECT 1 FROM club_reservas cr2
        WHERE cr2.credito_avulso_id = ca.id
          AND cr2.status <> 'cancelado'
          AND cr2.id <> NEW.id)
    ORDER BY (ca.validade >= CURRENT_DATE) DESC, ca.validade ASC, ca.comprado_em ASC, ca.id ASC
    LIMIT 1;
  END IF;

  NEW.credito_avulso_id := v_credito_id;  -- pode ser NULL (sem crédito p/ vincular) → badge cai em "Avulso"
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atribuir_credito_avulso_club ON public.club_reservas;
CREATE TRIGGER trg_atribuir_credito_avulso_club
  BEFORE INSERT OR UPDATE ON public.club_reservas
  FOR EACH ROW EXECUTE FUNCTION atribuir_credito_avulso_club();
