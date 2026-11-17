-- Acerto mensal da Ju (17/11/2026).
-- Acordo: 2% do faturamento dos apps (Wellhub + TotalPass das unidades) do mês
-- de competência + R$ 1.000 por unidade. Acerta-se todo dia 15 sobre o mês anterior.
--
-- SÓ o Ricardo enxerga: a função responde apenas ao usuário dele. A regra do
-- acordo fica aqui no banco (não no código da tela) justamente pra não vazar
-- pra Ju (coordenadora) nem pro Financeiro (admin), que também abrem o /admin.
-- Só leitura: não lança nada em despesas / contas a pagar.

create or replace function public.acerto_ju(p_competencia date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dono constant uuid := '8865c4fe-1da3-4517-b1b4-fdf521e5dc03'; -- ricardo@justclub.com.br
  v_percentual constant numeric := 0.02;
  v_fixo_por_unidade constant numeric := 1000;
  v_comp date := date_trunc('month', p_competencia)::date;
  v_linhas jsonb;
  v_faturamento numeric;
  v_unidades int;
  v_faltando jsonb;
  v_comissao numeric;
  v_fixo numeric;
begin
  if auth.uid() is distinct from v_dono then
    raise exception 'ACESSO_NEGADO' using errcode = '42501';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'unidade', x.nome, 'wellhub', x.wellhub, 'totalpass', x.totalpass
    ) order by x.nome), '[]'::jsonb),
    coalesce(sum(x.wellhub + x.totalpass), 0),
    count(*),
    coalesce(jsonb_agg(x.nome || ' — Wellhub' order by x.nome) filter (where not x.tem_wellhub), '[]'::jsonb)
      || coalesce(jsonb_agg(x.nome || ' — TotalPass' order by x.nome) filter (where not x.tem_totalpass), '[]'::jsonb)
  into v_linhas, v_faturamento, v_unidades, v_faltando
  from (
    select
      u.nome,
      coalesce(sum(r.valor) filter (where r.origem = 'wellhub'), 0)   as wellhub,
      coalesce(sum(r.valor) filter (where r.origem = 'totalpass'), 0) as totalpass,
      count(*) filter (where r.origem = 'wellhub') > 0   as tem_wellhub,
      count(*) filter (where r.origem = 'totalpass') > 0 as tem_totalpass
    from unidades u
    left join receitas r
      on r.unidade_id = u.id
     and r.excluido_em is null
     and r.competencia = v_comp
     and r.origem in ('wellhub', 'totalpass')
    group by u.id, u.nome
  ) x;

  v_comissao := round(v_faturamento * v_percentual, 2);
  v_fixo := v_unidades * v_fixo_por_unidade;

  return jsonb_build_object(
    'competencia', v_comp,
    'linhas', v_linhas,
    'faturamento', v_faturamento,
    'percentual', v_percentual,
    'comissao', v_comissao,
    'fixo_por_unidade', v_fixo_por_unidade,
    'unidades', v_unidades,
    'fixo', v_fixo,
    'total', v_comissao + v_fixo,
    'faltando', v_faltando
  );
end;
$$;

revoke all on function public.acerto_ju(date) from public, anon;
grant execute on function public.acerto_ju(date) to authenticated;
