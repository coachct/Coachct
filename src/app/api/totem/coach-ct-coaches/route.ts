// GET /api/totem/coach-ct-coaches?unidade=&agendamentoId=
// Coaches disponíveis para o horário do agendamento (pro cliente escolher no totem).
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeTotem, totemTokenOk } from '@/lib/totem/service'
import { coachesDisponiveis } from '@/lib/totem/coach-ct'

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
      .from('agendamentos').select('data, horario, unidade_id').eq('id', agId).maybeSingle()
    if (!ag || (ag as any).unidade_id !== unidade.id) return NextResponse.json({ erro: 'nao_encontrada' })

    const coaches = await coachesDisponiveis(sb, unidade.id, (ag as any).data, (ag as any).horario)
    return NextResponse.json({ coaches })
  } catch (e: any) {
    return NextResponse.json({ erro: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
