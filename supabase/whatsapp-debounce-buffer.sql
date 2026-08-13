-- ============================================================================
-- Buffer para o DEBOUNCE de mensagens "picadas" do WhatsApp
-- ============================================================================
-- Aditivo à tabela de idempotência whatsapp_processadas (que já tinha wamid +
-- criado_em). Guarda telefone + texto de cada inbound e uma flag 'respondido',
-- pra o webhook juntar a "rajada" (mensagem única quebrada em 2-3) e responder uma
-- vez só. Não muda a idempotência atual (que só olha o wamid).
-- Aplicado em produção 2026-08-13 (migration whatsapp_processadas_buffer_debounce).
-- O debounce em si é ligado por env WHATSAPP_DEBOUNCE_MS (ex.: 6000); 0/ausente = OFF.
-- ============================================================================

ALTER TABLE public.whatsapp_processadas
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS texto text,
  ADD COLUMN IF NOT EXISTS respondido boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wa_processadas_tel_resp
  ON public.whatsapp_processadas (telefone, respondido, criado_em);
