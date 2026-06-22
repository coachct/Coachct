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

export default function PagamentosCoachesPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [unidades,     setUnidades]     = useState<any[]>([])
  const [unidadeSel,   setUnidadeSel]   = useState<any>(null)
  const [coaches,      setCoaches]      = useState<any[]>([])
  const [coachSel,     setCoachSel]     = useState<any>(null)
  const [filtro,       setFiltro]       = useState<'hoje'|'7dias'|'mes'|'custom'>('mes')
  const [inicio,       setInicio]       = useState('')
  const [fim,          setFim]          = useState('')
  const [aulas,        setAulas]        = useState<any[]>([])
  const [loadingAulas, setLoadingAulas] = useState(false)
  const [incluirFixo,  setIncluirFixo]  = useState(false)
  const [lancando,     setLancando]     = useState(false)
  const [lancado,      setLancado]      = useState(false)
  const [msg,          setMsg]          = useState('')

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregarUnidades() }, [perfil])
  useEffect(() => { if (unidadeSel) carregarCoaches() }, [unidadeSel?.id])
  useEffect(() => { aplicarFiltroRapido(filtro) }, [filtro])
  useEffect(() => { if (coachSel && inicio && fim) carregarAulas() }, [coachSel?.id, inicio, fim])

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades').select('id, nome, tipo').eq('ativo', true).order('nome')
    setUnidades(data || [])
    if (data && data.length > 0) setUnidadeSel(data[0])
  }

  async function carregarCoaches() {
    if (!unidadeSel) return
    setCoachSel(null); setAulas([])
    const { data: cu } = await supabase.from('coach_unidades').select('coach_id')
      .eq('unidade_id', unidadeSel.id).eq('ativo', true)
    const ids = (cu || []).map((c: any) => c.coach_id)
    if (!ids.length) { setCoaches([]); return }
    const { data } = await supabase.from('coaches')
      .select('id, nome, salario_fixo')
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
    }
  }

  async function carregarAulas() {
    if (!coachSel || !unidadeSel || !inicio || !fim) return
    setLoadingAulas(true); setLancado(false); setIncluirFixo(false)

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
    setLoadingAulas(false)
  }

  const totalAulas   = aulas.length
  const totalBonus   = aulas.reduce((sum, a) => sum + (a.valor || 0), 0)
  const salarioFixo  = Number(coachSel?.salario_fixo || 0)
  const totalFinal   = totalBonus + (incluirFixo ? salarioFixo : 0)

  async function lancarDespesa() {
    if (!coachSel || !unidadeSel || totalAulas === 0) return
    setLancando(true)

    // 1) Registro do pagamento do coach (inalterado)
    const { data: pag, error } = await supabase.from('coach_pagamentos').insert({
      coach_id:       coachSel.id,
      unidade_id:     unidadeSel.id,
      periodo_inicio: inicio,
      periodo_fim:    fim,
      total_aulas:    totalAulas,
      valor_por_aula: totalBonus / totalAulas,
      valor_total:    totalFinal,
      status:         'pendente',
      observacao:     `${coachSel.nome} — ${totalAulas} aulas em ${unidadeSel.nome} (${formatarData(inicio)} a ${formatarData(fim)})${incluirFixo ? ` + fixo R$ ${salarioFixo.toFixed(2).replace('.', ',')}` : ''}`,
    }).select('id').maybeSingle()

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
      descricao:          `Pagamento ${coachSel.nome} — ${totalAulas} aulas (${formatarData(inicio)} a ${formatarData(fim)})`,
      valor:              totalFinal,
      competencia,
      vencimento,
      pago:               false,
      origem:             'coach',
      coach_pagamento_id: pag?.id || null,
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
              {unidades.map(u => (
                <button key={u.id} onClick={() => setUnidadeSel(u)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    unidadeSel?.id === u.id
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                  }`}>
                  {u.nome}
                </button>
              ))}
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
          <div>
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

        {/* Resultado */}
        {coachSel && inicio && fim && (
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
              ) : aulas.length === 0 ? (
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

                  {/* Toggle salário fixo */}
                  {salarioFixo > 0 && (
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
            {!loadingAulas && totalAulas > 0 && (
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

        {!coachSel && (
          <div className="card text-center py-12 text-gray-400">
            <DollarSign size={32} className="mx-auto mb-3 text-gray-300"/>
            <div className="text-sm">Selecione uma unidade, período e coach para ver o relatório.</div>
          </div>
        )}
      </div>
    </div>
  )
}
