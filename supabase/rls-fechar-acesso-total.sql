-- Fecha a policy "Service role acesso total" (USING true, para TODOS os papéis, inclusive anon)
-- em clientes, agendamentos, fila_espera e cliente_creditos. Aplicado 05/11/2026.
-- service_role ignora RLS: as rotas /api e libs de servidor não dependem dessas policies.

-- ── Etapa 2: regras novas (aditivas) ─────────────────────────────────────────
create or replace function public.eh_equipe()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and role in ('admin','recepcao','coordenadora'))
$$;
create or replace function public.eh_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and role = 'coach')
$$;
create or replace function public.meus_clientes_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from public.clientes where user_id = (select auth.uid())
$$;
revoke all on function public.eh_equipe(), public.eh_coach(), public.meus_clientes_ids() from public, anon;
grant execute on function public.eh_equipe(), public.eh_coach(), public.meus_clientes_ids() to authenticated;

-- clientes
create policy clientes_select_own   on public.clientes for select to authenticated using (user_id = (select auth.uid()));
create policy clientes_insert_own   on public.clientes for insert to authenticated with check (user_id = (select auth.uid()));
create policy clientes_update_own   on public.clientes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy clientes_coach_select on public.clientes for select to authenticated using (public.eh_coach());
create policy clientes_coach_insert on public.clientes for insert to authenticated with check (public.eh_coach());
create policy clientes_equipe_all   on public.clientes for all    to authenticated using (public.eh_equipe()) with check (public.eh_equipe());

-- Cliente editando o próprio cadastro não pode mexer em bloqueio, vínculo, créditos, pagamento e flags.
create or replace function public.clientes_protege_campos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null or public.eh_equipe() then return new; end if;
  new.user_id := old.user_id;
  new.bloqueado := old.bloqueado;
  new.motivo_bloqueio := old.motivo_bloqueio;
  new.agendamento_ct_bloqueado := old.agendamento_ct_bloqueado;
  new.agendamento_ct_bloqueado_em := old.agendamento_ct_bloqueado_em;
  new.agendamento_ct_bloqueado_por := old.agendamento_ct_bloqueado_por;
  new.is_classpass := old.is_classpass;
  new.creditos_avulso := old.creditos_avulso;
  new.plano := old.plano;
  new.planos := old.planos;
  new.credito_extra_teste := old.credito_extra_teste;
  new.credito_extra_teste_modo := old.credito_extra_teste_modo;
  new.pagarme_card_id := old.pagarme_card_id;
  new.pagarme_card_last4 := old.pagarme_card_last4;
  new.pagarme_card_brand := old.pagarme_card_brand;
  new.pagarme_customer_id := old.pagarme_customer_id;
  new.wellhub_id := old.wellhub_id;
  new.totalpass_id := old.totalpass_id;
  new.acompanhar := old.acompanhar;
  new.acompanhar_nota := old.acompanhar_nota;
  new.acompanhar_desde := old.acompanhar_desde;
  new.observacoes := old.observacoes;
  new.cadastrado_por := old.cadastrado_por;
  new.ativo := old.ativo;
  return new;
end $$;
drop trigger if exists trg_clientes_protege_campos on public.clientes;
create trigger trg_clientes_protege_campos before update on public.clientes
  for each row execute function public.clientes_protege_campos();

-- agendamentos: grade/ocupação de coach é lida por todos (visitante só vê colunas sem identificação)
create policy agendamentos_leitura_grade on public.agendamentos for select to anon, authenticated using (true);

-- fila_espera
create policy fila_cliente_own   on public.fila_espera for all    to authenticated using (cliente_id in (select public.meus_clientes_ids())) with check (cliente_id in (select public.meus_clientes_ids()));
create policy fila_equipe_all    on public.fila_espera for all    to authenticated using (public.eh_equipe()) with check (public.eh_equipe());
create policy fila_leitura_grade on public.fila_espera for select to anon, authenticated using (true);

-- ── Etapa 4: fechar ──────────────────────────────────────────────────────────
drop policy "Service role acesso total agendamentos" on public.agendamentos;
drop policy "Service role acesso total clientes"     on public.clientes;
drop policy "Service role acesso total fila"         on public.fila_espera;
drop policy "Service role acesso total creditos"     on public.cliente_creditos;

revoke all on public.clientes, public.agendamentos, public.fila_espera, public.cliente_creditos from anon;
grant select (data, horario, status, unidade_id, coach_id) on public.agendamentos to anon;
grant select (data, horario, status, unidade_id, ocorrencia_id) on public.fila_espera to anon;

-- Rollback de emergência (reabre como era):
-- create policy "Service role acesso total clientes" on public.clientes for all using (true) with check (true);
-- (idem para agendamentos / fila_espera / cliente_creditos) + grant all on <tabela> to anon;
