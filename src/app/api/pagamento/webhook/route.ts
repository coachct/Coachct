import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // ETAPA 2: AUTENTICAÇÃO BASIC AUTH
    const authHeader = req.headers.get('authorization') || ''
    const base64 = authHeader.replace('Basic ', '')
    const decoded = Buffer.from(base64, 'base64').toString('utf-8')
    const [user, pass] = decoded.split(':')

    if (!user || !pass || user !== process.env.PAGARME_WEBHOOK_USER || pass !== process.env.PAGARME_WEBHOOK_PASS) {
      console.warn('==== WEBHOOK: AUTENTICAÇÃO REJEITADA ====')
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const tipo = body?.type
    const orderId = body?.data?.id || body?.id

    console.log('==== WEBHOOK PAGAR.ME RECEBIDO ====')
    console.log('Tipo:', tipo)
    console.log('Order ID:', orderId)

    // ETAPA 3: IDENTIFICAR EVENTO
    const isPago = tipo === 'order.paid' || tipo === 'charge.paid'
    const isFalhou = tipo === 'order.payment_failed' || tipo === 'charge.payment_failed'

    if (!isPago && !isFalhou) {
      console.log('Evento ignorado:', tipo)
      return NextResponse.json({ ok: true })
    }

    // ETAPA 4: ACHAR O PAGAMENTO PENDENTE
    const { data: pagamento, error: errBusca } = await supabase
      .from('pagamentos_pendentes')
      .select('*')
      .eq('pagarme_order_id', orderId)
      .maybeSingle()

    if (errBusca || !pagamento) {
      console.error('Pagamento não encontrado para order_id:', orderId)
      return NextResponse.json({ ok: true })
    }

    // IDEMPOTÊNCIA: já foi processado antes?
    if (pagamento.status === 'pago' || pagamento.status === 'falhou') {
      console.log('Evento já processado anteriormente. Ignorando.')
      return NextResponse.json({ ok: true })
    }

    // ETAPA 5A: PAGAMENTO CONFIRMADO
    if (isPago) {
      const { data: venda, error: errVenda } = await supabase.rpc('registrar_venda', {
        p_produto_id: pagamento.produto_id,
        p_cliente_id: pagamento.cliente_id,
        p_quantidade: pagamento.quantidade,
        p_valor_unitario: pagamento.valor_unitario,
        p_forma_pagamento: pagamento.metodo_pagamento,
        p_vendido_por: null,
        p_unidade_id: pagamento.unidade_id,
        p_observacao: 'Venda online via Pagar.me',
      })

      if (errVenda) {
        console.error('Erro ao registrar venda:', errVenda)
        return NextResponse.json({ error: 'Erro ao registrar venda' }, { status: 500 })
      }

      await supabase
        .from('pagamentos_pendentes')
        .update({
          status: 'pago',
          pago_em: new Date().toISOString(),
          venda_id: venda?.venda_id || null,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', pagamento.id)

      console.log('✅ Venda registrada com sucesso. Venda ID:', venda?.venda_id)
    }

    // ETAPA 5B: PAGAMENTO FALHOU
    if (isFalhou) {
      const motivo = body?.data?.charges?.[0]?.last_transaction?.gateway_response?.errors?.[0]?.message || 'Falha no pagamento'

      await supabase
        .from('pagamentos_pendentes')
        .update({
          status: 'falhou',
          motivo_falha: motivo,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', pagamento.id)

      console.log('❌ Pagamento falhou. Motivo:', motivo)
    }

    return NextResponse.json({ ok: true })

  } catch (err: any) {
    console.error('Erro no webhook:', err)
    return NextResponse.json({ error: 'Erro' }, { status: 500 })
  }
}
