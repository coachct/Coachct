import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PAGARME_API_URL = 'https://api.pagar.me/core/v5'
const PAGARME_API_KEY = process.env.PAGARME_API_KEY!
const PRODUTO_MULTA_ID = '7a0e93e1-98b0-4125-a993-7a688e8e34bb'

function getAuthHeader() {
  const credentials = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')
  return `Basic ${credentials}`
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token)
    if (errAuth || !user) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data: cliente, error: errCliente } = await supabase
      .from('clientes').select('*').eq('user_id', user.id).maybeSingle()
    if (errCliente || !cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const body = await req.json()
    const { numero, nome, cvv, mes, ano } = body

    if (!numero || !nome || !cvv || !mes || !ano)
      return NextResponse.json({ error: 'Dados do cartão incompletos' }, { status: 400 })

    const numeroLimpo = String(numero).replace(/\s/g, '')
    if (numeroLimpo.length < 13 || numeroLimpo.length > 19)
      return NextResponse.json({ error: 'Número do cartão inválido' }, { status: 400 })

    if (String(cvv).length < 3 || String(cvv).length > 4)
      return NextResponse.json({ error: 'CVV inválido' }, { status: 400 })

    const mesNum = parseInt(String(mes))
    const anoNum = parseInt(String(ano))
    if (mesNum < 1 || mesNum > 12)
      return NextResponse.json({ error: 'Mês inválido' }, { status: 400 })
    if (anoNum < new Date().getFullYear() || anoNum > new Date().getFullYear() + 20)
      return NextResponse.json({ error: 'Ano inválido' }, { status: 400 })

    const cpfLimpo = (cliente.cpf || '').replace(/\D/g, '')
    const telLimpo = (cliente.telefone || '').replace(/\D/g, '')

    let pagarmeCustomerId = cliente.pagarme_customer_id

    if (!pagarmeCustomerId) {
      const customerPayload: any = {
        name: cliente.nome,
        email: cliente.email,
        type: 'individual',
        document: cpfLimpo,
        document_type: 'CPF',
      }

      if (telLimpo.length >= 10) {
        customerPayload.phones = {
          mobile_phone: {
            country_code: '55',
            area_code: telLimpo.slice(0, 2),
            number: telLimpo.slice(2),
          }
        }
      }

      const customerResp = await fetch(`${PAGARME_API_URL}/customers`, {
        method: 'POST',
        headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(customerPayload),
      })
      const customerData = await customerResp.json()

      if (!customerResp.ok) {
        console.error('Erro ao criar customer no Pagar.me:', JSON.stringify(customerData, null, 2))
        await supabase.from('cartoes_log').insert({
          cliente_id: cliente.id, operacao: 'cadastro', sucesso: false,
          erro: customerData.message || 'Erro ao criar customer',
          request_payload: { customer: customerPayload }, response_payload: customerData, operado_por: user.id,
        })
        return NextResponse.json({ error: 'Erro ao registrar cliente na operadora de cartão', detalhes: customerData.message }, { status: 400 })
      }

      pagarmeCustomerId = customerData.id
      await supabase.from('clientes').update({ pagarme_customer_id: pagarmeCustomerId }).eq('id', cliente.id)
    }

    const cardPayload = {
      number: numeroLimpo,
      holder_name: String(nome).trim(),
      exp_month: mesNum,
      exp_year: anoNum,
      cvv: String(cvv),
      billing_address: {
        line_1: 'Rua Fiandeiras, 392',
        zip_code: '04545006',
        city: 'São Paulo',
        state: 'SP',
        country: 'BR',
      }
    }

    const cardResp = await fetch(`${PAGARME_API_URL}/customers/${pagarmeCustomerId}/cards`, {
      method: 'POST',
      headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(cardPayload),
    })
    const cardData = await cardResp.json()

    if (!cardResp.ok || cardData.status === 'invalid') {
      console.error('Erro ao criar cartão no Pagar.me:', JSON.stringify(cardData, null, 2))
      await supabase.from('cartoes_log').insert({
        cliente_id: cliente.id, operacao: 'cadastro', pagarme_customer_id: pagarmeCustomerId,
        sucesso: false, erro: cardData.message || cardData.status || 'Cartão recusado',
        request_payload: { ...cardPayload, number: '****' + numeroLimpo.slice(-4), cvv: '***' },
        response_payload: cardData, operado_por: user.id,
      })
      let mensagemErro = 'Cartão recusado. Verifique os dados ou tente outro cartão.'
      if (cardData.errors?.length > 0) mensagemErro = cardData.errors[0].message || mensagemErro
      else if (cardData.message) mensagemErro = cardData.message
      return NextResponse.json({ error: mensagemErro }, { status: 400 })
    }

    const cardId = cardData.id
    const last4 = cardData.last_four_digits || numeroLimpo.slice(-4)
    const brand = (cardData.brand || '').toLowerCase()

    if (cliente.pagarme_card_id && cliente.pagarme_card_id !== cardId) {
      try {
        await fetch(`${PAGARME_API_URL}/customers/${pagarmeCustomerId}/cards/${cliente.pagarme_card_id}`, {
          method: 'DELETE',
          headers: { 'Authorization': getAuthHeader() },
        })
      } catch (e) {
        console.warn('Falha ao remover cartão antigo (não crítico):', e)
      }
    }

    await supabase.from('clientes').update({
      pagarme_card_id: cardId,
      pagarme_card_last4: last4,
      pagarme_card_brand: brand,
      atualizado_em: new Date().toISOString(),
    }).eq('id', cliente.id)

    await supabase.from('cartoes_log').insert({
      cliente_id: cliente.id, operacao: 'cadastro', pagarme_customer_id: pagarmeCustomerId,
      pagarme_card_id: cardId, sucesso: true, motivo: 'Cartão cadastrado e validado (ZeroDollar)',
      response_payload: { id: cardData.id, brand: cardData.brand, last_four_digits: cardData.last_four_digits, status: cardData.status },
      operado_por: user.id,
    })

    // Após salvar cartão, tenta cobrar pendências
    const { data: pendencias } = await supabase
      .from('cobrancas_pendentes')
      .select('*')
      .eq('cliente_id', cliente.id)
      .eq('status', 'pendente')
      .order('cobrado_em', { ascending: true })

    let resumoPendencias = { havia: 0, cobradas: 0, falhadas: 0, valor_cobrado: 0, cliente_desbloqueado: false }

    if (pendencias && pendencias.length > 0) {
      resumoPendencias.havia = pendencias.length

      for (const pend of pendencias) {
        const valorCentavos = Math.round(Number(pend.valor) * 100)

        const orderPayload = {
          customer_id: pagarmeCustomerId,
          items: [{ amount: valorCentavos, description: pend.motivo, quantity: 1, code: `pendencia_${pend.id}` }],
          payments: [{
            payment_method: 'credit_card',
            credit_card: { card_id: cardId, operation_type: 'auth_and_capture', installments: 1, statement_descriptor: 'JUSTCT MULTA' },
          }],
        }

        const orderResp = await fetch(`${PAGARME_API_URL}/orders`, {
          method: 'POST',
          headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        })
        const orderData = await orderResp.json()
        const aprovado = orderResp.ok && orderData?.status === 'paid'

        await supabase.from('cartoes_log').insert({
          cliente_id: cliente.id, operacao: 'cobranca_apos_cadastro',
          pagarme_customer_id: pagarmeCustomerId, pagarme_card_id: cardId,
          pagarme_order_id: orderData?.id || null, sucesso: aprovado, valor: Number(pend.valor),
          motivo: `Tentativa automática após cadastro de cartão — ${pend.motivo}`,
          erro: !aprovado ? JSON.stringify(orderData) : null,
          request_payload: orderPayload, response_payload: orderData, operado_por: user.id,
        })

        if (aprovado) {
          await supabase.from('cobrancas_pendentes').update({
            status: 'pago', pago_em: new Date().toISOString(), pagarme_order_id: orderData.id,
          }).eq('id', pend.id)

          let unidadeId: string | null = null
          const matchAg = pend.observacao?.match(/agendamento_id:\s*([a-f0-9-]{36})/i)
          if (matchAg) {
            const { data: ag } = await supabase.from('agendamentos').select('unidade_id').eq('id', matchAg[1]).maybeSingle()
            unidadeId = ag?.unidade_id || null
          }

          await supabase.from('vendas').insert({
            produto_id: PRODUTO_MULTA_ID, cliente_id: cliente.id, quantidade: 1,
            valor_unitario: Number(pend.valor), valor_total: Number(pend.valor), valor_original: Number(pend.valor),
            desconto_percentual: 0, forma_pagamento: 'cartao_credito', vendido_por: user.id,
            unidade_id: unidadeId,
            observacao: `Multa regularizada pelo cliente — pendência ${pend.id} — order_id ${orderData.id}`,
          })

          resumoPendencias.cobradas++
          resumoPendencias.valor_cobrado += Number(pend.valor)
        } else {
          resumoPendencias.falhadas++
        }
      }

      // Se TODAS aprovadas, desbloqueia cliente
      if (resumoPendencias.falhadas === 0 && resumoPendencias.cobradas > 0) {
        const { error: errDesbloquear } = await supabase
          .from('clientes')
          .update({ bloqueado: false, motivo_bloqueio: null })
          .eq('id', cliente.id)

        if (errDesbloquear) {
          console.error('ERRO AO DESBLOQUEAR CLIENTE após cobrança automática:', errDesbloquear)
          // Cobrança já foi feita — não falha a requisição, mas loga para investigação
        } else {
          resumoPendencias.cliente_desbloqueado = true
        }
      }
    }

    return NextResponse.json({ ok: true, cartao: { last4, brand }, pendencias: resumoPendencias })

  } catch (err: any) {
    console.error('Erro inesperado em /api/cliente/cadastrar-cartao:', err)
    return NextResponse.json({ error: 'Erro inesperado: ' + (err.message || 'desconhecido') }, { status: 500 })
  }
}
