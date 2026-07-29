-- ============================================================================
-- 2ª camada: bloqueia a ENTRADA na fila do Club para quem já tem reserva no dia
-- ============================================================================
-- Complementa o fix-fila-club-nao-derruba-cancelamento.sql. Aquele conserta a
-- PROMOÇÃO (pula quem não pode ser promovido, nunca derruba o cancelamento).
-- Este evita o problema na ORIGEM: uma pessoa Wellhub/TotalPass que já tem reserva
-- ativa no mesmo dia/unidade/tipo NÃO pode entrar na fila de outra aula no mesmo dia
-- (a trava de 1-por-dia nunca deixaria promovê-la — a fila seria inútil).
--
-- Cobre TODOS os caminhos (bot + site), porque está no BEFORE INSERT de fila_espera.
-- Fail-open: só faz RAISE no caso confirmado; CT/personal (ocorrencia_id NULL),
-- outros créditos, ou ocorrência não encontrada → retorna NEW sem atrapalhar.
-- No bot, acoes.ts/entrarFilaClub detecta a mensagem "já tem uma reserva" e mostra
-- um aviso amigável (sem "erro técnico").
-- Idempotente (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- Aplicado em produção 2026-07-29 (migration bloqueia_entrada_fila_club_se_ja_tem_reserva_no_dia).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validar_duplicidade_fila_club()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_data date;
  v_unidade_id uuid;
BEGIN
  -- Só fila de aula do Club (tem ocorrencia_id) e só Wellhub/TotalPass têm a trava.
  IF NEW.ocorrencia_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.tipo_credito NOT LIKE 'wellhub%' AND NEW.tipo_credito NOT LIKE 'totalpass%' THEN
    RETURN NEW;
  END IF;

  -- Deriva data + unidade da ocorrência (não confia em colunas de NEW).
  SELECT co.data, ca.unidade_id INTO v_data, v_unidade_id
  FROM club_ocorrencias co
  JOIN club_aulas ca ON ca.id = co.aula_id
  WHERE co.id = NEW.ocorrencia_id;

  -- Ocorrência não encontrada → não bloqueia (fail-open).
  IF v_data IS NULL THEN RETURN NEW; END IF;

  -- Já tem reserva ativa no mesmo dia/unidade/tipo? Entrar na fila é inútil → barra.
  IF EXISTS (
    SELECT 1
    FROM club_reservas cr
    JOIN club_ocorrencias co ON co.id = cr.ocorrencia_id
    JOIN club_aulas ca ON ca.id = co.aula_id
    WHERE cr.cliente_id   = NEW.cliente_id
      AND cr.tipo_credito = NEW.tipo_credito
      AND cr.status       NOT IN ('cancelado')
      AND co.data         = v_data
      AND ca.unidade_id   = v_unidade_id
  ) THEN
    RAISE EXCEPTION 'Você já tem uma reserva nesta unidade neste dia usando o mesmo plano (%). Wellhub e TotalPass permitem apenas uma por dia por unidade, então não dá pra entrar na fila de outra aula no mesmo dia.', NEW.tipo_credito;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_duplicidade_fila_club ON public.fila_espera;
CREATE TRIGGER trg_validar_duplicidade_fila_club
  BEFORE INSERT ON public.fila_espera
  FOR EACH ROW EXECUTE FUNCTION public.validar_duplicidade_fila_club();
