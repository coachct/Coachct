// src/app/api/admin/nfeio/sincronizar/route.ts
//
// POST { nota_ids?: string[] } — só admin. Consulta na NFE.io as notas em
// andamento (enviando/cancelando) e grava status, número e erro. Sem nota_ids,
// pega as pendentes mais antigas. Funciona mesmo sem o webhook cadastrado.

import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { sincronizarNota } from '@/lib/nfeio-notas'
import { nfeioAmbiente, nfeioAtivo } from '@/lib/nfeio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET — a tela pergunta se a emissão está ligada (sem expor a chave)
export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin()
  const { erro } = await exigirAdmin(req, supabase)
  if (erro) return erro
  return NextResponse.json({
    ativo: nfeioAtivo(),
    ambiente: nfeioAmbiente(),
    chave_configurada: !!process.env.NFEIO_API_KEY,
    // diagnóstico: o que o servidor recebeu em NFEIO_ATIVO (não é segredo)
    valor_ativo: process.env.NFEIO_ATIVO === undefined ? null : JSON.stringify(process.env.NFEIO_ATIVO),
    ambiente_vercel: process.env.VERCEL_ENV || null,
  })
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin()
  const { erro } = await exigirAdmin(req, supabase)
  if (erro) return erro

  const body = await req.json().catch(() => ({}))
  let q = supabase
    .from('notas_fiscais')
    .select('id, status, company_id_nfeio, nfeio_invoice_id')
    .not('nfeio_invoice_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(25)
  if (Array.isArray(body?.nota_ids) && body.nota_ids.length) q = q.in('id', body.nota_ids.slice(0, 25))
  else q = q.in('status', ['enviando', 'cancelando'])

  const { data: notas, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultados = []
  for (const n of notas || []) resultados.push(await sincronizarNota(supabase, n))
  return NextResponse.json({ resultados })
}
