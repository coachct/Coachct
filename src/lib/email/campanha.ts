// --- Arte do e-mail de campanha ---------------------------------------------
// HTML de e-mail é outro mundo: nada de flexbox, grid ou fonte do Google.
// Gmail, Outlook e o app do iPhone renderizam cada um do seu jeito, então aqui
// é tabela, estilo inline e fonte do sistema — feio de escrever, mas é o que
// chega igual em todo lugar.
//
// A arte segue a mesma da campanha no site: fundo preto, rosa #ff2d9b, o
// "SUMMER MODE: ON" com o toggle e os dois pacotes.

const ACCENT = '#ff2d9b'
const FUNDO  = '#080808'
const CARD   = '#111111'

// Bebas Neue não existe em e-mail. Impact/Haettenschweiler é o que mais chega
// perto do condensado da arte, com Arial Black de rede de segurança.
const TITULO_FONT = "'Haettenschweiler','Arial Narrow Bold',Impact,'Arial Black',Arial,sans-serif"
const TEXTO_FONT  = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"

export type DadosEmailCampanha = {
  /** Link de destino, já com os utm da campanha. */
  link: string
  /** URL de descadastro específica desta pessoa. */
  linkDescadastro: string
  /** Primeiro nome, quando existir. */
  nome?: string
}

/** Só o primeiro nome, capitalizado. "" quando não dá pra usar. */
export function primeiroNome(nome?: string | null): string {
  const n = (nome || '').trim().split(/\s+/)[0] || ''
  if (!n) return ''
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

// Frase do Ricardo (08/09). O nome entra na frente quando o cadastro tem nome.
const FRASE = 'o verão não começa apenas em dezembro, começa agora e fica melhor em Dezembro.'

/** Versão em texto puro. Cliente que bloqueia HTML ainda entende o recado. */
export function textoEmailCampanha(d: DadosEmailCampanha): string {
  const abertura = d.nome ? `${d.nome}, ${FRASE}` : FRASE.charAt(0).toUpperCase() + FRASE.slice(1)
  return [
    'SUMMER MODE: ON — 100 DAYS TO GO',
    '',
    abertura,
    '',
    'Treinos a partir de R$ 33,30, pra usar em qualquer JustClub e na musculação',
    'livre do Just CT, com validade até 31/03/2027.',
    '',
    '30 TREINOS — R$ 999, ou 3x de R$ 333. Ganha +5 de bônus.',
    '15 TREINOS — R$ 599, ou 3x de R$ 199,67. Ganha +3 de bônus.',
    'Em até 3x no cartão. Os créditos entram na hora, todos de uma vez.',
    '',
    `Saiba mais: ${d.link}`,
    '',
    'Completou o pacote até 31/12? A gente credita o bônus em 02/01/2027.',
    '',
    '---',
    `Não quer mais receber novidades? ${d.linkDescadastro}`,
  ].join('\n')
}

export function htmlEmailCampanha(d: DadosEmailCampanha): string {
  const abertura = d.nome ? `${d.nome}, ${FRASE}` : FRASE.charAt(0).toUpperCase() + FRASE.slice(1)

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Summer Mode: ON</title>
</head>
<body style="margin:0;padding:0;background:${FUNDO};">
  <!-- Prévia que aparece na lista do Gmail, antes de abrir -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Treinos a partir de R$ 33,30 pra dar início ao seu projeto verão. Até 30/09.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FUNDO};">
    <tr>
      <td align="center" style="padding:28px 14px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${CARD};border:1px solid ${ACCENT}55;border-radius:20px;">
          <tr>
            <td style="padding:36px 30px;text-align:center;">

              <div style="font-family:${TEXTO_FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${ACCENT};margin-bottom:22px;">
                // dia do cliente &middot; 08.09 &rarr; 30.09
              </div>

              <div style="font-family:${TITULO_FONT};font-size:46px;line-height:1;letter-spacing:1px;color:#ffffff;text-transform:uppercase;">
                Summer Mode:
              </div>

              <!-- Toggle desenhado com tabela: é a única forma que o Outlook aceita -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:14px auto 10px;">
                <tr>
                  <td style="font-family:${TEXTO_FONT};font-size:11px;letter-spacing:2px;color:#555555;padding-right:10px;">OFF</td>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${ACCENT};border-radius:22px;">
                      <tr>
                        <td width="26" style="font-size:0;line-height:0;">&nbsp;</td>
                        <td style="padding:5px 5px 5px 0;font-size:0;line-height:0;">
                          <div style="width:34px;height:34px;background:#ffffff;border-radius:50%;"></div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="font-family:${TITULO_FONT};font-size:46px;line-height:1;color:${ACCENT};padding-left:10px;">ON</td>
                </tr>
              </table>

              <div style="font-family:${TEXTO_FONT};font-size:16px;font-weight:bold;letter-spacing:5px;color:#ffffff;margin:16px 0 26px;">
                100 DAYS TO GO
              </div>

              <div style="font-family:${TITULO_FONT};font-size:28px;line-height:1.2;color:${ACCENT};text-transform:uppercase;">
                Treinos a partir de R$ 33,30
              </div>
              <div style="font-family:${TITULO_FONT};font-size:24px;line-height:1.25;color:#ffffff;text-transform:uppercase;margin-bottom:26px;">
                Pra dar início ao seu projeto verão.
              </div>

              <p style="margin:0 0 26px;font-family:${TEXTO_FONT};font-size:16px;line-height:1.6;color:#cccccc;">
                ${abertura}
              </p>

              <!-- OS DOIS PACOTES, antes do botão e com destaque. Empilhados
                   em vez de lado a lado: a maioria abre no celular, e duas
                   colunas num card de 560px espremem o preço. -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;background:#1a0a14;border:2px solid ${ACCENT};border-radius:16px;">
                <tr>
                  <td style="padding:22px 24px;text-align:left;">
                    <div style="font-family:${TEXTO_FONT};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${ACCENT};font-weight:bold;margin-bottom:8px;">
                      Projeto inteiro
                    </div>
                    <div style="font-family:${TITULO_FONT};font-size:44px;line-height:1;color:#ffffff;text-transform:uppercase;">
                      30 <span style="font-size:24px;">treinos</span>
                    </div>
                    <div style="font-family:${TITULO_FONT};font-size:36px;line-height:1.2;color:#ffffff;margin-top:10px;">
                      R$ 999
                    </div>
                    <div style="font-family:${TEXTO_FONT};font-size:13px;color:#aaaaaa;margin-top:2px;">
                      ou 3x de R$ 333 &middot; R$ 33,30 por treino
                    </div>
                    <div style="font-family:${TEXTO_FONT};font-size:14px;font-weight:bold;color:${ACCENT};margin-top:12px;">
                      Completou até 31/12? Ganha +5.
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:26px;background:#141414;border:1px solid #2a2a2a;border-radius:16px;">
                <tr>
                  <td style="padding:22px 24px;text-align:left;">
                    <div style="font-family:${TEXTO_FONT};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888888;font-weight:bold;margin-bottom:8px;">
                      Pra dar um gás extra
                    </div>
                    <div style="font-family:${TITULO_FONT};font-size:44px;line-height:1;color:#ffffff;text-transform:uppercase;">
                      15 <span style="font-size:24px;">treinos</span>
                    </div>
                    <div style="font-family:${TITULO_FONT};font-size:36px;line-height:1.2;color:#ffffff;margin-top:10px;">
                      R$ 599
                    </div>
                    <div style="font-family:${TEXTO_FONT};font-size:13px;color:#aaaaaa;margin-top:2px;">
                      ou 3x de R$ 199,67 &middot; R$ 39,93 por treino
                    </div>
                    <div style="font-family:${TEXTO_FONT};font-size:14px;font-weight:bold;color:${ACCENT};margin-top:12px;">
                      Completou até 31/12? Ganha +3.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Botão: tabela + href, porque <button> não clica em e-mail -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px;">
                <tr>
                  <td style="background:${ACCENT};border-radius:10px;">
                    <a href="${d.link}" style="display:inline-block;padding:17px 52px;font-family:${TEXTO_FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:.5px;">
                      SAIBA MAIS &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <div style="font-family:${TEXTO_FONT};font-size:13px;color:#777777;margin-bottom:22px;">
                Em até 3x no cartão. Os créditos entram na hora, todos de uma vez.
              </div>

              <div style="padding:14px 16px;background:#141414;border-radius:12px;font-family:${TEXTO_FONT};font-size:13px;line-height:1.7;color:#bbbbbb;">
                Completou o pacote até <strong style="color:#ffffff;">31/12</strong>?
                A gente credita o bônus em 02/01/2027, válido até 31/03/2027.
              </div>

            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:22px 12px;text-align:center;font-family:${TEXTO_FONT};font-size:12px;line-height:1.7;color:#666666;">
              Just Club &amp; CT &middot; São Paulo<br>
              Só o titular usa &middot; uma reserva por treino &middot; não vale para Coach CT personal &middot; um de cada por CPF<br>
              <a href="${d.linkDescadastro}" style="color:#888888;text-decoration:underline;">Não quero mais receber novidades</a>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}
