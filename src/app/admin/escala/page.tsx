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

  const VERDE = '#16a34a'
  const VERDE_HOVER = '#15803d'
  const VERDE_LIGHT = '#dcfce7'

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
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 8,
                    border: `1.5px solid ${ativa ? VERDE : '#e5e7eb'}`,
                    background: ativa ? VERDE_LIGHT : '#fff',
                    color: ativa ? '#15803d' : '#4b5563',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}>
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
            style={{
              padding: '0.6rem 1rem',
              fontSize: 14,
              fontWeight: 500,
              borderBottom: `2px solid ${aba === t.key ? VERDE : 'transparent'}`,
              color: aba === t.key ? VERDE : '#6b7280',
              background: 'transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}>
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
          <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, color: '#1d4ed8' }}>
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
                            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {disp.length > 0 ? (
                    <button onClick={() => abrirModalAdicionar(data)}
                      style={{ width: '100%', background: 'transparent', border: `1.5px dashed ${VERDE}`, borderRadius: 8, padding: '0.5rem', color: VERDE, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
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
          <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, color: '#1d4ed8' }}>
              💡 Datas marcadas como <strong>feriado ativo</strong> ignoram a grade fixa e usam só os coaches escalados aqui, com horários de FDS.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <button onClick={() => setModalNovoFeriado(true)}
              style={{ background: VERDE, color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.2rem', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              + Novo feriado
            </button>
          </div>

          {feriados.length === 0 ? (
            <div className="card text-center text-gray-400 py-8" style={{ borderStyle: 'dashed' }}>
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
                  <div key={f.id} className="card" style={f.ativo ? { borderColor: '#fed7aa' } : {}}>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="text-center flex-shrink-0 w-14">
                        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: f.ativo ? '#f97316' : '#9ca3af' }}>{diaNum}</div>
                        <div className="text-xs text-gray-400 uppercase mt-0.5">{mesNome}</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{f.descricao}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{diaSemNome}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: f.ativo ? '#ea580c' : '#9ca3af' }}>
                          {f.ativo ? '● Ativo' : '○ Inativo'}
                        </div>
                      </div>
                      <button onClick={() => removerFeriado(f.id)}
                        style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>
                        ×
                      </button>
                    </div>

                    <button onClick={() => toggleFeriadoAtivo(f.id, f.ativo)}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: `1px solid ${f.ativo ? '#fdba74' : '#e5e7eb'}`,
                        borderRadius: 8,
                        padding: '0.4rem',
                        color: f.ativo ? '#ea580c' : '#6b7280',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginBottom: 12,
                      }}>
                      {f.ativo ? 'Desativar feriado' : 'Ativar feriado'}
                    </button>

                    {coachesEsc.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {coachesEsc.map(e => (
                          <div key={e.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                            <span className="text-gray-800">{nomeCoach(e.coach_id)}</span>
                            <button onClick={() => removerCoachDaEscala(e.id)}
                              style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>
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
                        style={{ width: '100%', background: 'transparent', border: `1.5px dashed ${VERDE}`, borderRadius: 8, padding: '0.5rem', color: VERDE, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, padding: '1.5rem' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 4 }}>Adicionar coaches</h3>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 4, textTransform: 'capitalize' }}>
              {formatarDataPT(modalAdicionar.data)}
            </p>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
              Marque um ou mais coaches para escalar neste dia.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 320, overflowY: 'auto' }}>
              {coachesNaoEscalados(modalAdicionar.data).map(c => {
                const selecionado = coachesSelecionados.has(c.user_id)
                return (
                  <label key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '0.6rem 1rem',
                      borderRadius: 8,
                      border: `1.5px solid ${selecionado ? VERDE : '#e5e7eb'}`,
                      background: selecionado ? VERDE_LIGHT : '#fff',
                      cursor: 'pointer',
                    }}>
                    <input
                      type="checkbox"
                      checked={selecionado}
                      onChange={() => toggleCoachSelecionado(c.user_id)}
                      style={{ width: 16, height: 16, accentColor: VERDE, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 14, color: '#1f2937', flex: 1 }}>{c.nome}</span>
                    {selecionado && (
                      <span style={{ fontSize: 12, color: VERDE, fontWeight: 600 }}>✓ Selecionado</span>
                    )}
                  </label>
                )
              })}
            </div>

            {coachesSelecionados.size > 0 && (
              <div style={{ background: VERDE_LIGHT, border: `1px solid ${VERDE}55`, borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 14, color: '#166534', marginBottom: 12 }}>
                {coachesSelecionados.size} coach{coachesSelecionados.size > 1 ? 'es' : ''} selecionado{coachesSelecionados.size > 1 ? 's' : ''}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setModalAdicionar(null); setCoachesSelecionados(new Set()) }}
                style={{ flex: 1, background: '#fff', border: '1px solid #e5e7eb', color: '#4b5563', borderRadius: 8, padding: '0.5rem', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={adicionarCoachesNaEscala} disabled={coachesSelecionados.size === 0 || salvandoCoach}
                style={{
                  flex: 2,
                  background: coachesSelecionados.size > 0 && !salvandoCoach ? VERDE : '#d1d5db',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '0.5rem',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: coachesSelecionados.size > 0 && !salvandoCoach ? 'pointer' : 'default',
                }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, padding: '1.5rem' }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 16 }}>Novo feriado</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#4b5563', marginBottom: 4, display: 'block' }}>Data</label>
              <input type="date" value={novoFeriadoData}
                onChange={e => setNovoFeriadoData(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 14, outline: 'none' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#4b5563', marginBottom: 4, display: 'block' }}>Descrição</label>
              <input type="text" value={novoFeriadoDescricao}
                onChange={e => setNovoFeriadoDescricao(e.target.value)}
                placeholder="Ex: Corpus Christi"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 14, outline: 'none' }} />
            </div>

            {erroFeriado && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 14, marginBottom: 12 }}>
                {erroFeriado}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setModalNovoFeriado(false); setNovoFeriadoData(''); setNovoFeriadoDescricao(''); setErroFeriado('') }}
                style={{ flex: 1, background: '#fff', border: '1px solid #e5e7eb', color: '#4b5563', borderRadius: 8, padding: '0.5rem', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={criarFeriado} disabled={salvandoFeriado}
                style={{ flex: 2, background: salvandoFeriado ? '#d1d5db' : VERDE, color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem', fontSize: 14, fontWeight: 600, cursor: salvandoFeriado ? 'default' : 'pointer' }}>
                {salvandoFeriado ? 'Salvando...' : 'Criar feriado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
