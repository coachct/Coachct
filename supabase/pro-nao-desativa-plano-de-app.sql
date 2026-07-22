-- App Coach CT PRO e COMPLEMENTO do app, nao substituto.
--
-- Incidente (22/07/2026): cliente comprava o App Coach CT PRO trimestral e
-- perdia o plano Wellhub/TotalPass. Os creditos do mes "sumiam" do perfil e do
-- agendamento — so sobravam os 12 creditos do PRO. Relato da cliente Thaiane:
-- "nao consigo mais ativar meu plano wellhub e tbm os creditos q ainda tinham
-- esse mes sumiram. Agora so consigo fazer agendamento gastando os 12 extras".
--
-- CAUSA: no ramo `coach_ct_pro` de registrar_venda:
--
--     UPDATE cliente_planos SET ativo = false, atualizado_em = now()
--     WHERE cliente_id = p_cliente_id AND ativo = true;   -- <- desativava TUDO
--
-- Isso derrubava o plano de app junto. Como saldo_creditos_cliente so mostra o
-- balde de um app se existir cliente_planos ATIVO daquele tipo, o saldo do mes
-- desaparecia inteiro (os creditos em cliente_creditos continuavam la).
-- Sintoma tipico: cliente_planos com ativo=false e fim=NULL (o botao manual
-- "Desativar plano" sempre grava fim=hoje; esta funcao nao gravava).
--
-- REGRA: quem tem app mantem o app ATIVO e ganha os beneficios do PRO —
-- escolhe na hora da reserva se usa o credito do app ou o credito do plano.
-- A venda do PRO pode desativar um PRO anterior (renovacao), NUNCA wellhub/totalpass.
--
-- Afetados e restaurados: Thaiane Chagastelles, Thais Meirelles, Patricia gurzone.

-- 1. Correcao da funcao (so o UPDATE do ramo coach_ct_pro mudou):
--
--     UPDATE cliente_planos cp
--     SET ativo = false, atualizado_em = now()
--     WHERE cp.cliente_id = p_cliente_id
--       AND cp.ativo = true
--       AND NOT EXISTS (
--         SELECT 1 FROM planos_disponiveis pd
--         WHERE pd.id = cp.plano_id AND pd.tipo IN ('wellhub','totalpass')
--       );
--
-- (funcao completa aplicada na migration pro_nao_desativa_plano_de_app)

-- 2. Restaura quem ja tinha sido derrubado: plano de app inativo, sem `fim`,
--    desativado exatamente no instante da venda do PRO.
UPDATE cliente_planos cp
SET ativo = true, atualizado_em = now()
FROM planos_disponiveis pd
WHERE pd.id = cp.plano_id
  AND pd.tipo IN ('wellhub','totalpass')
  AND cp.ativo = false
  AND cp.fim IS NULL
  AND EXISTS (
    SELECT 1 FROM vendas v
    JOIN produtos pr ON pr.id = v.produto_id AND pr.subtipo = 'coach_ct_pro'
    WHERE v.cliente_id = cp.cliente_id
      AND v.vendido_em = cp.atualizado_em
  );

-- 3. Conferencia: tem que voltar vazio.
-- SELECT c.nome, pd.tipo FROM cliente_planos cp
-- JOIN planos_disponiveis pd ON pd.id = cp.plano_id AND pd.tipo IN ('wellhub','totalpass')
-- JOIN clientes c ON c.id = cp.cliente_id
-- WHERE cp.ativo = false AND cp.fim IS NULL
--   AND EXISTS (SELECT 1 FROM cliente_planos p2
--               JOIN planos_disponiveis pd2 ON pd2.id = p2.plano_id AND pd2.tipo='coach_ct_pro'
--               WHERE p2.cliente_id = cp.cliente_id AND p2.ativo = true);
