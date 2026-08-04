// POST /api/totem/confirmar  { unidade, reservaId }
// Marca presença (status -> 'presente') APENAS para reserva de crédito DIRETO Just.
// Parceiro (Wellhub/TotalPass) nunca passa por aqui: a presença vem do webhook.
// Espelha exatamente o que a recepção faz (update direto em club_reservas.status),
// com guardas para não marcar reserva de outra unidade/dia/parceiro.
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeClub, totemTokenOk, ehParceiro } from '@/lib/totem/service'
import { hojeSP } from '@/lib/tempo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ ok: false, motivo: 'nao_autorizado' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const reservaId = String(body?.reservaId || '')

    const sb = totemService()
    const unidade = await resolverUnidadeClub(sb, String(body?.unidade || ''))
    if (!unidade) return NextResponse.json({ ok: false, motivo: 'unidade_invalida' }, { status: 400 })
    if (!reservaId) return NextResponse.json({ ok: false, motivo: 'reserva_ausente' }, { status: 400 })

    const { data: r } = await sb
      .from('club_reservas')
      .select(`
        id, status, tipo_credito,
        ocorrencia:club_ocorrencias ( data, status, aula:club_aulas ( unidade_id ) )
      `)
      .eq('id', reservaId)
      .maybeSingle()

    const o: any = (r as any)?.ocorrencia
    const a: any = o?.aula
    if (!r || !o || !a) return NextResponse.json({ ok: false, motivo: 'reserva_nao_encontrada' })

    // Guardas: mesma unidade do totem, ocorrência de hoje e ativa, e crédito DIRETO
    if (a.unidade_id !== unidade.id) return NextResponse.json({ ok: false, motivo: 'outra_unidade' })
    if (o.data !== hojeSP() || o.status !== 'ativa') return NextResponse.json({ ok: false, motivo: 'fora_do_dia' })
    if (ehParceiro((r as any).tipo_credito)) return NextResponse.json({ ok: false, motivo: 'parceiro_usa_webhook' })

    if ((r as any).status === 'presente') return NextResponse.json({ ok: true, jaPresente: true })
    if ((r as any).status !== 'reservado') return NextResponse.json({ ok: false, motivo: 'status_invalido' })

    // Update guardado: só vira se ainda estiver 'reservado' (evita corrida/duplo toque)
    const { data: upd, error } = await sb
      .from('club_reservas')
      .update({ status: 'presente' })
      .eq('id', reservaId)
      .eq('status', 'reservado')
      .select('id')

    if (error) return NextResponse.json({ ok: false, motivo: 'falha_update' }, { status: 500 })
    return NextResponse.json({ ok: true, marcada: (upd?.length || 0) > 0 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, motivo: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
