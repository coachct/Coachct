-- supabase/hibrido-virada-grade.sql
--
-- Virada da grade da JustClub Vila Olímpia: nos dias/horários fixos de Treino Híbrido,
-- a aula de Running Funcional sai e entra uma aula de Treino Híbrido (40 vagas, sem mapa).
--
-- NÃO RODAR antes do ok do Ricardo. Rodar DEPOIS de supabase/hibrido-fase2.sql e ANTES do deploy.
-- Antes de rodar: preencher a lista _slots (dia da semana 0=dom … 6=sáb, horário) e conferir
-- a decisão sobre as reservas que já existem (passo 3).
--
-- Mesmo padrão da virada de Pinheiros (pinheiros-grade-unificada-0311.sql): nada é apagado;
-- as ocorrências de Running a partir da data de início são canceladas (fila pausada antes),
-- os parceiros recebem a mudança pelos triggers de sync, e as novas aulas ganham ocorrências
-- nas mesmas datas em que o Running existia (respeita feriados já tratados).

begin;

-- ── 0) Parâmetros ────────────────────────────────────────────────────────────
create temp table _param on commit drop as
select '05eeab3e-5eae-4140-bc3a-1c1d56ac95be'::uuid as unidade,   -- JustClub Vila Olímpia
       '2026-11-29'::date                          as inicio,
       '2026-12-30'::date                          as fim;          -- mesmo horizonte das ocorrências atuais

create temp table _slots (dia int, horario time) on commit drop;
insert into _slots (dia, horario) values
  -- PREENCHER com os dias/horários de Treino Híbrido. Ex.: (0, '09:00'), (0, '10:00')
  (null, null);
delete from _slots where dia is null;

do $$ begin
  if (select count(*) from _slots) = 0 then
    raise exception 'Preencha _slots com os dias/horários de Treino Híbrido antes de rodar';
  end if;
end $$;

-- ── 1) Aulas de Running que saem nesses horários ─────────────────────────────
create temp table _running on commit drop as
select a.* from club_aulas a
join _slots s on s.dia = a.dia_semana and s.horario = a.horario
where a.unidade_id = (select unidade from _param)
  and a.tipo = 'running_funcional' and a.ativo and a.feriado_id is null;

do $$ begin
  if (select count(distinct (dia_semana, horario)) from _running) <> (select count(*) from _slots) then
    raise exception 'Algum horário de _slots não tem aula de Running ativa na Vila Olímpia';
  end if;
end $$;

create temp table _ocs on commit drop as
select o.id, o.data, a.dia_semana, a.horario
from club_ocorrencias o join _running a on a.id = o.aula_id
where o.data between (select inicio from _param) and (select fim from _param)
  and o.status <> 'cancelada';

-- ── 2) Aulas novas de Treino Híbrido (mesmo coach do Running) + ocorrências ───
create temp table _novas (id uuid, dia_semana int, horario time) on commit drop;
with ins as (
  insert into club_aulas (unidade_id, tipo, grupo_muscular_id, coach_id, dia_semana, horario,
                          duracao_min, capacidade, so_mulheres, ativo)
  select distinct on (r.dia_semana, r.horario)
         r.unidade_id, 'treino_hibrido', null, r.coach_id, r.dia_semana, r.horario,
         50, 40, false, true
  from _running r
  order by r.dia_semana, r.horario, r.created_at
  returning id, dia_semana, horario
)
insert into _novas select * from ins;

insert into club_ocorrencias (aula_id, data, status)
select distinct n.id, o.data, 'ativa'
from _novas n
join _ocs o on o.dia_semana = n.dia_semana and o.horario = n.horario;

-- ── 3) Reservas que já existem no Running dessas datas ───────────────────────
-- DECISÃO PENDENTE DO RICARDO. Padrão abaixo = o mesmo da virada de Pinheiros:
-- cancela e avisa por e-mail (1 por cliente). Alternativa: mover as reservas do site para a
-- aula de Híbrido do mesmo horário (sem posição) — avisar antes de rodar.
update club_ocorrencias set fila_pausada = true where id in (select id from _ocs);

insert into notificacoes_pendentes (cliente_id, tipo, canal, destino, mensagem, unidade_id)
select distinct on (r.cliente_id)
       r.cliente_id, 'aula_cancelada', 'email', c.email,
       'A sua reserva teve que ser cancelada por ajustes na grade, entre novamente e refaça caso o novo horario te atenda',
       (select unidade from _param)
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

-- As aulas de Running continuam ativas: ainda têm ocorrências antes de 29/11.
-- Depois de 29/11, desativar (ativo = false) para o "Replicar" da grade não recriar Running nesses horários:
--   update club_aulas set ativo = false where id in (<ids das aulas de Running desses horários>);

-- Conferência
select 'aulas novas' k, count(*) from _novas
union all select 'ocorrências novas', count(*) from club_ocorrencias where aula_id in (select id from _novas)
union all select 'ocorrências de Running canceladas', count(*) from _ocs;

commit;
