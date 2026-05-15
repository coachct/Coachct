import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAGARME_API_URL = 'https://api.pagar.me/core/v5'
const PAGARME_API_KEY = process.env.PAGARME_API_KEY!

// Pagar.me usa Basic Auth com a chave secreta + ':' (sem senha)
function getAuthHeader() {
  const credentials = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')
  return `Basic ${credentials}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      produto_id,
      cliente_id,
      metodo,        // 'pix' ou 'cartao_credito'
      parcelas,      // 1-12 (só usado se metodo=cartao_credito)
      cartao,        // { numero, nome, cvv, mes, ano } - só se metodo=cartao_credito
    } = body

    // Validações básicas
    if (!produto_id || !cliente_id || !metodo) {
      return NextResponse.json(
        { error: 'Dados incompletos' },
        { status: 400 }
      )
    }

    if (!['pix', 'cartao_credito'].includes(metodo)) {
      return NextResponse.json(
        { error: 'Método de pagamento inválido' },
        { status: 400 }
      )
    }

    if (metodo === 'cartao_credito' && (!cartao || !cartao.numero)) {
      return NextResponse.json(
        { error: 'Dados do cartão obrigatórios' },
        { status: 400 }
      )
    }

    // Busca produto
    const { data: produto } = await supabase
      .from('produtos')
      .select('*')
      .eq('id', produto_id)
      .eq('ativo', true)
      .maybeSingle()

    if (!produto) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })
    }

    // Busca cliente
    const { data: cliente } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', cliente_id)
      .maybeSingle()

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    if (cliente.bloqueado) {
      return NextResponse.json({ error: 'Cliente bloqueado' }, { status: 403 })
    }

    // Calcula valor em centavos (Pagar.me exige inteiro em centavos)
    const valorReais = Number(produto.valor)
    const valorCentavos = Math.round(valorReais * 100)

    // Cria pagamento_pendente ANTES de chamar Pagar.me (rastreabilidade)
    const { data: pagamento, error: errPag } = await supabase
      .from('pagamentos_pendentes')
      .insert({
        cliente_id: cliente.id,
        produto_id: produto.id,
        unidade_id: produto.unidade_id,
        quantidade: 1,
        valor_unitario: valorReais,
        valor_total: valorReais,
        metodo_pagamento: metodo,
        parcelas: metodo === 'cartao_credito' ? (parcelas || 1) : 1,
        status: 'pendente',
      })
      .select()
      .single()

    if (errPag || !pagamento) {
      console.error('Erro ao criar pagamento_pendente:', errPag)
      return NextResponse.json({ error: 'Erro ao registrar pagamento' }, { status: 500 })
    }

    // Monta dados do cliente pro Pagar.me
    const cpfLimpo = (cliente.cpf || '').replace(/\D/g, '')
    const telLimpo = (cliente.telefone || '').replace(/\D/g, '')

    const customer: any = {
      name: cliente.nome,
      email: cliente.email,
      type: 'individual',
      document: cpfLimpo,
      document_type: 'CPF',
    }

    if (telLimpo.length >= 10) {
      customer.phones = {
        mobile_phone: {
          country_code: '55',
          area_code: telLimpo.slice(0, 2),
          number: telLimpo.slice(2),
        }
      }
    }

    const items = [{
      amount: valorCentavos,
      description: produto.nome,
      quantity: 1,
      code: produto.id,
    }]

    let payments: any[] = []

    if (metodo === 'pix') {
      payments = [{
        payment_method: 'pix',
        pix: {
          expires_in: 3600, // 1 hora pra pagar
        }
      }]
    } else {
      payments = [{
        payment_method: 'credit_card',
        credit_card: {
          installments: parcelas || 1,
          statement_descriptor: 'JUSTCT',
          card: {
            number: cartao.numero.replace(/\s/g, ''),
            holder_name: cartao.nome,
            exp_month: parseInt(cartao.mes),
            exp_year: parseInt(cartao.ano),
            cvv: cartao.cvv,
            billing_address: {
              line_1: 'Rua Fiandeiras, 392',
              zip_code: '04545006',
              city: 'São Paulo',
              state: 'SP',
              country: 'BR',
            }
          }
        }
      }]
    }

    const orderPayload = {
      customer,
      items,
      payments,
      code: pagamento.id, // referência interna pra ligar webhook ao nosso pagamento
      metadata: {
        pagamento_pendente_id: pagamento.id,
      }
    }

    // Chama Pagar.me
    const pagarmeResponse = await fetch(`${PAGARME_API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    })

    const pagarmeData = await pagarmeResponse.json()

    if (!pagarmeResponse.ok) {
      console.error('Erro Pagar.me:', JSON.stringify(pagarmeData, null, 2))

      // Marca pagamento como falhou
      await supabase
        .from('pagamentos_pendentes')
        .update({
          status: 'falhou',
          motivo_falha: pagarmeData.message || JSON.stringify(pagarmeData).slice(0, 500),
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', pagamento.id)

      return NextResponse.json({
        error: 'Erro ao processar pagamento',
        detalhes: pagarmeData.message || 'Erro desconhecido',
      }, { status: 400 })
    }

    // Extrai dados do retorno
    const charge = pagarmeData.charges?.[0]
    const lastTransaction = charge?.last_transaction

    const updateData: any = {
      pagarme_order_id: pagarmeData.id,
      pagarme_charge_id: charge?.id,
      atualizado_em: new Date().toISOString(),
    }

    // Se PIX, captura QR Code
    if (metodo === 'pix' && lastTransaction) {
      updateData.pix_qr_code = lastTransaction.qr_code
      updateData.pix_qr_code_url = lastTransaction.qr_code_url
      updateData.pix_expira_em = lastTransaction.expires_at
    }

    // Se cartão pagou na hora
    if (metodo === 'cartao_credito') {
      if (charge?.status === 'paid') {
        updateData.status = 'pago'
        updateData.pago_em = new Date().toISOString()
      } else if (charge?.status === 'failed') {
        updateData.status = 'falhou'
        updateData.motivo_falha = lastTransaction?.acquirer_message || 'Cartão recusado'
      }
    }

    // Atualiza pagamento_pendente com dados do Pagar.me
    await supabase
      .from('pagamentos_pendentes')
      .update(updateData)
      .eq('id', pagamento.id)

    // Retorna pro frontend
    return NextResponse.json({
      ok: true,
      pagamento_id: pagamento.id,
      status: updateData.status || 'pendente',
      pix: metodo === 'pix' ? {
        qr_code: updateData.pix_qr_code,
        qr_code_url: updateData.pix_qr_code_url,
        expira_em: updateData.pix_expira_em,
      } : null,
      cartao: metodo === 'cartao_credito' ? {
        aprovado: charge?.status === 'paid',
        motivo: charge?.status === 'failed' ? lastTransaction?.acquirer_message : null,
      } : null,
    })

  } catch (err: any) {
    console.error('Erro inesperado em /api/pagamento/criar:', err)
    return NextResponse.json(
      { error: 'Erro inesperado' },
      { status: 500 }
    )
  }
}
