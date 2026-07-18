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
  buscarClientePorEmail,
  normalizarTelefone,
  registrarAcessoLgpd,
  type ClienteIdentificado,
} from '@/lib/whatsapp/consultas'
import type { SupabaseClient } from '@supabase/supabase-js'
import { responderMensagem, executarAcaoConfirmada, responderVisitante } from '@/lib/whatsapp/agente'
import {
  enviarTexto,
  enviarBotoes,
  carregarHistorico,
  salvarMensagem,
  registrarProcessada,
  buscarAcaoPendente,
  salvarAcaoPendente,
  limparAcaoPendente,
  marcarAguardandoHumano,
  baixarMidiaMeta,
} from '@/lib/whatsapp/canal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AVISO_LGPD =
  'E aí! 👊 Aqui é a Just Club & CT no seu WhatsApp. Pra te ajudar certinho, dou uma olhada no seu cadastro (nome, plano, treinos) — seguindo a conversa, você concorda com a nossa Política de Privacidade. Se um dia quiser parar de receber mensagens, é só mandar PARAR. Bora? Como posso te ajudar hoje? 💪'

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
  const wamid = String(msg.id ?? '') // id único do inbound (Meta) — usado na dedup

  // Anexo (imagem/documento/áudio/vídeo/figurinha): trata em separado — baixa o
  // arquivo, guarda no painel e escala pra equipe (o bot não processa arquivos).
  const MIDIA_TIPOS = ['image', 'document', 'audio', 'video', 'sticker']
  if (MIDIA_TIPOS.includes(msg.type)) {
    const obj = msg[msg.type] ?? {}
    const midia = {
      tipo: String(msg.type),
      id: String(obj.id ?? ''),
      mime: String(obj.mime_type ?? ''),
      filename: String(obj.filename ?? ''),
      caption: String(obj.caption ?? '').trim(),
    }
    if (midia.id) waitUntil(processarMidia(de, wamid, midia))
    return new NextResponse('OK', { status: 200 })
  }

  let texto = ''
  let botaoId = '' // id do botão clicado (ex.: "confirmar" / "negar"), quando houver
  if (msg.type === 'text') {
    texto = String(msg.text?.body ?? '').trim()
  } else if (msg.type === 'interactive') {
    // Cliente tocou num botão (button_reply) ou item de lista (list_reply):
    // tratamos o título da opção como se ele tivesse digitado isso, e guardamos o
    // id do botão (payload que NÓS definimos) para reconhecer confirmações.
    const it = msg.interactive
    texto = String(it?.button_reply?.title ?? it?.list_reply?.title ?? '').trim()
    botaoId = String(it?.button_reply?.id ?? it?.list_reply?.id ?? '').trim()
  }
  if (!texto) {
    return new NextResponse('OK', { status: 200 }) // tipo não suportado (áudio, imagem, etc.)
  }

  // Responde 200 rápido e processa em segundo plano.
  waitUntil(processar(de, texto, wamid, botaoId))
  return new NextResponse('OK', { status: 200 })
}

// ---------------------------------------------------------------------------
// Processamento em background
// ---------------------------------------------------------------------------
async function processar(de: string, texto: string, wamid: string, botaoId: string): Promise<void> {
  try {
    const supabase = createServiceSupabase()
    const telefone = normalizarTelefone(de)

    // Idempotência: a Meta entrega cada inbound "pelo menos uma vez". Se já vimos
    // este wamid, é reentrega — ignora para não duplicar a resposta.
    const novo = await registrarProcessada(supabase, wamid)
    if (!novo) return

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
      // Atendente assumiu (modo humano) OU já foi encaminhado pra equipe? O bot
      // fica QUIETO — só guarda a mensagem e deixa a pessoa cuidar. Sem se intrometer.
      if (await emModoHumano(supabase, telefone) || await estaAguardandoHumano(supabase, telefone)) {
        await salvarMensagem(supabase, { telefone, clienteId: null, role: 'user', conteudo: texto })
        return
      }
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
      await enviarTexto(de, 'Pronto, você não receberá mais mensagens por aqui. Se mudar de ideia, é só me chamar de novo neste mesmo WhatsApp. 👋')
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

    // Cliente pediu pra falar com um atendente: sinaliza no painel (contador/badge)
    // para um adm dar uma olhada. O bot segue respondendo normalmente (acolhedor).
    if (pedeHumano(texto)) {
      await marcarAguardandoHumano(supabase, telefone)
    }

    // Ação pendente: o cliente está respondendo a um pedido de confirmação?
    // (clicou "Confirmar"/"Agora não" OU digitou um "sim"/"não"). Consumimos a
    // ação aqui — de forma determinística, sem depender do modelo re-derivar nada.
    const pendente = await buscarAcaoPendente(supabase, telefone)
    if (pendente) {
      await limparAcaoPendente(supabase, telefone) // consome já (evita reprocesso/loop)
      const decisao = interpretarConfirmacao(texto, botaoId)
      if (decisao === 'confirmar') {
        await salvarMensagem(supabase, { telefone, clienteId: cliente.id, role: 'user', conteudo: texto })
        const alvoId = pendente.cliente_id || cliente.id
        const resultado = await executarAcaoConfirmada(supabase, alvoId, pendente.acao, pendente.params)
        // Falha TÉCNICA (erro de banco/exceção): NUNCA largar o cliente com um "tente
        // de novo" sem saída — escala pra equipe (aparece no painel) e avisa que
        // alguém vai resolver. Recusa por regra de negócio NÃO entra aqui (é resposta
        // válida) — só o erroTecnico dispara a escalada.
        if (resultado.erroTecnico) {
          await marcarAguardandoHumano(supabase, telefone)
          const aviso = 'Opa, deu um probleminha técnico aqui do meu lado pra concluir isso 🙈. Mas não vou te deixar na mão: já passei pra nossa equipe e a gente resolve isso pra você por aqui mesmo, rapidinho. 🙏'
          await salvarMensagem(supabase, { telefone, clienteId: cliente.id, role: 'assistant', conteudo: aviso })
          await enviarTexto(de, aviso)
          return
        }
        await salvarMensagem(supabase, { telefone, clienteId: cliente.id, role: 'assistant', conteudo: resultado.texto })
        await enviarTexto(de, resultado.texto)
        return
      }
      // 'negar' ou indefinido → descarta a ação e segue normalmente para o agente,
      // que responde a mensagem atual com naturalidade (sem re-perguntar a ação).
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

    // Se o agente ESCALOU (não tinha certeza, chamou escalar_para_humano) OU disse
    // que vai ENCAMINHAR pra EQUIPE, marca a conversa como aguardando atendimento
    // (aparece no painel para um atendente resolver).
    const tResp = resposta.texto.toLowerCase()
    if (resposta.escalar || (tResp.includes('encaminh') && tResp.includes('equipe'))) {
      await marcarAguardandoHumano(supabase, telefone)
      if (resposta.motivoEscalar) console.log(`[whatsapp/webhook] escalado: ${resposta.motivoEscalar}`)
    }

    // Se o agente pediu confirmação de uma ação, guarda-a como pendente: a próxima
    // mensagem do cliente ("Confirmar"/"sim") vai executá-la lá em cima.
    if (resposta.acaoPendente) {
      await salvarAcaoPendente(supabase, {
        telefone,
        clienteId: cliente.id,
        acao: resposta.acaoPendente.acao,
        params: resposta.acaoPendente.params,
        resumo: resposta.acaoPendente.resumo,
      })
    }

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

// ---------------------------------------------------------------------------
// Recebimento de ANEXO (mídia) — o bot não processa arquivos: guarda no painel
// e escala pra equipe. O binário vai pro Storage; o histórico guarda o ponteiro.
// ---------------------------------------------------------------------------
async function processarMidia(
  de: string,
  wamid: string,
  midia: { tipo: string; id: string; mime: string; filename: string; caption: string },
): Promise<void> {
  try {
    const supabase = createServiceSupabase()
    const telefone = normalizarTelefone(de)

    // Idempotência (a Meta reentrega).
    if (!(await registrarProcessada(supabase, wamid))) return

    // Identifica o cliente (telefone direto ou vínculo do histórico) — best-effort.
    let clienteId: string | null = null
    const ident = await identificarClientePorTelefone(supabase, de)
    if (ident.status === 'ok') clienteId = ident.cliente.id
    else {
      const v = await clienteVinculadoPorHistorico(supabase, telefone)
      if (v) clienteId = v.id
    }

    // Baixa o arquivo da Meta e guarda no bucket privado. Não fatal se falhar.
    let midiaPath: string | null = null
    try {
      const { bytes, mime } = await baixarMidiaMeta(midia.id)
      const nome = midia.filename || `${midia.tipo}`
      const safe = nome.replace(/[^\w.\-]+/g, '_').slice(0, 80)
      midiaPath = `${telefone}/in-${Date.now()}-${safe}`
      await supabase.storage
        .from('whatsapp-midia')
        .upload(midiaPath, bytes, { contentType: midia.mime || mime || 'application/octet-stream', upsert: false })
    } catch (e) {
      console.error('[whatsapp/webhook] falha ao baixar/guardar mídia:', (e as any)?.message)
    }

    // Registra a mensagem (role=user) com o ponteiro do anexo.
    const { error: insErr } = await supabase.from('whatsapp_mensagens').insert({
      telefone,
      cliente_id: clienteId,
      role: 'user',
      conteudo: midia.caption || '',
      midia_tipo: midia.tipo,
      midia_path: midiaPath,
      midia_nome: midia.filename || null,
      midia_mime: midia.mime || null,
    })
    if (insErr) console.error('[whatsapp/webhook] insert mídia:', insErr.message)

    // O bot não lê arquivos → escala pra equipe e avisa o cliente (se não estiver
    // já em atendimento humano, pra não atropelar o atendente).
    if (!(await emModoHumano(supabase, telefone))) {
      await marcarAguardandoHumano(supabase, telefone)
      try {
        await enviarTexto(de, 'Recebi seu arquivo aqui! 👍 Já encaminhei pra nossa equipe dar uma olhada — em breve te respondem por aqui, tá? 🙏')
      } catch {}
    }
  } catch (e: any) {
    console.error('[whatsapp/webhook] erro ao processar mídia:', e?.message)
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

/** Conversa já foi encaminhada/escalada pra equipe? (aguardando_humano = true) */
async function estaAguardandoHumano(supabase: SupabaseClient, telefone: string): Promise<boolean> {
  const { data } = await supabase
    .from('whatsapp_controle')
    .select('aguardando_humano')
    .eq('telefone', telefone)
    .maybeSingle()
  return !!(data as any)?.aguardando_humano
}

/** Última resposta do assistente para este telefone (para evitar repetir igual). */
async function ultimaRespostaAssistente(supabase: SupabaseClient, telefone: string): Promise<string | null> {
  const { data } = await supabase
    .from('whatsapp_mensagens')
    .select('conteudo')
    .eq('telefone', telefone)
    .eq('role', 'assistant')
    .order('criado_em', { ascending: false })
    .limit(1)
  return (data as any)?.[0]?.conteudo ?? null
}

/** O cliente está pedindo para falar com um atendente/pessoa/humano? */
function pedeHumano(texto: string): boolean {
  const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return [
    'falar com um humano', 'falar com humano', 'falar com uma pessoa', 'falar com alguem',
    'falar com atendente', 'falar com um atendente', 'com um atendente', 'atendente humano',
    'atendimento humano', 'quero um humano', 'um humano', 'pessoa de verdade', 'humano de verdade',
    'falar com a recepcao', 'falar com a equipe', 'falar com voces', 'falar com alguem da equipe',
  ].some((p) => t.includes(p))
}

/**
 * Decide se a resposta do cliente a um pedido de confirmação foi sim, não ou
 * indefinido. O id do botão ("confirmar"/"negar") é a via principal e confiável;
 * o texto é um fallback para quando ele digita em vez de clicar.
 */
function interpretarConfirmacao(texto: string, botaoId: string): 'confirmar' | 'negar' | null {
  const id = String(botaoId ?? '').toLowerCase()
  if (id === 'confirmar') return 'confirmar'
  if (id === 'negar') return 'negar'

  const t = String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
  // Negativos primeiro (ex.: "não", "agora não", "deixa pra lá").
  if (/\b(nao|deixa|esquece|negativo|cancela isso)\b/.test(t)) return 'negar'
  if (/\b(sim|confirmo|confirmar|confirma|pode|isso|claro|bora|aceito|positivo|fechado|perfeito|quero|certeza|ok|blz|beleza)\b/.test(t)) return 'confirmar'
  return null
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
  'Não localizei esse CPF no nosso cadastro 🤔. Por aqui, sem cadastro, eu consigo te ajudar só com informações gerais (modalidades, valores, endereços) — para reservar treino, ver saldo e usar tudo na Just Club & CT, é preciso estar cadastrado(a). É rapidinho e dá pra fazer aqui: https://www.justclubct.com.br/cadastro — use o mesmo número deste WhatsApp que, assim que terminar, eu já te reconheço por aqui! 😊'

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

  // Registra a troca no banco (mesmo SEM cliente identificado) para a conversa
  // aparecer no painel /admin/conversas, e responde ao cliente. Retorna null.
  // ANTI-LOOP: se a resposta for IGUAL à última que mandamos, não repete — em vez
  // disso encaminha pra equipe (marca "aguardando atendimento" no painel).
  const responder = async (msg: string): Promise<null> => {
    let saida = msg
    const ultima = await ultimaRespostaAssistente(supabase, telefone)
    const norm = (s: string) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (ultima && norm(ultima) === norm(msg)) {
      await marcarAguardandoHumano(supabase, telefone)
      saida = 'Deixa eu encaminhar sua mensagem pra nossa equipe dar uma olhada — já já te respondem por aqui, tá? 🙏'
    }
    await salvarMensagem(supabase, { telefone, clienteId: null, role: 'user', conteudo: texto })
    await enviarTexto(de, saida)
    await salvarMensagem(supabase, { telefone, clienteId: null, role: 'assistant', conteudo: saida })
    return null
  }

  // 2. A mensagem traz um CPF? (identificador forte). Extraímos também o e-mail,
  //    que serve de reforço se o CPF não bater (e, na recuperação de senha, é o
  //    e-mail que o cliente QUER usar pra criar o acesso).
  const cpf = extrairCpf(texto)
  const email = extrairEmail(texto)
  if (cpf) {
    const achado = await buscarClientePorCpf(supabase, cpf)
    if (achado) {
      // Achou o CPF, mas o NOME não confere. Quase sempre é a pessoa que digitou o
      // CPF errado (o CPF de outra pessoa). NÃO revelamos de quem é o cadastro —
      // e guiamos pro e-mail (caminho que costuma destravar), pedindo pra conferir
      // o CPF. Por segurança, NUNCA seguimos com um CPF cujo nome não bate.
      if (!nomeBate(texto, achado.nome)) {
        return responder('Hmm, esse CPF não confere com o nome que você me passou 🤔. Dá uma conferida se digitou o *seu* CPF certinho e me reenvia (nome completo + CPF juntos) — ou, se preferir, me manda o *e-mail* do seu cadastro, que por ele eu também te encontro. 😊')
      }
      // Confirmado. O vínculo é gravado pela salvarMensagem (com cliente_id) lá no
      // fluxo principal — assim, nas próximas conversas, o passo 1 já reconhece.
      await registrarAcessoLgpd(supabase, { clienteId: achado.id, telefone, acao: 'wa_vinculo_cpf' })
      return achado
    }
    // CPF não encontrado: se NÃO veio um e-mail pra tentar, encerra como não-cliente.
    if (!email) return responder(MSG_NAO_CLIENTE)
    // senão, cai no bloco de e-mail abaixo (reforço).
  }

  // 2b. E-mail (sem CPF, ou CPF que não bateu): muita gente tem e-mail no cadastro
  //     mas não tem CPF — identifica por e-mail.
  if (email) {
    const achadoEmail = await buscarClientePorEmail(supabase, email)
    if (!achadoEmail) {
      return responder('Não localizei esse e-mail no nosso cadastro 🤔. Confere se digitou certinho? Se preferir, me manda seu *nome completo* + *CPF* que eu te encontro por aí.')
    }
    // Confere o nome junto, como no CPF (segurança leve).
    if (!nomeBate(texto, achadoEmail.nome)) {
      return responder('Achei um cadastro com esse e-mail! 😊 Por segurança, me reenvia seu *nome completo* junto com o *e-mail*, na mesma mensagem, do jeitinho que está no cadastro.')
    }
    await registrarAcessoLgpd(supabase, { clienteId: achadoEmail.id, telefone, acao: 'wa_vinculo_email' })
    return achadoEmail
  }

  // 3. Nem CPF nem e-mail: visitante. Responde dúvidas gerais + ensina o passo a
  //    passo do site, e pede nome + CPF OU e-mail quando for coisa da conta.
  const hist = await carregarHistorico(supabase, telefone)
  const resp = await responderVisitante({ supabase, mensagem: texto, historico: hist })
  // Bot sem certeza → escala pra equipe (aparece no painel "aguardando atendimento").
  if (resp.escalar) {
    await marcarAguardandoHumano(supabase, telefone)
    if (resp.motivoEscalar) console.log(`[whatsapp/webhook] escalado (visitante): ${resp.motivoEscalar}`)
  }
  return responder(resp.texto)
}

/** Extrai o primeiro e-mail que aparecer na mensagem (ou null). */
function extrairEmail(texto: string): string | null {
  const m = String(texto ?? '').match(/[^\s@]+@[^\s@]+\.[^\s@]+/)
  return m ? m[0].replace(/[.,;:)]+$/, '').toLowerCase() : null
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

/**
 * Extrai um CPF (11 dígitos) da mensagem. Tolera QUALQUER separador comum entre
 * os grupos — ponto, traço, espaço ou nenhum — inclusive a digitação errada
 * "000.000.000.00" (ponto antes dos 2 últimos, em vez de traço), que era a causa
 * de o CPF não ser reconhecido e o cliente cair no looping.
 */
function extrairCpf(texto: string): string | null {
  const t = String(texto ?? '')
  const fmt = t.match(/\d{3}[.\-\s]?\d{3}[.\-\s]?\d{3}[.\-\s]?\d{2}/)
  if (fmt) {
    const d = fmt[0].replace(/\D/g, '')
    if (d.length === 11) return d
  }
  const solto = t.replace(/\D/g, ' ').match(/(?:^|\s)(\d{11})(?:\s|$)/)
  return solto ? solto[1] : null
}

/**
 * Confere se o nome do cadastro aparece na mensagem (segurança LEVE junto do CPF,
 * que já é o identificador forte de 11 dígitos). Exige o primeiro nome e, havendo
 * sobrenome, pelo menos UM outro componente do nome — com tolerância a pequenas
 * variações de grafia (ex.: Gomes/Gomez, Sacchi/Sacche), porque cliente digita o
 * nome de memória e diverge do cadastro por uma letra. Sem acento/caixa.
 */
function nomeBate(texto: string, nome: string): boolean {
  const norm = (s: string) =>
    String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ')
  const msgTokens = norm(texto).split(/\s+/).filter((w) => w.length >= 3)
  const partes = norm(nome).split(/\s+/).filter((w) => w.length >= 3)
  if (!partes.length) return false
  // Match tolerante: igual, ou um é prefixo do outro, ou diferem nas últimas
  // letras mantendo um prefixo comum de 4+ (cobre Gomes/Gomez, Sacchi/Sacche).
  const aprox = (a: string, b: string) =>
    a === b ||
    (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a) || a.slice(0, 4) === b.slice(0, 4)))
  const bate = (parte: string) => msgTokens.some((t) => aprox(t, parte))
  if (!bate(partes[0])) return false              // primeiro nome é obrigatório
  if (partes.length === 1) return true
  return partes.slice(1).some((p) => bate(p))     // + ao menos mais um componente
}

/** Heurística: a mensagem sinaliza que a pessoa ainda NÃO é aluno(a)? */
function pareceNaoCliente(texto: string): boolean {
  const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // Respostas curtas de negação (ex.: "Não" respondendo "você já é aluno?").
  if (['nao', 'n', 'ainda nao', 'agora nao', 'nunca', 'nunca fui', 'nao sou'].includes(t.trim())) return true
  return [
    'nao sou aluno', 'nao sou cliente', 'ainda nao sou', 'nao sou', 'nunca fui',
    'nao tenho cadastro', 'nao tenho plano', 'nao sou matriculado', 'nao estou matriculado',
    'quero conhecer', 'gostaria de conhecer', 'quero saber dos planos', 'quero saber mais',
    'quero comecar', 'gostaria de comecar', 'primeira vez', 'nao sou matricula', 'novo aqui',
    'quero me matricular', 'como faco para ser', 'como me torno', 'quero treinar ai',
  ].some((p) => t.includes(p))
}
