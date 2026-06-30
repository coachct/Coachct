-- totalpass-fase0.sql
-- FUNDAÇÃO da integração de check-in TotalPass — espelho do Wellhub.
-- Execute este arquivo no SQL Editor do Supabase.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
--
-- Esta fase é de RISCO ZERO: só adiciona coluna/linhas novas. Não altera
-- nenhuma reserva, check-in, pagamento ou linha existente do fluxo atual.
-- Reaproveita a camada que o Wellhub já deixou pronta:
--   * entradas_walkin  -> recebe as entradas (origem = 'totalpass')
--   * valores_checkin  -> já aceita origem='totalpass' (check do enum)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- VARIÁVEIS DE AMBIENTE (NÃO vão no git — colar em .env.local e na Vercel):
--   TOTALPASS_PARTNER_API_KEY   -> partner_api_key (recebido por email)
--   TOTALPASS_PLACE_API_KEY     -> place_api_key de testes (recebido por email)
--   TOTALPASS_API_BASE          -> default https://booking-api.totalpass.com
--   TOTALPASS_WEBHOOK_TOKEN     -> token secreto que vai no PATH da nossa URL de
--                                  webhook (nós geramos e registramos na TotalPass)
--   TOTALPASS_CHECKIN_ATIVO     -> kill switch: 'true' liga o receiver; qualquer
--                                  outra coisa (ou ausente) = desligado.
-- O teste da TotalPass roda em PRODUÇÃO — por isso o kill switch nasce desligado.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. unidades: mapeamento da unidade no TotalPass (espelha wellhub_gym_id)
--    service_provider_code do Just CT = 63122 (place code da TotalPass).
--    totalpass_estado dá liga/desliga POR UNIDADE (além do kill switch global).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE totalpass_estado AS ENUM ('desativado','ativo','pausado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE unidades
  ADD COLUMN IF NOT EXISTS totalpass_place_id text;
ALTER TABLE unidades
  ADD COLUMN IF NOT EXISTS totalpass_estado totalpass_estado NOT NULL DEFAULT 'desativado';

-- Just CT — única unidade no escopo desta integração.
UPDATE unidades
  SET totalpass_place_id = '63122', totalpass_estado = 'ativo'
  WHERE id = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. valores_checkin: valor por check-in dos produtos TotalPass na Just CT.
--    produto_id fica null por ora — o 1o check-in real revela o id e a função
--    de validação faz o backfill (mesmo "aprendizado" do Wellhub).
--    on conflict (origem, lower(descricao)) -> atualiza valor se já existir.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.valores_checkin (origem, descricao, valor, unidade_id)
values
  ('totalpass', 'Musculação Livre',         44.91, 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'),
  ('totalpass', 'Musculação com Personal',  81.00, 'c28bf4bb-56f8-44ff-818a-c7836e58bcef')
on conflict (origem, lower(descricao)) do update
  set valor = excluded.valor,
      unidade_id = excluded.unidade_id,
      atualizado_em = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- Conferência (rode depois pra validar):
--   SELECT id, nome, totalpass_place_id, totalpass_estado
--     FROM unidades WHERE totalpass_place_id IS NOT NULL;
--   SELECT origem, descricao, valor, produto_id
--     FROM valores_checkin WHERE origem = 'totalpass' ORDER BY descricao;
-- ─────────────────────────────────────────────────────────────────────────────
