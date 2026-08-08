// src/app/api/totalpass/pull-bookings/route.ts
//
// INBOUND das reservas TotalPass (Fase 3). A TotalPass não manda webhook de
// reserva — então puxamos por POLLING (cron): GET /partner/slot numa janela, e:
//   * slot novo (ativo) → grava club_reservas via_app=true + totalpass_slot_id,
//     consumindo a vaga do pool. Não coube (corrida) → cancela o slot deles.
//   * reserva nossa que sumiu dos slots → marca 'cancelado' (o membro cancelou).
//
// Sem janela de confirmar/rejeitar (a reserva já está feita no app deles). A
// autorização é da TotalPass — não passa por saldo de plano nosso.
//
// Protegido pelo CRON_SECRET. Atrás do kill switch TOTALPASS_BOOKING_ATIVO.
//
// ⚠️ A confirmar no 1º teste real: o valor exato de `status` de um slot ATIVO
// (aqui trato como ativo tudo que não está num conjunto "morto"; logo os status
// vistos pra ajuste). O resto do shape (_id, userId, user.*, eventId) veio da doc.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { listarSlots, cancelarSlot } from '@/lib/totalpass/booking-api'
import { placesAtivos } from '@/lib/totalpass/places'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET || ''
const JANELA_DIAS = 14

// Status que NÃO contam como reserva ativa (o resto tratamos como ativo).
const STATUS_MORTOS = new Set(['expired', 'cancelled', 'canceled', 'deleted', 'no_show', 'noshow']);

function extrairSlot(s: any) {
  const u = s?.user ?? {}
  return {
    slotId: s?._id != null ? String(s._id) : (s?.id != null ? String(s.id) : null),
    status: (s?.status ?? '').toString().toLowerCase(),
    totalpassId: s?.userId != null ? String(s.userId) : (u?.id != null ? String(u.id) : null),
    cpf: u?.document_number ?? null,
    email: u?.email ?? null,
    nome: u?.name ?? null,
    eventId: s?.eventId != null ? String(s.eventId) : (s?.event?.id != null ? String(s.event.id) : null),
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const secretQuery = new URL(req.url).searchParams.get('secret') || ''
  const autorizado = !CRON_SECRET || auth === `Bearer ${CRON_SECRET}` || secretQuery === CRON_SECRET
  if (!autorizado) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // DIAGNÓSTICO ?raw=1: mostra o SHAPE cru dos slots que a TotalPass devolve
  // (nomes reais dos campos + valores mascarados), SEM gravar nada. Serve pra
  // descobrir sob quais chaves vêm nome/CPF/email. Ignora o kill switch.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const agora = new Date()
  const fim = new Date(agora.getTime() + JANELA_DIAS * 24 * 60 * 60 * 1000)

  if (new URL(req.url).searchParams.get('raw')) {
    const mask = (v: any) => (typeof v === 'string' && v.length > 4 ? `${v.slice(0, 2)}***${v.slice(-2)}` : v)
    const maskObj = (o: any) => (o && typeof o === 'object'
      ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && typeof v === 'object' ? '{...}' : mask(v)]))
      : o)
    const porUnidade: any[] = []
    for (const place of await placesAtivos(supabase)) {
      const sl = await listarSlots(place.apiKey!, { slotDateFrom: agora.toISOString(), slotDateTo: fim.toISOString() })
      const arr: any[] = Array.isArray(sl.body) ? sl.body : (sl.body?.data ?? [])
      porUnidade.push({
        unidade: place.nome, ok: sl.ok, status: sl.status, erro: sl.erro, total: arr.length,
        amostra: arr.slice(0, 3).map((s: any) => ({
          topKeys: Object.keys(s || {}), userKeys: Object.keys(s?.user || {}),
          user: maskObj(s?.user), slotMascarado: maskObj(s),
        })),
      })
    }
    return NextResponse.json({ raw: true, porUnidade })
  }

  if (process.env.TOTALPASS_BOOKING_ATIVO !== 'true') {
    return NextResponse.json({ ok: true, msg: 'kill switch OFF — pull pausado' })
  }

  // Mapa eventId → ocorrencia_id (cada ocorrência TotalPass tem seu próprio eventId).
  const { data: mapas } = await supabase
    .from('totalpass_slot_map').select('ocorrencia_id, totalpass_event_id')
  const ocPorEvento: Record<string, string> = {}
  for (const m of (mapas || [])) ocPorEvento[(m as any).totalpass_event_id] = (m as any).ocorrencia_id

  const places = await placesAtivos(supabase)
  if (!places.length) {
    return NextResponse.json({ ok: true, msg: 'nenhuma unidade TotalPass ativa' })
  }

  const statusVistos = new Set<string>()
  const ativosIds = new Set<string>()
  let criadas = 0, reativadas = 0, rejeitadas = 0, jaTinha = 0, semMapa = 0, incompletas = 0, totalSlots = 0
  const erros: any[] = []
  const errosApi: any[] = []

  // Puxa os slots de CADA unidade ativa com a chave dela (o eventId→ocorrência
  // é global, então o resto do processamento não muda por unidade).
  for (const place of places) {
    const slots = await listarSlots(place.apiKey!, { slotDateFrom: agora.toISOString(), slotDateTo: fim.toISOString() })
    if (!slots.ok) { errosApi.push({ unidade: place.nome, status: slots.status, erro: slots.erro }); continue }
    const lista: any[] = Array.isArray(slots.body) ? slots.body : (slots.body?.data ?? [])
    totalSlots += lista.length
    for (const raw of lista) {
      const s = extrairSlot(raw)
      if (s.status) statusVistos.add(s.status)
      if (!s.slotId || STATUS_MORTOS.has(s.status)) continue
      ativosIds.add(s.slotId)

      const r = await registrarReserva(supabase, s, ocPorEvento, place.apiKey!)
      if (r === 'criada') criadas++
      else if (r === 'reativada') reativadas++
      else if (r === 'rejeitada') rejeitadas++
      else if (r === 'ja') jaTinha++
      else if (r === 'sem-mapa') semMapa++
      else if (r === 'incompleto') incompletas++
      else erros.push(s.slotId)
    }
  }

  // Cancelamentos: reservas nossas via TotalPass, ativas, cujo slot sumiu dos
  // ativos — SÓ dentro da janela consultada (senão cancelaria reservas futuras
  // fora da janela, cujos slots nem foram puxados). ativosIds junta todas as unidades.
  //
  // ⚠️ REDE DE SEGURANÇA: a API da TotalPass às vezes solta um poll vazio ou com
  // erro (timeout/glitch). Se a gente conciliar em cima disso, "nenhum slot veio"
  // é lido como "todo mundo cancelou" e cancela EM MASSA reservas que seguem
  // ativas no app (incidente 26/07: 18 reservas de 14 clientes canceladas de uma
  // vez). Poll vazio quase nunca é cancelamento real — é falha de comunicação.
  // Então só concilia se o poll for CONFIÁVEL: nenhuma unidade falhou na API E
  // pelo menos 1 slot ativo voltou. Senão, pula o cancelamento e espera o próximo
  // poll (o pior caso é uma reserva de fato cancelada persistir mais alguns minutos).
  const hojeStr = agora.toISOString().slice(0, 10)
  const fimStr = fim.toISOString().slice(0, 10)
  const pollConfiavel = errosApi.length === 0 && ativosIds.size > 0
  let canceladas = 0
  let cancelamentoPulado = false
  if (pollConfiavel) {
    canceladas = await conciliarCancelamentos(supabase, ativosIds, hojeStr, fimStr)
  } else {
    cancelamentoPulado = true
    console.warn('[totalpass/pull] conciliação de cancelamentos PULADA — poll não confiável',
      { errosApi: errosApi.length, ativos: ativosIds.size })
  }

  return NextResponse.json({
    ok: true, slots: totalSlots, criadas, reativadas, rejeitadas, jaTinha, semMapa, incompletas,
    canceladas, cancelamentoPulado, erros: erros.length, errosApi, statusVistos: [...statusVistos],
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}

type ResReserva = 'criada' | 'reativada' | 'rejeitada' | 'ja' | 'sem-mapa' | 'erro' | 'incompleto'

// Garante que há vaga real na ocorrência e resolve a posição (esteira/funcional
// nas aulas de Running). Usado tanto na criação quanto na reativação (self-heal),
// pra não duplicar a regra. Sem vaga ou sem posição livre → cancela o slot no app
// deles e devolve { ok:false }. Em Running devolve a posição escolhida; nas demais
// aulas devolve posicao:null.
async function garantirVaga(
  supabase: SupabaseClient, ocorrenciaId: string, apiKey: string, slotId: string
): Promise<{ ok: true; posicao: string | null } | { ok: false }> {
  // Vaga: total_capacity (já desconta site+outros apps) − reservas próprias da TotalPass.
  const { data: numsRaw } = await supabase.rpc('totalpass_slot_numbers', { p_ocorrencia_id: ocorrenciaId })
  const nums = Array.isArray(numsRaw) ? numsRaw[0] : numsRaw
  const { count: tpAtuais } = await supabase
    .from('club_reservas')
    .select('id', { count: 'exact', head: true })
    .eq('ocorrencia_id', ocorrenciaId).eq('via_app', true).neq('status', 'cancelado')
    .not('totalpass_slot_id', 'is', null)
  const disponivel = (nums?.total_capacity ?? 0) - (tpAtuais ?? 0)
  if (disponivel <= 0) {
    await cancelarSlot(apiKey, slotId) // sem vaga → cancela a reserva no app deles
    return { ok: false }
  }

  // Posição: Running exige posição. Auto-atribui a primeira esteira livre, depois
  // funcional. Sem posição livre → sem vaga real → cancela o slot deles.
  const { data: ocInfo } = await supabase
    .from('club_ocorrencias')
    .select('club_aulas(tipo, unidade_id)')
    .eq('id', ocorrenciaId).maybeSingle()
  const tipo = (ocInfo as any)?.club_aulas?.tipo
  const unidadeId = (ocInfo as any)?.club_aulas?.unidade_id
  if (tipo === 'running_funcional') {
    const posicao = await escolherPosicao(supabase, ocorrenciaId, unidadeId)
    if (!posicao) { await cancelarSlot(apiKey, slotId); return { ok: false } }
    return { ok: true, posicao }
  }
  return { ok: true, posicao: null }
}

// Completa um cadastro com o que a TotalPass mandou no slot, SÓ nos campos que
// estão vazios (ou nome genérico "Cliente TotalPass"). CPF gravado só-dígitos.
// É o self-heal: conserta fantasmas criados de um payload cru assim que o dado
// real chega, sem sobrescrever nada que já esteja preenchido.
async function backfillCliente(
  supabase: SupabaseClient, clienteId: string | null | undefined,
  s: ReturnType<typeof extrairSlot>
): Promise<void> {
  if (!clienteId) return
  const { data: c } = await supabase
    .from('clientes').select('nome, cpf, email').eq('id', clienteId).maybeSingle()
  if (!c) return
  const patch: Record<string, string> = {}
  const cpfDigits = s.cpf ? s.cpf.replace(/\D/g, '') : ''
  const nomeGenerico = !(c as any).nome || /cliente totalpass/i.test((c as any).nome)
  if (nomeGenerico && s.nome) patch.nome = s.nome
  if (!(c as any).cpf && cpfDigits) patch.cpf = cpfDigits
  if (!(c as any).email && s.email) patch.email = s.email
  if (Object.keys(patch).length) {
    await supabase.from('clientes').update(patch).eq('id', clienteId)
  }
}

async function registrarReserva(
  supabase: SupabaseClient,
  s: ReturnType<typeof extrairSlot>,
  ocPorEvento: Record<string, string>,
  apiKey: string
): Promise<ResReserva> {
  // Já registrada? Mesmo assim faz backfill: o cliente pode ter sido criado
  // antes (payload cru) e agora os dados chegaram — self-heal do "fantasma".
  const { data: existente } = await supabase
    .from('club_reservas').select('id, cliente_id, status, ocorrencia_id')
    .eq('totalpass_slot_id', s.slotId).maybeSingle()
  if (existente) {
    await backfillCliente(supabase, (existente as any).cliente_id, s)
    if ((existente as any).status !== 'cancelado') return 'ja'

    // SELF-HEAL: o slot voltou ATIVO neste poll, mas nossa reserva está cancelada.
    // Como o slot_id é único por reserva na TotalPass, vê-lo ativo prova que a
    // reserva segue de pé no app deles → a nossa foi cancelada por engano (ver a
    // rede de segurança no POST). Reativamos honrando capacidade/posição atuais,
    // em vez de deixar a reserva morta pra sempre.
    const ocId = (existente as any).ocorrencia_id as string
    const vaga = await garantirVaga(supabase, ocId, apiKey, s.slotId!)
    if (!vaga.ok) return 'rejeitada'
    const { error: errReat } = await supabase
      .from('club_reservas')
      .update({ status: 'reservado', cancelado_em: null, posicao: vaga.posicao })
      .eq('id', (existente as any).id).eq('status', 'cancelado')
    if (errReat) {
      console.warn('[totalpass/pull] reativação recusada:', (errReat as any).code, (errReat as any).message)
      return 'erro'
    }
    return 'reativada'
  }

  // Payload "cru": a TotalPass às vezes devolve o slot ANTES de preencher os
  // dados do usuário (user vazio). Sem NENHUM identificador (cpf/email/nome),
  // NÃO criamos cadastro-fantasma — pulamos e tentamos no próximo poll, quando
  // o payload já vem completo. Evita "Cliente TotalPass" órfão.
  if (!s.cpf && !s.email && !s.nome) return 'incompleto'

  // Ocorrência pelo eventId.
  const ocorrenciaId = s.eventId ? ocPorEvento[s.eventId] : undefined
  if (!ocorrenciaId) return 'sem-mapa'

  // Cliente (match totalpass_id → CPF → email → shell).
  const { data: clienteId, error: errCli } = await supabase.rpc('totalpass_resolver_cliente', {
    p_totalpass_id: s.totalpassId, p_cpf: s.cpf, p_email: s.email, p_nome: s.nome,
  })
  if (errCli || !clienteId) {
    console.error('[totalpass/pull] erro ao resolver cliente:', errCli)
    return 'erro'
  }
  // Backfill: se casou por totalpass_id num cadastro sem CPF/nome/email (ou num
  // fantasma antigo), completa com o que a TotalPass mandou.
  await backfillCliente(supabase, clienteId as unknown as string, s)

  // Vaga real + posição (mesma regra da reativação).
  const vaga = await garantirVaga(supabase, ocorrenciaId, apiKey, s.slotId!)
  if (!vaga.ok) return 'rejeitada'
  const posicao = vaga.posicao

  // Insere. Trava de 1/dia/unidade (P0001) vale no app → rejeita limpo cancelando o slot.
  // 23505 = já existe (reentrega) → trata como criada.
  const payload: any = {
    ocorrencia_id: ocorrenciaId,
    cliente_id: clienteId,
    tipo_credito: 'totalpass_app',
    status: 'reservado',
    via_app: true,
    criado_via: 'totalpass',
    totalpass_slot_id: s.slotId,
  }
  if (posicao) payload.posicao = posicao
  const { error: errIns } = await supabase.from('club_reservas').insert(payload)
  if (errIns) {
    if ((errIns as any).code === '23505') return 'ja'
    console.warn('[totalpass/pull] insert recusado:', (errIns as any).code, (errIns as any).message)
    await cancelarSlot(apiKey, s.slotId!)
    return 'rejeitada'
  }
  return 'criada'
}

// Escolhe a primeira posição LIVRE de uma ocorrência de Running: esteira (tipo
// 'R') antes de funcional ('F'), menor número primeiro. Rótulo = tipo+numero(2
// dígitos), ex.: 'R01', 'F03' — mesmo formato do site. null = tudo ocupado.
async function escolherPosicao(
  supabase: SupabaseClient, ocorrenciaId: string, unidadeId: string
): Promise<string | null> {
  if (!unidadeId) return null
  const rotulo = (p: any) => `${p.tipo}${String(p.numero).padStart(2, '0')}`

  const { data: pos } = await supabase
    .from('club_posicoes')
    .select('tipo, numero, bloqueado')
    .eq('unidade_id', unidadeId).eq('ativo', true)
  const { data: tomadas } = await supabase
    .from('club_reservas')
    .select('posicao')
    .eq('ocorrencia_id', ocorrenciaId).in('status', ['reservado', 'presente'])

  const ocupadas = new Set<string>((tomadas || []).map((t: any) => t.posicao).filter(Boolean))
  for (const p of (pos || [])) if ((p as any).bloqueado) ocupadas.add(rotulo(p)) // bloqueada = indisponível

  const livres = (pos || [])
    .filter((p: any) => !p.bloqueado)
    .sort((a: any, b: any) => (a.tipo !== b.tipo ? (a.tipo === 'R' ? -1 : 1) : a.numero - b.numero))
  for (const p of livres) {
    const l = rotulo(p)
    if (!ocupadas.has(l)) return l
  }
  return null
}

// Reservas TotalPass nossas (ativas) cujo slot não veio mais na listagem = canceladas
// no app. Escopado à janela [hojeStr, fimStr] pra não tocar reservas fora do poll.
async function conciliarCancelamentos(
  supabase: SupabaseClient, ativosIds: Set<string>, hojeStr: string, fimStr: string
): Promise<number> {
  const { data: nossas } = await supabase
    .from('club_reservas')
    .select('id, totalpass_slot_id, club_ocorrencias!inner(data)')
    .not('totalpass_slot_id', 'is', null)
    .eq('status', 'reservado')
    .gte('club_ocorrencias.data', hojeStr)
    .lte('club_ocorrencias.data', fimStr)
  let n = 0
  for (const r of (nossas || [])) {
    const sid = (r as any).totalpass_slot_id as string
    if (ativosIds.has(sid)) continue
    const { error } = await supabase
      .from('club_reservas')
      .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
      .eq('id', (r as any).id).eq('status', 'reservado')
    if (!error) n++
  }
  return n
}
