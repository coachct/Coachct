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

/** Catálogo de preços (produtos ativos, exceto multas). */
export async function consultarPrecos(supabase: SupabaseClient): Promise<any[]> {
  const { data, error } = await supabase
    .from('produtos')
    .select('nome, valor, subtipo, tipo')
    .eq('ativo', true)
    .neq('subtipo', 'multa')
    .order('valor', { ascending: true })
  if (error) throw new Error(`produtos: ${error.message}`)
  return data ?? []
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
