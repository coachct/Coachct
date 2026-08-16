-- ─────────────────────────────────────────────────────────────────────────────
-- unificar_clientes v3 — resolve os conflitos sozinho, sem jogo de gato e rato
--
-- v1 abortava em qualquer índice único. v2 tratou cliente_planos. A v3 resolve
-- o problema de forma geral:
--
--   1. Consolidação explícita onde a regra de negócio importa:
--      • cliente_planos   → mesmo plano vira uma linha (mais ativo/início mais antigo)
--      • cliente_creditos → mesmo pote (tipo+mês+ano+unidade) vira uma linha,
--                           com o USADO somado e o TOTAL maior. Não soma o total:
--                           o pote do parceiro é 12/mês, não 24.
--   2. Para as outras 22 tabelas: se o move em bloco bater em índice único,
--      passa a mover LINHA A LINHA. A linha que não couber (a pessoa já tem a
--      mesma reserva/aula/registro no cadastro que fica) é apagada e guardada
--      inteira na auditoria.
--   3. Tabelas de dinheiro (vendas, créditos avulsos, cobranças, pagamentos,
--      assinaturas) NUNCA são apagadas automaticamente: ali ele aborta tudo e
--      avisa, como antes.
--
-- Aditivo. Rodar depois do unificar-clientes.sql.
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
  v_ok            int;
  v_tabela        text;
  v_ids           text[];
  v_id            text;
  v_json          jsonb;
  v_plano         public.cliente_planos%rowtype;
  v_credito       public.cliente_creditos%rowtype;
  -- Tabelas onde apagar uma linha significa perder dinheiro/histórico fiscal
  v_protegidas    text[] := array[
    'vendas', 'creditos_avulsos', 'cobrancas_pendentes',
    'pagamentos_pendentes', 'assinaturas_ilimitado_club'
  ];
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

  -- ── 1a. Mesmo plano nos dois cadastros → uma linha só ────────────────────
  for v_plano in
    select d.* from public.cliente_planos d
     where d.cliente_id = p_remover
       and exists (select 1 from public.cliente_planos m
                    where m.cliente_id = p_manter and m.plano_id = d.plano_id)
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

    v_consolidados := v_consolidados || jsonb_build_object('tabela', 'cliente_planos', 'linha', to_jsonb(v_plano));
    delete from public.cliente_planos where id = v_plano.id;
  end loop;

  -- ── 1b. Mesmo pote de créditos (tipo+mês+ano+unidade) → uma linha só ─────
  --    total = o maior (o pote não dobra); usado = a soma (o uso é real nos dois)
  for v_credito in
    select d.* from public.cliente_creditos d
     where d.cliente_id = p_remover
       and exists (
         select 1 from public.cliente_creditos m
          where m.cliente_id = p_manter
            and m.tipo is not distinct from d.tipo
            and m.mes  is not distinct from d.mes
            and m.ano  is not distinct from d.ano
            and m.unidade_id is not distinct from d.unidade_id
       )
  loop
    update public.cliente_creditos m set
      total     = greatest(coalesce(m.total, 0), coalesce(v_credito.total, 0)),
      usado     = coalesce(m.usado, 0) + coalesce(v_credito.usado, 0),
      expira_em = case when m.expira_em is null or v_credito.expira_em is null
                       then null else greatest(m.expira_em, v_credito.expira_em) end
    where m.cliente_id = p_manter
      and m.tipo is not distinct from v_credito.tipo
      and m.mes  is not distinct from v_credito.mes
      and m.ano  is not distinct from v_credito.ano
      and m.unidade_id is not distinct from v_credito.unidade_id;

    v_consolidados := v_consolidados || jsonb_build_object('tabela', 'cliente_creditos', 'linha', to_jsonb(v_credito));
    delete from public.cliente_creditos where id = v_credito.id;
  end loop;

  -- ── 2. Move o histórico. Em bloco; se bater em único, linha a linha ──────
  foreach v_tabela in array v_tabelas loop
    begin
      execute format('update public.%I set cliente_id = $1 where cliente_id = $2', v_tabela)
        using p_manter, p_remover;
      get diagnostics v_linhas = row_count;
      if v_linhas > 0 then
        v_movidos := v_movidos || jsonb_build_object(v_tabela, v_linhas);
      end if;

    exception
      when undefined_table then
        null;  -- tabela não existe neste ambiente

      when unique_violation then
        if v_tabela = any(v_protegidas) then
          raise exception 'Conflito na tabela "%" (dinheiro/histórico fiscal): os dois cadastros têm registros que não posso unir sozinho. Resolva esse caso manualmente antes de unificar.', v_tabela;
        end if;

        execute format('select array_agg(id::text) from public.%I where cliente_id = $1', v_tabela)
          into v_ids using p_remover;

        v_ok := 0;
        foreach v_id in array coalesce(v_ids, array[]::text[]) loop
          begin
            execute format('update public.%I set cliente_id = $1 where id::text = $2', v_tabela)
              using p_manter, v_id;
            v_ok := v_ok + 1;
          exception
            when unique_violation then
              -- O cadastro que fica já tem esse mesmo registro. Guarda a linha
              -- inteira na auditoria e descarta a cópia do duplicado.
              execute format('select to_jsonb(t) from public.%I t where t.id::text = $1', v_tabela)
                into v_json using v_id;
              v_consolidados := v_consolidados || jsonb_build_object('tabela', v_tabela, 'linha', v_json);
              execute format('delete from public.%I where id::text = $1', v_tabela) using v_id;
          end;
        end loop;

        if v_ok > 0 then
          v_movidos := v_movidos || jsonb_build_object(v_tabela, v_ok);
        end if;
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
