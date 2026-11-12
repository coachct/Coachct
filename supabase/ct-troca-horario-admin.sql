-- ═══════════════════════════════════════════════════════════════════════════
-- TROCA DE HORÁRIO PELO ADMIN — Coach CT (12/11/2026)
--
-- Admin/coordenadora move o agendamento para outro horário do MESMO dia,
-- sem cancelar e reagendar. A troca é um UPDATE só de horário (+ limpa coach):
-- não dispara fila, crédito, multa nem trava de 1 por dia (os triggers de
-- UPDATE só reagem a mudança de status).
--
-- Colunas abaixo só registram a troca (aditivo). Não consomem a troca única
-- do cliente (trocado_pelo_cliente_em continua intacto).
-- ═══════════════════════════════════════════════════════════════════════════
alter table agendamentos add column if not exists trocado_admin_em  timestamptz;
alter table agendamentos add column if not exists trocado_admin_de  text;
alter table agendamentos add column if not exists trocado_admin_por uuid;
