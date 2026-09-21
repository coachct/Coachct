// --- E-mail de carrinho abandonado -------------------------------------------
// Sai algumas horas depois de alguém abrir o checkout e não comprar. Não é
// e-mail de promoção: a pessoa já tinha escolhido o produto e parou no meio.
//
// O texto muda conforme ATÉ ONDE a pessoa chegou — mandar "esqueceu de
// finalizar?" pra quem teve o cartão recusado é dar murro em ponta de faca.
//
// Mesmas restrições de HTML de e-mail do campanha.ts/estreia.ts: tabela, estilo
// inline, fonte de sistema, nada de flex/grid/Google Fonts.
//
// SEM urgência falsa: nada de "últimas vagas", "só hoje" ou contagem regressiva
// que a gente não vai cumprir.

const ACCENT = '#ff2d9b'
const FUNDO = '#080808'
const CARD = '#111111'

const TITULO_FONT = "'Haettenschweiler','Arial Narrow Bold',Impact,'Arial Black',Arial,sans-serif"
const TEXTO_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"

export type EtapaCarrinho = 'abriu' | 'pix_nao_pago' | 'cartao_recusado'

export type DadosEmailCarrinho = {
  /** Primeiro nome, quando existir. */
  nome?: string
  etapa: EtapaCarrinho
  /** Nome do produto exatamente como está no catálogo. */
  produtoNome: string
  /** Valor em reais. */
  valor: number
  /** Nome da unidade, quando o produto tem uma. */
  unidadeNome?: string | null
  /** Volta direto pro checkout daquele produto. */
  linkCheckout: string
  linkDescadastro: string
}

/** Só o primeiro nome, capitalizado. "" quando não dá pra usar. */
export function primeiroNomeCarrinho(nome?: string | null): string {
  const n = (nome || '').trim().split(/\s+/)[0] || ''
  if (!n) return ''
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

/** "R$ 64,90" */
export function valorBonito(v: number): string {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
}

// ── Assunto, por etapa ───────────────────────────────────────────────────────
// Sorteado entre as variantes. Qual saiu não é guardado nesta fase.
const ASSUNTOS: Record<EtapaCarrinho, string[]> = {
  abriu: [
    'Você parou bem no finalzinho',
    'Ficou pela metade',
    'Seu treino está esperando na tela de pagamento',
  ],
  pix_nao_pago: [
    'Seu Pix não chegou aqui',
    'O Pix foi gerado e sumiu',
    'Ficou um Pix em aberto',
  ],
  cartao_recusado: [
    'Não foi você — foi o cartão',
    'O cartão não passou (acontece)',
    'Deu ruim no pagamento. Bora de novo?',
  ],
}

export function assuntoEmailCarrinho(etapa: EtapaCarrinho): string {
  const lista = ASSUNTOS[etapa] || ASSUNTOS.abriu
  return lista[Math.floor(Math.random() * lista.length)]
}

// ── Abertura, por etapa ──────────────────────────────────────────────────────
const ABERTURAS: Record<EtapaCarrinho, string> = {
  abriu:
    'Você abriu a tela de pagamento, olhou pra ela e fechou. A gente entende: até aí tudo bem, isso acontece com todo mundo.',
  pix_nao_pago:
    'O Pix foi gerado, mas não caiu aqui. Na maioria das vezes é só a tela que foi fechada antes de pagar.',
  cartao_recusado:
    'O cartão não passou. Antes que você pense que foi algo do seu lado: na maior parte das vezes é o banco travando compra nova por precaução — e não tem nada a ver com limite.',
}

// ── Fechamento, por etapa ────────────────────────────────────────────────────
const FECHAMENTOS: Record<EtapaCarrinho, string[]> = {
  abriu: [
    'Se a dúvida for sobre qual plano faz mais sentido pra você, responde esse e-mail que a gente resolve em duas linhas.',
  ],
  pix_nao_pago: [
    'O Pix antigo provavelmente já expirou — o link acima gera um novo, é rápido.',
    'Se travou em alguma parte, responde esse e-mail contando onde. A gente conserta.',
  ],
  cartao_recusado: [
    'Vale tentar de novo, com outro cartão ou no Pix. Se recusar outra vez, responde esse e-mail que a gente te ajuda a fechar por aqui.',
  ],
}

/** "Treino Avulso · R$ 64,90 · Just CT" */
function contexto(d: DadosEmailCarrinho): string {
  const partes = [d.produtoNome, valorBonito(d.valor)]
  const unidade = (d.unidadeNome || '').trim()
  if (unidade) partes.push(unidade)
  return partes.join(' · ')
}

const TEXTO_BOTAO: Record<EtapaCarrinho, string> = {
  abriu: 'Terminar a compra',
  pix_nao_pago: 'Gerar um novo Pix',
  cartao_recusado: 'Tentar de novo',
}

/** Versão em texto puro. Cliente que bloqueia HTML ainda entende o recado. */
export function textoEmailCarrinho(d: DadosEmailCarrinho): string {
  const ola = d.nome ? `${d.nome}, ` : ''
  const abertura = ABERTURAS[d.etapa] || ABERTURAS.abriu
  return [
    `${ola}${abertura.charAt(0).toLowerCase()}${abertura.slice(1)}`,
    '',
    contexto(d),
    '',
    `${TEXTO_BOTAO[d.etapa] || TEXTO_BOTAO.abriu}: ${d.linkCheckout}`,
    '',
    ...(FECHAMENTOS[d.etapa] || FECHAMENTOS.abriu),
    '',
    '---',
    'Just Club & CT',
    `Não quer mais receber novidades? ${d.linkDescadastro}`,
  ].join('\n')
}

export function htmlEmailCarrinho(d: DadosEmailCarrinho): string {
  const ola = d.nome ? `${d.nome}, ` : ''
  const abertura = ABERTURAS[d.etapa] || ABERTURAS.abriu
  const aberturaTexto = d.nome
    ? `${abertura.charAt(0).toLowerCase()}${abertura.slice(1)}`
    : abertura

  const blocoFechamento = (FECHAMENTOS[d.etapa] || FECHAMENTOS.abriu)
    .map(
      p => `
              <p style="margin:0 0 14px;font-family:${TEXTO_FONT};font-size:15px;line-height:1.7;color:#cccccc;">
                ${p}
              </p>`,
    )
    .join('')

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ficou pela metade</title>
<!-- Sem isto o Gmail INVERTE e-mail de fundo escuro achando que ajuda. -->
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  [data-ogsc] .jc-fundo { background: ${FUNDO} !important; }
  [data-ogsc] .jc-branco { color: #ffffff !important; }
  [data-ogsc] .jc-rosa  { color: ${ACCENT} !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${FUNDO};">
  <!-- Prévia que aparece na lista do Gmail, antes de abrir -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${contexto(d)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FUNDO}" class="jc-fundo" style="background:${FUNDO};">
    <tr>
      <td align="center" style="padding:28px 14px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${CARD};border:1px solid ${ACCENT}55;border-radius:20px;">
          <tr>
            <td style="padding:34px 30px;text-align:left;">

              <p style="margin:0 0 10px;font-family:${TEXTO_FONT};font-size:16px;line-height:1.7;color:#e8e8e8;">
                ${ola}${aberturaTexto}
              </p>

              <!-- A linha que prova que não é disparo em massa -->
              <p style="margin:0 0 26px;font-family:${TEXTO_FONT};font-size:14px;font-style:italic;color:${ACCENT};">
                ${contexto(d)}
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 24px;">
                <tr>
                  <td align="center" bgcolor="${ACCENT}" style="border-radius:999px;">
                    <a href="${d.linkCheckout}" style="display:inline-block;padding:14px 30px;font-family:${TEXTO_FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      ${TEXTO_BOTAO[d.etapa] || TEXTO_BOTAO.abriu}
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;">
                <tr><td style="border-top:1px solid #262626;font-size:0;line-height:0;padding-top:22px;">&nbsp;</td></tr>
              </table>
${blocoFechamento}

            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:22px 12px;text-align:center;font-family:${TEXTO_FONT};font-size:12px;line-height:1.8;color:#666666;">
              <span class="jc-branco" style="font-family:${TITULO_FONT};font-size:20px;letter-spacing:1px;color:#ffffff;text-transform:uppercase;">
                Just Club &amp; <span class="jc-rosa" style="color:${ACCENT};">CT</span>
              </span><br>
              São Paulo<br>
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
