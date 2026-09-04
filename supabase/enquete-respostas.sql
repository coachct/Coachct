-- Enquetes rápidas com o cliente (1 resposta por cliente por enquete).
-- Primeiro uso: horário das aulas da noite no JustClub Vila Olímpia (18:30 e 19:30),
-- perguntado na caixa de confirmação de reserva do site (src/app/aulas/page.tsx).
-- Resultado em /admin/enquete-horario.
create table if not exists enquete_respostas (
  id            uuid primary key default gen_random_uuid(),
  enquete       text not null,
  cliente_id    uuid not null references clientes(id) on delete cascade,
  opcao         text not null,
  unidade_id    uuid references unidades(id),
  horario       text,
  ocorrencia_id uuid,
  criado_em     timestamptz not null default now(),
  constraint enquete_respostas_unica unique (enquete, cliente_id)
);

-- RLS exige índice em cliente_id (senão vira seq scan a cada leitura do cliente)
create index if not exists idx_enquete_respostas_cliente on enquete_respostas(cliente_id);
create index if not exists idx_enquete_respostas_enquete on enquete_respostas(enquete);

alter table enquete_respostas enable row level security;

-- Cliente lê e grava só as próprias respostas
drop policy if exists cliente_enquete_respostas on enquete_respostas;
create policy cliente_enquete_respostas on enquete_respostas
  for all
  using (cliente_id in (select clientes.id from clientes where clientes.user_id = auth.uid()))
  with check (cliente_id in (select clientes.id from clientes where clientes.user_id = auth.uid()));

-- Equipe lê tudo (tela de resultado no admin)
drop policy if exists equipe_le_enquete_respostas on enquete_respostas;
create policy equipe_le_enquete_respostas on enquete_respostas
  for select
  using (exists (select 1 from perfis where perfis.id = auth.uid() and perfis.role = any (array['admin','coordenadora'])));
