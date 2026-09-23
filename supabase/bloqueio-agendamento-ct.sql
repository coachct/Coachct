-- Bloqueio de AGENDAMENTO do Coach CT, por cliente.
-- APLICADA no Supabase em 23/09/2026.
--
-- POR QUE EXISTE: cliente que reserva e não aparece deixa o coach parado num
-- horário que outro aluno queria. clientes.bloqueado não serve aqui — ele trava
-- também entrada, catraca, totem e compra, e o "Desbloquear" da recepção dispensa
-- faltas e cancela multas. Este é cirúrgico: só a reserva do Coach CT.
--
-- Liga/desliga pelo card "Agendamento Coach CT" em /admin/clientes (só admin).
-- Ao ligar, a tela também cancela as reservas futuras do CT (vaga volta pro
-- quadro e o trigger on_agendamento_cancelado promove a fila).
alter table public.clientes
  add column if not exists agendamento_ct_bloqueado boolean not null default false,
  add column if not exists agendamento_ct_bloqueado_em timestamptz,
  add column if not exists agendamento_ct_bloqueado_por uuid;

-- Esconder a tela não basta: a reserva sai do navegador. Barra só o que a
-- própria pessoa cria (site e bot); staff segue podendo encaixar no balcão.
create or replace function public.barrar_agendamento_ct_bloqueado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bloqueado boolean;
begin
  if coalesce(new.criado_via, 'cliente') not in ('cliente', 'whatsapp') then
    return new;
  end if;
  select agendamento_ct_bloqueado into v_bloqueado from clientes where id = new.cliente_id;
  if coalesce(v_bloqueado, false) then
    raise exception 'AGENDAMENTO_CT_BLOQUEADO';
  end if;
  return new;
end;
$$;

drop trigger if exists on_agendamento_ct_bloqueado on public.agendamentos;
create trigger on_agendamento_ct_bloqueado
  before insert on public.agendamentos
  for each row execute function public.barrar_agendamento_ct_bloqueado();
