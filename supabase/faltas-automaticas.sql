-- supabase/faltas-automaticas.sql
--
-- FALTA AUTOMÁTICA — rede de segurança para o que a recepção não marcou.
--
-- Regra: passada 1h do INÍCIO da aula, toda reserva/agendamento que continua
-- "em branco" (sem presença/check-in e sem falta) vira 'falta'.
--
--   Just Club  -> club_reservas.status = 'reservado'              => 'falta'
--   Coach CT   -> agendamentos.status in ('agendado','confirmado') => 'falta'
--
-- ISOLAMENTO (regra: não interferir no fluxo atual):
--   * Faz EXATAMENTE o que o botão da recepção faz: só troca o status.
--     Não cobra multa, não bloqueia cliente, não mexe em crédito
--     (os triggers de crédito só reagem a 'cancelado' — 'falta' mantém o
--     crédito consumido, igual à falta marcada na mão).
--   * Só olha aula ATIVA (ocorrência cancelada é ignorada).
--   * Só olha a janela recente (padrão: últimas 24h). Nada de backfill de
--     meses atrás virando cobrança retroativa.
--   * No Coach CT ignora quem tem presenca_checkin = true (check-in do
--     parceiro já registrou que a pessoa veio).
--   * Roda por service role numa rota própria, fora do caminho síncrono de
--     reserva/check-in/pagamento. Se falhar, nada mais é afetado.
--   * Tudo que ela marca fica registrado em faltas_auto_log (auditoria e
--     reversão).
--
-- ATENÇÃO OPERACIONAL: falta de cliente Wellhub/TotalPass passa a aparecer
-- na tela admin/cobranca-noshow. A cobrança em si continua manual.

-- ---------------------------------------------------------------------------
-- 1) Log de auditoria
-- ---------------------------------------------------------------------------
create table if not exists public.faltas_auto_log (
  id           uuid primary key default gen_random_uuid(),
  origem       text not null check (origem in ('club','ct')),
  registro_id  uuid not null,
  cliente_id   uuid,
  inicio_aula  timestamp not null,
  tipo_credito text,
  marcado_em   timestamptz not null default now()
);

create index if not exists idx_faltas_auto_log_marcado_em on public.faltas_auto_log (marcado_em desc);
create index if not exists idx_faltas_auto_log_registro   on public.faltas_auto_log (registro_id);
create index if not exists idx_faltas_auto_log_cliente    on public.faltas_auto_log (cliente_id);

alter table public.faltas_auto_log enable row level security;

drop policy if exists faltas_auto_log_staff_select on public.faltas_auto_log;
create policy faltas_auto_log_staff_select on public.faltas_auto_log
  for select using (eh_staff());

-- ---------------------------------------------------------------------------
-- 2) Função
-- ---------------------------------------------------------------------------
create or replace function public.marcar_faltas_automaticas(
  p_tolerancia_min int     default 60,   -- quanto tempo depois do início da aula
  p_limite_horas   int     default 24,   -- não olha nada mais antigo que isso
  p_dry_run        boolean default false -- true = só conta, não marca
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agora timestamp := (now() at time zone 'America/Sao_Paulo');
  v_ate   timestamp;
  v_desde timestamp;
  v_club  int := 0;
  v_ct    int := 0;
begin
  v_ate   := v_agora - make_interval(mins  => p_tolerancia_min);
  v_desde := v_agora - make_interval(hours => p_limite_horas);

  -- ------------------------- JUST CLUB -------------------------
  if p_dry_run then
    select count(*) into v_club
    from club_reservas r
    join club_ocorrencias o on o.id = r.ocorrencia_id
    join club_aulas a       on a.id = o.aula_id
    where r.status = 'reservado'
      and o.status = 'ativa'
      and (o.data + a.horario) <= v_ate
      and (o.data + a.horario) >= v_desde;
  else
    with alvo as (
      select r.id
      from club_reservas r
      join club_ocorrencias o on o.id = r.ocorrencia_id
      join club_aulas a       on a.id = o.aula_id
      where r.status = 'reservado'
        and o.status = 'ativa'
        and (o.data + a.horario) <= v_ate
        and (o.data + a.horario) >= v_desde
    ),
    upd as (
      update club_reservas r
         set status = 'falta'
        from alvo
       where r.id = alvo.id
      returning r.id, r.cliente_id, r.tipo_credito, r.ocorrencia_id
    ),
    ins as (
      insert into faltas_auto_log (origem, registro_id, cliente_id, inicio_aula, tipo_credito)
      select 'club', u.id, u.cliente_id, (o.data + a.horario), u.tipo_credito
      from upd u
      join club_ocorrencias o on o.id = u.ocorrencia_id
      join club_aulas a       on a.id = o.aula_id
      returning 1
    )
    select count(*) into v_club from ins;
  end if;

  -- ------------------------- COACH CT -------------------------
  if p_dry_run then
    select count(*) into v_ct
    from agendamentos g
    where g.status in ('agendado','confirmado')
      and coalesce(g.presenca_checkin, false) = false
      and (g.data + g.horario) <= v_ate
      and (g.data + g.horario) >= v_desde;
  else
    with alvo as (
      select g.id
      from agendamentos g
      where g.status in ('agendado','confirmado')
        and coalesce(g.presenca_checkin, false) = false
        and (g.data + g.horario) <= v_ate
        and (g.data + g.horario) >= v_desde
    ),
    upd as (
      update agendamentos g
         set status = 'falta'
        from alvo
       where g.id = alvo.id
      returning g.id, g.cliente_id, g.tipo_credito, (g.data + g.horario) as inicio
    ),
    ins as (
      insert into faltas_auto_log (origem, registro_id, cliente_id, inicio_aula, tipo_credito)
      select 'ct', u.id, u.cliente_id, u.inicio, u.tipo_credito
      from upd u
      returning 1
    )
    select count(*) into v_ct from ins;
  end if;

  return jsonb_build_object(
    'club',       v_club,
    'ct',         v_ct,
    'dry_run',    p_dry_run,
    'janela_de',  v_desde,
    'janela_ate', v_ate
  );
end;
$$;

-- Só o service role (cron/rota) chama. Ninguém do navegador.
revoke all on function public.marcar_faltas_automaticas(int, int, boolean) from public;
revoke all on function public.marcar_faltas_automaticas(int, int, boolean) from anon;
revoke all on function public.marcar_faltas_automaticas(int, int, boolean) from authenticated;
