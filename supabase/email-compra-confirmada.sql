-- E-mail de compra confirmada (site, balcão e admin).
-- Toda venda entra em `vendas` (registrar_venda); este gatilho só enfileira o
-- aviso em notificacoes_pendentes. O /api/processar-notificacoes (cron 5 min)
-- monta o e-mail lendo a venda e o que ela gerou (créditos/plano) — por isso
-- a mensagem guarda só o venda_id.
-- Fora: multas (subtipo 'multa') e loja (não passa por `vendas`).
-- À prova de falha: se algo der errado aqui, a venda segue normalmente.

CREATE OR REPLACE FUNCTION public.enfileirar_email_compra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_subtipo text;
  v_email text;
BEGIN
  BEGIN
    IF NEW.cliente_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT subtipo INTO v_subtipo FROM produtos WHERE id = NEW.produto_id;
    IF v_subtipo = 'multa' THEN
      RETURN NEW;
    END IF;

    SELECT NULLIF(trim(email), '') INTO v_email FROM clientes WHERE id = NEW.cliente_id;
    IF v_email IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO notificacoes_pendentes (cliente_id, tipo, canal, destino, mensagem, status, unidade_id)
    VALUES (NEW.cliente_id, 'compra_confirmada', 'email', v_email, NEW.id::text, 'pendente', NEW.unidade_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enfileirar_email_compra falhou (venda %): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_compra ON public.vendas;
CREATE TRIGGER trg_email_compra
  AFTER INSERT ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.enfileirar_email_compra();
