// Totem Self Check-in (Just Club) — helpers de servidor.
// Isolado: só as rotas /api/totem usam. Nada aqui altera fluxo existente.
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { nomeCoachPublico } from '@/lib/mascaraCoachPublico'
import { hojeSP, aulaEncerrada } from '@/lib/tempo'
import { agendamentoCoachCtHoje } from '@/lib/totem/coach-ct'

/** Client service_role (ignora RLS). Só em rota de servidor. */
export function totemService(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('totem: variáveis Supabase ausentes')
  return createClient(url, key, {
    auth: { persistSession: false },
    // IMPORTANTE: força cada leitura a ir FRESCA ao banco. Sem isto o Next.js
    // cacheia o GET do Supabase e o polling do totem (reserva-status/ct-status)
    // fica preso no 1º valor lido ('reservado') e nunca enxerga 'presente'.
    global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) },
  })
}

export type UnidadeTotem = { id: string; slug: string; nome: string; tipo: 'club' | 'ct' }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function buscarUnidade(sb: SupabaseClient, unidade: string) {
  const v = (unidade || '').trim()
  if (!v) return null
  const q = sb.from('unidades').select('id, slug, nome, tipo, ativo')
  const { data } = UUID_RE.test(v)
    ? await q.eq('id', v).maybeSingle()
    : await q.eq('slug', v).maybeSingle()
  return data || null
}

/** Resolve ?unidade= (id OU slug) para uma unidade Club ATIVA. null se inválida. */
export async function resolverUnidadeClub(
  sb: SupabaseClient,
  unidade: string
): Promise<UnidadeTotem | null> {
  const data = await buscarUnidade(sb, unidade)
  if (!data || data.tipo !== 'club' || data.ativo === false) return null
  return { id: data.id, slug: data.slug, nome: data.nome, tipo: 'club' }
}

/** Resolve ?unidade= para uma unidade ATIVA do totem (Club OU CT). null se inválida. */
export async function resolverUnidadeTotem(
  sb: SupabaseClient,
  unidade: string
): Promise<UnidadeTotem | null> {
  const data = await buscarUnidade(sb, unidade)
  if (!data || data.ativo === false || (data.tipo !== 'club' && data.tipo !== 'ct')) return null
  return { id: data.id, slug: data.slug, nome: data.nome, tipo: data.tipo }
}

/**
 * Token opcional da unidade (brief §5/§10). Se TOTEM_TOKEN não estiver setado,
 * libera (dev/teste). Se estiver, exige header x-totem-token igual.
 */
export function totemTokenOk(req: Request): boolean {
  const esperado = process.env.TOTEM_TOKEN
  if (!esperado) return true
  return (req.headers.get('x-totem-token') || '') === esperado
}

const PARCEIRO_RE = /^(wellhub|totalpass|classpass)/i
export function ehParceiro(tipoCredito?: string | null): boolean {
  return PARCEIRO_RE.test(String(tipoCredito || ''))
}

/** Nome amigável da origem do crédito, a partir de club_reservas.tipo_credito. */
export function origemLabel(tipoCredito?: string | null): string {
  const t = String(tipoCredito || '')
  if (/^wellhub/i.test(t)) return 'Wellhub'
  if (/^totalpass/i.test(t)) return 'TotalPass'
  if (/^classpass/i.test(t)) return 'ClassPass'
  if (/^avulso/i.test(t)) return 'Crédito avulso'
  return 'Plano Just Club'
}

/** Nome de exibição da aula Club a partir de tipo + grupo muscular. */
export function nomeAulaClub(tipo?: string | null, grupo?: string | null): string {
  const g = (grupo || '').trim()
  if (tipo === 'running_funcional') return g ? `Running + Funcional · ${g}` : 'Running + Funcional'
  if (tipo === 'lift_for_girls') return g ? `Lift For Girls · ${g}` : 'Lift For Girls'
  return g ? `Lift ${g}` : 'Lift'
}

export type ClienteTotem = { id: string; nome: string; bloqueado?: boolean | null }

/** Serializa embedding [num,...] para o formato aceito pelo cast ::vector. */
export function embeddingToVectorText(embedding: number[]): string {
  return `[${embedding.map((n) => Number(n)).join(',')}]`
}

/**
 * Dado um cliente já identificado (por CPF ou rosto), monta a resposta do totem:
 * bloqueado | sem_reserva | reserva (com o fluxo: confirmar / aguardar_parceiro / confirmado).
 * Reusado pelas rotas identificar e reconhecer — fonte única da regra.
 */
export async function respostaParaCliente(
  sb: SupabaseClient,
  unidade: UnidadeTotem,
  cliente: ClienteTotem,
  opts: { ignorarEncerrada?: boolean } = {}
) {
  if (cliente.bloqueado) return { resultado: 'bloqueado', nome: cliente.nome }

  const hoje = hojeSP()

  const { data: reservas } = await sb
    .from('club_reservas')
    .select(`
      id, status, tipo_credito, posicao, via_app,
      ocorrencia:club_ocorrencias (
        id, coach_id, data, status,
        aula:club_aulas (
          tipo, horario, duracao_min, coach_id, unidade_id,
          grupo:grupos_musculares ( nome )
        )
      )
    `)
    .eq('cliente_id', cliente.id)
    .in('status', ['reservado', 'presente'])

  const candidatas = (reservas || [])
    .map((r: any) => {
      const o = r.ocorrencia
      const a = o?.aula
      if (!o || !a) return null
      if (o.data !== hoje || o.status !== 'ativa') return null
      if (a.unidade_id !== unidade.id) return null
      if (!opts.ignorarEncerrada && aulaEncerrada(hoje, a.horario, a.duracao_min || 60)) return null
      return {
        reservaId: r.id as string,
        status: r.status as string,
        tipoCredito: r.tipo_credito as string,
        posicao: (r.posicao || null) as string | null,
        aulaTipo: a.tipo as string,
        horario: String(a.horario || '').slice(0, 5),
        coachId: (o.coach_id || a.coach_id || null) as string | null,
        grupo: a.grupo?.nome || null,
      }
    })
    .filter(Boolean) as any[]

  if (candidatas.length === 0) return { resultado: 'sem_reserva', nome: cliente.nome }

  candidatas.sort((a, b) => a.horario.localeCompare(b.horario))
  const c = candidatas[0]

  let coachNome = ''
  if (c.coachId) {
    const { data: coach } = await sb.from('coaches').select('id, nome').eq('id', c.coachId).maybeSingle()
    coachNome = nomeCoachPublico(coach?.id, coach?.nome)
  }

  const parceiro = ehParceiro(c.tipoCredito)
  const flow =
    c.status === 'presente' ? 'confirmado'
    : parceiro ? 'aguardar_parceiro'
    : 'confirmar'

  return {
    resultado: 'reserva',
    nome: cliente.nome,
    reserva: {
      id: c.reservaId,
      aulaTipo: c.aulaTipo,
      aulaNome: nomeAulaClub(c.aulaTipo, c.grupo),
      horario: c.horario,
      coach: coachNome,
      posicao: c.aulaTipo === 'running_funcional' ? c.posicao : null,
      origem: origemLabel(c.tipoCredito),
      isPartner: parceiro,
      flow,
    },
  }
}

export type ClienteCT = { id: string; nome: string; cpf?: string | null; wellhub_id?: string | null; bloqueado?: boolean | null }

// Janela em que um check-in de parceiro "vale agora" (a pessoa acabou de bipar).
const CT_JANELA_HORAS = 4

// Mensalista com plano de acesso livre (open_gym) ativo → nome do plano, senão null.
async function planoOpenGymAtivo(sb: SupabaseClient, clienteId: string, hoje: string): Promise<string | null> {
  const { data: cps } = await sb.from('cliente_planos').select('plano_id')
    .eq('cliente_id', clienteId).eq('ativo', true).gte('fim', hoje)
  const ids = (cps || []).map((c: any) => c.plano_id).filter(Boolean)
  if (!ids.length) return null
  const { data: og } = await sb.from('planos_disponiveis').select('nome').in('id', ids).eq('open_gym', true).limit(1)
  return og && og.length ? og[0].nome : null
}

// Já registrou entrada no CT hoje? (fail-safe: se a tabela não existir, retorna null)
async function entradaCtHoje(sb: SupabaseClient, clienteId: string, hoje: string): Promise<{ origem: string } | null> {
  try {
    const { data, error } = await sb.from('totem_entradas_ct').select('origem')
      .eq('cliente_id', clienteId).eq('data', hoje).limit(1)
    if (error) return null
    return data && data.length ? { origem: data[0].origem } : null
  } catch { return null }
}

// Marca a entrada do dia (idempotente por cliente+data). Fail-safe.
async function registrarEntradaCt(sb: SupabaseClient, clienteId: string, unidadeId: string, origem: string, hoje: string) {
  try {
    await sb.from('totem_entradas_ct').upsert(
      { cliente_id: clienteId, unidade_id: unidadeId, origem, data: hoje },
      { onConflict: 'cliente_id,data', ignoreDuplicates: true }
    )
  } catch { /* tabela ainda não criada → segue liberando normalmente */ }
}

// Acesso disponível AGORA (parceiro validado recente ou crédito avulso). null se não houver.
async function acessoCtDisponivel(sb: SupabaseClient, unidade: UnidadeTotem, cliente: ClienteCT, hoje: string) {
  const desdeISO = new Date(Date.now() - CT_JANELA_HORAS * 3600 * 1000).toISOString()

  if (cliente.wellhub_id) {
    const { data } = await sb.from('entradas_walkin').select('produto')
      .eq('unidade_id', unidade.id).eq('status', 'validado').eq('origem', 'wellhub')
      .eq('id_externo', cliente.wellhub_id).gte('recebido_em', desdeISO)
      .order('recebido_em', { ascending: false }).limit(1)
    if (data && data.length) return { origem: 'Wellhub', produto: data[0].produto || 'Musculação' }
  }
  if (cliente.cpf) {
    const { data } = await sb.from('entradas_walkin').select('produto')
      .eq('unidade_id', unidade.id).eq('status', 'validado').eq('origem', 'totalpass')
      .filter('raw->user->>document_number', 'eq', cliente.cpf).gte('recebido_em', desdeISO)
      .order('recebido_em', { ascending: false }).limit(1)
    if (data && data.length) return { origem: 'TotalPass', produto: data[0].produto || 'Musculação' }
  }
  // Avulso: crédito de treino disponível (o CONSUMO do crédito ainda é pendência)
  const { data: cred } = await sb.from('creditos_avulsos').select('id')
    .eq('cliente_id', cliente.id).eq('tipo', 'credito_treino').eq('usado', false)
    .gte('validade', hoje).limit(1)
  if (cred && cred.length) return { origem: 'Crédito avulso', produto: 'Musculação' }

  return null
}

/**
 * Acesso ao CT (musculação, SEM catraca — liberação visual):
 *  - Mensalista (plano open_gym) → SEMPRE libera (ilimitado).
 *  - Parceiro/avulso → 1 entrada por dia: 1ª vez libera+registra; re-scan → "já registrada".
 *  - Sem acesso → aguardando (faz o check-in no app e espera, ou recepção).
 */
export async function respostaCT(
  sb: SupabaseClient,
  unidade: UnidadeTotem,
  cliente: ClienteCT
) {
  if (cliente.bloqueado) return { resultado: 'bloqueado', nome: cliente.nome }
  const hoje = hojeSP()

  // 0) Coach CT: se tem agendamento hoje, é fluxo Coach CT (fazer check-in Personal
  //    e escolher o coach), NÃO musculação livre.
  const agCoach = await agendamentoCoachCtHoje(sb, unidade.id, cliente.id, hoje)
  if (agCoach) return { resultado: 'coach_ct', nome: cliente.nome, agendamento: agCoach }

  // 1) Mensalista → ilimitado (não conta como entrada única)
  const plano = await planoOpenGymAtivo(sb, cliente.id, hoje)
  if (plano) return { resultado: 'liberado', nome: cliente.nome, origem: `Plano ${plano}` }

  // 2) Já entrou hoje (parceiro/avulso = 1/dia) → já registrada
  const log = await entradaCtHoje(sb, cliente.id, hoje)
  if (log) return { resultado: 'ct_ja_registrada', nome: cliente.nome, origem: log.origem }

  // 3) Tem acesso agora? → libera e marca a entrada do dia
  const acesso = await acessoCtDisponivel(sb, unidade, cliente, hoje)
  if (acesso) {
    // Avulso: desconta 1 crédito de treino (fail-safe: sem a RPC, libera sem descontar)
    if (acesso.origem === 'Crédito avulso') {
      try { await sb.rpc('totem_consumir_credito_treino', { p_cliente: cliente.id }) } catch { /* ignora */ }
    }
    await registrarEntradaCt(sb, cliente.id, unidade.id, acesso.origem, hoje)
    return { resultado: 'liberado', nome: cliente.nome, origem: acesso.origem, produto: acesso.produto }
  }

  // 4) Sem acesso ainda → aguardando parceiro / recepção
  return { resultado: 'aguardando_ct', nome: cliente.nome, clienteId: cliente.id }
}
