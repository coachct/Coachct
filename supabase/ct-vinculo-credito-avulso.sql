-- Consumo do credito avulso no Coach CT (Just CT).
--
-- Problema corrigido: o avulso de "Coach CT Avulso" e consumido por um AGENDAMENTO
-- (nao por reserva de Club). A RPC saldo_creditos_cliente so descontava reservas de
-- Club no laco de avulsos por unidade -> o credito pago aparecia SEMPRE disponivel e
-- liberava agendamentos ilimitados (1 por dia). Espelho do que o Club ja fazia em
-- club-vinculo-credito-avulso*.sql, mas para agendamentos do CT.
--
-- Modelo: ao criar o agendamento pago com avulso, amarra o credito valido que expira
-- primeiro (usado = true, agendamento_id = <agendamento>). Ao cancelar, devolve o
-- credito. A RPC volta a ler o saldo por usado (respeita validade, nao bloqueia compra
-- nova). Triggers SECURITY DEFINER e a prova de falha: nunca derrubam o agendamento.

-- 1. Consome (amarra) um credito avulso ao criar o agendamento.
CREATE OR REPLACE FUNCTION public.consumir_avulso_ct_no_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_slug text;
  v_credito_id uuid;
BEGIN
  IF NEW.status = 'cancelado' THEN RETURN NEW; END IF;
  IF NEW.tipo_credito IS NULL OR NEW.tipo_credito NOT LIKE 'avulso\_%' THEN
    RETURN NEW;
  END IF;

  SELECT slug INTO v_slug FROM unidades WHERE id = NEW.unidade_id;
  IF v_slug IS NULL OR NEW.tipo_credito <> 'avulso_' || v_slug THEN
    RETURN NEW;
  END IF;

  -- Reprocesso: se este agendamento ja consumiu um credito, nao consome de novo.
  IF EXISTS (SELECT 1 FROM creditos_avulsos WHERE agendamento_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT ca.id INTO v_credito_id
  FROM creditos_avulsos ca
  WHERE ca.cliente_id = NEW.cliente_id
    AND ca.unidade_id = NEW.unidade_id
    AND ca.tipo = 'credito_coach'          -- NUNCA credito_treino (walk-in)
    AND ca.usado = false
    AND ca.validade >= CURRENT_DATE
    AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%')
  ORDER BY ca.validade ASC, ca.comprado_em ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_credito_id IS NOT NULL THEN
    UPDATE creditos_avulsos
    SET usado = true, agendamento_id = NEW.id
    WHERE id = v_credito_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- nunca derruba o agendamento do cliente
END;
$$;

-- 2. Devolve o credito quando o agendamento e cancelado.
CREATE OR REPLACE FUNCTION public.liberar_avulso_ao_cancelar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'cancelado' AND (OLD.status IS NULL OR OLD.status <> 'cancelado') THEN
    UPDATE creditos_avulsos
    SET usado = false, agendamento_id = NULL
    WHERE agendamento_id = NEW.id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_agendamento_consumir_avulso ON agendamentos;
CREATE TRIGGER on_agendamento_consumir_avulso
AFTER INSERT ON agendamentos
FOR EACH ROW EXECUTE FUNCTION consumir_avulso_ct_no_agendamento();

DROP TRIGGER IF EXISTS on_agendamento_liberar_avulso ON agendamentos;
CREATE TRIGGER on_agendamento_liberar_avulso
AFTER UPDATE ON agendamentos
FOR EACH ROW EXECUTE FUNCTION liberar_avulso_ao_cancelar();

-- 2b. Agendamento APAGADO (nao cancelado): a FK creditos_avulsos_agendamento_id_fkey
--     e ON DELETE SET NULL, entao o vinculo zeraria mas `usado` ficaria true e o
--     cliente perderia o credito em silencio. Este BEFORE DELETE devolve antes da FK.
CREATE OR REPLACE FUNCTION public.liberar_avulso_ao_apagar_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE creditos_avulsos
  SET usado = false, agendamento_id = NULL
  WHERE agendamento_id = OLD.id;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_agendamento_apagado_liberar_avulso ON agendamentos;
CREATE TRIGGER on_agendamento_apagado_liberar_avulso
BEFORE DELETE ON agendamentos
FOR EACH ROW EXECUTE FUNCTION liberar_avulso_ao_apagar_agendamento();

-- ============================================================================
-- REGRA FORTE DO SISTEMA: COACH CT nao e WALK-IN.
--
--   AGENDAR COACH CT  -> SOMENTE credito avulso Coach CT (tipo 'credito_coach',
--                        unidade Just CT) OU app do CT ativo (Wellhub/TotalPass
--                        Just CT, que entram por outro caminho: cliente_creditos
--                        + plano ativo, chaves wellhub_just_ct / totalpass_just_ct).
--
--   LANCAR WALK-IN    -> Treino Avulso e QUALQUER pacote de treinos
--                        (tipo 'credito_treino'). Valem nas 3 UNIDADES —
--                        por isso o walk-in NAO filtra unidade.
--
--   Credito de Coach CT NUNCA vale para walk-in, e credito de treino NUNCA
--   vale para agendar Coach CT.
--
-- Os dois tipos convivem na unidade Just CT, entao filtrar so por `unidade_id`
-- NAO basta — tem que checar `tipo`. A flag `usado` e compartilhada pelos dois
-- fluxos (registrar_acesso_livre_ct marca o walk-in; o trigger acima marca o
-- Coach CT); a checagem de tipo e o que separa os potes. Credito com usado=true
-- e agendamento_id NULL = consumo de walk-in.
--
-- Os 3 pontos que aplicam a regra (alem do trigger acima):
--   1. saldo_creditos_cliente: no laco de avulsos por unidade, unidade tipo 'ct'
--      so conta credito_coach  ->  AND (u.tipo <> 'ct' OR ca.tipo = 'credito_coach')
--   2. registrar_acesso_livre_ct: AND tipo = 'credito_treino' (sem filtro de unidade)
--   3. src/app/recepcao/musculacao-livre/page.tsx: .eq('tipo','credito_treino')
-- ============================================================================

-- 5. Walk-in so consome credito de treino (sem filtro de unidade: vale nas 3).
CREATE OR REPLACE FUNCTION public.registrar_acesso_livre_ct(p_cliente_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role       text;
  v_hoje       date := (now() at time zone 'America/Sao_Paulo')::date;
  v_credito_id uuid;
  v_acesso_id  uuid;
begin
  select role into v_role from perfis where id = auth.uid();
  if v_role is null or v_role <> all (array['admin','coordenadora','recepcao']) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  select id into v_credito_id
  from creditos_avulsos
  where cliente_id = p_cliente_id
    and tipo = 'credito_treino'   -- NUNCA credito_coach
    and usado = false
    and validade >= v_hoje
  order by validade asc
  limit 1
  for update skip locked;

  if v_credito_id is null then
    raise exception 'SEM_CREDITO';
  end if;

  update creditos_avulsos set usado = true where id = v_credito_id;

  insert into acessos_livres_ct (cliente_id, credito_avulso_id, data, registrado_por)
  values (p_cliente_id, v_credito_id, v_hoje, auth.uid())
  returning id into v_acesso_id;

  return v_acesso_id;
end;
$function$;

-- 3. Backfill dos agendamentos de CT ja ativos.
--
--    ATENCAO: parear por ordem de data (row_number de um lado contra o outro) esta
--    ERRADO — amarra credito comprado em julho a aula feita em junho, ou seja, gasta
--    credito novo pagando aula velha (aconteceu de verdade com 3 creditos). O pareamento
--    tem que respeitar a linha do tempo: um credito so paga uma aula AGENDADA DEPOIS da
--    compra e valida NA DATA da aula. Assim os creditos antigos/vencidos absorvem as
--    aulas antigas e os creditos novos ficam disponiveis.
--
--    Agendamentos alem do numero de creditos ficam sem vinculo (consumo historico
--    nao recuperavel — sessoes feitas antes da correcao, sem credito correspondente).
DO $$
DECLARE
  r_ag record;
  v_cred uuid;
BEGIN
  -- Desfaz vinculos impossiveis (agendamento criado ANTES da compra do credito).
  UPDATE creditos_avulsos ca
  SET usado = false, agendamento_id = NULL
  FROM agendamentos a
  WHERE a.id = ca.agendamento_id
    AND a.criado_em < ca.comprado_em;

  -- Desfaz cruzamento de produto: credito de walk-in pagando aula de Coach CT.
  UPDATE creditos_avulsos ca
  SET usado = false, agendamento_id = NULL
  WHERE ca.agendamento_id IS NOT NULL
    AND ca.tipo <> 'credito_coach';

  FOR r_ag IN
    SELECT a.id, a.cliente_id, a.unidade_id, a.criado_em, a.data
    FROM agendamentos a
    JOIN unidades u ON u.id = a.unidade_id AND u.tipo = 'ct'
    WHERE a.tipo_credito = 'avulso_' || u.slug
      AND a.status NOT IN ('cancelado')
      AND NOT EXISTS (SELECT 1 FROM creditos_avulsos c WHERE c.agendamento_id = a.id)
    ORDER BY a.criado_em
  LOOP
    SELECT ca.id INTO v_cred
    FROM creditos_avulsos ca
    WHERE ca.cliente_id = r_ag.cliente_id
      AND ca.unidade_id = r_ag.unidade_id
      AND ca.tipo = 'credito_coach'          -- NUNCA credito_treino (walk-in)
      AND ca.usado = false
      AND ca.agendamento_id IS NULL
      AND ca.comprado_em <= r_ag.criado_em   -- credito existia quando agendou
      AND ca.validade >= r_ag.data           -- credito valido na data da aula
      AND (ca.observacao IS NULL OR ca.observacao NOT LIKE 'Migração%')
    ORDER BY ca.validade ASC, ca.comprado_em ASC
    LIMIT 1;

    IF v_cred IS NOT NULL THEN
      UPDATE creditos_avulsos SET usado = true, agendamento_id = r_ag.id WHERE id = v_cred;
    END IF;
  END LOOP;
END $$;

-- Conferencia: tem que dar 0.
-- SELECT count(*) FROM creditos_avulsos ca JOIN agendamentos a ON a.id = ca.agendamento_id
-- WHERE a.criado_em < ca.comprado_em OR ca.validade < a.data;

-- 4. A RPC saldo_creditos_cliente volta a calcular o avulso por unidade lendo a flag
--    `usado` (sem descontar a contagem de agendamentos, que bloquearia compra nova).
--    Ver a definicao completa da funcao no schema/migracao correspondente.
