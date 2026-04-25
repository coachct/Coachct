import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nome, email, senha, cpf, contrato, salario_fixo, adicional_por_aula, valor_cliente_aula } = body

    if  (!nome || !email || !senha) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando.' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, role: 'coach' }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const userId = authData.user.id

    const { error: coachError } = await supabaseAdmin.from('coaches').insert({
      user_id: userId,
      nome, cpf, email,
      contrato: contrato || 'CLT',
      salario_fixo: salario_fixo || 0,
      adicional_por_aula: adicional_por_aula || 0,
      valor_cliente_aula: valor_cliente_aula || 0,
      ativo: true,
    })

    if (coachError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: coachError.message }, { status: 400 })
    }

    await supabaseAdmin.from('perfis').update({ nome, role: 'coach' }).eq('id', userId)

    return NextResponse.json({ success: true, userId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
