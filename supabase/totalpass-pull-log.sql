-- ---------------------------------------------------------------------------
-- HISTÓRICO DO PULL DE RESERVAS DA TOTALPASS  (/api/totalpass/pull-bookings)
-- ---------------------------------------------------------------------------
-- POR QUE ISTO EXISTE
--
-- Incidente 08/09/2026: durante ~2 semanas NENHUMA reserva feita no app da
-- TotalPass entrou na agenda (o SELECT do totalpass_slot_map era truncado no
-- teto de 1000 linhas do PostgREST — corrigido no commit 80966df). O cron rodava
-- de 2 em 2 minutos e devolvia HTTP 200 {"ok":true} o tempo todo. O único sinal
-- do problema estava no CORPO da resposta: "semMapa": 84, "criadas": 0.
--
-- O sentinela (/api/health/integracoes) olhava só status HTTP e auth, então não
-- viu nada. E na hora de investigar, a única fonte do corpo das respostas era
-- net._http_response, que ROTACIONA em poucas horas — foi o que dificultou datar
-- o começo do incidente.
--
-- Esta tabela guarda o placar de CADA pull. É a memória que faltava: dá pra
-- perguntar "desde quando semMapa está > 0?" meses depois, e é a fonte que o
-- sentinela lê pra alertar por saúde SEMÂNTICA (e não só por status HTTP).
--
-- Aplicar em produção: rodar este arquivo no SQL editor do Supabase.
-- ---------------------------------------------------------------------------

create table if not exists public.totalpass_pull_log (
  id                  bigint generated always as identity primary key,
  criado_em           timestamptz not null default now(),
  -- placar do pull (mesmos nomes do JSON da rota, em snake_case)
  slots               integer not null default 0,   -- slots devolvidos pela TotalPass na janela
  criadas             integer not null default 0,   -- reservas novas gravadas aqui
  reativadas          integer not null default 0,   -- self-heal de reserva cancelada por engano
  rejeitadas          integer not null default 0,   -- sem vaga/posição ou insert recusado (slot cancelado no app deles)
  ja_tinha            integer not null default 0,   -- slot que já estava registrado
  sem_mapa            integer not null default 0,   -- ⚠️ eventId sem ocorrência no totalpass_slot_map — o sintoma do incidente
  incompletas         integer not null default 0,   -- payload cru (user vazio), tenta no próximo poll
  canceladas          integer not null default 0,   -- reservas nossas encerradas por conciliação
  cancelamento_pulado boolean not null default false, -- poll não confiável → conciliação pulada
  erros               integer not null default 0,   -- slots que caíram em erro
  erros_api           integer not null default 0,   -- unidades cujo GET /partner/slot falhou
  duracao_ms          integer                       -- quanto o pull levou (latência da reserva do cliente)
);

comment on table public.totalpass_pull_log is
  'Placar de cada execução de /api/totalpass/pull-bookings. Lido pelo sentinela (/api/health/integracoes) e pelo painel /admin/saude. Ver incidente 08/09/2026.';

-- O sentinela e o painel só leem "os últimos N por data".
create index if not exists idx_tp_pull_log_criado
  on public.totalpass_pull_log (criado_em desc);

alter table public.totalpass_pull_log enable row level security;

-- Só a equipe lê (a rota grava com service_role, que passa por cima da RLS).
drop policy if exists totalpass_pull_log_staff_select on public.totalpass_pull_log;
create policy totalpass_pull_log_staff_select on public.totalpass_pull_log
  for select using (eh_staff());

-- ---------------------------------------------------------------------------
-- Índice de apoio do 2º alerta: "há quantas horas comerciais nenhuma reserva
-- nova da TotalPass entra?". O sentinela faz um
--   select created_at from club_reservas where totalpass_slot_id is not null
--   order by created_at desc limit 1
-- Sem índice isso vira seq scan em club_reservas a cada ciclo (Disk IO).
-- Parcial: só as linhas com slot da TotalPass, então é pequeno e rápido de criar.
-- ---------------------------------------------------------------------------
create index if not exists idx_club_reservas_tp_slot_created
  on public.club_reservas (created_at desc)
  where totalpass_slot_id is not null;
