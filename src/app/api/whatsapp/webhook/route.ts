// src/app/api/whatsapp/webhook/route.ts
//
// Webhook do WhatsApp (Meta Cloud API) — mesmo padrão do webhook Wellhub:
// valida assinatura, responde 200 rápido, processa em background (waitUntil).
//
// GET  = verificação da Meta (hub.challenge).
// POST = mensagem recebida → identifica cliente → agente → responde via Graph API.

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import crypto from 'crypto'
import {
  createServiceSupabase,
  identificarClientePorTelefone,
  buscarClientePorId,
  normalizarTelefone,
  registrarAcessoLgpd,
  type ClienteIdentificado,
} from '@/lib/whatsapp/consultas'
import type { SupabaseClient } from '@supabase/supabase-js'
import { responderMensagem } from '@/lib/whatsapp/agente'
import { enviarTexto, enviarBotoes, carregarHistorico, salvarMensagem } from '@/lib/whatsapp/canal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AVISO_LGPD =
  'Olá! Sou o assistente virtual da Just CT. Para te atender, acesso seus dados cadastrais (nome, plano, agendamentos). Ao continuar, você concorda com nossa Política de Privacidade. Para parar de receber mensagens, envie PARAR.'

// ---------------------------------------------------------------------------
// GET — verificação do webhook (Meta)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// ---------------------------------------------------------------------------
// POST — mensagem recebida
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const raw = await req.text()

  // Valida a assinatura (HMAC SHA-256 com o App Secret).
  const assinatura = req.headers.get('x-hub-signature-256') ?? ''
  const appSecret = process.env.META_APP_SECRET
  if (appSecret) {
    const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex')
    const ok =
      assinatura.length === esperado.length &&
      crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado))
    if (!ok) return new NextResponse('Invalid signature', { status: 403 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return new NextResponse('OK', { status: 200 }) }

  const value = body?.entry?.[0]?.changes?.[0]?.value

  // DEBUG: registra status de entrega (sent/delivered/failed) pra diagnóstico.
  const statuses = value?.statuses
  if (Array.isArray(statuses) && statuses.length) {
    waitUntil((async () => {
      try {
        const supabase = createServiceSupabase()
        for (const s of statuses) {
          await registrarAcessoLgpd(supabase, { telefone: s?.recipient_id ?? null, acao: 'wa_status', detalhe: s })
        }
      } catch {}
    })())
    return new NextResponse('OK', { status: 200 })
  }

  // Extrai a primeira mensagem (texto digitado OU clique em botão/lista).
  const msg = value?.messages?.[0]
  if (!msg) {
    return new NextResponse('OK', { status: 200 }) // nada a fazer
  }

  const de = String(msg.from ?? '')
  let texto = ''
  if (msg.type === 'text') {
    texto = String(msg.text?.body ?? '').trim()
  } else if (msg.type === 'interactive') {
    // Cliente tocou num botão (button_reply) ou item de lista (list_reply):
    // tratamos o título da opção como se ele tivesse digitado isso.
    const it = msg.interactive
    texto = String(it?.button_reply?.title ?? it?.list_reply?.title ?? '').trim()
  }
  if (!texto) {
    return new NextResponse('OK', { status: 200 }) // tipo não suportado (áudio, imagem, etc.)
  }

  // Responde 200 rápido e processa em segundo plano.
  waitUntil(processar(de, texto))
  return new NextResponse('OK', { status: 200 })
}

// ---------------------------------------------------------------------------
// Processamento em background
// ---------------------------------------------------------------------------
async function processar(de: string, texto: string): Promise<void> {
  try {
    const supabase = createServiceSupabase()
    const telefone = normalizarTelefone(de)

    // DEBUG: registra que a mensagem chegou no nosso webhook (antes de tudo).
    await registrarAcessoLgpd(supabase, { telefone, acao: 'wa_inbound', detalhe: { de, texto } })

    const ident = await identificarClientePorTelefone(supabase, de)

    // Número não cadastrado → orienta (cadastro por CPF fica como melhoria futura).
    if (ident.status === 'nao_encontrado') {
      await enviarTexto(de, 'Oi! 😊 Ainda não encontrei seu número no nosso cadastro. Você já é aluno(a) da Just CT? Se sim, me diz seu nome completo e CPF que eu confiro aqui pra você.')
      return
    }

    let cliente: ClienteIdentificado
    if (ident.status === 'ok') {
      cliente = ident.cliente
    } else if (ident.status === 'ambiguo') {
      // Número em mais de um cadastro: lembra de quem já se identificou nesta
      // conversa; senão casa pelo nome na mensagem; senão pergunta o nome.
      const resolvido = await resolverAmbiguidade(supabase, telefone, texto, ident.candidatos)
      if (!resolvido) {
        const nomes = ident.candidatos.map((c) => primeiroNome(c.nome)).filter(Boolean).join(', ')
        await enviarTexto(de, `Oi! Vi mais de um cadastro nesse número (${nomes}). Pra eu te atender certinho, me diz seu primeiro nome? 😊`)
        return
      }
      cliente = resolvido
    } else {
      await enviarTexto(de, 'Tive um probleminha para te identificar agora. Pode tentar de novo em instantes?')
      return
    }

    // Comando PARAR (opt-out) — para qualquer mensagem que seja só "parar".
    if (texto.toLowerCase().replace(/\W/g, '') === 'parar') {
      await supabase.from('clientes').update({ whatsapp_opt_out: true }).eq('id', cliente.id)
      await registrarAcessoLgpd(supabase, { clienteId: cliente.id, telefone, acao: 'opt_out_parar' })
      await enviarTexto(de, 'Pronto, você não receberá mais mensagens por aqui. Se mudar de ideia, é só falar com a recepção. 👋')
      return
    }

    // Respeita opt-out anterior.
    if (cliente.whatsapp_opt_out) return

    // Primeira interação → aviso de privacidade (LGPD) + registra consentimento.
    let prefixo = ''
    if (!cliente.lgpd_consentimento_em) {
      await supabase.from('clientes').update({ lgpd_consentimento_em: new Date().toISOString(), lgpd_canal: 'whatsapp' }).eq('id', cliente.id)
      prefixo = AVISO_LGPD + '\n\n'
    }

    // Histórico + agente.
    const historico = await carregarHistorico(supabase, telefone)
    await salvarMensagem(supabase, { telefone, clienteId: cliente.id, role: 'user', conteudo: texto })

    const resposta = await responderMensagem({ supabase, cliente, mensagem: texto, historico })
    const corpo = prefixo + resposta.texto

    await salvarMensagem(supabase, { telefone, clienteId: cliente.id, role: 'assistant', conteudo: resposta.texto })
    if (resposta.botoes?.length) {
      await enviarBotoes(de, corpo, resposta.botoes)
    } else {
      await enviarTexto(de, corpo)
    }
  } catch (e: any) {
    console.error('[whatsapp/webhook] erro no processamento:', e?.message)
    try { await enviarTexto(de, 'Tive um erro aqui. Pode tentar de novo em instantes?') } catch {}
  }
}

/** Primeiro nome (para casar identificação em número compartilhado). */
function primeiroNome(nome: string): string {
  return String(nome ?? '').trim().split(/\s+/)[0] ?? ''
}

/**
 * Resolve qual cliente é, quando o número está em mais de um cadastro:
 * 1) lembra de quem já se identificou nesta conversa (última msg com cliente_id);
 * 2) senão, casa o primeiro nome citado na mensagem com um dos candidatos.
 * Retorna null se não der pra decidir (aí o webhook pergunta o nome).
 */
async function resolverAmbiguidade(
  supabase: SupabaseClient,
  telefone: string,
  texto: string,
  candidatos: ClienteIdentificado[],
): Promise<ClienteIdentificado | null> {
  // 1. Já identificado antes nesta conversa?
  const { data } = await supabase
    .from('whatsapp_mensagens')
    .select('cliente_id')
    .eq('telefone', telefone)
    .not('cliente_id', 'is', null)
    .order('criado_em', { ascending: false })
    .limit(1)
  const anteriorId = (data as any)?.[0]?.cliente_id
  if (anteriorId) {
    const jaCandidato = candidatos.find((c) => c.id === anteriorId)
    if (jaCandidato) return jaCandidato
    const buscado = await buscarClientePorId(supabase, anteriorId)
    if (buscado) return buscado
  }

  // 2. A mensagem cita o primeiro nome de algum candidato?
  const t = texto.toLowerCase()
  const porNome = candidatos.find((c) => {
    const pn = primeiroNome(c.nome).toLowerCase()
    return pn.length >= 2 && t.includes(pn)
  })
  return porNome ?? null
}
