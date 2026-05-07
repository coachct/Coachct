'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'
const CYAN = '#00e5ff'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const CONTRATO = `CONTRATO DE ADESÃO — COACH CT / JUST CT

1. OBJETO
O presente contrato regula as condições de uso do serviço Coach CT, que consiste no agendamento de sessões de treinamento personalizado com coaches da unidade Just CT.

2. REGRAS DE AGENDAMENTO
2.1. Wellhub Diamond: até 8 sessões Coach CT por mês-calendário.
2.2. TotalPass TP6: até 10 sessões Coach CT por mês-calendário.
2.3. Plano Avulso Coach CT: crédito válido por 30 dias a partir da compra.
2.4. Os créditos dos planos Wellhub e TotalPass não são acumulativos e renovam-se todo dia 1º de cada mês.
2.5. É permitido agendar para o mês seguinte, consumindo créditos do período correspondente.

3. CANCELAMENTO
3.1. Cancelamentos até 12h antes resultam na devolução do crédito.
3.2. Entre 12h e 3h antes: cancelamento só permitido se houver cliente na fila de espera.
3.3. Menos de 3h antes: não é possível cancelar.

4. POLÍTICA DE FALTAS
4.1. Falta sem cancelamento gera bloqueio de novos agendamentos.
4.2. Para reativação: regularização na recepção do Just CT.
4.3. Agendamentos futuros são cancelados automaticamente.

5. FILA DE ESPERA
5.1. Ao entrar na fila de espera, o cliente aceita automaticamente as regras.
5.2. Quando uma vaga abrir, o agendamento é confirmado automaticamente.
5.3. As mesmas regras de falta e cancelamento se aplicam.

6. ACEITE
Ao concluir o cadastro, o cliente declara ter lido e concordado com todos os termos acima.`

function HalterSVG({ estado, onClick }: { estado: 'livre' | 'ocupado' | 'meu', onClick?: () => void }) {
  const cor = estado === 'ocupado' ? '#333' : estado === 'meu' ? CYAN : ACCENT
  const opacity = estado === 'ocupado' ? 0.3 : 1
  return (
    <svg width="36" height="36" viewBox="0 0 48 28"
      style={{ opacity, flexShrink: 0, cursor: estado === 'livre' ? 'pointer' : 'default' }}
      onClick={estado === 'livre' ? onClick : undefined}>
      <rect x="15" y="11.5" width="18" height="5" rx="2" fill={cor} />
      <rect x="2" y="5" width="5" height="18" rx="3" fill={cor} />
      <rect x="8" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="36" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="41" y="5" width="5" height="18" rx="3" fill={cor} />
    </svg>
  )
}

export default function AgendarPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [periodo, setPeriodo] = useState<'todos' | 'manha' | 'tarde' | 'noite'>('todos')
  const [horarios, setHorarios] = useState<any[]>([])
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [cliente, setCliente] = useState<any>(null)
  const [loadingHorarios, setLoadingHorarios] = useState(false)

  // Modal de confirmação
  const [modalSlot, setModalSlot] = useState<{ data: string; hora: string; vagas: number } | null>(null)
  const [tipoCredito, setTipoCredito] = useState<'wellhub' | 'totalpass' | 'avulso' | ''>('')
  const [confirmando, setConfirmando] = useState(false)
  const [erroModal, setErroModal] = useState('')

  // Contrato
  const [mostrarContrato, setMostrarContrato] = useState(false)
  const [contratoAceito, setContratoAceito] = useState(false)
  const [contratoAssinado, setContratoAssinado] = useState(false)
  const [aceiteCheck, setAceiteCheck] = useState(false)

  useEffect(() => {
    if (!loading && !perfil) router.push('/login')
    if (!loading && perfil && !['cliente'].includes(perfil.role as string)) router.push('/equipe')
  }, [perfil, loading])

  useEffect(() => {
    if (perfil) loadCliente()
  }, [perfil])

  useEffect(() => {
    if (perfil) loadHorarios()
  }, [diaSel, semanaOffset, perfil])

  async function loadCliente() {
    const { data } = await supabase.from('clientes').select('*').eq('user_id', perfil!.id).maybeSingle()
    setCliente(data)
    // Verifica se já assinou o contrato (tem pelo menos 1 agendamento anterior)
    if (data) {
      const { count } = await supabase.from('agendamentos').select('*', { count: 'exact', head: true }).eq('cliente_id', data.id)
      setContratoAssinado((count || 0) > 0)
    }
  }

  async function loadHorarios() {
    setLoadingHorarios(true)
    const dataSel = diasSemana[diaSel]
    const diaSemana = dataSel.getDay()
    const dataStr = dataSel.toISOString().split('T')[0]

    const [{ data: hors }, { data: ags }] = await Promise.all([
      supabase.from('coach_horarios').select('hora, coaches(id, nome)').eq('dia_semana', diaSemana).eq('ativo', true),
      supabase.from('agendamentos').select('horario, status').eq('data', dataStr).neq('status', 'cancelado'),
    ])

    // Agrupa vagas por horário
    const porHora: Record<string, number> = {}
    for (const h of (hors || [])) {
      porHora[h.hora] = (porHora[h.hora] || 0) + 1
    }

    // Conta ocupados por horário
    const ocupados: Record<string, number> = {}
    for (const a of (ags || [])) {
      const hora = a.horario?.slice(0, 5)
      if (hora) ocupados[hora] = (ocupados[hora] || 0) + 1
    }

    const resultado = Object.entries(porHora).map(([hora, total]) => ({
      hora,
      total,
      ocupados: ocupados[hora] || 0,
      livres: total - (ocupados[hora] || 0),
    })).sort((a, b) => a.hora.localeCompare(b.hora))

    setHorarios(resultado)
    setAgendamentos(ags || [])
    setLoadingHorarios(false)
  }

  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + semanaOffset * 7 + i)
    return d
  })

  const horariosFiltrados = horarios.filter(h => {
    const hr = parseInt(h.hora)
    if (periodo === 'manha') return hr < 12
    if (periodo === 'tarde') return hr >= 12 && hr < 18
    if (periodo === 'noite') return hr >= 18
    return true
  })

  function abrirModal(hora: string, vagas: number) {
    const dataSel = diasSemana[diaSel]
    const dataStr = dataSel.toISOString().split('T')[0]
    setModalSlot({ data: dataStr, hora, vagas })
    setTipoCredito('')
    setErroModal('')
    if (!contratoAssinado) {
      setMostrarContrato(true)
    }
  }

  async function confirmarAgendamento() {
    if (!tipoCredito) { setErroModal('Selecione como vai usar esta sessão.'); return }
    if (!modalSlot || !cliente) return
    setConfirmando(true)
    setErroModal('')

    const { error } = await supabase.from('agendamentos').insert({
      cliente_id: cliente.id,
      data: modalSlot.data,
      horario: modalSlot.hora + ':00',
      status: 'agendado',
      tipo_credito: tipoCredito,
    })

    if (error) {
      setErroModal('Erro ao agendar. Tente novamente.')
      setConfirmando(false)
      return
    }

    setContratoAssinado(true)
    setModalSlot(null)
    setConfirmando(false)
    router.push('/minha-conta')
  }

  const dataFormatada = (dataStr: string) => {
    const d = new Date(dataStr + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  if (loading) return (
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
        .dia-btn-h { transition: all .2s; cursor: pointer; flex: 1; min-width: 0; }
        .dia-btn-h:hover { border-color: ${ACCENT} !important; }
        .slot-row-h { transition: all .2s; }
        .slot-row-h:hover { border-color: ${ACCENT} !important; background: #ff2d9b08 !important; }
        .nav-semana-btn:hover:not(:disabled) { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
      `}</style>

      {/* Nav */}
      <div style={{ background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a', padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={() => router.push('/minha-conta')} style={{ background: 'transparent', border: '1px solid #333', borderRadius: 8, padding: '0.4rem 1rem', color: '#888', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Minha conta
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff' }}>AGENDAR COACH CT</div>
          <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>Cada halter = uma vaga disponível</div>
        </div>

        {/* Calendário */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button className="nav-semana-btn"
            onClick={() => { setSemanaOffset(o => Math.max(0, o - 1)); setDiaSel(0) }}
            disabled={semanaOffset === 0}
            style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #333', background: 'transparent', color: semanaOffset === 0 ? '#333' : '#fff', fontSize: 18, cursor: semanaOffset === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .2s' }}>‹</button>
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            {diasSemana.map((d, i) => {
              const isHoje = semanaOffset === 0 && i === 0
              const isSel = i === diaSel
              return (
                <div key={i} className="dia-btn-h" onClick={() => setDiaSel(i)}
                  style={{ padding: '0.6rem 0.25rem', borderRadius: 10, border: `1.5px solid ${isSel ? ACCENT : '#222'}`, background: isSel ? `${ACCENT}15` : 'transparent', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: 1, color: isSel ? ACCENT : '#555', fontWeight: 600, marginBottom: 2 }}>
                    {isHoje ? 'HOJE' : DIAS_SEMANA[d.getDay()]}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: isSel ? '#fff' : '#888', lineHeight: 1 }}>{d.getDate()}</div>
                  <div style={{ fontSize: 9, color: isSel ? ACCENT : '#444', textTransform: 'uppercase' as const }}>
                    {d.toLocaleDateString('pt-BR', { month: 'short' })}
                  </div>
                </div>
              )
            })}
          </div>
          <button className="nav-semana-btn"
            onClick={() => { setSemanaOffset(o => Math.min(3, o + 1)); setDiaSel(0) }}
            disabled={semanaOffset === 3}
            style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #333', background: 'transparent', color: semanaOffset === 3 ? '#333' : '#fff', fontSize: 18, cursor: semanaOffset === 3 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .2s' }}>›</button>
        </div>

        {/* Filtro período */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' as const }}>
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'manha', label: '🌅 Manhã' },
            { key: 'tarde', label: '☀️ Tarde' },
            { key: 'noite', label: '🌙 Noite' },
          ].map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key as any)}
              style={{ padding: '0.35rem 1rem', borderRadius: 20, border: `1px solid ${periodo === p.key ? ACCENT : '#333'}`, background: periodo === p.key ? `${ACCENT}20` : 'transparent', color: periodo === p.key ? ACCENT : '#555', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Slots */}
        {loadingHorarios ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#555' }}>Carregando horários...</div>
        ) : horariosFiltrados.length === 0 ? (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#444' }}>
            Nenhum horário disponível neste dia.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {horariosFiltrados.map((h, i) => {
              const lotado = h.livres <= 0
              return (
                <div key={i} className="slot-row-h"
                  style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1rem 1.25rem', borderRadius: 12, border: '1px solid #222', background: '#111', opacity: lotado ? 0.5 : 1 }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, color: '#fff', width: 58, flexShrink: 0 }}>{h.hora}</div>
                  <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center', flexWrap: 'wrap' as const }}>
                    {Array.from({ length: h.total }).map((_, vi) => (
                      <HalterSVG key={vi}
                        estado={vi < h.ocupados ? 'ocupado' : 'livre'}
                        onClick={() => !lotado && abrirModal(h.hora, h.livres)}
                      />
                    ))}
                  </div>
                  <div style={{ flexShrink: 0, minWidth: 90, textAlign: 'right' as const }}>
                    <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: lotado ? '#ff4444' : h.livres <= 2 ? '#ffaa00' : ACCENT, fontWeight: 600, marginBottom: 6 }}>
                      {lotado ? 'LOTADO' : h.livres === 1 ? '1 VAGA' : `${h.livres} VAGAS`}
                    </div>
                    {!lotado && (
                      <button onClick={() => abrirModal(h.hora, h.livres)}
                        style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                        Reservar
                      </button>
                    )}
                    {lotado && (
                      <button style={{ background: 'transparent', color: '#ffaa00', border: '1px solid #ffaa00', borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                        Fila
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal contrato (primeira vez) */}
      {mostrarContrato && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid #222' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 1 }}>CONTRATO COACH CT</div>
              <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Leia antes de fazer sua primeira reserva</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              <pre style={{ fontSize: 12, color: '#666', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif" }}>{CONTRATO}</pre>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #222' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem' }}>
                <input type="checkbox" checked={aceiteCheck} onChange={e => setAceiteCheck(e.target.checked)}
                  style={{ marginTop: 2, accentColor: ACCENT, width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
                  Li e aceito o contrato e as regras de agendamento, cancelamento e falta.
                </span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setMostrarContrato(false); setModalSlot(null) }}
                  style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.75rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  Cancelar
                </button>
                <button onClick={() => { if (aceiteCheck) { setContratoAceito(true); setMostrarContrato(false) } }}
                  disabled={!aceiteCheck}
                  style={{ flex: 2, background: aceiteCheck ? ACCENT : '#333', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontWeight: 600, fontSize: 14, cursor: aceiteCheck ? 'pointer' : 'default', fontFamily: "'DM Sans', sans-serif" }}>
                  Aceitar e continuar →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmação de reserva */}
      {modalSlot && !mostrarContrato && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 20, width: '100%', maxWidth: 440, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: 4 }}>CONFIRMAR RESERVA</div>
            <div style={{ fontSize: 13, color: '#555', marginBottom: '1.5rem', textTransform: 'capitalize' }}>
              {dataFormatada(modalSlot.data)} · {modalSlot.hora} · {modalSlot.vagas} vaga{modalSlot.vagas !== 1 ? 's' : ''} disponível{modalSlot.vagas !== 1 ? 'is' : ''}
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Como vai usar esta sessão?</div>
              {[
                { key: 'wellhub', label: 'Wellhub Diamond', icon: '💜' },
                { key: 'totalpass', label: 'TotalPass TP6', icon: '🔵' },
                { key: 'avulso', label: 'Crédito Avulso Coach CT', icon: '🏋️' },
              ].map(p => (
                <div key={p.key} onClick={() => setTipoCredito(p.key as any)}
                  style={{ border: `1.5px solid ${tipoCredito === p.key ? ACCENT : '#333'}`, background: tipoCredito === p.key ? `${ACCENT}12` : 'transparent', borderRadius: 10, padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8, transition: 'all .15s' }}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: tipoCredito === p.key ? '#fff' : '#888' }}>{p.label}</span>
                  <div style={{ marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%', border: `2px solid ${tipoCredito === p.key ? ACCENT : '#444'}`, background: tipoCredito === p.key ? ACCENT : 'transparent', flexShrink: 0 }} />
                </div>
              ))}
            </div>

            <div style={{ background: '#0a0a0a', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: 12, color: '#555', lineHeight: 1.6 }}>
              ⚠️ Cancelamento gratuito até 12h antes. Falta sem aviso gera bloqueio de conta.
            </div>

            {erroModal && (
              <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>
                {erroModal}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setModalSlot(null)}
                style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Cancelar
              </button>
              <button onClick={confirmarAgendamento} disabled={confirmando}
                style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: confirmando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: confirmando ? 0.7 : 1 }}>
                {confirmando ? 'Confirmando...' : 'Confirmar reserva ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
