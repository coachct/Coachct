-- =============================================
-- ÚLTIMAS CARGAS DO CLIENTE (tela do coach)
-- Aplicado em produção em 2026-07-16.
-- =============================================
--
-- PROBLEMA
-- As policies "Coach vê e cria suas aulas" (aulas) e "Coach acessa registros de
-- suas aulas" (registros_carga) restringem o coach às aulas em que ele é o coach.
-- Ao abrir o treino de um aluno atendido por OUTRO coach em outro dia, a consulta
-- do histórico voltava vazia — sem erro — e a "última carga máxima neste
-- exercício" não aparecia. Era essa a queixa dos coaches.
--
-- POR QUE NÃO AMPLIAR A POLICY DE aulas
-- admin/relatorios/custo, admin/relatorios/pagamentos e admin/analytics consultam
-- `aulas` sem filtrar coach_id. Hoje a RLS é o que impede um coach de enxergar
-- custo/pagamento dos outros. Liberar `aulas` para todo coach abriria isso.
--
-- SOLUÇÃO
-- Função SECURITY DEFINER de superfície mínima: devolve apenas exercicio_id +
-- carga máxima daquele cliente. Nada de aula, coach, data ou valor sai daqui.
-- O `exists` sobre perfis é o guard: quem não for coach/coordenadora/admin
-- recebe vazio, mesmo a função rodando como owner.
--
-- GOTCHA: no SQL Editor do Supabase auth.uid() é null, então a função devolve
-- vazio. Isso é o guard funcionando, não um defeito. Teste pelo app.

create or replace function public.ultimas_cargas_cliente(p_cliente_id uuid)
returns table (exercicio_id uuid, carga_kg numeric)
language sql
stable
security definer
set search_path = public
as $$
  select rc.exercicio_id, max(rc.carga_kg) as carga_kg
  from public.registros_carga rc
  join public.aulas a on a.id = rc.aula_id
  where a.cliente_id = p_cliente_id
    and rc.carga_kg is not null
    and exists (
      select 1 from public.perfis p
      where p.id = auth.uid() and p.role in ('admin', 'coach', 'coordenadora')
    )
  group by rc.exercicio_id;
$$;

revoke all on function public.ultimas_cargas_cliente(uuid) from public, anon;
grant execute on function public.ultimas_cargas_cliente(uuid) to authenticated;
