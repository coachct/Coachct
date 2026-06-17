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

// Validação real de CPF (11 dígitos + dígitos verificadores)
function cpfValido(valor: string): boolean {
  const c = (valor || '').replace(/\D/g, '')
  if (c.length !== 11) return false
  if (/^(\d)\1{10}$/.test(c)) return false // todos os dígitos iguais
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

// Telefone válido = DDD + número (10 ou 11 dígitos)
function telValido(valor: string): boolean {
  const t = (valor || '').replace(/\D/g, '')
  return t.length >= 10 && t.length <= 11
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
    const { numero, nome, cvv, mes, ano, cpf: cpfBody, telefone: telBody } = body

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

    // ── CPF efetivo: usa o do cadastro se for válido; senão, o informado no form ──
    const cpfCadastro  = (cliente.cpf || '').replace(/\D/g, '')
    const cpfInformado = (cpfBody || '').replace(/\D/g, '')
    let cpfEfetivo = ''
    if (cpfValido(cpfCadastro))       cpfEfetivo = cpfCadastro
    else if (cpfValido(cpfInformado)) cpfEfetivo = cpfInformado

    if (!cpfEfetivo) {
      // Sem CPF válido em nenhum dos dois — nem chama o Pagar.me
      return NextResponse.json({
        error: cpfCadastro
          ? 'O CPF do seu cadastro está inválido. Informe um CPF válido para cadastrar o cartão.'
          : 'Para cadastrar o cartão, informe um CPF válido.',
        precisa_cpf: true,
      }, { status: 400 })
    }

    // Se o cadastro não tinha CPF válido e o cliente informou um agora, salva pra resolver de vez
    if (!cpfValido(cpfCadastro) && cpfEfetivo === cpfInformado) {
      await supabase.from('clientes').update({ cpf: cpfEfetivo }).eq('id', cliente.id)
    }

    // ── Telefone efetivo: usa o do cadastro se for válido; senão, o informado no form ──
    const telCadastro  = (cliente.telefone || '').replace(/\D/g, '')
    const telInformado = (telBody || '').replace(/\D/g, '')
    let telEfetivo = ''
    if (telValido(telCadastro))       telEfetivo = telCadastro
    else if (telValido(telInformado)) telEfetivo = telInformado

    // Se o cadastro não tinha telefone válido e o cliente informou um agora, salva pra resolver de vez
    if (!telValido(telCadastro) && telEfetivo && telEfetivo === telInformado) {
      await supabase.from('clientes').update({ telefone: telEfetivo }).eq('id', cliente.id)
    }

    const customerJaExistia = !!cliente.pagarme_customer_id
    let pagarmeCustomerId = cliente.pagarme_customer_id

    if (!pagarmeCustomerId) {
      // Pagar.me PSP exige telefone no customer — não criamos um customer sem telefone
      if (!telEfetivo) {
        return NextResponse.json({
          error: 'Para cadastrar o cartão, informe um telefone com DDD.',
          precisa_telefone: true,
        }, { status: 400 })
      }

      const customerPayload: any = {
        name: cliente.nome,
        email: cliente.email,
        type: 'individual',
        document: cpfEfetivo,
        document_type: 'CPF',
        phones: montarPhones(telEfetivo),
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
        // Mensagem por causa: se o erro é de documento, orienta sobre o CPF
        const erroDocumento = !!customerData?.errors?.document
        return NextResponse.json({
          error: erroDocumento
            ? 'Não foi possível validar seu CPF. Confira o número informado ou atualize seu cadastro com a recepção.'
            : 'Erro ao registrar seus dados na operadora de cartão. Confira seus dados de cadastro ou tente novamente.',
          detalhes: customerData.message,
          precisa_cpf: erroDocumento,
        }, { status: 400 })
      }

      pagarmeCustomerId = customerData.id
      await supabase.from('clientes').update({ pagarme_customer_id: pagarmeCustomerId }).eq('id', cliente.id)
    } else if (telEfetivo && !telValido(telCadastro)) {
      // Customer já existia e o cadastro estava sem telefone — atualiza o phones no Pagar.me.
      // Não-crítico: se falhar, o fluxo do cartão segue e o telefone fica salvo pra retry.
      try {
        await fetch(`${PAGARME_API_URL}/customers/${pagarmeCustomerId}`, {
          method: 'PUT',
          headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ phones: montarPhones(telEfetivo) }),
        })
      } catch (e) {
        console.warn('Falha ao atualizar telefone do customer existente (não crítico):', e)
      }
    }

    // ── Limpa TODOS os cartões antigos do customer ANTES de criar o novo ──
    // O sistema só mantém 1 cartão por cliente. Cada POST /cards cria um objeto
    // cartão no Pagar.me mesmo quando a verificação falha, e isso conta pro limite
    // de 30 por customer. Apagar tudo antes de criar evita que o cliente se
    // auto-bloqueie no teto de 30 após várias tentativas. Best-effort: se a
    // listagem ou algum delete falhar, o fluxo do cartão segue normalmente.
    try {
      const listaResp = await fetch(`${PAGARME_API_URL}/customers/${pagarmeCustomerId}/cards?size=100`, {
        method: 'GET',
        headers: { 'Authorization': getAuthHeader() },
      })
      const listaData = await listaResp.json()
      if (listaResp.ok && Array.isArray(listaData?.data)) {
        for (const c of listaData.data) {
          try {
            await fetch(`${PAGARME_API_URL}/customers/${pagarmeCustomerId}/cards/${c.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': getAuthHeader() },
            })
          } catch (e) {
            console.warn('Falha ao remover cartão antigo (não crítico):', c.id, e)
          }
        }
      }
    } catch (e) {
      console.warn('Falha ao listar cartões antigos do customer (não crítico):', e)
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
      // Mensagem amigável por causa. "verification failed" = o banco emissor recusou
      // a autorização de validação (ZeroDollar) — não adianta o cliente repetir o
      // mesmo cartão, então orientamos a trocar de cartão / falar com o banco.
      let mensagemErro = 'Cartão recusado. Verifique os dados ou tente outro cartão.'
      const rawErro = (cardData.errors?.[0]?.message || cardData.message || '').toString()
      if (/verification failed/i.test(rawErro)) {
        mensagemErro = 'Seu banco não autorizou a validação do cartão. Tente outro cartão ou entre em contato com seu banco.'
      } else if (rawErro) {
        mensagemErro = rawErro
      }
      return NextResponse.json({ error: mensagemErro }, { status: 400 })
    }

    const cardId = cardData.id
    const last4 = cardData.last_four_digits || numeroLimpo.slice(-4)
    const brand = (cardData.brand || '').toLowerCase()

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

    }

    // ── Desbloqueio unificado ──
    // O bloqueio só existe por FALHA DE COBRANÇA. Agora que o cliente tem um cartão
    // válido, ele deve ser liberado sempre que NÃO sobrar nenhuma pendência falhando:
    //   • bloqueado COM pendências, todas pagas agora → libera;
    //   • bloqueado SEM nenhuma pendência (bloqueio legado/órfão) → libera também,
    //     em vez de deixá-lo preso sem forma de se resolver sozinho.
    // Se alguma pendência falhou, mantém bloqueado (ainda há dívida a regularizar).
    if (cliente.bloqueado && resumoPendencias.falhadas === 0) {
      const { error: errDesbloquear } = await supabase
        .from('clientes')
        .update({ bloqueado: false, motivo_bloqueio: null })
        .eq('id', cliente.id)

      if (errDesbloquear) {
        console.error('ERRO AO DESBLOQUEAR CLIENTE após cadastro de cartão:', errDesbloquear)
        // Cartão já foi salvo e pendências já cobradas — não falha a requisição, só loga.
      } else {
        resumoPendencias.cliente_desbloqueado = true
      }
    }

    return NextResponse.json({ ok: true, cartao: { last4, brand }, pendencias: resumoPendencias })

  } catch (err: any) {
    console.error('Erro inesperado em /api/cliente/cadastrar-cartao:', err)
    return NextResponse.json({ error: 'Erro inesperado: ' + (err.message || 'desconhecido') }, { status: 500 })
  }
}
