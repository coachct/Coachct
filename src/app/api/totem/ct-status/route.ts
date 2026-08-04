// GET /api/totem/ct-status?unidade=&clienteId=
// Polling do CT: enquanto a pessoa aguarda, verifica se o check-in de parceiro
// já foi validado (ou se agora tem plano) → libera sozinho.
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeTotem, totemTokenOk, respostaCT } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const clienteId = String(searchParams.get('clienteId') || '')

    const sb = totemService()
    const unidade = await resolverUnidadeTotem(sb, String(searchParams.get('unidade') || ''))
    if (!unidade || unidade.tipo !== 'ct') return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })
    if (!clienteId) return NextResponse.json({ erro: 'cliente_ausente' }, { status: 400 })

    const { data: cliente } = await sb
      .from('clientes')
      .select('id, nome, bloqueado, cpf, wellhub_id')
      .eq('id', clienteId)
      .maybeSingle()
    if (!cliente) return NextResponse.json({ liberado: false })

    const res: any = await respostaCT(sb, unidade, cliente)
    if (res?.resultado === 'liberado') return NextResponse.json({ liberado: true, origem: res.origem, produto: res.produto })
    return NextResponse.json({ liberado: false })
  } catch (e: any) {
    return NextResponse.json({ erro: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
