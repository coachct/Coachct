-- Trava de capacidade do Coach CT (05/11/2026)
--
-- Problema: o /agendar calcula as vagas quando a tela carrega e grava a reserva
-- sem reconferir. Duas pessoas com a tela aberta na última vaga conseguiam
-- reservar as duas (ex.: 10/11 06:00 com 3 alunos e 2 coaches).
--
-- Regra: reserva feita pelo CLIENTE (site/WhatsApp) no Just CT só entra se
-- ct_grade_do_dia ainda acusa vaga livre naquele horário. Admin, recepção,
-- fila (promoção) e apps parceiros (criado_via nulo/outros) passam sempre.
-- Advisory lock por unidade+data+horário serializa reservas simultâneas.
-- À prova de falha: erro inesperado não derruba a reserva.

create or replace function public.barrar_agendamento_ct_lotado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_livres int;
begin
  if new.criado_via is null or new.criado_via not in ('cliente', 'whatsapp') then
    return new;
  end if;
  if new.unidade_id is distinct from 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'::uuid
     or new.data is null or new.horario is null
     or coalesce(new.status, '') = 'cancelado' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('ct_cap|' || new.unidade_id::text || '|' || new.data::text || '|' || to_char(new.horario, 'HH24:MI')));

  select g.livres into v_livres
    from public.ct_grade_do_dia(new.unidade_id, new.data) g
   where g.horario = to_char(new.horario, 'HH24:MI');

  if coalesce(v_livres, 0) <= 0 then
    raise exception 'CT_HORARIO_LOTADO: esse horário acabou de lotar. Escolha outro horário ou entre na fila de espera.';
  end if;
  return new;
exception
  when raise_exception then raise;
  when others then return new;
end;
$function$;

drop trigger if exists on_agendamento_ct_lotado on public.agendamentos;
create trigger on_agendamento_ct_lotado
  before insert on public.agendamentos
  for each row execute function public.barrar_agendamento_ct_lotado();
