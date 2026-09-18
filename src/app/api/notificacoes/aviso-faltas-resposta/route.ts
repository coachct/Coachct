import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const runtime = 'nodejs'

const REMETENTE = 'Just Club & CT <nao-responda@justct.com.br>'
const ALERTA_EMAIL = process.env.AVISO_FALTAS_EMAIL || 'ricardopelosini@gmail.com'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Cliente com aviso de faltas respondeu "Não" ao popup em /agendar.
 * A reserva não foi feita; aqui só avisamos a equipe pra alguém falar com ela.
 * Fire-and-forget no front — sempre responde rápido e nunca trava a UX.
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, motivo: 'env_ausente' })
    }

    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token)
    if (errAuth || !user) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data: cliente } = await supabase
      .from('clientes').select('id, nome, email, whatsapp, telefone').eq('user_id', user.id).maybeSingle()
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const esc = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!))
    const contato = cliente.whatsapp || cliente.telefone || '—'

    const resend = new Resend(process.env.RESEND_API_KEY as string)
    await resend.emails.send({
      from: REMETENTE,
      to: ALERTA_EMAIL,
      subject: `Aviso de faltas: ${cliente.nome} respondeu NÃO`,
      html: `
        <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.6;">
          <h2>Cliente respondeu NÃO ao aviso de faltas</h2>
          <p><strong>${esc(cliente.nome)}</strong> tentou reservar o Coach CT e, no aviso
          "Notamos que você tem agendado e não comparecido", respondeu <strong>Não</strong>.
          A reserva não foi feita.</p>
          <ul>
            <li>Horário que tentou: ${esc(body?.data)} às ${esc(body?.hora)}${body?.unidade ? ` — ${esc(body.unidade)}` : ''}</li>
            <li>E-mail: ${esc(cliente.email || '—')}</li>
            <li>WhatsApp/telefone: ${esc(contato)}</li>
          </ul>
          <p>Vale alguém da equipe entrar em contato pra entender o que está acontecendo.</p>
        </div>`,
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: String(e?.message || e) })
  }
}
