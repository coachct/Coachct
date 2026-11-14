-- Coach CT avulso exige ACESSO ao CT no mesmo dia (14/11/2026).
-- O crédito "Coach CT Avulso" paga só o coach. O acesso vem de:
--   (a) walk-in lançado na Musculação Livre (acessos_livres_ct, baixa crédito de treino), OU
--   (b) check-in do Wellhub/TotalPass na unidade no dia (entradas_walkin, qualquer modalidade).
-- Esta RPC só LÊ: devolve, para cada agendamento avulso do dia, o acesso encontrado
-- (null = sem acesso). A tela da agenda usa isso para travar a presença.
-- Casamento do check-in de app (cliente_id costuma vir nulo): cliente_id → agendamento
-- vinculado → CPF (TotalPass) → e-mail/wellhub_email → wellhub_id. Poucos avulsos por dia,
-- e a busca em entradas_walkin usa o índice (unidade_id, recebido_em).

create or replace function public.coach_ct_avulso_acesso_do_dia(p_data date, p_unidade uuid)
returns table(agendamento_id uuid, acesso text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from perfis where id = auth.uid() and role in ('admin','coordenadora','recepcao')) then
    raise exception 'sem permissao';
  end if;

  return query
  with ags as (
    select a.id, a.cliente_id,
           nullif(regexp_replace(coalesce(c.cpf,''), '\D', '', 'g'), '') as cpf,
           nullif(lower(trim(coalesce(c.email,''))), '') as email,
           nullif(lower(trim(coalesce(c.wellhub_email,''))), '') as wemail,
           nullif(c.wellhub_id, '') as wellhub_id
      from agendamentos a
      join clientes c on c.id = a.cliente_id
     where a.data = p_data
       and a.unidade_id = p_unidade
       and a.tipo_credito like 'avulso%'
       and a.status <> 'cancelado'
  ),
  ent as (
    select e.id, e.origem, e.cliente_id, e.coach_ct_agendamento_id, e.id_externo, e.produto,
           nullif(regexp_replace(coalesce(e.raw->'user'->>'document_number',''), '\D', '', 'g'), '') as cpf,
           nullif(lower(trim(coalesce(e.raw->'user'->>'email', e.raw->'event_data'->'user'->>'email', ''))), '') as email
      from entradas_walkin e
     where e.unidade_id = p_unidade
       and e.recebido_em >= (p_data::timestamp at time zone 'America/Sao_Paulo')
       and e.recebido_em <  ((p_data + 1)::timestamp at time zone 'America/Sao_Paulo')
       and e.status in ('validado','observado')
  )
  select g.id,
         coalesce(
           (select 'Walk-in lançado'
              from acessos_livres_ct l
             where l.cliente_id = g.cliente_id and l.data = p_data and l.cancelado_em is null
             limit 1),
           (select case n.origem when 'wellhub' then 'Check-in Wellhub' when 'totalpass' then 'Check-in TotalPass' else 'Check-in app' end
              from ent n
             where n.cliente_id = g.cliente_id
                or n.coach_ct_agendamento_id = g.id
                or (g.cpf is not null and n.cpf = g.cpf)
                or (n.email is not null and n.email in (g.email, g.wemail))
                or (g.wellhub_id is not null and n.id_externo = g.wellhub_id)
             limit 1)
         )
    from ags g;
end;
$$;

revoke all on function public.coach_ct_avulso_acesso_do_dia(date, uuid) from public, anon;
grant execute on function public.coach_ct_avulso_acesso_do_dia(date, uuid) to authenticated;
