// src/lib/parceiros/limite-repasse-walkin.ts
//
// Teto de REPASSE por usuário/mês nos check-ins de walk-in (CT) que chegam de
// Wellhub/TotalPass. Confirmado no extrato oficial de ago/2026 da TotalPass:
// a partir do 10o check-in PAGO de uma mesma pessoa no mês, os seguintes vêm
// com motivo "Limite de repasse atingido" e repasse R$ 0,00 — somando os dois
// planos (Musculação Sala e Musculação com Personal), não por produto.
// Em agosto foram 182 check-ins nessa condição, de 42 usuários: R$ 8.452 de
// receita lançada a mais no CT (5,8%).
//
// Isto NÃO bloqueia nada: a pessoa treina normalmente e a entrada continua
// 'validado'. O que muda é só o valor financeiro gravado, que passa a ser 0
// com o motivo registrado em repasse_zerado_motivo.
//
// Não confundir com src/lib/parceiro-limite-mensal.ts, que é do Club, conta
// RESERVAS e BLOQUEIA a reserva. São regras e efeitos diferentes.
//
// Erro na consulta => mantém o valor de tabela. A trava nunca pode derrubar a
// gravação do check-in; na dúvida erra a favor do valor cheio, que é o
// comportamento de hoje.

import { SupabaseClient } from '@supabase/supabase-js';

export type ResultadoLimiteRepasse = {
  valor: number | null;
  motivo: string | null;
};

export async function aplicarLimiteRepasse(
  supabase: SupabaseClient,
  entradaId: string,
  valorTabela: number | null
): Promise<ResultadoLimiteRepasse> {
  // Sem valor a limitar (produto não mapeado ou já zerado): nada a fazer.
  if (valorTabela == null || valorTabela <= 0) {
    return { valor: valorTabela, motivo: null };
  }

  try {
    const { data: entrada } = await supabase
      .from('entradas_walkin')
      .select('unidade_id, origem, id_externo, recebido_em')
      .eq('id', entradaId)
      .maybeSingle();

    const unidadeId = (entrada as any)?.unidade_id as string | undefined;
    const origem = (entrada as any)?.origem as string | undefined;
    const idExterno = (entrada as any)?.id_externo as string | undefined;
    const recebidoEm = (entrada as any)?.recebido_em as string | undefined;
    if (!unidadeId || !origem || !idExterno) {
      return { valor: valorTabela, motivo: null };
    }

    const limite = await buscarLimite(supabase, origem, unidadeId);
    if (!limite || limite <= 0) return { valor: valorTabela, motivo: null };

    const { inicio, fim } = janelaMesSaoPaulo(recebidoEm ? new Date(recebidoEm) : new Date());

    // Conta os check-ins do MESMO usuário, na MESMA unidade e origem, no mês,
    // que já foram pagos (valor > 0). Exclui a própria entrada.
    const { data: pagos, error } = await supabase
      .from('entradas_walkin')
      .select('id')
      .eq('unidade_id', unidadeId)
      .eq('origem', origem)
      .eq('id_externo', idExterno)
      .eq('status', 'validado')
      .gt('valor', 0)
      .gte('recebido_em', inicio)
      .lt('recebido_em', fim)
      .neq('id', entradaId);

    if (error || !pagos) {
      console.warn(
        '[limite-repasse] falha ao contar check-ins pagos — mantendo valor de tabela:',
        error?.message
      );
      return { valor: valorTabela, motivo: null };
    }

    if (pagos.length < limite) return { valor: valorTabela, motivo: null };

    return {
      valor: 0,
      motivo: `limite_repasse_estimado (${pagos.length}/${limite})`,
    };
  } catch (e: any) {
    console.warn('[limite-repasse] erro — mantendo valor de tabela:', e?.message ?? e);
    return { valor: valorTabela, motivo: null };
  }
}

// Teto vigente para a origem na unidade. Linha específica da unidade tem
// precedência sobre a linha geral (unidade_id null). Sem linha ativa => sem
// teto (a tabela é a única fonte; não há default no código de propósito, pra
// desligar a regra bastar marcar ativo=false).
async function buscarLimite(
  supabase: SupabaseClient,
  origem: string,
  unidadeId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from('repasse_limites')
    .select('limite_mensal_usuario, unidade_id')
    .eq('origem', origem)
    .eq('ativo', true);

  if (error || !data || data.length === 0) return null;

  const especifica = data.find((r: any) => r.unidade_id === unidadeId);
  const geral = data.find((r: any) => r.unidade_id == null);
  const row: any = especifica ?? geral;
  if (!row) return null;

  const n = Number(row.limite_mensal_usuario);
  return Number.isFinite(n) ? n : null;
}

// Início e fim do mês civil em America/Sao_Paulo (UTC-3 fixo desde 2019),
// no formato que o PostgREST compara corretamente com timestamptz.
function janelaMesSaoPaulo(ref: Date): { inicio: string; fim: string } {
  const sp = new Date(ref.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const ano = sp.getFullYear();
  const mes = sp.getMonth(); // 0-11
  const pad = (n: number) => String(n).padStart(2, '0');

  const proxAno = mes === 11 ? ano + 1 : ano;
  const proxMes = mes === 11 ? 0 : mes + 1;

  return {
    inicio: `${ano}-${pad(mes + 1)}-01T00:00:00-03:00`,
    fim: `${proxAno}-${pad(proxMes + 1)}-01T00:00:00-03:00`,
  };
}
