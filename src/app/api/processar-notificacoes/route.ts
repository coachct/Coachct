import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const REMETENTE = 'Just Club & CT <nao-responda@justct.com.br>'
const BASE_URL  = process.env.NEXT_PUBLIC_BASE_URL || 'https://coach-ct.vercel.app'

// Protege a rota com um segredo para evitar chamadas externas
const CRON_SECRET = process.env.CRON_SECRET || ''

// ── Templates de email por tipo ────────────────────────────────────────────
function gerarHtml(
  tipo: string, mensagem: string, nomeCliente: string,
  pronto?: { subject: string; conteudo: string },
  unidadeTipo?: string | null,
): { subject: string; html: string } {
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

  // ── Conteúdo já montado fora (ex.: compra confirmada, que lê a venda) ─────
  if (pronto) return wrapEmail(pronto.conteudo, pronto.subject)

  // ── Fila confirmada ──────────────────────────────────────────────────────
  if (tipo === 'fila_confirmada') {
    const conteudo = `
      <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:16px;">🎉 Você foi confirmado, ${primeiroNome}!</div>
      <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:24px;">${mensagem}</div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:6px;">✅ Agendamento confirmado</div>
        <div style="font-size:13px;color:#166534;line-height:1.6;">
          Cancelamento gratuito até <strong>12h antes</strong> (ou 3h se houver fila). Falta sem aviso gera multa de ${unidadeTipo === 'ct' ? 'R$99,00' : 'R$49,90'}.
        </div>
      </div>
      <div style="text-align:center;">
        <a href="${BASE_URL}/minha-conta" style="display:inline-block;background:#ff2d9b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.5px;">
          Ver meus agendamentos →
        </a>
      </div>`
    return wrapEmail(conteudo, `✅ Vaga confirmada — Just CT`)
  }

  // ── Aula cancelada (cancelamento pelo estúdio) ───────────────────────────
  if (tipo === 'aula_cancelada') {
    const conteudo = `
      <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:16px;">Olá, ${primeiroNome}</div>
      <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:24px;">${mensagem}</div>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:#9a3412;margin-bottom:6px;">📅 Aula cancelada</div>
        <div style="font-size:13px;color:#9a3412;line-height:1.6;">
          É só escolher um novo horário quando quiser. Qualquer dúvida sobre o seu crédito, fale com a recepção.
        </div>
      </div>
      <div style="text-align:center;">
        <a href="${BASE_URL}/aulas" style="display:inline-block;background:#ff2d9b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.5px;">
          Ver horários →
        </a>
      </div>`
    return wrapEmail(conteudo, `Aula cancelada — Just Club & CT`)
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

  // ── Resposta da equipe a uma avaliação de aula ───────────────────────────
  if (tipo === 'resposta_avaliacao') {
    // mensagem vem em JSON: { resposta, comentario_original, aula, data_aula, horario }
    let resposta = mensagem
    let comentarioOriginal: string | null = null
    let aula: string | null = null
    let dataAula: string | null = null
    let horario: string | null = null
    try {
      const p = JSON.parse(mensagem)
      resposta = p.resposta || mensagem
      comentarioOriginal = p.comentario_original || null
      aula = p.aula || null
      dataAula = p.data_aula || null
      horario = p.horario || null
    } catch { /* mensagem antiga/simples — usa o texto cru */ }

    const escapar = (s: string) => (s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>')

    const dataBR = dataAula ? dataAula.split('-').reverse().join('/') : null
    const refAula = [aula, dataBR, horario].filter(Boolean).join(' · ')

    const conteudo = `
      <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:8px;">Olá, ${primeiroNome} 👋</div>
      <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:20px;">
        Recebemos o seu comentário na avaliação${refAula ? ` da sua aula (<strong>${escapar(refAula)}</strong>)` : ' de aula'} e queremos responder:
      </div>
      ${comentarioOriginal ? `
      <div style="border-left:3px solid #e5e5e5;padding:4px 0 4px 14px;margin-bottom:20px;color:#888;font-size:14px;line-height:1.6;font-style:italic;">
        “${escapar(comentarioOriginal)}”
      </div>` : ''}
      <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:12px;font-weight:700;color:#9d174d;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Resposta da equipe Just</div>
        <div style="font-size:15px;color:#333;line-height:1.7;">${escapar(resposta)}</div>
      </div>
      <div style="font-size:14px;line-height:1.7;color:#666;">
        Obrigado por nos ajudar a melhorar cada vez mais. Qualquer coisa, é só falar com a recepção. 💪
      </div>`
    return wrapEmail(conteudo, `Resposta ao seu comentário — Just Club & CT`)
  }

  // ── Genérico (fallback) ──────────────────────────────────────────────────
  const conteudo = `
    <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:16px;">Olá, ${primeiroNome}</div>
    <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:24px;">${mensagem}</div>`
  return wrapEmail(conteudo, `Aviso — Just CT`)
}

// ── Compra confirmada ───────────────────────────────────────────────────────
// A notificação guarda só o venda_id (gatilho trg_email_compra). Aqui lemos a
// venda e o que ela gerou (créditos ou plano) pra mostrar a validade real.
// Devolve null quando a venda foi excluída antes do envio.
const FORMAS: Record<string, string> = {
  cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  pix: 'PIX', cortesia: 'Cortesia', dinheiro: 'Dinheiro',
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) -
              Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86400000)
const somaDias = (iso: string, dias: number) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + dias))
  return d.toISOString().slice(0, 10)
}
const escaparHtml = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function montarEmailCompra(supabase: any, vendaId: string, nomeCliente: string) {
  const { data: venda } = await supabase
    .from('vendas')
    .select('id, quantidade, valor_total, forma_pagamento, vendido_em, excluido_em, produtos(nome, subtipo, dias_validade, validade_fixa, creditos_por_venda, plano_id)')
    .eq('id', vendaId)
    .maybeSingle()
  if (!venda || venda.excluido_em) return null

  const prod = venda.produtos || {}
  const subtipo: string | null = prod.subtipo ?? null
  const qtd = Number(venda.quantidade) || 1
  // Data da compra no fuso de São Paulo (YYYY-MM-DD)
  const dataCompra = new Date(venda.vendido_em).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  let creditos: string | null = null
  let validade: string | null = null
  let expiraCredito = false

  if (subtipo === 'credito' || subtipo === 'pacote' || subtipo === null) {
    const n = qtd * (Number(prod.creditos_por_venda) || 1)
    creditos = `${n} ${n === 1 ? 'treino' : 'treinos'}`
    expiraCredito = true
    const { data: cred } = await supabase
      .from('creditos_avulsos').select('validade').eq('venda_id', vendaId)
      .order('validade', { ascending: true }).limit(1).maybeSingle()
    const ate: string | null = cred?.validade
      || prod.validade_fixa
      || (prod.dias_validade ? somaDias(dataCompra, Number(prod.dias_validade)) : null)
    if (ate) {
      const dias = prod.validade_fixa ? diasEntre(dataCompra, ate) : Number(prod.dias_validade) || diasEntre(dataCompra, ate)
      validade = `${dias} ${dias === 1 ? 'dia' : 'dias'}, até <strong>${dataBR(ate)}</strong>`
    }
  } else if (subtipo === 'ilimitado_club') {
    creditos = 'Ilimitado'
    const meses = Math.max(1, Math.round((Number(prod.dias_validade) || 180) / 30))
    const { data: ass } = await supabase
      .from('assinaturas_ilimitado_club').select('data_inicio').eq('venda_id', vendaId).maybeSingle()
    const inicio: string = ass?.data_inicio || dataCompra
    const dias = meses * 30
    validade = `Plano válido de ${dataBR(inicio)} até <strong>${dataBR(somaDias(inicio, dias))}</strong> (${dias} dias)`
  } else if (subtipo === 'acesso' || subtipo === 'coach_ct_pro') {
    const { data: cp } = await supabase
      .from('cliente_planos').select('inicio, fim').eq('venda_id', vendaId).maybeSingle()
    if (cp?.inicio && cp?.fim) {
      validade = `Plano válido de ${dataBR(cp.inicio)} até <strong>${dataBR(cp.fim)}</strong> (${diasEntre(cp.inicio, cp.fim)} dias)`
    }
    if (subtipo === 'coach_ct_pro' && prod.plano_id) {
      const { data: plano } = await supabase
        .from('planos_disponiveis').select('total_creditos').eq('id', prod.plano_id).maybeSingle()
      if (plano?.total_creditos) {
        creditos = `${plano.total_creditos} treinos`
        expiraCredito = true
      }
    }
  }

  // Parcelas só existem na compra pelo site (pagamentos_pendentes)
  let parcelas = 1
  const { data: pp } = await supabase
    .from('pagamentos_pendentes').select('parcelas').eq('venda_id', vendaId).limit(1).maybeSingle()
  if (pp?.parcelas) parcelas = Number(pp.parcelas) || 1

  const forma = venda.forma_pagamento === 'cortesia'
    ? 'Cortesia'
    : `${brl(Number(venda.valor_total) || 0)} · ${FORMAS[venda.forma_pagamento] || venda.forma_pagamento}${parcelas > 1 ? ` ${parcelas}x` : ''}`

  const primeiroNome = escaparHtml((nomeCliente || '').split(' ')[0] || 'cliente')
  const nomeProduto = escaparHtml(prod.nome || 'Sua compra')
  const linha = (rotulo: string, valor: string) => `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#888;width:130px;vertical-align:top;">${rotulo}</td>
          <td style="padding:6px 0;font-size:14px;color:#222;">${valor}</td>
        </tr>`

  const conteudo = `
      <div style="font-size:18px;font-weight:700;color:#222;margin-bottom:12px;">Obrigado pela compra, ${primeiroNome}!</div>
      <div style="font-size:15px;line-height:1.7;color:#444;margin-bottom:24px;">
        Sua compra foi confirmada e ${creditos ? 'os créditos já estão disponíveis' : 'o plano já está ativo'} na sua conta.
      </div>
      <div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
        <div style="font-size:12px;font-weight:700;color:#ff2d9b;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Resumo da compra</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${linha('Produto', `<strong>${nomeProduto}</strong>`)}
          ${creditos ? linha('Créditos', creditos) : ''}
          ${linha('Valor', forma)}
          ${linha('Data da compra', dataBR(dataCompra))}
          ${validade ? linha('Validade', validade) : ''}
        </table>
      </div>
      ${expiraCredito ? `
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:#9a3412;line-height:1.6;">
        ⚠️ Créditos não usados até a data de validade expiram.
      </div>` : ''}
      <div style="text-align:center;">
        <a href="${BASE_URL}/agendar" style="display:inline-block;background:#ff2d9b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.5px;">
          Agendar meu treino →
        </a>
      </div>`

  return { subject: `✅ Compra confirmada: ${prod.nome || 'Just Club & CT'}`, conteudo }
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

  // Tipo da unidade (ct | club) — define o valor da multa no e-mail da fila
  const { data: unidades } = await supabase.from('unidades').select('id, tipo')
  const unidadeTipoMap: Record<string, string> = {}
  for (const u of (unidades || [])) unidadeTipoMap[u.id] = u.tipo

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

    let pronto: { subject: string; conteudo: string } | undefined
    if (notif.tipo === 'compra_confirmada') {
      const compra = await montarEmailCompra(supabase, notif.mensagem, cliente.nome)
      if (!compra) {
        await marcar(notif.id, { status: 'cancelado', erro: 'Venda excluída antes do envio', enviado_em: new Date().toISOString() })
        continue
      }
      pronto = compra
    }

    const { subject, html } = gerarHtml(notif.tipo, notif.mensagem, cliente.nome, pronto, notif.unidade_id ? unidadeTipoMap[notif.unidade_id] : null)

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
