-- =============================================
-- AGENTE WHATSAPP — Base de conhecimento (dúvidas gerais)
-- =============================================
-- Tabela editável pela equipe (admin/coordenadora) com perguntas e respostas
-- que o agente usa para responder dúvidas gerais (treinos, regras, etc.).
-- Aditivo e idempotente. Rodar no SQL Editor do Supabase.

create table if not exists public.base_conhecimento (
  id           uuid default uuid_generate_v4() primary key,
  categoria    text,                       -- ex.: 'treino', 'planos', 'regras', 'geral'
  pergunta     text not null,              -- pergunta / título do tópico
  resposta     text not null,              -- resposta que o agente pode usar
  ativo        boolean not null default true,
  criado_em    timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_base_conhecimento_ativo on public.base_conhecimento(ativo);

alter table public.base_conhecimento enable row level security;

-- Leitura liberada (conteúdo não sensível; o agente lê via service role de qualquer forma).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='base_conhecimento' and policyname='Todos leem conhecimento ativo'
  ) then
    create policy "Todos leem conhecimento ativo" on public.base_conhecimento
      for select using (ativo = true);
  end if;
end $$;

-- Admin e coordenadora gerenciam.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='base_conhecimento' and policyname='Admin e coordenadora gerenciam conhecimento'
  ) then
    create policy "Admin e coordenadora gerenciam conhecimento" on public.base_conhecimento
      for all using (
        exists (select 1 from public.perfis where id = auth.uid() and role in ('admin','coordenadora'))
      );
  end if;
end $$;

-- Exemplos iniciais (fatos do contrato — edite/adicione à vontade).
insert into public.base_conhecimento (categoria, pergunta, resposta)
select * from (values
  ('treino', 'O que é o Coach CT?',
   'O Coach CT é a modalidade exclusiva da Just CT: treinos elaborados e supervisionados pela coordenadora Juliana Hitomi, que cobrem todos os grupos musculares e são renovados mensalmente. A sessão é 1×1 (um coach por aluno).'),
  ('regras', 'Qual a multa por falta (no-show)?',
   'O não comparecimento em uma atividade com reserva, sem cancelamento no prazo, gera multa de R$ 99,00.'),
  ('regras', 'Qual o prazo para cancelar um treino Coach CT?',
   'O cancelamento deve ser feito com no mínimo 12 horas de antecedência. Entre 3h e 12h só é possível cancelar se houver fila de espera para o horário (a vaga passa para o próximo). Com menos de 3h não é possível cancelar.')
) as v(categoria, pergunta, resposta)
where not exists (select 1 from public.base_conhecimento);
