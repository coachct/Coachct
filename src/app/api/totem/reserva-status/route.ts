// GET /api/totem/reserva-status?unidade=&reservaId=
// Polling: o totem chama de tempos em tempos para saber se o parceiro já confirmou
// o check-in (status virou 'presente' via webhook Wellhub/TotalPass).
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeClub, totemTokenOk } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const reservaId = String(searchParams.get('reservaId') || '')

    const sb = totemService()
    const unidade = await resolverUnidadeClub(sb, String(searchParams.get('unidade') || ''))
    if (!unidade) return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })
    if (!reservaId) return NextResponse.json({ erro: 'reserva_ausente' }, { status: 400 })

    const { data: r } = await sb
      .from('club_reservas')
      .select('id, status, posicao, cliente_id, ocorrencia_id, ocorrencia:club_ocorrencias ( aula:club_aulas ( unidade_id ) )')
      .eq('id', reservaId)
      .maybeSingle()

    const a: any = (r as any)?.ocorrencia?.aula
    if (!r || !a || a.unidade_id !== unidade.id) return NextResponse.json({ erro: 'nao_encontrada' })

    // Robusto a reservas duplicadas: se o cliente estiver PRESENTE em QUALQUER
    // reserva desta mesma aula (ocorrência), considera presente — e devolve a
    // posição da linha realmente presente (a que a pessoa vai ocupar).
    const { data: pres } = await sb
      .from('club_reservas')
      .select('posicao')
      .eq('cliente_id', (r as any).cliente_id)
      .eq('ocorrencia_id', (r as any).ocorrencia_id)
      .eq('status', 'presente')
      .limit(1)
      .maybeSingle()

    if (pres) return NextResponse.json({ status: 'presente', posicao: (pres as any).posicao ?? (r as any).posicao ?? null })
    return NextResponse.json({ status: (r as any).status as string, posicao: (r as any).posicao ?? null })
  } catch (e: any) {
    return NextResponse.json({ erro: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
