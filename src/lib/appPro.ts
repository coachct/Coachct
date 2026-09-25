// App Coach CT PRO vendido online — só para quem treina Coach CT pelo app
// (Wellhub/TotalPass). Quem decide quem vê cada card e quem pode comprar é a RPC
// app_pro_oferta (supabase/app-pro-oferta.sql); a API de pagamento confere de novo.
import type { SupabaseClient } from '@supabase/supabase-js'

export const APP_PRO_PRODUTO_ID = '9a750c9e-3469-465c-a980-4e395f2c0204'

export type AppProOferta = {
  elegivel: boolean
  mostrar_oferta: boolean
  mostrar_renovacao: boolean
  pode_comprar: boolean
  parceiro: 'wellhub' | 'totalpass' | null
  usados: number
  total: number | null
  nivel: 'normal' | 'alerta' | 'esgotado'
  tem_app_pro: boolean
  app_pro_fim: string | null
  app_pro_disponivel: number | null
  produto_id: string
}

export type LocalOferta = 'conta' | 'conta_70' | 'agendar' | 'pagina' | 'renovacao'

export const NOME_PARCEIRO: Record<string, string> = { wellhub: 'Wellhub', totalpass: 'TotalPass' }

/** Em erro devolve null — a oferta simplesmente não aparece. */
export async function carregarAppProOferta(supabase: SupabaseClient, clienteId: string): Promise<AppProOferta | null> {
  const { data, error } = await supabase.rpc('app_pro_oferta', { p_cliente_id: clienteId })
  if (error || !data) return null
  return data as AppProOferta
}

/** Medição (visto/clique). Silenciosa: nunca atrapalha a tela. */
export function registrarEventoAppPro(supabase: SupabaseClient, evento: 'visto' | 'clique', local: LocalOferta) {
  supabase.rpc('app_pro_registrar_evento', { p_evento: evento, p_local: local }).then(() => {}, () => {})
}
