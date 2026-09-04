// src/app/api/wellhub/sync-slots/route.ts
//
// Worker de sincronização da capacidade Wellhub (rede de segurança + tempo real).
//
// Lê a fila wellhub_slot_sync_queue (alimentada pelos triggers trg_sync_wellhub,
// a cada escrita em club_reservas, e trg_sync_wellhub_ocorrencia, a cada mudança
// de status/vagas da ocorrência), recomputa o pool com wellhub_slot_numbers e
// empurra o valor ABSOLUTO pro slot do Wellhub via patchSlotNumbers. Idempotente:
// nunca manda delta. Roda por cron (a cada 1-2 min) e conserta qualquer PATCH
// perdido.
//
// Ocorrência CANCELADA (feriado, por exemplo) fecha o slot: a Booking API do
// Wellhub não deleta slot nem classe (só dá pra mexer em total_capacity/
// total_booked, e classe some via visible=false), então "cancelar" ali é zerar a
// capacidade. Ver fecharSlot().
//
// Protegido pelo segredo do cron (Authorization: Bearer CRON_SECRET), igual à
// rota processar-notificacoes.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { patchSlotNumbers } from '@/lib/wellhub/booking-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''
const LOTE = 50

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: fila, error } = await supabase
    .from('wellhub_slot_sync_queue')
    .select('ocorrencia_id, enfileirado_em')
    .order('enfileirado_em', { ascending: true })
    .limit(LOTE)
  if (error) {
    console.error('[wellhub/sync] erro ao ler a fila:', error)
    return NextResponse.json({ error: 'Erro ao ler a fila' }, { status: 500 })
  }

  let sincronizados = 0, pulados = 0, erros = 0
  for (const item of (fila || [])) {
    const r = await processarItem(supabase, (item as any).ocorrencia_id, (item as any).enfileirado_em)
    if (r === 'sync') sincronizados++
    else if (r === 'skip') pulados++
    else erros++
  }

  return NextResponse.json({ ok: true, lidos: (fila || []).length, sincronizados, pulados, erros })
}

export async function GET(req: NextRequest) {
  return POST(req)
}

// Remove a linha da fila SÓ se não foi reenfileirada durante o processamento
// (enfileirado_em inalterado), pra não engolir uma sync nova que chegou no meio.
async function tirarDaFila(supabase: SupabaseClient, ocId: string, enfileiradoEm: string) {
  await supabase
    .from('wellhub_slot_sync_queue')
    .delete()
    .eq('ocorrencia_id', ocId)
    .eq('enfileirado_em', enfileiradoEm)
}

type Resultado = 'sync' | 'skip' | 'erro'

// Fecha o slot no Wellhub: sem DELETE na API, capacidade zero é o que tira a
// aula de circulação. Se a API recusar o zero (nem toda conta aceita), cai pro
// "esgotado": capacidade igual ao que já está reservado.
//
// ⚠️ Reserva Wellhub JÁ FEITA numa aula cancelada não é desfeita por aqui — o
// PATCH de booking só aceita REJECTED na janela de 15 min do pedido. Fechar o
// slot impede reserva NOVA; quem já reservou precisa ser avisado pela equipe.
async function fecharSlot(
  gymId: string, classId: string, slotId: string, jaReservados: number
) {
  const zerado = await patchSlotNumbers(gymId, classId, slotId, { total_capacity: 0, total_booked: 0 })
  if (zerado.ok) return zerado
  console.warn('[wellhub/sync] zerar capacidade falhou, tentando esgotado:', slotId, zerado.status, zerado.erro)
  const cheio = Math.max(1, jaReservados)
  return patchSlotNumbers(gymId, classId, slotId, { total_capacity: cheio, total_booked: cheio })
}

async function processarItem(supabase: SupabaseClient, ocId: string, enfileiradoEm: string): Promise<Resultado> {
  // Resolve unidade + estado + gym a partir da ocorrência.
  const { data: info } = await supabase
    .from('club_ocorrencias')
    .select('id, status, club_aulas(unidade_id, unidades(wellhub_estado, wellhub_gym_id))')
    .eq('id', ocId)
    .maybeSingle()

  const unidade = (info as any)?.club_aulas?.unidades
  const estado = unidade?.wellhub_estado
  const gymId = unidade?.wellhub_gym_id

  // Ocorrência sumiu ou unidade não integrada/ativa → tira da fila e segue.
  // (pausado/desativado já escondeu as classes; não empurra capacidade.)
  if (!info || estado !== 'ativo' || !gymId) {
    await tirarDaFila(supabase, ocId, enfileiradoEm)
    return 'skip'
  }

  // Precisa do slot publicado pra saber o que PATCHear.
  const { data: map } = await supabase
    .from('wellhub_slot_map')
    .select('wellhub_class_id, wellhub_slot_id')
    .eq('ocorrencia_id', ocId)
    .maybeSingle()
  if (!map) {
    // Ainda não publicado (Etapa 4b cria o slot e reenfileira). Nada a sincronizar.
    await tirarDaFila(supabase, ocId, enfileiradoEm)
    return 'skip'
  }

  const { data: numsRaw } = await supabase.rpc('wellhub_slot_numbers', { p_ocorrencia_id: ocId })
  const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw
  if (!nums) {
    await tirarDaFila(supabase, ocId, enfileiradoEm)
    return 'skip'
  }

  // Ocorrência cancelada → fecha o slot. O wellhub_slot_numbers não olha o status
  // (ele calcula o pool da aula), então quem decide é aqui. O mapa FICA: se a
  // ocorrência voltar a ativa, a rodada seguinte reabre a capacidade sozinha.
  const resp = (info as any).status === 'cancelada'
    ? await fecharSlot(gymId, (map as any).wellhub_class_id, (map as any).wellhub_slot_id, nums.total_booked ?? 0)
    : await patchSlotNumbers(gymId, (map as any).wellhub_class_id, (map as any).wellhub_slot_id, {
        total_capacity: nums.total_capacity,
        total_booked: nums.total_booked,
      })

  if (resp.ok) {
    await tirarDaFila(supabase, ocId, enfileiradoEm)
    return 'sync'
  }
  // Falha no PATCH → NÃO remove da fila: retry natural na próxima rodada.
  console.warn('[wellhub/sync] PATCH falhou, mantendo na fila:', ocId, resp.status, resp.erro)
  return 'erro'
}
