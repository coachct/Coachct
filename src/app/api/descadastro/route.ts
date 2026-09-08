import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/api-admin'

// Tira a pessoa da lista de promoção. Não mexe em transacional: reset de senha
// e confirmação de reserva continuam saindo sempre.
//
// POST = descadastra. É o que o Gmail chama no botão nativo (one-click) e o
// que a página de confirmação chama.
//
// GET  = NÃO descadastra, só manda pra página de confirmação. Antivírus e
// firewall de e-mail abrem todo link do e-mail pra checar; se GET tirasse da
// lista, metade da base sairia sozinha.

async function descadastrar(token: string): Promise<boolean> {
  if (!token || !/^[0-9a-f]{32}$/i.test(token)) return false
  const supabase = supabaseAdmin()

  const { data: disparo } = await supabase
    .from('email_disparos').select('cliente_id, email').eq('token', token).maybeSingle()

  if (!disparo) return false

  const agora = new Date().toISOString()
  if (disparo.cliente_id) {
    await supabase.from('clientes')
      .update({ marketing_descadastro_em: agora }).eq('id', disparo.cliente_id)
  } else if (disparo.email) {
    await supabase.from('clientes')
      .update({ marketing_descadastro_em: agora }).ilike('email', disparo.email)
  }

  // Tira da fila o que ainda não saiu, em qualquer campanha.
  await supabase.from('email_disparos')
    .update({ status: 'pulado', erro: 'descadastrado' })
    .eq('email', disparo.email).eq('status', 'pendente')

  return true
}

export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('t') || ''
    const ok = await descadastrar(token)
    return NextResponse.json({ ok })
  } catch (err) {
    console.error('Erro no descadastro:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') || ''
  return NextResponse.redirect(new URL(`/descadastro?t=${encodeURIComponent(token)}`, req.url))
}
