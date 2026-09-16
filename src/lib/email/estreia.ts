// --- E-mail de feedback de estreia (48h) -------------------------------------
// Sai dois dias depois da PRIMEIRA presença no Club. Não é e-mail de "saudades":
// a pessoa treinou anteontem e ainda está sentindo. A dor de pico é entre 24 e
// 48h — passou disso, a piada morre.
//
// Mesmas restrições de HTML de e-mail do campanha.ts: tabela, estilo inline,
// fonte de sistema, nada de flex/grid/Google Fonts.
//
// Aqui NÃO dá pra reusar o htmlEmailCampanha: lá é um HTML só pra fila inteira,
// aqui cada e-mail muda de abertura (grupo muscular do dia), de contexto (dia,
// horário, coach, unidade) e de fechamento (modalidade oposta × período).

const ACCENT = '#ff2d9b'
const FUNDO  = '#080808'
const CARD   = '#111111'

const TITULO_FONT = "'Haettenschweiler','Arial Narrow Bold',Impact,'Arial Black',Arial,sans-serif"
const TEXTO_FONT  = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"

export type Modalidade = 'running' | 'lift'
export type Periodo = 'fds' | 'semana'

export type DadosEmailEstreia = {
  /** Primeiro nome, quando existir. */
  nome?: string
  modalidade: Modalidade
  /** grupos_musculares.nome da aula. Nulo cai no texto de Full Body. */
  grupoMuscular?: string | null
  periodo: Periodo
  /** Dia da semana por extenso, minúsculo: "sábado". */
  diaSemana: string
  /** Horário já formatado: "10h", "18h30". */
  horario: string
  /** Primeiro nome do coach. Vazio tira o trecho "com a ..." da linha. */
  coachNome?: string | null
  /** 'f' | 'm' para o artigo. Nulo = sai sem artigo, nunca erra. */
  coachGenero?: 'f' | 'm' | null
  unidadeNome: string
  /** {BASE_URL}/feedback/{token} — as carinhas entram com ?n=1..5. */
  linkFeedback: string
  linkDescadastro: string
}

/** Só o primeiro nome, capitalizado. "" quando não dá pra usar. */
export function primeiroNomeEstreia(nome?: string | null): string {
  const n = (nome || '').trim().split(/\s+/)[0] || ''
  if (!n) return ''
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

// ── Assunto ──────────────────────────────────────────────────────────────────
// Sorteado entre as variantes da modalidade. Qual saiu não é guardado nesta fase.
const ASSUNTOS: Record<Modalidade, string[]> = {
  running: [
    'E aí, já consegue descer escada?',
    'Sobreviveu?',
    '48 horas depois. E aí?',
  ],
  lift: [
    'Os braços já voltaram ao normal?',
    'Sobreviveu?',
    'Isso aqui é mais curto que o aquecimento',
  ],
}

export function assuntoEmailEstreia(modalidade: Modalidade): string {
  const lista = ASSUNTOS[modalidade] || ASSUNTOS.lift
  return lista[Math.floor(Math.random() * lista.length)]
}

// ── Abertura, por grupo muscular ─────────────────────────────────────────────
// Mandar "como estão os braços" pra quem treinou inferiores queima o e-mail
// inteiro. grupo_muscular_id está 100% preenchido, mas grupo novo ou nulo cai
// no Full Body, que serve pra qualquer treino.
const FULL_BODY =
  'Dois dias atrás você fez seu primeiro treino com a gente. Full Body, ou seja: não sobrou muito lugar do corpo que não tenha uma opinião formada sobre nós.'

const ABERTURAS: Record<string, string> = {
  'Superiores':
    'Dois dias atrás você fez seu primeiro treino com a gente. Se lavar o cabelo hoje de manhã pareceu um projeto de médio prazo, é porque deu certo.',
  'Glúteos & Abs':
    'Faz dois dias. A essa altura, rir já não é de graça e escada virou assunto sério.',
  'Full Body': FULL_BODY,
  'HIIT & ABS':
    'Faz dois dias que você fez seu primeiro HIIT com a gente. Se tossir ainda é um evento, foi exatamente o combinado.',
  'HIIT & Full Body':
    'Dois dias atrás. HIIT e Full Body no mesmo treino — a gente sabe o que fez, e você também.',
}

// Inferiores muda de piada conforme a modalidade.
const INFERIORES_LIFT =
  'Faz dois dias que você fez seu primeiro Lift com a gente — e pelas nossas contas, hoje é o dia em que sentar virou uma decisão consciente.'
const INFERIORES_RUNNING =
  'Faz dois dias que você fez seu primeiro Running com a gente. A essa altura suas panturrilhas já formaram uma opinião a nosso respeito.'

function abertura(d: DadosEmailEstreia): string {
  const grupo = (d.grupoMuscular || '').trim()
  if (grupo === 'Inferiores') {
    return d.modalidade === 'running' ? INFERIORES_RUNNING : INFERIORES_LIFT
  }
  return ABERTURAS[grupo] || FULL_BODY
}

/** "sábado, 10h, com a Gracy — JustClub Vila Olímpia" */
function contexto(d: DadosEmailEstreia): string {
  const partes = [d.diaSemana, d.horario]
  const coach = (d.coachNome || '').trim()
  if (coach) {
    const artigo = d.coachGenero === 'f' ? 'a ' : d.coachGenero === 'm' ? 'o ' : ''
    partes.push(`com ${artigo}${coach}`)
  }
  return `${partes.join(', ')} — ${d.unidadeNome}`
}

// ── Fechamento: cross-sell da modalidade oposta ──────────────────────────────
// Quem correu é convidado pro Lift, quem fez Lift é convidado pro Running: quem
// faz as duas treina 11,0 vezes em dez semanas contra 3,3 de quem fica só numa.
//
// NUNCA o mesmo dia. Quem estreou no fds vai pro próximo fds (metade de quem
// volta só volta em fds, e a grade de semana não tem nenhum horário em comum
// com a de fds); quem estreou na semana vai pro mesmo horário em outro dia.
function fechamento(d: DadosEmailEstreia): string[] {
  if (d.modalidade === 'running') {
    return d.periodo === 'semana'
      ? [
          'Uma dica de quem já viu isso acontecer umas mil vezes: no mesmo horário em que você correu, em qualquer outro dia, na sala do lado rola o Lift.',
          'Mesmo horário. Outra sala. Outro tipo de cansaço. É onde entra a força — que é, convenhamos, o que segura a corrida em pé.',
          'Quem faz as duas coisas treina três vezes mais que quem fica só numa. A gente não sabe dizer se é causa ou consequência, mas que o pessoal some menos, some.',
        ]
      : [
          'Uma dica: no próximo fim de semana, logo depois do Running, rola o Lift — 10:15 e 11:15.',
          'Outra sala, outro tipo de cansaço, e é onde entra a força — que é, convenhamos, o que segura a corrida em pé. Quem faz as duas coisas treina três vezes mais que quem fica só numa.',
        ]
  }
  return d.periodo === 'semana'
    ? [
        'Uma dica: no mesmo horário em que você levantou peso, em qualquer outro dia, na sala do lado rola o Running.',
        'Mesmo horário. Outra sala. E um gasto calórico que o Lift, com todo respeito, não entrega. Quem faz as duas coisas treina três vezes mais que quem fica só numa. Faça disso o que quiser.',
      ]
    : [
        'Uma dica: no próximo fim de semana, antes do Lift, rola o Running — 09:00, 10:00 e 11:00.',
        'Outra sala, e um gasto calórico que o Lift, com todo respeito, não entrega. Quem faz as duas coisas treina três vezes mais que quem fica só numa.',
      ]
}

const CARINHAS = ['😖', '😕', '🙂', '😄', '🔥']

function linkNota(d: DadosEmailEstreia, n: number): string {
  const sep = d.linkFeedback.includes('?') ? '&' : '?'
  return `${d.linkFeedback}${sep}n=${n}`
}

/** Versão em texto puro. Cliente que bloqueia HTML ainda entende o recado. */
export function textoEmailEstreia(d: DadosEmailEstreia): string {
  const ola = d.nome ? `${d.nome}, ` : ''
  return [
    `${ola}${abertura(d)}`,
    '',
    contexto(d),
    '',
    'A gente queria saber qual foi.',
    '',
    'É um clique. Um só:',
    '',
    ...CARINHAS.map((c, i) => `${c}  ${linkNota(d, i + 1)}`),
    '',
    'Do outro lado tem mais uma perguntinha de múltipla escolha. Trinta segundos, no máximo.',
    '',
    'E sim, a gente lê tudo. Inclusive as respostas ruins — principalmente essas, na real.',
    '',
    ...fechamento(d),
    '',
    '---',
    'Just Club & CT',
    `Não quer mais receber novidades? ${d.linkDescadastro}`,
  ].join('\n')
}

export function htmlEmailEstreia(d: DadosEmailEstreia): string {
  const ola = d.nome ? `${d.nome}, ` : ''

  const carinhas = CARINHAS.map((c, i) => `
                  <td align="center" style="padding:0 4px;">
                    <a href="${linkNota(d, i + 1)}" style="display:inline-block;padding:10px 8px;font-size:30px;line-height:1;text-decoration:none;color:#ffffff;">${c}</a>
                  </td>`).join('')

  const blocoFechamento = fechamento(d).map(p => `
              <p style="margin:0 0 14px;font-family:${TEXTO_FONT};font-size:15px;line-height:1.7;color:#cccccc;">
                ${p}
              </p>`).join('')

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>E aí, sobreviveu?</title>
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
    Um clique só. Trinta segundos, no máximo.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FUNDO}" class="jc-fundo" style="background:${FUNDO};">
    <tr>
      <td align="center" style="padding:28px 14px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${CARD};border:1px solid ${ACCENT}55;border-radius:20px;">
          <tr>
            <td style="padding:34px 30px;text-align:left;">

              <p style="margin:0 0 10px;font-family:${TEXTO_FONT};font-size:16px;line-height:1.7;color:#e8e8e8;">
                ${ola}${abertura(d)}
              </p>

              <!-- A linha que prova que não é disparo em massa -->
              <p style="margin:0 0 26px;font-family:${TEXTO_FONT};font-size:14px;font-style:italic;color:${ACCENT};">
                ${contexto(d)}
              </p>

              <p style="margin:0 0 6px;font-family:${TEXTO_FONT};font-size:15px;line-height:1.7;color:#cccccc;">
                A gente queria saber qual foi.
              </p>
              <p style="margin:0 0 6px;font-family:${TEXTO_FONT};font-size:15px;line-height:1.7;color:#cccccc;">
                É um clique. Um só:
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:10px auto 18px;">
                <tr>${carinhas}
                </tr>
              </table>

              <p style="margin:0 0 14px;font-family:${TEXTO_FONT};font-size:15px;line-height:1.7;color:#cccccc;">
                Do outro lado tem mais uma perguntinha de múltipla escolha. Trinta segundos, no máximo.
              </p>
              <p style="margin:0 0 26px;font-family:${TEXTO_FONT};font-size:15px;line-height:1.7;color:#cccccc;">
                E sim, a gente lê tudo. Inclusive as respostas ruins — principalmente essas, na real.
              </p>

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
