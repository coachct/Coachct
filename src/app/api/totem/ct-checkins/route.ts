// GET /api/totem/ct-checkins?unidade=
// Feed do totem CT: check-ins de musculação recentes que a pessoa ainda NÃO
// confirmou na tela. Serve pra ela tocar "Confirmar" e a gente ter uma
// conferência mesmo sem catraca (a validação no parceiro já foi feita por trás).
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeTotem, totemTokenOk } from '@/lib/totem/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function nomeDoRaw(raw: any): string | null {
  const tp = raw?.user?.name
  if (tp) return String(tp)
  const fn = raw?.event_data?.user?.first_name
  const ln = raw?.event_data?.user?.last_name
  const wh = [fn, ln].filter(Boolean).join(' ').trim()
  return wh || null
}
function origemLabel(o: string): string {
  if (o === 'totalpass') return 'TotalPass'
  if (o === 'wellhub') return 'Wellhub'
  return o
}

export async function GET(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const sb = totemService()
    const unidade = await resolverUnidadeTotem(sb, String(searchParams.get('unidade') || ''))
    if (!unidade) return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })
    if (unidade.tipo !== 'ct') return NextResponse.json({ checkins: [] })

    const desde = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    const { data, error } = await sb
      .from('entradas_walkin')
      .select('id, origem, produto, recebido_em, raw')
      .eq('unidade_id', unidade.id)
      .in('status', ['validado', 'recebido'])
      .is('confirmado_totem_em', null)
      .is('coach_ct_agendamento_id', null)        // esconde só Coach CT COM reserva (fluxo de coach próprio); walk-in Personal aparece
      .gte('recebido_em', desde)
      .order('recebido_em', { ascending: false })
      .limit(8)
    if (error) return NextResponse.json({ checkins: [] }) // coluna ainda não criada / erro → feed vazio

    const checkins = (data || [])
      .map((e: any) => {
        const nome = nomeDoRaw(e.raw)
        return nome ? { id: e.id as string, nome, origem: origemLabel(e.origem) } : null
      })
      .filter(Boolean)
    return NextResponse.json({ checkins })
  } catch {
    return NextResponse.json({ checkins: [] })
  }
}
