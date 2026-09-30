// src/app/api/admin/nfeio/emitir/route.ts
//
// POST { venda_ids: string[] } — só admin. Emite NFS-e na NFE.io para vendas de
// balcão escolhidas na tela "Notas Fiscais". Uma venda por vez (sem paralelo);
// a tela manda em lotes pequenos pra caber no tempo da função.
//
// Travas (mesmas da RPC notas_fiscais_vendas, repetidas aqui porque a rota é a
// porta de verdade):
//   - venda do site (pagamentos_pendentes.venda_id) e multa no cartão salvo
//     (observacao "order_id or_") já têm nota pelo Pagar.me -> recusa;
//   - cortesia / valor 0 -> recusa;
//   - cliente sem CPF válido ou sem e-mail -> recusa ("corrigir cadastro");
//   - já existe nota enviando/emitida/cancelando -> recusa (índice único garante);
//   - nota em erro -> reaproveita a mesma linha (Reenviar).
// A linha nasce 'enviando' ANTES da chamada; se a API falhar vira 'erro' com a mensagem.

import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { cpfValido, nfeioAmbiente, nfeioAtivo, nfeioCompanyId, nfeioEmitir, statusDoFlow } from '@/lib/nfeio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_POR_CHAMADA = 5

type Resultado = { venda_id: string; ok: boolean; status?: string; motivo?: string }

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin()
  const { erro, userId } = await exigirAdmin(req, supabase)
  if (erro) return erro

  if (!nfeioAtivo())
    return NextResponse.json({ error: 'Emissão desligada (NFEIO_ATIVO). Nada foi enviado.' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body?.venda_ids) ? [...new Set(body.venda_ids as string[])] : []
  if (!ids.length) return NextResponse.json({ error: 'Nenhuma venda informada' }, { status: 400 })
  if (ids.length > MAX_POR_CHAMADA)
    return NextResponse.json({ error: `Máximo de ${MAX_POR_CHAMADA} vendas por chamada` }, { status: 400 })

  let companyId: string
  try {
    companyId = await nfeioCompanyId()
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Empresa não encontrada na NFE.io' }, { status: 502 })
  }
  const ambiente = nfeioAmbiente()

  const resultados: Resultado[] = []
  for (const vendaId of ids) {
    resultados.push(await emitirUma(supabase, vendaId, companyId, ambiente, userId))
  }
  return NextResponse.json({ resultados })
}

async function emitirUma(
  supabase: ReturnType<typeof supabaseAdmin>,
  vendaId: string,
  companyId: string,
  ambiente: 'teste' | 'producao',
  userId: string
): Promise<Resultado> {
  const { data: venda } = await supabase
    .from('vendas')
    .select('id, cliente_id, unidade_id, valor_total, forma_pagamento, observacao, excluido_em')
    .eq('id', vendaId).maybeSingle()
  if (!venda || venda.excluido_em) return { venda_id: vendaId, ok: false, motivo: 'Venda não encontrada' }

  const valor = Number(venda.valor_total) || 0
  if (valor <= 0 || venda.forma_pagamento === 'cortesia')
    return { venda_id: vendaId, ok: false, motivo: 'Venda sem valor (cortesia)' }
  if (/order_id or_/.test(venda.observacao || ''))
    return { venda_id: vendaId, ok: false, motivo: 'Cobrada pelo Pagar.me (já tem nota)' }

  const { data: online } = await supabase
    .from('pagamentos_pendentes').select('id').eq('venda_id', vendaId).limit(1)
  if (online?.length) return { venda_id: vendaId, ok: false, motivo: 'Venda do site (já tem nota pelo Pagar.me)' }

  const { data: cliente } = await supabase
    .from('clientes').select('nome, cpf, email').eq('id', venda.cliente_id).maybeSingle()
  const email = (cliente?.email || '').trim()
  if (!cliente || !cpfValido(cliente.cpf || '') || !/^\S+@\S+\.\S+$/.test(email))
    return { venda_id: vendaId, ok: false, motivo: 'Corrigir cadastro (CPF ou e-mail)' }

  // Reserva a nota (status 'enviando') antes de chamar a API
  let notaId: string
  const { data: existente } = await supabase
    .from('notas_fiscais').select('id, status')
    .eq('venda_id', vendaId).eq('ambiente', ambiente).neq('status', 'cancelada')
    .maybeSingle()

  if (existente) {
    if (existente.status !== 'erro')
      return { venda_id: vendaId, ok: false, motivo: 'Venda já tem nota' }
    const { data: reaberta } = await supabase
      .from('notas_fiscais')
      .update({ status: 'enviando', mensagem_erro: null, nfeio_invoice_id: null, numero_nota: null,
                emitida_por: userId, company_id_nfeio: companyId, valor })
      .eq('id', existente.id).eq('status', 'erro')
      .select('id').maybeSingle()
    if (!reaberta) return { venda_id: vendaId, ok: false, motivo: 'Venda já tem nota' }
    notaId = reaberta.id
  } else {
    const { data: nova, error: errIns } = await supabase
      .from('notas_fiscais')
      .insert({ venda_id: vendaId, unidade_id: venda.unidade_id, ambiente, company_id_nfeio: companyId,
                status: 'enviando', valor, emitida_por: userId })
      .select('id').single()
    if (errIns || !nova)
      return { venda_id: vendaId, ok: false, motivo: errIns?.code === '23505' ? 'Venda já tem nota' : (errIns?.message || 'Falha ao registrar a nota') }
    notaId = nova.id
  }

  try {
    const { invoiceId, dados } = await nfeioEmitir(
      companyId,
      { nome: cliente.nome, cpf: cliente.cpf, email },
      valor,
      `${notaId}.${Date.now()}`
    )
    const status = statusDoFlow(dados?.flowStatus, 'enviando') || 'enviando'
    await supabase.from('notas_fiscais').update({
      nfeio_invoice_id: invoiceId,
      status,
      numero_nota: dados?.number ? String(dados.number) : null,
      mensagem_erro: status === 'erro' ? (dados?.flowMessage || 'Emissão recusada') : null,
    }).eq('id', notaId)
    return { venda_id: vendaId, ok: status !== 'erro', status }
  } catch (e: any) {
    const msg = e?.message || 'Falha ao chamar a NFE.io'
    await supabase.from('notas_fiscais').update({ status: 'erro', mensagem_erro: msg }).eq('id', notaId)
    return { venda_id: vendaId, ok: false, status: 'erro', motivo: msg }
  }
}
