-- plano-minimo-parceiro.sql
-- Adiciona o tier mínimo aceito de cada app parceiro (Wellhub/TotalPass) por plano.
-- A página /meus-planos faz select('*'), então o campo flui automaticamente pro front.

ALTER TABLE planos_disponiveis ADD COLUMN IF NOT EXISTS plano_minimo_parceiro text;

-- Wellhub
UPDATE planos_disponiveis SET plano_minimo_parceiro = 'Diamond'
  WHERE tipo = 'wellhub'
    AND unidade_id = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef';
UPDATE planos_disponiveis SET plano_minimo_parceiro = 'Gold'
  WHERE tipo = 'wellhub'
    AND unidade_id IN ('166a683d-5fe6-4177-8fd6-53deb70b428e',
                       '05eeab3e-5eae-4140-bc3a-1c1d56ac95be');

-- TotalPass
UPDATE planos_disponiveis SET plano_minimo_parceiro = 'TP6'
  WHERE tipo = 'totalpass'
    AND unidade_id = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef';
UPDATE planos_disponiveis SET plano_minimo_parceiro = 'TP3'
  WHERE tipo = 'totalpass'
    AND unidade_id IN ('166a683d-5fe6-4177-8fd6-53deb70b428e',
                       '05eeab3e-5eae-4140-bc3a-1c1d56ac95be');
