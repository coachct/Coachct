'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'

const ACCENT  = '#ff2d9b'
const CYAN    = '#00e5ff'
const AMARELO = '#ffaa00'

const DIAS_ABREV  = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']

function dataLocalStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function parsePlanoKey(key: string): { label: string; icon: string } {
  const lower = (key||'').toLowerCase()
  if (lower.startsWith('wellhub'))    return { label: 'Wellhub',       icon: '💜' }
  if (lower.startsWith('totalpass')) return { label: 'TotalPass',     icon: '🔵' }
  if (lower.startsWith('avulso') || lower.startsWith('credito')) return { label: 'Crédito Avulso', icon: '🎟️' }
  return { label: key, icon: '🏋️' }
}

function tipoLabel(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')   return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t
}

function tipoColor(t: string) {
  if (t === 'lift')              return { bg: '#0a1520', border: '#00e5ff22', text: CYAN,      badge: '#00e5ff18' }
  if (t === 'lift_for_girls')   return { bg: '#150a15', border: '#ff2d9b22', text: ACCENT,    badge: '#ff2d9b18' }
  return                               { bg: '#0a150a', border: '#2ddd8b22', text: '#2ddd8b', badge: '#2ddd8b18' }
}

function AulasPageInner() {
  const router      = useRouter()
  const params      = useSearchParams()
  const unidadeId   = params.get('unidade') || ''
  const { user, perfil, loading: loadingAuth } = useAuth()
  const supabase    = createClient()

  const [unidade,          setUnidade]          = useState<any>(null)
  const [cliente,          setCliente]          = useState<any>(null)
  const [saldo,            setSaldo]            = useState<Record<string, any>>({})
  const [ocorrencias,      setOcorrencias]      = useState<any[]>([])
  const [reservasCont,     setReservasCont]     = useState<Record<string, number>>({})
  const [minhasReservas,   setMinhasReservas]   = useState<Record<string, any>>({})
  const [filaCliente,      setFilaCliente]      = useState<Record<string, any>>({})
  const [posicoes,         setPosicoes]         = useState<any[]>([])
  const [posicoesTomadas,  setPosicoesTomadas]  = useState<string[]>([])
  const [loadingOcs,       setLoadingOcs]       = useState(false)
  const [semanaOffset,     setSemanaOffset]     = useState(0)
  const [diaSel,           setDiaSel]           = useState(0)
  const [periodo,          setPeriodo]          = useState<'todos'|'manha'|'tarde'|'noite'>('todos')

  // Modais
  const [modalReserva,  setModalReserva]  = useState<any>(null)
  const [modalFila,     setModalFila]     = useState<any>(null)
  const [tipoCredito,   setTipoCredito]   = useState('')
  const [posicaoSel,    setPosicaoSel]    = useState('')
  const [confirmando,   setConfirmando]   = useState(false)
  const [entrandoFila,  setEntrandoFila]  = useState(false)
  const [erroModal,     setErroModal]     = useState('')
  const [filaAceite,    setFilaAceite]    = useState(false)
  const [modalGenero,   setModalGenero]   = useState(false)

  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + semanaOffset * 7 + i)
    return d
  })

  const dataSel    = diasSemana[diaSel]
  const dataSelStr = dataLocalStr(dataSel)

  // Hora atual para bloquear aulas passadas
  const agora      = new Date()
  const horaAtual  = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`
  const isHoje     = dataSelStr === dataLocalStr(agora)

  // ─── Redirect se não tem unidade ───
  useEffect(() => {
    if (!unidadeId) router.replace('/agendar')
  }, [unidadeId])

  useEffect(() => { if (unidadeId) carregarUnidade() }, [unidadeId])
  useEffect(() => { if (perfil)    carregarCliente()  }, [perfil])
  useEffect(() => { if (unidadeId) carregarOcorrencias(dataSelStr) }, [dataSelStr, unidadeId, cliente?.id])
  useEffect(() => { if (cliente && unidadeId) carregarSaldo() }, [cliente?.id, unidadeId])

  // ─── Carregamentos ───
  async function carregarUnidade() {
    const { data } = await supabase.from('unidades').select('id, nome, tipo').eq('id', unidadeId).maybeSingle()
    setUnidade(data)
  }

  async function carregarCliente() {
    if (!perfil) return
    const { data } = await supabase.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
    setCliente(data)
  }

  async function carregarSaldo() {
    if (!cliente || !unidadeId) return
    const agora = new Date()
    const { data } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: cliente.id,
      p_mes:        agora.getMonth() + 1,
      p_ano:        agora.getFullYear(),
      p_unidade_id: unidadeId,
    })
    setSaldo(data || {})
  }

  async function carregarOcorrencias(data: string) {
    if (!unidadeId) return
    setLoadingOcs(true)

    const { data: aulasIds } = await supabase
      .from('club_aulas').select('id').eq('unidade_id', unidadeId).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)

    if (!ids.length) { setOcorrencias([]); setLoadingOcs(false); return }

    const { data: ocs } = await supabase
      .from('club_ocorrencias')
      .select('*, club_aulas(id, tipo, horario, capacidade, so_mulheres, coaches(nome), grupos_musculares(nome))')
      .in('aula_id', ids)
      .eq('data', data)
      .eq('status', 'ativa')

    const ocsList = (ocs || []).sort((a: any, b: any) =>
      (a.club_aulas?.horario || '').localeCompare(b.club_aulas?.horario || '')
    )
    setOcorrencias(ocsList)

    if (!ocsList.length) { setLoadingOcs(false); return }

    const ocIds = ocsList.map((o: any) => o.id)

    const { data: reservas } = await supabase
      .from('club_reservas')
      .select('ocorrencia_id, posicao, status')
      .in('ocorrencia_id', ocIds)
      .in('status', ['reservado', 'presente'])

    const cont: Record<string, number> = {}
    for (const r of (reservas || [])) cont[r.ocorrencia_id] = (cont[r.ocorrencia_id] || 0) + 1
    setReservasCont(cont)

    if (cliente) {
      const [{ data: minhas }, { data: filas }] = await Promise.all([
        supabase.from('club_reservas').select('*').in('ocorrencia_id', ocIds).eq('cliente_id', cliente.id).neq('status', 'cancelado'),
        supabase.from('fila_espera').select('*').in('ocorrencia_id', ocIds).eq('cliente_id', cliente.id).eq('status', 'aguardando'),
      ])
      const minhasMap: Record<string, any> = {}
      for (const r of (minhas || [])) minhasMap[r.ocorrencia_id] = r
      setMinhasReservas(minhasMap)

      const filaMap: Record<string, any> = {}
      for (const f of (filas || [])) if (f.ocorrencia_id) filaMap[f.ocorrencia_id] = f
      setFilaCliente(filaMap)
    }

    setLoadingOcs(false)
  }

  async function carregarPosicoes(ocorrenciaId: string) {
    const [{ data: pos }, { data: tomadas }] = await Promise.all([
      supabase.from('club_posicoes').select('*').eq('unidade_id', unidadeId).eq('ativo', true).order('tipo').order('numero'),
      supabase.from('club_reservas').select('posicao').eq('ocorrencia_id', ocorrenciaId).in('status', ['reservado', 'presente']),
    ])
    setPosicoes(pos || [])
    setPosicoesTomadas((tomadas || []).map((t: any) => t.posicao).filter(Boolean))
  }

  // ─── Ações ───
  function tentarReservar(oc: any) {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/aulas?unidade=${unidadeId}`)}`)
      return
    }
    if (oc.club_aulas?.so_mulheres && cliente?.sexo !== 'F') {
      setModalGenero(true)
      return
    }
    abrirModalReserva(oc)
  }

  function tentarFila(oc: any) {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/aulas?unidade=${unidadeId}`)}`)
      return
    }
    setModalFila(oc)
    setTipoCredito('')
    setFilaAceite(false)
    setErroModal('')
  }

  async function abrirModalReserva(oc: any) {
    setModalReserva(oc)
    setTipoCredito('')
    setPosicaoSel('')
    setErroModal('')
    if (oc.club_aulas?.tipo === 'running_funcional') {
      await carregarPosicoes(oc.id)
    }
  }

  async function confirmarReserva() {
    if (!tipoCredito) { setErroModal('Selecione o plano para usar.'); return }
    if (modalReserva?.club_aulas?.tipo === 'running_funcional' && !posicaoSel) {
      setErroModal('Selecione sua posição no mapa.'); return
    }
    if (!cliente || !modalReserva) return

    setConfirmando(true); setErroModal('')

    const payload: any = {
      ocorrencia_id: modalReserva.id,
      cliente_id:    cliente.id,
      tipo_credito:  tipoCredito,
      status:        'reservado',
    }
    if (posicaoSel) payload.posicao = posicaoSel

    const { error } = await supabase.from('club_reservas').insert(payload)
    if (error) { setErroModal('Erro ao reservar: ' + error.message); setConfirmando(false); return }

    setConfirmando(false)
    setModalReserva(null)
    await Promise.all([carregarOcorrencias(dataSelStr), carregarSaldo()])
  }

  async function confirmarFila() {
    if (!tipoCredito) { setErroModal('Selecione o plano para usar.'); return }
    if (!filaAceite)  { setErroModal('Confirme que entendeu as regras da fila.'); return }
    if (!cliente || !modalFila) return

    setEntrandoFila(true); setErroModal('')

    const { error } = await supabase.from('fila_espera').insert({
      ocorrencia_id: modalFila.id,
      cliente_id:    cliente.id,
      tipo_credito:  tipoCredito,
      status:        'aguardando',
      data:          dataSelStr,
      horario:       modalFila.club_aulas?.horario,
      unidade_id:    unidadeId,
    })

    if (error) { setErroModal('Erro ao entrar na fila: ' + error.message); setEntrandoFila(false); return }

    setEntrandoFila(false)
    setModalFila(null)
    await carregarOcorrencias(dataSelStr)
  }

  // ─── Filtros ───
  const ocsFiltradas = ocorrencias.filter(oc => {
    // Bloqueia aulas cujo horário já passou hoje
    if (isHoje) {
      const horarioAula = (oc.club_aulas?.horario || '').slice(0, 5)
      if (horarioAula <= horaAtual) return false
    }
    const hora = parseInt((oc.club_aulas?.horario || '').slice(0, 2))
    if (periodo === 'manha') return hora < 12
    if (periodo === 'tarde') return hora >= 12 && hora < 18
    if (periodo === 'noite') return hora >= 18
    return true
  })

  const planosDisponiveis = Object.entries(saldo)
    .filter(([, v]: [string, any]) => v?.disponivel > 0)
    .map(([k]) => k)

  function vagasInfo(oc: any) {
    const cap    = oc.club_aulas?.capacidade || 0
    const usadas = reservasCont[oc.id] || 0
    const livres = Math.max(0, cap - usadas)
    return { cap, usadas, livres, lotado: livres <= 0 }
  }

  if (!unidadeId) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: "'DM Sans', sans-serif", color: '#f0f0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .dia-tab:hover { color: #fff !important; }
        .pos-btn:hover:not(:disabled) { opacity: 0.75; }
      `}</style>

      <SiteHeader />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '6rem 1.5rem 4rem' }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button onClick={() => router.push('/agendar')}
            style={{ background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '50%', width: 36, height: 36, color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            ‹
          </button>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', letterSpacing: 1 }}>
              {unidade?.nome || 'Aulas coletivas'}
            </div>
            <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>Lift · Lift for Girls · Running + Funcional</div>
          </div>
        </div>

        {/* Banner visitante */}
        {!user && (
          <div style={{ background: '#0a0014', border: `1px solid ${ACCENT}33`, borderRadius: 12, padding: '0.85rem 1.25rem', marginBottom: '1.5rem', fontSize: 13, color: '#aaa' }}>
            👋 Navegando como visitante.{' '}
            <span onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/aulas?unidade=${unidadeId}`)}`)}
              style={{ color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>Faça login</span>{' '}
            para reservar aulas.
          </div>
        )}

        {/* Navegação de semana */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
          <button onClick={() => { setSemanaOffset(o => Math.max(0, o - 1)); setDiaSel(0) }}
            disabled={semanaOffset === 0}
            style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #2a2a2a', background: 'transparent', color: semanaOffset === 0 ? '#2a2a2a' : '#666', fontSize: 16, cursor: semanaOffset === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            ‹
          </button>

          <div style={{ flex: 1, display: 'flex', borderBottom: '1px solid #1a1a1a' }}>
            {diasSemana.map((d, i) => {
              const sel    = i === diaSel
              const isHojeTab = semanaOffset === 0 && i === 0
              return (
                <button key={i} className="dia-tab" onClick={() => setDiaSel(i)}
                  style={{
                    flex: 1, minWidth: 0, padding: '0.75rem 0.25rem', background: 'transparent', border: 'none',
                    borderBottom: `2px solid ${sel ? ACCENT : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'center', transition: 'all .15s',
                    color: sel ? '#fff' : '#444',
                  }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 4, color: sel ? ACCENT : '#333' }}>
                    {isHojeTab ? 'HOJE' : DIAS_ABREV[d.getDay()]}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, lineHeight: 1, color: sel ? '#fff' : '#555' }}>
                    {d.getDate()}
                  </div>
                  <div style={{ fontSize: 9, color: sel ? ACCENT : '#2a2a2a', textTransform: 'uppercase', marginTop: 2 }}>
                    {MESES_ABREV[d.getMonth()]}
                  </div>
                </button>
              )
            })}
          </div>

          <button onClick={() => { setSemanaOffset(o => Math.min(3, o + 1)); setDiaSel(0) }}
            disabled={semanaOffset >= 3}
            style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #2a2a2a', background: 'transparent', color: semanaOffset >= 3 ? '#2a2a2a' : '#666', fontSize: 16, cursor: semanaOffset >= 3 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            ›
          </button>
        </div>

        {/* Filtro período */}
        <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'manha', label: '🌅 Manhã' },
            { key: 'tarde', label: '☀️ Tarde' },
            { key: 'noite', label: '🌙 Noite' },
          ].map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key as any)}
              style={{ padding: '0.35rem 1rem', borderRadius: 20, border: `1px solid ${periodo === p.key ? ACCENT : '#2a2a2a'}`, background: periodo === p.key ? `${ACCENT}20` : 'transparent', color: periodo === p.key ? ACCENT : '#444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Lista de aulas */}
        {loadingOcs ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#444' }}>Carregando aulas...</div>
        ) : ocsFiltradas.length === 0 ? (
          <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#444' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
            <div style={{ fontSize: 14 }}>
              {isHoje && ocorrencias.length > 0
                ? 'Não há mais aulas disponíveis hoje.'
                : 'Nenhuma aula disponível neste dia.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ocsFiltradas.map(oc => {
              const aula      = oc.club_aulas
              const { livres, lotado } = vagasInfo(oc)
              const minhaRes  = minhasReservas[oc.id]
              const naFila    = filaCliente[oc.id]
              const cores     = tipoColor(aula?.tipo || '')
              const isRunning = aula?.tipo === 'running_funcional'
              const isLift    = aula?.tipo === 'lift' || aula?.tipo === 'lift_for_girls'

              return (
                <div key={oc.id}
                  style={{ background: cores.bg, border: `1px solid ${minhaRes ? CYAN + '44' : naFila ? AMARELO + '44' : cores.border}`, borderRadius: 16, padding: '1.25rem 1.5rem' }}>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    {/* Horário */}
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 500, color: '#fff', width: 56, flexShrink: 0, lineHeight: 1 }}>
                      {(aula?.horario || '').slice(0, 5)}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ background: cores.badge, color: cores.text, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, letterSpacing: 0.5 }}>
                          {tipoLabel(aula?.tipo)}
                        </span>
                        {aula?.so_mulheres && (
                          <span style={{ background: '#ff2d9b18', color: ACCENT, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                            👩 Só mulheres
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, color: '#ddd', fontWeight: 600, marginBottom: 3 }}>
                        {aula?.grupos_musculares?.nome || '—'}
                      </div>
                      <div style={{ fontSize: 12, color: '#555' }}>
                        👤 {aula?.coaches?.nome?.split(' ')[0] || '—'} · {aula?.duracao_min || 50}min
                      </div>
                    </div>

                    {/* Status / Botão */}
                    <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 110 }}>
                      {minhaRes ? (
                        <div style={{ fontSize: 12, color: CYAN, fontWeight: 700 }}>RESERVADO ✓</div>
                      ) : naFila ? (
                        <div style={{ fontSize: 12, color: AMARELO, fontWeight: 700 }}>NA FILA ⏳</div>
                      ) : (
                        <>
                          {/* Vagas: para Lift mostra só quando ≤3 */}
                          {isLift && livres > 0 && livres <= 3 && (
                            <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700, color: livres === 1 ? '#ff4444' : AMARELO, marginBottom: 8 }}>
                              {livres === 1 ? 'ÚLTIMA VAGA' : `${livres} VAGAS`}
                            </div>
                          )}
                          {/* Vagas: para Running sempre mostra */}
                          {isRunning && livres > 0 && (
                            <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700, color: livres <= 3 ? (livres === 1 ? '#ff4444' : AMARELO) : '#555', marginBottom: 8 }}>
                              {livres === 1 ? 'ÚLTIMA VAGA' : `${livres}/${aula?.capacidade}`}
                            </div>
                          )}
                          {lotado ? (
                            <button onClick={() => tentarFila(oc)}
                              style={{ background: 'transparent', color: AMARELO, border: `1px solid ${AMARELO}55`, borderRadius: 8, padding: '0.4rem 0.85rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                              Fila ⏳
                            </button>
                          ) : (
                            <button onClick={() => tentarReservar(oc)}
                              style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.4rem 0.85rem', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                              Reservar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Barra de capacidade — só para LIFT */}
                  {isLift && !minhaRes && !naFila && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${cores.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#333', marginBottom: 4 }}>
                        <span>Ocupação</span>
                        <span style={{ color: lotado ? '#ff4444' : livres <= 3 ? AMARELO : '#555' }}>
                          {reservasCont[oc.id] || 0}/{aula?.capacidade} vagas
                        </span>
                      </div>
                      <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2, transition: 'width .3s',
                          background: lotado ? '#ff4444' : livres <= 3 ? AMARELO : CYAN,
                          width: `${Math.min(100, ((reservasCont[oc.id] || 0) / (aula?.capacidade || 1)) * 100)}%`,
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ MODAL RESERVA ══ */}
      {modalReserva && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: '20px 20px 16px 16px', width: '100%', maxWidth: 500, maxHeight: '92vh', overflowY: 'auto' }}>

            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid #1a1a1a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 1 }}>CONFIRMAR RESERVA</div>
                  <div style={{ fontSize: 13, color: '#555', marginTop: 3 }}>
                    {tipoLabel(modalReserva.club_aulas?.tipo)} · {(modalReserva.club_aulas?.horario||'').slice(0,5)} · {unidade?.nome}
                  </div>
                </div>
                <button onClick={() => setModalReserva(null)}
                  style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
              </div>
            </div>

            <div style={{ padding: '1.25rem 1.5rem' }}>

              {/* Plano */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Usar crédito de qual plano?</div>
                {planosDisponiveis.length === 0 ? (
                  <div style={{ background: '#1a1000', border: '1px solid #ff660033', borderRadius: 10, padding: '1rem', fontSize: 13, color: AMARELO }}>
                    ⚠️ Você não tem créditos disponíveis para esta unidade.
                  </div>
                ) : planosDisponiveis.map(p => {
                  const { label, icon } = parsePlanoKey(p)
                  const info = saldo[p]
                  return (
                    <div key={p} onClick={() => setTipoCredito(p)}
                      style={{ border: `1.5px solid ${tipoCredito === p ? ACCENT : '#2a2a2a'}`, background: tipoCredito === p ? `${ACCENT}12` : 'transparent', borderRadius: 10, padding: '0.85rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8, transition: 'all .15s' }}>
                      <span style={{ fontSize: 20 }}>{icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: tipoCredito === p ? '#fff' : '#888' }}>{label}</div>
                        {info && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{info.disponivel} crédito{info.disponivel !== 1 ? 's' : ''} restante{info.disponivel !== 1 ? 's' : ''} este mês</div>}
                      </div>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${tipoCredito === p ? ACCENT : '#444'}`, background: tipoCredito === p ? ACCENT : 'transparent', flexShrink: 0 }} />
                    </div>
                  )
                })}
              </div>

              {/* Mapa de posições — Running */}
              {modalReserva.club_aulas?.tipo === 'running_funcional' && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    Escolha sua posição
                  </div>

                  {posicoes.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#444', textAlign: 'center', padding: '1rem' }}>Carregando posições...</div>
                  ) : (
                    <>
                      {/* Seção R */}
                      {posicoes.filter((p: any) => p.tipo === 'R').length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>🏃 Esteiras (R)</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {posicoes.filter((p: any) => p.tipo === 'R').map((pos: any) => {
                              const label = `R${String(pos.numero).padStart(2,'0')}`
                              const tomado    = posicoesTomadas.includes(label)
                              const selecionado = posicaoSel === label
                              return (
                                <button key={pos.id} className="pos-btn" disabled={tomado}
                                  onClick={() => setPosicaoSel(selecionado ? '' : label)}
                                  style={{ width: 46, height: 46, borderRadius: 10, border: `1.5px solid ${selecionado ? ACCENT : tomado ? '#111' : '#2a2a2a'}`, background: selecionado ? `${ACCENT}25` : tomado ? '#0d0d0d' : '#0a0a0a', color: selecionado ? ACCENT : tomado ? '#1f1f1f' : '#666', fontSize: 10, fontWeight: 700, cursor: tomado ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono', monospace", transition: 'all .15s' }}>
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Seção F */}
                      {posicoes.filter((p: any) => p.tipo === 'F').length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>⚡ Funcional (F)</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {posicoes.filter((p: any) => p.tipo === 'F').map((pos: any) => {
                              const label = `F${String(pos.numero).padStart(2,'0')}`
                              const tomado    = posicoesTomadas.includes(label)
                              const selecionado = posicaoSel === label
                              return (
                                <button key={pos.id} className="pos-btn" disabled={tomado}
                                  onClick={() => setPosicaoSel(selecionado ? '' : label)}
                                  style={{ width: 46, height: 46, borderRadius: 10, border: `1.5px solid ${selecionado ? '#2ddd8b' : tomado ? '#111' : '#2a2a2a'}`, background: selecionado ? '#2ddd8b25' : tomado ? '#0d0d0d' : '#0a0a0a', color: selecionado ? '#2ddd8b' : tomado ? '#1f1f1f' : '#666', fontSize: 10, fontWeight: 700, cursor: tomado ? 'not-allowed' : 'pointer', fontFamily: "'DM Mono', monospace", transition: 'all .15s' }}>
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Legenda */}
                      <div style={{ display: 'flex', gap: '1.25rem', marginTop: 14, fontSize: 11, color: '#444' }}>
                        <span style={{ color: '#666' }}>● Disponível</span>
                        <span style={{ color: '#222' }}>● Ocupado</span>
                        <span style={{ color: ACCENT }}>● Selecionado</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Regras */}
              <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: 12, color: '#444', lineHeight: 1.7 }}>
                ⚠️ Cancelamento gratuito <strong style={{ color: '#666' }}>até 12h antes</strong>. Com fila de espera, prazo reduz para 3h. Falta sem aviso gera multa de R$49,90.
              </div>

              {erroModal && (
                <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>
                  {erroModal}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalReserva(null)}
                  style={{ flex: 1, background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 10, padding: '0.85rem', color: '#555', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  Cancelar
                </button>
                <button onClick={confirmarReserva} disabled={confirmando || planosDisponiveis.length === 0}
                  style={{ flex: 2, background: planosDisponiveis.length === 0 ? '#1a1a1a' : ACCENT, color: planosDisponiveis.length === 0 ? '#444' : '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: confirmando || planosDisponiveis.length === 0 ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: confirmando ? 0.7 : 1 }}>
                  {confirmando ? 'Confirmando...' : 'Confirmar reserva ✓'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL FILA ══ */}
      {modalFila && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: `1px solid ${AMARELO}33`, borderRadius: '20px 20px 16px 16px', width: '100%', maxWidth: 500, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: AMARELO, letterSpacing: 1 }}>FILA DE ESPERA</div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{tipoLabel(modalFila.club_aulas?.tipo)} · {(modalFila.club_aulas?.horario||'').slice(0,5)}</div>
              </div>
              <button onClick={() => setModalFila(null)} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ background: '#1a1000', border: `1px solid ${AMARELO}22`, borderRadius: 10, padding: '1rem', marginBottom: '1.25rem', fontSize: 13, color: '#888', lineHeight: 1.7 }}>
              <div style={{ color: AMARELO, fontWeight: 600, marginBottom: 6 }}>⚠️ Atenção</div>
              <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <li>Se alguém cancelar, <strong style={{ color: '#fff' }}>você será confirmado automaticamente</strong>.</li>
                <li>Após confirmado, cancelamento <strong style={{ color: '#fff' }}>até 3h antes</strong>.</li>
                <li>Falta sem aviso gera multa de R$49,90.</li>
              </ul>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Usar crédito de qual plano?</div>
              {planosDisponiveis.map(p => {
                const { label, icon } = parsePlanoKey(p)
                return (
                  <div key={p} onClick={() => setTipoCredito(p)}
                    style={{ border: `1.5px solid ${tipoCredito === p ? AMARELO : '#2a2a2a'}`, background: tipoCredito === p ? `${AMARELO}12` : 'transparent', borderRadius: 10, padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8, transition: 'all .15s' }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: tipoCredito === p ? '#fff' : '#888' }}>{label}</div>
                    </div>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${tipoCredito === p ? AMARELO : '#444'}`, background: tipoCredito === p ? AMARELO : 'transparent', flexShrink: 0 }} />
                  </div>
                )
              })}
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1.25rem' }}>
              <input type="checkbox" checked={filaAceite} onChange={e => setFilaAceite(e.target.checked)} style={{ marginTop: 2, accentColor: AMARELO, width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#777', lineHeight: 1.5 }}>Entendi as regras e aceito o agendamento automático se uma vaga abrir.</span>
            </label>

            {erroModal && (
              <div style={{ background: '#ffaa0015', border: '1px solid #ffaa0044', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: AMARELO, marginBottom: '1rem' }}>{erroModal}</div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalFila(null)} style={{ flex: 1, background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 10, padding: '0.85rem', color: '#555', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
              <button onClick={confirmarFila} disabled={entrandoFila}
                style={{ flex: 2, background: AMARELO, color: '#000', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 700, fontSize: 15, cursor: entrandoFila ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: entrandoFila ? 0.7 : 1 }}>
                {entrandoFila ? 'Entrando...' : 'Entrar na fila ⏳'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL GÊNERO ══ */}
      {modalGenero && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: '#111', border: `1.5px solid ${ACCENT}55`, borderRadius: 20, width: '100%', maxWidth: 380, padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: '1rem' }}>👩</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 8 }}>AULA EXCLUSIVA</div>
            <div style={{ fontSize: 14, color: '#888', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              O <strong style={{ color: '#fff' }}>Lift for Girls</strong> é uma aula exclusiva para mulheres.
              {(!cliente?.sexo)
                ? <><br/><br/>Seu perfil não tem o gênero cadastrado. Acesse <strong style={{ color: ACCENT }}>Minha conta</strong> e atualize para continuar.</>
                : <><br/><br/>Esta aula não está disponível para o seu perfil.</>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalGenero(false)} style={{ flex: 1, background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 10, padding: '0.85rem', color: '#555', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Fechar</button>
              {!cliente?.sexo && (
                <button onClick={() => router.push('/minha-conta')} style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Atualizar perfil →</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AulasPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: `4px solid #ff2d9b`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <AulasPageInner />
    </Suspense>
  )
}
