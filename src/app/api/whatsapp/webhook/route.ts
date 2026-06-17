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
  buscarClientePorCpf,
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
    } else if (ident.status === 'nao_encontrado') {
      // Número não cadastrado: tenta reconhecer pelo histórico desta conversa;
      // senão, identifica por CPF + nome; senão, trata como não-cliente (lead).
      const resolvido = await resolverPorCadastro(supabase, telefone, texto, de)
      if (!resolvido) return // resolverPorCadastro já respondeu (pediu CPF/nome ou enviou info de lead)
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

    // Atendimento humano ativo nesta conversa: guarda a mensagem (pra aparecer no
    // painel) e NÃO aciona o agente — quem responde é o atendente, pelo painel.
    if (await emModoHumano(supabase, telefone)) {
      await salvarMensagem(supabase, { telefone, clienteId: cliente.id, role: 'user', conteudo: texto })
      return
    }

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

/** Conversa está sob atendimento humano? (whatsapp_controle.modo_humano = true) */
async function emModoHumano(supabase: SupabaseClient, telefone: string): Promise<boolean> {
  const { data } = await supabase
    .from('whatsapp_controle')
    .select('modo_humano')
    .eq('telefone', telefone)
    .maybeSingle()
  return !!(data as any)?.modo_humano
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

// Mensagem para quem não é cliente (CPF não encontrado no cadastro).
const MSG_NAO_CLIENTE =
  'Não localizei esse CPF no nosso cadastro 🤔. Por aqui, sem cadastro, eu consigo te ajudar só com informações gerais (modalidades, valores, endereços) — para reservar treino, ver saldo e usar tudo, é preciso estar cadastrado(a). É rapidinho e dá pra fazer aqui: https://www.justclubct.com.br/cadastro — use o mesmo número deste WhatsApp que, assim que terminar, eu já te reconheço por aqui! 😊'

/**
 * Resolve a identidade quando o telefone NÃO está cadastrado:
 * 1) reconhece pelo histórico (se já se identificou por CPF nesta conversa);
 * 2) senão, se a mensagem trouxer CPF + nome que batem, identifica e vincula;
 * 3) senão, pede CPF+nome (ou manda info de não-cliente).
 * Retorna o cliente quando identificado; null quando já respondeu ao usuário.
 */
async function resolverPorCadastro(
  supabase: SupabaseClient,
  telefone: string,
  texto: string,
  de: string,
): Promise<ClienteIdentificado | null> {
  // 1. Já vinculado nesta conversa? (mensagem anterior com cliente_id)
  const vinculado = await clienteVinculadoPorHistorico(supabase, telefone)
  if (vinculado) return vinculado

  // 2. A mensagem traz um CPF?
  const cpf = extrairCpf(texto)
  if (!cpf) {
    // Sem CPF: se a pessoa sinaliza que não é aluno, manda info de não-cliente;
    // senão, pede nome + CPF para tentar identificar.
    if (pareceNaoCliente(texto)) {
      await enviarTexto(de, MSG_NAO_CLIENTE)
    } else {
      await enviarTexto(de, 'Oi! 😊 Não encontrei seu número no nosso cadastro. Você já é aluno(a) da Just CT? Se sim, me manda seu *nome completo* e *CPF* numa mensagem só, que eu confiro aqui. Se ainda não for aluno(a), me avisa que eu te conto como começar!')
    }
    return null
  }

  // 3. Tem CPF: procura no cadastro.
  const achado = await buscarClientePorCpf(supabase, cpf)
  if (!achado) {
    await enviarTexto(de, MSG_NAO_CLIENTE)
    return null
  }

  // 4. Achou: por segurança, confere o nome na mesma mensagem.
  if (!nomeBate(texto, achado.nome)) {
    await enviarTexto(de, 'Achei um cadastro com esse CPF! 😊 Por segurança, me reenvia seu *nome completo* junto com o *CPF* na mesma mensagem, do jeitinho que está no cadastro, que eu confirmo que é você.')
    return null
  }

  // 5. Confirmado. O vínculo é gravado pela salvarMensagem (com cliente_id) lá no
  //    fluxo principal — assim, nas próximas conversas, o passo 1 já reconhece.
  await registrarAcessoLgpd(supabase, { clienteId: achado.id, telefone, acao: 'wa_vinculo_cpf' })
  return achado
}

/** Cliente já vinculado a este telefone numa mensagem anterior (cliente_id salvo). */
async function clienteVinculadoPorHistorico(
  supabase: SupabaseClient,
  telefone: string,
): Promise<ClienteIdentificado | null> {
  const { data } = await supabase
    .from('whatsapp_mensagens')
    .select('cliente_id')
    .eq('telefone', telefone)
    .not('cliente_id', 'is', null)
    .order('criado_em', { ascending: false })
    .limit(1)
  const id = (data as any)?.[0]?.cliente_id
  if (!id) return null
  return await buscarClientePorId(supabase, id)
}

/** Extrai um CPF (11 dígitos) da mensagem — aceita formatado (000.000.000-00) ou solto. */
function extrairCpf(texto: string): string | null {
  const fmt = texto.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/)
  if (fmt) {
    const d = fmt[0].replace(/\D/g, '')
    if (d.length === 11) return d
  }
  const solto = texto.replace(/\D/g, ' ').match(/(?:^|\s)(\d{11})(?:\s|$)/)
  return solto ? solto[1] : null
}

/**
 * Confere se o nome do cadastro aparece na mensagem (segurança leve junto do CPF).
 * Exige o primeiro nome e, havendo sobrenome, também o último. Sem acento/caixa.
 */
function nomeBate(texto: string, nome: string): boolean {
  const norm = (s: string) =>
    String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ')
  const tokens = new Set(norm(texto).split(/\s+/).filter((w) => w.length >= 3))
  const partes = norm(nome).split(/\s+/).filter((w) => w.length >= 3)
  if (!partes.length) return false
  const temPrimeiro = tokens.has(partes[0])
  if (partes.length === 1) return temPrimeiro
  return temPrimeiro && tokens.has(partes[partes.length - 1])
}

/** Heurística: a mensagem sinaliza que a pessoa ainda NÃO é aluno(a)? */
function pareceNaoCliente(texto: string): boolean {
  const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return [
    'nao sou aluno', 'nao sou cliente', 'ainda nao sou', 'nao sou', 'nunca fui',
    'nao tenho cadastro', 'nao tenho plano', 'nao sou matriculado', 'nao estou matriculado',
    'quero conhecer', 'gostaria de conhecer', 'quero saber dos planos', 'quero saber mais',
    'quero comecar', 'gostaria de comecar', 'primeira vez', 'nao sou matricula', 'novo aqui',
    'quero me matricular', 'como faco para ser', 'como me torno', 'quero treinar ai',
  ].some((p) => t.includes(p))
}
