// Bloqueio de acesso do coach encerrado.
//
// POR QUE EXISTE: coaches.data_saida já tira o coach da grade a partir do dia
// seguinte (trigger que espelha em coach_ferias). Falta o acesso: no dia seguinte
// à última data ele não deve mais conseguir entrar no sistema.
//
// O QUE FAZ: varre os coaches ativos cuja data_saida já passou (data_saida < hoje
// em São Paulo) e aplica o mesmo bloqueio de "Desativar coach": coaches.ativo=false
// + ban no Auth. Idempotente — quem já está inativo não é tocado de novo.
//
// NÃO apaga coach_horarios (o "Desativar coach" apaga). A grade dele é o insumo do
// cálculo de horas da rescisão: se a rescisão for gerada depois do bloqueio, as horas
// precisam continuar lá.
//
// GET  = cron da Vercel (Authorization: Bearer CRON_SECRET), roda todo dia 00:05 SP.
// POST = gatilho da tela de Coaches quando se salva uma data de saída que já passou,
//        para não esperar até a virada do dia. Só age sobre quem já tem a data vencida.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || ''

function hojeSP() {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

async function encerrarVencidos(coachId?: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const hoje = hojeSP()

  let q = supabase.from('coaches')
    .select('id, nome, user_id, data_saida')
    .eq('ativo', true)
    .not('data_saida', 'is', null)
    .lt('data_saida', hoje)
  if (coachId) q = q.eq('id', coachId)

  const { data: vencidos, error } = await q
  if (error) throw new Error(error.message)

  const bloqueados: string[] = []
  const falhas: string[] = []

  for (const c of (vencidos || [])) {
    const { error: errUpd } = await supabase.from('coaches').update({ ativo: false }).eq('id', c.id)
    if (errUpd) { falhas.push(`${c.nome}: ${errUpd.message}`); continue }
    if (c.user_id) {
      const { error: errBan } = await supabase.auth.admin.updateUserById(c.user_id, {
        ban_duration: '87600h', // 10 anos = bloqueio permanente na prática
      })
      // O coach já saiu da grade e está inativo; falha no ban é reportada, não derruba.
      if (errBan) falhas.push(`${c.nome} (auth): ${errBan.message}`)
    }
    bloqueados.push(c.nome)
  }

  return { hoje, bloqueados, falhas }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'falta env SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await encerrarVencidos()) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'erro' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'falta env SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  try {
    const { coach_id } = await req.json().catch(() => ({ coach_id: undefined }))
    // Sem coach_id age igual ao cron; com coach_id, só aquele coach. Em qualquer caso
    // a regra é a mesma: só bloqueia quem TEM data de saída e ela já passou.
    return NextResponse.json({ ok: true, ...(await encerrarVencidos(coach_id)) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'erro' }, { status: 500 })
  }
}
