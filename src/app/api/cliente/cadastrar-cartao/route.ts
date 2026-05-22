import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PAGARME_API_URL = 'https://api.pagar.me/core/v5'
const PAGARME_API_KEY = process.env.PAGARME_API_KEY!

function getAuthHeader() {
  const credentials = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')
  return `Basic ${credentials}`
}

export async function POST(req: NextRequest) {
  try {
    // 1. Autenticação: lê o JWT do header e descobre quem é o usuário
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    
    if (!token) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token)
    
    if (errAuth || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    // 2. Busca o cliente vinculado a esse usuário
    const { data: cliente, error: errCliente } = await supabase
      .from('clientes')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (errCliente || !cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    if (cliente.bloqueado) {
      return NextResponse.json({ error: 'Cliente bloqueado. Regularize pendências antes de cadastrar cartão.' }, { status: 403 })
    }

    // 3. Valida dados do cartão recebidos
    const body = await req.json()
    const { numero, nome, cvv, mes, ano } = body

    if (!numero || !nome || !cvv || !mes || !ano) {
      return NextResponse.json({ error: 'Dados do cartão incompletos' }, { status: 400 })
    }

    const numeroLimpo = String(numero).replace(/\s/g, '')
    if (numeroLimpo.length < 13 || numeroLimpo.length > 19) {
      return NextResponse.json({ error: 'Número do cartão inválido' }, { status: 400 })
    }

    if (String(cvv).length < 3 || String(cvv).length > 4) {
      return NextResponse.json({ error: 'CVV inválido' }, { status: 400 })
    }

    const mesNum = parseInt(String(mes))
    const anoNum = parseInt(String(ano))
    if (mesNum < 1 || mesNum > 12) {
      return NextResponse.json({ error: 'Mês inválido' }, { status: 400 })
    }
    if (anoNum < new Date().getFullYear() || anoNum > new Date().getFullYear() + 20) {
      return NextResponse.json({ error: 'Ano inválido' }, { status: 400 })
    }

    const cpfLimpo = (cliente.cpf || '').replace(/\D/g, '')
    const telLimpo = (cliente.telefone || '').replace(/\D/g, '')

    // 4. PASSO A — Criar (ou recuperar) o customer no Pagar.me
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
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(customerPayload),
      })

      const customerData = await customerResp.json()

      if (!customerResp.ok) {
        console.error('Erro ao criar customer no Pagar.me:', JSON.stringify(customerData, null, 2))
        
        await supabase.from('cartoes_log').insert({
          cliente_id: cliente.id,
          operacao: 'cadastro',
          sucesso: false,
          erro: customerData.message || 'Erro ao criar customer',
          request_payload: { customer: customerPayload },
          response_payload: customerData,
          operado_por: user.id,
        })

        return NextResponse.json({
          error: 'Erro ao registrar cliente na operadora de cartão',
          detalhes: customerData.message,
        }, { status: 400 })
      }

      pagarmeCustomerId = customerData.id

      // Salva o customer_id no cliente
      await supabase
        .from('clientes')
        .update({ pagarme_customer_id: pagarmeCustomerId })
        .eq('id', cliente.id)
    }

    // 5. PASSO B — Criar o cartão no customer (ZeroDollar valida automaticamente, sem cobrar)
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

    const cardResp = await fetch(
      `${PAGARME_API_URL}/customers/${pagarmeCustomerId}/cards`,
      {
        method: 'POST',
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cardPayload),
      }
    )

    const cardData = await cardResp.json()

    // 6. Trata resposta
    if (!cardResp.ok || cardData.status === 'invalid') {
      console.error('Erro ao criar cartão no Pagar.me:', JSON.stringify(cardData, null, 2))
      
      await supabase.from('cartoes_log').insert({
        cliente_id: cliente.id,
        operacao: 'cadastro',
        pagarme_customer_id: pagarmeCustomerId,
        sucesso: false,
        erro: cardData.message || cardData.status || 'Cartão recusado',
        request_payload: { 
          ...cardPayload, 
          number: '****' + numeroLimpo.slice(-4), 
          cvv: '***' 
        },
        response_payload: cardData,
        operado_por: user.id,
      })

      let mensagemErro = 'Cartão recusado. Verifique os dados ou tente outro cartão.'
      if (cardData.errors?.length > 0) {
        mensagemErro = cardData.errors[0].message || mensagemErro
      } else if (cardData.message) {
        mensagemErro = cardData.message
      }

      return NextResponse.json({
        error: mensagemErro,
      }, { status: 400 })
    }

    // 7. Cartão criado e validado com sucesso — salva no cliente
    const cardId = cardData.id
    const last4 = cardData.last_four_digits || numeroLimpo.slice(-4)
    const brand = (cardData.brand || '').toLowerCase()

    // Se já tinha cartão salvo, vamos apagar o antigo do Pagar.me (não acumular)
    if (cliente.pagarme_card_id && cliente.pagarme_card_id !== cardId) {
      try {
        await fetch(
          `${PAGARME_API_URL}/customers/${pagarmeCustomerId}/cards/${cliente.pagarme_card_id}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': getAuthHeader() },
          }
        )
      } catch (e) {
        console.warn('Falha ao remover cartão antigo (não crítico):', e)
      }
    }

    // Atualiza o cliente com os dados do novo cartão
    const { error: errUpdate } = await supabase
      .from('clientes')
      .update({
        pagarme_card_id: cardId,
        pagarme_card_last4: last4,
        pagarme_card_brand: brand,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', cliente.id)

    if (errUpdate) {
      console.error('Erro ao salvar cartão no cliente:', errUpdate)
    }

    // Log de sucesso
    await supabase.from('cartoes_log').insert({
      cliente_id: cliente.id,
      operacao: 'cadastro',
      pagarme_customer_id: pagarmeCustomerId,
      pagarme_card_id: cardId,
      sucesso: true,
      motivo: 'Cartão cadastrado e validado (ZeroDollar)',
      response_payload: {
        id: cardData.id,
        brand: cardData.brand,
        last_four_digits: cardData.last_four_digits,
        status: cardData.status,
      },
      operado_por: user.id,
    })

    return NextResponse.json({
      ok: true,
      cartao: {
        last4,
        brand,
      },
    })

  } catch (err: any) {
    console.error('Erro inesperado em /api/cliente/cadastrar-cartao:', err)
    return NextResponse.json({ error: 'Erro inesperado: ' + (err.message || 'desconhecido') }, { status: 500 })
  }
}
