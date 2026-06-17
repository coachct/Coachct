// src/lib/whatsapp/canal.ts
//
// "Cano" do WhatsApp: envio de mensagem via Meta Graph API + histórico da
// conversa (tabela whatsapp_mensagens). Usado pelo webhook.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TurnoConversa } from './agente'

const GRAPH_VERSION = 'v21.0'

/**
 * Envia uma mensagem de texto pelo WhatsApp (Meta Graph API).
 * Retorna true se a Meta aceitou o envio, false caso contrário (config ausente,
 * fora da janela de 24h, etc.) — permite ao chamador cair para um canal alternativo.
 */
export async function enviarTexto(para: string, texto: string): Promise<boolean> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_TOKEN
  if (!phoneId || !token) {
    console.error('[whatsapp/canal] WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_TOKEN ausente')
    return false
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
    return false
  }
  return true
}

/**
 * Envia uma mensagem com BOTÕES de resposta (interactive reply buttons).
 * WhatsApp permite no máximo 3 botões, cada título com até 20 caracteres.
 */
export async function enviarBotoes(
  para: string,
  texto: string,
  botoes: { id: string; titulo: string }[],
): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_TOKEN
  if (!phoneId || !token) {
    console.error('[whatsapp/canal] WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_TOKEN ausente')
    return
  }

  // Saneia: no máximo 3 botões, título até 20 caracteres, sem vazios.
  const botoesValidos = botoes
    .map((b) => ({ id: String(b.id).slice(0, 256), titulo: String(b.titulo).trim().slice(0, 20) }))
    .filter((b) => b.titulo)
    .slice(0, 3)

  // Sem botões válidos → cai para texto puro (não quebra a conversa).
  if (!botoesValidos.length) {
    await enviarTexto(para, texto)
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
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: texto.slice(0, 1024) },
        action: {
          buttons: botoesValidos.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titulo } })),
        },
      },
    }),
  })
  if (!resp.ok) {
    const erro = await resp.text().catch(() => '')
    console.error(`[whatsapp/canal] falha ao enviar botões (${resp.status}): ${erro}`)
    // Fallback: tenta como texto puro para não deixar o cliente sem resposta.
    await enviarTexto(para, texto)
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
