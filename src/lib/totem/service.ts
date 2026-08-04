// Totem Self Check-in (Just Club) — helpers de servidor.
// Isolado: só as rotas /api/totem usam. Nada aqui altera fluxo existente.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

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
