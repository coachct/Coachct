-- Vínculo display-only entre reserva Club e o crédito avulso que ela representa.
-- NÃO altera a lógica de saldo (o RPC segue contando reservas ao vivo).
-- NÃO marca creditos_avulsos.usado. Serve para exibir o nome do pacote e
-- detalhar o consumo por pacote no perfil do cliente.

ALTER TABLE public.club_reservas
  ADD COLUMN IF NOT EXISTS credito_avulso_id UUID
  REFERENCES public.creditos_avulsos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_club_reservas_credito_avulso
  ON public.club_reservas(credito_avulso_id)
  WHERE credito_avulso_id IS NOT NULL;
