// src/lib/totalpass/places.ts
//
// Registro das UNIDADES habilitadas no booking TotalPass — dirigido por dados.
// Cada unidade com `unidades.totalpass_estado='ativo'` e `totalpass_place_id`
// preenchido entra automaticamente. A chave secreta (place_api_key) e o plano
// (plan_id) vêm de env vars, POR place_id:
//
//   TOTALPASS_PLACE_<placeId>_API_KEY   (secret)
//   TOTALPASS_PLACE_<placeId>_PLAN_ID   (número do plano do place)
//
// Pinheiros (place 41407) mantém os nomes de env ANTIGOS pra não quebrar nada:
//   TOTALPASS_PINHEIROS_PLACE_API_KEY / TOTALPASS_PINHEIROS_PLAN_ID (default 16655)
//
// Assim, LIGAR uma unidade nova (ex.: Vila Olímpia) = (1) criar o place no portal
// da TotalPass, (2) `UPDATE unidades SET totalpass_place_id=..., totalpass_estado='ativo'`,
// (3) setar as 2 env vars acima com o place_id dela. SEM mudar código.

import { SupabaseClient } from '@supabase/supabase-js'

const PINHEIROS_PLACE_ID = '41407'

export type TpPlace = {
  unidadeId: string
  nome: string
  placeId: string
  planId: number
  apiKey?: string
}

// Chave secreta (place_api_key) por place_id. Pinheiros usa o env legado.
export function apiKeyPorPlace(placeId: string): string | undefined {
  if (!placeId) return undefined
  if (placeId === PINHEIROS_PLACE_ID) return process.env.TOTALPASS_PINHEIROS_PLACE_API_KEY
  return process.env[`TOTALPASS_PLACE_${placeId}_API_KEY`]
}

// plan_id por place_id. Pinheiros usa o env legado (default 16655).
export function planPorPlace(placeId: string): number {
  if (placeId === PINHEIROS_PLACE_ID) return Number(process.env.TOTALPASS_PINHEIROS_PLAN_ID || '16655')
  return Number(process.env[`TOTALPASS_PLACE_${placeId}_PLAN_ID`] || '0')
}

// Unidades PRONTAS pra operar: estado ativo + place_id + chave + plano válidos.
// Uma unidade marcada ativa mas sem env (chave/plano) fica de fora — não quebra.
export async function placesAtivos(supabase: SupabaseClient): Promise<TpPlace[]> {
  const { data } = await supabase
    .from('unidades')
    .select('id, nome, totalpass_place_id')
    .eq('tipo', 'club')            // BLINDAGEM: booking é SÓ Club — nunca toca o Just CT.
    .eq('totalpass_estado', 'ativo')
    .not('totalpass_place_id', 'is', null)
  return (data || [])
    .map((u: any): TpPlace => {
      const placeId = String(u.totalpass_place_id)
      return {
        unidadeId: u.id as string,
        nome: (u.nome as string) || placeId,
        placeId,
        planId: planPorPlace(placeId),
        apiKey: apiKeyPorPlace(placeId),
      }
    })
    .filter((p: TpPlace) => !!p.apiKey && p.planId > 0)
}
