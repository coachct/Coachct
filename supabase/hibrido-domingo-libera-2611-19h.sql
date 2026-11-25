-- supabase/hibrido-domingo-libera-2611-19h.sql (aplicado em 25/11/2026)
-- Running & Hybrid domingo 29/11 (09:15 e 10:30): Ricardo mudou a liberação.
-- Sem janela de preferência: reservas abrem para todos de uma vez em 26/11 às 19h (SP).
-- TotalPass recebe as aulas junto (job às 18:59 SP). Texto dos triggers: "reservas liberadas em 26/11 19hr".

update public.club_preferencia_janela
   set abre_em = '2026-11-26 19:00:00-03', libera_em = '2026-11-26 19:00:00-03'
 where ocorrencia_id in ('9de328c7-5408-43c4-9b1c-a3fa72c9c4c6','842e89fd-42bf-45c5-af2d-48201b1ea8d2');

-- club_preferencia_trava_reserva / club_preferencia_trava_fila: só a mensagem PREFERENCIA_FECHADA mudou
-- (de 25/11 para 26/11 19hr); o resto igual a supabase/club-preferencia-frequentes.sql.

select cron.unschedule('hibrido-domingo-totalpass-2611');
select cron.schedule('hibrido-domingo-totalpass-2611', '59 21 26 11 *', $job$
  update public.club_ocorrencias set vagas_totalpass = null
   where id in ('9de328c7-5408-43c4-9b1c-a3fa72c9c4c6','842e89fd-42bf-45c5-af2d-48201b1ea8d2');
  select cron.unschedule('hibrido-domingo-totalpass-2611');
$job$);
