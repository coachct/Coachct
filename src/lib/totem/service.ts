// Totem Self Check-in (Just Club) — helpers de servidor.
// Isolado: só as rotas /api/totem usam. Nada aqui altera fluxo existente.
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { nomeCoachPublico } from '@/lib/mascaraCoachPublico'
import { hojeSP, aulaEncerrada } from '@/lib/tempo'

/** Client service_role (ignora RLS). Só em rota de servidor. */
export function totemService(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('totem: variáveis Supabase ausentes')
  return createClient(url, key, { auth: { persistSession: false } })
}

export type UnidadeTotem = { id: string; slug: string; nome: string }

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Resolve ?unidade= (id OU slug) para uma unidade Club ATIVA. null se inválida. */
export async function resolverUnidadeClub(
  sb: SupabaseClient,
  unidade: string
): Promise<UnidadeTotem | null> {
  const v = (unidade || '').trim()
  if (!v) return null
  const q = sb.from('unidades').select('id, slug, nome, tipo, ativo')
  const { data } = UUID_RE.test(v)
    ? await q.eq('id', v).maybeSingle()
    : await q.eq('slug', v).maybeSingle()
  if (!data || data.tipo !== 'club' || data.ativo === false) return null
  return { id: data.id, slug: data.slug, nome: data.nome }
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
