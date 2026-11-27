-- supabase/grade-vo-fds-0512.sql
--
-- Grade de fim de semana da JustClub Vila Olímpia a partir de 05/12/2026 (pedido do Ricardo, 27/11).
--   Sábado  Running + Funcional: 08:30 / 09:30 / 10:30 / 11:30   (antes 09:00 / 10:00 / 11:00)
--   Domingo Running & Hybrid:    09:30 / 10:30 / 11:30           (antes 09:00 / 10:00 / 11:00)
--   Lift de sábado e domingo (10:15 e 11:15) não muda.
--
-- Nada é apagado nem tem horário editado: o passado fica nas aulas antigas. Os horários novos são
-- aulas NOVAS; as ocorrências antigas de 05/12 em diante são canceladas (o trigger despublica no
-- parceiro). As 10 reservas que já existiam: canceladas com e-mail (decisão do Ricardo, igual 24/11).
-- Horizonte das ocorrências: o mesmo da grade (fins de semana até 27/12).

begin;

create temp table _saem (aula uuid) on commit drop;
insert into _saem values
  ('72d62fc3-bb0d-4e28-ad4d-b58f7d5501e7'), -- Sáb 09:00 Running
  ('e3450457-1578-4e8f-8897-98e2f78004af'), -- Sáb 10:00 Running
  ('8ede555c-56c6-4669-b5c6-896980dee8ed'), -- Sáb 11:00 Running
  ('19dd28aa-8901-40e1-aa83-54724bf4bbd8'), -- Dom 09:00 Hybrid
  ('124ef3fb-fc83-4047-90b4-e7c415072d18'), -- Dom 10:00 Hybrid
  ('93bf8282-1cbf-4f6a-8e26-eed0310ccd47'); -- Dom 11:00 Hybrid

create temp table _ocs on commit drop as
select o.id, o.data
  from club_ocorrencias o join _saem s on s.aula = o.aula_id
 where o.data >= '2026-12-05' and o.status <> 'cancelada';

-- ── Aulas novas ─────────────────────────────────────────────────────────────
create temp table _novas (id uuid, dia_semana int) on commit drop;
with ins as (
  insert into club_aulas (unidade_id, tipo, grupo_muscular_id, coach_id, dia_semana, horario,
                          duracao_min, capacidade, so_mulheres, ativo)
  select '05eeab3e-5eae-4140-bc3a-1c1d56ac95be', v.tipo, v.grupo, null, v.dia, v.horario, 50, v.cap, false, true
    from (values
      ('running_funcional', '8aa4e0c4-9f9f-4416-8e6d-03a4f19ae3f7'::uuid, 6, '08:30'::time, 20),
      ('running_funcional', '8aa4e0c4-9f9f-4416-8e6d-03a4f19ae3f7'::uuid, 6, '09:30'::time, 20),
      ('running_funcional', '8aa4e0c4-9f9f-4416-8e6d-03a4f19ae3f7'::uuid, 6, '10:30'::time, 20),
      ('running_funcional', '8aa4e0c4-9f9f-4416-8e6d-03a4f19ae3f7'::uuid, 6, '11:30'::time, 20),
      ('treino_hibrido',    null::uuid,                                   0, '09:30'::time, 40),
      ('treino_hibrido',    null::uuid,                                   0, '10:30'::time, 40),
      ('treino_hibrido',    null::uuid,                                   0, '11:30'::time, 40)
    ) as v(tipo, grupo, dia, horario, cap)
  returning id, dia_semana
)
insert into _novas select id, dia_semana from ins;

insert into club_ocorrencias (aula_id, data, status)
select n.id, d::date, 'ativa'
  from _novas n
  join generate_series('2026-12-05'::date, '2026-12-27'::date, interval '1 day') d
    on extract(dow from d) = n.dia_semana;

-- ── Reservas que existiam: cancela e avisa por e-mail (1 por cliente), fila pausada antes ──
update club_ocorrencias set fila_pausada = true where id in (select id from _ocs);

insert into notificacoes_pendentes (cliente_id, tipo, canal, destino, mensagem, unidade_id)
select distinct on (r.cliente_id)
       r.cliente_id, 'aula_cancelada', 'email', c.email,
       'A sua reserva teve que ser cancelada por ajustes na grade, entre novamente e refaça caso o novo horario te atenda',
       '05eeab3e-5eae-4140-bc3a-1c1d56ac95be'
  from club_reservas r join clientes c on c.id = r.cliente_id
 where r.ocorrencia_id in (select id from _ocs) and r.status <> 'cancelado' and coalesce(c.email, '') <> ''
 order by r.cliente_id;

update club_reservas set status = 'cancelado', cancelado_em = now(), cancelado_via = 'aula_cancelada'
 where ocorrencia_id in (select id from _ocs) and status <> 'cancelado';

update club_ocorrencias set status = 'cancelada' where id in (select id from _ocs);

-- ── Aulas antigas ───────────────────────────────────────────────────────────
-- Já sem nenhuma ocorrência ativa: Dom 09/10/11 Hybrid (só tinham de 06/12 em diante) e
-- Sáb 08:00 Running (sem ocorrência desde julho).
update club_aulas set ativo = false
 where id in ('19dd28aa-8901-40e1-aa83-54724bf4bbd8', '124ef3fb-fc83-4047-90b4-e7c415072d18',
              '93bf8282-1cbf-4f6a-8e26-eed0310ccd47', 'c5cb5b35-0a97-41d2-8175-aee4470258a2');

-- Ainda têm aula neste fim de semana (sáb 28/11 e inaugurais de dom 29/11): desativa em 30/11 00:00 SP.
select cron.schedule('vo-fds-antigo-desativa-3011', '0 3 30 11 *', $job$
  update public.club_aulas set ativo = false
   where id in ('72d62fc3-bb0d-4e28-ad4d-b58f7d5501e7','e3450457-1578-4e8f-8897-98e2f78004af',
                '8ede555c-56c6-4669-b5c6-896980dee8ed',
                '491a5673-7e9a-4699-9c7c-c5afb37be1f1','9acef7d5-08dc-48ca-924d-01dd46678987',
                '1268bb49-bd41-4a5b-82a3-509c81eed2c8');
  select cron.unschedule('vo-fds-antigo-desativa-3011');
$job$);

commit;
