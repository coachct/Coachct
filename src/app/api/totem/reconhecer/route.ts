// POST /api/totem/reconhecer  { unidade, embedding:number[128] }
// Match facial: acha o cliente pelo embedding (pgvector) e cai no MESMO fluxo do CPF.
import { NextRequest, NextResponse } from 'next/server'
import {
  totemService, resolverUnidadeClub, totemTokenOk,
  respostaParaCliente, embeddingToVectorText,
} from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const embedding = Array.isArray(body?.embedding) ? body.embedding : null

    const sb = totemService()
    const unidade = await resolverUnidadeClub(sb, String(body?.unidade || ''))
    if (!unidade) return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })
    if (!embedding || embedding.length !== 128) return NextResponse.json({ resultado: 'sem_match' })

    const { data: match } = await sb.rpc('totem_match_face', {
      p_unidade: unidade.id,
      p_embedding: embeddingToVectorText(embedding),
    })

    const clienteId = Array.isArray(match) && match[0]?.cliente_id
    if (!clienteId) return NextResponse.json({ resultado: 'sem_match' })

    const { data: cliente } = await sb
      .from('clientes')
      .select('id, nome, bloqueado')
      .eq('id', clienteId)
      .maybeSingle()
    if (!cliente) return NextResponse.json({ resultado: 'sem_match' })

    const test = body?.test === true || body?.test === '1'
    return NextResponse.json(await respostaParaCliente(sb, unidade, cliente, { ignorarEncerrada: test }))
  } catch (e: any) {
    return NextResponse.json({ erro: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
