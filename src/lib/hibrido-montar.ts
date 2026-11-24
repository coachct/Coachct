// Montagem do treino híbrido a partir de texto livre (Claude). Usado só no servidor.
// Nada é gravado aqui: devolve o rascunho no formato do editor.
// Dois modos: montar do zero (só o texto) ou ajustar (treino atual + o que mudar).

import Anthropic from '@anthropic-ai/sdk'
import { Bloco, EstacaoRow, Treino, novoId } from '@/lib/hibrido'

const MODELO = process.env.HIBRIDO_MODELO || 'claude-opus-5-5'

const str = { type: 'string' }
const int = { type: 'integer' }
const intOuNull = { type: ['integer', 'null'] }

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nome', 'faixa', 'duracao_seg', 'aquecimento_desc', 'aquecimento_seg', 'explicacao_desc', 'explicacao_seg', 'blocos', 'duvidas', 'faltou'],
  properties: {
    nome: str,
    faixa: { type: 'integer', enum: [1, 2, 3] },
    duracao_seg: int,
    aquecimento_desc: str,
    aquecimento_seg: int,
    explicacao_desc: str,
    explicacao_seg: int,
    blocos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nome', 'formato', 'etapa_seg', 'transicao_seg', 'rounds', 'a_comeca', 'rodizio_chao', 'ordem', 'alunos_corrida', 'corrida_em_dupla', 'estacoes'],
        properties: {
          nome: str,
          formato: { type: 'string', enum: ['grupos_ab', 'circuito', 'todos'] },
          etapa_seg: int,
          transicao_seg: int,
          rounds: int,
          a_comeca: { type: 'string', enum: ['corrida', 'estacoes'] },
          rodizio_chao: { type: 'boolean' },
          ordem: { type: 'array', items: int },
          alunos_corrida: int,
          corrida_em_dupla: { type: 'boolean' },
          estacoes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['estacao', 'rotulo', 'postos', 'pessoas', 'modo_dupla', 'instrucao', 'meta', 'carga_f', 'carga_m', 'esteira'],
              properties: {
                estacao: { type: 'string', enum: ['corrida', 'remo', 'ski', 'wall_ball', 'sled', 'funcional'] },
                rotulo: str,
                postos: intOuNull,
                pessoas: intOuNull,
                modo_dupla: { type: 'string', enum: ['individual', 'alternado', 'juntos', 'meta_dividida'] },
                instrucao: str,
                meta: str,
                carga_f: str,
                carga_m: str,
                esteira: str,
              },
            },
          },
        },
      },
    },
    duvidas: { type: 'array', items: str },
    faltou: { type: 'array', items: str },
  },
}

const SISTEMA = `Você monta treinos híbridos (corrida na esteira + estações) da sala de Running da JustClub Vila Olímpia, a partir da descrição em texto livre escrita pelo coach (muitas vezes colada do Notes do celular). Devolva o treino no formato JSON pedido. Escreva tudo em português do Brasil.

Regras fixas do sistema:
- Faixas de ocupação: 1 = até 20 alunos; 2 = 21 a 32; 3 = 33 a 40 (20 duplas). Se o texto disser o número de alunos, a faixa sai dele; se não disser, use a faixa selecionada na tela.
- Estações possíveis: corrida (esteira), remo, ski (SkiErg), wall_ball, sled, funcional. Funcional pode aparecer várias vezes no mesmo bloco, com rotulo "Funcional A", "Funcional B"…; nas outras estações deixe rotulo vazio.
- Esteira: no máximo 10 alunos correndo ao mesmo tempo, ou 20 em dupla (corrida_em_dupla = true). alunos_corrida = quantos alunos estão na esteira em cada etapa.
- A aula tem abertura (aquecimento + explicação e arrumação) e depois os blocos. Não existe volta à calma: a aula termina no último bloco.
- Todos os tempos em segundos.
- Texto ditado vem sem pontuação e com números por extenso ("quatro minutos", "duzentos e cinquenta metros", "quatro barra seis quilos" = 4/6 kg): interprete normalmente.

Formatos de bloco:
- grupos_ab: metade da turma na esteira, metade no chão; a cada etapa os grupos trocam de lado. UM round = DUAS etapas (A na esteira e B no chão, depois o inverso). a_comeca diz onde o Grupo A começa. A esteira vira UMA linha "corrida" em estacoes (postos = número de esteiras, pessoas = alunos_corrida, modo_dupla, instrucao, meta); as outras linhas são as estações do chão (postos = equipamentos; pessoas = quantas pessoas ficam na estação). rodizio_chao = true quando a cada volta ao chão a dupla vai para a próxima estação; rounds é o que o texto disser (se não disser, não calcule: 1 e entra em faltou). ordem fica vazia.
  Sala (fixa): as 10 esteiras ficam em pares E1 a E5 e o chão tem 5 estações com os mesmos códigos: E1 Grama (sled ou outro exercício na grama), E2 Ski, E3 Funcional, E4 Remo, E5 Wall Ball. As linhas do chão vão SEMPRE nesta ordem (E1, E2, E3, E4, E5), mesmo que o texto liste em outra ordem. Se o texto tiver estação que não cabe na sala (ex.: duas de remo, ou mais de 5 no chão), monte como está e diga em duvidas.
  Regra da sala: em grupos_ab o rodízio no chão é SEMPRE ligado (rodizio_chao = true). Só desligue se o texto disser explicitamente que cada dupla fica sempre na mesma estação.
- PASSAGEM POR CÓDIGO (o formato mais usado pela coordenação): o texto lista E1…E5 e, dentro de cada código, o exercício do chão E MAIS uma linha "Esteira: …" (ex.: "E1 Grama: passada sandbag … Esteira: tiro 45'' cada"), com um tempo de execução por estação (ex.: "Execução 3'40'' – transição 20''").
  Como funciona na sala: cada código é UMA estação que junta as 2 esteiras e o posto do chão daquele código. Durante o tempo da estação (3:40) as pessoas do código se revezam entre a esteira e o chão (o "45'' cada" da esteira acontece DENTRO dos 3:40). Acabou o tempo, transição, e todos giram para o código seguinte no sentido horário (E5 → E1).
  Monte assim: formato = "circuito"; SEM linha "corrida"; uma linha por código na ordem E1, E2, E3, E4, E5 (estacao = tipo do chão; E1 Grama = o tipo do exercício que o texto der para a grama, ex.: passada com sandbag = funcional); exercício do chão em instrucao/meta/carga; o texto da esteira literal no campo esteira (ex.: "Tiro 45'' cada"); ordem = [] ; etapa_seg = tempo de execução da estação; transicao_seg = transição; rounds = quantas vezes passam por todos os códigos (o texto listar E1 a E5 uma vez = 1 round, uma passagem por código). alunos_corrida = quantos estão nas esteiras ao mesmo tempo se o texto disser (senão 0 e faltou); corrida_em_dupla conforme o texto. a_comeca = "corrida", rodizio_chao = false.
  Nos outros formatos, esteira = "".
- circuito: cada um está numa estação e a cada etapa vai para a próxima da ordem. ordem = índices (base 0) de estacoes na sequência do circuito (a corrida pode repetir, ex.: [0,1,0,2]); uma passada pela ordem = um round. a_comeca = "corrida", rodizio_chao = false.
- todos: todo mundo na mesma estação ao mesmo tempo, seguindo a ordem (índices de estacoes). a_comeca = "corrida", rodizio_chao = false.

Conta do tempo (a aula tem duracao_seg, padrão 3000 = 50:00):
- Etapas do bloco = rounds × (2 em grupos_ab; tamanho da ordem em circuito/todos, ou o número de estações se a ordem estiver vazia).
- Cada etapa é seguida de uma transição, MENOS a última etapa do último bloco da aula (a aula acaba ali).
- Total = aquecimento_seg + explicacao_seg + soma dos blocos (etapas × etapa_seg + transições × transicao_seg).

REGRA PRINCIPAL: você NÃO decide nada pelo coach. Você só transcreve o que o texto diz para o formato.
- Nunca ajuste tempos para fechar a soma. Se o que o texto diz não fecha em duracao_seg, monte exatamente como está: o sistema mostra a diferença e o coach corrige.
- Valor que o texto não diz (tempo, rounds, carga, meta, número de pessoas, exercício): não invente nem calcule. Tempo ou número sem informação = 0 (rounds = 1; postos/pessoas = null); texto sem informação = "". Cada um entra em faltou, dizendo onde (ex.: "Bloco 1: tempo da transição", "Bloco 1: carga do sled").
- Se um trecho do texto dá para ler de mais de um jeito, use a leitura mais literal e coloque em duvidas qual foi a leitura e qual seria a outra (ex.: "Bloco 1: li 3:45 como tempo de cada etapa; se for de cada round, cada etapa teria 1:52").
- Se o texto contradiz uma regra fixa (ex.: 12 alunos na esteira sem dupla), monte como está e diga em duvidas.
- nome: curto, descritivo (ex.: "Esteira × 5 estações"). É o único campo que você pode criar se o texto não der.

Modo AJUSTAR (quando vier um TREINO ATUAL junto):
- O treino atual já está montado e pode ter sido editado à mão. Parta dele e aplique SÓ o que o pedido muda ou completa (ex.: preencher uma carga, trocar uma estação, mudar o tempo).
- Tudo o que o pedido não menciona fica exatamente igual: nomes, textos, cargas, metas, postos, pessoas, tempos, ordem dos blocos e das estações. Nunca mexa em outro tempo para compensar.
- duvidas: só as deste ajuste. faltou: o que ainda falta no treino inteiro depois do ajuste.`

// Treino do editor → mesmo formato da resposta (para o modo ajustar)
function paraEsquema(t: Treino) {
  return {
    nome: t.nome,
    faixa: t.faixa,
    duracao_seg: t.duracao_seg,
    aquecimento_desc: t.aquecimento_desc,
    aquecimento_seg: t.aquecimento_seg,
    explicacao_desc: t.explicacao_desc,
    explicacao_seg: t.explicacao_seg,
    blocos: (t.blocos || []).map(b => {
      const idx = new Map((b.estacoes || []).map((e, i) => [e.id, i]))
      return {
        nome: b.nome,
        formato: b.formato,
        etapa_seg: b.etapa_seg,
        transicao_seg: b.transicao_seg,
        rounds: b.rounds,
        a_comeca: b.rodizio?.a_comeca || 'corrida',
        rodizio_chao: b.formato === 'grupos_ab' ? b.rodizio?.rodizio_chao !== false : false,
        ordem: (b.rodizio?.ordem || []).map(id => idx.get(id)).filter(i => i !== undefined),
        alunos_corrida: b.alunos_corrida,
        corrida_em_dupla: b.corrida_em_dupla,
        estacoes: (b.estacoes || []).map(e => ({
          estacao: e.estacao,
          rotulo: e.rotulo,
          postos: e.postos === '' ? null : Number(e.postos),
          pessoas: e.pessoas === '' ? null : Number(e.pessoas),
          modo_dupla: e.modo_dupla,
          instrucao: e.instrucao,
          meta: e.meta,
          carga_f: e.carga_f,
          carga_m: e.carga_m,
          esteira: e.esteira || '',
        })),
      }
    }),
  }
}

function paraTreino(o: any, padrao: { faixa: number; duracao_seg: number }): Treino {
  const n = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : d)
  const blocos: Bloco[] = (o.blocos || []).map((b: any) => {
    const estacoes: EstacaoRow[] = (b.estacoes || []).map((e: any) => ({
      id: novoId(),
      estacao: e.estacao,
      rotulo: e.rotulo || '',
      postos: e.postos == null ? '' : String(e.postos),
      pessoas: e.pessoas == null ? '' : String(e.pessoas),
      modo_dupla: e.modo_dupla,
      instrucao: e.instrucao || '',
      meta: e.meta || '',
      carga_f: e.carga_f || '',
      carga_m: e.carga_m || '',
      esteira: b.formato !== 'todos' && e.estacao !== 'corrida' ? e.esteira || '' : '',
    }))
    const ab = b.formato === 'grupos_ab'
    return {
      id: novoId(),
      nome: b.nome || '',
      formato: b.formato,
      etapa_seg: n(b.etapa_seg),
      transicao_seg: n(b.transicao_seg),
      rounds: Math.max(1, n(b.rounds, 1)),
      rodizio: ab
        ? { a_comeca: b.a_comeca === 'estacoes' ? 'estacoes' : 'corrida', rodizio_chao: b.rodizio_chao !== false }
        : { ordem: (b.ordem || []).map((i: any) => estacoes[Number(i)]?.id).filter(Boolean) },
      alunos_corrida: n(b.alunos_corrida),
      corrida_em_dupla: !!b.corrida_em_dupla,
      estacoes,
    }
  })
  return {
    id: null,
    nome: o.nome || '',
    faixa: [1, 2, 3].includes(o.faixa) ? o.faixa : padrao.faixa,
    duracao_seg: n(o.duracao_seg, padrao.duracao_seg) || padrao.duracao_seg,
    aquecimento_desc: o.aquecimento_desc || '',
    aquecimento_seg: n(o.aquecimento_seg),
    explicacao_desc: o.explicacao_desc || '',
    explicacao_seg: n(o.explicacao_seg),
    modelo: false,
    blocos,
  }
}

export async function montarTreino(
  textoBruto: string,
  pad: { faixa: number; duracao_seg: number },
  atual?: Treino | null,
): Promise<{ status: number; body: any }> {
  const texto = textoBruto.trim()
  const minimo = atual ? 3 : 10
  if (texto.length < minimo) return { status: 400, body: { error: atual ? 'Diga o que quer mudar no treino.' : 'Descreva o treino com um pouco mais de detalhe.' } }
  if (texto.length > 6000) return { status: 400, body: { error: 'Texto muito longo (máx. 6000 caracteres).' } }
  const padrao = {
    faixa: [1, 2, 3].includes(pad.faixa) ? pad.faixa : 3,
    duracao_seg: pad.duracao_seg > 0 ? Math.round(pad.duracao_seg) : 3000,
  }

  const conteudo = atual
    ? `MODO AJUSTAR.\n\nTREINO ATUAL:\n${JSON.stringify(paraEsquema(atual))}\n\nO QUE MUDAR OU COMPLETAR:\n${texto}`
    : `Faixa selecionada na tela (use se o texto não disser): ${padrao.faixa}. Duração da aula: ${padrao.duracao_seg} s.\n\nDescrição do treino:\n${texto}`

  let resp: Anthropic.Message
  try {
    const client = new Anthropic() // lê ANTHROPIC_API_KEY do ambiente
    resp = await client.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: SISTEMA,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: conteudo }],
    })
  } catch (e: any) {
    console.error('[hibrido/montar]', e?.status, e?.message)
    return { status: 502, body: { error: 'Não foi possível montar o treino agora. Tente de novo em instantes.' } }
  }

  if (resp.stop_reason === 'refusal') return { status: 422, body: { error: 'O texto não pôde ser processado. Reescreva a descrição do treino.' } }
  if (resp.stop_reason === 'max_tokens') return { status: 422, body: { error: 'A descrição ficou grande demais para montar de uma vez. Divida em partes.' } }
  const txt = resp.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text
  let o: any
  try { o = JSON.parse(txt || '') } catch { return { status: 502, body: { error: 'A montagem voltou num formato inválido. Tente de novo.' } } }

  // Soma, esteira, pessoas etc. o editor confere sozinho (inconsistencias) e mostra fixo na tela
  const treino = paraTreino(o, padrao)
  const faltou: string[] = Array.isArray(o.faltou) ? o.faltou.map(String) : []
  const duvidas: string[] = Array.isArray(o.duvidas) ? o.duvidas.map(String) : []

  return { status: 200, body: { treino, duvidas, faltou } }
}
