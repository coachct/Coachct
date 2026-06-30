import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const REMETENTE = 'Just Club & CT <nao-responda@justct.com.br>'
const BASE_URL  = process.env.NEXT_PUBLIC_BASE_URL || 'https://coach-ct.vercel.app'

// Protege a rota com um segredo para evitar chamadas externas
const CRON_SECRET = process.env.CRON_SECRET || ''

// ── Templates de email por tipo ────────────────────────────────────────────
function gerarHtml(tipo: string, mensagem: string, nomeCliente: string): { subject: string; html: string } {
  const primeiroNome = (nomeCliente || '').split(' ')[0] || 'cliente'

  const wrapEmail = (conteudo: string, subject: string) => ({
    subject,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;color:#222;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"
        style="background:#fff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:36px 32px;text-align:center;">
            <div style="font-family:Impact,'Arial Black',sans-serif;font-size:30px;color:#fff;letter-spacing:1px;">
              Just Club &amp; <span style="color:#ff2d9b;">CT</span>
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:36px 32px;">${conteudo}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#0a0a0a;padding:20px 32px;text-align:center;">
            <div style="font-size:11px;color:#555;line-height:1.6;">
              Just Club &amp; CT — Serious Training<br/>
              Rua Fiandeiras, 392 · Vila Olímpia · São Paulo/SP
            </div>
            <div style="font-size:10px;color:#333;margin-top:12px;">
              Email automático — não responda a esta mensagem.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  })

  // ── Fila confirmada ──────────────────────────────────────────────────────
  if (tipo === 'fila_confirmada') {
    const conteudo = `
      <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:16px;">🎉 Você foi confirmado, ${primeiroNome}!</div>
      <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:24px;">${mensagem}</div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:6px;">✅ Agendamento confirmado</div>
        <div style="font-size:13px;color:#166534;line-height:1.6;">
          Cancelamento gratuito até <strong>12h antes</strong> (ou 3h se houver fila). Falta sem aviso gera multa de R$49,90.
        </div>
      </div>
      <div style="text-align:center;">
        <a href="${BASE_URL}/minha-conta" style="display:inline-block;background:#ff2d9b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.5px;">
          Ver meus agendamentos →
        </a>
      </div>`
    return wrapEmail(conteudo, `✅ Vaga confirmada — Just CT`)
  }

  // ── Bloqueio no-show CT ──────────────────────────────────────────────────
  if (tipo === 'bloqueio_no_show') {
    const conteudo = `
      <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:16px;">Olá, ${primeiroNome}</div>
      <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:24px;">${mensagem}</div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:6px;">🔒 Conta temporariamente bloqueada</div>
        <div style="font-size:13px;color:#991b1b;line-height:1.6;">
          Para regularizar, compareça à recepção da sua unidade. Novos agendamentos ficam suspensos até a regularização.
        </div>
      </div>`
    return wrapEmail(conteudo, `⚠️ Aviso de falta — Just CT`)
  }

  // ── Bloqueio no-show Club ────────────────────────────────────────────────
  if (tipo === 'bloqueio_no_show_club') {
    const conteudo = `
      <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:16px;">Olá, ${primeiroNome}</div>
      <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:24px;">${mensagem}</div>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:6px;">🔒 Conta bloqueada + multa de R$49,90</div>
        <div style="font-size:13px;color:#991b1b;line-height:1.6;">
          Uma cobrança de R$49,90 será processada no seu cartão cadastrado. Para regularizar, entre em contato com a recepção.
        </div>
      </div>
      <div style="text-align:center;">
        <a href="${BASE_URL}/minha-conta" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:14px;">
          Ver minha conta →
        </a>
      </div>`
    return wrapEmail(conteudo, `⚠️ Falta registrada — JustClub`)
  }

  // ── Genérico (fallback) ──────────────────────────────────────────────────
  const conteudo = `
    <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:16px;">Olá, ${primeiroNome}</div>
    <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:24px;">${mensagem}</div>`
  return wrapEmail(conteudo, `Aviso — Just CT`)
}

// ── Handler principal ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Valida o segredo do cron
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Variáveis de ambiente não configuradas' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const resend = new Resend(process.env.RESEND_API_KEY)

  // Salvaguarda: só envia avisos recentes (últimas 24h). Em operação normal o
  // cron roda a cada minuto, então toda notificação nova sai em ~1 min — bem
  // antes desse corte. O corte só evita disparar de uma vez um backlog antigo
  // represado (ex.: avisos de aulas que já passaram).
  const CORTE_HORAS = 24
  const corte = new Date(Date.now() - CORTE_HORAS * 60 * 60 * 1000).toISOString()

  // Busca notificações pendentes (máximo 50 por rodada)
  const { data: notifs, error: errNotifs } = await supabase
    .from('notificacoes_pendentes')
    .select('*')
    .eq('status', 'pendente')
    .is('enviado_em', null)
    .gte('criado_em', corte)
    .order('criado_em', { ascending: true })
    .limit(50)

  if (errNotifs) {
    return NextResponse.json({ error: 'Erro ao buscar notificações: ' + errNotifs.message }, { status: 500 })
  }

  if (!notifs || notifs.length === 0) {
    return NextResponse.json({ sucesso: true, processadas: 0, mensagem: 'Nenhuma notificação pendente' })
  }

  // Busca dados dos clientes (email para o canal email; telefone para o WhatsApp)
  const clienteIds = [...new Set(notifs.map(n => n.cliente_id).filter(Boolean))]
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome, email, telefone')
    .in('id', clienteIds)

  const clienteMap: Record<string, { nome: string; email: string | null; telefone: string | null }> = {}
  for (const c of (clientes || [])) {
    clienteMap[c.id] = { nome: c.nome, email: c.email, telefone: c.telefone }
  }

  const marcar = (id: string, campos: Record<string, any>) =>
    supabase.from('notificacoes_pendentes').update(campos).eq('id', id)

  let enviadas = 0
  let erros = 0

  for (const notif of notifs) {
    const cliente = clienteMap[notif.cliente_id]

    // Canal único: email. (WhatsApp removido — avisos de fila saem só por email.)

    // ── Canal email (padrão, e fallback do WhatsApp)
    if (!cliente?.email) {
      await marcar(notif.id, {
        status: 'erro',
        erro: 'Cliente sem email cadastrado',
        enviado_em: new Date().toISOString(),
      })
      erros++
      continue
    }

    const { subject, html } = gerarHtml(notif.tipo, notif.mensagem, cliente.nome)

    const { error: errEmail } = await resend.emails.send({
      from: REMETENTE,
      to: cliente.email,
      subject,
      html,
    })

    if (errEmail) {
      await marcar(notif.id, {
        status: 'erro',
        erro: errEmail.message || 'Erro desconhecido do Resend',
        enviado_em: new Date().toISOString(),
      })
      erros++
    } else {
      await marcar(notif.id, { status: 'enviado', enviado_em: new Date().toISOString() })
      enviadas++
    }
  }

  return NextResponse.json({
    sucesso: true,
    processadas: notifs.length,
    enviadas,
    erros,
  })
}

// GET para facilitar teste manual no browser
export async function GET(req: NextRequest) {
  return POST(req)
}
