import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// TAXA FORA DO PRAZO — o cliente paga R$ 29,90 e cancela/troca onde hoje é bloqueado.
// Regras e travas vivem no banco (supabase/taxa-flex.sql). Esta rota só orquestra:
//   1. simula a ação (nada gravado) — se não pode, nem cobra
//   2. cobra no cartão (salvo, ou um cartão novo usado só nesta cobrança)
//   3. executa a ação de verdade
//   4. se a ação falhar DEPOIS de cobrar (vaga sumiu, prazo passou) → estorna na hora
// Cartão recusado NÃO gera pendência nem bloqueio: a reserva fica como estava.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PAGARME_API_URL = 'https://api.pagar.me/core/v5'
const PAGARME_API_KEY = process.env.PAGARME_API_KEY!

function getAuthHeader() {
  return `Basic ${Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')}`
}

function cpfValido(valor: string): boolean {
  const c = (valor || '').replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(c[i]) * (10 - i)
  let d1 = (soma * 10) % 11
  if (d1 === 10) d1 = 0
  if (d1 !== parseInt(c[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(c[i]) * (11 - i)
  let d2 = (soma * 10) % 11
  if (d2 === 10) d2 = 0
  return d2 === parseInt(c[10])
}

function telValido(valor: string): boolean {
  const t = (valor || '').replace(/\D/g, '')
  return t.length >= 10 && t.length <= 11
}

function montarPhones(telLimpo: string) {
  return { mobile_phone: { country_code: '55', area_code: telLimpo.slice(0, 2), number: telLimpo.slice(2) } }
}

// O que o cliente lê quando a ação não pode acontecer.
function traduzir(m: string): string {
  if (m.includes('CANCELAMENTO_GRATUITO')) return 'Esse cancelamento é gratuito. Feche e cancele normalmente.'
  if (m.includes('TROCA_GRATUITA'))        return 'Essa troca é gratuita. Feche e troque normalmente.'
  if (m.includes('FORA_DO_LIMITE'))        return 'Falta menos de 1h para o treino. Não é mais possível cancelar.'
  if (m.includes('DESTINO_LOTADO'))        return 'Esse horário acabou de lotar. Volte e escolha outro.'
  if (m.includes('DESTINO_JA_COMECOU'))    return 'Esse horário já começou. Não dá mais pra ir pra ele.'
  if (m.includes('NAO_E_VIZINHO') || m.includes('LONGE_DEMAIS'))
                                           return 'Só dá pra trocar por um horário logo antes ou logo depois do seu.'
  if (m.includes('JA_FEZ_CHECKIN'))        return 'Você já fez check-in nessa aula.'
  if (m.includes('POSICAO_OCUPADA'))       return 'Essa posição acabou de ser ocupada. Escolha outra.'
  if (m.includes('POSICAO_BLOQUEADA') || m.includes('POSICAO_INVALIDA'))
                                           return 'Essa posição não está disponível. Escolha outra.'
  if (m.includes('JA_TEM_NESSE_HORARIO') || m.includes('JA_TEM_NESSA_AULA'))
                                           return 'Você já tem uma reserva nesse horário.'
  if (m.includes('RESERVA_APP_PARCEIRO'))  return 'Reserva feita pelo app do parceiro não pode ser alterada por aqui.'
  if (m.includes('STATUS_INVALIDO'))       return 'Essa reserva não está mais ativa.'
  return 'Não foi possível concluir agora. Tente de novo.'
}

type Corpo = {
  acao: 'cancelar' | 'trocar'
  tipo: 'ct' | 'club'
  id: string
  destino?: string            // troca: horário HH:MM (CT) ou ocorrencia_id (Club)
  posicao?: string | null     // troca no Running
  cartao?: { numero: string; nome: string; mes: string; ano: string; cvv: string } | null
}

async function executar(clienteId: string, b: Corpo, simular: boolean) {
  if (b.acao === 'cancelar')
    return supabase.rpc('_taxa_cancelar', { p_cli: clienteId, p_tipo: b.tipo, p_id: b.id, p_simular: simular })
  if (b.tipo === 'ct')
    return supabase.rpc('_taxa_trocar_ct', {
      p_cli: clienteId, p_agendamento_id: b.id, p_novo_horario: b.destino || '', p_simular: simular,
    })
  return supabase.rpc('_taxa_trocar_club', {
    p_cli: clienteId, p_reserva_id: b.id, p_destino_ocorrencia_id: b.destino,
    p_nova_posicao: b.posicao || null, p_simular: simular,
  })
}

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token)
    if (errAuth || !user) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data: cliente } = await supabase
      .from('clientes')
      .select('id, nome, cpf, email, telefone, pagarme_customer_id, pagarme_card_id, pagarme_card_last4, pagarme_card_brand')
      .eq('user_id', user.id).maybeSingle()
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const b = (await req.json()) as Corpo
    if (!['cancelar', 'trocar'].includes(b?.acao) || !['ct', 'club'].includes(b?.tipo) || !b?.id
        || (b.acao === 'trocar' && !b.destino))
      return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })

    // 1) Simula. Se a regra não deixa (ou a taxa está desligada), para aqui — sem cobrar.
    const sim = await executar(cliente.id, b, true)
    if (sim.error) return NextResponse.json({ error: traduzir(sim.error.message || ''), codigo: sim.error.message }, { status: 400 })
    const valor = Number((sim.data as any)?.valor)
    const unidadeId = (sim.data as any)?.unidade_id || null
    if (!(valor > 0)) return NextResponse.json({ error: 'Não foi possível concluir agora. Tente de novo.' }, { status: 400 })

    const { data: cfg } = await supabase.from('taxa_flex_config').select('produto_ct_id, produto_club_id').eq('id', 1).maybeSingle()
    const produtoId = b.tipo === 'ct' ? cfg?.produto_ct_id : cfg?.produto_club_id

    // 2) Monta a cobrança
    const cpf = (cliente.cpf || '').replace(/\D/g, '')
    const tel = (cliente.telefone || '').replace(/\D/g, '')
    const cadastroOk = cpfValido(cpf) && telValido(tel)
    const customerCompleto = {
      name: cliente.nome, email: cliente.email, type: 'individual',
      document: cpf, document_type: 'CPF', phones: montarPhones(tel),
    }

    let creditCard: any
    if (b.cartao) {
      const numero = String(b.cartao.numero || '').replace(/\D/g, '')
      const mes = parseInt(String(b.cartao.mes)), ano = parseInt(String(b.cartao.ano))
      const cvv = String(b.cartao.cvv || '')
      if (numero.length < 13 || numero.length > 19 || !String(b.cartao.nome || '').trim()
          || !(mes >= 1 && mes <= 12) || !(ano >= new Date().getFullYear()) || cvv.length < 3 || cvv.length > 4)
        return NextResponse.json({ error: 'Dados do cartão inválidos. Confira e tente de novo.' }, { status: 400 })
      creditCard = {
        card: {
          number: numero, holder_name: String(b.cartao.nome).trim(), exp_month: mes, exp_year: ano, cvv,
          billing_address: { line_1: 'Rua Fiandeiras, 392', zip_code: '04545006', city: 'São Paulo', state: 'SP', country: 'BR' },
        },
      }
    } else {
      if (!cliente.pagarme_customer_id || !cliente.pagarme_card_id)
        return NextResponse.json({ error: 'Você não tem cartão salvo. Informe um cartão.', precisa_cartao: true }, { status: 400 })
      creditCard = { card_id: cliente.pagarme_card_id }
    }

    if (!cliente.pagarme_customer_id && !cadastroOk)
      return NextResponse.json({ error: 'Seu cadastro está sem CPF ou telefone válido. Cadastre seu cartão para continuar.', precisa_cadastro: true }, { status: 400 })

    // Customer completo no Pagar.me (telefone + CPF) — sem isso o PSP recusa. Best-effort.
    if (cliente.pagarme_customer_id && cadastroOk) {
      try {
        await fetch(`${PAGARME_API_URL}/customers/${cliente.pagarme_customer_id}`, {
          method: 'PUT',
          headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(customerCompleto),
        })
      } catch {}
    }

    const acaoTxt = b.acao === 'cancelar' ? 'cancelamento' : 'troca de horário'
    const orderPayload: any = {
      ...(cliente.pagarme_customer_id ? { customer_id: cliente.pagarme_customer_id } : { customer: customerCompleto }),
      items: [{ amount: Math.round(valor * 100), description: `Taxa fora do prazo — ${acaoTxt}`, quantity: 1, code: `taxa_${b.acao}_${b.id}` }],
      payments: [{
        payment_method: 'credit_card',
        credit_card: {
          ...creditCard, operation_type: 'auth_and_capture', installments: 1,
          statement_descriptor: b.tipo === 'ct' ? 'JUSTCT TAXA' : 'JUSTCLUB TAXA',
        },
      }],
    }

    const resp = await fetch(`${PAGARME_API_URL}/orders`, {
      method: 'POST',
      headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    })
    const order = await resp.json().catch(() => null)
    const pago = resp.ok && order?.status === 'paid'
    const chargeId: string | null = order?.charges?.[0]?.id || null

    // Log sem número nem CVV
    const payloadLog = JSON.parse(JSON.stringify(orderPayload))
    if (payloadLog.payments[0].credit_card.card) {
      const c = payloadLog.payments[0].credit_card.card
      c.number = '****' + String(c.number).slice(-4); c.cvv = '***'
    }
    if (payloadLog.customer) payloadLog.customer.document = '***'
    await supabase.from('cartoes_log').insert({
      cliente_id: cliente.id, operacao: 'cobranca_taxa_flex',
      pagarme_customer_id: cliente.pagarme_customer_id, pagarme_card_id: b.cartao ? null : cliente.pagarme_card_id,
      pagarme_order_id: order?.id || null, sucesso: pago, valor,
      motivo: `Taxa fora do prazo — ${acaoTxt} — ${b.tipo} ${b.id}`,
      erro: !pago ? JSON.stringify(order) : null,
      request_payload: payloadLog, response_payload: order, operado_por: user.id,
    })

    const registro = {
      cliente_id: cliente.id, acao: b.acao, tipo: b.tipo, ref_id: b.id, destino: b.destino || null, valor,
      pagarme_order_id: order?.id || null, pagarme_charge_id: chargeId,
    }

    if (!pago) {
      const msg = order?.charges?.[0]?.last_transaction?.acquirer_message
        || order?.errors?.[0]?.message || order?.message || 'Cartão recusado'
      await supabase.from('taxa_flex_cobrancas').insert({ ...registro, status: 'recusado', erro: String(msg).slice(0, 500) })
      return NextResponse.json({ error: 'Cartão recusado. Nada mudou na sua reserva. Tente outro cartão.', recusado: true }, { status: 402 })
    }

    // 3) Pagou → executa de verdade
    const exec = await executar(cliente.id, b, false)
    if (exec.error) {
      // 4) Ação falhou depois de cobrar → estorna
      let estornou = false
      if (chargeId) {
        try {
          const del = await fetch(`${PAGARME_API_URL}/charges/${chargeId}`, {
            method: 'DELETE', headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
          })
          const delData = await del.json().catch(() => null)
          estornou = del.ok && ['canceled', 'refunded', 'processing'].includes(delData?.status)
        } catch {}
      }
      await supabase.from('taxa_flex_cobrancas').insert({
        ...registro, status: estornou ? 'estornado' : 'erro_estorno', erro: (exec.error.message || '').slice(0, 500),
      })
      return NextResponse.json({
        error: traduzir(exec.error.message || '') + (estornou
          ? ' O valor da taxa foi estornado.'
          : ' A taxa foi cobrada e não conseguimos estornar automaticamente — fale com a recepção.'),
        estornado: estornou,
      }, { status: 409 })
    }

    const refTxt = b.tipo === 'ct' ? `agendamento ${b.id}` : `reserva ${b.id}`
    const { data: venda } = await supabase.from('vendas').insert({
      produto_id: produtoId, cliente_id: cliente.id, quantidade: 1,
      valor_unitario: valor, valor_total: valor, valor_original: valor,
      desconto_percentual: 0, forma_pagamento: 'cartao_credito', vendido_por: user.id,
      unidade_id: unidadeId,
      observacao: `Taxa fora do prazo — ${acaoTxt} — ${refTxt} — order_id ${order.id}`,
    }).select('id').maybeSingle()

    await supabase.from('taxa_flex_cobrancas').insert({ ...registro, status: 'pago', venda_id: venda?.id || null })

    return NextResponse.json({ ok: true, valor, resultado: exec.data })
  } catch (err: any) {
    console.error('Erro inesperado em /api/taxa-flex/pagar:', err)
    return NextResponse.json({ error: 'Não foi possível concluir agora. Tente de novo.' }, { status: 500 })
  }
}
