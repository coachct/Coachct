// GET /api/totem/unidade?u=<id|slug>
// Valida o parâmetro ?unidade= do totem e devolve os dados p/ o cabeçalho.
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeTotem } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sb = totemService()
    const unidade = await resolverUnidadeTotem(sb, String(searchParams.get('u') || ''))
    if (!unidade) return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })
    return NextResponse.json({ unidade })
  } catch (e: any) {
    return NextResponse.json({ erro: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
