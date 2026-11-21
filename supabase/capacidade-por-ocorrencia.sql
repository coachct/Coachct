-- Capacidade gravada em cada ocorrência (aula daquela data).
--
-- Antes a capacidade vivia só em club_aulas (a grade). Mudar o tamanho da sala
-- reescrevia o histórico: a Vila Olímpia passou de 26 para 20 posições em
-- 22/11/2026 e as aulas passadas viraram "24/20".
--
-- Agora club_ocorrencias.capacidade guarda a capacidade do dia. Relatórios leem
-- daqui; a trava de reserva e a conta de vagas ao vivo continuam em club_aulas.
-- Idempotente.

alter table public.club_ocorrencias add column if not exists capacidade integer;

-- Backfill: running da Vila Olímpia antes de 22/11/2026 tinha 26; o resto copia a grade.
update public.club_ocorrencias o
set capacidade = case
  when a.unidade_id = '05eeab3e-5eae-4140-bc3a-1c1d56ac95be'
   and a.tipo = 'running_funcional'
   and o.data < date '2026-11-22' then 26
  else a.capacidade
end
from public.club_aulas a
where a.id = o.aula_id and o.capacidade is null;

-- Ocorrência nova nasce com a capacidade da grade naquele momento.
create or replace function public.club_ocorrencia_preenche_capacidade()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.capacidade is null then
    select a.capacidade into new.capacidade from club_aulas a where a.id = new.aula_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_club_ocorrencia_capacidade on public.club_ocorrencias;
create trigger trg_club_ocorrencia_capacidade
  before insert on public.club_ocorrencias
  for each row execute function public.club_ocorrencia_preenche_capacidade();

-- Mudou a capacidade da grade: acompanha só de hoje em diante; o passado fica como foi.
create or replace function public.club_aula_capacidade_propaga()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update club_ocorrencias
  set capacidade = new.capacidade
  where aula_id = new.id
    and data >= (now() at time zone 'America/Sao_Paulo')::date;
  return null;
end $$;

drop trigger if exists trg_club_aula_capacidade_propaga on public.club_aulas;
create trigger trg_club_aula_capacidade_propaga
  after update of capacidade on public.club_aulas
  for each row when (old.capacidade is distinct from new.capacidade)
  execute function public.club_aula_capacidade_propaga();

-- Relatórios do banco passam a ler a capacidade da ocorrência.
do $$
declare
  v_def text; v_novo text;
  r record;
begin
  for r in
    select * from (values
      ('club_cancelamentos_analise', 'greatest(a.capacidade - ',       'greatest(coalesce(oc.capacidade, a.capacidade) - '),
      ('club_faturamento_aulas',     'as coach_id, a.capacidade',      'as coach_id, coalesce(o.capacidade, a.capacidade) as capacidade'),
      ('coach_ocupacao_historica',   'a.capacidade as capacidade',     'coalesce(oc.capacidade, a.capacidade) as capacidade')
    ) as t(nome, de, para)
  loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = r.nome;
    if position(r.para in v_def) > 0 then continue; end if;      -- já aplicado
    v_novo := replace(v_def, r.de, r.para);
    if v_novo = v_def then
      raise exception 'capacidade-por-ocorrencia: trecho não encontrado em %', r.nome;
    end if;
    execute v_novo;
  end loop;
end $$;
