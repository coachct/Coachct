// src/lib/totem/coach-ct.ts
//
// Fluxo Coach CT no totem: detectar o agendamento do dia, montar os coaches
// disponíveis daquele horário (mesma regra da recepção) e confirmar a escolha.
// Isolado; só as rotas /api/totem/coach-ct-* usam.

import { SupabaseClient } from '@supabase/supabase-js'
import { gradeExtraDoDia } from '@/lib/grade'

const HORARIOS_FDS = ['08:00', '09:00', '10:00', '11:00', '12:00']

function norm(h: string): string { return (h || '').slice(0, 5) }

export type AgendamentoCoachCt = {
  id: string
  horario: string          // HH:MM
  presente: boolean        // presença já marcada (check-in Personal validado)
  coachId: string | null
  coachNome: string | null
}

// Agendamento Coach CT relevante da pessoa HOJE nesta unidade (o mais próximo do
// horário atual, entre agendado/confirmado/realizado — ignora cancelado/falta).
export async function agendamentoCoachCtHoje(
  sb: SupabaseClient,
  unidadeId: string,
  clienteId: string,
  hoje: string
): Promise<AgendamentoCoachCt | null> {
  const { data } = await sb
    .from('agendamentos')
    .select('id, horario, status, coach_id, presenca_checkin, coaches:coach_id ( id, nome )')
    .eq('cliente_id', clienteId)
    .eq('unidade_id', unidadeId)
    .eq('data', hoje)
    .in('status', ['agendado', 'confirmado', 'realizado'])
  if (!data || !data.length) return null

  // escolhe o mais próximo do horário atual (SP)
  const agoraMin = (() => {
    const t = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false })
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  })()
  const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
  const rows = (data as any[]).slice().sort((a, b) =>
    Math.abs(toMin(norm(a.horario)) - agoraMin) - Math.abs(toMin(norm(b.horario)) - agoraMin)
  )
  const ag = rows[0]
  const coach = ag.coaches
  return {
    id: ag.id as string,
    horario: norm(ag.horario),
    presente: ag.status === 'realizado' || ag.presenca_checkin === true,
    coachId: (ag.coach_id as string) || null,
    coachNome: coach?.nome ?? null,
  }
}

// Coaches escalados NAQUELE horário/dia/unidade (grade base + fds + grade extra,
// menos férias) que ainda NÃO estão alocados a outro agendamento no mesmo slot.
// Espelha a lógica da tela da recepção.
export async function coachesDisponiveis(
  sb: SupabaseClient,
  unidadeId: string,
  dataStr: string,
  horario: string
): Promise<{ id: string; nome: string }[]> {
  const horarioN = norm(horario)
  const diaSem = new Date(dataStr + 'T12:00:00').getDay()
  const ehFds = diaSem === 0 || diaSem === 6

  const { data: feriasRows } = await sb
    .from('coach_ferias').select('coach_id')
    .lte('data_inicio', dataStr).gte('data_fim', dataStr)
  const feriasSet = new Set((feriasRows || []).map((f: any) => f.coach_id))

  const escalados: { id: string; nome: string }[] = []
  const jaTem = (id: string) => escalados.some((e) => e.id === id)

  if (ehFds) {
    if (!HORARIOS_FDS.includes(horarioN)) return []
    // escala_fds.coach_id = user_id → mapeia p/ coaches.id via coaches.user_id
    const { data: coachesList } = await sb.from('coaches').select('id, nome, user_id, ativo')
    const byUser: Record<string, { id: string; nome: string }> = {}
    for (const c of (coachesList || []) as any[]) if (c.ativo && c.user_id) byUser[c.user_id] = { id: c.id, nome: c.nome }
    const { data: escala } = await sb.from('escala_fds').select('coach_id').eq('data', dataStr).eq('unidade_id', unidadeId)
    for (const e of (escala || []) as any[]) {
      const info = byUser[e.coach_id]
      const cid = info?.id || e.coach_id
      if (feriasSet.has(cid) || jaTem(cid)) continue
      escalados.push({ id: cid, nome: info?.nome || 'Coach' })
    }
  } else {
    const { data: coachs } = await sb
      .from('coach_horarios').select('hora, coach_id, coaches ( id, nome )')
      .eq('dia_semana', diaSem).eq('unidade_id', unidadeId).eq('ativo', true)
    for (const c of (coachs || []) as any[]) {
      if (norm(c.hora) !== horarioN || feriasSet.has(c.coach_id)) continue
      const co = c.coaches
      if (co?.id && !jaTem(co.id)) escalados.push({ id: co.id, nome: co.nome })
    }
    // grade extra do período (aditivo)
    const extra = await gradeExtraDoDia(sb, { unidadeId, dataStr, diaSemana: diaSem })
    for (const s of (extra || []) as any[]) {
      if (norm(s.hora) !== horarioN || feriasSet.has(s.coach_id) || jaTem(s.coach_id)) continue
      escalados.push({ id: s.coach_id, nome: s.nome })
    }
  }

  if (!escalados.length) return []

  // remove os já alocados a OUTROS agendamentos do mesmo slot
  const { data: ags } = await sb
    .from('agendamentos').select('coach_id')
    .eq('data', dataStr).eq('unidade_id', unidadeId).eq('horario', horarioN + ':00')
    .not('coach_id', 'is', null).neq('status', 'cancelado')
  const alocados = new Set((ags || []).map((a: any) => a.coach_id))
  return escalados.filter((e) => !alocados.has(e.id))
}

// Confirma a escolha do coach pelo cliente no totem. Só grava se o agendamento
// está presente (check-in Personal validado) e o coach está realmente disponível.
// O gatilho on_agendamento_notificar_coach avisa o coach ao gravar coach_id.
export async function confirmarCoachCt(
  sb: SupabaseClient,
  unidadeId: string,
  agendamentoId: string,
  coachId: string
): Promise<{ ok: boolean; motivo?: string }> {
  const { data: ag } = await sb
    .from('agendamentos')
    .select('id, data, horario, status, presenca_checkin, unidade_id')
    .eq('id', agendamentoId).maybeSingle()
  if (!ag || (ag as any).unidade_id !== unidadeId) return { ok: false, motivo: 'nao_encontrado' }
  const presente = (ag as any).status === 'realizado' || (ag as any).presenca_checkin === true
  if (!presente) return { ok: false, motivo: 'sem_presenca' }

  const disp = await coachesDisponiveis(sb, unidadeId, (ag as any).data, (ag as any).horario)
  if (!disp.some((c) => c.id === coachId)) return { ok: false, motivo: 'coach_indisponivel' }

  const { error } = await sb.from('agendamentos').update({
    coach_id: coachId,
    alocado_em: new Date().toISOString(),
    alocado_por: null,   // escolha do próprio cliente no totem
  }).eq('id', agendamentoId).eq('status', 'realizado')
  if (error) return { ok: false, motivo: 'erro_gravar' }
  return { ok: true }
}
