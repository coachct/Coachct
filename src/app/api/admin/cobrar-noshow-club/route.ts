import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const PAGARME_API_KEY    = process.env.PAGARME_API_KEY!
const PAGARME_BASE       = 'https://api.pagar.me/core/v5'
const PRODUTO_MULTA_CLUB_ID = '196ac99d-9b0e-45de-b418-471e45e22db3'

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
    const { reserva_id, valor } = body

    if (!reserva_id || !valor || valor <= 0)
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    // Busca a reserva com data/horario via joins
    const { data: reserva, error: errRes } = await supabase
      .from('club_reservas')
      .select(`
        id, cliente_id, status,
        club_ocorrencias(data, club_aulas(horario, unidade_id, unidades(nome)))
      `)
      .eq('id', reserva_id)
      .maybeSingle()

    if (errRes || !reserva)
      return NextResponse.json({ error: 'Reserva não encontrada' }, { status: 404 })
    if (reserva.status !== 'falta')
      return NextResponse.json({ error: 'Reserva não está marcada como falta' }, { status: 400 })

    const oc          = (reserva as any).club_ocorrencias
    const dataAula    = oc?.data || ''
    const horarioAula = (oc?.club_aulas?.horario || '').slice(0, 5)
    const unidadeId   = oc?.club_aulas?.unidade_id || null
    const unidadeNome = oc?.club_aulas?.unidades?.nome || 'JustClub'

    // Busca cliente
    const { data: cliente, error: errCli } = await supabase
      .from('clientes')
      .select('id, nome, cpf, email, pagarme_customer_id, pagarme_card_id, pagarme_card_last4, pagarme_card_brand')
      .eq('id', reserva.cliente_id)
      .maybeSingle()

    if (errCli || !cliente)
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    if (!cliente.pagarme_customer_id || !cliente.pagarme_card_id)
      return NextResponse.json({ error: 'Cliente sem cartão cadastrado' }, { status: 400 })

    // Verifica se já foi cobrado
    const { data: vendaExistente } = await supabase
      .from('vendas').select('id').eq('cliente_id', cliente.id)
      .eq('produto_id', PRODUTO_MULTA_CLUB_ID)
      .ilike('observacao', `%${reserva_id}%`).maybeSingle()
    if (vendaExistente)
      return NextResponse.json({ error: 'Esta falta já foi cobrada anteriormente' }, { status: 400 })

    const valorCentavos = Math.round(Number(valor) * 100)

    const pagarmePayload = {
      customer_id: cliente.pagarme_customer_id,
      items: [{
        amount: valorCentavos,
        description: `Multa No-Show ${unidadeNome} — ${dataAula} ${horarioAula}`,
        quantity: 1,
        code: `multa_club_${reserva_id}`,
      }],
      payments: [{
        payment_method: 'credit_card',
        credit_card: {
          card_id: cliente.pagarme_card_id,
          operation_type: 'auth_and_capture',
          installments: 1,
          statement_descriptor: 'JUSTCLUBMULTA',
        },
      }],
    }

    const auth = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')
    const resPagarme = await fetch(`${PAGARME_BASE}/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pagarmePayload),
    })
    const dataPagarme = await resPagarme.json()

    // Log
    await supabase.from('cartoes_log').insert({
      cliente_id: cliente.id, operacao: 'cobranca_multa_club',
      pagarme_customer_id: cliente.pagarme_customer_id, pagarme_card_id: cliente.pagarme_card_id,
      pagarme_order_id: dataPagarme?.id || null,
      sucesso: resPagarme.ok && (dataPagarme?.status === 'paid'),
      valor: Number(valor), motivo: `Multa no-show club reserva ${reserva_id}`,
      erro: !resPagarme.ok ? JSON.stringify(dataPagarme) : null,
      request_payload: pagarmePayload, response_payload: dataPagarme, operado_por: perfil.id,
    })

    if (!resPagarme.ok || dataPagarme?.status !== 'paid') {
      const errMsg = dataPagarme?.errors?.[0]?.message
        || dataPagarme?.message
        || `Cartão recusado (status: ${dataPagarme?.status || 'desconhecido'})`

      await supabase.from('cobrancas_pendentes').insert({
        cliente_id: cliente.id, valor: Number(valor),
        motivo: `Multa no-show JustClub — ${dataAula} ${horarioAula} — ${unidadeNome}`,
        status: 'pendente', pagarme_order_id: dataPagarme?.id || null,
        criado_por: perfil.id, observacao: `reserva_id: ${reserva_id}`,
      })

      return NextResponse.json({ error: errMsg, cobranca_pendente_criada: true }, { status: 400 })
    }

    // SUCESSO — Insere venda
    const { data: novaVenda, error: errVenda } = await supabase
      .from('vendas').insert({
        produto_id: PRODUTO_MULTA_CLUB_ID, cliente_id: cliente.id, quantidade: 1,
        valor_unitario: Number(valor), valor_total: Number(valor), valor_original: Number(valor),
        desconto_percentual: 0, forma_pagamento: 'cartao_credito', vendido_por: perfil.id,
        unidade_id: unidadeId,
        observacao: `Multa No-Show JustClub — reserva ${reserva_id} — order_id ${dataPagarme.id}`,
      }).select('id').single()

    if (errVenda) {
      console.error('Erro ao inserir venda club:', errVenda)
      return NextResponse.json({
        error: 'Cobrança realizada no cartão, mas falhou ao registrar venda. Contate o suporte.',
        order_id: dataPagarme.id,
      }, { status: 500 })
    }

    // Desbloqueia cliente
    const { error: errDesbloquear } = await supabase
      .from('clientes').update({ bloqueado: false, motivo_bloqueio: null }).eq('id', cliente.id)

    if (errDesbloquear) {
      return NextResponse.json({
        sucesso: true, venda_id: novaVenda.id, order_id: dataPagarme.id,
        valor: Number(valor), cartao: `${cliente.pagarme_card_brand} •••• ${cliente.pagarme_card_last4}`,
        cliente_desbloqueado: false,
        aviso: 'Cobrança realizada mas falha ao desbloquear cliente. Desbloqueie manualmente.',
      })
    }

    return NextResponse.json({
      sucesso: true, venda_id: novaVenda.id, order_id: dataPagarme.id,
      valor: Number(valor), cartao: `${cliente.pagarme_card_brand} •••• ${cliente.pagarme_card_last4}`,
      cliente_desbloqueado: true,
    })

  } catch (err: any) {
    console.error('Erro em /api/admin/cobrar-noshow-club:', err)
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 })
  }
}
