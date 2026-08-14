// Vigia do WhatsApp: checa se estamos RECEBENDO mensagens. Se, em horário
// comercial, ficar tempo demais sem NENHUM inbound, manda um e-mail de alerta
// (nunca por WhatsApp — se o WhatsApp está caído, o aviso por WhatsApp não sairia).
//
// Chamado por cron da Vercel (GET com Authorization: Bearer CRON_SECRET).
// Termômetro: whatsapp_processadas.criado_em (registrado em TODO inbound, antes de
// qualquer processamento). Cooldown em wa_watchdog_alertas pra não spammar.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || ''
const REMETENTE = 'Just Club & CT <nao-responda@justct.com.br>'
// Pra onde vai o alerta. Configurável por env; default = e-mail do Ricardo.
const ALERTA_EMAIL = process.env.WHATSAPP_WATCHDOG_EMAIL || 'ricardopelosini@gmail.com'
// Minutos sem inbound (em horário comercial) que disparam o alerta.
const LIMITE_MIN = parseInt(process.env.WHATSAPP_WATCHDOG_MIN || '75', 10) || 75
// Não repetir alerta antes desse tempo (min).
const COOLDOWN_MIN = 180
// Janela de horário comercial (hora de SP) em que se espera receber mensagens.
const HORA_INICIO = 8
const HORA_FIM = 22

function horaEmSaoPaulo(): number {
  const sp = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return sp.getHours()
}

async function checar() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  )

  const hora = horaEmSaoPaulo()
  if (hora < HORA_INICIO || hora >= HORA_FIM) {
    return { ok: true, detalhe: `fora do horário comercial (${hora}h SP) — sem checagem` }
  }

  // Último inbound recebido (qualquer mensagem que chegou no webhook).
  const { data: ult } = await supabase
    .from('whatsapp_processadas')
    .select('criado_em')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ultimoMs = (ult as any)?.criado_em ? new Date((ult as any).criado_em).getTime() : 0
  const minutos = ultimoMs ? Math.round((Date.now() - ultimoMs) / 60000) : 999999

  if (minutos < LIMITE_MIN) {
    return { ok: true, detalhe: `ok — última mensagem recebida há ${minutos} min` }
  }

  // Está parado. Já avisei há pouco? (cooldown, pra não spammar)
  const { data: st } = await supabase
    .from('wa_watchdog_alertas')
    .select('alertado_em')
    .order('alertado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ultAlertaMs = (st as any)?.alertado_em ? new Date((st as any).alertado_em).getTime() : 0
  if (ultAlertaMs && (Date.now() - ultAlertaMs) / 60000 < COOLDOWN_MIN) {
    return { ok: false, detalhe: `parado há ${minutos} min — já alertado (cooldown)` }
  }

  // Dispara o alerta por e-mail.
  const resend = new Resend(process.env.RESEND_API_KEY as string)
  const horas = Math.floor(minutos / 60)
  const tempoTxt = horas >= 1 ? `${horas}h${String(minutos % 60).padStart(2, '0')}` : `${minutos} min`
  await resend.emails.send({
    from: REMETENTE,
    to: ALERTA_EMAIL,
    subject: `⚠️ WhatsApp da Just CT pode estar PARADO (sem receber há ${tempoTxt})`,
    html: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.6;">
        <h2 style="color:#c0392b;">⚠️ Alerta: WhatsApp sem receber mensagens</h2>
        <p>O assistente <strong>não recebe uma mensagem nova há ${tempoTxt}</strong>, em horário comercial.</p>
        <p>Como normalmente chegam mensagens o tempo todo, isso pode indicar que a
        integração com a Meta caiu (mensagens dos clientes não estão chegando).</p>
        <p><strong>O que checar:</strong></p>
        <ul>
          <li>O número <strong>+55 11 91755-5878</strong> foi aberto/registrado em algum celular no app WhatsApp Business? (isso derruba a integração)</li>
          <li>No WhatsApp Manager da Meta: o número está "Conectado"? Tem alguma restrição?</li>
        </ul>
        <p style="color:#888;font-size:13px;">Você só recebe este alerta uma vez a cada 3h enquanto durar. Quando as mensagens voltarem, ele para sozinho.</p>
      </div>`,
  })

  await supabase.from('wa_watchdog_alertas').insert({ minutos_sem_inbound: minutos })
  return { ok: false, detalhe: `ALERTA enviado para ${ALERTA_EMAIL} — parado há ${minutos} min` }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'faltam envs (RESEND_API_KEY / SUPABASE_SERVICE_ROLE_KEY)' }, { status: 500 })
  }
  try {
    const r = await checar()
    return NextResponse.json(r)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'erro' }, { status: 500 })
  }
}
