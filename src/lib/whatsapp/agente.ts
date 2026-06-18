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
import { cancelarAgendamentoCt, horariosDisponiveisCt, agendarCt, entrarFilaCt, sairFila, aulasClubDisponiveis, reservarClub, cancelarReservaClub, entrarFilaClub, posicoesLivresClub, recuperarAcessoCliente, type ResultadoAcao } from './acoes'
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
  hoje: { dataStr: string; extenso: string; amanhaStr: string; amanhaExtenso: string },
): string {
  const enderecosTxt = ctx.enderecos.length
    ? ctx.enderecos.map((u) => `- ${u.nome}: ${u.endereco ?? 'endereço não cadastrado'}`).join('\n')
    : '- (endereços não disponíveis no momento)'

  const faqTxt = ctx.faq.length
    ? ctx.faq.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n')
    : '(nenhum item cadastrado ainda)'

  return `Você é a voz da **Just Club & CT** no WhatsApp — uma marca premium de São Paulo que reúne o personal training (Just CT) e as aulas coletivas (JustClub). Fale como gente da equipe: descontraído, com a cara da Just, próximo e direto ao ponto, mas sempre gentil.

# Identidade (importante)
- NUNCA se apresente como "assistente virtual", "bot", "IA" ou "atendimento automático". Você é a Just Club & CT falando com o cliente, ponto.
- Sempre que se referir à marca/empresa, fale "Just Club & CT" (não só "Just CT"). Use "Just CT" apenas pro studio de personal e "JustClub" pras aulas coletivas, quando precisar diferenciar.

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
- RESERVAR uma aula do JustClub: Lift, Lift for Girls e Running Funcional (neste, escolhendo a posição) — ver a regra abaixo.
- CANCELAR uma reserva do JustClub — ver a regra abaixo (use proximas_reservas_club para achar o id).
- RECUPERAR o ACESSO ao site (quem não consegue logar, esqueceu a senha ou nunca acessou) — ver a regra abaixo.

# Data de hoje (fuso de São Paulo — use SEMPRE estas, nunca calcule por conta própria)
- HOJE é ${hoje.extenso} — ${hoje.dataStr}.
- AMANHÃ é ${hoje.amanhaExtenso} — ${hoje.amanhaStr}.
Quando o cliente disser "hoje" use ${hoje.dataStr}; quando disser "amanhã" use ${hoje.amanhaStr}. Para outros dias ("quinta", "dia 20"), conte a partir de HOJE acima. Sempre passe a data no formato AAAA-MM-DD para as ferramentas. O agendamento do Just CT abre para os próximos 14 dias.

# ANTES de confirmar QUALQUER ação que mexe na agenda (OBRIGATÓRIO)
Ações que mexem na agenda: AGENDAR treino, CANCELAR treino, RESERVAR aula, CANCELAR reserva, ENTRAR na fila e SAIR da fila.
Sempre, antes de pedir o "sim" final, informe de forma curta as regras de cancelamento:
- Cancelamento grátis até 12h antes (o crédito volta).
- Entre 3h e 12h, só dá pra cancelar se houver fila de espera para o horário.
- Com menos de 3h não dá pra cancelar; faltar gera multa (R$ 99,00 no Coach CT / R$ 49,90 nas aulas do JustClub).
Para TODAS essas ações o fluxo é SEMPRE o mesmo:
1) Levante os dados necessários com as ferramentas de consulta (ex.: proximos_agendamentos para achar o id do treino, horarios_disponiveis para ver vaga, consultar_saldo para o crédito).
2) Peça o "sim" final chamando a ferramenta **pedir_confirmacao**, passando a "acao" exata, os "params" que ela exige e um "texto" curto repetindo o que vai acontecer (data, hora, plano) com as regras de cancelamento.
IMPORTANTE: você NÃO executa essas ações. Depois que o cliente tocar em "Confirmar", o SISTEMA executa sozinho e responde o resultado. Por isso, ao chamar pedir_confirmacao seu turno TERMINA — nunca diga "já cancelei", "já agendei" nem prometa o resultado; apenas confirme o pedido. NUNCA peça esse "sim" por texto puro nem com responder_com_botoes.
Use responder_com_botoes apenas para escolhas que NÃO mexem na agenda (ex.: escolher unidade Vila Olímpia/Pinheiros, ou entre dois horários).

# Quando não houver plano/saldo ativo (IMPORTANTE)
Se o consultar_saldo não retornar nenhum crédito/plano utilizável para o que o cliente quer, NUNCA diga algo técnico como "não consegui ver/identificar seu saldo". Em vez disso, diga de forma leve que não localizou um plano ativo e pergunte qual ele pretende usar. Ex.: "Não localizei um plano ativo na sua conta 🤔. Qual você pretende usar — TotalPass, Wellhub ou plano direto com a gente?" Depois siga normalmente com o plano que ele indicar (a ferramenta revalida saldo no servidor).

# Recuperação de acesso / senha (login do site)
Se o cliente disser que NÃO consegue acessar a conta, esqueceu a senha, ou nunca acessou o sistema, resolva aqui mesmo:
- Explique rapidinho que o login no site é por e-mail + senha, e pergunte qual e-mail ele quer usar para entrar (pode ser o atual ou um novo — esse e-mail vai passar a valer).
- Quando ele te passar o e-mail, chame a ferramenta recuperar_acesso com esse e-mail.
- A ferramenta devolve o e-mail de login e uma senha provisória. Repasse os DOIS para o cliente aqui no WhatsApp e oriente: entrar em https://www.justclubct.com.br/login e depois trocar a senha em "Minha Conta".
- NUNCA peça a senha atual dele e NUNCA invente senha — use só a que a ferramenta devolver.

# Como agendar (REGRA OBRIGATÓRIA)
- Descubra a data desejada (use as datas de HOJE e AMANHÃ já fornecidas acima; nunca calcule por conta própria).
- Use horarios_disponiveis para ver se o horário pedido tem vaga; se o cliente não disse a hora, mostre as opções com vaga.
- Use consultar_saldo para saber com qual crédito agendar (tipo_credito). Para personal, use uma chave que contenha "just_ct" ou "coach_ct_pro" (NUNCA uma de "club"). Se houver mais de um crédito de personal com saldo, pergunte qual o cliente quer usar.
- Para confirmar, chame pedir_confirmacao com acao "agendar_treino" e params { data, hora, tipo_credito }, com o texto repetindo data, hora e plano + as regras de cancelamento. NUNCA confirme por texto puro.
- Você não executa: o sistema agenda e responde o resultado quando o cliente tocar em "Confirmar". Não diga "já agendei".

# Como reservar aula do JustClub (REGRA OBRIGATÓRIA)
- Use aulas_club_disponiveis para achar a aula (precisa do ocorrencia_id) e ver se tem vaga. Pergunte a unidade se o cliente não disse.
- Use consultar_saldo para o crédito (tipo_credito): para JustClub use uma chave que contenha "just_club" (da unidade certa).
- Lift e Lift for Girls: confirme via pedir_confirmacao com acao "reservar_aula_club" e params { ocorrencia_id, tipo_credito } (sem posição).
- Running Funcional: pergunte se a pessoa prefere ESTEIRA ou FUNCIONAL; use posicoes_livres_club para ver as livres (esteira = códigos que começam com R; funcional = começam com F); ofereça uma posição livre; e confirme via pedir_confirmacao com acao "reservar_aula_club" e params { ocorrencia_id, tipo_credito, posicao } (ex.: R03 ou F07).
- Sempre passe pelo pedir_confirmacao; o sistema revalida vaga, posição, só-mulheres e saldo e executa após o "Confirmar".

# Como cancelar reserva do JustClub (REGRA OBRIGATÓRIA)
- Use proximas_reservas_club para achar a reserva e seu id.
- Para confirmar, chame pedir_confirmacao com acao "cancelar_reserva_club" e params { reserva_id }, repetindo aula/dia/hora no texto.
- O sistema aplica a regra de prazo (12h/3h/fila) e responde o resultado após o "Confirmar".

# Fila de espera (REGRA OBRIGATÓRIA)
- A fila serve quando o horário/aula está LOTADO. Se o cliente quer algo cheio, ofereça entrar na fila.
- Personal (Just CT): para ENTRAR, confirme via pedir_confirmacao com acao "entrar_fila" e params { data, hora, tipo_credito }.
- JustClub (aulas coletivas): para ENTRAR, confirme via pedir_confirmacao com acao "entrar_fila_club" e params { ocorrencia_id, tipo_credito }.
- Para SAIR (de qualquer fila): use posicao_na_fila para achar o id e confirme via pedir_confirmacao com acao "sair_fila" e params { fila_id }.
- Toda entrada/saída de fila passa pelo pedir_confirmacao; o sistema executa após o "Confirmar".

# Como cancelar (REGRA OBRIGATÓRIA)
- Para saber qual agendamento e seu id, use a ferramenta proximos_agendamentos.
- Se houver mais de um agendamento, pergunte qual o cliente quer cancelar.
- Para confirmar, chame pedir_confirmacao com acao "cancelar_agendamento" e params { agendamento_id }, dizendo no texto a data e a hora do treino + as regras de cancelamento.
- Você nunca cancela por conta própria nem diz "já cancelei": o sistema cancela e responde o resultado quando o cliente tocar em "Confirmar".

# Regras gerais
- Nunca invente regras, valores, horários ou políticas. Para preços use a ferramenta; para dúvidas use a base de conhecimento. Se realmente não tiver a informação, diga com sinceridade que não tem esse dado no momento e siga ajudando no que puder — sem mandar o cliente para outro canal.

# Fatos úteis (responda com isto quando perguntarem)
- Escolher o coach / qual coach vai atender: a escolha do coach na hora de agendar é um BENEFÍCIO EXCLUSIVO do plano **Coach CT Pro**. Nos demais planos, o coach é definido na chegada ao Studio (não dá pra escolher antes). Então, se o cliente perguntar quem vai atender ou se pode escolher o coach, explique isso de forma simpática e APROVEITE para mencionar que, com o plano Coach CT Pro, ele poderia escolher o coach já no agendamento — como uma sugestão leve e convidativa, sem ser insistente. Nunca prometa um nome específico nem mande perguntar em outro canal.

# Sobre preços e pacotes (CUIDADO — não confunda as famílias)
A ferramenta consultar_precos traz, para cada produto, o campo "para_que_serve". RESPEITE ele à risca:
- TREINO COM COACH (Coach CT, personal 1×1) são APENAS: Coach CT Avulso e os dois planos Coach CT Pro (Trimestral e Semestral). Mais nada.
- MUSCULAÇÃO LIVRE (treino no seu ritmo, sem coach): Treino Avulso, os Pacotes 5/10/40 Treinos e os Planos Semestral/Anual Just CT. ATENÇÃO: apesar de se chamarem "Just CT", os planos Semestral e Anual dão acesso SÓ à musculação livre — nunca os ofereça como Coach CT/personal.
- JustClub são as aulas coletivas (ex.: Ilimitado Semestral JustClub).
Nunca apresente pacote de treino, nem os planos Semestral/Anual Just CT, como se fossem Coach CT. Quando listar, deixe clara a modalidade e, quando útil, cite a validade (validade_dias) e os créditos.

# Endereços das unidades
${enderecosTxt}

# Base de conhecimento (use como fonte para dúvidas gerais)
${faqTxt}

# Como responder
- Português do Brasil, SEMPRE caloroso, gentil e empático — acolha primeiro, ajude sempre, nunca robótico. A Just CT tem uma marca direta e bem-humorada, mas por texto sarcasmo e secura soam mal: então puxe para o lado gentil. Pode ser leve e soltar uma brincadeira pontual quando couber (ex.: quando o cliente quer faltar/cancelar o treino, um "bora não amarelar? 😄"), com bom humor e carinho — nunca deboche, nunca forçado.
- Mensagens CURTAS (é WhatsApp). Use no máximo poucas linhas.
- Formate datas como DD/MM e horários como HH:MM. Nada de markdown de título ou tabela.
- Ao listar horários ou aulas com vaga, mostre APENAS os horários (e o tipo da aula, quando for Club) — NUNCA escreva a quantidade de vagas (nada de "16 vagas", "1 vaga", "bastante vaga"). Ex.: "Amanhã tem Running Funcional às 06:00, 07:00, 12:15, 18:30 e 19:30." Só mencione que algo está lotado se o cliente quiser justamente aquele horário cheio (aí ofereça a fila).
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
    name: 'responder_com_botoes',
    description: 'Envia sua resposta ao cliente com BOTÕES clicáveis, em vez de texto puro. Use para escolhas curtas (até 3 opções) que NÃO mexem na agenda — por exemplo escolher a unidade (Vila Olímpia/Pinheiros) ou entre dois horários. NÃO use para o "sim/não" final de agendar, cancelar, reservar ou fila: para isso use SEMPRE pedir_confirmacao. NÃO use para listas de horários (muitos itens). Coloque a pergunta/mensagem em "texto" e cada opção como um botão curto (até 20 caracteres). Esta ferramenta ENCERRA o turno: depois de chamá-la, a resposta já vai para o cliente.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'a mensagem/pergunta que aparece acima dos botões' },
        botoes: {
          type: 'array',
          description: 'de 1 a 3 opções de botão',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string', description: 'rótulo curto do botão, até 20 caracteres (ex.: Vila Olímpia, Pinheiros)' },
            },
            required: ['titulo'],
          },
        },
      },
      required: ['texto', 'botoes'],
    },
  },
  {
    name: 'pedir_confirmacao',
    description: 'Pede o "sim" final ao cliente antes de QUALQUER ação que mexe na agenda e DEIXA O SISTEMA EXECUTAR a ação quando ele tocar em "Confirmar". Use SEMPRE (no lugar de responder_com_botoes) para: agendar treino, cancelar treino, reservar aula, cancelar reserva, entrar na fila e sair da fila. Você NÃO executa a ação — ao chamar esta ferramenta seu turno TERMINA e o sistema cuida do resto (não diga "já fiz"). Passe "acao" (uma das chaves abaixo), os "params" que ela exige e um "texto" curto repetindo data/hora/plano + as regras de cancelamento.\n\nValores de "acao" e seus "params":\n- "cancelar_agendamento": { "agendamento_id": "<id de proximos_agendamentos>" }\n- "agendar_treino": { "data": "AAAA-MM-DD", "hora": "HH:MM", "tipo_credito": "<chave de consultar_saldo>" }\n- "reservar_aula_club": { "ocorrencia_id": "<id de aulas_club_disponiveis>", "tipo_credito": "<chave>", "posicao": "<R03/F07 só para Running Funcional; senão omita>" }\n- "cancelar_reserva_club": { "reserva_id": "<id de proximas_reservas_club>" }\n- "entrar_fila": { "data": "AAAA-MM-DD", "hora": "HH:MM", "tipo_credito": "<chave>" }\n- "entrar_fila_club": { "ocorrencia_id": "<id de aulas_club_disponiveis>", "tipo_credito": "<chave>" }\n- "sair_fila": { "fila_id": "<id de posicao_na_fila>" }',
    input_schema: {
      type: 'object',
      properties: {
        acao: {
          type: 'string',
          description: 'a ação que o sistema executa depois que o cliente tocar em "Confirmar"',
          enum: ['cancelar_agendamento', 'agendar_treino', 'reservar_aula_club', 'cancelar_reserva_club', 'entrar_fila', 'entrar_fila_club', 'sair_fila'],
        },
        params: {
          type: 'object',
          description: 'os parâmetros que a ação exige (ver a lista na descrição desta ferramenta)',
        },
        texto: {
          type: 'string',
          description: 'mensagem curta de confirmação que o cliente vê acima dos botões (repita data/hora/plano e as regras de cancelamento)',
        },
      },
      required: ['acao', 'params', 'texto'],
    },
  },
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
    name: 'posicoes_livres_club',
    description: 'Lista as posições livres de uma aula de Running Funcional, separadas em esteira (R) e funcional (F). Use antes de reservar Running Funcional. ocorrencia_id vem de aulas_club_disponiveis.',
    input_schema: {
      type: 'object',
      properties: {
        ocorrencia_id: { type: 'string', description: 'id da aula de running funcional' },
      },
      required: ['ocorrencia_id'],
    },
  },
  {
    name: 'recuperar_acesso',
    description: 'Regulariza o acesso do cliente ao site (login = e-mail + senha): cria ou redefine a conta com o e-mail informado e gera uma senha provisória, que VOCÊ repassa ao cliente aqui no WhatsApp. Use quando o cliente não consegue acessar, esqueceu a senha ou nunca acessou. Antes de chamar, pergunte qual e-mail ele quer usar para entrar.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'e-mail que o cliente quer usar para fazer login' },
      },
      required: ['email'],
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
    case 'recuperar_acesso':
      return JSON.stringify(await recuperarAcessoCliente(supabase, cliente.id, String(input?.email ?? '')))
    case 'aulas_club_disponiveis':
      return JSON.stringify(await aulasClubDisponiveis(supabase, String(input?.unidade ?? ''), String(input?.data ?? '')))
    case 'posicoes_livres_club':
      return JSON.stringify(await posicoesLivresClub(supabase, String(input?.ocorrencia_id ?? '')))
    default:
      return JSON.stringify({ erro: `ferramenta desconhecida: ${nome}` })
  }
}

// ---------------------------------------------------------------------------
// Execução de uma ação JÁ CONFIRMADA pelo cliente (o "sim" do botão)
// ---------------------------------------------------------------------------

/**
 * Executa uma ação de escrita depois que o cliente confirmou (tocou em "Confirmar"
 * ou respondeu "sim"). É chamada pelo WEBHOOK — fora do loop do modelo — a partir
 * da ação pendente salva, de forma determinística. Devolve a mensagem já pronta
 * para o cliente (as próprias ações retornam textos amigáveis em ok e em erro).
 */
export async function executarAcaoConfirmada(
  supabase: SupabaseClient,
  clienteId: string,
  acao: string,
  params: any,
): Promise<{ texto: string }> {
  const p = params ?? {}
  let r: ResultadoAcao
  switch (acao) {
    case 'cancelar_agendamento':
      r = await cancelarAgendamentoCt(supabase, clienteId, String(p.agendamento_id ?? ''))
      break
    case 'agendar_treino':
      r = await agendarCt(supabase, clienteId, {
        data: String(p.data ?? ''),
        hora: String(p.hora ?? ''),
        tipoCredito: String(p.tipo_credito ?? ''),
      })
      break
    case 'reservar_aula_club':
      r = await reservarClub(supabase, clienteId, {
        ocorrenciaId: String(p.ocorrencia_id ?? ''),
        tipoCredito: String(p.tipo_credito ?? ''),
        posicao: p.posicao ? String(p.posicao) : undefined,
      })
      break
    case 'cancelar_reserva_club':
      r = await cancelarReservaClub(supabase, clienteId, String(p.reserva_id ?? ''))
      break
    case 'entrar_fila':
      r = await entrarFilaCt(supabase, clienteId, {
        data: String(p.data ?? ''),
        hora: String(p.hora ?? ''),
        tipoCredito: String(p.tipo_credito ?? ''),
      })
      break
    case 'entrar_fila_club':
      r = await entrarFilaClub(supabase, clienteId, {
        ocorrenciaId: String(p.ocorrencia_id ?? ''),
        tipoCredito: String(p.tipo_credito ?? ''),
      })
      break
    case 'sair_fila':
      r = await sairFila(supabase, clienteId, String(p.fila_id ?? ''))
      break
    default:
      r = { ok: false, mensagem: 'Não consegui identificar a ação para confirmar. Pode me dizer de novo o que você quer fazer?' }
  }
  return { texto: r.mensagem }
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export interface TurnoConversa {
  role: 'user' | 'assistant'
  content: string
}

/** Resposta do agente: texto e, opcionalmente, botões clicáveis. */
export interface RespostaAgente {
  texto: string
  botoes?: { id: string; titulo: string }[]
  /**
   * Presente quando o agente pediu confirmação de uma ação (via pedir_confirmacao).
   * O webhook salva isto como "ação pendente" e a executa quando o cliente confirmar.
   */
  acaoPendente?: { acao: string; params: any; resumo: string }
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
}): Promise<RespostaAgente> {
  const { supabase, cliente, mensagem, historico = [], registroTools } = params

  const client = new Anthropic() // lê ANTHROPIC_API_KEY do ambiente

  // Contexto geral (endereços + base de conhecimento) injetado no system prompt.
  const [enderecos, faq] = await Promise.all([
    listarEnderecos(supabase),
    listarConhecimento(supabase),
  ])
  const ctx: ContextoGeral = { enderecos, faq }

  // Data de hoje e de amanhã (fuso de SP) — entregues prontas para o agente não
  // precisar fazer conta de data (era a origem do "bug noturno": à noite o
  // servidor em UTC já estava no dia seguinte).
  const { dataStr } = agoraEmSaoPaulo()
  const extensoFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  })
  // Ancorado ao meio-dia UTC do dia-calendário de SP → soma de 1 dia é segura.
  const hojeNoon = new Date(dataStr + 'T12:00:00Z')
  const amanhaNoon = new Date(hojeNoon.getTime() + 24 * 60 * 60 * 1000)
  const amanhaStr = amanhaNoon.toISOString().slice(0, 10)
  const hoje = {
    dataStr,
    extenso: extensoFmt.format(hojeNoon),
    amanhaStr,
    amanhaExtenso: extensoFmt.format(amanhaNoon),
  }

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
      // Terminal: pedido de confirmação de uma ação. Encerra o turno e devolve a
      // ação pendente — o webhook a executa quando o cliente tocar em "Confirmar".
      const blocoConfirma = resposta.content.find(
        (b): b is Anthropic.ToolUseBlock =>
          b.type === 'tool_use' && b.name === 'pedir_confirmacao',
      )
      if (blocoConfirma) {
        const inp: any = blocoConfirma.input
        const texto = String(inp?.texto ?? '').trim()
        const acao = String(inp?.acao ?? '').trim()
        const params = inp?.params ?? {}
        registroTools?.push(`pedir_confirmacao(${JSON.stringify(inp)})`)
        if (texto && acao) {
          return {
            texto,
            botoes: [
              { id: 'confirmar', titulo: 'Confirmar' },
              { id: 'negar', titulo: 'Agora não' },
            ],
            acaoPendente: { acao, params, resumo: texto },
          }
        }
        if (texto) return { texto } // malformado → manda só o texto
      }

      // Terminal: o agente quer responder com BOTÕES? Encerra o turno aqui.
      const blocoBotoes = resposta.content.find(
        (b): b is Anthropic.ToolUseBlock =>
          b.type === 'tool_use' && b.name === 'responder_com_botoes',
      )
      if (blocoBotoes) {
        const inp: any = blocoBotoes.input
        const texto = String(inp?.texto ?? '').trim()
        const brutos = Array.isArray(inp?.botoes) ? inp.botoes : []
        const botoes = brutos
          .slice(0, 3)
          .map((b: any, idx: number) => ({
            id: `btn_${idx}`,
            titulo: String(b?.titulo ?? b ?? '').trim().slice(0, 20),
          }))
          .filter((b: { titulo: string }) => b.titulo)
        registroTools?.push(`responder_com_botoes(${JSON.stringify(inp)})`)
        if (texto && botoes.length) return { texto, botoes }
        if (texto) return { texto } // veio malformado → manda só o texto
      }

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
    return { texto: texto || 'Desculpa, não consegui responder agora. Pode tentar de novo?' }
  }

  // Estourou o limite de iterações de tools.
  return { texto: 'Tive um probleminha para consultar seus dados agora. Pode tentar de novo em instantes?' }
}
