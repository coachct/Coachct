-- supabase/pinheiros-grade-unificada-0311.sql
--
-- JustClub Pinheiros — grade seg–sex unificada a partir de 03/11/2026.
-- Sai: 06:00, 07:00, 12:15, 18:30, 19:30 (48 recorrências).
-- Entra: 06:20 e 18:45, uma Running Funcional + uma Lift cada (20 recorrências).
-- Sábado/domingo e aulas de feriado NÃO são tocados.
--
-- Comunicação: só o e-mail 'aula_cancelada' pra quem tinha reserva ativa nas
-- aulas que saem (site e app do parceiro), 1 por cliente. Nada no site.
-- Parceiros: os triggers trg_sync_*_ocorrencia enfileiram a mudança de status e
-- o worker (cron 2/2 min) remove na TotalPass / zera a capacidade no Wellhub.
-- Histórico preservado: nada é apagado; o passado continua nas aulas antigas.

begin;

-- ── 1) Recorrências antigas seg–sex de Pinheiros ─────────────────────────────
create temp table _antigas on commit drop as
select id from club_aulas
where unidade_id = '166a683d-5fe6-4177-8fd6-53deb70b428e'
  and ativo and feriado_id is null
  and dia_semana between 1 and 5;

do $$ begin
  if (select count(*) from _antigas) <> 48 then
    raise exception 'Esperava 48 recorrências antigas, achei %', (select count(*) from _antigas);
  end if;
end $$;

create temp table _ocs on commit drop as
select o.id from club_ocorrencias o
join _antigas a on a.id = o.aula_id
where o.data >= '2026-11-03' and o.status <> 'cancelada';

-- Pausa a fila ANTES de cancelar (ninguém é promovido pra aula que sai)
update club_ocorrencias set fila_pausada = true where id in (select id from _ocs);

-- E-mail pra todos os agendados (antes de cancelar, enquanto a reserva está ativa).
-- Sai pelo cron processar-notificacoes (5/5 min), já no template 'aula_cancelada'.
insert into notificacoes_pendentes (cliente_id, tipo, canal, destino, mensagem, unidade_id)
select distinct on (r.cliente_id)
       r.cliente_id, 'aula_cancelada', 'email', c.email,
       'A sua reserva teve que ser cancelada por ajustes na grade, entre novamente e refaça caso o novo horario te atenda',
       '166a683d-5fe6-4177-8fd6-53deb70b428e'
from club_reservas r
join clientes c on c.id = r.cliente_id
where r.ocorrencia_id in (select id from _ocs)
  and r.status <> 'cancelado'
  and coalesce(c.email, '') <> ''
order by r.cliente_id;

update club_reservas
set status = 'cancelado', cancelado_em = now(), cancelado_via = 'aula_cancelada'
where ocorrencia_id in (select id from _ocs) and status <> 'cancelado';

update club_ocorrencias set status = 'cancelada' where id in (select id from _ocs);

update club_aulas set ativo = false where id in (select id from _antigas);

-- ── 2) Recorrências novas (06:20 e 18:45) + ocorrências 03/11 → 30/12 ────────
-- Coaches: Andreia 251b602a, Gracy 07104869, Dai 49ea2e48, Guilherme 25e9a8dd,
--          Dani 45112c1e, Lucy 9f518c4c, Kauany 38faf696
with novas(dia, horario, tipo, coach, grupo) as (values
  -- Segunda (Inferiores)
  (1, '06:20', 'running_funcional', '07104869-26e3-4c0c-9d8c-9b7d388779ec', '28f22984-be72-4518-a253-4736836e058d'),
  (1, '06:20', 'lift',              '251b602a-bd0d-4c1d-a22a-1660a3f32e1b', '28f22984-be72-4518-a253-4736836e058d'),
  (1, '18:45', 'running_funcional', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb', '28f22984-be72-4518-a253-4736836e058d'),
  (1, '18:45', 'lift',              '38faf696-2fa8-436a-9033-222515f81f6b', '28f22984-be72-4518-a253-4736836e058d'),
  -- Terça (Superiores)
  (2, '06:20', 'running_funcional', '9f518c4c-efbb-4958-b266-2658c98becb7', 'b7a8354f-9e7f-41a0-9e0a-744ce31d81e2'),
  (2, '06:20', 'lift',              '45112c1e-e937-407f-a864-2c71f57b7fbd', 'b7a8354f-9e7f-41a0-9e0a-744ce31d81e2'),
  (2, '18:45', 'running_funcional', '9f518c4c-efbb-4958-b266-2658c98becb7', 'b7a8354f-9e7f-41a0-9e0a-744ce31d81e2'),
  (2, '18:45', 'lift',              '45112c1e-e937-407f-a864-2c71f57b7fbd', 'b7a8354f-9e7f-41a0-9e0a-744ce31d81e2'),
  -- Quarta (Running: HIIT & ABS / Lift for Girls: Glúteos & Abs)
  (3, '06:20', 'running_funcional', '251b602a-bd0d-4c1d-a22a-1660a3f32e1b', 'ab356190-1a09-42e3-a707-6023011b8ccd'),
  (3, '06:20', 'lift_for_girls',    '25e9a8dd-0142-46ce-95a9-ca0a37d40acb', '4e3c3c1e-711b-4902-b507-f52a80f4003d'),
  (3, '18:45', 'running_funcional', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb', 'ab356190-1a09-42e3-a707-6023011b8ccd'),
  (3, '18:45', 'lift_for_girls',    '38faf696-2fa8-436a-9033-222515f81f6b', '4e3c3c1e-711b-4902-b507-f52a80f4003d'),
  -- Quinta (Superiores)
  (4, '06:20', 'running_funcional', '9f518c4c-efbb-4958-b266-2658c98becb7', 'b7a8354f-9e7f-41a0-9e0a-744ce31d81e2'),
  (4, '06:20', 'lift',              '251b602a-bd0d-4c1d-a22a-1660a3f32e1b', 'b7a8354f-9e7f-41a0-9e0a-744ce31d81e2'),
  (4, '18:45', 'running_funcional', '9f518c4c-efbb-4958-b266-2658c98becb7', 'b7a8354f-9e7f-41a0-9e0a-744ce31d81e2'),
  (4, '18:45', 'lift',              '25e9a8dd-0142-46ce-95a9-ca0a37d40acb', 'b7a8354f-9e7f-41a0-9e0a-744ce31d81e2'),
  -- Sexta (Running: HIIT & Full Body / Lift: Inferiores)
  (5, '06:20', 'running_funcional', '25e9a8dd-0142-46ce-95a9-ca0a37d40acb', 'f461df3a-b280-4870-b733-470ff124f64d'),
  (5, '06:20', 'lift',              '38faf696-2fa8-436a-9033-222515f81f6b', '28f22984-be72-4518-a253-4736836e058d'),
  (5, '18:45', 'running_funcional', '9f518c4c-efbb-4958-b266-2658c98becb7', 'f461df3a-b280-4870-b733-470ff124f64d'),
  (5, '18:45', 'lift',              '38faf696-2fa8-436a-9033-222515f81f6b', '28f22984-be72-4518-a253-4736836e058d')
),
ins as (
  insert into club_aulas (unidade_id, tipo, grupo_muscular_id, coach_id, dia_semana, horario,
                          duracao_min, capacidade, so_mulheres, ativo)
  select '166a683d-5fe6-4177-8fd6-53deb70b428e', tipo, grupo::uuid, coach::uuid, dia, horario::time,
         50, case when tipo = 'running_funcional' then 30 else 24 end, tipo = 'lift_for_girls', true
  from novas
  returning id, dia_semana
)
insert into club_ocorrencias (aula_id, data, status)
select ins.id, d::date, 'ativa'
from ins
cross join generate_series('2026-11-03'::date, '2026-12-30'::date, interval '1 day') d
where extract(dow from d) = ins.dia_semana
  and d::date <> '2026-11-20';  -- feriado Consciência Negra (já tem aulas de feriado próprias)

commit;
