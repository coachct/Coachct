-- Encerramento de contrato do coach (APLICADO EM PRODUÇÃO — 17/09/2026)
--
-- A partir de coaches.data_saida (exclusive), a grade do coach não sobe mais e as
-- horas de sala não contam no Pagamento de Coaches.
--
-- Em vez de tocar nas 6 telas que montam a grade (/agendar, admin/agenda,
-- recepcao/agenda, totem, admin/escala, escala-club), reusa o mecanismo de
-- coach_ferias, que todas elas já respeitam e que já zera horas no cálculo.
-- Um trigger espelha a data de saída num período de ausência com origem='encerramento'.

alter table coaches add column if not exists data_saida date;

-- 'manual' = férias/atestado lançados na mão; 'encerramento' = gerado pela data de saída.
alter table coach_ferias add column if not exists origem text not null default 'manual';

create unique index if not exists coach_ferias_encerramento_unico
  on coach_ferias (coach_id) where origem = 'encerramento';

create or replace function sync_coach_encerramento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- À prova de falha: qualquer erro aqui não pode derrubar o cadastro do coach.
  begin
    if new.data_saida is null then
      delete from coach_ferias where coach_id = new.id and origem = 'encerramento';
    else
      delete from coach_ferias where coach_id = new.id and origem = 'encerramento';
      insert into coach_ferias (coach_id, data_inicio, data_fim, motivo, origem)
      values (new.id, new.data_saida + 1, date '2099-12-31', 'Encerramento de contrato', 'encerramento');
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_sync_coach_encerramento on coaches;
create trigger trg_sync_coach_encerramento
  after insert or update of data_saida on coaches
  for each row execute function sync_coach_encerramento();
