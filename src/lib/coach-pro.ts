import { gradeExtraDoDia, coachesComFixaSubstituida } from '@/lib/grade'
import { coachFdsAtende } from '@/lib/fds-ct'

// Benefícios Pro (Coach CT Pro e App Coach CT Pro — os dois são tipo coach_ct_pro)
// seguem o PLANO vigente, não o saldo. Mesma regra do /agendar.
export async function clienteTemPro(supabase: any, clienteId: string, unidadeId: string): Promise<boolean> {
  const hojeStr = new Date().toLocaleDateString('en-CA')
  const { data } = await supabase
    .from('cliente_planos')
    .select('fim, planos_disponiveis!inner(tipo, unidade_id)')
    .eq('cliente_id', clienteId)
    .eq('ativo', true)
    .eq('planos_disponiveis.tipo', 'coach_ct_pro')
    .eq('planos_disponiveis.unidade_id', unidadeId)
  return (data || []).some((p: any) => !p.fim || p.fim >= hojeStr)
}

// Coaches escalados no horário, fora de férias e ainda sem aluno alocado.
// Mesma lógica de carregarCoachesDisponiveis do /agendar.
export async function coachesLivresNoHorario(supabase: any, unidadeId: string, dataStr: string, horaStr: string): Promise<{ id: string; nome: string }[]> {
  const diaSem = new Date(dataStr + 'T12:00:00').getDay()
  const { data: feriadoData } = await supabase.from('feriados').select('id').eq('unidade_id', unidadeId).eq('data', dataStr).eq('ativo', true).maybeSingle()
  const usaEscalaFds = !!feriadoData || diaSem === 0 || diaSem === 6
  const { data: feriasRows } = await supabase.from('coach_ferias').select('coach_id').lte('data_inicio', dataStr).gte('data_fim', dataStr)
  const feriasSet = new Set((feriasRows || []).map((f: any) => f.coach_id))
  // escala_fds.coach_id guarda USER_ID; coach_horarios.coach_id já é coaches.id
  let coachIds: string[] = []
  if (usaEscalaFds) {
    const { data: escala } = await supabase.from('escala_fds').select('coach_id, turno').eq('unidade_id', unidadeId).eq('data', dataStr)
    const userIds = (escala || []).filter((e: any) => coachFdsAtende(dataStr, !!feriadoData, e.turno, horaStr)).map((e: any) => e.coach_id).filter(Boolean)
    if (userIds.length === 0) return []
    const { data: resolvidos } = await supabase.from('coaches').select('id').in('user_id', userIds).eq('ativo', true)
    coachIds = (resolvidos || []).map((c: any) => c.id).filter(Boolean)
  } else {
    const { data: hors } = await supabase.from('coach_horarios').select('coach_id').eq('dia_semana', diaSem).eq('hora', horaStr).eq('ativo', true).eq('unidade_id', unidadeId)
    const extra = await gradeExtraDoDia(supabase, { unidadeId, dataStr, diaSemana: diaSem })
    const substituidos = coachesComFixaSubstituida(extra)
    coachIds = (hors || []).map((h: any) => h.coach_id).filter((id: any) => id && !substituidos.has(id))
    for (const s of extra) if (s.hora === horaStr && !coachIds.includes(s.coach_id)) coachIds.push(s.coach_id)
  }
  coachIds = coachIds.filter(id => !feriasSet.has(id))
  if (coachIds.length === 0) return []
  const { data: ocupados } = await supabase.from('agendamentos').select('coach_id').eq('data', dataStr).eq('horario', horaStr + ':00').eq('unidade_id', unidadeId).neq('status', 'cancelado').not('coach_id', 'is', null)
  const idsOcupados = new Set((ocupados || []).map((a: any) => a.coach_id))
  const idsDisp = coachIds.filter(id => !idsOcupados.has(id))
  if (idsDisp.length === 0) return []
  const { data: coachesData } = await supabase.from('coaches').select('id, nome').in('id', idsDisp).eq('ativo', true).order('nome')
  return coachesData || []
}
