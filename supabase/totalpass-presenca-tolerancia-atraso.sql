-- Marca presenca no Club pelo check-in TotalPass (casamento por CPF).
--
-- Regra 1 (original, inalterada): reserva 'reservado' do dia vira 'presente'.
-- Regra 2 (nova): reserva ja marcada como 'falta' volta para 'presente' se o
--   check-in chegar ate 30 min depois do inicio da aula. Cobre o aluno que
--   chega atrasado depois da chamada ja ter sido fechada — antes disso ele
--   ficava como no-show mesmo tendo batido o check-in (caso real 18/08/2026).
--
-- Aplicada no Supabase em 21/08/2026.
create or replace function public.totalpass_marcar_presenca_por_checkin(p_cpf text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_agora      timestamp := (now() at time zone 'America/Sao_Paulo');
  v_hoje       date      := v_agora::date;
  v_cpf        text      := regexp_replace(coalesce(p_cpf,''), '\D', '', 'g');
  v_tolerancia interval  := interval '30 minutes';
  v_marcadas   int := 0;
begin
  if v_cpf = '' then
    return 0;
  end if;

  with alvo as (
    select r.id
    from club_reservas r
    join club_ocorrencias o on o.id = r.ocorrencia_id
    join club_aulas a       on a.id = o.aula_id
    join clientes c         on c.id = r.cliente_id
    where regexp_replace(coalesce(c.cpf,''), '\D', '', 'g') = v_cpf
      and o.data = v_hoje
      and r.tipo_credito ilike 'totalpass%'
      and (
        r.status = 'reservado'
        or (
          r.status = 'falta'
          and v_agora >= (o.data + a.horario)
          and v_agora <= (o.data + a.horario + v_tolerancia)
        )
      )
  )
  update club_reservas r
  set status = 'presente'
  from alvo
  where r.id = alvo.id
    and r.status in ('reservado', 'falta');

  get diagnostics v_marcadas = row_count;
  return v_marcadas;
end $function$;
