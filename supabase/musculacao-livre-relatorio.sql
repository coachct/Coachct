-- ============================================================================
-- RELATÓRIO DA MUSCULAÇÃO LIVRE (Just CT)
--
-- Até aqui a musculação livre só tinha a tela operacional do dia
-- (/admin/musculacao-livre), que lista quem entrou HOJE e some depois.
-- Nenhum relatório enxergava esse movimento: 'frequencia' lê agendamentos e
-- 'inativos' lê agendamentos + club_reservas, então quem só treina sozinho
-- ficava invisível nos dois.
--
-- Agrega tudo no banco e devolve um jsonb único. É RPC e não query no client
-- porque são ~7.8 mil entradas e o PostgREST corta em 1000 linhas sem avisar.
--
-- ─── IDENTIDADE DA PESSOA (o coração disto) ─────────────────────────────────
-- Check-in de app NÃO grava cliente_id: entradas_walkin.cliente_id é nulo em
-- 100% das entradas do CT. Se a gente usar o id do parceiro como identidade,
-- a mesma pessoa vira duas: o Rafael Papa tinha 6 entradas no Wellhub (última
-- em 09/07) e 37 no TotalPass (última em 14/09) — e a conta velha aparecia
-- como "sumiu há 73 dias" enquanto ele treinava direto.
--
-- O payload salva o suficiente pra resolver isso:
--   TotalPass -> raw.user.document_number (CPF), email, phone
--   Wellhub   -> raw.event_data.user.email
--
-- Então cada par (origem, id_externo) é resolvido para um cliente nesta ordem:
--   0. entradas_walkin.cliente_id, quando existir
--   1. CPF do payload           = clientes.cpf
--   2. e-mail do payload        = clientes.email ou clientes.wellhub_email
--   3. id do parceiro           = clientes.wellhub_id / clientes.totalpass_id
-- Casou -> a pessoa é 'c:<cliente_id>' (junta os dois apps E liga ao Coach CT).
-- Não casou -> 'e:<email>' (junta os dois apps sem cadastro) e, em último
-- caso, 'origem:id_externo'. Hoje ~85% das chaves casam com um cliente.
--
-- Os joins são por igualdade de propósito: o lateral com OR fazia um seq scan
-- na tabela de 44 mil clientes por chave e estourava o statement timeout.
--
-- ─── "SUMIU" TEM QUE OLHAR O NEGÓCIO INTEIRO ────────────────────────────────
-- Quem parou a musculação mas foi pras aulas do Club, ou virou aluno de Coach
-- CT, não sumiu. Por isso cada pessoa carrega ultima_musc, ultima_club,
-- ultima_coach e ultima_qualquer — a lista de evasão usa ultima_qualquer.
--
-- Períodos: 'entradas'/'dias'/'coach_periodo' são do período filtrado;
-- 'total_geral', 'primeira' e as datas de última visita são do histórico
-- inteiro, senão "nunca voltou" não significaria nada dentro de uma janela.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.musculacao_livre_relatorio(
  p_inicio date,
  p_fim    date
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_ct   uuid := 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'; -- Musculação Livre é sempre Just CT
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_out  jsonb;
begin
  -- SECURITY DEFINER sem guarda de role é API aberta: esconder o item de menu
  -- não impede ninguém de chamar a função direto.
  select role into v_role from perfis where id = auth.uid();
  if v_role is null or v_role <> all (array['admin','coordenadora']) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  with
  -- ─── Entradas de parceiro, de TODAS as unidades ───────────────────────────
  -- (as do Club entram só pra saber que a pessoa continua treinando em algum
  --  lugar; o que conta como musculação livre é filtrado depois pela unidade)
  par as (
    select
      e.origem,
      e.id_externo,
      e.unidade_id,
      e.cliente_id as cliente_id_raw,
      lower(nullif(trim(coalesce(e.raw->'event_data'->'user'->>'email',
                                 e.raw->'user'->>'email')), '')) as email,
      nullif(regexp_replace(coalesce(e.raw->'user'->>'document_number', ''), '\D', '', 'g'), '') as cpf,
      coalesce(
        nullif(trim(concat_ws(' ', e.raw->'event_data'->'user'->>'first_name',
                                   e.raw->'event_data'->'user'->>'last_name')), ''),
        nullif(trim(e.raw->'user'->>'name'), '')
      ) as nome,
      (e.recebido_em at time zone 'America/Sao_Paulo') as ts
    from entradas_walkin e
    where e.id_externo is not null
      and coalesce(e.status, '') <> 'observado'   -- check-in em modo errado: é do Coach CT
  ),
  chaves as (
    select distinct on (origem, id_externo)
      origem, id_externo, email, cpf, nome, cliente_id_raw
    from par
    order by origem, id_externo, ts desc          -- fica com o dado mais recente do parceiro
  ),
  cl as (
    select
      id, criado_em, nome,
      nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), '') as cpf_n,
      lower(nullif(trim(email), ''))          as email_n,
      lower(nullif(trim(wellhub_email), ''))  as wemail_n,
      wellhub_id, totalpass_id
    from clientes
  ),
  cand as (
    select k.origem, k.id_externo, 0 as prio, k.cliente_id_raw as cliente_id, null::timestamptz as criado_em
      from chaves k where k.cliente_id_raw is not null
    union all
    select k.origem, k.id_externo, 1, c.id, c.criado_em from chaves k join cl c on c.cpf_n    = k.cpf
    union all
    select k.origem, k.id_externo, 2, c.id, c.criado_em from chaves k join cl c on c.email_n  = k.email
    union all
    select k.origem, k.id_externo, 3, c.id, c.criado_em from chaves k join cl c on c.wemail_n = k.email
    union all
    select k.origem, k.id_externo, 4, c.id, c.criado_em from chaves k join cl c
      on k.origem = 'wellhub'   and c.wellhub_id   = k.id_externo
    union all
    select k.origem, k.id_externo, 5, c.id, c.criado_em from chaves k join cl c
      on k.origem = 'totalpass' and c.totalpass_id = k.id_externo
  ),
  resolvido as (
    select distinct on (origem, id_externo) origem, id_externo, cliente_id
    from cand
    order by origem, id_externo, prio, criado_em nulls last
  ),
  ident as (
    select
      k.origem, k.id_externo, r.cliente_id,
      coalesce('c:' || r.cliente_id::text, 'e:' || k.email, k.origem || ':' || k.id_externo) as pessoa,
      coalesce(c.nome, k.nome, 'Sem nome') as nome
    from chaves k
    left join resolvido r using (origem, id_externo)
    left join clientes  c on c.id = r.cliente_id
  ),

  -- ─── Eventos de musculação livre (o que este relatório mede) ──────────────
  musc as (
    select i.pessoa, i.nome, i.cliente_id, p.origem, p.ts
    from par p
    join ident i using (origem, id_externo)
    where p.unidade_id = v_ct
    union all
    select
      'c:' || a.cliente_id::text,
      coalesce(c.nome, 'Cliente removido'),
      a.cliente_id,
      'credito',
      (a.criado_em at time zone 'America/Sao_Paulo')
    from acessos_livres_ct a
    left join clientes c on c.id = a.cliente_id
    where a.unidade_id = v_ct
      and a.cancelado_em is null
  ),

  -- ─── Treino com coach (Coach CT) ──────────────────────────────────────────
  coach as (
    select 'c:' || a.cliente_id::text as pessoa, a.cliente_id, a.data
    from agendamentos a
    where a.status = 'realizado'
      and a.cliente_id is not null
  ),
  coach_pessoa as (
    select pessoa, min(cliente_id::text)::uuid as cliente_id,
           count(*) as total, max(data) as ultima,
           count(*) filter (where data between p_inicio and p_fim) as periodo
    from coach group by pessoa
  ),

  -- ─── Apareceu no Club (check-in de app em unidade club, ou reserva de aula) ─
  club_pessoa as (
    select pessoa, max(d) as ultima
    from (
      select i.pessoa, p.ts::date as d
      from par p join ident i using (origem, id_externo)
      where p.unidade_id <> v_ct
      union all
      select 'c:' || r.cliente_id::text, o.data
      from club_reservas r
      join club_ocorrencias o on o.id = r.ocorrencia_id
      where r.cancelado_em is null
        and r.cliente_id is not null
        and o.data <= v_hoje
    ) x
    group by pessoa
  ),

  periodo as (
    select * from musc where ts::date between p_inicio and p_fim
  ),

  pessoas as (
    select
      m.pessoa                                     as chave,
      (array_agg(m.nome   order by m.ts desc))[1]  as nome,
      (array_agg(m.origem order by m.ts desc))[1]  as origem,
      bool_or(m.cliente_id is not null)            as cadastrado,
      min(m.cliente_id::text)                      as cliente_id,
      count(*)                                     as total_geral,
      count(distinct m.ts::date)                   as dias_geral,
      min(m.ts)::date                              as primeira,
      max(m.ts)::date                              as ultima,
      count(*)                   filter (where m.ts::date between p_inicio and p_fim) as entradas,
      count(distinct m.ts::date) filter (where m.ts::date between p_inicio and p_fim) as dias
    from musc m
    group by m.pessoa
  )

  select jsonb_build_object(
    'hoje',   v_hoje,
    'inicio', p_inicio,
    'fim',    p_fim,

    'resumo', (
      select jsonb_build_object(
        'entradas',  count(*),
        'pessoas',   count(distinct pessoa),
        'dias',      count(distinct ts::date),
        'wellhub',   count(*) filter (where origem = 'wellhub'),
        'totalpass', count(*) filter (where origem = 'totalpass'),
        'credito',   count(*) filter (where origem = 'credito'),
        'novatos',   (select count(*) from pessoas where primeira between p_inicio and p_fim)
      )
      from periodo
    ),

    'por_dia', coalesce((
      select jsonb_agg(x order by x->>'dia')
      from (
        select jsonb_build_object(
          'dia',       ts::date,
          'total',     count(*),
          'wellhub',   count(*) filter (where origem = 'wellhub'),
          'totalpass', count(*) filter (where origem = 'totalpass'),
          'credito',   count(*) filter (where origem = 'credito'),
          'pessoas',   count(distinct pessoa)
        ) as x
        from periodo
        group by ts::date
      ) t
    ), '[]'::jsonb),

    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'hora', hora, 'total', total, 'dias', dias))
      from (
        select extract(dow  from ts)::int as dow,
               extract(hour from ts)::int as hora,
               count(*)                   as total,
               count(distinct ts::date)   as dias
        from periodo
        group by 1, 2
      ) t
    ), '[]'::jsonb),

    -- Uma linha por pessoa que JÁ fez musculação livre alguma vez, com o que
    -- ela faz fora dela (coach, club) pra separar quem sumiu de quem migrou.
    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chave',          p.chave,
        'nome',           p.nome,
        'origem',         p.origem,
        'cadastrado',     p.cadastrado,
        'entradas',       p.entradas,
        'dias',           p.dias,
        'total_geral',    p.total_geral,
        'dias_geral',     p.dias_geral,
        'primeira',       p.primeira,
        'ultima',         p.ultima,
        'coach_periodo',  coalesce(cp.periodo, 0),
        'coach_total',    coalesce(cp.total, 0),
        'ultima_coach',   cp.ultima,
        'ultima_club',    cl2.ultima,
        'ultima_qualquer', greatest(p.ultima, coalesce(cp.ultima, p.ultima), coalesce(cl2.ultima, p.ultima))
      ) order by p.entradas desc, p.total_geral desc)
      from pessoas p
      left join coach_pessoa cp  on cp.pessoa  = p.chave
      left join club_pessoa  cl2 on cl2.pessoa = p.chave
    ), '[]'::jsonb),

    -- Quem treina com coach e NUNCA pisou na musculação livre. Junto com o
    -- bloco acima, fecha a conta: coach+livre, só coach, só livre.
    'coach_sem_musculacao', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chave',         cp.pessoa,
        'nome',          coalesce(c.nome, 'Cliente removido'),
        'coach_periodo', cp.periodo,
        'coach_total',   cp.total,
        'ultima_coach',  cp.ultima
      ) order by cp.periodo desc, cp.total desc)
      from coach_pessoa cp
      left join clientes c on c.id = cp.cliente_id
      where cp.periodo > 0
        and not exists (select 1 from pessoas p where p.chave = cp.pessoa)
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.musculacao_livre_relatorio(date, date) TO authenticated;
