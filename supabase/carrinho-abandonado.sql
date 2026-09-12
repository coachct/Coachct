-- Carrinho abandonado: cliente logado que abriu o checkout e não comprou em 1h.
-- Aplicado no Supabase em 12/09/2026 (migration carrinho_abandonado).

create table if not exists public.checkout_visitas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  criado_em timestamptz not null default now()
);

create index if not exists checkout_visitas_cliente_produto_idx
  on public.checkout_visitas (cliente_id, produto_id, criado_em desc);
create index if not exists checkout_visitas_criado_em_idx
  on public.checkout_visitas (criado_em desc);

-- Sem policies: grava e lê só pelas funções abaixo.
alter table public.checkout_visitas enable row level security;

-- Chamada pelo checkout. Identifica o cliente pelo login (ninguém grava em nome
-- de outro) e ignora recarregar a mesma página em 30 min.
create or replace function public.registrar_visita_checkout(p_produto_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cliente uuid;
begin
  select id into v_cliente from clientes where user_id = auth.uid();
  if v_cliente is null then return; end if;
  if not exists (select 1 from produtos where id = p_produto_id) then return; end if;

  if exists (
    select 1 from checkout_visitas
     where cliente_id = v_cliente and produto_id = p_produto_id
       and criado_em > now() - interval '30 minutes'
  ) then return; end if;

  insert into checkout_visitas (cliente_id, produto_id) values (v_cliente, p_produto_id);
end;
$$;

-- Lista do admin: última visita por cliente+produto, há mais de 1h, sem compra
-- depois dela. "Até onde chegou" vem do último pagamento tentado após a visita.
create or replace function public.carrinhos_abandonados(p_dias int default 30)
returns table (
  visita_em timestamptz,
  cliente_id uuid,
  cliente_nome text,
  telefone text,
  produto_nome text,
  valor numeric,
  unidade_id uuid,
  unidade_nome text,
  etapa text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  if not exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  return query
  with ultima as (
    select distinct on (v.cliente_id, v.produto_id) v.cliente_id, v.produto_id, v.criado_em
      from checkout_visitas v
     where v.criado_em > now() - make_interval(days => p_dias)
     order by v.cliente_id, v.produto_id, v.criado_em desc
  )
  select
    u.criado_em,
    c.id,
    c.nome,
    coalesce(nullif(c.telefone, ''), c.whatsapp),
    pr.nome,
    pr.valor,
    pr.unidade_id,
    un.nome,
    case
      when pg.status = 'falhou' then 'cartao_recusado'
      when pg.metodo_pagamento = 'pix' then 'pix_nao_pago'
      else 'abriu'
    end
  from ultima u
  join clientes c on c.id = u.cliente_id
  join produtos pr on pr.id = u.produto_id
  left join unidades un on un.id = pr.unidade_id
  left join lateral (
    select p.status, p.metodo_pagamento
      from pagamentos_pendentes p
     where p.cliente_id = u.cliente_id and p.produto_id = u.produto_id
       and p.excluido_em is null and p.created_at >= u.criado_em
     order by p.created_at desc
     limit 1
  ) pg on true
  where u.criado_em < now() - interval '1 hour'
    and not exists (
      select 1 from vendas v
       where v.cliente_id = u.cliente_id and v.produto_id = u.produto_id
         and v.excluido_em is null and v.vendido_em >= u.criado_em
    )
    and not exists (
      select 1 from pagamentos_pendentes p
       where p.cliente_id = u.cliente_id and p.produto_id = u.produto_id
         and p.status = 'pago' and p.created_at >= u.criado_em
    )
  order by u.criado_em desc;
end;
$$;

revoke all on function public.registrar_visita_checkout(uuid) from public, anon;
grant execute on function public.registrar_visita_checkout(uuid) to authenticated;
revoke all on function public.carrinhos_abandonados(int) from public, anon;
grant execute on function public.carrinhos_abandonados(int) to authenticated;
