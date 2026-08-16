-- ─────────────────────────────────────────────────────────────────────────────
-- unificar_clientes v2 — resolve o caso "mesmo plano nos dois cadastros"
--
-- Quando os dois cadastros têm o MESMO plano (índice único por cliente+plano),
-- a v1 abortava. Agora as duas linhas viram uma só: fica a do cadastro mantido,
-- enriquecida com o que houver de melhor na do duplicado (mais ativo, início
-- mais antigo, fim mais longo, aceite de contrato). A linha duplicada é apagada
-- e guardada inteira na auditoria.
--
-- Aditivo: só substitui a função e acrescenta uma coluna. Rodar depois do
-- unificar-clientes.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clientes_unificacoes
  add column if not exists consolidados jsonb not null default '[]'::jsonb;

create or replace function public.unificar_clientes(
  p_manter   uuid,
  p_remover  uuid,
  p_feito_por uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manter        public.clientes%rowtype;
  v_remover       public.clientes%rowtype;
  v_movidos       jsonb := '{}'::jsonb;
  v_consolidados  jsonb := '[]'::jsonb;
  v_linhas        int;
  v_tabela        text;
  v_plano         public.cliente_planos%rowtype;
  v_tabelas       text[] := array[
    'agendamentos', 'club_reservas', 'aulas', 'vendas', 'creditos_avulsos',
    'cliente_planos', 'cliente_creditos', 'assinaturas_ilimitado_club',
    'acessos_livres_ct', 'entradas_walkin', 'totem_entradas_ct',
    'fila_espera', 'avaliacoes_aula', 'historico_maquina',
    'cobrancas_pendentes', 'pagamentos_pendentes', 'cartoes_log',
    'notificacoes_pendentes', 'notificacoes_coach', 'whatsapp_mensagens',
    'termos_aceites', 'lgpd_logs', 'consentimento_biometrico', 'face_embeddings'
  ];
begin
  if p_manter is null or p_remover is null then
    raise exception 'Informe os dois cadastros.';
  end if;
  if p_manter = p_remover then
    raise exception 'Os dois cadastros são o mesmo.';
  end if;

  select * into v_manter  from public.clientes where id = p_manter  for update;
  if not found then raise exception 'Cadastro a manter não encontrado.'; end if;

  select * into v_remover from public.clientes where id = p_remover for update;
  if not found then raise exception 'Cadastro duplicado não encontrado.'; end if;

  -- ── Plano repetido nos dois cadastros: consolida em uma linha só ──────────
  for v_plano in
    select d.*
      from public.cliente_planos d
     where d.cliente_id = p_remover
       and exists (
         select 1 from public.cliente_planos m
          where m.cliente_id = p_manter and m.plano_id = d.plano_id
       )
  loop
    update public.cliente_planos m set
      ativo              = coalesce(m.ativo, false) or coalesce(v_plano.ativo, false),
      inicio             = least(m.inicio, v_plano.inicio),
      fim                = case when m.fim is null or v_plano.fim is null
                                then null else greatest(m.fim, v_plano.fim) end,
      contrato_aceito_em = coalesce(m.contrato_aceito_em, v_plano.contrato_aceito_em),
      produto_id         = coalesce(m.produto_id, v_plano.produto_id),
      venda_id           = coalesce(m.venda_id, v_plano.venda_id),
      atualizado_em      = now()
    where m.cliente_id = p_manter and m.plano_id = v_plano.plano_id;

    v_consolidados := v_consolidados || jsonb_build_object(
      'tabela', 'cliente_planos', 'linha', to_jsonb(v_plano)
    );
    delete from public.cliente_planos where id = v_plano.id;

    v_movidos := v_movidos || jsonb_build_object(
      'cliente_planos (plano repetido, consolidado)',
      coalesce((v_movidos->>'cliente_planos (plano repetido, consolidado)')::int, 0) + 1
    );
  end loop;

  -- ── Move todo o histórico do duplicado ───────────────────────────────────
  foreach v_tabela in array v_tabelas loop
    begin
      execute format('update public.%I set cliente_id = $1 where cliente_id = $2', v_tabela)
        using p_manter, p_remover;
      get diagnostics v_linhas = row_count;
      if v_linhas > 0 then
        v_movidos := v_movidos || jsonb_build_object(v_tabela, v_linhas);
      end if;
    exception
      when unique_violation then
        raise exception 'Conflito na tabela "%": os dois cadastros têm registros que não podem ser unidos automaticamente. Resolva esse caso manualmente antes de unificar.', v_tabela;
      when undefined_table then
        null;
    end;
  end loop;

  insert into public.clientes_unificacoes
    (cliente_mantido, cliente_removido, snapshot_removido, movidos, consolidados, feito_por)
  values
    (p_manter, p_remover, to_jsonb(v_remover), v_movidos, v_consolidados, p_feito_por);

  delete from public.clientes where id = p_remover;

  update public.clientes set
    cpf                   = coalesce(nullif(cpf, ''),               nullif(v_remover.cpf, '')),
    email                 = coalesce(nullif(email, ''),             nullif(v_remover.email, '')),
    telefone              = coalesce(nullif(telefone, ''),          nullif(v_remover.telefone, '')),
    whatsapp              = coalesce(nullif(whatsapp, ''),          nullif(v_remover.whatsapp, '')),
    user_id               = coalesce(user_id,                       v_remover.user_id),
    data_nascimento       = coalesce(data_nascimento,               v_remover.data_nascimento),
    sexo                  = coalesce(sexo,                          v_remover.sexo),
    foto_url              = coalesce(nullif(foto_url, ''),          nullif(v_remover.foto_url, '')),
    wellhub_id            = coalesce(nullif(wellhub_id, ''),        nullif(v_remover.wellhub_id, '')),
    wellhub_email         = coalesce(nullif(wellhub_email, ''),     nullif(v_remover.wellhub_email, '')),
    totalpass_id          = coalesce(nullif(totalpass_id, ''),      nullif(v_remover.totalpass_id, '')),
    pagarme_customer_id   = coalesce(nullif(pagarme_customer_id,''),nullif(v_remover.pagarme_customer_id, '')),
    pagarme_card_id       = coalesce(nullif(pagarme_card_id, ''),   nullif(v_remover.pagarme_card_id, '')),
    pagarme_card_last4    = coalesce(nullif(pagarme_card_last4,''), nullif(v_remover.pagarme_card_last4, '')),
    pagarme_card_brand    = coalesce(nullif(pagarme_card_brand,''), nullif(v_remover.pagarme_card_brand, '')),
    lgpd_consentimento_em = coalesce(lgpd_consentimento_em,         v_remover.lgpd_consentimento_em),
    lgpd_canal            = coalesce(lgpd_canal,                    v_remover.lgpd_canal),
    observacoes           = coalesce(nullif(observacoes, ''),       nullif(v_remover.observacoes, '')),
    atualizado_em         = now()
  where id = p_manter;

  return jsonb_build_object(
    'ok', true,
    'movidos', v_movidos,
    'consolidados', jsonb_array_length(v_consolidados),
    'cliente', (select to_jsonb(c) from public.clientes c where c.id = p_manter)
  );
end;
$$;

revoke execute on function public.unificar_clientes(uuid, uuid, uuid) from public;
revoke execute on function public.unificar_clientes(uuid, uuid, uuid) from anon;
revoke execute on function public.unificar_clientes(uuid, uuid, uuid) from authenticated;
grant  execute on function public.unificar_clientes(uuid, uuid, uuid) to service_role;
