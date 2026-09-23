// GET /api/totem/ct-checkins?unidade=
// Feed do totem CT: check-ins de musculação recentes que ainda NÃO apareceram
// na tela. O totem mostra "Nome · Entrada liberada" por 10s e carimba
// confirmado_totem_em (a validação no parceiro já foi feita por trás).
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

    // só check-in recente: totem religado não mostra "entrada liberada" de horas atrás
    const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString()
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
