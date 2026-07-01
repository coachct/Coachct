-- totalpass-produto-legivel.sql
-- Backfill: troca o plan_code guardado em entradas_walkin.produto pelo nome
-- legível do plano (valores_checkin.descricao), pras telas mostrarem
-- "Musculação Livre" / "Musculação com Personal" em vez de WXUWIUS4 / 3H4Z8V1W.
-- Daqui pra frente o receiver já grava o nome legível na validação; este script
-- só corrige as linhas antigas. Idempotente (depois de rodar, produto já é o
-- descricao e não casa mais com produto_id).

UPDATE public.entradas_walkin e
SET produto = v.descricao
FROM public.valores_checkin v
WHERE e.origem = 'totalpass'
  AND v.origem = 'totalpass'
  AND v.produto_id = e.produto;
