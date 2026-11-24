-- supabase/hibrido-coach-treinos.sql (aplicado em 24/11/2026)
--
-- Running & Hybrid: 3 faixas (1 até 20, 2 = 21–32, 3 = 33+) e coaches subindo treinos.
-- Coach (perfis.role = 'coach') cria e edita só os próprios treinos (criado_por); não vê a
-- programação (datas). Admin/coordenadora continuam vendo e alocando todos.

update public.hibrido_programacao set faixa = 3 where faixa = 4;
update public.hibrido_treinos set faixa = 3 where faixa = 4;
alter table public.hibrido_treinos drop constraint if exists hibrido_treinos_faixa_check;
alter table public.hibrido_treinos add constraint hibrido_treinos_faixa_check check (faixa between 1 and 3);
alter table public.hibrido_programacao drop constraint if exists hibrido_programacao_faixa_check;
alter table public.hibrido_programacao add constraint hibrido_programacao_faixa_check check (faixa between 1 and 3);

create or replace function public.hibrido_eh_coach() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from perfis where id = auth.uid() and role = 'coach')
$$;
revoke all on function public.hibrido_eh_coach() from public, anon;
grant execute on function public.hibrido_eh_coach() to authenticated;

drop policy if exists hibrido_treinos_coach on public.hibrido_treinos;
create policy hibrido_treinos_coach on public.hibrido_treinos for all to authenticated
  using (hibrido_eh_coach() and criado_por = auth.uid())
  with check (hibrido_eh_coach() and criado_por = auth.uid() and modelo = false);

drop policy if exists hibrido_blocos_coach on public.hibrido_blocos;
create policy hibrido_blocos_coach on public.hibrido_blocos for all to authenticated
  using (hibrido_eh_coach() and exists (select 1 from hibrido_treinos t where t.id = treino_id and t.criado_por = auth.uid()))
  with check (hibrido_eh_coach() and exists (select 1 from hibrido_treinos t where t.id = treino_id and t.criado_por = auth.uid()));

drop policy if exists hibrido_estacoes_coach on public.hibrido_estacoes;
create policy hibrido_estacoes_coach on public.hibrido_estacoes for all to authenticated
  using (hibrido_eh_coach() and exists (select 1 from hibrido_blocos b join hibrido_treinos t on t.id = b.treino_id where b.id = bloco_id and t.criado_por = auth.uid()))
  with check (hibrido_eh_coach() and exists (select 1 from hibrido_blocos b join hibrido_treinos t on t.id = b.treino_id where b.id = bloco_id and t.criado_por = auth.uid()));

create index if not exists hibrido_treinos_criado_por_idx on public.hibrido_treinos (criado_por);
