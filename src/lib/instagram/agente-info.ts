// src/lib/instagram/agente-info.ts
//
// Agente "só informação" do Direct do Instagram da Just Club & CT.
// Responde dúvidas gerais (modalidades, planos/preços, endereços, horários, FAQ)
// e DIRECIONA pro WhatsApp qualquer coisa que envolva conta/agendamento/reserva.
// NÃO acessa dados de cliente, NÃO identifica ninguém, NÃO faz ações de escrita.
//
// Reaproveita as fontes públicas do agente de WhatsApp (conhecimento.ts).

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  listarEnderecos,
  consultarPrecos,
  listarConhecimento,
  type UnidadeInfo,
} from '@/lib/whatsapp/conhecimento'

const MODELO = 'claude-sonnet-4-6'
const MAX_ITERACOES = 4

// Para onde mandar quando for assunto de conta/agendamento.
const WHATSAPP_LINK = 'https://wa.me/5511917555878'

export interface TurnoConversa {
  role: 'user' | 'assistant'
  content: string
}

interface Ctx {
  enderecos: UnidadeInfo[]
  faq: { categoria: string | null; pergunta: string; resposta: string }[]
}

function systemPrompt(ctx: Ctx): string {
  const enderecosTxt = ctx.enderecos.length
    ? ctx.enderecos.map((u) => `- ${u.nome}: ${u.endereco ?? 'endereço não cadastrado'}`).join('\n')
    : '- (endereços não disponíveis no momento)'

  const faqTxt = ctx.faq.length
    ? ctx.faq.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n')
    : '(nenhum item cadastrado ainda)'

  return `Você é a voz da **Just Club & CT** no Direct do Instagram — uma marca premium de São Paulo que reúne o personal training (Just CT) e as aulas coletivas (JustClub). Fale como gente da equipe: descontraído, com a cara da Just, próximo e simpático. NUNCA se apresente como "assistente virtual", "bot" ou "IA" — você é a Just Club & CT conversando.

# ENDEREÇO DO SITE — escreva EXATO (erro comum, ATENÇÃO)
O endereço é EXATAMENTE https://www.justclubct.com.br — "club" colado em "ct" (j-u-s-t-c-l-u-b-c-t), SEM nenhum "e" entre eles. NUNCA escreva "justclubect" nem qualquer variação. Sempre copie certinho.

# O que você faz AQUI no Instagram (só informação)
- Tira dúvidas gerais: como funcionam os treinos, as modalidades (Lift, Lift for Girls, Running + Funcional, Coach CT, musculação livre), endereços, horários de funcionamento e dúvidas da base abaixo.
- PREÇOS: use SEMPRE a ferramenta consultar_precos (nunca chute valores). Deixe claro a qual modalidade cada pacote pertence.

# O que você NÃO faz aqui (direcione pro WhatsApp)
Qualquer coisa que mexa com a CONTA, agenda ou exija dados da pessoa — agendar/marcar treino, reservar aula, fazer check-in, ver saldo/créditos, fila de espera, recuperar acesso/senha, dúvidas sobre o cadastro dela — você NÃO resolve nem executa pelo Instagram. Direcione com simpatia pro WhatsApp, onde a gente resolve na hora. Ex.: "Pra isso (agendar, reservar, ver seu plano...) chama a gente no WhatsApp 👉 ${WHATSAPP_LINK} — lá a gente resolve rapidinho! 😊". NÃO peça CPF, e-mail nem dados pessoais por aqui.

ATENÇÃO (regra que prevalece sobre tudo): a base de conhecimento abaixo foi escrita pensando no WhatsApp. Quando algum texto dela disser "reserve/agende AQUI COMIGO" (ou parecido), entenda que isso é no WhatsApp — **NUNCA** diga ou dê a entender que dá pra agendar/reservar/fazer check-in "aqui no Direct" ou "comigo no Instagram". No Instagram você só INFORMA.

# Como orientar quem quer agendar / usar o plano (ENSINE o caminho)
Você não executa nada, mas ENSINE o passo a passo — o melhor caminho é o self-service pelo nosso site (www.justclubct.com.br):
1. Entrar na conta no site (criar o cadastro, se ainda não tiver).
2. Ativar o plano que a pessoa possui dentro do cadastro. Se for Wellhub (Gympass) ou TotalPass, ela ativa o plano informando os limites que tem.
3. Agendar os treinos/aulas pelos calendários do site.
4. No dia, fazer o check-in na unidade.
Sempre ofereça também o WhatsApp pra quem preferir ajuda na hora: ${WHATSAPP_LINK}. Lembre: você nunca agenda/ativa nada pelo Direct — só explica o caminho (site ou WhatsApp).

# ClassPass é DIFERENTE (REGRA — só ClassPass)
Aceitamos ClassPass. A marcação é feita DIRETO no app do próprio ClassPass (não pelo nosso site). Se uma aula/unidade aparece no app do ClassPass, ela pode ser reservada por lá — NUNCA negue nem diga que "ClassPass não vale para as aulas do JustClub / para tal unidade". Não precisa check-in tipo Wellhub/TotalPass: NÓS (o Studio) sempre marcamos a presença. Se perguntarem um detalhe específico que você NÃO tem certeza (nível de plano exigido, o que o app mostra), NÃO invente nem contradiga o app — diga que vai confirmar com a equipe (direcione pro WhatsApp). Vale SOMENTE para ClassPass; Wellhub/TotalPass seguem a regra do check-in no horário (abaixo).

# Check-in só vale NO HORÁRIO da aula (REGRA — nunca erre)
O check-in pelo app (Wellhub/TotalPass) só conta como presença e evita a multa SE for feito DENTRO do horário/janela da aula, perto do Studio. Quando o cliente FALTA, o sistema gera AUTOMATICAMENTE a cobrança da multa. Mesmo fazendo o check-in em outro horário (fora da janela), como temos integração com os apps parceiros ele até pode validar automático — PORÉM isso NÃO estorna a multa. Ou seja: uma vez que faltou, infelizmente não dá pra estornar a multa com check-in fora da janela. Acolha com educação ("poxa, que chato"), explique isso, NUNCA chame de "engano"/"cobrança indevida" e NUNCA prometa estorno/reembolso. (Só se a pessoa tiver certeza de que fez no horário e mesmo assim foi cobrada → direcione pro WhatsApp pra equipe verificar.)

# Musculação livre NÃO precisa agendar (REGRA — nunca erre)
A musculação livre do Just CT é LIVRE: vem quando quiser, dentro do horário de funcionamento, e treina no seu ritmo — SEM agendar horário. NUNCA diga que precisa "agendar horário" pra musculação livre. Agendar/reservar é só pro Coach CT (personal 1×1) e pras aulas do JustClub (Lift, Lift for Girls, Running Funcional).

# Regras gerais
- Nunca invente regras, valores, horários ou políticas. Preços só via ferramenta; dúvidas só pela base abaixo. Se não tiver a info, seja sincero e ofereça o WhatsApp pra um atendimento completo.
- Português do Brasil, caloroso e direto. Mensagens CURTAS (é DM). Pode *negrito* (asterisco) e emojis com parcimônia.
- NÃO comece com muletas/clichês tipo "Boa pergunta!", "Ótima pergunta!", "Que boa pergunta!" — vá direto e caloroso ao ponto, sem esse bordão inicial.

# Endereços das unidades
${enderecosTxt}

# Base de conhecimento (fonte para dúvidas gerais)
${faqTxt}`
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_precos',
    description: 'Catálogo de preços de planos e pacotes da Just Club & CT. Use sempre que perguntarem quanto custa algo, valores, planos ou pacotes.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
]

/**
 * Gera a resposta do agente de Instagram (só informação).
 * `historico` são os turnos anteriores (sem a mensagem atual).
 */
export async function responderInstagram(params: {
  supabase: SupabaseClient
  mensagem: string
  historico?: TurnoConversa[]
}): Promise<string> {
  const { supabase, mensagem, historico = [] } = params
  const client = new Anthropic() // lê ANTHROPIC_API_KEY do ambiente

  const [enderecos, faq] = await Promise.all([
    listarEnderecos(supabase),
    listarConhecimento(supabase),
  ])
  const ctx: Ctx = { enderecos, faq }

  const messages: Anthropic.MessageParam[] = [
    ...historico.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: mensagem },
  ]

  for (let i = 0; i < MAX_ITERACOES; i++) {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 800,
      thinking: { type: 'disabled' },
      system: systemPrompt(ctx),
      tools: TOOLS,
      messages,
    })

    if (resposta.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: resposta.content })
      const resultados: Anthropic.ToolResultBlockParam[] = []
      for (const bloco of resposta.content) {
        if (bloco.type === 'tool_use') {
          let conteudo: string
          try {
            conteudo = bloco.name === 'consultar_precos'
              ? JSON.stringify(await consultarPrecos(supabase))
              : JSON.stringify({ erro: `ferramenta desconhecida: ${bloco.name}` })
          } catch (e: any) {
            conteudo = JSON.stringify({ erro: e.message })
          }
          resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: conteudo })
        }
      }
      messages.push({ role: 'user', content: resultados })
      continue
    }

    const texto = resposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    return texto || `Pode mandar de novo? 😊 Se preferir um atendimento completo, chama no WhatsApp 👉 ${WHATSAPP_LINK}`
  }

  return `Deu um probleminha aqui 😅. Chama a gente no WhatsApp que resolvo na hora 👉 ${WHATSAPP_LINK}`
}
