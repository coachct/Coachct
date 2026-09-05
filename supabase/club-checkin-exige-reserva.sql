-- Club: check-in de parceiro só vale com reserva casada
--
-- Pedido do Ricardo em 05/09/2026: nas unidades CLUB (aulas), o check-in do
-- Wellhub/TotalPass estava sendo validado AUTOMATICAMENTE, mesmo de quem não
-- tinha reserva. A pessoa batia no app, o check-in já saía válido, e só na
-- recepção descobria que não havia vaga na aula — check-in queimado e cliente
-- irritado. No Just CT (musculação) nada muda: lá o check-in é livre mesmo.
--
-- Estas funções respondem UMA pergunta: "essa pessoa tem reserva nesta unidade
-- hoje, com o plano deste parceiro?". Quem decide o que fazer com a resposta são
-- os receivers (/api/wellhub/checkin e /api/totalpass/checkin/[token]): com
-- reserva, validam de volta como sempre; sem reserva, NÃO validam.
--
-- Critérios (de propósito mais amplos que os das RPCs de presença, pra não
-- recusar quem tem reserva de verdade):
--   * QUALQUER reserva ativa do dia naquela unidade, feita no app ou no site,
--     com o plano que for. Testado contra 7 dias de check-ins reais: filtrar
--     pelo `tipo_credito` do parceiro reprovava quem reservou com o Wellhub e
--     bateu o crachá da TotalPass — tem vaga do mesmo jeito, e não é esse que a
--     gente quer barrar;
--   * status 'reservado', 'presente' ou 'falta' (presente cobre o caso da
--     presença já ter sido marcada antes desta checagem; falta cobre quem
--     chegou atrasado e ainda pode ter a falta revertida);
--   * qualquer aula do DIA na unidade — sem janela de horário. Chegar cedo
--     demais não é o problema que estamos resolvendo; o problema é chegar SEM
--     reserva nenhuma;
--   * ocorrência cancelada não conta.
--
-- Impacto medido antes de ligar, sobre os check-ins reais dos últimos 7 dias:
-- 1082 check-ins no Club, 15 sem reserva (1,4% — ~2 por dia). Conferidos um a
-- um: todos com cadastro existente, nenhum era falha de identificação.
--
-- Identidade: a mesma das RPCs de presença — TotalPass casa por CPF, Wellhub
-- por wellhub_id, e-mail (próprio ou o do Wellhub) ou nome.
--
-- Funções STABLE de leitura: não escrevem nada.

create or replace function public.totalpass_club_tem_reserva(
  p_cpf text,
  p_unidade_id uuid,
  p_checkin_em timestamptz default null
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from club_reservas r
    join club_ocorrencias o on o.id = r.ocorrencia_id
    join club_aulas a       on a.id = o.aula_id
    join clientes c         on c.id = r.cliente_id
    where a.unidade_id = p_unidade_id
      and o.data = (coalesce(p_checkin_em, now()) at time zone 'America/Sao_Paulo')::date
      and o.status <> 'cancelada'
      and r.status in ('reservado', 'presente', 'falta')
      and regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') <> ''
      and regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
  );
$function$;

create or replace function public.wellhub_club_tem_reserva(
  p_gympass_id text,
  p_gym_id text,
  p_email text default null,
  p_nome text default null,
  p_checkin_em timestamptz default null
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from club_reservas r
    join club_ocorrencias o on o.id = r.ocorrencia_id
    join club_aulas a       on a.id = o.aula_id
    join clientes c         on c.id = r.cliente_id
    join unidades u         on u.id = a.unidade_id
    where u.wellhub_gym_id = p_gym_id
      and o.data = (coalesce(p_checkin_em, now()) at time zone 'America/Sao_Paulo')::date
      and o.status <> 'cancelada'
      and r.status in ('reservado', 'presente', 'falta')
      and (
        (coalesce(p_gympass_id, '') <> '' and c.wellhub_id = p_gympass_id)
        or (coalesce(p_email, '') <> '' and (
              lower(c.email) = lower(p_email) or lower(c.wellhub_email) = lower(p_email)
            ))
        or (coalesce(p_nome, '') <> '' and lower(c.nome) = lower(p_nome))
      )
  );
$function$;
