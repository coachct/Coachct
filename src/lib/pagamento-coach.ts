import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo do que um coach tem a receber num período + lançamento da despesa.
//
// É a mesma regra da tela Pagamento de Coaches (admin/relatorios/pagamentos-coaches):
//  • CT   → sessão de agendamento 'realizado' (data+horário únicos) × valor do tipo 'ct'
//  • Club → ocorrência ativa do coach EFETIVO (correção pontual > grade) × valor do tipo da aula
//  • Professor em unidade CT → horas de sala × valor_hora
//
// Vive aqui porque a rescisão (admin/coaches) precisa exatamente do mesmo número,
// só que com outro período e outro vencimento. Salário fixo NÃO entra: continua
// sendo decisão manual na tela de pagamento.
// ─────────────────────────────────────────────────────────────────────────────

export const HORAS_FDS = 5 // jornada 08–13

export function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatarData(d: string) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

// Horas do professor (unidade CT):
// dia útil = grade fixa + grade extra; feriado/FDS = 5h se escalado; férias = 0h;
// antes de data_inicio_horas = 0h.
export function calcularHorasProfessor(o: {
  inicio: string
  fim: string
  gradePorDia: Record<number, number>
  ferias: any[]
  feriadoSet: Set<string>
  escalaSet: Set<string>
  extra: any[]
  inicioHoras: string | null
}) {
  const emFerias = (ds: string) => (o.ferias || []).some((f: any) => f.data_inicio <= ds && f.data_fim >= ds)
  const [yi, mi, di]  = o.inicio.split('-').map(Number)
  const [yf, mf, dff] = o.fim.split('-').map(Number)
  const cur = new Date(yi, mi - 1, di)
  const end = new Date(yf, mf - 1, dff)
  const linhas: any[] = []
  while (cur <= end) {
    const ds  = dataLocalStr(cur)
    const dow = cur.getDay()
    let h = 0, fonte = ''
    if (o.inicioHoras && ds < o.inicioHoras) {
      h = 0
    } else if (emFerias(ds)) {
      h = 0
    } else if (o.feriadoSet.has(ds) || dow === 0 || dow === 6) {
      if (o.escalaSet.has(ds)) { h = HORAS_FDS; fonte = o.feriadoSet.has(ds) ? 'feriado' : 'fds' }
    } else {
      const exDia = (o.extra || []).filter((e: any) => e.data_inicio <= ds && e.data_fim >= ds && e.dia_semana === dow)
      const ex = exDia.length
      // Extra marcada "substitui a grade fixa": no dia só contam as horas da extra.
      const substitui = exDia.some((e: any) => e.substitui_fixa === true)
      const base = substitui ? 0 : (o.gradePorDia[dow] || 0)
      h = base + ex
      fonte = substitui ? 'extra (substitui grade)' : ex > 0 ? 'grade + extra' : 'grade'
    }
    if (h > 0) linhas.push({ data: ds, horas: h, fonte })
    cur.setDate(cur.getDate() + 1)
  }
  return linhas
}

export type TotalUnidade = {
  unidade_id: string
  unidade_nome: string
  unidade_tipo: string
  aulas: number
  bonus: number
  horas: number
  vhoras: number
  valor: number
}

// Agendamentos CT paginados — o PostgREST corta em 1000 linhas sem avisar.
async function buscarAgendamentosCT(sb: SupabaseClient, unidadeId: string, inicio: string, fim: string) {
  const PAGE = 1000
  const linhas: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await sb.from('agendamentos')
      .select('id, coach_id, data, horario')
      .eq('unidade_id', unidadeId)
      .eq('status', 'realizado')
      .gte('data', inicio).lte('data', fim)
      .order('id').range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    linhas.push(...data)
    if (data.length < PAGE) break
  }
  return linhas
}

// Totais de UM coach num período, quebrados por unidade.
// `unidades` são as unidades a considerar (normalmente as vinculadas ao coach).
export async function totaisCoachPorUnidade(
  sb: SupabaseClient,
  p: { coach: any; unidades: any[]; inicio: string; fim: string }
): Promise<TotalUnidade[]> {
  const { coach, unidades, inicio, fim } = p
  if (!coach?.id || !unidades.length || !inicio || !fim) return []

  const { data: valores } = await sb.from('coach_valores')
    .select('unidade_id, tipo_aula, valor_por_aula')
    .eq('coach_id', coach.id).in('unidade_id', unidades.map(u => u.id))
  const valorMap: Record<string, number> = {}
  for (const v of (valores || [])) valorMap[`${v.unidade_id}|${v.tipo_aula}`] = Number(v.valor_por_aula)
  const valorDe = (unidadeId: string, tipo: string) => valorMap[`${unidadeId}|${tipo}`] || 0

  const saida: TotalUnidade[] = []

  for (const u of unidades) {
    let aulas = 0, bonus = 0, horas = 0, vhoras = 0

    if (u.tipo === 'ct') {
      const ags = await buscarAgendamentosCT(sb, u.id, inicio, fim)
      const sessoes = new Set<string>()
      for (const ag of ags) {
        if (ag.coach_id !== coach.id) continue
        const key = `${ag.data}-${ag.horario}`
        if (sessoes.has(key)) continue
        sessoes.add(key)
        aulas += 1
        bonus += valorDe(u.id, 'ct')
      }

      // Horas de sala: só professor.
      if (coach.cargo === 'professor') {
        const { data: grade } = await sb.from('coach_horarios')
          .select('dia_semana').eq('coach_id', coach.id).eq('unidade_id', u.id).eq('ativo', true)
        const gradePorDia: Record<number, number> = {}
        for (const g of (grade || [])) gradePorDia[g.dia_semana] = (gradePorDia[g.dia_semana] || 0) + 1

        const { data: fer } = await sb.from('coach_ferias')
          .select('data_inicio, data_fim').eq('coach_id', coach.id)
          .lte('data_inicio', fim).gte('data_fim', inicio)
        const { data: feriados } = await sb.from('feriados')
          .select('data').eq('unidade_id', u.id).eq('ativo', true).gte('data', inicio).lte('data', fim)
        // ATENÇÃO: escala_fds.coach_id guarda o user_id do coach, não o coaches.id
        const { data: esc } = await sb.from('escala_fds')
          .select('data').eq('unidade_id', u.id).eq('coach_id', coach.user_id)
          .gte('data', inicio).lte('data', fim)
        const { data: extra } = await sb.from('coach_horarios_extra')
          .select('data_inicio, data_fim, dia_semana, substitui_fixa')
          .eq('coach_id', coach.id).eq('unidade_id', u.id)
          .lte('data_inicio', fim).gte('data_fim', inicio)

        const hs = calcularHorasProfessor({
          inicio, fim, gradePorDia,
          ferias:      fer || [],
          feriadoSet:  new Set((feriados || []).map((f: any) => f.data)),
          escalaSet:   new Set((esc || []).map((e: any) => e.data)),
          extra:       extra || [],
          inicioHoras: coach.data_inicio_horas || null,
        })
        horas  = hs.reduce((s: number, x: any) => s + x.horas, 0)
        vhoras = horas * Number(coach.valor_hora || 0)
      }
    } else {
      // Club: paga por ocorrência, pelo coach EFETIVO do dia.
      const { data: aulasUnidade } = await sb.from('club_aulas')
        .select('id, tipo, coach_id').eq('unidade_id', u.id).eq('ativo', true)
      const ids = (aulasUnidade || []).map((a: any) => a.id)
      if (ids.length) {
        const aulaMap: Record<string, any> = {}
        for (const a of (aulasUnidade || [])) aulaMap[a.id] = a
        const { data: ocs } = await sb.from('club_ocorrencias')
          .select('data, aula_id, coach_id').in('aula_id', ids)
          .gte('data', inicio).lte('data', fim).eq('status', 'ativa')
        for (const oc of (ocs || [])) {
          const efetivo = oc.coach_id || aulaMap[oc.aula_id]?.coach_id || null
          if (efetivo !== coach.id) continue
          aulas += 1
          bonus += valorDe(u.id, aulaMap[oc.aula_id]?.tipo || '')
        }
      }
    }

    const valor = bonus + vhoras
    if (aulas > 0 || horas > 0 || valor > 0) {
      saida.push({
        unidade_id: u.id, unidade_nome: u.nome, unidade_tipo: u.tipo,
        aulas, bonus, horas, vhoras, valor,
      })
    }
  }

  return saida
}

// Registra o pagamento do coach (RPC SECURITY DEFINER) e reflete no financeiro
// como despesa em contas a pagar. Uma chamada = uma unidade = uma despesa.
export async function lancarPagamentoCoachUnidade(
  sb: SupabaseClient,
  p: {
    coach: any
    unidade: { id: string; nome: string }
    inicio: string
    fim: string
    totalAulas: number
    bonus: number
    totalHoras: number
    valorHoras: number
    fixo?: number
    competencia: string
    vencimento: string
    rotulo?: string        // 'Pagamento' (padrão) ou 'Rescisão'
  }
): Promise<{ pagou: boolean; erro: string | null; total: number }> {
  const fixo   = Number(p.fixo || 0)
  const total  = p.bonus + p.valorHoras + fixo
  const rotulo = p.rotulo || 'Pagamento'

  const { data: pagId, error } = await sb.rpc('registrar_pagamento_coach', {
    p_coach_id:       p.coach.id,
    p_unidade_id:     p.unidade.id,
    p_periodo_inicio: p.inicio,
    p_periodo_fim:    p.fim,
    p_total_aulas:    p.totalAulas,
    p_valor_por_aula: p.totalAulas > 0 ? p.bonus / p.totalAulas : 0,
    p_valor_total:    total,
    p_observacao:     `${rotulo} — ${p.coach.nome} — ${p.totalAulas} aulas em ${p.unidade.nome} (${formatarData(p.inicio)} a ${formatarData(p.fim)})${p.totalHoras > 0 ? ` + ${p.totalHoras}h R$ ${p.valorHoras.toFixed(2).replace('.', ',')}` : ''}${fixo > 0 ? ` + fixo R$ ${fixo.toFixed(2).replace('.', ',')}` : ''}`,
  })

  if (error) return { pagou: false, erro: error.message, total }

  const { data: catCoach } = await sb.from('categorias_despesa')
    .select('id').eq('nome', 'Coaches').maybeSingle()

  const { error: errDesp } = await sb.from('despesas').insert({
    unidade_id:         p.unidade.id,
    categoria_id:       catCoach?.id || null,
    descricao:          `${rotulo} ${p.coach.nome} — ${p.totalHoras > 0 ? `${p.totalHoras}h` : `${p.totalAulas} aulas`} (${formatarData(p.inicio)} a ${formatarData(p.fim)})`,
    valor:              total,
    competencia:        p.competencia,
    vencimento:         p.vencimento,
    pago:               false,
    origem:             'coach',
    coach_pagamento_id: pagId || null,
  })

  return { pagou: true, erro: errDesp ? errDesp.message : null, total }
}

// Salário fixo do estagiário na rescisão: proporcional aos dias trabalhados no mês
// da saída (dias corridos do dia 1º até a data de saída, inclusive, sobre o total de
// dias do mês). Professor não tem fixo — ele é pago por hora.
export function fixoProporcional(coach: any, dataSaida: string) {
  const fixo = Number(coach?.salario_fixo || 0)
  if (coach?.cargo !== 'estagiario' || fixo <= 0 || !dataSaida) {
    return { dias: 0, diasMes: 0, valor: 0 }
  }
  const [y, m, d] = dataSaida.split('-').map(Number)
  const diasMes = new Date(y, m, 0).getDate()
  const dias    = d
  return { dias, diasMes, valor: Math.round((fixo * dias / diasMes) * 100) / 100 }
}

// Período e vencimento da rescisão:
// período = dia 1º do mês da saída → data de saída; vencimento = saída + 10 dias.
export function periodoRescisao(dataSaida: string) {
  const [y, m] = dataSaida.split('-').map(Number)
  const inicio = `${y}-${String(m).padStart(2, '0')}-01`
  const [ys, ms, ds] = dataSaida.split('-').map(Number)
  const venc = new Date(ys, ms - 1, ds)
  venc.setDate(venc.getDate() + 10)
  return { inicio, fim: dataSaida, competencia: inicio, vencimento: dataLocalStr(venc) }
}
