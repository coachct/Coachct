import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAGARME_API_URL = 'https://api.pagar.me/core/v5'
const PAGARME_API_KEY = process.env.PAGARME_API_KEY!

function getAuthHeader() {
  const credentials = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')
  return `Basic ${credentials}`
}

// Validação real de CPF (11 dígitos + dígitos verificadores)
function cpfValido(valor: string): boolean {
  const c = (valor || '').replace(/\D/g, '')
  if (c.length !== 11) return false
  if (/^(\d)\1{10}$/.test(c)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(c[i]) * (10 - i)
  let d1 = (soma * 10) % 11
  if (d1 === 10) d1 = 0
  if (d1 !== parseInt(c[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(c[i]) * (11 - i)
  let d2 = (soma * 10) % 11
  if (d2 === 10) d2 = 0
  if (d2 !== parseInt(c[10])) return false
  return true
}

// Achata o objeto `errors` do Pagar.me (422) num texto legível: "campo: msg | campo: msg"
function descreverErroPagarme(data: any): string {
  if (data?.errors && typeof data.errors === 'object') {
    const partes: string[] = []
    for (const [campo, msgs] of Object.entries(data.errors)) {
      const lista = Array.isArray(msgs) ? (msgs as any[]).join('; ') : String(msgs)
      partes.push(`${campo}: ${lista}`)
    }
    if (partes.length) return partes.join(' | ')
  }
  return data?.message || 'Erro desconhecido'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { produto_id, cliente_id, metodo, parcelas, cartao } = body

    if (!produto_id || !cliente_id || !metodo) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
    }

    if (!['pix', 'cartao_credito'].includes(metodo)) {
      return NextResponse.json({ error: 'Método de pagamento inválido' }, { status: 400 })
    }

    if (metodo === 'cartao_credito' && (!cartao || !cartao.numero)) {
      return NextResponse.json({ error: 'Dados do cartão obrigatórios' }, { status: 400 })
    }

    const { data: produto } = await supabase
      .from('produtos')
      .select('*')
      .eq('id', produto_id)
      .eq('ativo', true)
      .maybeSingle()

    if (!produto) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })
    }

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

    // Pré-voo: o Pagar.me valida o CPF (customer.document) e devolve 422 "The request
    // is invalid." se o dígito verificador estiver errado. A maquininha física do balcão
    // não passa por essa validação, então um CPF inválido no cadastro só quebra aqui.
    // Barramos antes de criar order/pagamento_pendente, com mensagem clara pro cliente.
    const cpfLimpo = (cliente.cpf || '').replace(/\D/g, '')
    if (!cpfValido(cpfLimpo)) {
      return NextResponse.json(
        { error: 'CPF do cadastro inválido. Atualize seu CPF nos seus dados para concluir a compra.' },
        { status: 400 }
      )
    }

    // GUARD anti-cobrança-duplicada (somente cartão): se já existe um pagamento recente
    // pendente/pago para o MESMO cliente + MESMO produto, não cria um segundo order na
    // Pagar.me. Janela de 90s pega o duplo-clique sem travar uma recompra legítima.
    // Status 'falhou'/'cancelado'/'expirado' ficam de fora de propósito, pra permitir
    // que o cliente tente de novo após uma tentativa que realmente falhou.
    if (metodo === 'cartao_credito') {
      const janelaIso = new Date(Date.now() - 90_000).toISOString()
      const { data: duplicado } = await supabase
        .from('pagamentos_pendentes')
        .select('id')
        .eq('cliente_id', cliente.id)
        .eq('produto_id', produto.id)
        .in('status', ['pendente', 'pago'])
        .is('excluido_em', null)
        .gte('created_at', janelaIso)
        .limit(1)
        .maybeSingle()

      if (duplicado) {
        return NextResponse.json(
          { error: 'Já existe uma cobrança recente para este produto. Aguarde alguns instantes antes de tentar novamente.' },
          { status: 409 }
        )
      }
    }

    const valorOriginal = Number(produto.valor)

    // NOVO: cupom de desconto — só cartão. Validação no servidor (proteção de corrida).
    let descontoPercentual = 0
    let cupomAplicado: any = null
    if (metodo === 'cartao_credito' && body.cupom_codigo) {
      const { data: val } = await supabase.rpc('validar_cupom', {
        p_codigo: body.cupom_codigo,
        p_cliente_id: cliente.id,
        p_produto_id: produto.id,
      })
      if (!val || !val.valido) {
        return NextResponse.json({ error: val?.motivo || 'Cupom inválido.' }, { status: 400 })
      }
      cupomAplicado = val
      descontoPercentual = Number(val.desconto_percentual)
    }

    const valorCentavos = Math.round(valorOriginal * 100 * (1 - descontoPercentual / 100))
    const valorComDesconto = valorCentavos / 100

    const { data: pagamento, error: errPag } = await supabase
      .from('pagamentos_pendentes')
      .insert({
        cliente_id: cliente.id,
        produto_id: produto.id,
        unidade_id: produto.unidade_id,
        quantidade: 1,
        valor_unitario: valorOriginal,
        valor_total: valorComDesconto,
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
        pix: { expires_in: 3600 }
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
      code: pagamento.id,
      metadata: { pagamento_pendente_id: pagamento.id }
    }

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
      console.error('Erro Pagar.me (HTTP):', JSON.stringify(pagarmeData, null, 2))
      const detalheErro = descreverErroPagarme(pagarmeData)
      await supabase
        .from('pagamentos_pendentes')
        .update({
          status: 'falhou',
          motivo_falha: detalheErro.slice(0, 500),
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', pagamento.id)

      return NextResponse.json({
        error: 'Erro ao processar pagamento',
        detalhes: detalheErro,
      }, { status: 400 })
    }

    const charge = pagarmeData.charges?.[0]
    const lastTransaction = charge?.last_transaction
    const chargeStatus = charge?.status

    console.log('==== PAGAR.ME RESPONSE ====')
    console.log('Order status:', pagarmeData.status)
    console.log('Charge status:', chargeStatus)
    console.log('Last transaction status:', lastTransaction?.status)
    console.log('Acquirer message:', lastTransaction?.acquirer_message)
    console.log('Gateway response:', JSON.stringify(lastTransaction?.gateway_response, null, 2))
    console.log('Antifraud:', JSON.stringify(lastTransaction?.antifraud_response, null, 2))

    const updateData: any = {
      pagarme_order_id: pagarmeData.id,
      pagarme_charge_id: charge?.id,
      atualizado_em: new Date().toISOString(),
    }

    if (metodo === 'pix' && lastTransaction) {
      updateData.pix_qr_code = lastTransaction.qr_code
      updateData.pix_qr_code_url = lastTransaction.qr_code_url
      updateData.pix_expira_em = lastTransaction.expires_at
    }

    const cartaoAprovado = metodo === 'cartao_credito' && chargeStatus === 'paid'
    const cartaoReprovado = metodo === 'cartao_credito' && !cartaoAprovado

    if (cartaoAprovado) {
      const { data: venda, error: errVenda } = await supabase.rpc('registrar_venda', {
        p_produto_id: pagamento.produto_id,
        p_cliente_id: pagamento.cliente_id,
        p_quantidade: pagamento.quantidade,
        p_valor_unitario: pagamento.valor_unitario,
        p_forma_pagamento: pagamento.metodo_pagamento,
        p_vendido_por: null,
        p_unidade_id: pagamento.unidade_id,
        p_observacao: 'Venda online via Pagar.me',
        p_desconto_percentual: descontoPercentual,
      })

      if (errVenda) {
        console.error('Erro ao registrar venda (cartão):', errVenda)
      } else if (venda && venda.sucesso === false) {
        console.error('registrar_venda retornou sucesso=false (cartão):', venda)
      } else {
        console.log('✅ Venda registrada (cartão). Venda ID:', venda?.venda_id)
        updateData.venda_id = venda?.venda_id || null
      }

      updateData.status = 'pago'
      updateData.pago_em = new Date().toISOString()

      // NOVO: registra o uso do cupom (faz os limites total/por cliente valerem)
      if (cupomAplicado) {
        const { error: errUso } = await supabase.from('cupons_usos').insert({
          cupom_id: cupomAplicado.cupom_id,
          cliente_id: pagamento.cliente_id,
          venda_id: updateData.venda_id || null,
          pagamento_id: pagamento.id,
          produto_id: pagamento.produto_id,
          desconto_percentual: descontoPercentual,
          valor_desconto: Math.round((valorOriginal - valorComDesconto) * 100) / 100,
        })
        if (errUso) console.error('Erro ao registrar uso do cupom:', errUso)
      }
    }

    // Determinar motivo da reprovação — prioriza antifraude e ignora acquirer_message confuso
    let motivoReprovacao: string | null = null
    if (cartaoReprovado) {
      const antifraudStatus = lastTransaction?.antifraud_response?.status
      const acquirerMessage = lastTransaction?.acquirer_message || ''

      // Heurística: se o status final é 'failed' mas a mensagem do adquirente diz "aprovada",
      // significa que o antifraude bloqueou DEPOIS da aprovação do banco. Mensagem da Pagar.me
      // é enganosa nesse caso, então tratamos como bloqueio de antifraude.
      const adquirenteAprovouMasFalhou = chargeStatus === 'failed' &&
        /aprovad/i.test(acquirerMessage)

      if (antifraudStatus === 'refused' || antifraudStatus === 'failed' || adquirenteAprovouMasFalhou) {
        motivoReprovacao = 'Pagamento não autorizado pela análise de segurança. Tente outro cartão ou use PIX.'
      }
      else if (lastTransaction?.gateway_response?.errors?.length > 0) {
        motivoReprovacao = lastTransaction.gateway_response.errors[0].message
      }
      else if (chargeStatus === 'failed') {
        // Só usa acquirer_message se NÃO for a mensagem confusa de "aprovado"
        motivoReprovacao = (acquirerMessage && !/aprovad/i.test(acquirerMessage))
          ? acquirerMessage
          : 'Cartão recusado pelo banco emissor. Tente outro cartão ou use PIX.'
      }
      else if (chargeStatus === 'not_authorized') {
        motivoReprovacao = 'Cartão não autorizado. Verifique os dados ou tente outro cartão.'
      }
      else if (chargeStatus === 'pending') {
        motivoReprovacao = 'Pagamento em análise. Aguarde alguns minutos e tente novamente, ou use PIX.'
      }
      else {
        motivoReprovacao = `Pagamento não aprovado. Tente outro cartão ou use PIX.`
      }

      updateData.status = 'falhou'
      updateData.motivo_falha = motivoReprovacao
    }

    await supabase
      .from('pagamentos_pendentes')
      .update(updateData)
      .eq('id', pagamento.id)

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
        aprovado: cartaoAprovado,
        motivo: motivoReprovacao,
        charge_status: chargeStatus,
      } : null,
    })

  } catch (err: any) {
    console.error('Erro inesperado em /api/pagamento/criar:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
