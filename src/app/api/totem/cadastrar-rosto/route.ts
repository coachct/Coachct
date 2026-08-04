// POST /api/totem/cadastrar-rosto  { unidade, cpf, embedding:number[128], versaoTermo }
// Salva o rosto (1 por cliente) + registra o consentimento LGPD. Via RPC totem_salvar_rosto.
import { NextRequest, NextResponse } from 'next/server'
import {
  totemService, resolverUnidadeTotem, totemTokenOk, embeddingToVectorText,
} from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TERMO_VERSAO = 'v1'

export async function POST(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ ok: false, motivo: 'nao_autorizado' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const cpf = String(body?.cpf || '').replace(/\D/g, '')
    const embedding = Array.isArray(body?.embedding) ? body.embedding : null

    const sb = totemService()
    const unidade = await resolverUnidadeTotem(sb, String(body?.unidade || ''))
    if (!unidade) return NextResponse.json({ ok: false, motivo: 'unidade_invalida' }, { status: 400 })
    if (cpf.length !== 11) return NextResponse.json({ ok: false, motivo: 'cpf_invalido' })
    if (!embedding || embedding.length !== 128) return NextResponse.json({ ok: false, motivo: 'rosto_invalido' })

    const { data: cliente } = await sb
      .from('clientes')
      .select('id, nome')
      .eq('cpf', cpf)
      .maybeSingle()
    if (!cliente) return NextResponse.json({ ok: false, motivo: 'nao_encontrado' })

    const { error } = await sb.rpc('totem_salvar_rosto', {
      p_cliente: cliente.id,
      p_unidade: unidade.id,
      p_embedding: embeddingToVectorText(embedding),
      p_versao: String(body?.versaoTermo || TERMO_VERSAO),
    })
    if (error) return NextResponse.json({ ok: false, motivo: 'falha_salvar', detalhe: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, nome: cliente.nome })
  } catch (e: any) {
    return NextResponse.json({ ok: false, motivo: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
