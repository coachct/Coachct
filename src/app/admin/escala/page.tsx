'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useUnidade } from '@/hooks/useUnidade'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'
const VERDE = '#aaff88'
const AMARELO = '#ffaa00'

const HORARIOS_FDS = ['08:00', '09:00', '10:00', '11:00', '12:00']
const DIAS_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function formatarData(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatarDataPT(dataStr: string): string {
  const d = new Date(dataStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function AdminEscalaPage() {
  const { perfil, loading } = useAuth()
  const { unidadeAtiva, setUnidadeAtiva, unidadesPermitidas, loading: loadingUnidade } = useUnidade()
  const router = useRouter()
  const supabase = createClient()

  const [aba, setAba] = useState<'fds' | 'feriados'>('fds')
  const [coachesDisponiveis, setCoachesDisponiveis] = useState<any[]>([])
  const [escalas, setEscalas] = useState<any[]>([])
  const [feriados, setFeriados] = useState<any[]>([])
  const [loadingDados, setLoadingDados] = useState(true)

  // Modal adicionar coach
  const [modalAdicionar, setModalAdicionar] = useState<{ data: string; tipo: 'fds' | 'feriado' } | null>(null)
  const [coachSelecionado, setCoachSelecionado] = useState<string>('')
  const [salvandoCoach, setSalvandoCoach] = useState(false)

  // Modal novo feriado
  const [modalNovoFeriado, setModalNovoFeriado] = useState(false)
  const [novoFeriadoData, setNovoFeriadoData] = useState('')
  const [novoFeriadoDescricao, setNovoFeriadoDescricao] = useState('')
  const [salvandoFeriado, setSalvandoFeriado] = useState(false)
  const [erroFeriado, setErroFeriado] = useState('')

  useEffect(() => {
    if (!loading && !perfil) router.push('/login')
    if (!loading && perfil && !['admin', 'coordenadora'].includes(perfil.role as string)) {
      router.push('/')
    }
  }, [perfil, loading])

  useEffect(() => {
    if (perfil && unidadeAtiva) loadDados()
  }, [perfil, unidadeAtiva?.id])

  // Calcula os próximos 6 fins de semana
  const proximosFDS = (() => {
    const datas: { data: string; nome: string }[] = []
    const hoje = new Date()
    hoje.setHours(12, 0, 0, 0)

    let count = 0
    let cursor = new Date(hoje)
    while (count < 12) {
      const diaSem = cursor.getDay()
      if (diaSem === 0 || diaSem === 6) {
        datas.push({
          data: formatarData(cursor),
          nome: DIAS_SEMANA_LABEL[diaSem],
        })
        count++
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return datas
  })()

  async function loadDados() {
    if (!unidadeAtiva) return
    setLoadingDados(true)

    const dataInicio = formatarData(new Date())
    const dataLimite = new Date()
    dataLimite.setMonth(dataLimite.getMonth() + 3)

    const [{ data: coaches }, { data: esc }, { data: fer }] = await Promise.all([
      supabase.from('perfis').select('id, nome').eq('role', 'coach').order('nome'),
      supabase.from('escala_fds')
        .select('*, perfis:coach_id(nome)')
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
    setLoadingDados(false)
  }

  function coachesDaData(data: string): any[] {
    return escalas.filter(e => e.data === data)
  }

  function coachesNaoEscalados(data: string): any[] {
    const escaladosIds = new Set(coachesDaData(data).map(e => e.coach_id))
    return coachesDisponiveis.filter(c => !escaladosIds.has(c.id))
  }

  async function adicionarCoachNaEscala() {
    if (!coachSelecionado || !modalAdicionar || !unidadeAtiva) return
    setSalvandoCoach(true)

    const { error } = await supabase.from('escala_fds').insert({
      unidade_id: unidadeAtiva.id,
      data: modalAdicionar.data,
      coach_id: coachSelecionado,
    })

    if (!error) {
      setModalAdicionar(null)
      setCoachSelecionado('')
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
      if (error.code === '23505') setErroFeriado('Já existe feriado cadastrado nesta data.')
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

  async function toggleFeriadoAtivo(feriadoId: string, ativoAtual: boolean) {
    await supabase.from('feriados').update({ ativo: !ativoAtual }).eq('id', feriadoId)
    await loadDados()
  }

  async function removerFeriado(feriadoId: string) {
    if (!confirm('Remover este feriado? A grade fixa voltará a valer nesta data.')) return
    await supabase.from('feriados').delete().eq('id', feriadoId)
    await loadDados()
  }

  if (loading || loadingUnidade) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0', padding: '2rem 1.5rem' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .tab-btn { transition: all .2s; cursor: pointer; }
        .tab-btn:hover { border-color: ${ACCENT} !important; }
        .card-dia { transition: border-color .2s; }
        .card-dia:hover { border-color: ${ACCENT}55 !important; }
        .coach-tag { transition: all .15s; }
        .coach-tag:hover { background: #2a1018 !important; }
        .btn-add:hover { background: ${ACCENT}22 !important; }
        .unidade-tab:hover { border-color: ${ACCENT} !important; color: #fff !important; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#fff', letterSpacing: 1 }}>
            ESCALA
          </div>
          <div style={{ fontSize: 14, color: '#aaa', marginTop: 4 }}>
            Final de semana e feriados — coaches escalados pontualmente
          </div>
        </div>

        {/* Seletor de unidade */}
        {unidadesPermitidas.length > 1 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Unidade</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {unidadesPermitidas.map(u => {
                const ativa = unidadeAtiva?.id === u.id
                return (
                  <button key={u.id} className="unidade-tab"
                    onClick={() => setUnidadeAtiva(u)}
                    style={{
                      padding: '0.5rem 1.25rem',
                      borderRadius: 10,
                      border: `1.5px solid ${ativa ? ACCENT : '#333'}`,
                      background: ativa ? `${ACCENT}18` : 'transparent',
                      color: ativa ? ACCENT : '#666',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      transition: 'all .2s',
                    }}>
                    {u.nome}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Abas */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '2rem', borderBottom: '1px solid #1a1a1a', paddingBottom: 8 }}>
          {[
            { key: 'fds', label: '🗓️ Final de Semana' },
            { key: 'feriados', label: '⭐ Feriados' },
          ].map(t => (
            <button key={t.key} className="tab-btn"
              onClick={() => setAba(t.key as any)}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: 10,
                border: `1.5px solid ${aba === t.key ? ACCENT : '#222'}`,
                background: aba === t.key ? `${ACCENT}18` : 'transparent',
                color: aba === t.key ? '#fff' : '#888',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {loadingDados ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#555' }}>Carregando...</div>
        ) : !unidadeAtiva ? (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#555' }}>
            Selecione uma unidade.
          </div>
        ) : aba === 'fds' ? (
          <>
            {/* ===== ABA FDS ===== */}
            <div style={{ background: '#0d0010', border: `1px solid ${ACCENT}33`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: 13, color: '#bbb', lineHeight: 1.6 }}>
              💡 Horários no FDS: <strong style={{ color: '#fff' }}>08:00, 09:00, 10:00, 11:00, 12:00</strong>. Cada coach escalado cobre todos os 5 horários.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {proximosFDS.map(({ data, nome }) => {
                const coachesEscalados = coachesDaData(data)
                const disponíveis = coachesNaoEscalados(data)
                const dataObj = new Date(data + 'T12:00:00')
                const diaNum = dataObj.getDate()
                const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })

                return (
                  <div key={data} className="card-dia"
                    style={{ background: '#111', border: '1px solid #222', borderRadius: 14, padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ textAlign: 'center', minWidth: 56 }}>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', lineHeight: 1 }}>{diaNum}</div>
                        <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>{mesNome}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{nome}</div>
                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                          {coachesEscalados.length === 0
                            ? 'Nenhum coach escalado'
                            : `${coachesEscalados.length} coach${coachesEscalados.length > 1 ? 'es' : ''} · ${coachesEscalados.length} vaga${coachesEscalados.length > 1 ? 's' : ''}/horário`}
                        </div>
                      </div>
                    </div>

                    {/* Lista de coaches escalados */}
                    {coachesEscalados.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {coachesEscalados.map(e => (
                          <div key={e.id} className="coach-tag"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1a1a1a', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 13 }}>
                            <span style={{ color: '#fff' }}>{e.perfis?.nome || 'Coach'}</span>
                            <button onClick={() => removerCoachDaEscala(e.id)}
                              style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Botão adicionar coach */}
                    {disponíveis.length > 0 ? (
                      <button className="btn-add"
                        onClick={() => { setModalAdicionar({ data, tipo: 'fds' }); setCoachSelecionado('') }}
                        style={{ width: '100%', background: 'transparent', border: `1px dashed ${ACCENT}66`, borderRadius: 8, padding: '0.6rem', color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .15s' }}>
                        + Adicionar coach
                      </button>
                    ) : (
                      <div style={{ background: '#0a0a0a', border: '1px dashed #222', borderRadius: 8, padding: '0.5rem', textAlign: 'center', fontSize: 11, color: '#555' }}>
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
            {/* ===== ABA FERIADOS ===== */}
            <div style={{ background: '#0d0010', border: `1px solid ${ACCENT}33`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: 13, color: '#bbb', lineHeight: 1.6 }}>
              💡 Datas marcadas como <strong style={{ color: '#fff' }}>feriado ativo</strong> ignoram a grade fixa e usam só os coaches escalados aqui, com horários de FDS (08, 09, 10, 11, 12h).
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <button onClick={() => setModalNovoFeriado(true)}
                style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.65rem 1.25rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                + Novo feriado
              </button>
            </div>

            {feriados.length === 0 ? (
              <div style={{ background: '#111', border: '1px dashed #333', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#555', fontSize: 14 }}>
                Nenhum feriado cadastrado para esta unidade.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {feriados.map(f => {
                  const coachesEscalados = coachesDaData(f.data)
                  const disponíveis = coachesNaoEscalados(f.data)
                  const dataObj = new Date(f.data + 'T12:00:00')
                  const diaNum = dataObj.getDate()
                  const mesNome = dataObj.toLocaleDateString('pt-BR', { month: 'short' })
                  const diaSemNome = DIAS_SEMANA_LABEL[dataObj.getDay()]

                  return (
                    <div key={f.id} className="card-dia"
                      style={{ background: '#111', border: `1px solid ${f.ativo ? AMARELO + '44' : '#222'}`, borderRadius: 14, padding: '1.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                        <div style={{ textAlign: 'center', minWidth: 56 }}>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: f.ativo ? AMARELO : '#666', lineHeight: 1 }}>{diaNum}</div>
                          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>{mesNome}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{f.descricao}</div>
                          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{diaSemNome}</div>
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: f.ativo ? AMARELO : '#555', fontWeight: 600 }}>
                              {f.ativo ? '● ATIVO' : '○ Inativo'}
                            </span>
                          </div>
                        </div>
                        <button onClick={() => removerFeriado(f.id)}
                          style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>
                          ×
                        </button>
                      </div>

                      {/* Toggle ativo */}
                      <button onClick={() => toggleFeriadoAtivo(f.id, f.ativo)}
                        style={{ width: '100%', background: 'transparent', border: `1px solid ${f.ativo ? AMARELO + '66' : '#333'}`, borderRadius: 8, padding: '0.4rem', color: f.ativo ? AMARELO : '#666', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginBottom: 10 }}>
                        {f.ativo ? 'Desativar feriado' : 'Ativar feriado'}
                      </button>

                      {/* Lista de coaches escalados */}
                      {coachesEscalados.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                          {coachesEscalados.map(e => (
                            <div key={e.id} className="coach-tag"
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1a1a1a', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 13 }}>
                              <span style={{ color: '#fff' }}>{e.perfis?.nome || 'Coach'}</span>
                              <button onClick={() => removerCoachDaEscala(e.id)}
                                style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {coachesEscalados.length === 0 && (
                        <div style={{ fontSize: 11, color: '#666', textAlign: 'center', marginBottom: 8 }}>
                          Nenhum coach escalado
                        </div>
                      )}

                      {/* Botão adicionar coach */}
                      {disponíveis.length > 0 && (
                        <button className="btn-add"
                          onClick={() => { setModalAdicionar({ data: f.data, tipo: 'feriado' }); setCoachSelecionado('') }}
                          style={{ width: '100%', background: 'transparent', border: `1px dashed ${ACCENT}66`, borderRadius: 8, padding: '0.6rem', color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .15s' }}>
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
      </div>

      {/* ===== MODAL ADICIONAR COACH ===== */}
      {modalAdicionar && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 420, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 4 }}>ADICIONAR COACH</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: '1.5rem', textTransform: 'capitalize' }}>
              {formatarDataPT(modalAdicionar.data)}
            </div>

            <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              Coach
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1.5rem', maxHeight: 300, overflowY: 'auto' }}>
              {coachesNaoEscalados(modalAdicionar.data).map(c => (
                <div key={c.id} onClick={() => setCoachSelecionado(c.id)}
                  style={{ border: `1.5px solid ${coachSelecionado === c.id ? ACCENT : '#333'}`, background: coachSelecionado === c.id ? `${ACCENT}12` : 'transparent', borderRadius: 8, padding: '0.65rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all .15s' }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${coachSelecionado === c.id ? ACCENT : '#444'}`, background: coachSelecionado === c.id ? ACCENT : 'transparent', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: coachSelecionado === c.id ? '#fff' : '#888' }}>{c.nome}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setModalAdicionar(null); setCoachSelecionado('') }}
                style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.75rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Cancelar
              </button>
              <button onClick={adicionarCoachNaEscala} disabled={!coachSelecionado || salvandoCoach}
                style={{ flex: 2, background: coachSelecionado ? ACCENT : '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontWeight: 600, fontSize: 14, cursor: coachSelecionado && !salvandoCoach ? 'pointer' : 'default', fontFamily: "'DM Sans', sans-serif", opacity: salvandoCoach ? 0.7 : 1 }}>
                {salvandoCoach ? 'Salvando...' : 'Adicionar coach ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL NOVO FERIADO ===== */}
      {modalNovoFeriado && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 420, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 16 }}>NOVO FERIADO</div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Data:</div>
              <input type="date" value={novoFeriadoData}
                onChange={e => setNovoFeriadoData(e.target.value)}
                style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, padding: '0.65rem 1rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', colorScheme: 'dark' }} />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Descrição:</div>
              <input type="text" value={novoFeriadoDescricao}
                onChange={e => setNovoFeriadoDescricao(e.target.value)}
                placeholder="Ex: Corpus Christi"
                style={{ width: '100%', background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, padding: '0.65rem 1rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none' }} />
            </div>

            {erroFeriado && (
              <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>
                {erroFeriado}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setModalNovoFeriado(false); setNovoFeriadoData(''); setNovoFeriadoDescricao(''); setErroFeriado('') }}
                style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.75rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Cancelar
              </button>
              <button onClick={criarFeriado} disabled={salvandoFeriado}
                style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontWeight: 600, fontSize: 14, cursor: salvandoFeriado ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: salvandoFeriado ? 0.7 : 1 }}>
                {salvandoFeriado ? 'Salvando...' : 'Criar feriado ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
