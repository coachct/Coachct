import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { user_id, nova_senha } = await req.json()

  if (!user_id || !nova_senha || nova_senha.length < 6) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  }

  const { error } = await supabase.auth.admin.updateUserById(user_id, {
    password: nova_senha
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
