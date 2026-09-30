// src/app/api/nfeio/webhook/route.ts
//
// Recebe os eventos da NFE.io (entrega "pelo menos uma vez").
// Não confia no conteúdo: só tira dele o id da nota e reconsulta a própria
// NFE.io antes de gravar — duplicado vira no-op, payload forjado não muda nada.
// Com NFEIO_WEBHOOK_SECRET configurada, exige X-Hub-Signature (HMAC-SHA1) válida.
// Sempre responde 200 rápido pra não gerar reentrega em loop.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/api-admin'
import { nfeioAssinaturaValida } from '@/lib/nfeio'
import { sincronizarNota } from '@/lib/nfeio-notas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function acharInvoiceId(j: any): string | null {
  const candidatos = [j?.id, j?.data?.id, j?.serviceInvoice?.id, j?.payload?.id, j?.invoice?.id, j?.data?.serviceInvoice?.id]
  const id = candidatos.find(v => typeof v === 'string' && v.length > 0)
  return id || null
}

export async function POST(req: NextRequest) {
  const cru = await req.text()

  const segredo = process.env.NFEIO_WEBHOOK_SECRET
  if (segredo && !nfeioAssinaturaValida(cru, req.headers.get('x-hub-signature'), segredo))
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })

  let j: any = null
  try { j = JSON.parse(cru) } catch { return NextResponse.json({ ok: true, ignorado: 'corpo inválido' }) }

  const invoiceId = acharInvoiceId(j)
  if (!invoiceId) return NextResponse.json({ ok: true, ignorado: 'sem id' })

  const supabase = supabaseAdmin()
  const { data: nota } = await supabase
    .from('notas_fiscais')
    .select('id, status, company_id_nfeio, nfeio_invoice_id')
    .eq('nfeio_invoice_id', invoiceId)
    .maybeSingle()
  // Nota que não é nossa (ex.: emitida pela integração Pagar.me): ignora
  if (!nota) return NextResponse.json({ ok: true, ignorado: 'nota de outra origem' })

  const r = await sincronizarNota(supabase, nota)
  return NextResponse.json({ ok: true, status: r.status })
}
