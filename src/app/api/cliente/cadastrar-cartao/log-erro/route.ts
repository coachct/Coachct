import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Registra no cartoes_log o erro que o FORMULÁRIO de /cadastrar-cartao barrou antes
// de enviar (ano com 2 dígitos, número incompleto, CVV curto...). Só pra suporte:
// recebe apenas o final do cartão e contagens — nunca o número inteiro nem o CVV.
// Best-effort: qualquer falha aqui não afeta o cliente.
export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ ok: false }, { status: 401 })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const { data: cliente } = await supabase
      .from('clientes').select('id').eq('user_id', user.id).maybeSingle()
    if (!cliente) return NextResponse.json({ ok: false }, { status: 404 })

    const b = await req.json()
    const texto = (v: any, max: number) => (v == null ? null : String(v).slice(0, max))
    const final = String(b.final || '').replace(/\D/g, '').slice(-4)

    await supabase.from('cartoes_log').insert({
      cliente_id: cliente.id, operacao: 'cadastro_formulario', sucesso: false,
      erro: texto(b.erro, 200) || 'Erro no formulário',
      motivo: 'Barrado pelo formulário do site (não chegou ao servidor de pagamento)',
      request_payload: {
        final: final ? '****' + final : null,
        digitos: Number(b.digitos) || 0,
        holder_name: texto(b.nome, 80),
        exp_month: texto(b.mes, 4),
        exp_year: texto(b.ano, 6),
        cvv_digitos: Number(b.cvv_digitos) || 0,
      },
      operado_por: user.id,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
