-- ============================================================================
-- RELATÓRIO DA MUSCULAÇÃO LIVRE (Just CT)
--
-- Até aqui a musculação livre só tinha a tela operacional do dia
-- (/admin/musculacao-livre), que lista quem entrou HOJE e some depois.
-- Nenhum relatório enxergava esse movimento: 'frequencia' lê agendamentos e
-- 'inativos' lê agendamentos + club_reservas, então quem só faz musculação
-- livre é invisível nos dois.
--
-- Esta RPC agrega TUDO no banco e devolve um jsonb único. O motivo de ser RPC
-- e não query no client: são ~7.8 mil entradas e o PostgREST trunca em 1000
-- linhas sem avisar.
--
-- Duas fontes, unificadas:
--   1. entradas_walkin  -> check-in de Wellhub/TotalPass (mesmo filtro da tela:
--                          esconde status 'observado', que é check-in em modo
--                          errado e pertence ao agendamento do Coach CT).
--   2. acessos_livres_ct -> walk-in pago com crédito nosso.
--
-- IDENTIDADE DA PESSOA (importante): as entradas de parceiro não têm
-- cliente_id preenchido. A chave usada é o id_externo do parceiro, que é
-- estável por pessoa (421 ids <-> 421 nomes no TotalPass). Consequência:
-- quem usa Wellhub E TotalPass conta como duas pessoas, e o campo
-- 'cadastrado' diz se dá ou não pra chegar no contato dessa pessoa.
--
-- O bloco 'pessoas' é calculado sobre o HISTÓRICO INTEIRO (não só o período),
-- porque "nunca voltou" e "sumiu há 30 dias" não fazem sentido dentro de uma
-- janela: 'entradas'/'dias' são do período, 'total_geral'/'primeira'/'ultima'
-- são de sempre.
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

  with fonte as (
    -- Parceiros (Wellhub/TotalPass)
    select
      e.origem::text as origem,
      coalesce(e.cliente_id::text, e.origem || ':' || coalesce(e.id_externo, e.id::text))::text as chave,
      coalesce(
        c.nome,
        nullif(trim(concat_ws(' ', e.raw->'event_data'->'user'->>'first_name',
                                   e.raw->'event_data'->'user'->>'last_name')), ''),
        nullif(trim(e.raw->'user'->>'name'), ''),
        'Sem nome'
      )::text as nome,
      e.cliente_id,
      (e.recebido_em at time zone 'America/Sao_Paulo') as ts
    from entradas_walkin e
    left join clientes c on c.id = e.cliente_id
    where e.unidade_id = v_ct
      and coalesce(e.status, '') <> 'observado'

    union all

    -- Walk-in com crédito nosso
    select
      'credito'::text,
      ('cliente:' || a.cliente_id::text)::text,
      coalesce(c.nome, 'Cliente removido')::text,
      a.cliente_id,
      (a.criado_em at time zone 'America/Sao_Paulo')
    from acessos_livres_ct a
    left join clientes c on c.id = a.cliente_id
    where a.unidade_id = v_ct
      and a.cancelado_em is null
  ),
  periodo as (
    select * from fonte where ts::date between p_inicio and p_fim
  ),
  pessoas as (
    select
      f.chave,
      (array_agg(f.nome   order by f.ts desc))[1] as nome,   -- nome mais recente que o parceiro mandou
      (array_agg(f.origem order by f.ts desc))[1] as origem,
      bool_or(f.cliente_id is not null)           as cadastrado,
      count(*)                                    as total_geral,
      count(distinct f.ts::date)                  as dias_geral,
      min(f.ts)::date                             as primeira,
      max(f.ts)::date                             as ultima,
      count(*) filter (where f.ts::date between p_inicio and p_fim)                    as entradas,
      count(distinct f.ts::date) filter (where f.ts::date between p_inicio and p_fim)  as dias
    from fonte f
    group by f.chave
  )
  select jsonb_build_object(
    'hoje',   v_hoje,
    'inicio', p_inicio,
    'fim',    p_fim,

    'resumo', (
      select jsonb_build_object(
        'entradas',  count(*),
        'pessoas',   count(distinct chave),
        'dias',      count(distinct ts::date),
        'wellhub',   count(*) filter (where origem = 'wellhub'),
        'totalpass', count(*) filter (where origem = 'totalpass'),
        'credito',   count(*) filter (where origem = 'credito'),
        -- estreantes: primeira entrada da vida dentro do período consultado
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
          'pessoas',   count(distinct chave)
        ) as x
        from periodo
        group by ts::date
      ) t
    ), '[]'::jsonb),

    -- hora x dia da semana; 'dias' é quantos dias daquele dia-da-semana tiveram
    -- movimento naquela hora, pra dar pra ver média e não só volume bruto.
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

    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chave',       chave,
        'nome',        nome,
        'origem',      origem,
        'cadastrado',  cadastrado,
        'entradas',    entradas,
        'dias',        dias,
        'total_geral', total_geral,
        'dias_geral',  dias_geral,
        'primeira',    primeira,
        'ultima',      ultima
      ) order by entradas desc, total_geral desc)
      from pessoas
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.musculacao_livre_relatorio(date, date) TO authenticated;
