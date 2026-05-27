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

export async function POST(req: NextRequest) {
  try {
    const { cliente_id } = await req.json()

    if (!cliente_id) {
      return NextResponse.json({ error: 'cliente_id é obrigatório' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email não configurado no servidor' }, { status: 500 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Acesso ao banco não configurado' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: cliente, error: errCli } = await supabase
      .from('clientes')
      .select('id, nome, email, cpf, user_id')
      .eq('id', cliente_id)
      .maybeSingle()

    if (errCli || !cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    if (!cliente.email) {
      return NextResponse.json({
        error: 'Cliente sem email cadastrado. Cadastre o email antes de criar o acesso.'
      }, { status: 400 })
    }

    if (cliente.user_id) {
      return NextResponse.json({
        error: 'Este cliente já tem acesso ao sistema.'
      }, { status: 400 })
    }

    const emailCliente: string = String(cliente.email).toLowerCase()

    const { data: listaUsers, error: errList } = await supabase.auth.admin.listUsers()

    if (errList) {
      return NextResponse.json({
        error: 'Erro ao verificar email: ' + errList.message
      }, { status: 500 })
    }

    const usuariosExistentes: any[] = (listaUsers?.users as any[]) || []
    const emailJaUsado = usuariosExistentes.find((u: any) => {
      const emailDoUser: string = String(u?.email || '').toLowerCase()
      return emailDoUser === emailCliente
    })

    if (emailJaUsado) {
      return NextResponse.json({
        error: 'Já existe um usuário com este email no sistema.'
      }, { status: 400 })
    }

    const senhaProvisoria = gerarSenhaAleatoria()

    const { data: novoUser, error: errAuth } = await supabase.auth.admin.createUser({
      email: cliente.email,
      password: senhaProvisoria,
      email_confirm: true,
      user_metadata: {
        nome: cliente.nome,
        cpf: cliente.cpf,
        role: 'cliente',
        criado_por_admin: true,
      },
    })

    if (errAuth || !novoUser?.user) {
      return NextResponse.json({
        error: 'Erro ao criar acesso: ' + (errAuth?.message || 'desconhecido')
      }, { status: 500 })
    }

    const userId = novoUser.user.id

    const { error: errLink } = await supabase
      .from('clientes')
      .update({ user_id: userId })
      .eq('id', cliente.id)

    if (errLink) {
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json({
        error: 'Erro ao vincular acesso: ' + errLink.message
      }, { status: 500 })
    }

    const primeiroNome = String(cliente.nome || '').split(' ')[0]
    const linkLogin = `${BASE_URL}/login`

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo ao Just Club &amp; CT</title>
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
                // bem-vindo ao nosso sistema
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 32px;">
              <div style="font-size:22px;font-weight:700;color:#222;margin-bottom:14px;">
                Olá, ${primeiroNome}! 👋
              </div>

              <div style="font-size:15px;line-height:1.7;color:#555;margin-bottom:28px;">
                Sua conta foi criada com sucesso! Agora você tem acesso ao nosso sistema online para agendar treinos, acompanhar seu histórico e gerenciar seu plano — tanto na <strong style="color:#222;">Just CT</strong> quanto no <strong style="color:#222;">JustClub</strong>.
              </div>

              <div style="background:#111;border-radius:12px;padding:22px 24px;margin-bottom:26px;">
                <div style="font-size:10px;font-weight:700;color:#ff2d9b;text-transform:uppercase;letter-spacing:2px;margin-bottom:16px;">Seus dados de acesso</div>
                <div style="margin-bottom:14px;">
                  <div style="font-size:10px;color:#777;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Email</div>
                  <div style="font-size:15px;color:#ffffff;font-family:monospace;">${cliente.email}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:#777;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Senha provisória</div>
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
                <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Troque sua senha no primeiro acesso</div>
                <div style="font-size:13px;color:#78350f;line-height:1.6;">Acesse <strong>Minha Conta</strong> no menu e cadastre uma senha pessoal. A senha provisória acima é temporária.</div>
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

    const { data: emailData, error: errEmail } = await resend.emails.send({
      from: REMETENTE,
      to: cliente.email,
      subject: `Bem-vindo ao Just Club & CT — Seus dados de acesso`,
      html,
    })

    if (errEmail) {
      console.error('Erro ao enviar email:', errEmail)
      return NextResponse.json({
        sucesso_parcial: true,
        senha_provisoria: senhaProvisoria,
        aviso: 'Acesso criado, mas o email não pôde ser enviado. Anote a senha e passe ao cliente manualmente.',
        erro_email: errEmail.message,
      })
    }

    return NextResponse.json({
      sucesso: true,
      email_enviado: true,
      destinatario: cliente.email,
      email_id: emailData?.id,
    })

  } catch (e: any) {
    console.error('Erro na route /api/criar-acesso-cliente:', e)
    return NextResponse.json({
      error: 'Erro interno: ' + (e.message || 'desconhecido')
    }, { status: 500 })
  }
}
