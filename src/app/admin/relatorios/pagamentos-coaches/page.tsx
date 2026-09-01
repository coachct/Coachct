'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { DollarSign, CheckCircle } from 'lucide-react'

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function tipoLabelClub(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')   return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t
}

function formatarData(d: string) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

// Horas do professor (unidade CT) — mesma regra usada no relatório individual e no consolidado:
// dia útil = grade fixa + grade extra; feriado/FDS = 5h se escalado; férias = 0h;
// antes de data_inicio_horas = 0h.
const HORAS_FDS = 5 // jornada 08–13
function calcularHorasProfessor(o: {
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
      const base = o.gradePorDia[dow] || 0
      const ex = (o.extra || []).filter((e: any) => e.data_inicio <= ds && e.data_fim >= ds && e.dia_semana === dow).length
      h = base + ex
      fonte = ex > 0 ? 'grade + extra' : 'grade'
    }
    if (h > 0) linhas.push({ data: ds, horas: h, fonte })
    cur.setDate(cur.getDate() + 1)
  }
  return linhas
}

export default function PagamentosCoachesPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [unidades,     setUnidades]     = useState<any[]>([])
  // Seleção de unidades: 1 marcada = relatório normal (permite lançar despesa);
  // 2 ou mais = consolidado das unidades escolhidas (só visualização).
  const [unidadesSel,  setUnidadesSel]  = useState<any[]>([])
  const [coaches,      setCoaches]      = useState<any[]>([])
  const [coachSel,     setCoachSel]     = useState<any>(null)
  const [filtro,       setFiltro]       = useState<'hoje'|'7dias'|'mes'|'mes_ant'|'custom'>('mes')
  const [inicio,       setInicio]       = useState('')
  const [fim,          setFim]          = useState('')
  const [aulas,        setAulas]        = useState<any[]>([])
  const [loadingAulas, setLoadingAulas] = useState(false)
  const [incluirFixo,  setIncluirFixo]  = useState(false)
  const [lancando,     setLancando]     = useState(false)
  const [lancado,      setLancado]      = useState(false)
  const [msg,          setMsg]          = useState('')
  const [horas,        setHoras]        = useState<any[]>([])
  const [consolidado,  setConsolidado]  = useState<any[]>([])
  const [loadingCons,  setLoadingCons]  = useState(false)

  const modoMulti  = unidadesSel.length > 1
  const unidadeSel = unidadesSel.length === 1 ? unidadesSel[0] : null
  const chaveUnidades = unidadesSel.map(u => u.id).join(',')

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregarUnidades() }, [perfil])
  useEffect(() => { if (unidadeSel) carregarCoaches() }, [unidadeSel?.id])
  useEffect(() => { aplicarFiltroRapido(filtro) }, [filtro])
  useEffect(() => { if (coachSel && inicio && fim) carregarAulas() }, [coachSel?.id, inicio, fim])
  useEffect(() => {
    if (modoMulti && inicio && fim) carregarConsolidado()
    if (!modoMulti) setConsolidado([])
  }, [chaveUnidades, inicio, fim])

  function alternarUnidade(u: any) {
    setUnidadesSel(atual => {
      const marcada = atual.some(x => x.id === u.id)
      // Nunca deixa ficar sem nenhuma: desmarcar a última mantém ela selecionada
      if (marcada && atual.length === 1) return atual
      const nova = marcada ? atual.filter(x => x.id !== u.id) : [...atual, u]
      return unidades.filter(x => nova.some(n => n.id === x.id))
    })
    setCoachSel(null); setAulas([]); setHoras([])
  }

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades').select('id, nome, tipo').eq('ativo', true).order('nome')
    setUnidades(data || [])
    if (data && data.length > 0) setUnidadesSel([data[0]])
  }

  async function carregarCoaches() {
    if (!unidadeSel) return
    setCoachSel(null); setAulas([])
    const { data: cu } = await supabase.from('coach_unidades').select('coach_id')
      .eq('unidade_id', unidadeSel.id).eq('ativo', true)
    const ids = (cu || []).map((c: any) => c.coach_id)
    if (!ids.length) { setCoaches([]); return }
    const { data } = await supabase.from('coaches')
      .select('id, nome, salario_fixo, cargo, valor_hora, user_id, data_inicio_horas')
      .eq('ativo', true).in('id', ids).order('nome')
    setCoaches(data || [])
  }

  function aplicarFiltroRapido(f: typeof filtro) {
    const hoje = new Date()
    if (f === 'hoje') {
      setInicio(dataLocalStr(hoje)); setFim(dataLocalStr(hoje))
    } else if (f === '7dias') {
      const d7 = new Date(hoje); d7.setDate(d7.getDate() - 6)
      setInicio(dataLocalStr(d7)); setFim(dataLocalStr(hoje))
    } else if (f === 'mes') {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      setInicio(dataLocalStr(ini)); setFim(dataLocalStr(fim))
    } else if (f === 'mes_ant') {
      // Mês anterior fechado — para lançar a despesa depois da virada do mês
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
      setInicio(dataLocalStr(ini)); setFim(dataLocalStr(fim))
    }
  }

  async function carregarAulas() {
    if (!coachSel || !unidadeSel || !inicio || !fim) return
    setLoadingAulas(true); setLancado(false); setIncluirFixo(false); setHoras([])

    // Busca valores do coach para esta unidade
    const { data: valores } = await supabase.from('coach_valores')
      .select('tipo_aula, valor_por_aula')
      .eq('coach_id', coachSel.id)
      .eq('unidade_id', unidadeSel.id)

    const valorMap: Record<string, number> = {}
    for (const v of (valores || [])) valorMap[v.tipo_aula] = Number(v.valor_por_aula)

    if (unidadeSel.tipo === 'ct') {
      const { data } = await supabase.from('agendamentos')
        .select('id, data, horario, status')
        .eq('coach_id', coachSel.id)
        .eq('unidade_id', unidadeSel.id)
        .gte('data', inicio).lte('data', fim)
        .eq('status', 'realizado')
        .order('data').order('horario')

      // Agrupa por data+horario (sessão única)
      const sessoes: Record<string, any> = {}
      for (const ag of (data || [])) {
        const key = `${ag.data}-${ag.horario}`
        if (!sessoes[key]) sessoes[key] = {
          data: ag.data, horario: ag.horario,
          tipo: 'Coach CT', tipo_key: 'ct',
          valor: valorMap['ct'] || 0,
          clientes: 0,
        }
        sessoes[key].clientes++
      }
      setAulas(Object.values(sessoes).sort((a, b) =>
        a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario)))
    } else {
      // Club: paga por OCORRÊNCIA, pelo coach EFETIVO daquele dia.
      // Coach efetivo = coach corrigido na ocorrência (club_ocorrencias.coach_id) e,
      // na ausência dele, o coach da grade recorrente (club_aulas.coach_id).
      // Por isso buscamos TODAS as aulas da unidade (não só as deste coach): uma aula
      // de outro coach pode ter sido corrigida para este coach naquele dia, e vice-versa.
      const { data: aulasUnidade } = await supabase.from('club_aulas')
        .select('id, tipo, horario, coach_id')
        .eq('unidade_id', unidadeSel.id)
        .eq('ativo', true)
      const ids = (aulasUnidade || []).map((a: any) => a.id)
      if (!ids.length) { setAulas([]); setLoadingAulas(false); return }

      const aulaMap: Record<string, any> = {}
      for (const a of (aulasUnidade || [])) aulaMap[a.id] = a

      const { data: ocs } = await supabase.from('club_ocorrencias')
        .select('id, data, aula_id, coach_id, status')
        .in('aula_id', ids).gte('data', inicio).lte('data', fim)
        .eq('status', 'ativa').order('data')

      // Mantém só as ocorrências cujo coach efetivo é o coach selecionado.
      const minhas = (ocs || []).filter((oc: any) => {
        const coachEfetivo = oc.coach_id || aulaMap[oc.aula_id]?.coach_id || null
        return coachEfetivo === coachSel.id
      })

      setAulas(minhas.map((oc: any) => {
        const tipoKey = aulaMap[oc.aula_id]?.tipo || ''
        return {
          data:      oc.data,
          horario:   aulaMap[oc.aula_id]?.horario || '',
          tipo:      tipoLabelClub(tipoKey),
          tipo_key:  tipoKey,
          valor:     valorMap[tipoKey] || 0,
          // conta para este coach por correção pontual (a grade aponta para outro coach)
          corrigido: !!oc.coach_id && aulaMap[oc.aula_id]?.coach_id !== coachSel.id,
        }
      }))
    }
    // ===== HORAS DO PROFESSOR (só unidade CT + cargo professor) =====
    // Regra: dia útil = grade fixa (coach_horarios) + grade extra (coach_horarios_extra);
    // feriado/FDS = ignora grade e usa escala_fds (5h fixas se escalado); férias = 0h.
    if (unidadeSel.tipo === 'ct' && coachSel.cargo === 'professor') {
      const { data: grade } = await supabase.from('coach_horarios')
        .select('dia_semana, hora')
        .eq('coach_id', coachSel.id).eq('unidade_id', unidadeSel.id).eq('ativo', true)
      const gradePorDia: Record<number, number> = {}
      for (const g of (grade || [])) gradePorDia[g.dia_semana] = (gradePorDia[g.dia_semana] || 0) + 1
      const { data: fer } = await supabase.from('coach_ferias')
        .select('data_inicio, data_fim').eq('coach_id', coachSel.id)
        .lte('data_inicio', fim).gte('data_fim', inicio)
      const { data: feriados } = await supabase.from('feriados')
        .select('data').eq('unidade_id', unidadeSel.id).eq('ativo', true)
        .gte('data', inicio).lte('data', fim)
      const feriadoSet = new Set((feriados || []).map((f: any) => f.data))
      // ATENÇÃO: escala_fds.coach_id guarda o user_id do coach, não o coaches.id
      const { data: esc } = await supabase.from('escala_fds')
        .select('data').eq('unidade_id', unidadeSel.id).eq('coach_id', coachSel.user_id)
        .gte('data', inicio).lte('data', fim)
      const escSet = new Set((esc || []).map((e: any) => e.data))
      const { data: extra } = await supabase.from('coach_horarios_extra')
        .select('data_inicio, data_fim, dia_semana')
        .eq('coach_id', coachSel.id).eq('unidade_id', unidadeSel.id)
        .lte('data_inicio', fim).gte('data_fim', inicio)
      // Início do pagamento por hora: vazio = conta o mês todo; preenchido = só a partir dessa data.
      setHoras(calcularHorasProfessor({
        inicio, fim,
        gradePorDia,
        ferias:      fer || [],
        feriadoSet,
        escalaSet:   escSet,
        extra:       extra || [],
        inicioHoras: coachSel.data_inicio_horas || null,
      }))
    }
    setLoadingAulas(false)
  }

  // ===== CONSOLIDADO (unidades marcadas) =====
  // Só visualização: aplica as mesmas regras do relatório individual (CT = sessão de
  // agendamento realizado; Club = ocorrência do coach efetivo; professor CT = horas)
  // e soma por coach APENAS nas unidades marcadas. NÃO inclui salário fixo — esse
  // continua sendo decisão manual na tela de uma unidade só, que é a única que lança despesa.
  async function buscarAgendamentosCT(unidadeId: string) {
    // Paginado: o PostgREST corta em 1000 linhas sem avisar
    const PAGE = 1000
    const linhas: any[] = []
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase.from('agendamentos')
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

  async function carregarConsolidado() {
    setLoadingCons(true); setConsolidado([])
    const alvo = unidadesSel                       // só as unidades marcadas
    const idsAlvo = alvo.map((u: any) => u.id)

    const { data: vinculos } = await supabase.from('coach_unidades')
      .select('coach_id, unidade_id').eq('ativo', true).in('unidade_id', idsAlvo)
    const idsCoaches = Array.from(new Set((vinculos || []).map((v: any) => v.coach_id)))
    if (!idsCoaches.length) { setLoadingCons(false); return }

    const { data: listaCoaches } = await supabase.from('coaches')
      .select('id, nome, cargo, valor_hora, user_id, data_inicio_horas')
      .eq('ativo', true).in('id', idsCoaches).order('nome')
    const coachAtivo: Record<string, any> = {}
    for (const c of (listaCoaches || [])) coachAtivo[c.id] = c

    const { data: valores } = await supabase.from('coach_valores')
      .select('coach_id, unidade_id, tipo_aula, valor_por_aula')
      .in('coach_id', idsCoaches).in('unidade_id', idsAlvo)
    const valorMap: Record<string, number> = {}
    for (const v of (valores || [])) valorMap[`${v.coach_id}|${v.unidade_id}|${v.tipo_aula}`] = Number(v.valor_por_aula)
    const valorDe = (coachId: string, unidadeId: string, tipo: string) =>
      valorMap[`${coachId}|${unidadeId}|${tipo}`] || 0

    // acc[coachId] = { aulas: {unidadeId: n}, horas: {unidadeId: h}, valor: {unidadeId: R$} }
    const acc: Record<string, any> = {}
    const linha = (coachId: string) => {
      if (!acc[coachId]) acc[coachId] = { aulas: {}, horas: {}, valor: {} }
      return acc[coachId]
    }

    for (const u of alvo) {
      const idsUnidade = (vinculos || []).filter((v: any) => v.unidade_id === u.id).map((v: any) => v.coach_id)
      if (!idsUnidade.length) continue

      if (u.tipo === 'ct') {
        const ags = await buscarAgendamentosCT(u.id)
        const sessoes = new Set<string>()
        for (const ag of ags) {
          if (!ag.coach_id || !coachAtivo[ag.coach_id]) continue
          const key = `${ag.coach_id}-${ag.data}-${ag.horario}`
          if (sessoes.has(key)) continue
          sessoes.add(key)
          const l = linha(ag.coach_id)
          l.aulas[u.id] = (l.aulas[u.id] || 0) + 1
          l.valor[u.id] = (l.valor[u.id] || 0) + valorDe(ag.coach_id, u.id, 'ct')
        }

        // Horas dos professores desta unidade CT
        const profs = (listaCoaches || []).filter((c: any) => c.cargo === 'professor' && idsUnidade.includes(c.id))
        if (profs.length) {
          const pids = profs.map((p: any) => p.id)
          const { data: grade } = await supabase.from('coach_horarios')
            .select('coach_id, dia_semana').eq('unidade_id', u.id).in('coach_id', pids).eq('ativo', true)
          const { data: fer } = await supabase.from('coach_ferias')
            .select('coach_id, data_inicio, data_fim').in('coach_id', pids)
            .lte('data_inicio', fim).gte('data_fim', inicio)
          const { data: feriados } = await supabase.from('feriados')
            .select('data').eq('unidade_id', u.id).eq('ativo', true).gte('data', inicio).lte('data', fim)
          const feriadoSet = new Set((feriados || []).map((f: any) => f.data))
          // ATENÇÃO: escala_fds.coach_id guarda o user_id do coach
          const { data: esc } = await supabase.from('escala_fds')
            .select('coach_id, data').eq('unidade_id', u.id).gte('data', inicio).lte('data', fim)
          const { data: extra } = await supabase.from('coach_horarios_extra')
            .select('coach_id, data_inicio, data_fim, dia_semana')
            .eq('unidade_id', u.id).in('coach_id', pids)
            .lte('data_inicio', fim).gte('data_fim', inicio)

          for (const p of profs) {
            const gradePorDia: Record<number, number> = {}
            for (const g of (grade || []).filter((g: any) => g.coach_id === p.id))
              gradePorDia[g.dia_semana] = (gradePorDia[g.dia_semana] || 0) + 1
            const hs = calcularHorasProfessor({
              inicio, fim, gradePorDia,
              ferias:      (fer || []).filter((f: any) => f.coach_id === p.id),
              feriadoSet,
              escalaSet:   new Set((esc || []).filter((e: any) => e.coach_id === p.user_id).map((e: any) => e.data)),
              extra:       (extra || []).filter((e: any) => e.coach_id === p.id),
              inicioHoras: p.data_inicio_horas || null,
            })
            const totalH = hs.reduce((s: number, x: any) => s + x.horas, 0)
            if (totalH > 0) {
              const l = linha(p.id)
              l.horas[u.id] = (l.horas[u.id] || 0) + totalH
              l.valor[u.id] = (l.valor[u.id] || 0) + totalH * Number(p.valor_hora || 0)
            }
          }
        }
      } else {
        const { data: aulasUnidade } = await supabase.from('club_aulas')
          .select('id, tipo, coach_id').eq('unidade_id', u.id).eq('ativo', true)
        const ids = (aulasUnidade || []).map((a: any) => a.id)
        if (!ids.length) continue
        const aulaMap: Record<string, any> = {}
        for (const a of (aulasUnidade || [])) aulaMap[a.id] = a

        const { data: ocs } = await supabase.from('club_ocorrencias')
          .select('data, aula_id, coach_id').in('aula_id', ids)
          .gte('data', inicio).lte('data', fim).eq('status', 'ativa')

        for (const oc of (ocs || [])) {
          const coachEfetivo = oc.coach_id || aulaMap[oc.aula_id]?.coach_id || null
          if (!coachEfetivo || !coachAtivo[coachEfetivo]) continue
          const tipoKey = aulaMap[oc.aula_id]?.tipo || ''
          const l = linha(coachEfetivo)
          l.aulas[u.id] = (l.aulas[u.id] || 0) + 1
          l.valor[u.id] = (l.valor[u.id] || 0) + valorDe(coachEfetivo, u.id, tipoKey)
        }
      }
    }

    const resultado = (listaCoaches || [])
      .filter((c: any) => acc[c.id])
      .map((c: any) => {
        const l = acc[c.id]
        const total = Object.values(l.valor).reduce((s: number, v: any) => s + Number(v || 0), 0)
        return { id: c.id, nome: c.nome, aulas: l.aulas, horas: l.horas, valor: l.valor, total }
      })
      .sort((a: any, b: any) => b.total - a.total)

    setConsolidado(resultado)
    setLoadingCons(false)
  }

  const totalAulas   = aulas.length
  const totalBonus   = aulas.reduce((sum, a) => sum + (a.valor || 0), 0)
  const salarioFixo  = Number(coachSel?.salario_fixo || 0)
  const isProfessor  = coachSel?.cargo === 'professor'
  const isProfCT     = isProfessor && unidadeSel?.tipo === 'ct'
  const totalHoras   = horas.reduce((s, h) => s + (h.horas || 0), 0)
  const valorHora    = Number(coachSel?.valor_hora || 0)
  const valorHoras   = totalHoras * valorHora
  const totalFinal   = totalBonus + valorHoras + (!isProfessor && incluirFixo ? salarioFixo : 0)

  async function lancarDespesa() {
    if (!coachSel || !unidadeSel || totalFinal <= 0) return
    setLancando(true)

    // 1) Registro do pagamento do coach (via RPC SECURITY DEFINER — valida admin e contorna RLS)
    const { data: pagId, error } = await supabase.rpc('registrar_pagamento_coach', {
      p_coach_id:       coachSel.id,
      p_unidade_id:     unidadeSel.id,
      p_periodo_inicio: inicio,
      p_periodo_fim:    fim,
      p_total_aulas:    totalAulas,
      p_valor_por_aula: totalAulas > 0 ? totalBonus / totalAulas : 0,
      p_valor_total:    totalFinal,
      p_observacao:     `${coachSel.nome} — ${totalAulas} aulas em ${unidadeSel.nome} (${formatarData(inicio)} a ${formatarData(fim)})${isProfCT && totalHoras > 0 ? ` + ${totalHoras}h R$ ${valorHoras.toFixed(2).replace('.', ',')}` : ''}${!isProfessor && incluirFixo ? ` + fixo R$ ${salarioFixo.toFixed(2).replace('.', ',')}` : ''}`,
    })

    if (error) { setLancando(false); showMsg('Erro: ' + error.message); return }

    // 2) Reflete no financeiro como despesa (origem=coach)
    // competência = mês trabalhado (do início do período); vencimento = dia 01 do mês seguinte
    const [iy, im] = inicio.split('-').map(Number)
    const competencia = `${iy}-${String(im).padStart(2, '0')}-01`
    const proxAno = im === 12 ? iy + 1 : iy
    const proxMes = im === 12 ? 1 : im + 1
    const vencimento = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`

    const { data: catCoach } = await supabase.from('categorias_despesa')
      .select('id').eq('nome', 'Coaches').maybeSingle()

    const { error: errDesp } = await supabase.from('despesas').insert({
      unidade_id:         unidadeSel.id,
      categoria_id:       catCoach?.id || null,
      descricao:          `Pagamento ${coachSel.nome} — ${isProfCT ? `${totalHoras}h` : `${totalAulas} aulas`} (${formatarData(inicio)} a ${formatarData(fim)})`,
      valor:              totalFinal,
      competencia,
      vencimento,
      pago:               false,
      origem:             'coach',
      coach_pagamento_id: pagId || null,
    })

    setLancando(false)

    if (errDesp) {
      setLancado(true)
      showMsg('⚠️ Pagamento registrado, mas falhou ao lançar no financeiro: ' + errDesp.message)
      return
    }

    setLancado(true)
    showMsg(`✅ Despesa de R$ ${totalFinal.toFixed(2).replace('.', ',')} lançada com sucesso!`)
  }

  function showMsg(texto: string) { setMsg(texto); setTimeout(() => setMsg(''), 5000) }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-gray-900">Pagamento de Coaches</h1>
        <p className="text-xs text-gray-400 mt-0.5">Relatório de bonificações por aulas ministradas</p>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-5 space-y-5">

        {msg && (
          <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
            msg.startsWith('Erro') ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-800 border-green-100'
          }`}>{msg}</div>
        )}

        {/* Filtros */}
        <div className="card space-y-4">
          <div className="text-sm font-semibold text-gray-900">Filtros</div>

          {/* Unidade */}
          <div>
            <label className="label">Unidade</label>
            <div className="flex gap-2 flex-wrap">
              {unidades.map(u => {
                const marcada = unidadesSel.some(x => x.id === u.id)
                return (
                  <button key={u.id} onClick={() => alternarUnidade(u)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all flex items-center gap-2 ${
                      marcada
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                    }`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] leading-none ${
                      marcada ? 'bg-white/20 border-white/60' : 'border-gray-300'
                    }`}>{marcada ? '✓' : ''}</span>
                    {u.nome}
                  </button>
                )
              })}
              {modoMulti && (
                <button onClick={() => { setUnidadesSel([unidadesSel[0]]); setCoachSel(null); setAulas([]); setHoras([]) }}
                  className="px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 text-gray-500 bg-white hover:border-gray-400 transition-all">
                  Limpar
                </button>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-2">
              {modoMulti
                ? `Consolidado de ${unidadesSel.length} unidades — visualização apenas. Não inclui salário fixo e não lança despesa.`
                : 'Marque mais de uma unidade para ver o total somado por coach.'}
            </div>
          </div>

          {/* Período */}
          <div>
            <label className="label">Período</label>
            <div className="flex gap-2 flex-wrap items-center">
              {([
                { key: 'hoje',   label: 'Hoje' },
                { key: '7dias',  label: 'Últimos 7 dias' },
                { key: 'mes',    label: 'Mês atual' },
                { key: 'mes_ant',label: 'Mês anterior' },
                { key: 'custom', label: 'Personalizado' },
              ] as const).map(f => (
                <button key={f.key}
                  onClick={() => { setFiltro(f.key); if (f.key !== 'custom') aplicarFiltroRapido(f.key) }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    filtro === f.key
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
            {filtro === 'custom' && (
              <div className="flex gap-3 mt-3">
                <div className="flex-1">
                  <label className="label">De</label>
                  <input type="date" className="input w-full" value={inicio} onChange={e => setInicio(e.target.value)}/>
                </div>
                <div className="flex-1">
                  <label className="label">Até</label>
                  <input type="date" className="input w-full" value={fim} onChange={e => setFim(e.target.value)}/>
                </div>
              </div>
            )}
            {inicio && fim && (
              <div className="text-xs text-gray-400 mt-2">{formatarData(inicio)} → {formatarData(fim)}</div>
            )}
          </div>

          {/* Coach */}
          <div className={modoMulti ? 'hidden' : ''}>
            <label className="label">Coach</label>
            {coaches.length === 0 ? (
              <div className="text-sm text-gray-400">Nenhum coach para esta unidade.</div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {coaches.map(c => (
                  <button key={c.id} onClick={() => setCoachSel(c)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      coachSel?.id === c.id
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                    }`}>
                    {c.nome.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Resultado consolidado (todas as unidades) */}
        {modoMulti && (
          <div className="card overflow-hidden p-0">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">
                Total por coach — {unidadesSel.map(u => u.nome).join(' + ')}
              </div>
              <div className="text-xs text-gray-400">{formatarData(inicio)} a {formatarData(fim)}</div>
            </div>

            {loadingCons ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-7 h-7 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
              </div>
            ) : consolidado.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                Nenhum lançamento encontrado para o período selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-5 py-2.5">Coach</th>
                      {unidadesSel.map(u => (
                        <th key={u.id} className="text-right px-4 py-2.5 whitespace-nowrap">{u.nome}</th>
                      ))}
                      <th className="text-right px-5 py-2.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidado.map(c => (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">{c.nome}</td>
                        {unidadesSel.map(u => (
                          <td key={u.id} className="px-4 py-3 text-right whitespace-nowrap">
                            {c.valor[u.id] ? (
                              <>
                                <div className="font-semibold text-gray-900">
                                  R$ {Number(c.valor[u.id]).toFixed(2).replace('.', ',')}
                                </div>
                                <div className="text-[11px] text-gray-400">
                                  {c.aulas[u.id] ? `${c.aulas[u.id]} aula${c.aulas[u.id] !== 1 ? 's' : ''}` : ''}
                                  {c.aulas[u.id] && c.horas[u.id] ? ' · ' : ''}
                                  {c.horas[u.id] ? `${c.horas[u.id]} h` : ''}
                                </div>
                              </>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        ))}
                        <td className="px-5 py-3 text-right font-bold text-primary-700 whitespace-nowrap">
                          R$ {Number(c.total).toFixed(2).replace('.', ',')}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-primary-50 border-t-2 border-primary-100">
                      <td className="px-5 py-3 font-bold text-primary-800">Total geral</td>
                      {unidadesSel.map(u => (
                        <td key={u.id} className="px-4 py-3 text-right font-bold text-primary-700 whitespace-nowrap">
                          R$ {consolidado.reduce((s, c) => s + Number(c.valor[u.id] || 0), 0).toFixed(2).replace('.', ',')}
                        </td>
                      ))}
                      <td className="px-5 py-3 text-right font-bold text-primary-700 whitespace-nowrap">
                        R$ {consolidado.reduce((s, c) => s + Number(c.total || 0), 0).toFixed(2).replace('.', ',')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Resultado */}
        {!modoMulti && coachSel && inicio && fim && (
          <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-3 gap-4">
              <div className="card text-center">
                <div className="text-3xl font-bold text-gray-900">{loadingAulas ? '—' : totalAulas}</div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Aulas ministradas</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-gray-900">
                  {loadingAulas ? '—' : `R$ ${totalBonus.toFixed(2).replace('.', ',')}`}
                </div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Total bonificação</div>
              </div>
              <div className="card text-center border-2 border-primary-200 bg-primary-50">
                <div className="text-3xl font-bold text-primary-700">
                  {loadingAulas ? '—' : `R$ ${totalFinal.toFixed(2).replace('.', ',')}`}
                </div>
                <div className="text-xs text-primary-500 mt-1 uppercase tracking-wide font-semibold">Total a pagar</div>
              </div>
            </div>

            {/* Lista de aulas */}
            <div className="card overflow-hidden p-0">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">
                  Aulas de {coachSel.nome} — {unidadeSel.nome}
                </div>
                <div className="text-xs text-gray-400">{totalAulas} aula{totalAulas !== 1 ? 's' : ''}</div>
              </div>

              {loadingAulas ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-7 h-7 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : (aulas.length === 0 && !(isProfCT && totalHoras > 0)) ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Nenhuma aula encontrada para o período selecionado.
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-4 gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <div>Data</div>
                    <div>Horário</div>
                    <div>Tipo</div>
                    <div className="text-right">Valor</div>
                  </div>
                  {aulas.map((a, i) => (
                    <div key={i} className={`grid grid-cols-4 gap-4 px-5 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${a.valor === 0 ? 'bg-orange-50' : ''}`}>
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'numeric', month:'short' })}
                      </div>
                      <div className="text-sm font-mono text-gray-700">{(a.horario || '').slice(0, 5)}</div>
                      <div className="text-sm text-gray-600">{a.tipo}{a.corrigido && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">corrigido</span>}</div>
                      <div className={`text-sm font-semibold text-right ${a.valor === 0 ? 'text-orange-500' : 'text-gray-900'}`}>
                        {a.valor === 0 ? '⚠️ sem valor' : `R$ ${Number(a.valor).toFixed(2).replace('.', ',')}`}
                      </div>
                    </div>
                  ))}

                  {/* Linha de total bonificação */}
                  <div className="grid grid-cols-4 gap-4 px-5 py-3 bg-gray-50 border-t border-gray-200">
                    <div className="col-span-3 text-sm font-semibold text-gray-700">Subtotal bonificação</div>
                    <div className="text-sm font-bold text-gray-900 text-right">
                      R$ {totalBonus.toFixed(2).replace('.', ',')}
                    </div>
                  </div>

                  {/* Linha de horas do professor */}
                  {isProfCT && (
                    <div className="px-5 py-3 border-t border-gray-100 bg-blue-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-blue-900">Horas trabalhadas (professor)</div>
                          <div className="text-xs text-blue-700">{totalHoras} h × R$ {valorHora.toFixed(2).replace('.', ',')}/h</div>
                        </div>
                        <div className="text-sm font-bold text-blue-800">+ R$ {valorHoras.toFixed(2).replace('.', ',')}</div>
                      </div>
                      {horas.length > 0 && (
                        <div className="mt-3 border-t border-blue-100 pt-2 space-y-1">
                          {horas.map((h, i) => (
                            <div key={i} className="grid grid-cols-3 gap-2 text-xs text-blue-700">
                              <span className="capitalize">{new Date(h.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'numeric', month:'short' })}</span>
                              <span className="text-blue-400 text-center">{h.fonte}</span>
                              <span className="font-mono text-right">{h.horas} h</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Toggle salário fixo */}
                  {!isProfessor && salarioFixo > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-amber-50">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setIncluirFixo(v => !v)}
                          className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${incluirFixo ? 'bg-amber-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${incluirFixo ? 'translate-x-4' : ''}`}/>
                        </button>
                        <div>
                          <div className="text-sm font-medium text-amber-900">Incluir salário fixo</div>
                          <div className="text-xs text-amber-700">R$ {salarioFixo.toFixed(2).replace('.', ',')} / mês</div>
                        </div>
                      </div>
                      {incluirFixo && (
                        <div className="text-sm font-bold text-amber-800">
                          + R$ {salarioFixo.toFixed(2).replace('.', ',')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Total final */}
                  <div className="grid grid-cols-4 gap-4 px-5 py-3 bg-primary-50 border-t-2 border-primary-100">
                    <div className="col-span-3 text-sm font-bold text-primary-800">
                      Total a pagar{incluirFixo ? ' (bônus + fixo)' : ''}
                    </div>
                    <div className="text-sm font-bold text-primary-700 text-right">
                      R$ {totalFinal.toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Botão lançar despesa */}
            {!loadingAulas && (totalAulas > 0 || (isProfCT && totalHoras > 0)) && (
              <div className="card">
                {lancado ? (
                  <div className="flex items-center gap-3 text-green-700">
                    <CheckCircle size={20} className="text-green-500 flex-shrink-0"/>
                    <div>
                      <div className="font-semibold text-sm">Despesa lançada com sucesso!</div>
                      <div className="text-xs text-green-600 mt-0.5">
                        R$ {totalFinal.toFixed(2).replace('.', ',')} · {coachSel.nome} · {formatarData(inicio)} a {formatarData(fim)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Lançar como despesa</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Cria um registro de <strong>R$ {totalFinal.toFixed(2).replace('.', ',')}</strong> em contas a pagar para {coachSel.nome}
                      </div>
                    </div>
                    <button onClick={lancarDespesa} disabled={lancando}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-all disabled:opacity-60 flex-shrink-0">
                      <DollarSign size={15}/>
                      {lancando ? 'Lançando...' : 'Lançar despesa'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Aviso se há aulas sem valor configurado */}
            {!loadingAulas && aulas.some(a => a.valor === 0) && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
                ⚠️ Algumas aulas estão sem valor configurado. Configure os valores na página de <strong>Coaches → Unidades</strong>.
              </div>
            )}
          </>
        )}

        {!modoMulti && !coachSel && (
          <div className="card text-center py-12 text-gray-400">
            <DollarSign size={32} className="mx-auto mb-3 text-gray-300"/>
            <div className="text-sm">Selecione uma unidade, período e coach para ver o relatório.</div>
          </div>
        )}
      </div>
    </div>
  )
}
