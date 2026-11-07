import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cobrarMultaCT } from '@/lib/cobranca-multa'

// Cobrança manual da multa de no-show do Coach CT (botão da tela Cobrança No-Show).
// A lógica de cobrança vive em src/lib/cobranca-multa.ts (compartilhada com a rotina das 22h).

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer '))
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

    const { data: perfil } = await supabase.from('perfis').select('id, role').eq('id', user.id).maybeSingle()
    if (!perfil || !['admin', 'coordenadora'].includes(perfil.role))
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const { agendamento_id, valor } = body

    if (!agendamento_id || !valor || valor <= 0)
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const res = await cobrarMultaCT(supabase, agendamento_id, Number(valor), { operadoPor: perfil.id })
    return NextResponse.json(res.body, { status: res.status })

  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 })
  }
}
