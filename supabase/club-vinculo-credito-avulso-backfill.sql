-- ============================================================================
-- PASSO 3 — Backfill do histórico do vínculo credito_avulso_id
-- Rodar 3a (PREVIEW, read-only) PRIMEIRO e conferir a Fernanda antes de 3b.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3a — PREVIEW (read-only)
-- ---------------------------------------------------------------------------
WITH res AS (
  SELECT cr.id AS reserva_id, cr.cliente_id, cr.created_at,
    CASE
      WHEN cr.tipo_credito = 'avulso' THEN 'global'
      WHEN cr.tipo_credito = 'avulso_importado' THEN 'importado'
      WHEN cr.tipo_credito LIKE 'avulso\_%' THEN 'unit:' || substring(cr.tipo_credito FROM 'avulso_(.+)')
    END AS pool,
    ROW_NUMBER() OVER (
      PARTITION BY cr.cliente_id,
        CASE
          WHEN cr.tipo_credito = 'avulso' THEN 'global'
          WHEN cr.tipo_credito = 'avulso_importado' THEN 'importado'
          WHEN cr.tipo_credito LIKE 'avulso\_%' THEN 'unit:' || substring(cr.tipo_credito FROM 'avulso_(.+)')
        END
      ORDER BY cr.created_at ASC, cr.id ASC) AS rn
  FROM club_reservas cr
  WHERE cr.status <> 'cancelado'
    AND cr.credito_avulso_id IS NULL
    AND (cr.tipo_credito = 'avulso' OR cr.tipo_credito = 'avulso_importado' OR cr.tipo_credito LIKE 'avulso\_%')
),
cred AS (
  SELECT ca.id AS credito_id, ca.cliente_id, ca.observacao, ca.validade,
    CASE
      WHEN ca.observacao LIKE 'Migração%' THEN 'importado'
      WHEN ca.unidade_id IS NULL THEN 'global'
      ELSE 'unit:' || u.slug
    END AS pool,
    ROW_NUMBER() OVER (
      PARTITION BY ca.cliente_id,
        CASE
          WHEN ca.observacao LIKE 'Migração%' THEN 'importado'
          WHEN ca.unidade_id IS NULL THEN 'global'
          ELSE 'unit:' || u.slug
        END
      ORDER BY (ca.validade >= CURRENT_DATE) DESC, ca.validade ASC, ca.comprado_em ASC, ca.id ASC) AS rn
  FROM creditos_avulsos ca
  LEFT JOIN unidades u ON u.id = ca.unidade_id
)
SELECT c.nome, res.pool, res.rn, res.reserva_id, cred.credito_id, cred.observacao, cred.validade
FROM res
JOIN cred ON cred.cliente_id = res.cliente_id AND cred.pool = res.pool AND cred.rn = res.rn
JOIN clientes c ON c.id = res.cliente_id
WHERE c.email = 'femegio@gmail.com'
ORDER BY res.pool, res.rn;

-- Volume total que será vinculado:
WITH res AS (
  SELECT cr.id, cr.cliente_id,
    CASE WHEN cr.tipo_credito='avulso' THEN 'global'
         WHEN cr.tipo_credito='avulso_importado' THEN 'importado'
         WHEN cr.tipo_credito LIKE 'avulso\_%' THEN 'unit:'||substring(cr.tipo_credito FROM 'avulso_(.+)') END AS pool,
    ROW_NUMBER() OVER (PARTITION BY cr.cliente_id,
      CASE WHEN cr.tipo_credito='avulso' THEN 'global'
           WHEN cr.tipo_credito='avulso_importado' THEN 'importado'
           WHEN cr.tipo_credito LIKE 'avulso\_%' THEN 'unit:'||substring(cr.tipo_credito FROM 'avulso_(.+)') END
      ORDER BY cr.created_at ASC, cr.id ASC) AS rn
  FROM club_reservas cr
  WHERE cr.status<>'cancelado' AND cr.credito_avulso_id IS NULL
    AND (cr.tipo_credito='avulso' OR cr.tipo_credito='avulso_importado' OR cr.tipo_credito LIKE 'avulso\_%')
),
cred AS (
  SELECT ca.id, ca.cliente_id,
    CASE WHEN ca.observacao LIKE 'Migração%' THEN 'importado'
         WHEN ca.unidade_id IS NULL THEN 'global'
         ELSE 'unit:'||u.slug END AS pool,
    ROW_NUMBER() OVER (PARTITION BY ca.cliente_id,
      CASE WHEN ca.observacao LIKE 'Migração%' THEN 'importado'
           WHEN ca.unidade_id IS NULL THEN 'global'
           ELSE 'unit:'||u.slug END
      ORDER BY (ca.validade>=CURRENT_DATE) DESC, ca.validade ASC, ca.comprado_em ASC, ca.id ASC) AS rn
  FROM creditos_avulsos ca LEFT JOIN unidades u ON u.id=ca.unidade_id
)
SELECT COUNT(*) AS reservas_que_serao_vinculadas
FROM res JOIN cred ON cred.cliente_id=res.cliente_id AND cred.pool=res.pool AND cred.rn=res.rn;

-- ---------------------------------------------------------------------------
-- 3b — COMMIT (rodar só depois de conferir o preview 3a)
-- ---------------------------------------------------------------------------
BEGIN;

WITH res AS (
  SELECT cr.id AS reserva_id, cr.cliente_id,
    CASE
      WHEN cr.tipo_credito = 'avulso' THEN 'global'
      WHEN cr.tipo_credito = 'avulso_importado' THEN 'importado'
      WHEN cr.tipo_credito LIKE 'avulso\_%' THEN 'unit:' || substring(cr.tipo_credito FROM 'avulso_(.+)')
    END AS pool,
    ROW_NUMBER() OVER (
      PARTITION BY cr.cliente_id,
        CASE
          WHEN cr.tipo_credito = 'avulso' THEN 'global'
          WHEN cr.tipo_credito = 'avulso_importado' THEN 'importado'
          WHEN cr.tipo_credito LIKE 'avulso\_%' THEN 'unit:' || substring(cr.tipo_credito FROM 'avulso_(.+)')
        END
      ORDER BY cr.created_at ASC, cr.id ASC) AS rn
  FROM club_reservas cr
  WHERE cr.status <> 'cancelado'
    AND cr.credito_avulso_id IS NULL
    AND (cr.tipo_credito = 'avulso' OR cr.tipo_credito = 'avulso_importado' OR cr.tipo_credito LIKE 'avulso\_%')
),
cred AS (
  SELECT ca.id AS credito_id, ca.cliente_id,
    CASE
      WHEN ca.observacao LIKE 'Migração%' THEN 'importado'
      WHEN ca.unidade_id IS NULL THEN 'global'
      ELSE 'unit:' || u.slug
    END AS pool,
    ROW_NUMBER() OVER (
      PARTITION BY ca.cliente_id,
        CASE
          WHEN ca.observacao LIKE 'Migração%' THEN 'importado'
          WHEN ca.unidade_id IS NULL THEN 'global'
          ELSE 'unit:' || u.slug
        END
      ORDER BY (ca.validade >= CURRENT_DATE) DESC, ca.validade ASC, ca.comprado_em ASC, ca.id ASC) AS rn
  FROM creditos_avulsos ca
  LEFT JOIN unidades u ON u.id = ca.unidade_id
)
UPDATE club_reservas cr
SET credito_avulso_id = m.credito_id
FROM (
  SELECT res.reserva_id, cred.credito_id
  FROM res JOIN cred
    ON cred.cliente_id = res.cliente_id AND cred.pool = res.pool AND cred.rn = res.rn
) m
WHERE cr.id = m.reserva_id;

-- Confere Fernanda antes de COMMIT:
SELECT cr.id, cr.tipo_credito, ca.observacao, ca.validade
FROM club_reservas cr
JOIN clientes c ON c.id = cr.cliente_id
LEFT JOIN creditos_avulsos ca ON ca.id = cr.credito_avulso_id
WHERE c.email = 'femegio@gmail.com' AND cr.status <> 'cancelado'
ORDER BY cr.created_at;

COMMIT;  -- (ou ROLLBACK se algo estranho)
