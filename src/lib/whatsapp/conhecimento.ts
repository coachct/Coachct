// src/lib/whatsapp/conhecimento.ts
//
// Dados "gerais" (não ligados a um cliente) que o agente de WhatsApp usa para
// responder dúvidas: preços, endereços e a base de conhecimento editável.
//
// Diferente de consultas.ts (que é por-cliente), aqui é informação pública da
// Just CT — não precisa de log de LGPD.

import type { SupabaseClient } from '@supabase/supabase-js'

// Endereço fixo de fallback — mesma fonte usada nas telas (agendar/aulas),
// caso unidades.endereco esteja vazio no banco.
const FALLBACK_ENDERECOS: Record<string, string> = {
  'Just CT': 'Rua Fiandeiras, 392 — Itaim Bibi, São Paulo',
  'JustClub Vila Olímpia': 'Av. Dr. Cardoso de Melo, 1337 — Vila Olímpia, São Paulo',
  'JustClub Pinheiros': 'Rua Deputado Lacerda Franco, 342 — Pinheiros, São Paulo',
}

export interface UnidadeInfo {
  nome: string
  endereco: string | null
  tipo: string | null
}

/** Unidades ativas com endereço (DB, com fallback fixo quando vazio). */
export async function listarEnderecos(supabase: SupabaseClient): Promise<UnidadeInfo[]> {
  const { data, error } = await supabase
    .from('unidades')
    .select('nome, endereco, tipo')
    .eq('ativo', true)
  if (error) {
    // Sem acesso ao banco: devolve ao menos os endereços conhecidos.
    return Object.entries(FALLBACK_ENDERECOS).map(([nome, endereco]) => ({ nome, endereco, tipo: null }))
  }
  return (data ?? []).map((u: any) => ({
    nome: u.nome,
    endereco: u.endereco || FALLBACK_ENDERECOS[u.nome] || null,
    tipo: u.tipo ?? null,
  }))
}

/**
 * Traduz o tipo/subtipo interno do produto em "pra que serve" — para o agente
 * NUNCA confundir as famílias. Atenção: os pacotes de treino (5/10/40) são de
 * TREINO/musculação livre (credito_treino), NÃO valem para Coach CT (personal).
 */
function aplicacaoProduto(tipo: string | null, subtipo: string | null): string {
  if (subtipo === 'ilimitado_club') return 'JustClub — aulas coletivas (lift, lift for girls, running funcional)'
  switch (tipo) {
    case 'coach_ct_pro':
      return 'Coach CT Pro — treino com coach (personal 1×1)'
    case 'credito_coach':
      // CUIDADO: só o crédito avulso é Coach CT (personal). Os planos de "acesso"
      // (Semestral/Anual Just CT) dão acesso SOMENTE à musculação livre.
      return subtipo === 'acesso'
        ? 'Just CT — acesso só à musculação livre (NÃO inclui Coach CT/personal)'
        : 'Coach CT — personal 1×1 (treino com coach)'
    case 'credito_treino':
      // Treino avulso e pacotes (5/10/40): valem na musculação livre do Just CT
      // E também nas aulas das unidades JustClub. Só NÃO servem para Coach CT.
      return 'Treino avulso e pacotes (5/10/40) — válidos na musculação livre do Just CT E nas aulas do JustClub. NÃO é Coach CT/personal.'
    default:
      return tipo ?? 'outro'
  }
}

/** Catálogo de preços (produtos ativos, exceto multas), já com "pra que serve" e validade. */
export async function consultarPrecos(supabase: SupabaseClient): Promise<any[]> {
  const { data, error } = await supabase
    .from('produtos')
    .select('nome, valor, subtipo, tipo, dias_validade, creditos_por_venda')
    .eq('ativo', true)
    .neq('subtipo', 'multa')
    .order('valor', { ascending: true })
  if (error) throw new Error(`produtos: ${error.message}`)
  return (data ?? []).map((p: any) => ({
    nome: p.nome,
    valor: p.valor,
    para_que_serve: aplicacaoProduto(p.tipo, p.subtipo),
    creditos: p.creditos_por_venda || null,
    validade_dias: p.dias_validade || null,
  }))
}

/** Itens ativos da base de conhecimento (dúvidas gerais). */
export async function listarConhecimento(
  supabase: SupabaseClient,
): Promise<{ categoria: string | null; pergunta: string; resposta: string }[]> {
  const { data, error } = await supabase
    .from('base_conhecimento')
    .select('categoria, pergunta, resposta')
    .eq('ativo', true)
  if (error) return [] // a tabela pode ainda não existir (SQL não rodado)
  return data ?? []
}
