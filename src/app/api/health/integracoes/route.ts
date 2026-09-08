// src/app/api/health/integracoes/route.ts
//
// SENTINELA de saúde das integrações (TotalPass/Wellhub) + capacidade.
// Roda por cron a cada 3h (e sob demanda). Faz:
//   * checagens de BANCO via RPC saude_integracoes() (overbooking, filas de sync,
//     reservas sem posição) — a query pesada mora no banco.
//   * AUTH probe: autentica de fato em cada place TotalPass ativo (pega chave
//     inválida/expirada na hora — foi o que derrubou a Vila Olímpia em 08/08).
//   * SAÚDE SEMÂNTICA do pull de reservas TotalPass (ver bloco 2d).
//   * grava um snapshot em integracoes_health (o painel do admin lê o último).
//
// Silêncio = tudo verde. `ok=false` + `problemas[]` quando algo está vermelho.
// Protegido pelo CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listarSlots } from '@/lib/totalpass/booking-api'
import { placesAtivos } from '@/lib/totalpass/places'
import { listClasses } from '@/lib/wellhub/booking-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''
const FILA_ATRASO_MIN = 30 // fila de sync acima disso = sync travado/erro
const TENTATIVAS_LIMITE = 10 // item que errou 10x seguidas (~10 min de fila) está emperrado, não em retry normal

// --- Saúde semântica do pull de reservas TotalPass -------------------------
// Cadência do pull: pg_cron 'totalpass-pull-bookings' de 1 em 1 min + cron da
// Vercel de 2 em 2 min (os dois ativos). Logo 12 linhas ≈ os últimos ~5 min.
const PULL_JANELA = 12          // quantos pulls recentes o sentinela olha
const PULL_PARADO_MIN = 15      // sem NENHUM pull registrado por mais que isso = cron morto
const SEM_MAPA_POLLS = 5        // polls seguidos com sem_mapa > 0 que disparam alerta
const PULL_LOG_DIAS = 30        // retenção do histórico
// Horas COMERCIAIS sem nenhuma reserva nova da TotalPass que disparam alerta.
const SEM_RESERVA_HORAS = parseInt(process.env.TOTALPASS_SEM_RESERVA_HORAS || '6', 10) || 6
// Janela em que se espera receber reserva (hora de SP) — mesma régua do vigia do WhatsApp.
const HORA_INICIO = 8
const HORA_FIM = 22

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const secretQuery = new URL(req.url).searchParams.get('secret') || ''
  const autorizado = !CRON_SECRET || auth === `Bearer ${CRON_SECRET}` || secretQuery === CRON_SECRET
  if (!autorizado) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // 1) Checagens de banco.
  const { data: retrato, error: errRpc } = await supabase.rpc('saude_integracoes')
  const rel: any = (retrato && typeof retrato === 'object') ? { ...retrato } : {}
  if (errRpc) rel.erro_rpc = errRpc.message

  // 2) Auth probe TotalPass — autentica + lista uma janela curta por place ativo.
  const agora = new Date()
  const fim = new Date(agora.getTime() + 24 * 60 * 60 * 1000)
  const authTp: Array<{ unidade: string; ok: boolean; erro: string | null }> = []
  let qtdPlacesTp = 0
  try {
    const places = await placesAtivos(supabase)
    qtdPlacesTp = places.length
    for (const place of places) {
      const sl = await listarSlots(place.apiKey!, { slotDateFrom: agora.toISOString(), slotDateTo: fim.toISOString() })
      authTp.push({ unidade: place.nome, ok: sl.ok, erro: sl.ok ? null : (sl.erro || `HTTP ${sl.status}`) })
    }
  } catch (e: any) {
    authTp.push({ unidade: '(falha geral)', ok: false, erro: String(e?.message ?? e) })
  }
  rel.auth_totalpass = authTp

  // 2b) Auth probe Wellhub — lista as classes do gym (autentica na Booking API).
  // gymId único por unidade; chave única (WELLHUB_BOOKING_API_KEY). Só unidades ativas.
  const authWh: Array<{ unidade: string; ok: boolean; erro: string | null }> = []
  try {
    const { data: gyms } = await supabase
      .from('unidades')
      .select('nome, wellhub_gym_id')
      .eq('wellhub_estado', 'ativo')
      .not('wellhub_gym_id', 'is', null)
    for (const u of (gyms || [])) {
      const r = await listClasses(String((u as any).wellhub_gym_id))
      authWh.push({ unidade: (u as any).nome, ok: r.ok, erro: r.ok ? null : (r.erro || `HTTP ${r.status}`) })
    }
  } catch (e: any) {
    authWh.push({ unidade: '(falha geral)', ok: false, erro: String(e?.message ?? e) })
  }
  rel.auth_wellhub = authWh

  // 2c) Fila TotalPass emperrada. A idade (`mais_antigo_min`) NÃO serve pra isso: o
  // worker re-carimba `enfileirado_em` a cada erro, então uma fila travada há horas
  // aparece sempre com idade 0 e passa batido (visto em 18/08: 15 de 16 itens errando
  // em looping, sentinela dizendo que estava tudo bem). `tentativas` é a idade real.
  try {
    const { data: emperrados } = await supabase
      .from('totalpass_slot_sync_queue')
      .select('ocorrencia_id, tentativas, ultimo_erro')
      .gte('tentativas', TENTATIVAS_LIMITE)
      .order('tentativas', { ascending: false })
      .limit(10)
    rel.fila_totalpass_emperrada = emperrados || []
  } catch (e: any) {
    rel.fila_totalpass_emperrada = [{ erro: String(e?.message ?? e) }]
  }

  // 2d) SAÚDE SEMÂNTICA do pull de reservas TotalPass.
  //
  // ⚠️ INCIDENTE 08/09/2026: por ~2 semanas nenhuma reserva feita no app da
  // TotalPass entrou na agenda, e o sentinela ficou verde o tempo todo. Motivo:
  // /api/totalpass/pull-bookings devolvia HTTP 200 {"ok":true} em TODOS os polls —
  // o problema só aparecia no CORPO ("semMapa": 84, "criadas": 0, "jaTinha": 0).
  // Status HTTP não é saúde: a rota "funcionou" perfeitamente enquanto jogava
  // 84 reservas no lixo. Aqui olhamos o PLACAR, não o código de resposta.
  //
  // Três sinais, do mais específico para o mais genérico:
  //   1. o pull parou de rodar (cron morto);
  //   2. slot ativo caindo em 'sem mapa' em polls seguidos — slot publicado por
  //      nós sem ocorrência correspondente NUNCA deveria ser o normal, é o
  //      sintoma exato do incidente;
  //   3. horas comerciais sem NENHUMA reserva com totalpass_slot_id nascendo —
  //      rede de segurança, pega qualquer causa nova que a nº 2 não cubra.
  const pullAtivo = process.env.TOTALPASS_BOOKING_ATIVO === 'true' && qtdPlacesTp > 0
  const pull: any = { ativo: pullAtivo, places_ativos: qtdPlacesTp, limites: { pull_parado_min: PULL_PARADO_MIN, sem_mapa_polls: SEM_MAPA_POLLS, sem_reserva_horas: SEM_RESERVA_HORAS } }
  try {
    // Últimos pulls (o teto de 1000 linhas do PostgREST não morde: sempre com limit).
    const { data: pulls } = await supabase
      .from('totalpass_pull_log')
      .select('criado_em, slots, criadas, ja_tinha, sem_mapa, rejeitadas, incompletas, erros_api')
      .order('criado_em', { ascending: false })
      .limit(PULL_JANELA)
    const linhas = (pulls || []) as any[]

    pull.ultimo_pull_em = linhas[0]?.criado_em ?? null
    pull.min_desde_ultimo_pull = linhas[0]
      ? Math.round((agora.getTime() - new Date(linhas[0].criado_em).getTime()) / 60000)
      : null
    pull.ultimo_placar = linhas[0] ?? null

    // Sequência (do mais recente pra trás) de polls com slot sem mapa.
    let seguidos = 0
    for (const l of linhas) { if ((l.sem_mapa ?? 0) > 0) seguidos++; else break }
    pull.polls_seguidos_sem_mapa = seguidos
    pull.sem_mapa_ultimo = linhas[0]?.sem_mapa ?? 0

    // Última reserva vinda do app da TotalPass (índice parcial em club_reservas).
    const { data: ultRes } = await supabase
      .from('club_reservas')
      .select('created_at')
      .not('totalpass_slot_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    pull.ultima_reserva_em = (ultRes as any)?.created_at ?? null
    // Contamos só HORAS COMERCIAIS: madrugada e domingo cedo sem reserva é normal,
    // e comparar em horas corridas daria alarme falso toda manhã.
    pull.horas_comerciais_sem_reserva = pull.ultima_reserva_em
      ? horasComerciais(new Date(pull.ultima_reserva_em), agora)
      : null
  } catch (e: any) {
    pull.erro = String(e?.message ?? e)
  }
  rel.pull_totalpass = pull

  // Poda do histórico (barato, roda a cada 3h). Nunca derruba o sentinela.
  try {
    await supabase
      .from('totalpass_pull_log')
      .delete()
      .lt('criado_em', new Date(agora.getTime() - PULL_LOG_DIAS * 24 * 60 * 60 * 1000).toISOString())
  } catch (e: any) {
    console.warn('[saude] falha ao podar o histórico do pull:', e?.message ?? e)
  }

  rel.verificado_em = agora.toISOString()

  // 3) Semáforo geral.
  const problemas: string[] = []
  const over = Array.isArray(rel.overbooking) ? rel.overbooking : []
  const semPos = Array.isArray(rel.sem_posicao) ? rel.sem_posicao : []
  if (over.length) problemas.push(`${over.length} aula(s) futura(s) com overbooking`)
  if (authTp.some(a => !a.ok)) problemas.push(`auth TotalPass falhando (${authTp.filter(a => !a.ok).map(a => a.unidade).join(', ')})`)
  if (authWh.some(a => !a.ok)) problemas.push(`auth Wellhub falhando (${authWh.filter(a => !a.ok).map(a => a.unidade).join(', ')})`)
  if ((rel.fila_totalpass?.mais_antigo_min ?? 0) > FILA_ATRASO_MIN) problemas.push('fila de sync TotalPass atrasada')
  const emperrados = Array.isArray(rel.fila_totalpass_emperrada) ? rel.fila_totalpass_emperrada : []
  if (emperrados.length) {
    problemas.push(`${emperrados.length} item(ns) da fila TotalPass errando em looping (${emperrados[0]?.ultimo_erro ?? 'sem detalhe'})`)
  }
  if ((rel.fila_wellhub?.mais_antigo_min ?? 0) > FILA_ATRASO_MIN) problemas.push('fila de sync Wellhub atrasada')
  if (semPos.length) problemas.push(`${semPos.length} aula(s) com reserva sem posição`)

  // Pull de reservas TotalPass. Só avalia com o booking LIGADO e alguma unidade
  // ativa — com o kill switch OFF não existe pull e "parado" é o esperado.
  // Sem nenhuma linha no histórico (tabela recém-criada) também não alerta: o
  // primeiro pull grava em até 2 min.
  if (pullAtivo) {
    if (pull.min_desde_ultimo_pull !== null && pull.min_desde_ultimo_pull > PULL_PARADO_MIN) {
      problemas.push(`pull de reservas TotalPass parado há ${pull.min_desde_ultimo_pull} min (deveria rodar a cada 2 min)`)
    }
    if ((pull.polls_seguidos_sem_mapa ?? 0) >= SEM_MAPA_POLLS) {
      problemas.push(
        `${pull.polls_seguidos_sem_mapa} polls seguidos com slot sem mapa (${pull.sem_mapa_ultimo} no último) — ` +
        `reserva feita no app da TotalPass não está entrando na agenda`
      )
    }
    if (pull.horas_comerciais_sem_reserva !== null && pull.horas_comerciais_sem_reserva > SEM_RESERVA_HORAS) {
      problemas.push(`nenhuma reserva nova da TotalPass há ${pull.horas_comerciais_sem_reserva}h de expediente`)
      pull.alerta_sem_reserva = true
    }
  }

  const ok = problemas.length === 0
  rel.problemas = problemas

  // 4) Snapshot (não derruba a resposta se falhar).
  try {
    await supabase.from('integracoes_health').insert({ ok, relatorio: rel })
  } catch (e: any) {
    console.warn('[saude] falha ao gravar snapshot:', e?.message ?? e)
  }

  return NextResponse.json({ ok, problemas, relatorio: rel })
}

export async function GET(req: NextRequest) {
  return POST(req)
}

// Quantas horas de EXPEDIENTE (08–22 em São Paulo) se passaram entre dois
// instantes. Usado no alerta "faz tempo que não entra reserva da TotalPass":
// em horas corridas, toda segunda de manhã acusaria ~10h de silêncio só por
// causa da madrugada. Caminha de 30 em 30 min; a origem é limitada a 14 dias
// atrás pra o laço nunca crescer (a resposta continua acima de qualquer limite).
function horasComerciais(desde: Date, ate: Date): number {
  const PASSO_MS = 30 * 60000
  const TETO_MS = 14 * 24 * 60 * 60 * 1000
  let t = Math.max(desde.getTime(), ate.getTime() - TETO_MS)
  let meias = 0
  try {
    for (; t < ate.getTime(); t += PASSO_MS) {
      const h = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getHours()
      if (h >= HORA_INICIO && h < HORA_FIM) meias++
    }
  } catch {
    // Fuso não resolveu: cai em horas corridas (pior caso, alerta mais cedo).
    return Math.round(((ate.getTime() - desde.getTime()) / 3600000) * 10) / 10
  }
  return Math.round((meias / 2) * 10) / 10
}
