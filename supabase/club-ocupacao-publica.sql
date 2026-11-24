-- Ocupação das aulas do Club sem identificação: só a contagem por ocorrência.
-- A grade pública (/aulas) precisa saber se a aula lotou mesmo sem login;
-- club_reservas não tem leitura para anon (RLS), então a contagem vinha zerada
-- e o visitante via "Reservar" em aula lotada.
-- Aplicado em produção em 24/11/2026 (migration club_ocupacao_publica).
create or replace function public.club_ocupacao(p_ocorrencia_ids uuid[])
returns table(ocorrencia_id uuid, reservas integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.ocorrencia_id, count(*)::int
  from public.club_reservas r
  where r.ocorrencia_id = any(p_ocorrencia_ids)
    and r.status in ('reservado','presente')
  group by r.ocorrencia_id
$$;

revoke all on function public.club_ocupacao(uuid[]) from public;
grant execute on function public.club_ocupacao(uuid[]) to anon, authenticated, service_role;
