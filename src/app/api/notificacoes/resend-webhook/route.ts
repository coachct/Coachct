import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Evento do Resend → status em emails_enviados. "Aberto" fica de fora de
// propósito: Yahoo/Gmail/Apple abrem sozinhos, não prova leitura.
const STATUS: Record<string, string> = {
  'email.delivered': 'entregue',
  'email.bounced': 'devolvido',
  'email.complained': 'spam',
  'email.delivery_delayed': 'atrasado',
}

// Assinatura no padrão Svix (usado pelo Resend): HMAC-SHA256 de
// "id.timestamp.corpo" com o segredo whsec_ (base64).
function assinaturaValida(req: NextRequest, corpo: string, segredo: string): boolean {
  const id = req.headers.get('svix-id')
  const ts = req.headers.get('svix-timestamp')
  const sig = req.headers.get('svix-signature')
  if (!id || !ts || !sig) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false

  const chave = Buffer.from(segredo.replace(/^whsec_/, ''), 'base64')
  const esperado = crypto.createHmac('sha256', chave).update(`${id}.${ts}.${corpo}`).digest()
  return sig.split(' ').some(parte => {
    const [versao, valor] = parte.split(',')
    if (versao !== 'v1' || !valor) return false
    const recebido = Buffer.from(valor, 'base64')
    return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado)
  })
}

export async function POST(req: NextRequest) {
  const segredo = process.env.RESEND_WEBHOOK_SECRET
  if (!segredo) return NextResponse.json({ error: 'webhook não configurado' }, { status: 503 })

  const corpo = await req.text()
  if (!assinaturaValida(req, corpo, segredo)) {
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })
  }

  let evento: any
  try { evento = JSON.parse(corpo) } catch { return NextResponse.json({ ok: true }) }

  const status = STATUS[evento?.type]
  const resendId = evento?.data?.email_id
  if (!status || !resendId) return NextResponse.json({ ok: true })

  const agora = new Date().toISOString()
  const campos: Record<string, any> = { status, atualizado_em: agora }
  if (status === 'entregue') campos.entregue_em = evento?.created_at || agora
  if (status === 'devolvido') campos.erro = evento?.data?.bounce?.message || null

  let q = supabase.from('emails_enviados').update(campos).eq('resend_id', resendId)
  // "Atrasado" pode chegar depois do "entregue" — só vale enquanto não houver desfecho.
  if (status === 'atrasado') q = q.eq('status', 'enviado')
  const { error } = await q
  if (error) {
    console.error('[resend-webhook] falha ao atualizar:', error.message)
    return NextResponse.json({ error: 'falha' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
