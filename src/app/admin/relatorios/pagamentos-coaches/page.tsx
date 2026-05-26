'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { DollarSign, CheckCircle } from 'lucide-react'

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function inicioDia(d: Date) { return dataLocalStr(d) }
function fimDia(d: Date)    { return dataLocalStr(d) }

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
    const { data } = await supabase.from('coaches').select('id, nome, adicional_por_aula, salario_fixo')
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
    setLoadingAulas(true); setLancado(false)

    if (unidadeSel.tipo === 'ct') {
      // CT: agendamentos realizados, agrupa por data+horario (sessão única)
      const { data } = await supabase.from('agendamentos')
        .select('id, data, horario, status')
        .eq('coach_id', coachSel.id)
        .eq('unidade_id', unidadeSel.id)
        .gte('data', inicio).lte('data', fim)
        .eq('status', 'realizado')
        .order('data').order('horario')

      // Agrupa por data+horario para contar sessões únicas (não clientes)
      const sessoes: Record<string, any> = {}
      for (const ag of (data || [])) {
        const key = `${ag.data}-${ag.horario}`
        if (!sessoes[key]) sessoes[key] = { data: ag.data, horario: ag.horario, tipo: 'CT', clientes: 0 }
        sessoes[key].clientes++
      }
      setAulas(Object.values(sessoes).sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario)))
    } else {
      // Club: ocorrências ativas das aulas do coach nessa unidade
      const { data: aulasIds } = await supabase.from('club_aulas').select('id, tipo, horario')
        .eq('coach_id', coachSel.id).eq('unidade_id', unidadeSel.id).eq('ativo', true)
      const ids = (aulasIds || []).map((a: any) => a.id)
      if (!ids.length) { setAulas([]); setLoadingAulas(false); return }

      const aulaMap: Record<string, any> = {}
      for (const a of (aulasIds || [])) aulaMap[a.id] = a

      const { data: ocs } = await supabase.from('club_ocorrencias')
        .select('id, data, aula_id, status')
        .in('aula_id', ids).gte('data', inicio).lte('data', fim)
        .eq('status', 'ativa').order('data')

      setAulas((ocs || []).map((oc: any) => ({
        data:    oc.data,
        horario: aulaMap[oc.aula_id]?.horario || '',
        tipo:    tipoLabelClub(aulaMap[oc.aula_id]?.tipo || ''),
        clientes: null,
      })))
    }
    setLoadingAulas(false)
  }

  function tipoLabelClub(t: string) {
    if (t === 'lift')              return 'Lift'
    if (t === 'lift_for_girls')   return 'Lift for Girls'
    if (t === 'running_funcional') return 'Running + Funcional'
    return t
  }

  const totalAulas    = aulas.length
  const valorPorAula  = Number(coachSel?.adicional_por_aula || 0)
  const totalBonus    = totalAulas * valorPorAula

  async function lancarDespesa() {
    if (!coachSel || !unidadeSel || totalAulas === 0) return
    setLancando(true)
    const { error } = await supabase.from('coach_pagamentos').insert({
      coach_id:       coachSel.id,
      unidade_id:     unidadeSel.id,
      periodo_inicio: inicio,
      periodo_fim:    fim,
      total_aulas:    totalAulas,
      valor_por_aula: valorPorAula,
      valor_total:    totalBonus,
      status:         'pendente',
      observacao:     `${coachSel.nome} — ${totalAulas} aulas em ${unidadeSel.nome} (${formatarData(inicio)} a ${formatarData(fim)})`,
    })
    setLancando(false)
    if (error) { showMsg('Erro: ' + error.message); return }
    setLancado(true)
    showMsg(`✅ Despesa de R$ ${totalBonus.toFixed(2).replace('.', ',')} lançada com sucesso!`)
  }

  function formatarData(d: string) {
    if (!d) return ''
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
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
                { key: 'hoje',  label: 'Hoje' },
                { key: '7dias', label: 'Últimos 7 dias' },
                { key: 'mes',   label: 'Mês atual' },
                { key: 'custom',label: 'Personalizado' },
              ] as const).map(f => (
                <button key={f.key} onClick={() => { setFiltro(f.key); if (f.key !== 'custom') aplicarFiltroRapido(f.key) }}
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
              <div className="text-xs text-gray-400 mt-2">
                {formatarData(inicio)} → {formatarData(fim)}
              </div>
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
            {/* Resumo financeiro */}
            <div className="grid grid-cols-3 gap-4">
              <div className="card text-center">
                <div className="text-3xl font-bold text-gray-900">{loadingAulas ? '—' : totalAulas}</div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Aulas ministradas</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-gray-900">
                  R$ {valorPorAula.toFixed(2).replace('.', ',')}
                </div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Valor por aula</div>
              </div>
              <div className="card text-center border-2 border-primary-200 bg-primary-50">
                <div className="text-3xl font-bold text-primary-700">
                  {loadingAulas ? '—' : `R$ ${totalBonus.toFixed(2).replace('.', ',')}`}
                </div>
                <div className="text-xs text-primary-500 mt-1 uppercase tracking-wide font-semibold">Total bonificação</div>
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
                  {/* Header */}
                  <div className="grid grid-cols-4 gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <div>Data</div>
                    <div>Horário</div>
                    <div>Tipo</div>
                    <div className="text-right">Valor</div>
                  </div>
                  {aulas.map((a, i) => (
                    <div key={i} className="grid grid-cols-4 gap-4 px-5 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'numeric', month:'short' })}
                      </div>
                      <div className="text-sm font-mono text-gray-700">{(a.horario || '').slice(0, 5)}</div>
                      <div className="text-sm text-gray-600">{a.tipo}</div>
                      <div className="text-sm font-semibold text-gray-900 text-right">
                        R$ {valorPorAula.toFixed(2).replace('.', ',')}
                      </div>
                    </div>
                  ))}
                  {/* Total */}
                  <div className="grid grid-cols-4 gap-4 px-5 py-3 bg-primary-50 border-t-2 border-primary-100">
                    <div className="col-span-3 text-sm font-bold text-primary-800">Total</div>
                    <div className="text-sm font-bold text-primary-700 text-right">
                      R$ {totalBonus.toFixed(2).replace('.', ',')}
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
                        R$ {totalBonus.toFixed(2).replace('.', ',')} · {coachSel.nome} · {formatarData(inicio)} a {formatarData(fim)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Lançar como despesa</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Cria um registro de R$ {totalBonus.toFixed(2).replace('.', ',')} em contas a pagar para {coachSel.nome}
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
