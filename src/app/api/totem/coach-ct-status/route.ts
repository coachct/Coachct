// GET /api/totem/coach-ct-status?unidade=&agendamentoId=
// Polling do totem: o agendamento Coach CT já ficou presente (check-in Personal
// validado)? Já tem coach escolhido?
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeTotem, totemTokenOk } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const agId = String(searchParams.get('agendamentoId') || '')
    const sb = totemService()
    const unidade = await resolverUnidadeTotem(sb, String(searchParams.get('unidade') || ''))
    if (!unidade) return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })
    if (!agId) return NextResponse.json({ erro: 'agendamento_ausente' }, { status: 400 })

    const { data: ag } = await sb
      .from('agendamentos')
      .select('status, coach_id, presenca_checkin, unidade_id, coaches:coach_id ( id, nome )')
      .eq('id', agId).maybeSingle()
    if (!ag || (ag as any).unidade_id !== unidade.id) return NextResponse.json({ erro: 'nao_encontrada' })

    const presente = (ag as any).status === 'realizado' || (ag as any).presenca_checkin === true
    const coach = (ag as any).coaches
    return NextResponse.json({ presente, coachId: (ag as any).coach_id || null, coachNome: coach?.nome ?? null })
  } catch (e: any) {
    return NextResponse.json({ erro: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
