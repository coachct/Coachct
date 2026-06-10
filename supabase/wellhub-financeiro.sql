-- =============================================
-- WELLHUB / AGREGADORES — Camada financeira (check-in -> receita)
-- Execute este arquivo no SQL Editor do Supabase.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =============================================

-- ---------------------------------------------
-- 1. Cadastro do valor por check-in, por produto do parceiro
--    (Wellhub hoje; TotalPass no futuro). O valor é por check-in.
-- ---------------------------------------------
create table if not exists public.valores_checkin (
  id uuid default uuid_generate_v4() primary key,
  origem text not null default 'wellhub' check (origem in ('wellhub', 'totalpass')),
  produto_id text,                       -- id do produto no parceiro (ex: '776926').
                                         -- Pode ficar null até o 1o check-in revelar o id.
  descricao text not null,               -- nome do produto (ex: 'Musculação')
  valor numeric(10,2) not null,          -- quanto vale CADA check-in desse produto
  limite_mensal int,                     -- ex: 12, 8; null = sem limite informado
  unidade_id uuid references public.unidades on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- Casamento por id é o caminho robusto: um produto_id só pode ter um valor por origem.
-- Índice parcial (where ... is not null) deixa conviverem vários registros ainda sem id.
create unique index if not exists idx_valores_checkin_origem_produto
  on public.valores_checkin (origem, produto_id)
  where produto_id is not null;

-- Evita nome duplicado dentro da mesma origem (o casamento reserva é por nome).
create unique index if not exists idx_valores_checkin_origem_descricao
  on public.valores_checkin (origem, lower(descricao));

-- RLS: só admin gerencia. O webhook/validate usa service role e passa por cima da RLS.
alter table public.valores_checkin enable row level security;

drop policy if exists "Admin gerencia valores_checkin" on public.valores_checkin;
create policy "Admin gerencia valores_checkin" on public.valores_checkin
  for all using (
    exists (select 1 from public.perfis where id = auth.uid() and role = 'admin')
  );

-- ---------------------------------------------
-- 2. Semente dos valores atuais do Wellhub (portal do parceiro).
--    produto_id fica null por enquanto -> preenchido pela tela/1o check-in.
--    on conflict (origem, descricao): se já existir, atualiza valor/limite.
-- ---------------------------------------------
insert into public.valores_checkin (origem, descricao, valor, limite_mensal)
values
  ('wellhub', 'Musculação', 38.50, 12),
  ('wellhub', 'Personal Trainer', 80.00, 8),
  ('wellhub', 'Musculação Horário Restrito', 32.00, null)
on conflict (origem, lower(descricao)) do update
  set valor = excluded.valor,
      limite_mensal = excluded.limite_mensal,
      atualizado_em = now();

-- ---------------------------------------------
-- 3. Colunas novas em entradas_walkin:
--    o validate, ao confirmar o ticket, grava aqui o valor "congelado"
--    daquele check-in e o momento da validação.
-- ---------------------------------------------
alter table public.entradas_walkin
  add column if not exists valor numeric(10,2);

alter table public.entradas_walkin
  add column if not exists validado_em timestamptz;
