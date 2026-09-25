// Check ins Extra for Clubs — 4 treinos por R$ 99,90, fora da vitrine. Só para
// quem usou 70%+ dos check-ins do app numa Club (mês atual ou anterior). Quem
// decide é a RPC club_extra_oferta (supabase/club-extra-oferta.sql); a API de
// pagamento confere de novo.
import type { SupabaseClient } from '@supabase/supabase-js'

export const CLUB_EXTRA_PRODUTO_ID = '4c1b7e2a-9d3f-4a61-8e25-c1ab5f0e7d99'

export const ERRO_CLUB_EXTRA_NAO_ELEGIVEL =
  'Este pacote é exclusivo para quem usou 70% ou mais dos check-ins do app no Club.'

export type ClubExtraOferta = {
  mostrar: boolean
  pode_comprar: boolean
  nivel?: 'mes_atual' | 'mes_anterior'
  parceiro?: 'wellhub' | 'totalpass'
  unidade_id?: string
  usados?: number
  total?: number
  produto_id: string
}

/** Em erro devolve null — o card simplesmente não aparece. */
export async function carregarClubExtraOferta(supabase: SupabaseClient, clienteId: string): Promise<ClubExtraOferta | null> {
  const { data, error } = await supabase.rpc('club_extra_oferta', { p_cliente_id: clienteId })
  if (error || !data) return null
  return data as ClubExtraOferta
}
