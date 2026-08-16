-- ─────────────────────────────────────────────────────────────────────────────
-- Unificação de cadastros duplicados de cliente
--
-- Move TUDO (24 tabelas que apontam para clientes.id) do cadastro duplicado
-- para o cadastro que fica, completa os campos vazios do que fica com os dados
-- do duplicado, guarda um snapshot para auditoria/undo e só então apaga o
-- duplicado. Tudo numa transação só: se qualquer passo falhar, nada acontece.
--
-- Seguro rodar mais de uma vez (idempotente na criação dos objetos).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Auditoria: guarda o cadastro apagado inteiro (dá para reconstruir) ────
create table if not exists public.clientes_unificacoes (
  id                uuid primary key default gen_random_uuid(),
  cliente_mantido   uuid not null,
  cliente_removido  uuid not null,
  snapshot_removido jsonb not null,
  movidos           jsonb not null default '{}'::jsonb,
  feito_por         uuid,
  criado_em         timestamptz not null default now()
);

alter table public.clientes_unificacoes enable row level security;

drop policy if exists "Equipe le unificacoes" on public.clientes_unificacoes;
create policy "Equipe le unificacoes" on public.clientes_unificacoes
  for select to authenticated
  using (exists (
    select 1 from public.perfis p
    where p.id = auth.uid() and p.role in ('admin', 'coordenadora')
  ));

-- ── 2. A função ──────────────────────────────────────────────────────────────
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
  v_manter   public.clientes%rowtype;
  v_remover  public.clientes%rowtype;
  v_movidos  jsonb := '{}'::jsonb;
  v_linhas   int;
  v_tabela   text;
  v_tabelas  text[] := array[
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

  -- Move todo o histórico do duplicado para o cadastro que fica
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
        -- Os dois cadastros têm registros que não podem coexistir nessa tabela.
        -- Aborta tudo (nada é perdido) e diz onde está o conflito.
        raise exception 'Conflito na tabela "%": os dois cadastros têm registros que não podem ser unidos automaticamente. Resolva esse caso manualmente antes de unificar.', v_tabela;
      when undefined_table then
        null; -- tabela não existe neste ambiente: ignora
    end;
  end loop;

  -- Guarda o duplicado inteiro antes de apagar
  insert into public.clientes_unificacoes
    (cliente_mantido, cliente_removido, snapshot_removido, movidos, feito_por)
  values
    (p_manter, p_remover, to_jsonb(v_remover), v_movidos, p_feito_por);

  -- Apaga o duplicado primeiro: libera CPF/email/wellhub_id/totalpass_id (únicos)
  delete from public.clientes where id = p_remover;

  -- Só o que estiver VAZIO no cadastro que fica é preenchido com o do duplicado
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
    'cliente', (select to_jsonb(c) from public.clientes c where c.id = p_manter)
  );
end;
$$;

-- Só o back-end (service_role) pode chamar — nunca o navegador
revoke execute on function public.unificar_clientes(uuid, uuid, uuid) from public;
revoke execute on function public.unificar_clientes(uuid, uuid, uuid) from anon;
revoke execute on function public.unificar_clientes(uuid, uuid, uuid) from authenticated;
grant  execute on function public.unificar_clientes(uuid, uuid, uuid) to service_role;
