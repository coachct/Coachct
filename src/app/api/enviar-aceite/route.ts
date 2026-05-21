import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const REMETENTE = 'Just CT <nao-responda@justct.com.br>'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://coach-ct.vercel.app'

export async function POST(req: NextRequest) {
  try {
    const { cliente_plano_id } = await req.json()

    if (!cliente_plano_id) {
      return NextResponse.json({ error: 'cliente_plano_id é obrigatório' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY não configurada')
      return NextResponse.json({ error: 'Email não configurado no servidor' }, { status: 500 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY não configurada')
      return NextResponse.json({ error: 'Acesso ao banco não configurado' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: cp, error: errCp } = await supabase
      .from('cliente_planos')
      .select(`
        id,
        token_aceite,
        token_expira_em,
        aceite_pendente,
        cliente:clientes (id, nome, email),
        plano:plano_id (nome, tipo)
      `)
      .eq('id', cliente_plano_id)
      .maybeSingle()

    if (errCp || !cp) {
      console.error('Erro ao buscar cliente_plano:', errCp)
      return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 })
    }

    if (!cp.aceite_pendente || !cp.token_aceite) {
      return NextResponse.json({ error: 'Este plano não está aguardando aceite' }, { status: 400 })
    }

    const cliente = cp.cliente as any
    const plano = cp.plano as any

    if (!cliente?.email) {
      return NextResponse.json({ error: 'Cliente sem email cadastrado' }, { status: 400 })
    }

    const linkAceite = `${BASE_URL}/aceite-termo?token=${cp.token_aceite}`
    const expiraEm = cp.token_expira_em
      ? new Date(cp.token_expira_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      : '7 dias'

    const nomePlano = plano?.nome || 'Plano Wellhub/TotalPass'
    const tipoApp = plano?.tipo === 'totalpass' ? 'TotalPass' : 'Wellhub'
    const primeiroNome = (cliente.nome || '').split(' ')[0]

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Termo de Adesão — Just CT</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;color:#222;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 100%);padding:40px 32px;text-align:center;">
              <div style="font-family:'Bebas Neue',Impact,sans-serif;font-size:36px;color:#ffffff;letter-spacing:4px;font-weight:700;">
                JUST<span style="color:#ff2d9b;">CT</span>
              </div>
              <div style="font-size:11px;color:#ff2d9b;letter-spacing:3px;margin-top:8px;text-transform:uppercase;">
                // termo de adesão
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;">
              <div style="font-size:18px;font-weight:600;color:#222;margin-bottom:16px;">
                Olá, ${primeiroNome}! 👋
              </div>
              <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:24px;">
                Sua recepção da Just CT acaba de ativar seu plano <strong style="color:#222;">${nomePlano}</strong> via ${tipoApp}.
              </div>
              <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:32px;">
                Para começar a usar suas sessões Coach CT, precisamos que você leia e aceite digitalmente o nosso Termo de Adesão. É rapidinho!
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 32px;">
                <tr>
                  <td align="center" style="background-color:#ff2d9b;border-radius:10px;">
                    <a href="${linkAceite}" target="_blank" style="display:inline-block;padding:16px 36px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">
                      Ler e aceitar o termo
                    </a>
                  </td>
                </tr>
              </table>
              <div style="background-color:#fef3f8;border:1px solid #ffd0e6;border-radius:12px;padding:20px;margin-bottom:24px;">
                <div style="font-size:13px;font-weight:700;color:#ff2d9b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                  ⏰ Importante
                </div>
                <div style="font-size:13px;line-height:1.6;color:#666;">
                  Este link é exclusivo e válido até <strong style="color:#222;">${expiraEm}</strong>. Após o aceite, suas sessões mensais serão liberadas automaticamente para agendamento.
                </div>
              </div>
              <div style="font-size:13px;line-height:1.6;color:#888;margin-bottom:8px;">
                Se o botão acima não funcionar, copie e cole este link no seu navegador:
              </div>
              <div style="font-size:12px;line-height:1.5;color:#666;word-break:break-all;background-color:#f8f8f8;padding:12px;border-radius:8px;font-family:monospace;">
                ${linkAceite}
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#0a0a0a;padding:24px 32px;text-align:center;">
              <div style="font-size:11px;color:#666;line-height:1.6;letter-spacing:0.5px;">
                Just CT — Serious Training<br/>
                Rua Fiandeiras, 392 · Vila Olímpia · São Paulo/SP
              </div>
              <div style="font-size:10px;color:#444;margin-top:16px;line-height:1.5;">
                Este é um email automático. Se precisar de ajuda, entre em contato com a recepção.
              </div>
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

    const { data, error } = await resend.emails.send({
      from: REMETENTE,
      to: cliente.email,
      subject: `Aceite seu Termo de Adesão — Just CT (${tipoApp})`,
      html,
    })

    if (error) {
      console.error('Erro do Resend:', error)
      return NextResponse.json({
        error: 'Erro ao enviar email: ' + (error.message || 'desconhecido'),
      }, { status: 500 })
    }

    return NextResponse.json({
      sucesso: true,
      email_id: data?.id,
      destinatario: cliente.email,
    })

  } catch (e: any) {
    console.error('Erro na route /api/enviar-aceite:', e)
    return NextResponse.json({
      error: 'Erro interno: ' + (e.message || 'desconhecido'),
    }, { status: 500 })
  }
}
