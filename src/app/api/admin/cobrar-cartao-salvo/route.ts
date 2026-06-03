import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const PAGARME_API_KEY = process.env.PAGARME_API_KEY!
const PAGARME_BASE = 'https://api.pagar.me/core/v5'
const PRODUTO_MULTA_ID = '7a0e93e1-98b0-4125-a993-7a688e8e34bb'

// Telefone válido = DDD + número (10 ou 11 dígitos)
function telValido(valor: string): boolean {
  const t = (valor || '').replace(/\D/g, '')
  return t.length >= 10 && t.length <= 11
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

// Monta o objeto phones do Pagar.me a partir de um telefone só com dígitos
function montarPhones(telLimpo: string) {
  return {
    mobile_phone: {
      country_code: '55',
      area_code: telLimpo.slice(0, 2),
      number: telLimpo.slice(2),
    }
  }
}

function getAuthHeader() {
  const credentials = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')
  return `Basic ${credentials}`
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer '))
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

    const { data: perfil } = await supabase.from('perfis').select('id, role').eq('id', user.id).maybeSingle()
    if (!perfil || !['admin', 'coordenadora'].includes(perfil.role))
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const { agendamento_id, valor } = body

    if (!agendamento_id || !valor || valor <= 0)
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const { data: ag, error: errAg } = await supabase
      .from('agendamentos').select('id, cliente_id, data, horario, status, unidade_id')
      .eq('id', agendamento_id).maybeSingle()
    if (errAg || !ag) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 })
    if (ag.status !== 'falta') return NextResponse.json({ error: 'Agendamento não está marcado como falta' }, { status: 400 })

    const { data: cliente, error: errCli } = await supabase
      .from('clientes').select('id, nome, cpf, email, telefone, pagarme_customer_id, pagarme_card_id, pagarme_card_last4, pagarme_card_brand')
      .eq('id', ag.cliente_id).maybeSingle()
    if (errCli || !cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    if (!cliente.pagarme_customer_id || !cliente.pagarme_card_id)
      return NextResponse.json({ error: 'Cliente sem cartão cadastrado' }, { status: 400 })

    const { data: vendaExistente } = await supabase
      .from('vendas').select('id').eq('cliente_id', cliente.id).eq('produto_id', PRODUTO_MULTA_ID)
      .ilike('observacao', `%${agendamento_id}%`).maybeSingle()
    if (vendaExistente) return NextResponse.json({ error: 'Esta falta já foi cobrada anteriormente' }, { status: 400 })

    // ── Garante CUSTOMER COMPLETO no Pagar.me antes de cobrar (telefone + CPF) ──
    // Customers criados antes dos fixes podem existir sem phone e/ou sem document.
    // O update de customer exige o objeto COMPLETO — PUT parcial é recusado silenciosamente.
    // Então mandamos a mesma forma da CRIAÇÃO (que funciona): name, email, type, document, phones.
    const telCliente = (cliente.telefone || '').replace(/\D/g, '')
    if (!telValido(telCliente)) {
      return NextResponse.json({
        error: 'Cliente sem telefone válido no cadastro. Atualize o telefone (com DDD) na recepção antes de cobrar.',
        precisa_telefone: true,
      }, { status: 400 })
    }

    const cpfCliente = (cliente.cpf || '').replace(/\D/g, '')
    if (!cpfValido(cpfCliente)) {
      return NextResponse.json({
        error: 'Cliente sem CPF válido no cadastro. Atualize o CPF na recepção antes de cobrar.',
        precisa_cpf: true,
      }, { status: 400 })
    }

    const updateCustomerPayload: any = {
      name: cliente.nome,
      email: cliente.email,
      type: 'individual',
      document: cpfCliente,
      document_type: 'CPF',
      phones: montarPhones(telCliente),
    }

    const putTelResp = await fetch(`${PAGARME_BASE}/customers/${cliente.pagarme_customer_id}`, {
      method: 'PUT',
      headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(updateCustomerPayload),
    })
    const putTelData = await putTelResp.json().catch(() => null)

    // Loga o resultado do PUT — pra nunca mais ficarmos cegos sobre essa etapa
    await supabase.from('cartoes_log').insert({
      cliente_id: cliente.id, operacao: 'atualizar_dados_cobranca',
      pagarme_customer_id: cliente.pagarme_customer_id,
      sucesso: putTelResp.ok,
      motivo: `Atualização de dados (telefone+CPF) antes da cobrança de multa (agendamento ${agendamento_id})`,
      erro: !putTelResp.ok ? JSON.stringify(putTelData) : null,
      request_payload: { ...updateCustomerPayload, document: '***' },
      response_payload: putTelData, operado_por: perfil.id,
    })

    // Se não conseguiu atualizar o customer, para aqui com o motivo real (em vez de seguir e tomar erro)
    if (!putTelResp.ok) {
      const putErr = putTelData?.errors
        ? JSON.stringify(putTelData.errors)
        : (putTelData?.message || 'erro desconhecido')
      return NextResponse.json({
        error: `Não foi possível atualizar os dados do cliente no Pagar.me antes de cobrar (${putErr}). Confira os dados do cliente e tente novamente.`,
      }, { status: 400 })
    }

    const valorCentavos = Math.round(Number(valor) * 100)
    const horarioFmt = (ag.horario || '').slice(0, 5)

    const pagarmePayload = {
      customer_id: cliente.pagarme_customer_id,
      items: [{ amount: valorCentavos, description: `Multa No-Show — Agendamento ${ag.data} ${horarioFmt}`, quantity: 1, code: `multa_${agendamento_id}` }],
      payments: [{ payment_method: 'credit_card', credit_card: { card_id: cliente.pagarme_card_id, operation_type: 'auth_and_capture', installments: 1, statement_descriptor: 'JUSTCT MULTA' } }],
    }

    const auth = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')
    const resPagarme = await fetch(`${PAGARME_BASE}/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pagarmePayload),
    })
    const dataPagarme = await resPagarme.json()

    await supabase.from('cartoes_log').insert({
      cliente_id: cliente.id, operacao: 'cobranca_multa',
      pagarme_customer_id: cliente.pagarme_customer_id, pagarme_card_id: cliente.pagarme_card_id,
      pagarme_order_id: dataPagarme?.id || null,
      sucesso: resPagarme.ok && (dataPagarme?.status === 'paid'),
      valor: Number(valor), motivo: `Multa no-show agendamento ${agendamento_id}`,
      erro: !resPagarme.ok ? JSON.stringify(dataPagarme) : null,
      request_payload: pagarmePayload, response_payload: dataPagarme, operado_por: perfil.id,
    })

    if (!resPagarme.ok || dataPagarme?.status !== 'paid') {
      const errMsg = dataPagarme?.errors?.[0]?.message || dataPagarme?.message || `Cartão recusado (status: ${dataPagarme?.status || 'desconhecido'})`
      await supabase.from('cobrancas_pendentes').insert({
        cliente_id: cliente.id, valor: Number(valor),
        motivo: `Multa no-show — agendamento ${ag.data} ${horarioFmt}`,
        status: 'pendente', pagarme_order_id: dataPagarme?.id || null,
        criado_por: perfil.id, observacao: `agendamento_id: ${agendamento_id}`,
      })
      return NextResponse.json({ error: errMsg, cobranca_pendente_criada: true }, { status: 400 })
    }

    const { data: novaVenda, error: errVenda } = await supabase
      .from('vendas').insert({
        produto_id: PRODUTO_MULTA_ID, cliente_id: cliente.id, quantidade: 1,
        valor_unitario: Number(valor), valor_total: Number(valor), valor_original: Number(valor),
        desconto_percentual: 0, forma_pagamento: 'cartao_credito', vendido_por: perfil.id,
        unidade_id: ag.unidade_id,
        observacao: `Multa No-Show — agendamento ${agendamento_id} — order_id ${dataPagarme.id}`,
      }).select('id').single()

    if (errVenda) {
      return NextResponse.json({ error: 'Cobrança realizada no cartão, mas falhou ao registrar venda.', order_id: dataPagarme.id }, { status: 500 })
    }

    const { error: errDesbloquear } = await supabase
      .from('clientes').update({ bloqueado: false, motivo_bloqueio: null }).eq('id', cliente.id)

    if (errDesbloquear) {
      return NextResponse.json({ sucesso: true, venda_id: novaVenda.id, order_id: dataPagarme.id, valor: Number(valor), cartao: `${cliente.pagarme_card_brand} •••• ${cliente.pagarme_card_last4}`, cliente_desbloqueado: false, aviso: 'Cobrança realizada mas falha ao desbloquear cliente.' })
    }

    return NextResponse.json({ sucesso: true, venda_id: novaVenda.id, order_id: dataPagarme.id, valor: Number(valor), cartao: `${cliente.pagarme_card_brand} •••• ${cliente.pagarme_card_last4}`, cliente_desbloqueado: true })

  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 })
  }
}
