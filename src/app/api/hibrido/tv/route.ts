// POST /api/hibrido/tv  { pin, faixa? }
// TV da sala de Running (Vila Olímpia), entrada pelo mesmo PIN dos coaches (/playlist).
// Sem faixa: aulas de Running & Hybrid de hoje com as reservas e a faixa sugerida, e o que está
// programado em cada faixa. Com faixa: devolve o treino programado para hoje nessa faixa.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/api-admin'
import { hojeSP } from '@/lib/tempo'
import { conferirPin } from '@/lib/playlist'
import { UNIDADE_VO, FAIXA_PADRAO, carregarTreino, faixaDeAlunos, faixaComTreino } from '@/lib/hibrido'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const sb = supabaseAdmin()
    const erroPin = await conferirPin(sb, body?.pin)
    if (erroPin) return NextResponse.json({ error: erroPin }, { status: 401 })
    const hoje = hojeSP()

    const { data: progs } = await sb
      .from('hibrido_programacao')
      .select('faixa, treino_id, hibrido_treinos(nome)')
      .eq('data', hoje)
      .eq('unidade_id', UNIDADE_VO)
    const programado: Record<number, { treino_id: string; nome: string }> = {}
    ;(progs || []).forEach((p: any) => { programado[p.faixa] = { treino_id: p.treino_id, nome: p.hibrido_treinos?.nome || '' } })
    // O treino da Faixa 2 também serve na Faixa 3 (quando a 3 não tem o próprio)
    const porFaixa: Record<number, { treino_id: string; nome: string; da_faixa: number }> = {}
    for (const f of [1, 2, 3]) {
      const origem = faixaComTreino(f, Object.keys(programado).map(Number))
      if (origem) porFaixa[f] = { ...programado[origem], da_faixa: origem }
    }

    const faixa = Number(body?.faixa)
    if ([1, 2, 3].includes(faixa)) {
      const prog = porFaixa[faixa]
      if (!prog) return NextResponse.json({ error: `Sem treino programado hoje na Faixa ${faixa}.` }, { status: 404 })
      const treino = await carregarTreino(sb, prog.treino_id)
      if (!treino) return NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 })
      return NextResponse.json({ treino })
    }

    // Aulas de Running & Hybrid de hoje na VO, com reservas ativas (reservado + presente)
    const { data: ocs } = await sb
      .from('club_ocorrencias')
      .select('id, status, club_aulas!inner(horario, tipo, unidade_id), club_reservas(status)')
      .eq('data', hoje)
      .neq('status', 'cancelada')
      .eq('club_aulas.tipo', 'treino_hibrido')
      .eq('club_aulas.unidade_id', UNIDADE_VO)
    const aulas = (ocs || [])
      .map((o: any) => {
        const reservas = (o.club_reservas || []).filter((r: any) => r.status === 'reservado' || r.status === 'presente').length
        return { id: o.id, horario: String(o.club_aulas.horario).slice(0, 5), reservas, faixa: FAIXA_PADRAO ?? faixaDeAlunos(reservas) }
      })
      .sort((a: any, b: any) => a.horario.localeCompare(b.horario))

    return NextResponse.json({ data: hoje, aulas, programacao: porFaixa })
  } catch (err: any) {
    console.error('Erro em POST /api/hibrido/tv:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
