import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'

// Dados da tela de acompanhamento do feedback de estreia.
//
// Passa por aqui (e não direto do navegador) porque `feedback_estreia` tem RLS
// sem política nenhuma: só o service_role lê. E a rota exige admin de verdade —
// esconder o menu não tranca a API.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Banco não configurado no servidor' }, { status: 500 })
    }

    const supabase = supabaseAdmin()
    const { erro: erroAuth } = await exigirAdmin(req, supabase)
    if (erroAuth) return erroAuth

    const pedido = Number(req.nextUrl.searchParams.get('dias'))
    const dias = Number.isInteger(pedido) && pedido > 0 && pedido <= 365 ? pedido : 30

    const { data, error } = await supabase.rpc('feedback_estreia_painel', { p_dias: dias })
    if (error) {
      console.error('Erro no painel de feedback de estreia:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, painel: data })
  } catch (err: any) {
    console.error('Erro inesperado em /api/feedback-estreia/painel:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
