-- E-mail de resgate do carrinho abandonado.
-- Aplicado no Supabase em 20/09/2026 (migrations carrinho_abandonado_email,
-- carrinho_abandonado_email_guarda_role e carrinhos_abandonados_com_email_v2).
--
-- Desenho igual ao do feedback de estreia: a RPC devolve os candidatos com as
-- flags de supressão, o route decide, grava e manda. O registro próprio
-- (carrinho_emails) é o que garante que ninguém é cutucado duas vezes.

create table if not exists public.carrinho_emails (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  disparo_id uuid references public.email_disparos(id) on delete set null,
  token text not null,
  etapa text not null,
  visita_em timestamptz not null,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

create unique index if not exists carrinho_emails_cliente_produto_uidx
  on public.carrinho_emails (cliente_id, produto_id);
create index if not exists carrinho_emails_cliente_idx
  on public.carrinho_emails (cliente_id, criado_em desc);

-- Sem policies: só service role e as funções abaixo.
alter table public.carrinho_emails enable row level security;

-- Candidatos ao e-mail. Janela em HORAS: carrinho de 20 dias atrás não recebe
-- "esqueceu algo?" — isso é spam, não resgate.
create or replace function public.carrinhos_abandonados_email(
  p_horas_min int default 1,
  p_horas_max int default 48
)
returns table (
  visita_em timestamptz,
  cliente_id uuid,
  cliente_nome text,
  email text,
  telefone text,
  produto_id uuid,
  produto_nome text,
  valor numeric,
  unidade_nome text,
  etapa text,
  ja_recebeu boolean,
  descadastrado boolean,
  bloqueado boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  -- Esconder o botão não tranca a API: a guarda é aqui. O cron chega como
  -- service_role; o SQL editor, como postgres.
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('service_role', 'postgres')
     and not exists (select 1 from perfis where id = auth.uid() and role in ('admin', 'coordenadora'))
  then
    raise exception 'NAO_AUTORIZADO';
  end if;

  return query
  with ultima as (
    select distinct on (v.cliente_id, v.produto_id) v.cliente_id, v.produto_id, v.criado_em
      from checkout_visitas v
     where v.criado_em > now() - make_interval(hours => p_horas_max)
     order by v.cliente_id, v.produto_id, v.criado_em desc
  )
  select
    u.criado_em,
    c.id,
    c.nome,
    c.email,
    coalesce(nullif(c.telefone, ''), c.whatsapp),
    pr.id,
    pr.nome,
    pr.valor,
    un.nome,
    case
      when pg.status = 'falhou' then 'cartao_recusado'
      when pg.metodo_pagamento = 'pix' then 'pix_nao_pago'
      else 'abriu'
    end,
    exists (select 1 from carrinho_emails ce where ce.cliente_id = c.id),
    c.marketing_descadastro_em is not null,
    coalesce(c.bloqueado, false)
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
  where u.criado_em < now() - make_interval(hours => p_horas_min)
    -- Produto desativado não vira e-mail: ninguém convida pra comprar o que saiu do ar.
    and coalesce(pr.ativo, true)
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

revoke all on function public.carrinhos_abandonados_email(int, int) from public, anon;
grant execute on function public.carrinhos_abandonados_email(int, int) to authenticated, service_role;

-- Campanha do disparo. Nasce PAUSADA: só passa a 'recorrente' quando o texto
-- estiver aprovado. Achada pelo slug, sem variável de ambiente nova.
insert into public.email_campanhas (nome, campanha, assunto, remetente, link, status, teto_por_rodada, template)
select
  'Carrinho abandonado',
  'carrinho_abandonado',
  'variável por disparo',
  'Just Club & CT <nao-responda@justclubct.com.br>',
  'https://justclub.com.br',
  'pausada',
  200,
  'carrinho_abandonado'
where not exists (select 1 from public.email_campanhas where campanha = 'carrinho_abandonado');

-- Aditivo (colunas novas no fim): a tela do carrinho abandonado passa a mostrar
-- se o resgate por e-mail já saiu, e ganha o produto_id.
-- Precisa de drop porque o tipo de retorno muda; drop e create na mesma
-- transação, então a tela não fica sem função em nenhum momento.
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
  email_enviado_em timestamptz
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
    ce.enviado_em
  from ultima u
  join clientes c on c.id = u.cliente_id
  join produtos pr on pr.id = u.produto_id
  left join unidades un on un.id = pr.unidade_id
  left join carrinho_emails ce
    on ce.cliente_id = u.cliente_id and ce.produto_id = u.produto_id
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
