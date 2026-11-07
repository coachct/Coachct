import type { SupabaseClient } from '@supabase/supabase-js'

// Cobrança da multa de no-show no cartão salvo (Pagar.me).
//
// Código que antes vivia dentro de /api/admin/cobrar-cartao-salvo (CT) e
// /api/admin/cobrar-noshow-club (Club), movido pra cá SEM mudar o comportamento,
// pra ser usado também pela rotina automática das 22h (/api/noshow/cobrar-automatico).
//
// `operadoPor` = perfil do admin que clicou; null quando é a rotina automática.
// `simular` = faz todas as checagens (falta, cartão, já cobrada, telefone, CPF) e
// para ANTES de tocar no Pagar.me — nada é gravado, nada é cobrado.

const PAGARME_API_KEY = process.env.PAGARME_API_KEY!
const PAGARME_BASE = 'https://api.pagar.me/core/v5'
export const PRODUTO_MULTA_CT_ID = '7a0e93e1-98b0-4125-a993-7a688e8e34bb'
export const PRODUTO_MULTA_CLUB_ID = '196ac99d-9b0e-45de-b418-471e45e22db3'

export type ResultadoCobranca = { status: number; body: any }

type Opcoes = { operadoPor: string | null; simular?: boolean }

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

const r = (status: number, body: any): ResultadoCobranca => ({ status, body })

type Alvo = {
  cliente: any
  valor: number
  refLabel: string          // 'agendamento' | 'reserva'
  refId: string
  produtoId: string
  pendenciasAbertas: { id: string; status: string }[]
}

// Etapa comum: valida cliente/cartão, trava de "já cobrada" e pendências da mesma falta.
async function checarCliente(
  supabase: SupabaseClient, clienteId: string, refId: string, refKey: 'agendamento_id' | 'reserva_id', produtoId: string,
): Promise<{ erro?: ResultadoCobranca; cliente?: any; pendenciasAbertas?: { id: string; status: string }[] }> {
  const { data: cliente, error: errCli } = await supabase
    .from('clientes').select('id, nome, cpf, email, telefone, pagarme_customer_id, pagarme_card_id, pagarme_card_last4, pagarme_card_brand')
    .eq('id', clienteId).maybeSingle()
  if (errCli || !cliente) return { erro: r(404, { error: 'Cliente não encontrado' }) }
  if (!cliente.pagarme_customer_id || !cliente.pagarme_card_id)
    return { erro: r(400, { error: 'Cliente sem cartão cadastrado' }) }

  // limit(1) e não maybeSingle: com 2 vendas o maybeSingle dá erro, volta null e deixava cobrar de novo
  const { data: vendaExistente } = await supabase
    .from('vendas').select('id').eq('cliente_id', cliente.id).eq('produto_id', produtoId)
    .is('excluido_em', null).ilike('observacao', `%${refId}%`).limit(1)
  if (vendaExistente?.length) return { erro: r(400, { error: 'Esta falta já foi cobrada anteriormente' }) }

  // Pendências desta mesma falta. Sem isso, cada nova tentativa recusada criava OUTRA pendência
  // e o cadastro de cartão cobrava todas (caso Andrea Mari, 21/10/2026).
  const { data: pendenciasFalta } = await supabase
    .from('cobrancas_pendentes').select('id, status').eq('cliente_id', cliente.id)
    .ilike('observacao', `%${refKey}: ${refId}%`).neq('status', 'cancelado')
    .order('cobrado_em', { ascending: true })
  if (pendenciasFalta?.some((p: any) => p.status === 'pago'))
    return { erro: r(400, { error: 'Esta falta já foi paga pelo cliente' }) }
  const pendenciasAbertas = (pendenciasFalta || []).filter((p: any) => p.status === 'pendente')

  // ── Garante CUSTOMER COMPLETO no Pagar.me antes de cobrar (telefone + CPF) ──
  const telCliente = (cliente.telefone || '').replace(/\D/g, '')
  if (!telValido(telCliente)) {
    return { erro: r(400, {
      error: 'Cliente sem telefone válido no cadastro. Atualize o telefone (com DDD) na recepção antes de cobrar.',
      precisa_telefone: true,
    }) }
  }
  const cpfCliente = (cliente.cpf || '').replace(/\D/g, '')
  if (!cpfValido(cpfCliente)) {
    return { erro: r(400, {
      error: 'Cliente sem CPF válido no cadastro. Atualize o CPF na recepção antes de cobrar.',
      precisa_cpf: true,
    }) }
  }
  return { cliente, pendenciasAbertas }
}

// Atualiza o customer no Pagar.me (objeto COMPLETO — PUT parcial é recusado silenciosamente).
async function atualizarCustomer(supabase: SupabaseClient, alvo: Alvo, operadoPor: string | null): Promise<ResultadoCobranca | null> {
  const { cliente, refLabel, refId } = alvo
  const updateCustomerPayload: any = {
    name: cliente.nome,
    email: cliente.email,
    type: 'individual',
    document: (cliente.cpf || '').replace(/\D/g, ''),
    document_type: 'CPF',
    phones: montarPhones((cliente.telefone || '').replace(/\D/g, '')),
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
    motivo: `Atualização de dados (telefone+CPF) antes da cobrança de multa (${refLabel} ${refId})`,
    erro: !putTelResp.ok ? JSON.stringify(putTelData) : null,
    request_payload: { ...updateCustomerPayload, document: '***' },
    response_payload: putTelData, operado_por: operadoPor,
  })

  if (!putTelResp.ok) {
    const putErr = putTelData?.errors
      ? JSON.stringify(putTelData.errors)
      : (putTelData?.message || 'erro desconhecido')
    return r(400, {
      error: `Não foi possível atualizar os dados do cliente no Pagar.me antes de cobrar (${putErr}). Confira os dados do cliente e tente novamente.`,
    })
  }
  return null
}

// Cria o pedido, registra venda/pendência, bloqueia ou desbloqueia. Igual para CT e Club.
async function cobrar(
  supabase: SupabaseClient, alvo: Alvo, operadoPor: string | null,
  p: { descricao: string; code: string; descriptor: string; operacaoLog: string; motivoLog: string;
       motivoPendencia: string; observacaoPendencia: string; observacaoVenda: (orderId: string) => string;
       unidadeId: string | null; erroVendaMsg: string; avisoDesbloqueio: string },
): Promise<ResultadoCobranca> {
  const { cliente, valor, pendenciasAbertas, produtoId } = alvo
  const valorCentavos = Math.round(Number(valor) * 100)

  const pagarmePayload = {
    customer_id: cliente.pagarme_customer_id,
    items: [{ amount: valorCentavos, description: p.descricao, quantity: 1, code: p.code }],
    payments: [{ payment_method: 'credit_card', credit_card: { card_id: cliente.pagarme_card_id, operation_type: 'auth_and_capture', installments: 1, statement_descriptor: p.descriptor } }],
  }

  const resPagarme = await fetch(`${PAGARME_BASE}/orders`, {
    method: 'POST',
    headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(pagarmePayload),
  })
  const dataPagarme = await resPagarme.json()

  await supabase.from('cartoes_log').insert({
    cliente_id: cliente.id, operacao: p.operacaoLog,
    pagarme_customer_id: cliente.pagarme_customer_id, pagarme_card_id: cliente.pagarme_card_id,
    pagarme_order_id: dataPagarme?.id || null,
    sucesso: resPagarme.ok && (dataPagarme?.status === 'paid'),
    valor: Number(valor), motivo: p.motivoLog,
    erro: !resPagarme.ok ? JSON.stringify(dataPagarme) : null,
    request_payload: pagarmePayload, response_payload: dataPagarme, operado_por: operadoPor,
  })

  if (!resPagarme.ok || dataPagarme?.status !== 'paid') {
    const errMsg = dataPagarme?.errors?.[0]?.message || dataPagarme?.message || `Cartão recusado (status: ${dataPagarme?.status || 'desconhecido'})`
    // Já existe pendência aberta desta falta → só atualiza; nunca cria uma segunda
    if (pendenciasAbertas.length) {
      await supabase.from('cobrancas_pendentes').update({
        valor: Number(valor), pagarme_order_id: dataPagarme?.id || null,
      }).eq('id', pendenciasAbertas[0].id)
    } else {
      await supabase.from('cobrancas_pendentes').insert({
        cliente_id: cliente.id, valor: Number(valor),
        motivo: p.motivoPendencia,
        status: 'pendente', pagarme_order_id: dataPagarme?.id || null,
        criado_por: operadoPor, observacao: p.observacaoPendencia,
      })
    }

    // Falha de cobrança é o ÚNICO gatilho de bloqueio (falta isolada nunca bloqueia).
    // Bloqueia o cliente para que o banner vermelho apareça e ele possa pagar sozinho
    // em /cadastrar-cartao (reprocessa a pendência e desbloqueia automaticamente).
    await supabase.from('clientes')
      .update({
        bloqueado: true,
        motivo_bloqueio: 'Multa não paga: o pagamento da sua falta foi recusado. Atualize seu cartão para liberar novos agendamentos.',
      })
      .eq('id', cliente.id)

    return r(400, { error: errMsg, cobranca_pendente_criada: true, cliente_bloqueado: true })
  }

  const { data: novaVenda, error: errVenda } = await supabase
    .from('vendas').insert({
      produto_id: produtoId, cliente_id: cliente.id, quantidade: 1,
      valor_unitario: Number(valor), valor_total: Number(valor), valor_original: Number(valor),
      desconto_percentual: 0, forma_pagamento: 'cartao_credito', vendido_por: operadoPor,
      unidade_id: p.unidadeId,
      observacao: p.observacaoVenda(dataPagarme.id),
    }).select('id').single()

  // Cobrou direto: fecha a pendência aberta desta falta (senão o cadastro de cartão cobraria de novo)
  if (pendenciasAbertas.length) {
    await supabase.from('cobrancas_pendentes').update({
      status: 'pago', pago_em: new Date().toISOString(), pagarme_order_id: dataPagarme.id,
    }).eq('id', pendenciasAbertas[0].id)
    if (pendenciasAbertas.length > 1)
      await supabase.from('cobrancas_pendentes').update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
        .in('id', pendenciasAbertas.slice(1).map(x => x.id))
  }

  if (errVenda) {
    console.error('Erro ao inserir venda de multa:', errVenda)
    return r(500, { error: p.erroVendaMsg, order_id: dataPagarme.id })
  }

  const cartao = `${cliente.pagarme_card_brand} •••• ${cliente.pagarme_card_last4}`
  const { error: errDesbloquear } = await supabase
    .from('clientes').update({ bloqueado: false, motivo_bloqueio: null }).eq('id', cliente.id)

  if (errDesbloquear) {
    return r(200, { sucesso: true, venda_id: novaVenda.id, order_id: dataPagarme.id, valor: Number(valor), cartao, cliente_desbloqueado: false, aviso: p.avisoDesbloqueio })
  }
  return r(200, { sucesso: true, venda_id: novaVenda.id, order_id: dataPagarme.id, valor: Number(valor), cartao, cliente_desbloqueado: true })
}

// ── Coach CT (agendamentos) ────────────────────────────────────────────────
export async function cobrarMultaCT(
  supabase: SupabaseClient, agendamento_id: string, valor: number, { operadoPor, simular }: Opcoes,
): Promise<ResultadoCobranca> {
  const { data: ag, error: errAg } = await supabase
    .from('agendamentos').select('id, cliente_id, data, horario, status, unidade_id')
    .eq('id', agendamento_id).maybeSingle()
  if (errAg || !ag) return r(404, { error: 'Agendamento não encontrado' })
  if (ag.status !== 'falta') return r(400, { error: 'Agendamento não está marcado como falta' })

  const chk = await checarCliente(supabase, ag.cliente_id, agendamento_id, 'agendamento_id', PRODUTO_MULTA_CT_ID)
  if (chk.erro) return chk.erro
  const cliente = chk.cliente
  const cartao = `${cliente.pagarme_card_brand} •••• ${cliente.pagarme_card_last4}`
  if (simular) return r(200, { simulado: true, valor: Number(valor), cartao })

  const alvo: Alvo = { cliente, valor, refLabel: 'agendamento', refId: agendamento_id, produtoId: PRODUTO_MULTA_CT_ID, pendenciasAbertas: chk.pendenciasAbertas! }
  const erroPut = await atualizarCustomer(supabase, alvo, operadoPor)
  if (erroPut) return erroPut

  const horarioFmt = (ag.horario || '').slice(0, 5)
  return cobrar(supabase, alvo, operadoPor, {
    descricao: `Multa No-Show — Agendamento ${ag.data} ${horarioFmt}`,
    code: `multa_${agendamento_id}`,
    descriptor: 'JUSTCT MULTA',
    operacaoLog: 'cobranca_multa',
    motivoLog: `Multa no-show agendamento ${agendamento_id}`,
    motivoPendencia: `Multa no-show — agendamento ${ag.data} ${horarioFmt}`,
    observacaoPendencia: `agendamento_id: ${agendamento_id}`,
    observacaoVenda: (orderId) => `Multa No-Show — agendamento ${agendamento_id} — order_id ${orderId}`,
    unidadeId: ag.unidade_id,
    erroVendaMsg: 'Cobrança realizada no cartão, mas falhou ao registrar venda.',
    avisoDesbloqueio: 'Cobrança realizada mas falha ao desbloquear cliente.',
  })
}

// ── Just Club (club_reservas) ──────────────────────────────────────────────
export async function cobrarMultaClub(
  supabase: SupabaseClient, reserva_id: string, valor: number, { operadoPor, simular }: Opcoes,
): Promise<ResultadoCobranca> {
  const { data: reserva, error: errRes } = await supabase
    .from('club_reservas')
    .select(`
      id, cliente_id, status, via_app,
      club_ocorrencias(data, club_aulas(horario, unidade_id, unidades(nome)))
    `)
    .eq('id', reserva_id)
    .maybeSingle()

  if (errRes || !reserva) return r(404, { error: 'Reserva não encontrada' })
  if (reserva.status !== 'falta') return r(400, { error: 'Reserva não está marcada como falta' })
  // Reserva via app do Wellhub nunca é cobrada pelo estúdio: a punição é do Wellhub
  // e não temos cartão do cliente. Defesa extra além do filtro da tela de no-show.
  if ((reserva as any).via_app === true)
    return r(400, { error: 'Reserva via app do Wellhub não é cobrada pelo estúdio' })

  const oc          = (reserva as any).club_ocorrencias
  const dataAula    = oc?.data || ''
  const horarioAula = (oc?.club_aulas?.horario || '').slice(0, 5)
  const unidadeId   = oc?.club_aulas?.unidade_id || null
  const unidadeNome = oc?.club_aulas?.unidades?.nome || 'JustClub'

  const chk = await checarCliente(supabase, reserva.cliente_id, reserva_id, 'reserva_id', PRODUTO_MULTA_CLUB_ID)
  if (chk.erro) return chk.erro
  const cliente = chk.cliente
  const cartao = `${cliente.pagarme_card_brand} •••• ${cliente.pagarme_card_last4}`
  if (simular) return r(200, { simulado: true, valor: Number(valor), cartao })

  const alvo: Alvo = { cliente, valor, refLabel: 'reserva', refId: reserva_id, produtoId: PRODUTO_MULTA_CLUB_ID, pendenciasAbertas: chk.pendenciasAbertas! }
  const erroPut = await atualizarCustomer(supabase, alvo, operadoPor)
  if (erroPut) return erroPut

  return cobrar(supabase, alvo, operadoPor, {
    descricao: `Multa No-Show ${unidadeNome} — ${dataAula} ${horarioAula}`,
    code: `multa_club_${reserva_id}`,
    descriptor: 'JUSTCLUBMULTA',
    operacaoLog: 'cobranca_multa_club',
    motivoLog: `Multa no-show club reserva ${reserva_id}`,
    motivoPendencia: `Multa no-show JustClub — ${dataAula} ${horarioAula} — ${unidadeNome}`,
    observacaoPendencia: `reserva_id: ${reserva_id}`,
    observacaoVenda: (orderId) => `Multa No-Show JustClub — reserva ${reserva_id} — order_id ${orderId}`,
    unidadeId,
    erroVendaMsg: 'Cobrança realizada no cartão, mas falhou ao registrar venda. Contate o suporte.',
    avisoDesbloqueio: 'Cobrança realizada mas falha ao desbloquear cliente. Desbloqueie manualmente.',
  })
}
