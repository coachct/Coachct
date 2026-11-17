-- Bloqueio GLOBAL de posição (Mapa de Posições) passa a varrer as próximas aulas.
--
-- Até aqui, bloquear uma posição em /admin/posicoes só marcava club_posicoes.bloqueado.
-- Quem JÁ estava reservado nessa posição nas aulas futuras continuava lá, escondido
-- atrás do vermelho do mapa: a recepção não via o nome e não conseguia trocar de lugar.
--
-- Agora o bloqueio global faz o mesmo que o bloqueio pontual da aula já fazia
-- ("o bloqueio SEMPRE prevalece"): em toda aula running_funcional da unidade que ainda
-- não começou, quem está na posição vai pra primeira livre — mesmo tipo primeiro
-- (esteira→esteira, funcional→funcional). Aula lotada → fica reservado sem posição
-- (stand-by), igual ao bloqueio pontual.
--
-- Aula que já começou/passou não é tocada.

-- 1) Varredura (interna — não exposta pra API).
create or replace function club_realocar_reservas_posicao_bloqueada(p_posicao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos     club_posicoes%rowtype;
  v_label   text;
  v_agora   timestamp := now() at time zone 'America/Sao_Paulo';
  r         record;
  v_dest    text;
  v_movidas int := 0;
  v_standby int := 0;
  v_det     jsonb := '[]'::jsonb;
begin
  select * into v_pos from club_posicoes where id = p_posicao_id;
  if not found then raise exception 'POSICAO_NAO_ENCONTRADA'; end if;
  v_label := v_pos.tipo || lpad(v_pos.numero::text, 2, '0');

  for r in
    select res.id, res.ocorrencia_id, o.data, a.horario, c.nome
    from club_reservas res
    join club_ocorrencias o on o.id = res.ocorrencia_id
    join club_aulas a on a.id = o.aula_id
    left join clientes c on c.id = res.cliente_id
    where a.unidade_id = v_pos.unidade_id
      and a.tipo = 'running_funcional'
      and res.posicao = v_label
      and res.status in ('reservado','presente')
      and o.status <> 'cancelada'
      and (o.data + a.horario) > v_agora
    order by o.data, a.horario
  loop
    -- mesma trava da troca de aula: ninguém pega a posição de destino no meio
    perform pg_advisory_xact_lock(hashtextextended(r.ocorrencia_id::text, 0));

    v_dest := null;
    select p.tipo || lpad(p.numero::text, 2, '0') into v_dest
    from club_posicoes p
    where p.unidade_id = v_pos.unidade_id
      and p.id <> v_pos.id
      and p.ativo is true
      and coalesce(p.bloqueado, false) = false
      and not exists (
        select 1 from club_posicoes_bloqueios_ocorrencia b
        where b.ocorrencia_id = r.ocorrencia_id
          and b.posicao = p.tipo || lpad(p.numero::text, 2, '0'))
      and not exists (
        select 1 from club_reservas x
        where x.ocorrencia_id = r.ocorrencia_id
          and x.status <> 'cancelado'
          and x.posicao = p.tipo || lpad(p.numero::text, 2, '0'))
    order by (p.tipo = v_pos.tipo) desc, p.tipo, p.numero
    limit 1;

    update club_reservas set posicao = v_dest where id = r.id;

    if v_dest is null then v_standby := v_standby + 1;
    else v_movidas := v_movidas + 1; end if;

    v_det := v_det || jsonb_build_object(
      'data', r.data, 'horario', to_char(r.horario, 'HH24:MI'),
      'cliente', r.nome, 'de', v_label, 'para', v_dest);
  end loop;

  return jsonb_build_object('posicao', v_label, 'movidas', v_movidas,
                            'standby', v_standby, 'detalhes', v_det);
end $$;

revoke all on function club_realocar_reservas_posicao_bloqueada(uuid) from public, anon, authenticated;

-- 2) RPC da tela: bloqueia/desbloqueia e devolve quem foi movido.
create or replace function club_bloquear_posicao_global(p_posicao_id uuid, p_bloquear boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb := jsonb_build_object('movidas', 0, 'standby', 0, 'detalhes', '[]'::jsonb);
begin
  if not exists (
    select 1 from perfis where id = auth.uid() and role in ('admin','coordenadora')
  ) then
    raise exception 'SEM_PERMISSAO';
  end if;

  -- varre ANTES de marcar, pra devolver a lista; a função já ignora a própria posição
  if p_bloquear then
    v_res := club_realocar_reservas_posicao_bloqueada(p_posicao_id);
  end if;

  update club_posicoes set bloqueado = p_bloquear where id = p_posicao_id;
  return v_res;
end $$;

revoke all on function club_bloquear_posicao_global(uuid, boolean) from public, anon;
grant execute on function club_bloquear_posicao_global(uuid, boolean) to authenticated;

-- 3) Rede de segurança: qualquer outro caminho que marque bloqueado=true (aba antiga
--    aberta, SQL manual) também varre. À prova de falha: erro aqui nunca derruba o bloqueio.
create or replace function trg_club_posicao_bloqueada_realoca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform club_realocar_reservas_posicao_bloqueada(new.id);
  exception when others then
    raise warning '[bloqueio global] realocar reservas falhou (ignorado): %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists trg_club_posicao_bloqueada_realoca on club_posicoes;
create trigger trg_club_posicao_bloqueada_realoca
after update of bloqueado on club_posicoes
for each row
when (new.bloqueado is true and old.bloqueado is distinct from new.bloqueado)
execute function trg_club_posicao_bloqueada_realoca();
