// POST /api/totem/reconhecer  { unidade, embedding:number[128] }
// Match facial (pgvector, global) → cai no MESMO fluxo do CPF (Club: reserva | CT: acesso).
import { NextRequest, NextResponse } from 'next/server'
import {
  totemService, resolverUnidadeTotem, totemTokenOk,
  respostaParaCliente, respostaCT, embeddingToVectorText,
} from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const embedding = Array.isArray(body?.embedding) ? body.embedding : null

    const sb = totemService()
    const unidade = await resolverUnidadeTotem(sb, String(body?.unidade || ''))
    if (!unidade) return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })
    if (!embedding || embedding.length !== 128) return NextResponse.json({ resultado: 'sem_match' })

    // Precisão do rosto (distância L2):
    //  - LIMIAR: semelhança mínima. Menor = mais rígido (padrão face-api é 0.6).
    //  - MARGEM: o 1º tem que ser MAIS parecido que o 2º por essa folga; senão é
    //    ambíguo (ex.: mulheres/rostos parecidos) → NÃO reconhece, cai no CPF.
    const LIMIAR_FACE = 0.48
    const MARGEM_FACE = 0.05
    const { data: match } = await sb.rpc('totem_match_face', {
      p_unidade: unidade.id,
      p_embedding: embeddingToVectorText(embedding),
      p_limiar: LIMIAR_FACE,
      p_margem: MARGEM_FACE,
    })

    const clienteId = Array.isArray(match) && match[0]?.cliente_id
    if (!clienteId) return NextResponse.json({ resultado: 'sem_match' })

    const { data: cliente } = await sb
      .from('clientes')
      .select('id, nome, bloqueado, cpf, wellhub_id')
      .eq('id', clienteId)
      .maybeSingle()
    if (!cliente) return NextResponse.json({ resultado: 'sem_match' })

    if (unidade.tipo === 'ct') return NextResponse.json(await respostaCT(sb, unidade, cliente))

    const test = body?.test === true || body?.test === '1'
    return NextResponse.json(await respostaParaCliente(sb, unidade, cliente, { ignorarEncerrada: test }))
  } catch (e: any) {
    return NextResponse.json({ erro: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
