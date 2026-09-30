// src/app/api/admin/nfeio/pdf/route.ts
//
// GET ?nota_id=... — só admin. Baixa o PDF da nota na NFE.io (a URL de lá exige
// a chave, então passa por aqui). A tela abre o arquivo num blob.

import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { nfeioPdf } from '@/lib/nfeio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin()
  const { erro } = await exigirAdmin(req, supabase)
  if (erro) return erro

  const notaId = req.nextUrl.searchParams.get('nota_id')
  if (!notaId) return NextResponse.json({ error: 'nota_id obrigatório' }, { status: 400 })

  const { data: nota } = await supabase
    .from('notas_fiscais').select('company_id_nfeio, nfeio_invoice_id, numero_nota, status')
    .eq('id', notaId).maybeSingle()
  if (!nota?.nfeio_invoice_id || !['emitida', 'cancelando', 'cancelada'].includes(nota.status))
    return NextResponse.json({ error: 'Nota sem PDF' }, { status: 404 })

  try {
    const pdf = await nfeioPdf(nota.company_id_nfeio, nota.nfeio_invoice_id)
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="NFSe_${nota.numero_nota || notaId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Falha ao baixar o PDF' }, { status: 502 })
  }
}
