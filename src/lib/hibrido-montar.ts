// Montagem do treino híbrido a partir de texto livre (Claude). Usado só no servidor.
// Nada é gravado aqui: devolve o rascunho no formato do editor.

import Anthropic from '@anthropic-ai/sdk'
import { Bloco, EstacaoRow, Treino, novoId, resumo, mmss } from '@/lib/hibrido'

const MODELO = process.env.HIBRIDO_MODELO || 'claude-opus-5-5'

const str = { type: 'string' }
const int = { type: 'integer' }
const intOuNull = { type: ['integer', 'null'] }

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nome', 'faixa', 'duracao_seg', 'aquecimento_desc', 'aquecimento_seg', 'explicacao_desc', 'explicacao_seg', 'blocos', 'decisoes', 'faltou'],
  properties: {
    nome: str,
    faixa: { type: 'integer', enum: [1, 2, 3, 4] },
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
              required: ['estacao', 'rotulo', 'postos', 'pessoas', 'modo_dupla', 'instrucao', 'meta', 'carga_f', 'carga_m'],
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
              },
            },
          },
        },
      },
    },
    decisoes: { type: 'array', items: str },
    faltou: { type: 'array', items: str },
  },
}

const SISTEMA = `VocÃª monta treinos hÃ­bridos (corrida na esteira + estaÃ§Ãµes) da sala de Running da JustClub Vila OlÃ­mpia, a partir da descriÃ§Ã£o em texto livre da coordenadora. Devolva o treino no formato JSON pedido. Escreva tudo em portuguÃªs do Brasil.

Regras fixas do sistema:
- Faixas de ocupaÃ§Ã£o: 1 = atÃ© 10 alunos; 2 = 11 a 20; 3 = 21 a 30; 4 = 31 a 40 (20 duplas). Se o texto disser o nÃºmero de alunos, a faixa sai dele.
- EstaÃ§Ãµes possÃ­veis: corrida (esteira), remo, ski (SkiErg), wall_ball, sled, funcional. Funcional pode aparecer vÃ¡rias vezes no mesmo bloco, com rotulo "Funcional A", "Funcional B"â€¦; nas outras estaÃ§Ãµes deixe rotulo vazio.
- Esteira: no mÃ¡ximo 10 alunos correndo ao mesmo tempo, ou 20 em dupla (corrida_em_dupla = true). alunos_corrida = quantos alunos estÃ£o na esteira em cada etapa.
- A aula tem abertura (aquecimento + explicaÃ§Ã£o e arrumaÃ§Ã£o) e depois os blocos. NÃ£o existe volta Ã  calma: a aula termina no Ãºltimo bloco.
- Todos os tempos em segundos.

Formatos de bloco:
- grupos_ab: metade da turma na esteira, metade no chÃ£o; a cada etapa os grupos trocam de lado. UM round = DUAS etapas (A na esteira e B no chÃ£o, depois o inverso). a_comeca diz onde o Grupo A comeÃ§a. A esteira vira UMA linha "corrida" em estacoes (postos = nÃºmero de esteiras, pessoas = alunos_corrida, modo_dupla, instrucao, meta); as outras linhas sÃ£o as estaÃ§Ãµes do chÃ£o (postos = equipamentos; pessoas = quantas pessoas ficam na estaÃ§Ã£o). rodizio_chao = true quando a cada volta ao chÃ£o a dupla vai para a prÃ³xima estaÃ§Ã£o; para todos passarem por todas as estaÃ§Ãµes do chÃ£o, rounds = nÃºmero de estaÃ§Ãµes do chÃ£o. ordem fica vazia.
- circuito: cada um estÃ¡ numa estaÃ§Ã£o e a cada etapa vai para a prÃ³xima da ordem. ordem = Ã­ndices (base 0) de estacoes na sequÃªncia do circuito (a corrida pode repetir, ex.: [0,1,0,2]); uma passada pela ordem = um round. a_comeca = "corrida", rodizio_chao = false.
- todos: todo mundo na mesma estaÃ§Ã£o ao mesmo tempo, seguindo a ordem (Ã­ndices de estacoes). a_comeca = "corrida", rodizio_chao = false.

Conta do tempo (tem que fechar EXATAMENTE em duracao_seg, padrÃ£o 3000 = 50:00):
- Etapas do bloco = rounds Ã— (2 em grupos_ab; tamanho da ordem em circuito/todos, ou o nÃºmero de estaÃ§Ãµes se a ordem estiver vazia).
- Cada etapa Ã© seguida de uma transiÃ§Ã£o, MENOS a Ãºltima etapa do Ãºltimo bloco da aula (a aula acaba ali).
- Total = aquecimento_seg + explicacao_seg + soma dos blocos (etapas Ã— etapa_seg + transiÃ§Ãµes Ã— transicao_seg).
- Para fechar a soma, ajuste primeiro a transiÃ§Ã£o, depois a explicaÃ§Ã£o. Nunca mude um valor que o texto disse explicitamente, a nÃ£o ser que seja impossÃ­vel fechar; nesse caso diga em decisoes.

Como preencher:
- Use sÃ³ o que o texto diz. NÃ£o invente carga, meta ou exercÃ­cio: o que nÃ£o estiver no texto fica "" e entra em faltou (ex.: "carga do sled").
- decisoes: frases curtas com tudo o que vocÃª teve que decidir sozinho (ex.: "transiÃ§Ã£o de 20 s para fechar 50:00", "5 rounds para passar pelas 5 estaÃ§Ãµes").
- nome: curto, descritivo (ex.: "Esteira Ã— 5 estaÃ§Ãµes").`

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
    faixa: [1, 2, 3, 4].includes(o.faixa) ? o.faixa : padrao.faixa,
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
): Promise<{ status: number; body: any }> {
  const texto = textoBruto.trim()
  if (texto.length < 10) return { status: 400, body: { error: 'Descreva o treino com um pouco mais de detalhe.' } }
  if (texto.length > 6000) return { status: 400, body: { error: 'Texto muito longo (máx. 6000 caracteres).' } }
  const padrao = {
    faixa: [1, 2, 3, 4].includes(pad.faixa) ? pad.faixa : 1,
    duracao_seg: pad.duracao_seg > 0 ? Math.round(pad.duracao_seg) : 3000,
  }

  let resp: Anthropic.Message
  try {
    const client = new Anthropic() // lê ANTHROPIC_API_KEY do ambiente
    resp = await client.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: SISTEMA,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{
        role: 'user',
        content: `Faixa selecionada na tela (use se o texto não disser): ${padrao.faixa}. Duração da aula: ${padrao.duracao_seg} s.\n\nDescrição do treino:\n${texto}`,
      }],
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

  const treino = paraTreino(o, padrao)
  const r = resumo(treino)
  const faltou: string[] = Array.isArray(o.faltou) ? o.faltou.map(String) : []
  if (!r.fecha) faltou.unshift(r.diff > 0
    ? `A soma ficou em ${mmss(r.soma)}: faltam ${mmss(r.diff)} para ${mmss(treino.duracao_seg)}.`
    : `A soma ficou em ${mmss(r.soma)}: passou ${mmss(-r.diff)} de ${mmss(treino.duracao_seg)}.`)
  if (r.esteiraEstourada) faltou.unshift('Algum bloco passou de 10 na esteira (ou 20 em dupla).')

  return { status: 200, body: { treino, decisoes: Array.isArray(o.decisoes) ? o.decisoes.map(String) : [], faltou } }
}
