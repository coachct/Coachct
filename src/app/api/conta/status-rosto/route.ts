// GET /api/conta/status-rosto  + Authorization: Bearer <token>
// Responde apenas SE o cliente logado já tem rosto cadastrado — nunca o embedding.
//
// A tabela face_embeddings tem RLS ligada e nenhuma policy de leitura de
// propósito: biometria não sai do servidor. Por isso a tela pergunta aqui em vez
// de consultar a tabela. A identidade vem da SESSÃO, nunca do corpo.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { totemService } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authz = req.headers.get('authorization') || ''
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
    if (!token) return NextResponse.json({ ok: false, motivo: 'sem_sessao' }, { status: 401 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const { data: userData } = await createClient(url, anon).auth.getUser(token)
    const uid = userData?.user?.id
    if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 })

    const sb = totemService()
    const { data: cliente } = await sb.from('clientes').select('id').eq('user_id', uid).maybeSingle()
    if (!cliente) return NextResponse.json({ ok: true, cadastrado: false })

    // Só a data — o embedding fica no servidor.
    const { data: rosto } = await sb.from('face_embeddings')
      .select('criado_em').eq('cliente_id', cliente.id).maybeSingle()

    return NextResponse.json({ ok: true, cadastrado: !!rosto, criado_em: rosto?.criado_em || null })
  } catch (e: any) {
    // Falhar aqui não pode quebrar a tela: sem resposta, ela age como "não cadastrado".
    return NextResponse.json({ ok: false, motivo: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
