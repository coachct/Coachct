-- Trava NO BANCO (16/11/2026): presença de Coach CT AVULSO sem acesso ao CT no dia é recusada,
-- venha de qualquer tela (inclusive aba antiga aberta antes do deploy — caso Marja 15/11).
-- Acesso = walk-in lançado (acessos_livres_ct) OU check-in Wellhub/TotalPass na unidade no dia.
-- Passam sem conferência:
--   * admin (role 'admin') — pode forçar;
--   * chamadas de backend sem usuário logado (auth.uid() nulo: webhooks/cron/service role);
--   * presença vinda do check-in do app (presenca_checkin = true — o check-in já é o acesso).
-- À prova de falha: se a CONFERÊNCIA der erro, deixa passar (nunca trava por bug).
-- Só pega tipo_credito 'avulso%' (Coach CT Avulso). Pro/Wellhub/TotalPass não são afetados.

-- 1) Conferência interna por agendamento (sem guarda de role; não exposta ao cliente).
create or replace function public._coach_ct_avulso_acesso(p_agendamento uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with g as (
    select a.id, a.cliente_id, a.data, a.unidade_id,
           nullif(regexp_replace(coalesce(c.cpf,''), '\D', '', 'g'), '') as cpf,
           nullif(lower(trim(coalesce(c.email,''))), '') as email,
           nullif(lower(trim(coalesce(c.wellhub_email,''))), '') as wemail,
           nullif(c.wellhub_id, '') as wellhub_id
      from agendamentos a join clientes c on c.id = a.cliente_id
     where a.id = p_agendamento
  )
  select coalesce(
    (select 'Walk-in lançado'::text from acessos_livres_ct l, g
      where l.cliente_id = g.cliente_id and l.data = g.data and l.cancelado_em is null limit 1),
    (select (case e.origem when 'wellhub' then 'Check-in Wellhub' when 'totalpass' then 'Check-in TotalPass' else 'Check-in app' end)::text
       from entradas_walkin e, g
      where e.unidade_id = g.unidade_id
        and e.recebido_em >= (g.data::timestamp at time zone 'America/Sao_Paulo')
        and e.recebido_em <  ((g.data + 1)::timestamp at time zone 'America/Sao_Paulo')
        and e.status in ('validado','observado')
        and ( e.cliente_id = g.cliente_id
           or e.coach_ct_agendamento_id = g.id
           or (g.cpf is not null and nullif(regexp_replace(coalesce(e.raw->'user'->>'document_number',''), '\D', '', 'g'), '') = g.cpf)
           or (lower(trim(coalesce(e.raw->'user'->>'email', e.raw->'event_data'->'user'->>'email', ''))) in (g.email, g.wemail))
           or (g.wellhub_id is not null and e.id_externo = g.wellhub_id))
      limit 1)
  );
$$;
revoke all on function public._coach_ct_avulso_acesso(uuid) from public, anon, authenticated;

-- 2) Trigger BEFORE UPDATE OF status.
create or replace function public.barrar_presenca_avulso_sem_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso text;
begin
  if new.status <> 'realizado' or old.status = 'realizado' then return new; end if;
  if coalesce(new.tipo_credito, '') not like 'avulso%' then return new; end if;
  if coalesce(new.presenca_checkin, false) then return new; end if;
  if auth.uid() is null then return new; end if;
  if exists (select 1 from perfis where id = auth.uid() and role = 'admin') then return new; end if;

  begin
    v_acesso := public._coach_ct_avulso_acesso(new.id);
  exception when others then
    return new;  -- conferência falhou: não trava
  end;

  if v_acesso is null then
    raise exception 'COACH_CT_AVULSO_SEM_ACESSO: Coach CT avulso paga só o coach. Lance o walk-in ou peça o check-in do app antes da presença.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists on_agendamento_avulso_exige_acesso on public.agendamentos;
create trigger on_agendamento_avulso_exige_acesso
  before update of status on public.agendamentos
  for each row execute function public.barrar_presenca_avulso_sem_acesso();
