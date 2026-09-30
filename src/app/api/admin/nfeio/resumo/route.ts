// src/app/api/admin/nfeio/resumo/route.ts
//
// GET ?mes=AAAA-MM — só admin. Resumo do mês direto da NFE.io, contando TODAS as
// notas da empresa (as que o Pagar.me emite sozinho + as do balcão emitidas pela
// tela). Balcão = invoice id que está em notas_fiscais; o resto é Pagar.me.
// Só leitura: não emite nem altera nada.

import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { nfeioCompanyId, nfeioListarPagina } from '@/lib/nfeio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PAGINAS = 30

type Bloco = { qtd: number; valor: number }
const novo = (): Bloco => ({ qtd: 0, valor: 0 })

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin()
  const { erro } = await exigirAdmin(req, supabase)
  if (erro) return erro

  const mes = req.nextUrl.searchParams.get('mes') || ''
  if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: 'mes=AAAA-MM' }, { status: 400 })

  // Data de referência no fuso de SP: emissão (issuedOn) ou, se não emitiu, criação
  const mesDaNota = (n: any) => {
    const d = n?.issuedOn || n?.createdOn
    if (!d) return null
    return new Date(new Date(d).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 7)
  }

  let companyId: string
  try { companyId = await nfeioCompanyId() }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'Empresa não encontrada' }, { status: 502 }) }

  const { data: nossas } = await supabase
    .from('notas_fiscais').select('nfeio_invoice_id').not('nfeio_invoice_id', 'is', null)
  const idsBalcao = new Set((nossas || []).map(n => n.nfeio_invoice_id))

  const emitidas = { total: novo(), pagarme: novo(), balcao: novo() }
  const canceladas = novo()
  const com_erro = novo()
  const processando = novo()
  let paginasLidas = 0
  let completo = false

  try {
    for (let p = 1; p <= MAX_PAGINAS; p++) {
      const lista = await nfeioListarPagina(companyId, p)
      paginasLidas = p
      if (!lista.length) { completo = true; break }

      let algumNoMesOuDepois = false
      for (const n of lista) {
        const m = mesDaNota(n)
        if (!m) continue
        if (m >= mes) algumNoMesOuDepois = true
        if (m !== mes) continue

        const valor = Number(n?.servicesAmount) || 0
        const add = (b: Bloco) => { b.qtd++; b.valor += valor }
        switch (n?.flowStatus) {
          case 'Issued':
          case 'WaitingSendCancel':
          case 'CancelFailed':
            add(emitidas.total)
            add(idsBalcao.has(n.id) ? emitidas.balcao : emitidas.pagarme)
            break
          case 'Cancelled': add(canceladas); break
          case 'IssueFailed': add(com_erro); break
          default: add(processando)
        }
      }
      // Lista vem da mais nova pra mais antiga: página inteira anterior ao mês = acabou
      if (!algumNoMesOuDepois) { completo = true; break }
      if (lista.length < 50) { completo = true; break }
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Falha ao consultar a NFE.io' }, { status: 502 })
  }

  const arred = (b: Bloco) => ({ qtd: b.qtd, valor: Math.round(b.valor * 100) / 100 })
  return NextResponse.json({
    mes,
    emitidas: { total: arred(emitidas.total), pagarme: arred(emitidas.pagarme), balcao: arred(emitidas.balcao) },
    canceladas: arred(canceladas),
    com_erro: arred(com_erro),
    processando: arred(processando),
    completo,
    paginas: paginasLidas,
  })
}
