-- supabase/grade-vo-2911.sql
--
-- Nova grade da JustClub Vila Olímpia a partir de 29/11/2026 (brief do Ricardo, 24/11).
-- Pinheiros encerra em 28/11 13:00 (job agendado à parte, ver pinheiros-encerra-2811.sql).
--
-- 1) Trocas de coach (seção 2 do brief), menos as 10 aulas de Running de seg/qui, que viram
--    aulas NOVAS de Running & Hybrid (tipo treino_hibrido) com o coach novo.
-- 2) Lift for Girls de quarta 06:00/07:00/08:00 saem (sem ocorrências futuras).
-- 3) Running & Hybrid: seg e qui (todas as aulas de Running) a partir de 30/11, e domingo
--    09:00/10:00/11:00 a partir de 06/12 (29/11 fica sem aula: inauguração lançada à mão).
--    40 vagas, sem posição. Reservas que já existiam no Running dessas datas: canceladas com
--    e-mail (decisão do Ricardo). As aulas de Running antigas são desativadas em 30/11 (job).
-- Nada é apagado: o passado fica nas aulas antigas.

-- ── 1) Trocas de coach ──────────────────────────────────────────────────────
create temp table _trocas (aula uuid, coach uuid) on commit drop;
insert into _trocas values
  ('b8c990a2-4b18-4683-ab9d-eb1f3b41fe2a', '45112c1e-e937-407f-a864-2c71f57b7fbd'), -- Seg 12:15 Lift → Dani
  ('3ffc9af2-dddf-44a2-b665-e0c6479761c9', '45112c1e-e937-407f-a864-2c71f57b7fbd'), -- Seg 18:30 Lift → Dani
  ('e7d41a4b-b335-4a14-b3ec-9484cb4c0aaf', '45112c1e-e937-407f-a864-2c71f57b7fbd'), -- Seg 19:30 Lift → Dani
  ('381564cf-2920-4a69-a186-c70d5afed5cd', '45112c1e-e937-407f-a864-2c71f57b7fbd'), -- Ter 06:00 Lift → Dani
  ('2684fd6a-718e-49ac-bd4d-0fccbbc847b3', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb'), -- Ter 06:00 Running → Guilherme
  ('d8f8f55a-5189-430a-aa50-4eafc8aca1d1', '45112c1e-e937-407f-a864-2c71f57b7fbd'), -- Ter 07:00 Lift → Dani
  ('d9a6d74f-50b8-4bff-9938-a1fcdab583f5', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb'), -- Ter 07:00 Running → Guilherme
  ('65c69ad9-c0fb-4e83-bc56-69bcdae49a82', '45112c1e-e937-407f-a864-2c71f57b7fbd'), -- Ter 12:15 Running → Dani
  ('ad31e395-bb5f-4ae8-bfba-3d0be96defe8', '45112c1e-e937-407f-a864-2c71f57b7fbd'), -- Qua 12:15 LFG → Dani
  ('1725c5ec-a386-4861-b8ac-66dec193ec1a', '38faf696-2fa8-436a-9033-222515f81f6b'), -- Qua 18:30 LFG → Kauany
  ('7570c63a-bb81-4809-a280-4d87db985d50', '38faf696-2fa8-436a-9033-222515f81f6b'), -- Qua 19:30 LFG → Kauany
  ('db186c21-f774-48ed-a179-f7eb63091979', '45112c1e-e937-407f-a864-2c71f57b7fbd'), -- Qui 12:15 Lift → Dani
  ('6313f4a1-2a53-408a-b699-7accd72ac5e1', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb'), -- Sex 06:00 Lift → Guilherme
  ('15fd5e92-757b-407e-8866-cb1e8b205edd', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb'), -- Sex 07:00 Lift → Guilherme
  ('6b6c40a1-9e0a-4b68-82b1-12a457b9e761', '38faf696-2fa8-436a-9033-222515f81f6b'), -- Sex 12:15 Lift → Kauany
  ('9b3c4804-b15d-4432-8aef-a46761789a57', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb'), -- Sex 18:30 Lift → Guilherme
  ('d456ab37-d0e6-43be-9441-c1a77bfc7633', '9f518c4c-efbb-4958-b266-2658c98becb7'); -- Sex 18:30 Running → Lucy

-- Congela o coach das ocorrências antes de 29/11 (relatório lê oc.coach_id || aula.coach_id)
update club_ocorrencias o set coach_id = a.coach_id
  from club_aulas a, _trocas t
 where a.id = t.aula and o.aula_id = a.id and o.data < '2026-11-29' and o.coach_id is null;

update club_aulas a set coach_id = t.coach from _trocas t where a.id = t.aula;

update club_ocorrencias o set coach_id = t.coach
  from _trocas t
 where o.aula_id = t.aula and o.data >= '2026-11-29' and not coalesce(o.coach_correcao_manual, false);

-- ── 2) LFG de quarta 06:00/07:00/08:00 saem ──────────────────────────────────
update club_aulas set ativo = false
 where id in ('527c857e-aa12-4d63-a95b-6c99d8819e48', '727f5a9d-c787-4277-80f6-9536b473e190', '0ee6e0ec-d2c9-4cac-89c0-b2ecc3d6abd4');

-- ── 3) Running & Hybrid ─────────────────────────────────────────────────────
create temp table _hib (fonte uuid, coach uuid, inicio date) on commit drop;
insert into _hib values
  ('1f972cbd-bcff-4335-9fc4-4fd783372ecc', '07104869-26e3-4c0c-9d8c-9b7d388779ec', '2026-11-30'), -- Seg 06:00 Gracy
  ('3f404544-6a7a-4fe8-a93d-06f7fb07b12b', '07104869-26e3-4c0c-9d8c-9b7d388779ec', '2026-11-30'), -- Seg 07:00 Gracy
  ('1a256529-7841-4d81-9ffe-f3358e4822e4', 'f7c29f58-cbd9-4c61-895c-760b0fd06d71', '2026-11-30'), -- Seg 12:15 Ju
  ('8ec6d714-bec0-4fc3-b0f3-0a9263e9c8a5', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb', '2026-11-30'), -- Seg 18:30 Guilherme
  ('87f0cccf-90c6-4735-9c3d-cde5caaa3ec3', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb', '2026-11-30'), -- Seg 19:30 Guilherme
  ('9c611db0-5fb8-4e10-b954-b30786cfe717', '45112c1e-e937-407f-a864-2c71f57b7fbd', '2026-11-30'), -- Qui 06:00 Dani
  ('1b131acb-18f0-42b7-9b8b-6673371a863b', '45112c1e-e937-407f-a864-2c71f57b7fbd', '2026-11-30'), -- Qui 07:00 Dani
  ('031d5a75-a0c8-44a8-b329-71b3ca1ecb05', '38faf696-2fa8-436a-9033-222515f81f6b', '2026-11-30'), -- Qui 12:15 Kauany
  ('a7a8eaf4-c0a9-4ffb-a160-32791eabaaf2', '9f518c4c-efbb-4958-b266-2658c98becb7', '2026-11-30'), -- Qui 18:30 Lucy
  ('55ac4e8a-3b4e-4175-80c5-6a917feeb1ee', '9f518c4c-efbb-4958-b266-2658c98becb7', '2026-11-30'), -- Qui 19:30 Lucy
  ('04a2117d-9004-47a8-912b-f204b6442938', null, '2026-12-06'),                                   -- Dom 09:00 (escala)
  ('b58c420f-bbf9-4f1d-b746-398f49bbd023', null, '2026-12-06'),                                   -- Dom 10:00 (escala)
  ('78481247-5385-477d-bb74-c11b825350a3', null, '2026-12-06');                                   -- Dom 11:00 (escala)

-- Ocorrências de Running que saem (mesmas datas ganham a aula de Running & Hybrid)
create temp table _ocs on commit drop as
select o.id, o.data, h.fonte
  from club_ocorrencias o join _hib h on h.fonte = o.aula_id
 where o.data >= h.inicio and o.status <> 'cancelada';

-- Aulas novas (mesmo dia/horário/duração da fonte, 40 vagas, sem grupo muscular)
create temp table _novas (id uuid, fonte uuid) on commit drop;
with ins as (
  insert into club_aulas (unidade_id, tipo, grupo_muscular_id, coach_id, dia_semana, horario,
                          duracao_min, capacidade, so_mulheres, ativo)
  select a.unidade_id, 'treino_hibrido', null, h.coach, a.dia_semana, a.horario,
         a.duracao_min, 40, false, true
    from _hib h join club_aulas a on a.id = h.fonte
  returning id, dia_semana, horario
)
insert into _novas
select ins.id, a.id from ins
  join club_aulas a on a.dia_semana = ins.dia_semana and a.horario = ins.horario
  join _hib h on h.fonte = a.id;

insert into club_ocorrencias (aula_id, data, status, coach_id)
select n.id, o.data, 'ativa', h.coach
  from _novas n join _ocs o on o.fonte = n.fonte join _hib h on h.fonte = n.fonte;

-- Reservas que existiam: cancela e avisa por e-mail (1 por cliente), fila pausada antes
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

-- Kauany passa a dar Running & Hybrid (elegibilidade na escala)
insert into coach_tipos (coach_id, tipo) values ('38faf696-2fa8-436a-9033-222515f81f6b', 'treino_hibrido')
on conflict (coach_id, tipo) do nothing;

-- Conferência
select (select count(*) from _novas) aulas_novas,
       (select count(*) from club_ocorrencias where aula_id in (select id from _novas)) ocorrencias_novas,
       (select count(*) from _ocs) ocorrencias_running_canceladas,
       (select count(*) from _trocas) trocas_de_coach;
