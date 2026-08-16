-- unificar_clientes v5 — versão curta (o paste da v4 truncava no SQL Editor).
-- Mesma lógica da v4: lista de tabelas vinda do catálogo (views fora),
-- consolida plano e pote de créditos, move linha a linha em caso de índice
-- único, tabelas de dinheiro nunca são apagadas. O que mudou: o preenchimento
-- dos campos vazios do cadastro que fica agora é genérico (jsonb), em 5 linhas
-- em vez de 18 colunas escritas na mão — e cobre coluna nova automaticamente.

alter table public.clientes_unificacoes
  add column if not exists consolidados jsonb not null default '[]'::jsonb;

create or replace function public.unificar_clientes(p_manter uuid, p_remover uuid, p_feito_por uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.clientes%rowtype; r public.clientes%rowtype;
  mov jsonb := '{}'; cons jsonb := '[]'; patch jsonb; cols text;
  n int; ok int; ids text[]; i text; j jsonb; fk record;
  pl public.cliente_planos%rowtype; cr public.cliente_creditos%rowtype;
  prot text[] := array['vendas','creditos_avulsos','cobrancas_pendentes','pagamentos_pendentes','assinaturas_ilimitado_club'];
begin
  if p_manter is null or p_remover is null or p_manter = p_remover then
    raise exception 'Cadastros inválidos para unificação.';
  end if;
  select * into m from public.clientes where id = p_manter for update;
  if not found then raise exception 'Cadastro a manter não encontrado.'; end if;
  select * into r from public.clientes where id = p_remover for update;
  if not found then raise exception 'Cadastro duplicado não encontrado.'; end if;

  -- mesmo plano nos dois → uma linha
  for pl in select d.* from public.cliente_planos d where d.cliente_id = p_remover
    and exists (select 1 from public.cliente_planos x where x.cliente_id = p_manter and x.plano_id = d.plano_id)
  loop
    update public.cliente_planos x set
      ativo = coalesce(x.ativo,false) or coalesce(pl.ativo,false),
      inicio = least(x.inicio, pl.inicio),
      fim = case when x.fim is null or pl.fim is null then null else greatest(x.fim, pl.fim) end,
      contrato_aceito_em = coalesce(x.contrato_aceito_em, pl.contrato_aceito_em),
      produto_id = coalesce(x.produto_id, pl.produto_id),
      venda_id = coalesce(x.venda_id, pl.venda_id)
    where x.cliente_id = p_manter and x.plano_id = pl.plano_id;
    cons := cons || jsonb_build_object('tabela','cliente_planos','linha',to_jsonb(pl));
    delete from public.cliente_planos where id = pl.id;
  end loop;

  -- mesmo pote de créditos (tipo+mês+ano+unidade) → uma linha; total = maior, usado = soma
  for cr in select d.* from public.cliente_creditos d where d.cliente_id = p_remover
    and exists (select 1 from public.cliente_creditos x where x.cliente_id = p_manter
      and x.tipo is not distinct from d.tipo and x.mes is not distinct from d.mes
      and x.ano is not distinct from d.ano and x.unidade_id is not distinct from d.unidade_id)
  loop
    update public.cliente_creditos x set
      total = greatest(coalesce(x.total,0), coalesce(cr.total,0)),
      usado = coalesce(x.usado,0) + coalesce(cr.usado,0)
    where x.cliente_id = p_manter and x.tipo is not distinct from cr.tipo
      and x.mes is not distinct from cr.mes and x.ano is not distinct from cr.ano
      and x.unidade_id is not distinct from cr.unidade_id;
    cons := cons || jsonb_build_object('tabela','cliente_creditos','linha',to_jsonb(cr));
    delete from public.cliente_creditos where id = cr.id;
  end loop;

  -- move o histórico: toda tabela real com FK para clientes (views fora)
  for fk in
    select c.relname::text tabela, a.attname::text coluna
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f' and con.confrelid = 'public.clientes'::regclass
       and ns.nspname = 'public' and c.relkind in ('r','p') and array_length(con.conkey,1) = 1
     order by c.relname
  loop
    begin
      execute format('update public.%I set %I = $1 where %I = $2', fk.tabela, fk.coluna, fk.coluna) using p_manter, p_remover;
      get diagnostics n = row_count;
      if n > 0 then mov := mov || jsonb_build_object(fk.tabela, n); end if;
    exception when unique_violation then
      if fk.tabela = any(prot) then
        raise exception 'Conflito na tabela "%" (dinheiro/histórico fiscal): não posso unir sozinho. Resolva manualmente antes.', fk.tabela;
      end if;
      execute format('select array_agg(id::text) from public.%I where %I = $1', fk.tabela, fk.coluna) into ids using p_remover;
      ok := 0;
      foreach i in array coalesce(ids, array[]::text[]) loop
        begin
          execute format('update public.%I set %I = $1 where id::text = $2', fk.tabela, fk.coluna) using p_manter, i;
          ok := ok + 1;
        exception when unique_violation then
          execute format('select to_jsonb(t) from public.%I t where t.id::text = $1', fk.tabela) into j using i;
          cons := cons || jsonb_build_object('tabela', fk.tabela, 'linha', j);
          execute format('delete from public.%I where id::text = $1', fk.tabela) using i;
        end;
      end loop;
      if ok > 0 then mov := mov || jsonb_build_object(fk.tabela, ok); end if;
    end;
  end loop;

  insert into public.clientes_unificacoes (cliente_mantido, cliente_removido, snapshot_removido, movidos, consolidados, feito_por)
  values (p_manter, p_remover, to_jsonb(r), mov, cons, p_feito_por);

  delete from public.clientes where id = p_remover;

  -- só o que estiver vazio no cadastro que fica é preenchido com o do duplicado
  select jsonb_object_agg(k, v) into patch
    from jsonb_each(to_jsonb(r)) e(k, v)
   where k <> 'id' and v not in ('null'::jsonb, '""'::jsonb)
     and coalesce(to_jsonb(m)->k, 'null'::jsonb) in ('null'::jsonb, '""'::jsonb);
  patch := coalesce(patch, '{}'::jsonb) || jsonb_build_object('atualizado_em', now());
  select string_agg(quote_ident(k), ',') into cols from jsonb_object_keys(patch) k;
  execute format('update public.clientes set (%s) = (select %s from jsonb_populate_record(null::public.clientes, $1)) where id = $2', cols, cols)
    using patch, p_manter;

  return jsonb_build_object('ok', true, 'movidos', mov, 'consolidados', jsonb_array_length(cons),
    'cliente', (select to_jsonb(c) from public.clientes c where c.id = p_manter));
end $$;

revoke execute on function public.unificar_clientes(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.unificar_clientes(uuid,uuid,uuid) to service_role;
