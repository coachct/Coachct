-- =============================================
-- CLUB — Faturamento por aula (ocorrência)
-- Idempotente. Aplicado via migration club_faturamento_aulas.
--
-- Valor de cada reserva PRESENTE ou FALTA (cancelada não entra):
--   Wellhub   presença → wellhub_presenca (R$ 0 se for a 1ª presença Wellhub do
--                         cliente em QUALQUER Club — só a partir de 01/07/2026,
--                         porque o histórico de reservas começa em 30/05/2026)
--             falta    → wellhub_falta_app se reservou pelo app; site = R$ 0
--   TotalPass presença → totalpass_presenca
--             falta    → totalpass_falta_app se reservou pelo app; site = R$ 0
--   ClassPass presença → classpass_presenca · falta → classpass_falta
--   Avulso/pacote/ilimitado (presença ou falta) → creditos_avulsos.valor_pago do
--             crédito usado (falta não devolve o crédito)
--   Migração (avulso_importado) → migracao_credito (null = sem valor definido)
--   + Multa no-show paga da reserva (venda direta; senão cobrança regularizada)
-- Custo da aula = coaches.adicional_por_aula do coach da ocorrência.
-- =============================================

create table if not exists public.club_valores_faturamento (
  chave text primary key,
  descricao text not null,
  valor numeric(10,2),                  -- null = ainda sem valor (entra como "sem valor")
  ordem int not null default 0,
  atualizado_em timestamptz not null default now()
);

alter table public.club_valores_faturamento enable row level security;

drop policy if exists "Admin e coordenadora veem valores faturamento club" on public.club_valores_faturamento;
create policy "Admin e coordenadora veem valores faturamento club" on public.club_valores_faturamento
  for select using (
    exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
  );

drop policy if exists "Admin edita valores faturamento club" on public.club_valores_faturamento;
create policy "Admin edita valores faturamento club" on public.club_valores_faturamento
  for update using (
    exists (select 1 from public.perfis where id = auth.uid() and role = 'admin')
  );

insert into public.club_valores_faturamento (chave, descricao, valor, ordem) values
  ('wellhub_presenca',        'Wellhub · presença',                                 32.00, 1),
  ('wellhub_primeira_visita', 'Wellhub · 1ª visita na rede',                         0.00, 2),
  ('wellhub_falta_app',       'Wellhub · falta com reserva pelo app',               22.40, 3),
  ('totalpass_presenca',      'TotalPass · presença',                               33.00, 4),
  ('totalpass_falta_app',     'TotalPass · falta com reserva pelo app',             33.00, 5),
  ('classpass_presenca',      'ClassPass · presença',                               25.00, 6),
  ('classpass_falta',         'ClassPass · falta',                                  25.00, 7),
  ('migracao_credito',        'Crédito da migração (sistema antigo) · presença ou falta', null, 8)
on conflict (chave) do nothing;

create or replace function public.club_faturamento_aulas(
  p_inicio date,
  p_fim date,
  p_unidade_id uuid default null
)
returns table (
  ocorrencia_id uuid,
  data date,
  horario time,
  dia_semana int,
  unidade_id uuid,
  unidade_nome text,
  tipo text,
  coach_id uuid,
  coach_nome text,
  custo_coach numeric,
  capacidade int,
  presentes int,
  faltas int,
  qtd_wellhub int,
  fat_wellhub numeric,
  primeiras_visitas int,
  qtd_totalpass int,
  fat_totalpass numeric,
  qtd_classpass int,
  fat_classpass numeric,
  qtd_creditos int,
  fat_creditos numeric,
  qtd_migracao int,
  fat_migracao numeric,
  qtd_multas int,
  fat_multas numeric,
  faturamento numeric,
  sem_valor int
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not exists (
    select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora')
  ) then
    raise exception 'sem_permissao';
  end if;

  return query
  with cfg as (
    select
      max(valor) filter (where chave = 'wellhub_presenca')        as wh_pres,
      max(valor) filter (where chave = 'wellhub_primeira_visita') as wh_primeira,
      max(valor) filter (where chave = 'wellhub_falta_app')       as wh_falta_app,
      max(valor) filter (where chave = 'totalpass_presenca')      as tp_pres,
      max(valor) filter (where chave = 'totalpass_falta_app')     as tp_falta_app,
      max(valor) filter (where chave = 'classpass_presenca')      as cp_pres,
      max(valor) filter (where chave = 'classpass_falta')         as cp_falta,
      max(valor) filter (where chave = 'migracao_credito')        as migracao
    from public.club_valores_faturamento
  ),
  ocs as (
    select o.id, o.data, a.horario, a.unidade_id, u.nome as unidade_nome, a.tipo,
           coalesce(o.coach_id, a.coach_id) as coach_id, a.capacidade
    from public.club_ocorrencias o
    join public.club_aulas a on a.id = o.aula_id
    join public.unidades u on u.id = a.unidade_id
    where o.status = 'ativa'
      and o.data between p_inicio and p_fim
      and (p_unidade_id is null or a.unidade_id = p_unidade_id)
  ),
  -- 1ª presença Wellhub de cada cliente em qualquer Club (histórico inteiro)
  primeira_wh as (
    select distinct on (r.cliente_id) r.id
    from public.club_reservas r
    join public.club_ocorrencias o on o.id = r.ocorrencia_id
    join public.club_aulas a on a.id = o.aula_id
    where r.status = 'presente'
      and r.tipo_credito like 'wellhub%'
      and r.cliente_id is not null
      and o.status = 'ativa'
    order by r.cliente_id, o.data, a.horario, r.created_at
  ),
  multa_venda as (
    select substring(v.observacao from 'reserva ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid as rid,
           sum(v.valor_total) as valor
    from public.vendas v
    where v.excluido_em is null
      and v.observacao like 'Multa No-Show JustClub — reserva %'
    group by 1
  ),
  multa_cobranca as (
    select substring(c.observacao from 'reserva_id: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid as rid,
           sum(c.valor) as valor
    from public.cobrancas_pendentes c
    where c.status = 'pago'
      and c.observacao like 'reserva_id: %'
    group by 1
  ),
  res as (
    select r.id, r.ocorrencia_id, r.status,
           case
             when r.tipo_credito like 'wellhub%'      then 'wellhub'
             when r.tipo_credito like 'totalpass%'    then 'totalpass'
             when r.tipo_credito = 'classpass'        then 'classpass'
             when r.tipo_credito = 'avulso_importado' then 'migracao'
             when r.tipo_credito like 'avulso%'       then 'creditos'
             else 'outro'
           end as origem,
           (coalesce(r.via_app, false) or r.tipo_credito in ('wellhub_app', 'totalpass_app')) as via_app,
           (pw.id is not null and ocs.data >= date '2026-07-01') as primeira,
           ca.valor_pago,
           coalesce(mv.valor, mc.valor, 0) as multa
    from public.club_reservas r
    join ocs on ocs.id = r.ocorrencia_id
    left join public.creditos_avulsos ca on ca.id = r.credito_avulso_id
    left join primeira_wh pw on pw.id = r.id
    left join multa_venda mv on mv.rid = r.id
    left join multa_cobranca mc on mc.rid = r.id
    where r.status in ('presente', 'falta')
  ),
  val as (
    select res.*,
      case
        when origem = 'wellhub'   and status = 'presente' then case when primeira then cfg.wh_primeira else cfg.wh_pres end
        when origem = 'wellhub'   and status = 'falta'    then case when via_app then cfg.wh_falta_app else 0 end
        when origem = 'totalpass' and status = 'presente' then cfg.tp_pres
        when origem = 'totalpass' and status = 'falta'    then case when via_app then cfg.tp_falta_app else 0 end
        when origem = 'classpass' and status = 'presente' then cfg.cp_pres
        when origem = 'classpass' and status = 'falta'    then cfg.cp_falta
        when origem = 'creditos'                          then res.valor_pago
        when origem = 'migracao'                          then cfg.migracao
        else null
      end as valor
    from res cross join cfg
  )
  select
    ocs.id,
    ocs.data,
    ocs.horario,
    extract(dow from ocs.data)::int,
    ocs.unidade_id,
    ocs.unidade_nome,
    ocs.tipo,
    ocs.coach_id,
    co.nome,
    coalesce(co.adicional_por_aula, 0),
    ocs.capacidade,
    (count(v.id) filter (where v.status = 'presente'))::int,
    (count(v.id) filter (where v.status = 'falta'))::int,
    (count(v.id) filter (where v.origem = 'wellhub'))::int,
    coalesce(sum(v.valor) filter (where v.origem = 'wellhub'), 0),
    (count(v.id) filter (where v.primeira and v.status = 'presente'))::int,
    (count(v.id) filter (where v.origem = 'totalpass'))::int,
    coalesce(sum(v.valor) filter (where v.origem = 'totalpass'), 0),
    (count(v.id) filter (where v.origem = 'classpass'))::int,
    coalesce(sum(v.valor) filter (where v.origem = 'classpass'), 0),
    (count(v.id) filter (where v.origem = 'creditos'))::int,
    coalesce(sum(v.valor) filter (where v.origem = 'creditos'), 0),
    (count(v.id) filter (where v.origem = 'migracao'))::int,
    coalesce(sum(v.valor) filter (where v.origem = 'migracao'), 0),
    (count(v.id) filter (where v.multa > 0))::int,
    coalesce(sum(v.multa), 0),
    coalesce(sum(v.valor), 0) + coalesce(sum(v.multa), 0),
    (count(v.id) filter (where v.valor is null))::int
  from ocs
  left join val v on v.ocorrencia_id = ocs.id
  left join public.coaches co on co.id = ocs.coach_id
  group by ocs.id, ocs.data, ocs.horario, ocs.unidade_id, ocs.unidade_nome, ocs.tipo,
           ocs.coach_id, co.nome, co.adicional_por_aula, ocs.capacidade;
end;
$$;
