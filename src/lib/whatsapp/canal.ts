// src/lib/whatsapp/canal.ts
//
// "Cano" do WhatsApp: envio de mensagem via Meta Graph API + histórico da
// conversa (tabela whatsapp_mensagens). Usado pelo webhook.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TurnoConversa } from './agente'

const GRAPH_VERSION = 'v21.0'

/** Envia uma mensagem de texto pelo WhatsApp (Meta Graph API). */
export async function enviarTexto(para: string, texto: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_TOKEN
  if (!phoneId || !token) {
    console.error('[whatsapp/canal] WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_TOKEN ausente')
    return
  }
  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'text',
      text: { body: texto },
    }),
  })
  if (!resp.ok) {
    const erro = await resp.text().catch(() => '')
    console.error(`[whatsapp/canal] falha ao enviar (${resp.status}): ${erro}`)
  }
}

/** Carrega os últimos turnos da conversa desse telefone (ordem cronológica). */
export async function carregarHistorico(
  supabase: SupabaseClient,
  telefone: string,
  limite = 10,
): Promise<TurnoConversa[]> {
  const { data, error } = await supabase
    .from('whatsapp_mensagens')
    .select('role, conteudo')
    .eq('telefone', telefone)
    .order('criado_em', { ascending: false })
    .limit(limite)
  if (error || !data) return []
  // veio do mais novo pro mais antigo; inverte pra ordem cronológica
  return data.reverse().map((m: any) => ({ role: m.role, content: m.conteudo }))
}

/** Salva um turno (user ou assistant) no histórico. */
export async function salvarMensagem(
  supabase: SupabaseClient,
  params: { telefone: string; clienteId: string | null; role: 'user' | 'assistant'; conteudo: string },
): Promise<void> {
  const { error } = await supabase.from('whatsapp_mensagens').insert({
    telefone: params.telefone,
    cliente_id: params.clienteId,
    role: params.role,
    conteudo: params.conteudo,
  })
  if (error) console.error('[whatsapp/canal] falha ao salvar mensagem:', error.message)
}
