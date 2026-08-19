// src/app/api/totalpass/sync-slots/route.ts
//
// Worker de sincronização da capacidade TotalPass (rede de segurança + ~tempo real).
//
// Lê a fila totalpass_slot_sync_queue (alimentada pelo trigger trg_sync_totalpass
// a cada escrita em club_reservas), recomputa o pool com totalpass_slot_numbers e
// empurra a capacidade ABSOLUTA pra ocorrência via atualizarOcorrencia({slots}).
// Idempotente. Roda por cron (a cada 1-2 min) e conserta qualquer PUT perdido.
//
// POOL: seta slots = total_capacity = min(vagas_totalpass, cap - bloqueadas -
// próprias). A TotalPass controla seu próprio slotsInUse. LIMITAÇÃO CONHECIDA: não
// desconta reservas via app do OUTRO parceiro (Wellhub) — refinar quando o Wellhub
// booking tiver volume real na mesma unidade (hoje não tem). vagas_totalpass por
// ocorrência serve de teto de segurança nesse meio tempo.
//
// Protegido pelo CRON_SECRET (Authorization: Bearer). Atrás do kill switch.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { atualizarOcorrencia, deletarOcorrencia } from '@/lib/totalpass/booking-api'
import { apiKeyPorPlace } from '@/lib/totalpass/places'

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

  // Kill switch: desligado, não sincroniza (deixa a fila acumular sem tocar na API).
  if (process.env.TOTALPASS_BOOKING_ATIVO !== 'true') {
    return NextResponse.json({ ok: true, msg: 'kill switch OFF — sync pausado' })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: fila, error } = await supabase
    .from('totalpass_slot_sync_queue')
    .select('ocorrencia_id, enfileirado_em, tentativas')
    .order('enfileirado_em', { ascending: true })
    .limit(LOTE)
  if (error) {
    console.error('[totalpass/sync] erro ao ler a fila:', error)
    return NextResponse.json({ error: 'Erro ao ler a fila' }, { status: 500 })
  }

  let sincronizados = 0, pulados = 0, erros = 0
  for (const item of (fila || [])) {
    const r = await processarItem(
      supabase, (item as any).ocorrencia_id, (item as any).enfileirado_em, (item as any).tentativas ?? 0
    )
    if (r === 'sync') sincronizados++
    else if (r === 'skip') pulados++
    else erros++
  }
  return NextResponse.json({ ok: true, lidos: (fila || []).length, sincronizados, pulados, erros })
}

export async function GET(req: NextRequest) {
  return POST(req)
}

// Só remove da fila se não foi reenfileirada durante o processamento.
async function tirarDaFila(supabase: SupabaseClient, ocId: string, enfileiradoEm: string) {
  await supabase
    .from('totalpass_slot_sync_queue')
    .delete()
    .eq('ocorrencia_id', ocId)
    .eq('enfileirado_em', enfileiradoEm)
}

// RESILIÊNCIA: em vez de deixar um item que ERRA no head (bloqueando todos atrás —
// o worker lê ORDER BY enfileirado_em ASC LIMIT 50), reenfileira no FIM (re-stamp).
// Assim um place com chave inválida ou a API fora do ar não trava as demais unidades
// (incidente 08/08: a chave da Vila Olímpia caiu e os itens dela entupiram até o
// Pinheiros). Só re-stampa se o item não foi reenfileirado por uma escrita nova no meio.
//
// CONTA AS TENTATIVAS: como o re-stamp renova `enfileirado_em`, um item que erra em
// looping parece sempre recém-chegado — a fila inteira pode estar travada e o
// sentinela (/api/health/integracoes) enxerga "mais_antigo_min: 0" e não acusa nada.
// `tentativas` é a idade real do item; o trigger zera a cada escrita nova.
async function moverParaFim(
  supabase: SupabaseClient, ocId: string, enfileiradoEm: string, motivo: string, tentativas: number
) {
  await supabase
    .from('totalpass_slot_sync_queue')
    .update({
      enfileirado_em: new Date().toISOString(),
      tentativas: (tentativas ?? 0) + 1,
      ultimo_erro: motivo.slice(0, 300),
    })
    .eq('ocorrencia_id', ocId)
    .eq('enfileirado_em', enfileiradoEm)
}

type Resultado = 'sync' | 'skip' | 'erro'

// "YYYY-MM-DD HH:MM AM/PM" no fuso de São Paulo — formato que a Booking API espera
// nos campos de janela/prazo (mesmo do maxTimeToCancel do publish).
function horaTp(d: Date): string {
  const p: any = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(d).reduce((a: any, x) => (a[x.type] = x.value, a), {})
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.dayPeriod}`
}

// Janela inteira no passado = ninguém consegue reservar. A API exige minTimeToBook
// ESTRITAMENTE antes de maxTimeToBook (400 se forem iguais). O fim é AGORA, não uma
// data qualquer: o app deles mostra ao cliente "aula encerrada às <maxTimeToBook>",
// e o que faz sentido ali é o instante em que a aula lotou.
function janelaFechada() {
  const agora = Date.now()
  return {
    minTimeToBook: horaTp(new Date(agora - 2 * 60 * 60 * 1000)),
    maxTimeToBook: horaTp(new Date(agora)),
  }
}

// Janela normal: pode reservar desde bem antes até o início da aula.
function janelaNormal(data: string, horario: string) {
  const inicio = new Date(`${data}T${horario}-03:00`)
  return {
    minTimeToBook: horaTp(new Date(inicio.getTime() - 30 * 24 * 60 * 60 * 1000)),
    maxTimeToBook: horaTp(inicio),
  }
}

async function processarItem(
  supabase: SupabaseClient, ocId: string, enfileiradoEm: string, tentativas: number
): Promise<Resultado> {
  // Estado da unidade a partir da ocorrência.
  const { data: info } = await supabase
    .from('club_ocorrencias')
    .select('id, status, data, club_aulas(horario, unidade_id, unidades(totalpass_estado))')
    .eq('id', ocId)
    .maybeSingle()

  // RESILIÊNCIA: aula que JÁ COMEÇOU não precisa mais sincronizar capacidade —
  // ninguém reserva o passado. Se ficar na fila, o PUT falha pra sempre (ocorrência
  // vencida na TotalPass) e, como o worker lê ORDER BY enfileirado_em ASC, esses
  // mortos entopem o HEAD e travam as aulas futuras (incidente 08/08 — 104 aulas
  // presas). O corte era só por DIA, então as aulas de HOJE já encerradas (06:00,
  // 07:00, 12:15…) ficavam errando o dia inteiro: 12-15 chamadas inúteis por ciclo
  // até virar a data. Agora compara data+hora no fuso de São Paulo.
  const agoraSP = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }) // 'YYYY-MM-DD HH:MM:SS'
  const horaAula = (info as any)?.club_aulas?.horario ?? '23:59:59' // sem horário, só descarta no fim do dia
  if (info && (info as any).data && `${(info as any).data} ${horaAula}` <= agoraSP) {
    await tirarDaFila(supabase, ocId, enfileiradoEm)
    return 'skip'
  }

  const estado = (info as any)?.club_aulas?.unidades?.totalpass_estado

  // Precisa do mapa pra saber qual ocorrência TotalPass atualizar E em qual place.
  const { data: map } = await supabase
    .from('totalpass_slot_map')
    .select('occurrence_uuid, place_id, fechada_em')
    .eq('ocorrencia_id', ocId)
    .maybeSingle()

  // Não publicada ainda (publish cria e reenfileira) → nada a sincronizar.
  if (!map) {
    await tirarDaFila(supabase, ocId, enfileiradoEm)
    return 'skip'
  }
  const uuid = (map as any).occurrence_uuid as string

  // Chave do place onde a ocorrência foi publicada (multi-unidade). Sem chave
  // (env faltando) não dá pra falar com a API — mantém na fila pra retry.
  const apiKey = apiKeyPorPlace(String((map as any).place_id || ''))
  if (!apiKey) {
    console.warn('[totalpass/sync] sem place_api_key pro place', (map as any).place_id, '— reenfileirando no fim')
    await moverParaFim(supabase, ocId, enfileiradoEm, `sem place_api_key (place ${(map as any).place_id})`, tentativas)
    return 'erro'
  }

  // Unidade não ativa / ocorrência cancelada → remove da grade da TotalPass.
  if (!info || estado !== 'ativo' || (info as any).status === 'cancelada') {
    const del = await deletarOcorrencia(apiKey, uuid)
    if (del.ok) {
      await supabase.from('totalpass_slot_map').delete().eq('ocorrencia_id', ocId)
      await tirarDaFila(supabase, ocId, enfileiradoEm)
      return 'sync'
    }
    console.warn('[totalpass/sync] DELETE falhou, reenfileirando no fim:', ocId, del.status)
    await moverParaFim(supabase, ocId, enfileiradoEm, `DELETE ocorrência HTTP ${del.status}: ${del.erro ?? ''}`, tentativas)
    return 'erro'
  }

  // Pool → nova capacidade.
  const { data: numsRaw } = await supabase.rpc('totalpass_slot_numbers', { p_ocorrencia_id: ocId })
  const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw
  if (!nums) {
    await tirarDaFila(supabase, ocId, enfileiradoEm)
    return 'skip'
  }

  // Aula LOTADA (capacidade 0): a TotalPass NÃO deixa zerar a vaga — `slots: 0` volta
  // 422 "The number of slots cannot be zero" e `status: 'INACTIVE'` responde 200 mas é
  // ignorado (a ocorrência continua ACTIVE, testado em 18/08). Sem fechar de verdade, a
  // aula seguia reservável no app deles: o cliente reservava, o pull rejeitava e
  // cancelava o slot — reserva fantasma, existe lá e não existe aqui. O que a API aceita
  // é a JANELA DE RESERVA: com `bookingWindow` inteira no passado ninguém mais reserva.
  // Ao abrir vaga, devolvemos a janela normal (até o início da aula) junto do slots.
  const fechada = !!(map as any).fechada_em
  let resp
  if (nums.total_capacity > 0) {
    const corpo: any = { slots: nums.total_capacity }
    if (fechada) corpo.bookingWindow = janelaNormal((info as any).data, horaAula)
    resp = await atualizarOcorrencia(apiKey, uuid, corpo)
    if (resp.ok && fechada) {
      await supabase.from('totalpass_slot_map').update({ fechada_em: null }).eq('ocorrencia_id', ocId)
    }
  } else if (fechada) {
    await tirarDaFila(supabase, ocId, enfileiradoEm) // já fechada, nada a fazer
    return 'skip'
  } else {
    // Além de fechar a janela, encolhe a capacidade até o que a TotalPass já tem
    // reservado: aí o app deles mostra a aula ESGOTADA em vez de anunciar vagas que
    // não existem. Nunca abaixo de 1 (a API recusa zero) — no caso extremo de a aula
    // ter lotado só com gente nossa, sobra 1 vaga aparente, e é a janela que segura.
    resp = await atualizarOcorrencia(apiKey, uuid, {
      slots: Math.max(1, nums.total_booked ?? 0),
      bookingWindow: janelaFechada(),
    })
    if (resp.ok) {
      await supabase.from('totalpass_slot_map')
        .update({ fechada_em: new Date().toISOString() }).eq('ocorrencia_id', ocId)
    }
  }
  if (resp.ok) {
    await tirarDaFila(supabase, ocId, enfileiradoEm)
    return 'sync'
  }
  // Falha → mantém na fila pra retry.
  console.warn('[totalpass/sync] PUT slots falhou, reenfileirando no fim:', ocId, resp.status, resp.erro)
  await moverParaFim(
    supabase, ocId, enfileiradoEm,
    `PUT slots=${nums.total_capacity} HTTP ${resp.status}: ${typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body)}`,
    tentativas
  )
  return 'erro'
}
