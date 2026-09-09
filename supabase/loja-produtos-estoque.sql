-- ============================================================
-- LOJA — venda de bebidas / comida nas unidades, com estoque.
--
-- Modulo ISOLADO de proposito: nao encosta em produtos, vendas
-- nem em registrar_venda. O motor de credito/plano continua
-- exatamente como esta.
--
-- Estoque = soma dos movimentos (entrada +, venda -, perda -,
-- ajuste +/-, estorno +). Nao existe coluna "saldo" guardada:
-- o saldo e sempre derivado, entao nunca fica dessincronizado.
-- ============================================================

-- ---------- PRODUTOS ----------
create table if not exists loja_produtos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  categoria   text not null default 'bebida' check (categoria in ('bebida','comida','outro')),
  preco       numeric(10,2) not null check (preco >= 0),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references perfis(id)
);

-- Dois produtos ativos com o mesmo nome so confundem o balcao.
create unique index if not exists loja_produtos_nome_ativo_unico
  on loja_produtos (lower(nome)) where ativo;

-- ---------- VENDAS ----------
create table if not exists loja_vendas (
  id              uuid primary key default gen_random_uuid(),
  unidade_id      uuid not null references unidades(id),
  valor_total     numeric(10,2) not null check (valor_total >= 0),
  forma_pagamento text not null,
  observacao      text,
  vendido_por     uuid references perfis(id),
  vendido_em      timestamptz not null default now(),
  excluido_em     timestamptz,
  excluido_por    uuid references perfis(id)
);

create index if not exists loja_vendas_unidade_data_idx
  on loja_vendas (unidade_id, vendido_em desc);

create table if not exists loja_venda_itens (
  id             uuid primary key default gen_random_uuid(),
  venda_id       uuid not null references loja_vendas(id) on delete cascade,
  produto_id     uuid not null references loja_produtos(id),
  quantidade     integer not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null check (preco_unitario >= 0),
  subtotal       numeric(10,2) not null check (subtotal >= 0)
);

create index if not exists loja_venda_itens_venda_idx   on loja_venda_itens (venda_id);
create index if not exists loja_venda_itens_produto_idx on loja_venda_itens (produto_id);

-- ---------- MOVIMENTOS DE ESTOQUE ----------
create table if not exists loja_estoque_movimentos (
  id         uuid primary key default gen_random_uuid(),
  produto_id uuid not null references loja_produtos(id),
  unidade_id uuid not null references unidades(id),
  tipo       text not null check (tipo in ('entrada','venda','perda','ajuste','estorno')),
  -- assinado: positivo entra no estoque, negativo sai.
  quantidade integer not null check (quantidade <> 0),
  motivo     text,
  venda_id   uuid references loja_vendas(id) on delete set null,
  criado_por uuid references perfis(id),
  criado_em  timestamptz not null default now()
);

create index if not exists loja_mov_produto_unidade_idx
  on loja_estoque_movimentos (produto_id, unidade_id);
create index if not exists loja_mov_unidade_data_idx
  on loja_estoque_movimentos (unidade_id, criado_em desc);

-- ---------- SALDO ATUAL ----------
create or replace view loja_estoque_atual
with (security_invoker = on) as
select
  p.id as produto_id,
  u.id as unidade_id,
  coalesce(sum(m.quantidade), 0)::int as saldo
from loja_produtos p
cross join unidades u
left join loja_estoque_movimentos m
       on m.produto_id = p.id and m.unidade_id = u.id
where u.ativo
group by p.id, u.id;

-- ============================================================
-- RLS
-- ============================================================
alter table loja_produtos           enable row level security;
alter table loja_vendas             enable row level security;
alter table loja_venda_itens        enable row level security;
alter table loja_estoque_movimentos enable row level security;

-- Equipe le; admin/coordenadora gerenciam. Aluno nao ve nada disso.
drop policy if exists loja_produtos_equipe_select on loja_produtos;
create policy loja_produtos_equipe_select on loja_produtos for select
  using (exists (select 1 from perfis
                  where perfis.id = auth.uid()
                    and perfis.role = any (array['admin','recepcao','coordenadora'])));

drop policy if exists loja_produtos_admin_all on loja_produtos;
create policy loja_produtos_admin_all on loja_produtos for all
  using (exists (select 1 from perfis
                  where perfis.id = auth.uid()
                    and perfis.role = any (array['admin','coordenadora'])))
  with check (exists (select 1 from perfis
                  where perfis.id = auth.uid()
                    and perfis.role = any (array['admin','coordenadora'])));

drop policy if exists loja_mov_equipe_select on loja_estoque_movimentos;
create policy loja_mov_equipe_select on loja_estoque_movimentos for select
  using (exists (select 1 from perfis
                  where perfis.id = auth.uid()
                    and perfis.role = any (array['admin','recepcao','coordenadora'])));

-- Entrada / perda / ajuste sao lancados no admin. Venda entra pela RPC.
drop policy if exists loja_mov_admin_insert on loja_estoque_movimentos;
create policy loja_mov_admin_insert on loja_estoque_movimentos for insert
  with check (exists (select 1 from perfis
                  where perfis.id = auth.uid()
                    and perfis.role = any (array['admin','coordenadora'])));

drop policy if exists loja_vendas_equipe_select on loja_vendas;
create policy loja_vendas_equipe_select on loja_vendas for select
  using (exists (select 1 from perfis
                  where perfis.id = auth.uid()
                    and perfis.role = any (array['admin','recepcao','coordenadora'])));

drop policy if exists loja_itens_equipe_select on loja_venda_itens;
create policy loja_itens_equipe_select on loja_venda_itens for select
  using (exists (select 1 from perfis
                  where perfis.id = auth.uid()
                    and perfis.role = any (array['admin','recepcao','coordenadora'])));

-- ============================================================
-- RPC: registrar venda (carrinho)
--
-- p_itens: [{"produto_id":"uuid","quantidade":2}, ...]
-- O preco NUNCA vem da tela: e sempre o preco do banco.
-- ============================================================
create or replace function loja_registrar_venda(
  p_unidade_id      uuid,
  p_itens           jsonb,
  p_forma_pagamento text,
  p_vendido_por     uuid,
  p_observacao      text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_item        jsonb;
  v_produto     record;
  v_qtd         int;
  v_saldo       int;
  v_venda_id    uuid;
  v_total       numeric(10,2) := 0;
  v_qtd_itens   int;
begin
  if p_unidade_id is null then
    return jsonb_build_object('sucesso', false, 'motivo', 'unidade_obrigatoria');
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('sucesso', false, 'motivo', 'carrinho_vazio');
  end if;

  if coalesce(trim(p_forma_pagamento), '') = '' then
    return jsonb_build_object('sucesso', false, 'motivo', 'forma_pagamento_obrigatoria');
  end if;

  -- Serializa as vendas da mesma unidade: duas recepcoes vendendo a
  -- ultima agua ao mesmo tempo nao podem furar o estoque.
  perform pg_advisory_xact_lock(hashtext('loja:' || p_unidade_id::text));

  -- Passada 1: valida tudo antes de gravar qualquer coisa.
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_item->>'quantidade')::int, 0);

    if v_qtd < 1 then
      return jsonb_build_object('sucesso', false, 'motivo', 'quantidade_invalida');
    end if;

    select * into v_produto
      from loja_produtos
     where id = (v_item->>'produto_id')::uuid and ativo = true;

    if v_produto is null then
      return jsonb_build_object('sucesso', false, 'motivo', 'produto_nao_encontrado_ou_inativo');
    end if;

    select coalesce(sum(quantidade), 0)::int into v_saldo
      from loja_estoque_movimentos
     where produto_id = v_produto.id and unidade_id = p_unidade_id;

    if v_saldo < v_qtd then
      return jsonb_build_object(
        'sucesso', false, 'motivo', 'estoque_insuficiente',
        'produto', v_produto.nome, 'saldo', v_saldo, 'pedido', v_qtd
      );
    end if;

    v_total := v_total + (v_produto.preco * v_qtd);
  end loop;

  insert into loja_vendas (unidade_id, valor_total, forma_pagamento, observacao, vendido_por)
  values (p_unidade_id, v_total, trim(p_forma_pagamento), nullif(trim(p_observacao), ''), p_vendido_por)
  returning id into v_venda_id;

  -- Passada 2: grava itens e baixa o estoque.
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::int;

    select * into v_produto
      from loja_produtos
     where id = (v_item->>'produto_id')::uuid;

    insert into loja_venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
    values (v_venda_id, v_produto.id, v_qtd, v_produto.preco, v_produto.preco * v_qtd);

    insert into loja_estoque_movimentos
      (produto_id, unidade_id, tipo, quantidade, motivo, venda_id, criado_por)
    values
      (v_produto.id, p_unidade_id, 'venda', -v_qtd, 'Venda no balcao', v_venda_id, p_vendido_por);
  end loop;

  select count(*) into v_qtd_itens from loja_venda_itens where venda_id = v_venda_id;

  return jsonb_build_object(
    'sucesso', true, 'venda_id', v_venda_id,
    'valor_total', v_total, 'itens', v_qtd_itens
  );
end;
$$;

-- ============================================================
-- RPC: cancelar venda — devolve o estoque.
-- ============================================================
create or replace function loja_cancelar_venda(
  p_venda_id uuid,
  p_por      uuid,
  p_motivo   text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_venda record;
  v_item  record;
begin
  select * into v_venda from loja_vendas where id = p_venda_id for update;

  if v_venda is null then
    return jsonb_build_object('sucesso', false, 'motivo', 'venda_nao_encontrada');
  end if;

  if v_venda.excluido_em is not null then
    return jsonb_build_object('sucesso', false, 'motivo', 'venda_ja_cancelada');
  end if;

  for v_item in select * from loja_venda_itens where venda_id = p_venda_id loop
    insert into loja_estoque_movimentos
      (produto_id, unidade_id, tipo, quantidade, motivo, venda_id, criado_por)
    values
      (v_item.produto_id, v_venda.unidade_id, 'estorno', v_item.quantidade,
       coalesce(nullif(trim(p_motivo), ''), 'Venda cancelada'), p_venda_id, p_por);
  end loop;

  update loja_vendas
     set excluido_em = now(), excluido_por = p_por
   where id = p_venda_id;

  return jsonb_build_object('sucesso', true, 'venda_id', p_venda_id);
end;
$$;

grant execute on function loja_registrar_venda(uuid, jsonb, text, uuid, text) to authenticated;
grant execute on function loja_cancelar_venda(uuid, uuid, text)              to authenticated;
