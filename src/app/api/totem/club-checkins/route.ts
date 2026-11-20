// GET /api/totem/club-checkins?unidade=
// Feed do totem Club: check-ins de parceiro (Wellhub/TotalPass) recentes que já
// viraram PRESENÇA numa reserva de hoje e ainda NÃO apareceram na tela. O totem
// mostra o card "Nome · Presença confirmada" com aula/horário/coach/posição e
// carimba confirmado_totem_em (via /api/totem/ct-confirmar-entrada).
//
// Só LEITURA: não marca presença nem valida nada — isso continua nos webhooks.
// Check-in sem reserva (erro_motivo preenchido) não aparece: fica com a recepção.
// Check-in cuja presença ainda não foi marcada (o webhook marca em segundo
// plano) fica de fora desta rodada e entra no próximo poll.
//
// ?historico=1 → lista da recepção (botão discreto no totem): todos os check-ins
// de HOJE com presença confirmada, já mostrados ou não, do mais novo pro mais
// antigo, com a hora do check-in. Não carimba nada.
import { NextRequest, NextResponse } from 'next/server'
import { totemService, resolverUnidadeTotem, totemTokenOk } from '@/lib/totem/service'
import { hojeSP, partesSP } from '@/lib/tempo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// totem religado não mostra presença de muito tempo atrás
const JANELA_MIN = 5

// Ritmo da consulta do totem: rápido só perto do início de uma aula (98% dos
// check-ins caem entre 30 min antes e 25 min depois); fora disso não há check-in.
const POLL_RAPIDO_MS = 2000
const POLL_LENTO_MS = 30000
const JANELA_AULA_MIN = 30 // antes e depois do início da aula
const HORARIOS_TTL_MS = 5 * 60 * 1000
const horariosCache = new Map<string, { em: number; inicios: number[] }>()

const soDigitos = (v: any) => String(v ?? '').replace(/\D/g, '')

// "Mariana de Souza Costa" → "Mariana Costa"
function nomeCurto(nome: string): string {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (p.length <= 2) return p.join(' ')
  return `${p[0]} ${p[p.length - 1]}`
}

// minutos desde 00:00 a partir de "HH:MM[:SS]"
function minutos(h: string): number {
  const [hh, mm] = String(h || '').split(':')
  return (parseInt(hh, 10) || 0) * 60 + (parseInt(mm, 10) || 0)
}
// hora do check-in em minutos (horário de São Paulo)
function minutosSP(iso: string): number {
  return minutos(partesSP(new Date(iso))?.hora || '')
}

// De quanto em quanto tempo o totem deve voltar a consultar. Os horários das
// aulas de hoje ficam em memória por 5 min (não consulta o banco a cada poll).
// Na dúvida (erro), devolve o ritmo rápido — nunca atrasa o card por falha nossa.
async function ritmoDoPoll(sb: any, unidadeId: string, hoje: string): Promise<number> {
  try {
    const chave = `${unidadeId}:${hoje}`
    let c = horariosCache.get(chave)
    if (!c || Date.now() - c.em > HORARIOS_TTL_MS) {
      const { data, error } = await sb
        .from('club_ocorrencias')
        .select('aula:club_aulas ( horario, unidade_id )')
        .eq('data', hoje)
        .eq('status', 'ativa')
      if (error) return POLL_RAPIDO_MS
      const inicios = ((data || []) as any[])
        .filter((o) => o.aula?.unidade_id === unidadeId)
        .map((o) => minutos(o.aula.horario))
      c = { em: Date.now(), inicios }
      // limpa só o que é de outro dia (as duas unidades dividem o cache)
      Array.from(horariosCache.keys()).forEach((k) => { if (!k.endsWith(`:${hoje}`)) horariosCache.delete(k) })
      horariosCache.set(chave, c)
    }
    const agora = minutos(partesSP(new Date())?.hora || '')
    return c.inicios.some((i) => Math.abs(i - agora) <= JANELA_AULA_MIN) ? POLL_RAPIDO_MS : POLL_LENTO_MS
  } catch {
    return POLL_RAPIDO_MS
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!totemTokenOk(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const sb = totemService()
    const unidade = await resolverUnidadeTotem(sb, String(searchParams.get('unidade') || ''))
    if (!unidade) return NextResponse.json({ erro: 'unidade_invalida' }, { status: 400 })
    if (unidade.tipo !== 'club') return NextResponse.json({ checkins: [] })

    const historico = searchParams.get('historico') === '1'
    const hoje = hojeSP()
    const proximoMs = historico ? undefined : await ritmoDoPoll(sb, unidade.id, hoje)
    // feed: só os últimos minutos; histórico: desde 00:00 de hoje (SP, UTC-3)
    const desde = historico
      ? new Date(`${hoje}T00:00:00-03:00`).toISOString()
      : new Date(Date.now() - JANELA_MIN * 60 * 1000).toISOString()
    let q = sb
      .from('entradas_walkin')
      .select('id, origem, id_externo, recebido_em, raw')
      .eq('unidade_id', unidade.id)
      .eq('status', 'aula')
      .in('origem', ['wellhub', 'totalpass'])
      .is('erro_motivo', null)
      .gte('recebido_em', desde)
    if (!historico) q = q.is('confirmado_totem_em', null)
    const { data: entradas, error } = await q
      .order('recebido_em', { ascending: false })
      .limit(historico ? 40 : 12)
    if (error || !entradas?.length) return NextResponse.json({ checkins: [], proximoMs })

    const coachCache = new Map<string, string>()
    const checkins: any[] = []

    for (const e of entradas as any[]) {
      // 1) quem é: Wellhub pelo wellhub_id (o webhook grava no cliente ao casar a
      //    reserva); TotalPass pelo CPF que vem no check-in.
      let cliente: { id: string; nome: string } | null = null
      if (e.origem === 'wellhub') {
        if (!e.id_externo) continue
        const { data } = await sb.from('clientes').select('id, nome').eq('wellhub_id', String(e.id_externo)).limit(1)
        cliente = (data && data[0]) || null
      } else {
        const cpf = soDigitos(e.raw?.user?.document_number)
        if (cpf.length !== 11) continue
        const { data } = await sb.from('clientes').select('id, nome').eq('cpf', cpf).limit(1)
        cliente = (data && data[0]) || null
      }
      if (!cliente) continue

      // 2) a reserva de HOJE nesta unidade que o check-in marcou como presente
      const { data: reservas } = await sb
        .from('club_reservas')
        .select(`
          id, posicao, tipo_credito,
          ocorrencia:club_ocorrencias (
            coach_id, data, status,
            aula:club_aulas ( tipo, horario, coach_id, unidade_id )
          )
        `)
        .eq('cliente_id', cliente.id)
        .eq('status', 'presente')
        .ilike('tipo_credito', `${e.origem}%`)

      const agora = minutosSP(e.recebido_em)
      const candidatas = ((reservas || []) as any[])
        .map((r) => {
          const o = r.ocorrencia
          const a = o?.aula
          if (!o || !a) return null
          if (o.data !== hoje || o.status !== 'ativa' || a.unidade_id !== unidade.id) return null
          const inicio = minutos(a.horario)
          // mesma janela que o webhook usa pra marcar presença (com folga de atraso)
          if (inicio < agora - 180 || inicio > agora + 120) return null
          return {
            dist: Math.abs(inicio - agora),
            aulaTipo: a.tipo as string,
            horario: String(a.horario || '').slice(0, 5),
            coachId: (o.coach_id || a.coach_id || null) as string | null,
            posicao: (r.posicao || null) as string | null,
          }
        })
        .filter(Boolean) as any[]
      if (!candidatas.length) continue // presença ainda não marcada → tenta no próximo poll

      candidatas.sort((x, y) => x.dist - y.dist)
      const c = candidatas[0]

      let coach = ''
      if (c.coachId) {
        if (!coachCache.has(c.coachId)) {
          const { data: co } = await sb.from('coaches').select('nome').eq('id', c.coachId).maybeSingle()
          coachCache.set(c.coachId, String((co as any)?.nome || '').split(' ')[0])
        }
        coach = coachCache.get(c.coachId) || ''
      }

      checkins.push({
        id: e.id as string,
        nome: nomeCurto(cliente.nome),
        aulaTipo: c.aulaTipo,
        horario: c.horario,
        coach,
        posicao: c.aulaTipo === 'running_funcional' ? c.posicao : null,
        hora: partesSP(new Date(e.recebido_em))?.hora || '',
        origem: e.origem === 'totalpass' ? 'TotalPass' : 'Wellhub',
      })
    }

    return NextResponse.json({ checkins, proximoMs })
  } catch {
    return NextResponse.json({ checkins: [] })
  }
}
