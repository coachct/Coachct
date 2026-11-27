-- supabase/hibrido-domingo-2911-1130.sql (aplicado em 27/11/2026, 11:08 SP)
-- Running & Hybrid domingo 29/11: mais uma aula avulsa às 11:30 (VO), igual às de 09:15 e 10:30.
-- Reservas abertas na hora (sem janela de preferência); TotalPass publica no publish-slots da hora cheia.
-- Resultado: club_aulas 1268bb49-bd41-4a5b-82a3-509c81eed2c8 · ocorrência 50578e69-ba70-4dd8-bb71-e7c20c1e69b4

with a as (
  insert into public.club_aulas (unidade_id, tipo, dia_semana, horario, duracao_min, capacidade, so_mulheres, ativo)
  values ('05eeab3e-5eae-4140-bc3a-1c1d56ac95be', 'treino_hibrido', 0, '11:30', 50, 40, false, true)
  returning id)
insert into public.club_ocorrencias (aula_id, data, status, capacidade)
select id, '2026-11-29', 'ativa', 40 from a;
