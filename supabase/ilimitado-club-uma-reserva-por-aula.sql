-- ══════════════════════════════════════════════════════════════════════════
-- Plano Ilimitado JustClub: UMA reserva por aula (só o titular)
-- ══════════════════════════════════════════════════════════════════════════
--
-- O QUE ACONTECIA
-- O site tem, de propósito, a "reserva extra" (botão "+ Reservar outra
-- posição" / "+ Reservar de novo"): quem já está na aula pode pegar mais uma
-- vaga PAGANDO com crédito avulso — é como o aluno leva um acompanhante.
--
-- Só que o plano Ilimitado (produtos.subtipo = 'ilimitado_club') é
-- materializado como 30 créditos em creditos_avulsos por mês, com
-- observacao = nome do produto. Ou seja: o ilimitado ENTRA no pote 'avulso'
-- e destravava a reserva extra. Resultado real (20/09/2026, Running 11:00 da
-- Vila Olímpia): a mesma aluna do Ilimitado Semestral ficou com F06 e F07 na
-- mesma aula, queimando 2 créditos do próprio plano.
--
-- A REGRA
-- Crédito vindo de plano ilimitado vale para UMA posição por aula. Pacote de
-- créditos comprado continua podendo levar acompanhante — não mexemos nisso.
--
-- ONDE ENTRA
-- No trigger que já existe (trg_validar_duplicidade_reserva_club, BEFORE
-- INSERT/UPDATE em club_reservas). Ele roda DEPOIS do
-- trg_atribuir_credito_avulso_club (ordem alfabética dos triggers), então
-- NEW.credito_avulso_id já está preenchido quando chegamos aqui.
-- ══════════════════════════════════════════════════════════════════════════

-- Helper: essa reserva é uma 2ª vaga do mesmo cliente na mesma aula, paga com
-- crédito de plano ilimitado? SECURITY DEFINER porque o trigger roda no
-- contexto do cliente, que não enxerga a tabela produtos pela RLS — sem isso a
-- trava simplesmente não pegaria pra quem reserva pelo site.
CREATE OR REPLACE FUNCTION public.reserva_extra_ilimitado_bloqueada(
  p_cliente_id uuid, p_ocorrencia_id uuid, p_credito_id uuid, p_reserva_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
           SELECT 1 FROM creditos_avulsos ca
           JOIN produtos p ON p.nome = ca.observacao AND p.subtipo = 'ilimitado_club'
           WHERE ca.id = p_credito_id
         )
     AND EXISTS (
           SELECT 1 FROM club_reservas cr
           WHERE cr.cliente_id   = p_cliente_id
             AND cr.ocorrencia_id = p_ocorrencia_id
             AND cr.status <> 'cancelado'
             AND cr.id <> p_reserva_id
         );
$$;

CREATE OR REPLACE FUNCTION public.validar_duplicidade_reserva_club()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_app  text;
  v_data date;
BEGIN
  -- No UPDATE só interessa a REATIVAÇÃO (a recepção reaproveita uma reserva
  -- cancelada em vez de inserir outra). Marcar presença/falta não passa aqui.
  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'cancelado' AND NEW.status <> 'cancelado') THEN
    RETURN NEW;
  END IF;

  -- Plano ilimitado: uma posição por aula. Vale para qualquer origem (site,
  -- recepção, admin, WhatsApp) — é regra do produto, não da tela.
  IF NEW.credito_avulso_id IS NOT NULL
     AND public.reserva_extra_ilimitado_bloqueada(NEW.cliente_id, NEW.ocorrencia_id,
                                                  NEW.credito_avulso_id, NEW.id) THEN
    RAISE EXCEPTION 'ILIMITADO_1_POR_AULA: o plano ilimitado vale só para o titular — uma posição por aula. Para levar alguém, use um pacote de créditos avulsos.';
  END IF;

  v_app := public.app_parceiro_do_credito(NEW.tipo_credito);
  IF v_app IS NULL THEN RETURN NEW; END IF;

  IF NOT public.origem_sujeita_trava_app(NEW.criado_via, NEW.via_app) THEN
    RETURN NEW;
  END IF;

  SELECT co.data INTO v_data FROM club_ocorrencias co WHERE co.id = NEW.ocorrencia_id;
  IF v_data IS NULL THEN RETURN NEW; END IF;

  IF public.tem_treino_do_app_no_dia(NEW.cliente_id, v_data, v_app, NULL, NEW.id) THEN
    RAISE EXCEPTION 'APP_1_POR_DIA: você já tem um treino nesse dia usando o %. Cada app permite apenas um treino por dia, em qualquer unidade.',
      public.nome_app_parceiro(v_app);
  END IF;

  RETURN NEW;
END;
$function$;
