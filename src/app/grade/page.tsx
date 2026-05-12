'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useUnidade } from '@/hooks/useUnidade'
import { PageHeader, Spinner } from '@/components/ui'

const DIAS_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function formatarData(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatarDataPT(dataStr: string): string {
  const d = new Date(dataStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function AdminEscalaPage() {
  const supabase = createClient()
  const { unidadeAtiva, setUnidadeAtiva, unidadesPermitidas, loading: loadingUnidade } = useUnidade()

  const [aba, setAba] = useState<'fds' | 'feriados'>('fds')
  const [coachesDisponiveis, setCoachesDisponiveis] = useState<any[]>([])
  const [escalas, setEscalas] = useState<any[]>([])
  const [feriados, setFeriados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [modalAdicionar, setModalAdicionar] = useState<{ data: string } | null>(null)
  const [coachesSelecionados, setCoachesSelecionados] = useState<Set<string>>(new Set())
  const [salvandoCoach, setSalvandoCoach] = useState(false)

  const [modalNovoFeriado, setModalNovoFeriado] = useState(false)
  const [novoFeriadoData, setNovoFeriadoData] = useState('')
  const [novoFeriadoDescricao, setNovoFeriadoDescricao] = useState('')
  const [salvandoFeriado, setSalvandoFeriado] = useState(false)
  const [erroFeriado, setErroFeriado] = useState('')

  useEffect(() => {
    if (unidadeAtiva) loadDados()
  }, [unidadeAtiva?.id])

  const proximosFDS = (() => {
    const datas: { data: string; nome: string }[] = []
    const hoje = new Date()
    hoje.setHours(12, 0, 0, 0)
    let count = 0
    let cursor = new Date(hoje)
    while (count < 12) {
      const diaSem = cursor.getDay()
      if (diaSem === 0 || diaSem === 6) {
        datas.push({ data: formatarData(cursor), nome: DIAS_SEMANA_LABEL[diaSem] })
        count++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return datas
  })()

  async function loadDados() {
    if (!unidadeAtiva) return
    setLoading(true)
    const dataInicio = formatarData(new Date())
    const dataLimite = new Date()
    dataLimite.setMonth(dataLimite.getMonth() + 3)

    const [{ data: coaches }, { data: esc }, { data: fer }] = await Promise.all([
      supabase.from('coaches').select('id, nome, user_id').eq('ativo', true).order('nome'),
      supabase.from('escala_fds')
        .select('*')
        .eq('unidade_id', unidadeAtiva.id)
        .gte('data', dataInicio)
        .lte('data', formatarData(dataLimite))
        .order('data'),
      supabase.from('feriados')
        .select('*')
        .eq('unidade_id', unidadeAtiva.id)
        .gte('data', dataInicio)
        .order('data'),
    ])

    setCoachesDisponiveis(coaches || [])
    setEscalas(esc || [])
    setFeriados(fer || [])
    setLoading(false)
  }

  function nomeCoach(coachUserId: string): string {
    const c = coachesDisponiveis.find(c => c.user_id === coachUserId)
    return c?.nome || 'Coach'
  }

  function coachesDaData(data: string): any[] {
    return escalas.filter(e => e.data === data)
  }
  function coachesNaoEscalados(data: string): any[] {
    const idsEscalados = new Set(coachesDaData(data).map(e => e.coach_id))
    return coachesDisponiveis.filter(c => !idsEscalados.has(c.user_id))
  }

  function toggleCoachSelecionado(userId: string) {
    setCoachesSelecionados(prev => {
      const novo = new Set(prev)
      if (novo.has(userId)) novo.delete(userId)
      else novo.add(userId)
      return novo
    })
  }

  function abrirModalAdicionar(data: string) {
    setModalAdicionar({ data })
    setCoachesSelecionados(new Set())
  }

  async function adicionarCoachesNaEscala() {
    if (coachesSelecionados.size === 0 || !modalAdicionar || !unidadeAtiva) return
    setSalvandoCoach(true)

    const registros = Array.from(coachesSelecionados).map(userId => ({
      unidade_id: unidadeAtiva.id,
      data: modalAdicionar.data,
      coach_id: userId,
    }))

    const { error } = await supabase.from('escala_fds').insert(registros)

    if (!error) {
      setModalAdicionar(null)
      setCoachesSelecionados(new Set())
      await loadDados()
    }
    setSalvandoCoach(false)
  }

  async function removerCoachDaEscala(escalaId: string) {
    if (!confirm('Remover este coach da escala?')) return
    await supabase.from('escala_fds').delete().eq('id', escalaId)
    await loadDados()
  }

  async function criarFeriado() {
    if (!novoFeriadoData) { setErroFeriado('Selecione a data.'); return }
    if (!novoFeriadoDescricao.trim()) { setErroFeriado('Descreva o feriado.'); return }
    if (!unidadeAtiva) return
    setSalvandoFeriado(true)
    setErroFeriado('')
    const { error } = await supabase.from('feriados').insert({
      unidade_id: unidadeAtiva.id,
      data: novoFeriadoData,
      descricao: novoFeriadoDescricao.trim(),
      ativo: true,
    })
    if (error) {
      if (error.code === '23505') setErroFeriado('Já existe feriado nesta data.')
      else setErroFeriado('Erro ao criar feriado.')
      setSalvandoFeriado(false)
      return
    }
    setModalNovoFeriado(false)
    setNovoFeriadoData('')
    setNovoFeriadoDescricao('')
    setSalvandoFeriado(false)
    await loadDados()
  }

  async function toggleFeriadoAtivo(id: string, ativo: boolean) {
    await supabase.from('feriados').update({ ativo: !ativo }).eq('id', id)
    await loadDados()
  }

  async function removerFeriado(id: string) {
    if (!confirm('Remover este feriado? A grade fixa voltará a valer nesta data.')) return
    await supabase.from('feriados').delete().eq('id', id)
    await loadDados()
  }

  if (loadingUnidade || loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Escala" subtitle="Final de semana e feriados — coaches escalados pontualmente" />

      {/* Seletor de unidade */}
      {unidadesPermitidas.length > 1 && (
        <div className="mb-6">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Unidade</div>
          <div className="flex gap-2 flex-wrap">
            {unidadesPermitidas.map(u => {
              const ativa = unidadeAtiva?.id === u.id
              return (
                <button key={u.id} onClick={() => setUnidadeAtiva(u)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                    ativa
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-green-300'
                  }`}>
                  {u.nome}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        {[
          { key: 'fds', label: 'Final de Semana' },
          { key: 'feriados', label: 'Feriados' },
        ].map(t => (
          <button key={t.key} onClick={() => setAba(t.key as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              aba === t.key
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {!unidadeAtiva ? (
        <div className="card text-center text-gray-400 py-8">
          Selecione uma unidade.
        </div>
      ) : aba === 'fds' ? (
        <>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-blue-700">
              💡 Horários no FDS: <strong>08:00, 09:00, 10:00, 11:00, 12:00</strong>. Cada coach escalado cobre todos os 5 horários.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {proximosFDS.map(({ data, nome }) => {
              const coachesEsc = coachesDaData(data)
              const disp = coachesNaoEscalados(data)
              const dataObj = new Date(data + 'T12:00:00')
              const diaNum = dataObj.getDate()
              const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })

              return (
                <div key={data} className="card">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-center flex-shrink-0 w-14">
                      <div className="text-2xl font-bold text-gray-800 leading-none">{diaNum}</div>
                      <div className="text-xs text-gray-400 uppercase mt-0.5">{mesNome}</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{nome}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {coachesEsc.length === 0
                          ? 'Nenhum coach escalado'
                          : `${coachesEsc.length} coach${coachesEsc.length > 1 ? 'es' : ''} · ${coachesEsc.length} vaga${coachesEsc.length > 1 ? 's' : ''}/horário`}
                      </div>
                    </div>
                  </div>

                  {coachesEsc.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {coachesEsc.map(e => (
                        <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                          <span className="text-gray-800">{nomeCoach(e.coach_id)}</span>
                          <button onClick={() => removerCoachDaEscala(e.id)}
                            className="text-gray-400 hover:text-red-500 text-lg leading-none px-1">
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {disp.length > 0 ? (
                    <button onClick={() => abrirModalAdicionar(data)}
                      className="w-full border border-dashed border-green-400 text-green-700 hover:bg-green-50 rounded-lg py-2 text-sm font-medium transition">
                      + Adicionar coach
                    </button>
                  ) : (
                    <div className="text-center text-xs text-gray-400 py-2">
                      Todos os coaches escalados
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-blue-700">
              💡 Datas marcadas como <strong>feriado ativo</strong> ignoram a grade fixa e usam só os coaches escalados aqui, com horários de FDS.
            </p>
          </div>

          <div className="mb-4">
            <button onClick={() => setModalNovoFeriado(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm">
              + Novo feriado
            </button>
          </div>

          {feriados.length === 0 ? (
            <div className="card text-center text-gray-400 py-8 border-dashed">
              Nenhum feriado cadastrado para esta unidade.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {feriados.map(f => {
                const coachesEsc = coachesDaData(f.data)
                const disp = coachesNaoEscalados(f.data)
                const dataObj = new Date(f.data + 'T12:00:00')
                const diaNum = dataObj.getDate()
                const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })
                const diaSemNome = DIAS_SEMANA_LABEL[dataObj.getDay()]

                return (
                  <div key={f.id} className={`card ${f.ativo ? 'border-orange-200' : ''}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="text-center flex-shrink-0 w-14">
                        <div className={`text-2xl font-bold leading-none ${f.ativo ? 'text-orange-500' : 'text-gray-400'}`}>{diaNum}</div>
                        <div className="text-xs text-gray-400 uppercase mt-0.5">{mesNome}</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{f.descricao}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{diaSemNome}</div>
                        <div className={`text-xs font-medium mt-1 ${f.ativo ? 'text-orange-600' : 'text-gray-400'}`}>
                          {f.ativo ? '● Ativo' : '○ Inativo'}
                        </div>
                      </div>
                      <button onClick={() => removerFeriado(f.id)}
                        className="text-gray-400 hover:text-red-500 text-xl leading-none px-1">
                        ×
                      </button>
                    </div>

                    <button onClick={() => toggleFeriadoAtivo(f.id, f.ativo)}
                      className={`w-full border rounded-lg py-1.5 text-xs font-medium transition mb-3 ${
                        f.ativo
                          ? 'border-orange-300 text-orange-600 hover:bg-orange-50'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}>
                      {f.ativo ? 'Desativar feriado' : 'Ativar feriado'}
                    </button>

                    {coachesEsc.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {coachesEsc.map(e => (
                          <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                            <span className="text-gray-800">{nomeCoach(e.coach_id)}</span>
                            <button onClick={() => removerCoachDaEscala(e.id)}
                              className="text-gray-400 hover:text-red-500 text-lg leading-none px-1">
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {coachesEsc.length === 0 && (
                      <div className="text-center text-xs text-gray-400 mb-2">
                        Nenhum coach escalado
                      </div>
                    )}

                    {disp.length > 0 && (
                      <button onClick={() => abrirModalAdicionar(f.data)}
                        className="w-full border border-dashed border-green-400 text-green-700 hover:bg-green-50 rounded-lg py-2 text-sm font-medium transition">
                        + Adicionar coach
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Modal adicionar coach (MULTI-SELEÇÃO) */}
      {modalAdicionar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Adicionar coaches</h3>
            <p className="text-sm text-gray-500 mb-1 capitalize">
              {formatarDataPT(modalAdicionar.data)}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Marque um ou mais coaches para escalar neste dia.
            </p>

            <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
              {coachesNaoEscalados(modalAdicionar.data).map(c => {
                const selecionado = coachesSelecionados.has(c.user_id)
                return (
                  <label key={c.id}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition ${
                      selecionado
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <input
                      type="checkbox"
                      checked={selecionado}
                      onChange={() => toggleCoachSelecionado(c.user_id)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0"
                    />
                    <span className="text-sm text-gray-800 flex-1">{c.nome}</span>
                    {selecionado && (
                      <span className="text-xs text-green-600 font-medium">✓ Selecionado</span>
                    )}
                  </label>
                )
              })}
            </div>

            {coachesSelecionados.size > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 mb-3">
                {coachesSelecionados.size} coach{coachesSelecionados.size > 1 ? 'es' : ''} selecionado{coachesSelecionados.size > 1 ? 's' : ''}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setModalAdicionar(null); setCoachesSelecionados(new Set()) }}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={adicionarCoachesNaEscala} disabled={coachesSelecionados.size === 0 || salvandoCoach}
                className={`flex-[2] rounded-lg py-2 text-sm font-medium text-white transition ${
                  coachesSelecionados.size > 0 && !salvandoCoach
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}>
                {salvandoCoach
                  ? 'Salvando...'
                  : coachesSelecionados.size === 0
                    ? 'Adicionar'
                    : `Adicionar ${coachesSelecionados.size} coach${coachesSelecionados.size > 1 ? 'es' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal novo feriado */}
      {modalNovoFeriado && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Novo feriado</h3>

            <div className="mb-3">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Data</label>
              <input type="date" value={novoFeriadoData}
                onChange={e => setNovoFeriadoData(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />
            </div>

            <div className="mb-4">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição</label>
              <input type="text" value={novoFeriadoDescricao}
                onChange={e => setNovoFeriadoDescricao(e.target.value)}
                placeholder="Ex: Corpus Christi"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-500" />
            </div>

            {erroFeriado && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">
                {erroFeriado}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setModalNovoFeriado(false); setNovoFeriadoData(''); setNovoFeriadoDescricao(''); setErroFeriado('') }}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={criarFeriado} disabled={salvandoFeriado}
                className={`flex-[2] rounded-lg py-2 text-sm font-medium text-white transition ${
                  salvandoFeriado ? 'bg-gray-300' : 'bg-green-600 hover:bg-green-700'
                }`}>
                {salvandoFeriado ? 'Salvando...' : 'Criar feriado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
