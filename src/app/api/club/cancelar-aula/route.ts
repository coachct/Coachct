// src/app/api/club/cancelar-aula/route.ts
//
// Cancela ocorrências de aula Club de forma COMPLETA e à prova de falha — o que a
// exclusão feita direto no client nunca fez. Ordem importa:
//   1. fila_pausada=true nas ocorrências → cancelar as reservas NÃO promove
//      ninguém da fila pra dentro de uma aula que está sendo removida.
//   2. Enfileira email 'aula_cancelada' pros NOSSOS clientes (via_app=false).
//      Quem reservou pelo app do parceiro (via_app=true) é avisado pelo parceiro.
//   3. Remove o slot do parceiro NA HORA (não depende do worker de fila):
//      TotalPass deletarOcorrencia; Wellhub zera a capacidade do slot. Limpa o
//      mapa. Falha do parceiro é logada e contada — nunca trava o cancelamento.
//   4. Cancela as reservas e marca a ocorrência 'cancelada' (sem DELETE físico:
//      a FK club_reservas.ocorrencia_id é NO ACTION e bloquearia o delete).
//
// Admin/coordenadora apenas. Service role pra furar RLS com segurança.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deletarOcorrencia } from '@/lib/totalpass/booking-api'
import { apiKeyPorPlace } from '@/lib/totalpass/places'
import { patchSlotNumbers } from '@/lib/wellhub/booking-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODALIDADE: Record<string, string> = {
  lift: 'Lift',
  lift_for_girls: 'Lift for Girls',
  running_funcional: 'Running + Funcional',
}

function formatarData(dataStr?: string | null): string {
  if (!dataStr) return ''
  try {
    return new Date(dataStr + 'T12:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
  } catch {
    return dataStr || ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    // ── Auth: só admin ou coordenadora ─────────────────────────────────────────
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
    const { data: perfil } = await supabase.from('perfis').select('role').eq('id', user.id).maybeSingle()
    if (!perfil || !['admin', 'coordenadora'].includes(perfil.role)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const ocorrenciaIds: string[] = Array.isArray(body?.ocorrenciaIds)
      ? body.ocorrenciaIds.filter((x: any) => typeof x === 'string' && x)
      : []
    if (ocorrenciaIds.length === 0) {
      return NextResponse.json({ error: 'ocorrenciaIds ausente' }, { status: 400 })
    }

    // ── 1) Pausa a fila ANTES de cancelar (evita promoção indevida) ────────────
    await supabase.from('club_ocorrencias').update({ fila_pausada: true }).in('id', ocorrenciaIds)

    // Dados das ocorrências (data/horário/unidade/gym) pro email e pro parceiro.
    const { data: ocs } = await supabase
      .from('club_ocorrencias')
      .select('id, data, aula_id, club_aulas(horario, tipo, unidade_id, unidades(nome, wellhub_gym_id))')
      .in('id', ocorrenciaIds)
    const ocInfo: Record<string, any> = {}
    for (const o of (ocs || [])) ocInfo[(o as any).id] = o

    // ── 2) Emails pros nossos clientes (reservas ativas, via_app=false) ────────
    const { data: reservas } = await supabase
      .from('club_reservas')
      .select('ocorrencia_id, cliente_id, clientes(nome, email)')
      .in('ocorrencia_id', ocorrenciaIds)
      .eq('via_app', false)
      .neq('status', 'cancelado')

    const notifs: any[] = []
    const avisados = new Set<string>()
    for (const r of (reservas || [])) {
      const cli: any = (r as any).clientes
      if (!cli?.email) continue
      const chave = `${(r as any).cliente_id}:${(r as any).ocorrencia_id}`
      if (avisados.has(chave)) continue
      avisados.add(chave)

      const o = ocInfo[(r as any).ocorrencia_id]
      const aula: any = o?.club_aulas
      const uni: any = aula?.unidades
      const modalidade = MODALIDADE[aula?.tipo] || 'aula'
      const dataFmt = formatarData(o?.data)
      const horario = (aula?.horario || '').slice(0, 5)
      const mensagem =
        `Sua aula de ${modalidade} em ${uni?.nome || 'JustClub'}, ${dataFmt} às ${horario}, ` +
        `foi cancelada pela unidade. Desculpe o transtorno — você pode remarcar em outro horário pelo app.`

      notifs.push({
        cliente_id: (r as any).cliente_id,
        tipo: 'aula_cancelada',
        canal: 'email',
        destino: cli.email,
        mensagem,
        unidade_id: aula?.unidade_id || null,
      })
    }
    if (notifs.length) await supabase.from('notificacoes_pendentes').insert(notifs)

    // ── 3) Remove do parceiro NA HORA (fail-safe) ──────────────────────────────
    let tpRemovidas = 0, whRemovidas = 0, parceiroFalhas = 0

    // TotalPass: deleta a ocorrência e limpa o mapa.
    const { data: tpMaps } = await supabase
      .from('totalpass_slot_map')
      .select('ocorrencia_id, occurrence_uuid, place_id')
      .in('ocorrencia_id', ocorrenciaIds)
    for (const m of (tpMaps || [])) {
      const apiKey = apiKeyPorPlace(String((m as any).place_id || ''))
      if (!apiKey) { parceiroFalhas++; continue }
      const del = await deletarOcorrencia(apiKey, (m as any).occurrence_uuid)
      if (del.ok) {
        await supabase.from('totalpass_slot_map').delete().eq('ocorrencia_id', (m as any).ocorrencia_id)
        tpRemovidas++
      } else {
        parceiroFalhas++
      }
    }

    // Wellhub: zera a capacidade do slot (bloqueia novas reservas) e limpa o mapa.
    // OBS: a Booking API do Wellhub não tem DELETE de slot — zerar a capacidade é
    // o mais próximo de "remover da grade" sem inventar endpoint.
    const { data: whMaps } = await supabase
      .from('wellhub_slot_map')
      .select('ocorrencia_id, wellhub_class_id, wellhub_slot_id')
      .in('ocorrencia_id', ocorrenciaIds)
    for (const m of (whMaps || [])) {
      const gym = ocInfo[(m as any).ocorrencia_id]?.club_aulas?.unidades?.wellhub_gym_id
      if (!gym) { parceiroFalhas++; continue }
      const resp = await patchSlotNumbers(
        String(gym),
        (m as any).wellhub_class_id,
        (m as any).wellhub_slot_id,
        { total_capacity: 0, total_booked: 0 },
      )
      if (resp.ok) {
        await supabase.from('wellhub_slot_map').delete().eq('ocorrencia_id', (m as any).ocorrencia_id)
        whRemovidas++
      } else {
        parceiroFalhas++
      }
    }

    // ── 4) Cancela as reservas e marca a ocorrência cancelada ──────────────────
    await supabase.from('club_reservas')
      .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
      .in('ocorrencia_id', ocorrenciaIds).neq('status', 'cancelado')
    await supabase.from('club_ocorrencias')
      .update({ status: 'cancelada' }).in('id', ocorrenciaIds)

    return NextResponse.json({
      ok: true,
      ocorrencias: ocorrenciaIds.length,
      avisos_enfileirados: notifs.length,
      totalpass_removidas: tpRemovidas,
      wellhub_removidas: whRemovidas,
      parceiro_falhas: parceiroFalhas,
    })
  } catch (err: any) {
    console.error('[club/cancelar-aula] erro:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 })
  }
}
