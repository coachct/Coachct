// POST /api/totem/coach-ct-confirmar  { unidade, agendamentoId, coachId }
// Grava a escolha do coach feita pelo cliente no totem. O gatilho do banco
// (on_agendamento_notificar_coach) avisa o coach na hora.
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeTotem, totemTokenOk } from '@/lib/totem/service'
import { confirmarCoachCt } from '@/lib/totem/coach-ct'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ ok: false, motivo: 'nao_autorizado' }, { status: 401 })
    const body = await req.json().catch(() => ({} as any))
    const sb = totemService()
    const unidade = await resolverUnidadeTotem(sb, String(body?.unidade || ''))
    if (!unidade) return NextResponse.json({ ok: false, motivo: 'unidade_invalida' }, { status: 400 })

    const agId = String(body?.agendamentoId || '')
    const coachId = String(body?.coachId || '')
    if (!agId || !coachId) return NextResponse.json({ ok: false, motivo: 'faltam_dados' }, { status: 400 })

    const r = await confirmarCoachCt(sb, unidade.id, agId, coachId)
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, motivo: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
