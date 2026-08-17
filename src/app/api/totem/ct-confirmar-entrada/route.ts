// POST /api/totem/ct-confirmar-entrada  { unidade, entradaId }
// A pessoa tocou "Confirmar" no feed do totem CT. Carimba confirmado_totem_em
// (conferência do cliente — a validação no parceiro já foi feita por trás).
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeTotem, totemTokenOk } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function nomeDoRaw(raw: any): string {
  const tp = raw?.user?.name
  if (tp) return String(tp)
  const wh = [raw?.event_data?.user?.first_name, raw?.event_data?.user?.last_name].filter(Boolean).join(' ').trim()
  return wh || 'Cliente'
}

export async function POST(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ ok: false, motivo: 'nao_autorizado' }, { status: 401 })
    const body = await req.json().catch(() => ({} as any))
    const sb = totemService()
    const unidade = await resolverUnidadeTotem(sb, String(body?.unidade || ''))
    if (!unidade) return NextResponse.json({ ok: false, motivo: 'unidade_invalida' }, { status: 400 })
    const entradaId = String(body?.entradaId || '')
    if (!entradaId) return NextResponse.json({ ok: false, motivo: 'entrada_ausente' }, { status: 400 })

    const { data, error } = await sb
      .from('entradas_walkin')
      .update({ confirmado_totem_em: new Date().toISOString() })
      .eq('id', entradaId).eq('unidade_id', unidade.id).is('confirmado_totem_em', null)
      .select('id, raw').maybeSingle()
    if (error) return NextResponse.json({ ok: false, motivo: 'erro_gravar' }, { status: 500 })
    return NextResponse.json({ ok: !!data, nome: data ? nomeDoRaw((data as any).raw) : 'Cliente' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, motivo: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
