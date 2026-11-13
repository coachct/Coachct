// Treino Híbrido (sala de Running da JustClub Vila Olímpia): tipos, contas e acesso ao banco.
// Tempos ficam em segundos no banco e aparecem como mm:ss.

export const UNIDADE_VO = '05eeab3e-5eae-4140-bc3a-1c1d56ac95be'
export const DURACAO_PADRAO = 3000

export type Formato = 'grupos_ab' | 'circuito' | 'todos'
export type Estacao = 'corrida' | 'remo' | 'ski' | 'wall_ball' | 'sled' | 'funcional'
export type ModoDupla = 'individual' | 'alternado' | 'juntos' | 'meta_dividida'

export const FAIXAS: { n: number; alunos: string; curto: string }[] = [
  { n: 1, alunos: 'até 10 alunos', curto: 'até 10' },
  { n: 2, alunos: '11 a 20 alunos', curto: '11 a 20' },
  { n: 3, alunos: '21 a 30 alunos', curto: '21 a 30' },
  { n: 4, alunos: '31 a 40 alunos · 20 duplas', curto: '31 a 40' },
]

export const FORMATOS: { key: Formato; label: string }[] = [
  { key: 'grupos_ab', label: 'Grupos A/B (troca)' },
  { key: 'circuito', label: 'Circuito por estações' },
  { key: 'todos', label: 'Todos na mesma estação' },
]

export const ESTACOES: { key: Estacao; label: string }[] = [
  { key: 'corrida', label: 'Corrida' },
  { key: 'remo', label: 'Remo' },
  { key: 'ski', label: 'SkiErg' },
  { key: 'wall_ball', label: 'Wall ball' },
  { key: 'sled', label: 'Sled' },
  { key: 'funcional', label: 'Funcional' },
]

export const MODOS_DUPLA: { key: ModoDupla; label: string }[] = [
  { key: 'individual', label: 'Individual' },
  { key: 'alternado', label: 'Alternado' },
  { key: 'juntos', label: 'Juntos' },
  { key: 'meta_dividida', label: 'Meta dividida' },
]

export const LIMITE_ESTEIRA = 10
export const LIMITE_ESTEIRA_DUPLA = 20

export interface EstacaoRow {
  id: string
  estacao: Estacao
  rotulo: string
  postos: string
  pessoas: string
  modo_dupla: ModoDupla
  instrucao: string
  meta: string
  carga_f: string
  carga_m: string
}

export interface Rodizio {
  a_comeca?: 'corrida' | 'estacoes'
  // Grupos A/B: a cada volta ao chão, a dupla vai para a próxima estação (padrão: sim)
  rodizio_chao?: boolean
  ordem?: string[]
}

export interface Bloco {
  id: string
  nome: string
  formato: Formato
  etapa_seg: number
  transicao_seg: number
  rounds: number
  rodizio: Rodizio
  alunos_corrida: number
  corrida_em_dupla: boolean
  estacoes: EstacaoRow[]
}

export interface Treino {
  id: string | null
  nome: string
  faixa: number
  duracao_seg: number
  aquecimento_desc: string
  aquecimento_seg: number
  explicacao_desc: string
  explicacao_seg: number
  modelo: boolean
  blocos: Bloco[]
}

export const novoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

// ---- mm:ss -------------------------------------------------------------------

export function mmss(seg: number) {
  const s = Math.max(0, Math.round(seg))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// "5" = 5 min; "5:30" / "05:30" = 5min30. Inválido → null.
export function lerMmss(txt: string): number | null {
  const t = txt.trim()
  if (!t) return 0
  if (/^\d+$/.test(t)) return parseInt(t, 10) * 60
  const m = /^(\d+):([0-5]?\d)$/.exec(t)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

export const labelEstacao = (e: Estacao) => ESTACOES.find(x => x.key === e)?.label || e
export const nomeEstacao = (row: EstacaoRow) => row.rotulo.trim() || labelEstacao(row.estacao)

// ---- contas ------------------------------------------------------------------

// Ordem do circuito: só ids que ainda existem na tabela; vazia = ordem da tabela.
export function ordemCircuito(b: Bloco): EstacaoRow[] {
  const porId = new Map(b.estacoes.map(e => [e.id, e]))
  const ord = (b.rodizio.ordem || []).map(id => porId.get(id)).filter(Boolean) as EstacaoRow[]
  return ord.length ? ord : b.estacoes
}

export function etapasPorRound(b: Bloco) {
  if (b.formato === 'grupos_ab') return 2
  return Math.max(1, ordemCircuito(b).length)
}

// Cada etapa tem a sua transição; rounds repetem o bloco inteiro.
export function totalBloco(b: Bloco) {
  return b.rounds * etapasPorRound(b) * (b.etapa_seg + b.transicao_seg)
}

// Tempo que cada aluno/dupla passa na corrida dentro do bloco.
export function corridaBloco(b: Bloco) {
  if (b.formato === 'grupos_ab') return b.rounds * b.etapa_seg
  const corridas = ordemCircuito(b).filter(e => e.estacao === 'corrida').length
  return b.rounds * corridas * b.etapa_seg
}

// ---- Grupos A/B: esteira × chão ------------------------------------------------

export const estacoesChao = (b: Bloco) => b.estacoes.filter(e => e.estacao !== 'corrida')
export const rodizioChaoLigado = (b: Bloco) => b.rodizio.rodizio_chao !== false

export type EtapaAB = {
  n: number
  round: number
  inicio: number
  fim: number
  aEsteira: boolean
  // Qual volta ao chão é esta para o grupo que está no chão (0 = primeira)
  voltaChao: number
}

// Etapa por etapa do bloco A/B: em cada round os grupos trocam de lado uma vez.
export function roteiroAB(b: Bloco): EtapaAB[] {
  const aComecaEsteira = (b.rodizio.a_comeca || 'corrida') === 'corrida'
  const out: EtapaAB[] = []
  let t = 0
  let voltaA = 0, voltaB = 0
  for (let r = 0; r < b.rounds; r++) {
    for (let k = 0; k < 2; k++) {
      const aEsteira = (k === 0) === aComecaEsteira
      const voltaChao = aEsteira ? voltaB++ : voltaA++
      out.push({ n: out.length + 1, round: r + 1, inicio: t, fim: t + b.etapa_seg, aEsteira, voltaChao })
      t += b.etapa_seg + b.transicao_seg
    }
  }
  return out
}

// Estação de quem começou na posição p (ordem da tabela) na volta v ao chão.
export function estacaoNaVolta(chao: EstacaoRow[], p: number, v: number, rodizio: boolean) {
  if (!chao.length) return null
  return chao[rodizio ? (p + v) % chao.length : p]
}

export function limiteEsteira(b: Bloco) {
  return b.corrida_em_dupla ? LIMITE_ESTEIRA_DUPLA : LIMITE_ESTEIRA
}

export function passouEsteira(b: Bloco) {
  return b.alunos_corrida > limiteEsteira(b)
}

export function resumo(t: Treino) {
  const abertura = t.aquecimento_seg + t.explicacao_seg
  const blocos = t.blocos.reduce((s, b) => s + totalBloco(b), 0)
  const corrida = t.blocos.reduce((s, b) => s + corridaBloco(b), 0)
  const soma = abertura + blocos
  const diff = t.duracao_seg - soma
  const pctCorrida = blocos > 0 ? Math.round((100 * corrida) / blocos) : 0
  return {
    abertura,
    blocos,
    corrida,
    soma,
    diff,
    fecha: diff === 0,
    pctCorrida,
    poucaCorrida: blocos > 0 && corrida * 2 < blocos,
    esteiraEstourada: t.blocos.some(passouEsteira),
  }
}

export function faixaDeAlunos(n: number) {
  if (n <= 10) return 1
  if (n <= 20) return 2
  if (n <= 30) return 3
  return 4
}

export function estacoesUsadas(blocos: { estacoes: { estacao: Estacao }[] }[]): Estacao[] {
  const s = new Set<Estacao>()
  blocos.forEach(b => b.estacoes.forEach(e => s.add(e.estacao)))
  return ESTACOES.map(e => e.key).filter(k => s.has(k))
}

// ---- novos itens -------------------------------------------------------------

export function treinoVazio(faixa = 1): Treino {
  return {
    id: null,
    nome: '',
    faixa,
    duracao_seg: DURACAO_PADRAO,
    aquecimento_desc: '',
    aquecimento_seg: 0,
    explicacao_desc: '',
    explicacao_seg: 0,
    modelo: false,
    blocos: [],
  }
}

export function blocoVazio(): Bloco {
  return {
    id: novoId(),
    nome: '',
    formato: 'grupos_ab',
    etapa_seg: 0,
    transicao_seg: 0,
    rounds: 1,
    rodizio: { a_comeca: 'corrida', rodizio_chao: true },
    alunos_corrida: 0,
    corrida_em_dupla: false,
    estacoes: [],
  }
}

export function estacaoVazia(estacao: Estacao, existentes: EstacaoRow[]): EstacaoRow {
  // Funcional pode repetir no bloco: Funcional A, Funcional B…
  let rotulo = ''
  if (estacao === 'funcional') {
    const n = existentes.filter(e => e.estacao === 'funcional').length
    rotulo = `Funcional ${String.fromCharCode(65 + n)}`
  }
  return {
    id: novoId(),
    estacao,
    rotulo,
    postos: '',
    pessoas: '',
    modo_dupla: 'individual',
    instrucao: '',
    meta: '',
    carga_f: '',
    carga_m: '',
  }
}

// Cópia com ids novos (blocos, estações e a ordem do circuito apontando para os novos ids).
export function clonarBlocos(blocos: Bloco[]): Bloco[] {
  return blocos.map(b => {
    const mapa = new Map<string, string>()
    const estacoes = b.estacoes.map(e => {
      const id = novoId()
      mapa.set(e.id, id)
      return { ...e, id }
    })
    const rodizio: Rodizio = { ...b.rodizio }
    if (rodizio.ordem) rodizio.ordem = rodizio.ordem.map(id => mapa.get(id)).filter(Boolean) as string[]
    return { ...b, id: novoId(), estacoes, rodizio }
  })
}

// ---- banco -------------------------------------------------------------------

const SELECT_TREINO = '*, hibrido_blocos(*, hibrido_estacoes(*))'

const txt = (v: any) => (v == null ? '' : String(v))
const intOuNull = (v: string) => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

export function treinoDoBanco(r: any): Treino {
  const blocos: Bloco[] = (r.hibrido_blocos || [])
    .sort((a: any, b: any) => a.ordem - b.ordem)
    .map((b: any) => ({
      id: b.id,
      nome: b.nome || '',
      formato: b.formato,
      etapa_seg: b.etapa_seg,
      transicao_seg: b.transicao_seg,
      rounds: b.rounds,
      rodizio: b.rodizio || {},
      alunos_corrida: b.alunos_corrida,
      corrida_em_dupla: b.corrida_em_dupla,
      estacoes: (b.hibrido_estacoes || [])
        .sort((x: any, y: any) => x.ordem - y.ordem)
        .map((e: any) => ({
          id: e.id,
          estacao: e.estacao,
          rotulo: txt(e.rotulo),
          postos: txt(e.postos),
          pessoas: txt(e.pessoas),
          modo_dupla: e.modo_dupla,
          instrucao: txt(e.instrucao),
          meta: txt(e.meta),
          carga_f: txt(e.carga_f),
          carga_m: txt(e.carga_m),
        })),
    }))
  return {
    id: r.id,
    nome: r.nome,
    faixa: r.faixa,
    duracao_seg: r.duracao_seg,
    aquecimento_desc: txt(r.aquecimento_desc),
    aquecimento_seg: r.aquecimento_seg,
    explicacao_desc: txt(r.explicacao_desc),
    explicacao_seg: r.explicacao_seg,
    modelo: r.modelo,
    blocos,
  }
}

export async function carregarTreino(supabase: any, id: string): Promise<Treino | null> {
  const { data } = await supabase.from('hibrido_treinos').select(SELECT_TREINO).eq('id', id).maybeSingle()
  return data ? treinoDoBanco(data) : null
}

export async function listarTreinos(supabase: any) {
  const { data, error } = await supabase
    .from('hibrido_treinos')
    .select('id, nome, faixa, duracao_seg, modelo, atualizado_em, hibrido_blocos(hibrido_estacoes(estacao))')
    .eq('unidade_id', UNIDADE_VO)
    .order('atualizado_em', { ascending: false })
  return { data: (data || []) as any[], error }
}

// Grava o treino inteiro: cabeçalho, depois troca blocos e estações. Devolve o id.
export async function salvarTreino(supabase: any, t: Treino): Promise<{ id: string | null; erro: string | null }> {
  const { data: u } = await supabase.auth.getUser()
  const cab = {
    nome: t.nome.trim() || 'Treino híbrido',
    faixa: t.faixa,
    duracao_seg: t.duracao_seg,
    aquecimento_desc: t.aquecimento_desc.trim() || null,
    aquecimento_seg: t.aquecimento_seg,
    explicacao_desc: t.explicacao_desc.trim() || null,
    explicacao_seg: t.explicacao_seg,
    modelo: t.modelo,
    unidade_id: UNIDADE_VO,
    atualizado_em: new Date().toISOString(),
  }
  let id = t.id
  if (id) {
    const { data, error } = await supabase.from('hibrido_treinos').update(cab).eq('id', id).select('id')
    if (error) return { id: null, erro: error.message }
    if (!data?.length) return { id: null, erro: 'Sem permissão para salvar' }
    const { error: eDel } = await supabase.from('hibrido_blocos').delete().eq('treino_id', id)
    if (eDel) return { id: null, erro: eDel.message }
  } else {
    const { data, error } = await supabase
      .from('hibrido_treinos')
      .insert({ ...cab, criado_por: u?.user?.id || null })
      .select('id')
      .single()
    if (error || !data) return { id: null, erro: error?.message || 'Não foi possível criar o treino' }
    id = data.id as string
  }

  if (t.blocos.length) {
    const blocos = t.blocos.map((b, i) => ({
      id: b.id,
      treino_id: id,
      ordem: i,
      nome: b.nome.trim(),
      formato: b.formato,
      etapa_seg: b.etapa_seg,
      transicao_seg: b.transicao_seg,
      rounds: b.rounds,
      rodizio: b.formato === 'grupos_ab'
        ? { a_comeca: b.rodizio.a_comeca || 'corrida', rodizio_chao: b.rodizio.rodizio_chao !== false }
        : { ordem: (b.rodizio.ordem || []).filter(oid => b.estacoes.some(e => e.id === oid)) },
      alunos_corrida: b.alunos_corrida,
      corrida_em_dupla: b.corrida_em_dupla,
    }))
    const { error: eB } = await supabase.from('hibrido_blocos').insert(blocos)
    if (eB) return { id, erro: eB.message }
    const estacoes = t.blocos.flatMap(b =>
      b.estacoes.map((e, i) => ({
        id: e.id,
        bloco_id: b.id,
        ordem: i,
        estacao: e.estacao,
        rotulo: e.rotulo.trim() || null,
        postos: intOuNull(e.postos),
        // Grupos A/B: as pessoas na esteira são os "alunos na corrida" do bloco
        pessoas: b.formato === 'grupos_ab' && e.estacao === 'corrida' ? b.alunos_corrida : intOuNull(e.pessoas),
        modo_dupla: e.modo_dupla,
        instrucao: e.instrucao.trim() || null,
        meta: e.meta.trim() || null,
        carga_f: e.carga_f.trim() || null,
        carga_m: e.carga_m.trim() || null,
      }))
    )
    if (estacoes.length) {
      const { error: eE } = await supabase.from('hibrido_estacoes').insert(estacoes)
      if (eE) return { id, erro: eE.message }
    }
  }
  return { id, erro: null }
}

// Programa o treino no dia e faixa (substitui o que estava) e marca o dia como híbrido.
export async function programar(supabase: any, data: string, faixa: number, treinoId: string) {
  const { error } = await supabase
    .from('hibrido_programacao')
    .upsert({ data, faixa, unidade_id: UNIDADE_VO, treino_id: treinoId }, { onConflict: 'data,faixa,unidade_id' })
  if (error) return error.message
  await supabase
    .from('hibrido_dias')
    .upsert({ data, unidade_id: UNIDADE_VO }, { onConflict: 'data,unidade_id', ignoreDuplicates: true })
  return null
}

// Média de reservas por dia da semana/horário → faixas prováveis de cada dia da semana.
export type MediaHorario = { dia_semana: number; horario: string; media: number }

export async function carregarMedias(supabase: any): Promise<MediaHorario[]> {
  const { data } = await supabase.rpc('hibrido_media_reservas', { p_unidade: UNIDADE_VO })
  return ((data || []) as any[]).map(r => ({ dia_semana: r.dia_semana, horario: r.horario, media: Number(r.media) }))
}

export function diaSemana(data: string) {
  const [y, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function faixasProvaveis(medias: MediaHorario[], data: string): Set<number> {
  const dw = diaSemana(data)
  return new Set(medias.filter(m => m.dia_semana === dw).map(m => faixaDeAlunos(Math.round(m.media))))
}

export function addDias(data: string, n: number) {
  const [y, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function fmtDia(data: string) {
  const [y, m, d] = data.split('-').map(Number)
  const sem = new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .replace('.', '')
  return { sem, dm: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`, completo: `${sem} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` }
}

export function fmtData(data: string | null) {
  if (!data) return '—'
  const [y, m, d] = data.split('-')
  return `${d}/${m}/${y.slice(2)}`
}
