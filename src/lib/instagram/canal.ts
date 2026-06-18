// src/lib/instagram/canal.ts
//
// Envio de DM pelo Instagram (Graph API) + histórico da conversa
// (tabela instagram_mensagens). Usado pelo webhook do Instagram.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TurnoConversa } from './agente-info'

const GRAPH_VERSION = 'v21.0'

/**
 * Envia uma DM de texto pelo Instagram.
 * Endpoint: POST /{IG_ACCOUNT_ID}/messages com recipient = IGSID do usuário.
 * (Confirmar conta/permissões na config da Meta; usa INSTAGRAM_TOKEN.)
 */
export async function enviarTextoInstagram(igsid: string, texto: string): Promise<void> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID
  const token = process.env.INSTAGRAM_TOKEN
  if (!accountId || !token) {
    console.error('[instagram/canal] INSTAGRAM_ACCOUNT_ID ou INSTAGRAM_TOKEN ausente')
    return
  }
  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${accountId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: igsid },
      message: { text: texto },
      messaging_type: 'RESPONSE',
    }),
  })
  if (!resp.ok) {
    const erro = await resp.text().catch(() => '')
    console.error(`[instagram/canal] falha ao enviar (${resp.status}): ${erro}`)
  }
}

/** Últimos turnos da conversa desse usuário do Instagram (ordem cronológica). */
export async function carregarHistoricoInstagram(
  supabase: SupabaseClient,
  igsid: string,
  limite = 10,
): Promise<TurnoConversa[]> {
  const { data, error } = await supabase
    .from('instagram_mensagens')
    .select('role, conteudo')
    .eq('igsid', igsid)
    .order('criado_em', { ascending: false })
    .limit(limite)
  if (error || !data) return []
  return data.reverse().map((m: any) => ({ role: m.role, content: m.conteudo }))
}

/** Salva um turno (user ou assistant) no histórico do Instagram. */
export async function salvarMensagemInstagram(
  supabase: SupabaseClient,
  params: { igsid: string; role: 'user' | 'assistant'; conteudo: string },
): Promise<void> {
  const { error } = await supabase.from('instagram_mensagens').insert({
    igsid: params.igsid,
    role: params.role,
    conteudo: params.conteudo,
  })
  if (error) console.error('[instagram/canal] falha ao salvar mensagem:', error.message)
}
