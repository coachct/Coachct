// src/app/api/admin/nfeio/cancelar/route.ts
//
// POST { nota_id } — só admin. Pede o cancelamento de uma nota EMITIDA na NFE.io.
// O cancelamento é assíncrono: a linha vai pra 'cancelando' e vira 'cancelada'
// quando a NFE.io confirmar (consulta na hora, depois "Atualizar status"/webhook).
// Se a prefeitura recusar, a nota volta pra 'emitida' com o motivo em mensagem_erro.

import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { nfeioAtivo, nfeioCancelar } from '@/lib/nfeio'
import { sincronizarNota } from '@/lib/nfeio-notas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin()
  const { erro, userId } = await exigirAdmin(req, supabase)
  if (erro) return erro

  if (!nfeioAtivo())
    return NextResponse.json({ error: 'Emissão desligada (NFEIO_ATIVO). Nada foi enviado.' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  if (!body?.nota_id) return NextResponse.json({ error: 'nota_id obrigatório' }, { status: 400 })

  // Trava a linha: só sai de 'emitida' uma vez
  const { data: nota } = await supabase
    .from('notas_fiscais')
    .update({ status: 'cancelando', cancelada_por: userId, mensagem_erro: null })
    .eq('id', body.nota_id).eq('status', 'emitida')
    .select('id, status, company_id_nfeio, nfeio_invoice_id')
    .maybeSingle()
  if (!nota) return NextResponse.json({ error: 'Só dá pra cancelar nota emitida' }, { status: 409 })
  if (!nota.nfeio_invoice_id) {
    await supabase.from('notas_fiscais').update({ status: 'emitida' }).eq('id', nota.id)
    return NextResponse.json({ error: 'Nota sem id da NFE.io' }, { status: 409 })
  }

  try {
    await nfeioCancelar(nota.company_id_nfeio, nota.nfeio_invoice_id)
  } catch (e: any) {
    const msg = e?.message || 'Falha ao cancelar na NFE.io'
    await supabase.from('notas_fiscais')
      .update({ status: 'emitida', cancelada_por: null, mensagem_erro: `Cancelamento recusado: ${msg}` })
      .eq('id', nota.id)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const r = await sincronizarNota(supabase, nota)
  return NextResponse.json({ ok: true, status: r.status })
}
