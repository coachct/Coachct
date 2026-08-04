// POST /api/totem/identificar  { unidade, cpf }
// Identifica o cliente por CPF e devolve a resposta do totem (reserva/sem_reserva/bloqueado).
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeClub, totemTokenOk, respostaParaCliente } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })

    const body = await req.json().catch(() => ({} as any))
    const cpf = String(body?.cpf || '').replace(/\D/g, '')

    const sb = totemService()
    const unidade = await resolverUnidadeClub(sb, String(body?.unidade || ''))
    if (!unidade) return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })
    if (cpf.length !== 11) return NextResponse.json({ resultado: 'cpf_invalido' })

    const { data: cliente } = await sb
      .from('clientes')
      .select('id, nome, bloqueado')
      .eq('cpf', cpf)
      .maybeSingle()

    if (!cliente) return NextResponse.json({ resultado: 'nao_encontrado' })

    const test = body?.test === true || body?.test === '1'
    return NextResponse.json(await respostaParaCliente(sb, unidade, cliente, { ignorarEncerrada: test }))
  } catch (e: any) {
    return NextResponse.json({ erro: 'falha', detalhe: String(e?.message || e) }, { status: 500 })
  }
}
