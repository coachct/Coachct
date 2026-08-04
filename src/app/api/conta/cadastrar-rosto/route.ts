// POST /api/conta/cadastrar-rosto  { embedding:number[128] }  + Authorization: Bearer <token>
// Cadastro de rosto pelo PRÓPRIO cliente, logado na conta dele.
// A identidade vem da SESSÃO (token), nunca do corpo → ninguém cadastra no CPF de outro.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { totemService, embeddingToVectorText } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authz = req.headers.get('authorization') || ''
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, motivo: 'sem_sessao' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const embedding = Array.isArray(body?.embedding) ? body.embedding : null
    if (!embedding || embedding.length !== 128) return NextResponse.json({ ok: false, motivo: 'rosto_invalido' })

    // valida o token → user autenticado
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const { data: userData } = await createClient(url, anon).auth.getUser(token)
    const uid = userData?.user?.id
    if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 })

    // resolve o cliente DONO da sessão
    const sb = totemService()
    const { data: cliente } = await sb.from('clientes').select('id, nome').eq('user_id', uid).maybeSingle()
    if (!cliente) return NextResponse.json({ ok: false, motivo: 'cliente_nao_encontrado' })

    const { error } = await sb.rpc('totem_salvar_rosto', {
      p_cliente: cliente.id,
      p_unidade: null,
      p_embedding: embeddingToVectorText(embedding),
      p_versao: 'v1-conta',
    })
    if (error) return NextResponse.json({ ok: false, motivo: 'falha_salvar', detalhe: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, nome: cliente.nome })
  } catch (e: any) {
    return NextResponse.json({ ok: false, motivo: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
