// src/lib/whatsapp/canal.ts
//
// "Cano" do WhatsApp: envio de mensagem via Meta Graph API + histórico da
// conversa (tabela whatsapp_mensagens). Usado pelo webhook.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TurnoConversa } from './agente'

const GRAPH_VERSION = 'v21.0'

/**
 * Rede de segurança aplicada a TODA mensagem que sai (WhatsApp e Instagram),
 * independente do que o modelo escreveu:
 *  1) força a grafia certa do domínio (justclubct, sem o "e" a mais);
 *  2) remove a muleta de abertura "Boa pergunta!" / "Ótima pergunta," etc.
 *     (o modelo insiste nela mesmo proibido no prompt).
 */
export function corrigirDominioSite(texto: string): string {
  let t = String(texto ?? '').replace(/justclube*ct/gi, 'justclubct')
  // Tira "Boa/Ótima/Excelente/Que boa/Super pergunta" + pontuação/emoji no INÍCIO.
  const filler = /^\s*(boa|ótima|otima|excelente|que boa|super)\s+pergunta\s*[!,.…\-–—\s]*[🙂😊😄🤔👏💪👍]*[\s]*/i
  if (filler.test(t)) {
    t = t.replace(filler, '')
    // Recapitaliza a primeira letra que sobrou (pra não começar minúsculo).
    t = t.replace(/^([a-zàáâãäéêëíîïóôõöúûüç])/, (m) => m.toUpperCase())
  }
  return t
}

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
      text: { body: corrigirDominioSite(texto) },
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
        body: { text: corrigirDominioSite(texto).slice(0, 1024) },
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

// ---------------------------------------------------------------------------
// Mídia (anexos): download de inbound + envio de arquivo
// ---------------------------------------------------------------------------

/** Tipo de mensagem do WhatsApp a partir do MIME (image/audio/video/document). */
export function tipoMidiaPorMime(mime: string): 'image' | 'audio' | 'video' | 'document' {
  const m = String(mime ?? '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('audio/')) return 'audio'
  if (m.startsWith('video/')) return 'video'
  return 'document'
}

/**
 * Baixa um anexo recebido (inbound) da Meta: 1) GET /{media_id} devolve uma URL
 * temporária; 2) GET nessa URL (com o token) devolve os bytes. Retorna bytes + mime.
 */
export async function baixarMidiaMeta(mediaId: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) throw new Error('WHATSAPP_TOKEN ausente')
  const metaResp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaResp.ok) throw new Error(`meta da mídia (${metaResp.status})`)
  const info = await metaResp.json()
  const binResp = await fetch(String(info?.url ?? ''), { headers: { Authorization: `Bearer ${token}` } })
  if (!binResp.ok) throw new Error(`download da mídia (${binResp.status})`)
  return { bytes: await binResp.arrayBuffer(), mime: String(info?.mime_type ?? '') }
}

/**
 * Envia um ARQUIVO (documento/imagem/áudio/vídeo) pelo WhatsApp:
 * 1) sobe os bytes para a Meta (POST /media) → media_id;
 * 2) envia a mensagem referenciando o media_id.
 * Retorna { ok, tipo }. Só funciona dentro da janela de 24h do WhatsApp.
 */
export async function enviarMidiaWhatsApp(
  para: string,
  opts: { bytes: ArrayBuffer; mime: string; filename: string; caption?: string },
): Promise<{ ok: boolean; tipo: 'image' | 'audio' | 'video' | 'document' }> {
  const tipo = tipoMidiaPorMime(opts.mime)
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_TOKEN
  if (!phoneId || !token) {
    console.error('[whatsapp/canal] WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_TOKEN ausente')
    return { ok: false, tipo }
  }

  // 1) Upload para a Meta (multipart).
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', opts.mime || 'application/octet-stream')
  form.append('file', new Blob([opts.bytes], { type: opts.mime || 'application/octet-stream' }), opts.filename || 'arquivo')
  const up = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!up.ok) {
    console.error('[whatsapp/canal] falha no upload da mídia:', await up.text().catch(() => ''))
    return { ok: false, tipo }
  }
  const mediaId = String((await up.json())?.id ?? '')
  if (!mediaId) return { ok: false, tipo }

  // 2) Envia a mensagem referenciando o media_id.
  const conteudoMidia: any = { id: mediaId }
  if (opts.caption) conteudoMidia.caption = corrigirDominioSite(opts.caption)
  if (tipo === 'document') conteudoMidia.filename = opts.filename || 'arquivo'
  const send = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: tipo, [tipo]: conteudoMidia }),
  })
  if (!send.ok) {
    console.error('[whatsapp/canal] falha ao enviar mídia:', await send.text().catch(() => ''))
    return { ok: false, tipo }
  }
  return { ok: true, tipo }
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

// ---------------------------------------------------------------------------
// Idempotência (dedup de inbound) e ação pendente (memória do "Confirmar")
// ---------------------------------------------------------------------------

/**
 * Marca um inbound (wamid) como processado. Retorna true se é NOVO (deve
 * processar) e false se já tínhamos visto (reentrega da Meta → ignorar).
 * A trava é atômica no banco (primary key), segura contra entregas concorrentes.
 * Em erro (ex.: tabela ainda não criada), retorna true para não travar o atendimento.
 */
export async function registrarProcessada(supabase: SupabaseClient, wamid: string): Promise<boolean> {
  const id = String(wamid ?? '').trim()
  if (!id) return true // sem id não dá pra deduplicar; processa (não deve ocorrer)
  const { data, error } = await supabase
    .from('whatsapp_processadas')
    .upsert({ wamid: id }, { onConflict: 'wamid', ignoreDuplicates: true })
    .select('wamid')
  if (error) {
    console.error('[whatsapp/canal] falha na dedup (processa mesmo assim):', error.message)
    return true
  }
  return (data?.length ?? 0) > 0
}

export interface AcaoPendente {
  cliente_id: string | null
  acao: string
  params: any
}

/** Lê a ação aguardando confirmação para este telefone (ou null). */
export async function buscarAcaoPendente(
  supabase: SupabaseClient,
  telefone: string,
): Promise<AcaoPendente | null> {
  const { data } = await supabase
    .from('whatsapp_acao_pendente')
    .select('cliente_id, acao, params')
    .eq('telefone', telefone)
    .maybeSingle()
  if (!data || !(data as any).acao) return null
  return {
    cliente_id: (data as any).cliente_id ?? null,
    acao: (data as any).acao,
    params: (data as any).params ?? {},
  }
}

/** Grava (ou substitui) a ação aguardando confirmação deste telefone. */
export async function salvarAcaoPendente(
  supabase: SupabaseClient,
  opts: { telefone: string; clienteId: string | null; acao: string; params: any; resumo?: string },
): Promise<void> {
  const { error } = await supabase.from('whatsapp_acao_pendente').upsert(
    {
      telefone: opts.telefone,
      cliente_id: opts.clienteId,
      acao: opts.acao,
      params: opts.params ?? {},
      resumo: opts.resumo ?? null,
      criado_em: new Date().toISOString(),
    },
    { onConflict: 'telefone' },
  )
  if (error) console.error('[whatsapp/canal] falha ao salvar ação pendente:', error.message)
}

/** Remove a ação pendente deste telefone (consumida ou descartada). */
export async function limparAcaoPendente(supabase: SupabaseClient, telefone: string): Promise<void> {
  await supabase.from('whatsapp_acao_pendente').delete().eq('telefone', telefone)
}

/**
 * Marca a conversa como "aguardando atendimento humano" (o cliente pediu um
 * atendente). Não mexe no modo_humano — é só um sinalizador para o painel.
 * Faz update-ou-insert para não sobrescrever o modo_humano existente.
 */
export async function marcarAguardandoHumano(
  supabase: SupabaseClient,
  telefone: string,
): Promise<void> {
  const agora = new Date().toISOString()
  const { data } = await supabase
    .from('whatsapp_controle')
    .update({ aguardando_humano: true, aguardando_em: agora })
    .eq('telefone', telefone)
    .select('telefone')
  if (!data || data.length === 0) {
    await supabase
      .from('whatsapp_controle')
      .insert({ telefone, modo_humano: false, aguardando_humano: true, aguardando_em: agora })
  }
}
