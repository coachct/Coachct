// src/lib/email/templates.ts
//
// Shell visual + templates de email transacional da Just Club & CT.
// REGRA DE MARCA: o logo é SEMPRE "Just Club & CT" (CT em rosa #ff2d9b).
//
// Footer é dinâmico por unidade: usa unidades.endereco quando preenchido e
// cai para o mapa fixo abaixo (mesma fonte do agente de WhatsApp em
// conhecimento.ts e das telas agendar/aulas) quando o campo está vazio.

const ACCENT = '#ff2d9b'

const FALLBACK_ENDERECOS: Record<string, string> = {
  'Just CT': 'Rua Fiandeiras, 392 — Itaim Bibi, São Paulo',
  'JustClub Vila Olímpia': 'Av. Dr. Cardoso de Melo, 1337 — Vila Olímpia, São Paulo',
  'JustClub Pinheiros': 'Rua Deputado Lacerda Franco, 342 — Pinheiros, São Paulo',
}

/** Endereço da unidade para o footer (coluna do banco com fallback fixo por nome). */
export function enderecoUnidade(nome?: string | null, endereco?: string | null): string {
  const doBanco = (endereco || '').trim()
  if (doBanco) return doBanco
  return (nome && FALLBACK_ENDERECOS[nome]) || ''
}

/** Shell padrão de email (header com logo Just Club & CT, corpo e footer dinâmico). */
export function wrapEmail({
  conteudo,
  subject,
  endereco,
}: {
  conteudo: string
  subject: string
  endereco?: string
}): { subject: string; html: string } {
  const linhaEndereco = endereco ? `${endereco}<br/>` : ''
  return {
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
              Just Club &amp; <span style="color:${ACCENT};">CT</span>
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
              ${linhaEndereco}
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
  }
}

/**
 * Email de confirmação de reserva (Club) ou agendamento (Coach CT).
 * - Club: faixa = modalidade; mostra Posição apenas em Running + Funcional.
 * - CT:   faixa = "Personal · Coach CT"; mostra o Coach (sem posição).
 */
export function emailReservaConfirmada(p: {
  tipo: 'club' | 'ct'
  nomeCliente: string
  faixa: string
  data: string
  horario: string
  unidade: string
  endereco: string
  posicao?: string | null
  coach?: string | null
  baseUrl: string
}): { subject: string; html: string } {
  const primeiroNome = (p.nomeCliente || '').split(' ')[0] || 'cliente'

  const linha = (rotulo: string, valor: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#999;width:90px;vertical-align:top;">${rotulo}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#222;font-weight:600;">${valor}</td>
    </tr>`

  const linhas = [
    linha('Data', p.data),
    linha('Horário', p.horario),
    linha('Unidade', p.unidade),
  ]
  if (p.tipo === 'club' && p.posicao) linhas.push(linha('Posição', p.posicao))
  if (p.tipo === 'ct' && p.coach) linhas.push(linha('Coach', p.coach))

  const conteudo = `
    <div style="font-size:20px;font-weight:700;color:#222;margin-bottom:20px;">Reserva confirmada, ${primeiroNome}!</div>
    <div style="border:1px solid #eee;border-radius:14px;overflow:hidden;margin-bottom:24px;">
      <div style="background:${ACCENT};color:#fff;padding:12px 20px;font-size:14px;font-weight:700;letter-spacing:0.5px;">
        ${p.faixa}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding:4px 20px 12px;">
        ${linhas.join('')}
      </table>
    </div>
    <div style="background:#f9fafb;border:1px solid #eee;border-radius:12px;padding:14px 18px;margin-bottom:24px;">
      <div style="font-size:13px;color:#555;line-height:1.6;">
        Cancelamento gratuito até <strong>12h antes</strong> (ou 3h se houver fila). Falta sem aviso gera multa de R$49,90.
      </div>
    </div>
    <div style="text-align:center;">
      <a href="${p.baseUrl}/minha-conta" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.5px;">
        Ver meus agendamentos →
      </a>
    </div>`

  return wrapEmail({ conteudo, subject: '✅ Reserva confirmada — Just Club & CT', endereco: p.endereco })
}
