import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const REMETENTE = 'Just CT <nao-responda@justct.com.br>'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://coach-ct.vercel.app'

function gerarSenhaAleatoria(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let senha = ''
  const cryptoArr = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(cryptoArr)
    for (let i = 0; i < 8; i++) {
      senha += chars[cryptoArr[i] % chars.length]
    }
  } else {
    for (let i = 0; i < 8; i++) {
      senha += chars[Math.floor(Math.random() * chars.length)]
    }
  }
  return senha
}

// Busca o usuário de auth pelo email percorrendo TODAS as páginas.
// O listUsts() padrão só traz a 1ª página (~50 contas) — quem está fora
// dela não era encontrado, e a rota retornava "sucesso" sem enviar email.
async function acharUsuarioAuthPorEmail(supabase: any, emailLimpo: string): Promise<any | null> {
  const perPage = 1000
  let page = 1
  while (page <= 50) { // teto de segurança: 50.000 contas
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users: any[] = (data?.users as any[]) || []
    const found = users.find((u: any) => String(u?.email || '').toLowerCase() === emailLimpo)
    if (found) return found
    if (users.length < perPage) return null // chegou na última página
    page++
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email não configurado no servidor' }, { status: 500 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Acesso ao banco não configurado' }, { status: 500 })
    }

    const emailLimpo = String(email).trim().toLowerCase()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Busca o(s) cliente(s) pelo email. Pode haver duplicidade (clientes legados),
    // então não usamos .maybeSingle() — pegamos o que tiver user_id de preferência.
    const { data: clientesMatch } = await supabase
      .from('clientes')
      .select('id, nome, email, user_id')
      .ilike('email', emailLimpo)
      .limit(5)

    const clienteComUser =
      (clientesMatch || []).find((c: any) => c.user_id) ||
      (clientesMatch || [])[0] ||
      null

    // Descobre o id do usuário de auth.
    // 1º) direto pela coluna clientes.user_id (canônica — preenchida pelo criar-acesso)
    // 2º) fallback: varre todas as páginas do listUsers pelo email
    let userId: string | null = clienteComUser?.user_id || null
    let nomeParaEmail: string = String(clienteComUser?.nome || '')

    if (!userId) {
      const usuarioAuth = await acharUsuarioAuthPorEmail(supabase, emailLimpo)
      if (usuarioAuth) {
        userId = usuarioAuth.id
        if (!nomeParaEmail) {
          nomeParaEmail = String(usuarioAuth?.user_metadata?.nome || '')
        }
      }
    }

    // Por segurança, sempre retorna sucesso mesmo se o email não existir
    // (evita que alguém descubra quais emails estão cadastrados).
    // Agora isso só acontece após uma busca COMPLETA — usuário real sempre é achado.
    if (!userId) {
      return NextResponse.json({ sucesso: true, email_enviado: true })
    }

    const senhaProvisoria = gerarSenhaAleatoria()

    // Redefine a senha do usuário existente
    const { error: errUpdate } = await supabase.auth.admin.updateUserById(userId, {
      password: senhaProvisoria,
    })

    if (errUpdate) {
      return NextResponse.json({
        error: 'Erro ao redefinir senha: ' + errUpdate.message
      }, { status: 500 })
    }

    const primeiroNome = nomeParaEmail.split(' ')[0] || 'cliente'
    const linkLogin = `${BASE_URL}/login`

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redefinição de senha — Just Club &amp; CT</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;color:#222;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <tr>
            <td style="background:#111111;padding:40px 32px;text-align:center;">
              <div style="font-family:Impact,sans-serif;font-size:30px;color:#ffffff;letter-spacing:4px;font-weight:700;">
                JUST <span style="color:#ff2d9b;">CLUB &amp; CT</span>
              </div>
              <div style="font-size:11px;color:#888;letter-spacing:3px;margin-top:10px;text-transform:uppercase;">
                // redefinição de senha
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 32px;">
              <div style="font-size:22px;font-weight:700;color:#222;margin-bottom:14px;">
                Olá, ${primeiroNome}! 👋
              </div>

              <div style="font-size:15px;line-height:1.7;color:#555;margin-bottom:28px;">
                Recebemos um pedido para redefinir a sua senha. Geramos uma <strong style="color:#222;">nova senha provisória</strong> para você. Use ela para entrar e depois cadastre uma senha pessoal em <strong style="color:#222;">Minha Conta</strong>.
              </div>

              <div style="background:#111;border-radius:12px;padding:22px 24px;margin-bottom:26px;">
                <div style="font-size:10px;font-weight:700;color:#ff2d9b;text-transform:uppercase;letter-spacing:2px;margin-bottom:16px;">Seus dados de acesso</div>
                <div style="margin-bottom:14px;">
                  <div style="font-size:10px;color:#777;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Email</div>
                  <div style="font-size:15px;color:#ffffff;font-family:monospace;">${emailLimpo}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:#777;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Nova senha provisória</div>
                  <div style="font-size:26px;color:#ff2d9b;font-family:monospace;font-weight:700;letter-spacing:3px;">${senhaProvisoria}</div>
                </div>
              </div>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 28px;">
                <tr>
                  <td align="center" style="background-color:#ff2d9b;border-radius:10px;">
                    <a href="${linkLogin}" target="_blank" style="display:inline-block;padding:16px 40px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">
                      Acessar minha conta →
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;margin-bottom:24px;">
                <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Não foi você?</div>
                <div style="font-size:13px;color:#78350f;line-height:1.6;">Se você não pediu esta redefinição, ignore este email — sua senha anterior continua válida até alguém usar a senha acima.</div>
              </div>

              <div style="font-size:13px;color:#888;line-height:1.7;">
                Qualquer dúvida, chame a gente no Direct do Instagram
                <a href="https://instagram.com/justclub.ct" target="_blank" style="color:#ff2d9b;text-decoration:none;font-weight:700;">@justclub.ct</a>
                — estamos aqui para te ajudar!
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#111;padding:22px 32px;text-align:center;">
              <div style="font-size:11px;color:#555;line-height:1.8;">
                Just CT — Vila Olímpia · Rua Fiandeiras, 392<br/>
                JustClub — Pinheiros &amp; Vila Olímpia
              </div>
              <div style="font-size:10px;color:#333;margin-top:12px;">Email automático — não responda a esta mensagem.</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `

    const resend = new Resend(process.env.RESEND_API_KEY)

    const { error: errEmail } = await resend.emails.send({
      from: REMETENTE,
      to: emailLimpo,
      subject: `Redefinição de senha — Just Club & CT`,
      html,
    })

    if (errEmail) {
      console.error('Erro ao enviar email:', errEmail)
      return NextResponse.json({
        error: 'Senha redefinida, mas o email falhou. Tente novamente.'
      }, { status: 500 })
    }

    return NextResponse.json({ sucesso: true, email_enviado: true })

  } catch (e: any) {
    console.error('Erro na route /api/resetar-senha-cliente:', e)
    return NextResponse.json({
      error: 'Erro interno: ' + (e.message || 'desconhecido')
    }, { status: 500 })
  }
}
