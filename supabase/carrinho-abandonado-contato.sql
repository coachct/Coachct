-- Contato manual do carrinho abandonado (botão do WhatsApp na tela do admin).
-- Aplicado no Supabase em 20/09/2026 (migration carrinho_contato_manual).
--
-- Quem manda a mensagem é uma pessoa da equipe, pelo WhatsApp dela: não passa
-- pela API da Meta, então não tem janela de 24h, template nem custo por
-- conversa. O que o sistema faz é registrar que alguém já falou com essa
-- pessoa sobre esse produto.
--
-- Esta é a versão VIGENTE de carrinhos_abandonados (substitui a que está em
-- carrinho-abandonado-email.sql).

create table if not exists public.carrinho_contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  canal text not null default 'whatsapp',
  feito_por uuid references public.perfis(id),
  criado_em timestamptz not null default now()
);

create unique index if not exists carrinho_contatos_cliente_produto_uidx
  on public.carrinho_contatos (cliente_id, produto_id);

alter table public.carrinho_contatos enable row level security;

-- Grava o contato. Quem fez vem do login, não do cliente: ninguém registra em
-- nome de outro. Clicar duas vezes não gera linha nova nem erro.
create or replace function public.registrar_contato_carrinho(
  p_cliente_id uuid,
  p_produto_id uuid,
  p_canal text default 'whatsapp'
)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quando timestamptz;
begin
  if not exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora')) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  insert into carrinho_contatos (cliente_id, produto_id, canal, feito_por)
  values (p_cliente_id, p_produto_id, coalesce(nullif(p_canal, ''), 'whatsapp'), auth.uid())
  on conflict (cliente_id, produto_id) do update
    set criado_em = now(), feito_por = auth.uid(), canal = excluded.canal
  returning criado_em into v_quando;

  return v_quando;
end;
$$;

revoke all on function public.registrar_contato_carrinho(uuid, uuid, text) from public, anon;
grant execute on function public.registrar_contato_carrinho(uuid, uuid, text) to authenticated;

-- A lista passa a mostrar quem já foi chamado no WhatsApp e por quem.
drop function if exists public.carrinhos_abandonados(int);

create function public.carrinhos_abandonados(p_dias int default 30)
returns table (
  visita_em timestamptz,
  cliente_id uuid,
  cliente_nome text,
  telefone text,
  produto_nome text,
  valor numeric,
  unidade_id uuid,
  unidade_nome text,
  etapa text,
  produto_id uuid,
  email_enviado_em timestamptz,
  contato_em timestamptz,
  contato_por text
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
    end,
    pr.id,
    ce.enviado_em,
    ct.criado_em,
    pf.nome
  from ultima u
  join clientes c on c.id = u.cliente_id
  join produtos pr on pr.id = u.produto_id
  left join unidades un on un.id = pr.unidade_id
  left join carrinho_emails ce
    on ce.cliente_id = u.cliente_id and ce.produto_id = u.produto_id
  left join carrinho_contatos ct
    on ct.cliente_id = u.cliente_id and ct.produto_id = u.produto_id
  left join perfis pf on pf.id = ct.feito_por
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

revoke all on function public.carrinhos_abandonados(int) from public, anon;
grant execute on function public.carrinhos_abandonados(int) to authenticated;
