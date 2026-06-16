// src/lib/whatsapp/agente.ts
//
// O "cérebro" do agente de WhatsApp da Just CT.
//
// Recebe a mensagem do cliente (já identificado pelo telefone) + o histórico
// curto da conversa, e usa o Claude (claude-sonnet-4-6) com as ferramentas de
// consulta (consultas.ts) para responder. Loop de tool use manual.
//
// ESCOPO ATUAL: informativo (leitura). O agente consulta saldo, agendamentos,
// reservas, histórico e fila. Ele NÃO agenda nem cancela — isso ainda não tem
// ferramenta; nesses casos ele direciona o cliente ao app/recepção.
//
// Modelo: claude-sonnet-4-6 — escolha da spec da Just CT (atendimento em volume).

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClienteIdentificado } from './consultas'
import {
  consultarSaldo,
  proximosAgendamentos,
  proximasReservasClub,
  historicoTreinos,
  posicaoNaFila,
  registrarAcessoLgpd,
} from './consultas'
import {
  listarEnderecos,
  consultarPrecos,
  listarConhecimento,
  type UnidadeInfo,
} from './conhecimento'
import { cancelarAgendamentoCt, horariosDisponiveisCt, agendarCt, entrarFilaCt, sairFila, aulasClubDisponiveis, reservarClub, cancelarReservaClub, entrarFilaClub } from './acoes'
import { agoraEmSaoPaulo } from './consultas'

interface ContextoGeral {
  enderecos: UnidadeInfo[]
  faq: { categoria: string | null; pergunta: string; resposta: string }[]
}

const MODELO = 'claude-sonnet-4-6'
const MAX_ITERACOES = 6 // trava de segurança contra loop infinito de tools

// ---------------------------------------------------------------------------
// System prompt — identidade e regras da Just CT
// ---------------------------------------------------------------------------

function systemPrompt(
  cliente: ClienteIdentificado,
  ctx: ContextoGeral,
  hoje: { dataStr: string; extenso: string },
): string {
  const enderecosTxt = ctx.enderecos.length
    ? ctx.enderecos.map((u) => `- ${u.nome}: ${u.endereco ?? 'endereço não cadastrado'}`).join('\n')
    : '- (endereços não disponíveis no momento)'

  const faqTxt = ctx.faq.length
    ? ctx.faq.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n')
    : '(nenhum item cadastrado ainda)'

  return `Você é o assistente virtual da Just CT, uma academia premium de personal training (Just CT) e aulas coletivas (JustClub) em São Paulo. Você atende clientes pelo WhatsApp.

# REGRA DE OURO (nunca quebre)
Este WhatsApp é o ÚNICO canal de atendimento da Just CT. NUNCA diga ao cliente para "ligar", "procurar/ir à recepção", "falar no balcão", "usar o app" ou qualquer outro canal — para o cliente, esses canais não existem. Resolva TUDO aqui mesmo, nesta conversa. Se alguma ação específica ainda não for possível por aqui, seja honesto que ela ainda não está disponível no WhatsApp e ofereça o que você consegue fazer — mas JAMAIS empurre o cliente para outro lugar.

# Quem está falando com você
Nome: ${cliente.nome}
${cliente.bloqueado ? `ATENÇÃO: este cliente está BLOQUEADO. Motivo: ${cliente.motivo_bloqueio ?? 'não informado'}. Explique com gentileza que há uma pendência na conta dele e que você está aqui para ajudar a resolver — sem mandar procurar recepção ou telefone.` : 'Cliente ativo.'}

# O que você PODE fazer (use as ferramentas)
- Consultar o saldo de créditos (por plano e unidade).
- Mostrar os próximos agendamentos de personal (Just CT).
- Mostrar as próximas reservas de aulas coletivas (JustClub).
- Mostrar o histórico de treinos recentes.
- Informar a posição do cliente em filas de espera.
- Consultar PREÇOS de planos e pacotes (ferramenta consultar_precos) — sempre use a ferramenta, nunca chute valores.
- Informar ENDEREÇOS das unidades (listados abaixo).
- Responder DÚVIDAS GERAIS usando a base de conhecimento abaixo.
- Consultar HORÁRIOS LIVRES do Just CT num dia (ferramenta horarios_disponiveis) para informar ao cliente que horas têm vaga.
- AGENDAR um treino de personal (Just CT) — ver a regra obrigatória abaixo.
- CANCELAR um agendamento de personal (Just CT) — ver a regra obrigatória abaixo.
- Colocar o cliente na FILA de espera de um horário lotado, e TIRAR da fila — ver a regra abaixo.
- Consultar as AULAS do JustClub (coletivas: lift, lift for girls, running funcional) disponíveis num dia/unidade, com vagas (ferramenta aulas_club_disponiveis). Passe a unidade (Vila Olímpia ou Pinheiros) e a data.
- RESERVAR uma aula de Lift ou Lift for Girls do JustClub — ver a regra abaixo. (Reserva de Running Funcional ainda não está disponível por aqui.)
- CANCELAR uma reserva do JustClub — ver a regra abaixo (use proximas_reservas_club para achar o id).

# Data de hoje
Hoje é ${hoje.extenso} (${hoje.dataStr}). Use isso para entender "hoje", "amanhã", "quinta", etc. e converter para a data no formato AAAA-MM-DD ao usar a ferramenta horarios_disponiveis. O agendamento do Just CT abre para os próximos 14 dias.

# Como agendar (REGRA OBRIGATÓRIA)
- Descubra a data desejada (use a data de hoje para converter "amanhã", "quinta", etc. em AAAA-MM-DD).
- Use horarios_disponiveis para ver se o horário pedido tem vaga; se o cliente não disse a hora, mostre as opções com vaga.
- Use consultar_saldo para saber com qual crédito agendar (tipo_credito). Para personal, use uma chave que contenha "just_ct" ou "coach_ct_pro" (NUNCA uma de "club"). Se houver mais de um crédito de personal com saldo, pergunte qual o cliente quer usar.
- SEMPRE confirme antes: repita data, hora e plano e peça um "sim". Ex.: "Confirma agendar dia 16/06 às 08:00 usando seu TotalPass?"
- SÓ chame agendar_treino DEPOIS do "sim". A ferramenta revalida tudo no servidor (vaga, saldo, bloqueio) e devolve o resultado — repasse com suas palavras.

# Como reservar aula do JustClub (REGRA OBRIGATÓRIA)
- Use aulas_club_disponiveis para achar a aula (precisa do ocorrencia_id) e ver se tem vaga. Pergunte a unidade se o cliente não disse.
- Use consultar_saldo para o crédito (tipo_credito): para JustClub use uma chave que contenha "just_club" (da unidade certa).
- Só Lift e Lift for Girls. Para Running Funcional, diga com gentileza que a reserva dessa aula ainda não está disponível por aqui e ofereça ajudar com Lift, Lift for Girls ou outra coisa — sem mandar pra outro canal.
- SEMPRE confirme antes (aula, dia, hora, plano) e peça "sim"; só então chame reservar_aula_club. A ferramenta revalida vaga, só-mulheres e saldo no servidor.

# Como cancelar reserva do JustClub (REGRA OBRIGATÓRIA)
- Use proximas_reservas_club para achar a reserva e seu id.
- SEMPRE confirme antes (aula, dia, hora) e peça "sim"; só então chame cancelar_reserva_club.
- A ferramenta aplica a regra de prazo (12h/3h/fila) e devolve o resultado — repasse com suas palavras.

# Fila de espera (REGRA OBRIGATÓRIA)
- A fila serve quando o horário/aula está LOTADO. Se o cliente quer algo cheio, ofereça entrar na fila.
- Personal (Just CT): para ENTRAR use entrar_fila (data, hora, plano).
- JustClub (aulas coletivas): para ENTRAR use entrar_fila_club (ocorrencia_id de aulas_club_disponiveis, plano).
- Para SAIR (de qualquer fila): use posicao_na_fila para achar o id; confirme qual e use sair_fila.
- SEMPRE confirme (com "sim") antes de entrar ou sair.

# Como cancelar (REGRA OBRIGATÓRIA)
- Para saber qual agendamento e seu id, use a ferramenta proximos_agendamentos.
- Se houver mais de um agendamento, pergunte qual o cliente quer cancelar.
- SEMPRE confirme antes: diga a data e a hora do treino e peça um "sim" explícito. Ex.: "Confirma que quer cancelar o treino de 15/06 às 05:30?"
- SÓ chame a ferramenta cancelar_agendamento DEPOIS do cliente confirmar. Nunca cancele por conta própria.
- A ferramenta aplica as regras de prazo (12h/3h/fila) e devolve o resultado — repasse a mensagem ao cliente com suas palavras.

# O que você NÃO faz (ainda)
- Você NÃO reserva Running Funcional por aqui ainda. Se pedirem, diga com gentileza que essa reserva específica ainda não está disponível no WhatsApp e ofereça as outras opções — NUNCA mande para recepção ou app.
- Nunca invente regras, valores, horários ou políticas. Para preços use a ferramenta; para dúvidas use a base de conhecimento. Se realmente não tiver a informação, diga com sinceridade que não tem esse dado no momento e siga ajudando no que puder — sem mandar o cliente para outro canal.

# Fatos úteis (responda com isto quando perguntarem)
- Escolher o coach / qual coach vai atender: a escolha do coach na hora de agendar é um BENEFÍCIO EXCLUSIVO do plano **Coach CT Pro**. Nos demais planos, o coach é definido na chegada ao Studio (não dá pra escolher antes). Então, se o cliente perguntar quem vai atender ou se pode escolher o coach, explique isso de forma simpática e APROVEITE para mencionar que, com o plano Coach CT Pro, ele poderia escolher o coach já no agendamento — como uma sugestão leve e convidativa, sem ser insistente. Nunca prometa um nome específico nem mande perguntar em outro canal.

# Endereços das unidades
${enderecosTxt}

# Base de conhecimento (use como fonte para dúvidas gerais)
${faqTxt}

# Como responder
- Português do Brasil, tom caloroso, direto e próximo — como um atendente atencioso, não robótico.
- Mensagens CURTAS (é WhatsApp). Use no máximo poucas linhas.
- Formate datas como DD/MM e horários como HH:MM. Nada de markdown de título ou tabela.
- Pode usar *negrito* (asterisco simples) do WhatsApp para destacar, com moderação, e emojis com parcimônia.
- Sempre baseie respostas sobre dados do cliente nas ferramentas — nunca chute saldo, datas ou números.
- Chame o cliente pelo primeiro nome quando fizer sentido.`
}

// ---------------------------------------------------------------------------
// Definição das ferramentas expostas ao modelo
// ---------------------------------------------------------------------------
// As ferramentas operam sempre sobre o cliente JÁ identificado — o modelo não
// passa cliente_id, então não há risco de ele consultar outra pessoa.

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_saldo',
    description: 'Saldo de créditos do cliente, por plano e unidade. Use quando o cliente perguntar quantos créditos/aulas tem.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'proximos_agendamentos',
    description: 'Próximas sessões de personal (Just CT) agendadas ou confirmadas. Use para "quando é meu próximo treino", "minhas aulas marcadas".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'proximas_reservas_club',
    description: 'Próximas reservas de aulas coletivas do JustClub (lift, lift for girls, running funcional).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'historico_treinos',
    description: 'Histórico de treinos de personal já realizados (mais recentes primeiro). Use para "meus últimos treinos", frequência.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'posicao_na_fila',
    description: 'Filas de espera em que o cliente está aguardando, com a posição. Use quando perguntar sobre fila/lista de espera.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'consultar_precos',
    description: 'Catálogo de preços de planos e pacotes da Just CT. Use sempre que o cliente perguntar quanto custa algo, valores, planos ou pacotes.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'horarios_disponiveis',
    description: 'Lista os horários do Just CT (personal) num dia, com quantas vagas livres e se há fila. Use para informar ao cliente quais horários têm vaga. Passe a data em AAAA-MM-DD.',
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'data no formato AAAA-MM-DD' },
      },
      required: ['data'],
    },
  },
  {
    name: 'agendar_treino',
    description: 'Agenda um treino de personal no Just CT. Só use APÓS o cliente confirmar data, hora e plano. Antes, confira vaga (horarios_disponiveis) e o crédito (consultar_saldo).',
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'data do treino em AAAA-MM-DD' },
        hora: { type: 'string', description: 'horário em HH:MM (ex.: 08:00)' },
        tipo_credito: { type: 'string', description: 'a chave do crédito a usar, exatamente como aparece em consultar_saldo (ex.: totalpass_just_ct)' },
      },
      required: ['data', 'hora', 'tipo_credito'],
    },
  },
  {
    name: 'cancelar_agendamento',
    description: 'Cancela um agendamento de personal (Just CT). Só use APÓS o cliente confirmar explicitamente qual treino cancelar. O id vem de proximos_agendamentos.',
    input_schema: {
      type: 'object',
      properties: {
        agendamento_id: { type: 'string', description: 'id do agendamento a cancelar (campo "id" de proximos_agendamentos)' },
      },
      required: ['agendamento_id'],
    },
  },
  {
    name: 'aulas_club_disponiveis',
    description: 'Lista as aulas coletivas do JustClub (lift, lift_for_girls, running_funcional) de um dia, com vagas livres. Passe a unidade (ex.: "Vila Olímpia" ou "Pinheiros") e a data AAAA-MM-DD.',
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'data em AAAA-MM-DD' },
        unidade: { type: 'string', description: 'unidade do JustClub: "Vila Olímpia" ou "Pinheiros"' },
      },
      required: ['data', 'unidade'],
    },
  },
  {
    name: 'reservar_aula_club',
    description: 'Reserva uma aula de Lift ou Lift for Girls do JustClub. Só use APÓS o cliente confirmar. O ocorrencia_id vem de aulas_club_disponiveis. Não use para running_funcional.',
    input_schema: {
      type: 'object',
      properties: {
        ocorrencia_id: { type: 'string', description: 'id da aula (campo "ocorrencia_id" de aulas_club_disponiveis)' },
        tipo_credito: { type: 'string', description: 'chave do crédito de club, como em consultar_saldo (ex.: totalpass_just_club_vila_olimpia)' },
      },
      required: ['ocorrencia_id', 'tipo_credito'],
    },
  },
  {
    name: 'cancelar_reserva_club',
    description: 'Cancela uma reserva de aula do JustClub. Só use APÓS o cliente confirmar. O id vem de proximas_reservas_club.',
    input_schema: {
      type: 'object',
      properties: {
        reserva_id: { type: 'string', description: 'id da reserva (campo "id" de proximas_reservas_club)' },
      },
      required: ['reserva_id'],
    },
  },
  {
    name: 'entrar_fila',
    description: 'Coloca o cliente na fila de espera de um horário LOTADO do Just CT. Só use APÓS confirmar data, hora e plano. Use horarios_disponiveis para ver se o horário está cheio.',
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'data em AAAA-MM-DD' },
        hora: { type: 'string', description: 'horário em HH:MM' },
        tipo_credito: { type: 'string', description: 'chave do crédito, como em consultar_saldo (ex.: totalpass_just_ct)' },
      },
      required: ['data', 'hora', 'tipo_credito'],
    },
  },
  {
    name: 'entrar_fila_club',
    description: 'Coloca o cliente na fila de espera de uma aula LOTADA do JustClub. Só use APÓS confirmar. O ocorrencia_id vem de aulas_club_disponiveis.',
    input_schema: {
      type: 'object',
      properties: {
        ocorrencia_id: { type: 'string', description: 'id da aula (campo "ocorrencia_id" de aulas_club_disponiveis)' },
        tipo_credito: { type: 'string', description: 'chave do crédito de club, como em consultar_saldo' },
      },
      required: ['ocorrencia_id', 'tipo_credito'],
    },
  },
  {
    name: 'sair_fila',
    description: 'Remove o cliente de uma fila de espera (Just CT ou JustClub). Só use APÓS o cliente confirmar. O id vem de posicao_na_fila.',
    input_schema: {
      type: 'object',
      properties: {
        fila_id: { type: 'string', description: 'id da fila (campo "id" de posicao_na_fila)' },
      },
      required: ['fila_id'],
    },
  },
]

// Ferramentas que acessam dados pessoais do cliente (geram log de LGPD).
const TOOLS_DADOS_CLIENTE = new Set([
  'consultar_saldo',
  'proximos_agendamentos',
  'proximas_reservas_club',
  'historico_treinos',
  'posicao_na_fila',
])

// ---------------------------------------------------------------------------
// Execução de uma ferramenta
// ---------------------------------------------------------------------------

async function executarTool(
  nome: string,
  input: any,
  supabase: SupabaseClient,
  cliente: ClienteIdentificado,
): Promise<string> {
  // Auditoria LGPD: só para ferramentas que leem dados pessoais do cliente.
  if (TOOLS_DADOS_CLIENTE.has(nome)) {
    await registrarAcessoLgpd(supabase, {
      clienteId: cliente.id,
      telefone: cliente.telefone,
      acao: nome,
    })
  }

  switch (nome) {
    case 'consultar_saldo':
      return JSON.stringify(await consultarSaldo(supabase, cliente.id))
    case 'proximos_agendamentos':
      return JSON.stringify(await proximosAgendamentos(supabase, cliente.id))
    case 'proximas_reservas_club':
      return JSON.stringify(await proximasReservasClub(supabase, cliente.id))
    case 'historico_treinos':
      return JSON.stringify(await historicoTreinos(supabase, cliente.id))
    case 'posicao_na_fila':
      return JSON.stringify(await posicaoNaFila(supabase, cliente.id))
    case 'consultar_precos':
      return JSON.stringify(await consultarPrecos(supabase))
    case 'horarios_disponiveis':
      return JSON.stringify(await horariosDisponiveisCt(supabase, String(input?.data ?? '')))
    case 'agendar_treino':
      return JSON.stringify(await agendarCt(supabase, cliente.id, {
        data: String(input?.data ?? ''),
        hora: String(input?.hora ?? ''),
        tipoCredito: String(input?.tipo_credito ?? ''),
      }))
    case 'cancelar_agendamento':
      return JSON.stringify(await cancelarAgendamentoCt(supabase, cliente.id, String(input?.agendamento_id ?? '')))
    case 'entrar_fila':
      return JSON.stringify(await entrarFilaCt(supabase, cliente.id, {
        data: String(input?.data ?? ''),
        hora: String(input?.hora ?? ''),
        tipoCredito: String(input?.tipo_credito ?? ''),
      }))
    case 'entrar_fila_club':
      return JSON.stringify(await entrarFilaClub(supabase, cliente.id, {
        ocorrenciaId: String(input?.ocorrencia_id ?? ''),
        tipoCredito: String(input?.tipo_credito ?? ''),
      }))
    case 'sair_fila':
      return JSON.stringify(await sairFila(supabase, cliente.id, String(input?.fila_id ?? '')))
    case 'aulas_club_disponiveis':
      return JSON.stringify(await aulasClubDisponiveis(supabase, String(input?.unidade ?? ''), String(input?.data ?? '')))
    case 'reservar_aula_club':
      return JSON.stringify(await reservarClub(supabase, cliente.id, {
        ocorrenciaId: String(input?.ocorrencia_id ?? ''),
        tipoCredito: String(input?.tipo_credito ?? ''),
      }))
    case 'cancelar_reserva_club':
      return JSON.stringify(await cancelarReservaClub(supabase, cliente.id, String(input?.reserva_id ?? '')))
    default:
      return JSON.stringify({ erro: `ferramenta desconhecida: ${nome}` })
  }
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export interface TurnoConversa {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Gera a resposta do agente para uma mensagem do cliente.
 * `historico` são os turnos anteriores da conversa (sem a mensagem atual).
 */
export async function responderMensagem(params: {
  supabase: SupabaseClient
  cliente: ClienteIdentificado
  mensagem: string
  historico?: TurnoConversa[]
  registroTools?: string[] // debug: recebe "nome -> resultado" de cada tool chamada
}): Promise<string> {
  const { supabase, cliente, mensagem, historico = [], registroTools } = params

  const client = new Anthropic() // lê ANTHROPIC_API_KEY do ambiente

  // Contexto geral (endereços + base de conhecimento) injetado no system prompt.
  const [enderecos, faq] = await Promise.all([
    listarEnderecos(supabase),
    listarConhecimento(supabase),
  ])
  const ctx: ContextoGeral = { enderecos, faq }

  // Data de hoje (fuso de SP) para o agente interpretar "amanhã", "quinta", etc.
  const { dataStr } = agoraEmSaoPaulo()
  const extenso = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date())
  const hoje = { dataStr, extenso }

  const messages: Anthropic.MessageParam[] = [
    ...historico.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: mensagem },
  ]

  for (let i = 0; i < MAX_ITERACOES; i++) {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 1024,
      thinking: { type: 'disabled' }, // resposta rápida; chat não precisa de raciocínio longo
      system: systemPrompt(cliente, ctx, hoje),
      tools: TOOLS,
      messages,
    })

    if (resposta.stop_reason === 'tool_use') {
      // Executa as ferramentas pedidas e devolve os resultados.
      messages.push({ role: 'assistant', content: resposta.content })

      const resultados: Anthropic.ToolResultBlockParam[] = []
      for (const bloco of resposta.content) {
        if (bloco.type === 'tool_use') {
          let conteudo: string
          try {
            conteudo = await executarTool(bloco.name, bloco.input, supabase, cliente)
          } catch (e: any) {
            conteudo = JSON.stringify({ erro: e.message })
          }
          registroTools?.push(`${bloco.name}(${JSON.stringify(bloco.input)}) -> ${conteudo}`)
          resultados.push({
            type: 'tool_result',
            tool_use_id: bloco.id,
            content: conteudo,
          })
        }
      }
      messages.push({ role: 'user', content: resultados })
      continue // volta ao modelo com os resultados
    }

    // Sem mais tools: junta o texto final.
    const texto = resposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
    return texto || 'Desculpa, não consegui responder agora. Pode tentar de novo?'
  }

  // Estourou o limite de iterações de tools.
  return 'Tive um probleminha para consultar seus dados agora. Pode tentar de novo em instantes?'
}
