import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Consulta leve pro checkout saber quando o PIX caiu — quem confirma é o webhook.
// Devolve só o status: o id é o UUID que o próprio checkout recebeu ao gerar o PIX.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Id inválido' }, { status: 400 })
  }

  const { data } = await supabase
    .from('pagamentos_pendentes')
    .select('status')
    .eq('id', id)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ status: data.status }, { headers: { 'Cache-Control': 'no-store' } })
}
