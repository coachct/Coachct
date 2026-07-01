-- totalpass-plan-codes.sql
-- Mapeia os plan_codes REAIS de produção (unidade Just CT / place 63122) nos
-- valores_checkin. Descobertos via POST /partner/auth com a place_api_key de
-- produção — a resposta traz place.Plans com name + code:
--   WXUWIUS4 = "MUSCULAÇÃO SALA (SEM PERSONAL)" -> Musculação Livre        = 44,91
--   3H4Z8V1W = "MUSCULAÇÃO COM PERSONAL"        -> Musculação com Personal = 81,00
--
-- A partir daqui o casamento do valor no receiver (buscarValor por produto_id
-- = plan_code) passa a encontrar o valor certo. Idempotente.

UPDATE public.valores_checkin
  SET produto_id = 'WXUWIUS4', atualizado_em = now()
  WHERE origem = 'totalpass' AND lower(descricao) = lower('Musculação Livre');

UPDATE public.valores_checkin
  SET produto_id = '3H4Z8V1W', atualizado_em = now()
  WHERE origem = 'totalpass' AND lower(descricao) = lower('Musculação com Personal');

-- Conferência:
--   SELECT descricao, valor, produto_id FROM valores_checkin
--     WHERE origem = 'totalpass' ORDER BY descricao;
