'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'
const CYAN = '#00e5ff'
const AMARELO = '#ffaa00'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HORARIOS_FDS = ['08:00', '09:00', '10:00', '11:00', '12:00']

function HalterSVG({ estado }: { estado: 'livre' | 'ocupado' | 'bloqueado' }) {
  const cor = estado === 'ocupado' ? '#333' : estado === 'bloqueado' ? '#ff4444' : ACCENT
  const opacity = estado === 'ocupado' ? 0.3 : estado === 'bloqueado' ? 0.4 : 1
  return (
    <svg width="32" height="32" viewBox="0 0 48 28" style={{ opacity, flexShrink: 0 }}>
      <rect x="15" y="11.5" width="18" height="5" rx="2" fill={cor} />
      <rect x="2" y="5" width="5" height="18" rx="3" fill={cor} />
      <rect x="8" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="36" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="41" y="5" width="5" height="18" rx="3" fill={cor} />
    </svg>
  )
}

export default function GradePublicaPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [unidades, setUnidades] = useState<any[]>([])
  const [unidadeAtiva, setUnidadeAtiva] = useState<any>(null)
  const [diaSel, setDiaSel] = useState(0)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [periodo, setPeriodo] = useState<'todos' | 'manha' | 'tarde' | 'noite'>('todos')
  const [horarios, setHorarios] = useState<any[]>([])
  const [tipoDia, setTipoDia] = useState<'util' | 'fds' | 'feriado'>('util')
  const [feriadoDescricao, setFeriadoDescricao] = useState<string>('')
  const [loadingHorarios, setLoadingHorarios] = useState(false)

  const isCliente = perfil?.role === 'cliente'
  const isLogado = !!perfil

  useEffect(() => {
    async function carregarUnidades() {
      const { data } = await supabase
        .from('unidades')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      setUnidades(data || [])
      if (data && data.length > 0) setUnidadeAtiva(data[0])
    }
    carregarUnidades()
  }, [])

  useEffect(() => {
    if (unidadeAtiva) loadHorarios()
  }, [unidadeAtiva?.id, diaSel, semanaOffset])

  async function loadHorarios() {
    if (!unidadeAtiva) return
    setLoadingHorarios(true)

    const dataSel = diasSemana[diaSel]
    const diaSem = dataSel.getDay()
    const dataStr = dataSel.toISOString().split('T')[0]
    const hoje = new Date().toISOString().split('T')[0]
    const agora = new Date()
    const horaAtual = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
    const isDiaDe = dataStr === hoje

    // PASSO 1: verifica se essa data é feriado ATIVO nesta unidade
    const { data: feriadoData } = await supabase
      .from('feriados')
      .select('*')
      .eq('unidade_id', unidadeAtiva.id)
      .eq('data', dataStr)
      .eq('ativo', true)
      .maybeSingle()

    const ehFeriado = !!feriadoData
    const ehFds = diaSem === 0 || diaSem === 6
    const usaEscalaFds = ehFeriado || ehFds

    if (ehFeriado) {
      setTipoDia('feriado')
      setFeriadoDescricao(feriadoData.descricao || '')
    } else if (ehFds) {
      setTipoDia('fds')
      setFeriadoDescricao('')
    } else {
      setTipoDia('util')
      setFeriadoDescricao('')
    }

    // PASSO 2: busca a base de horários certa
    let porHora: Record<string, number> = {}

    if (usaEscalaFds) {
      // FDS ou feriado ativo → escala_fds + horários fixos
      const { data: escala } = await supabase
        .from('escala_fds')
        .select('coach_id')
        .eq('unidade_id', unidadeAtiva.id)
        .eq('data', dataStr)

      const qtdCoaches = (escala || []).length
      for (const hora of HORARIOS_FDS) {
        if (isDiaDe && hora <= horaAtual) continue
        porHora[hora] = qtdCoaches
      }
    } else {
      // Dia útil → coach_horarios (grade fixa)
      const { data: hors } = await supabase
        .from('coach_horarios')
        .select('hora')
        .eq('dia_semana', diaSem)
        .eq('ativo', true)
        .eq('unidade_id', unidadeAtiva.id)

      for (const h of (hors || [])) {
        const hora = (h.hora || '').slice(0, 5)
        if (isDiaDe && hora <= horaAtual) continue
        porHora[hora] = (porHora[hora] || 0) + 1
      }
    }

    // PASSO 3: busca agendamentos e bloqueios da data
    const [{ data: ags }, { data: bloqueadas }] = await Promise.all([
      supabase.from('agendamentos').select('horario, status').eq('data', dataStr).eq('unidade_id', unidadeAtiva.id).neq('status', 'cancelado'),
      supabase.from('vagas_bloqueadas').select('horario, quantidade').eq('data', dataStr).eq('ativo', true).eq('unidade_id', unidadeAtiva.id),
    ])

    const ocupados: Record<string, number> = {}
    for (const a of (ags || [])) {
      const hora = (a.horario || '').slice(0, 5)
      ocupados[hora] = (ocupados[hora] || 0) + 1
    }

    const bloqueadasMap: Record<string, number> = {}
    for (const b of (bloqueadas || [])) {
      const hora = (b.horario || '').slice(0, 5)
      bloqueadasMap[hora] = (bloqueadasMap[hora] || 0) + (b.quantidade || 1)
    }

    const resultado = Object.entries(porHora).map(([hora, total]) => {
      const bloq = bloqueadasMap[hora] || 0
      const ocup = ocupados[hora] || 0
      return {
        hora,
        total,
        ocupados: ocup,
        bloqueadas: bloq,
        livres: Math.max(0, total - ocup - bloq),
      }
    }).sort((a, b) => a.hora.localeCompare(b.hora))

    setHorarios(resultado)
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

  function clickReservar() {
    if (isCliente) router.push('/agendar')
    else if (isLogado) router.push('/')
    else router.push('/cadastro')
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
        .unidade-tab:hover { border-color: ${ACCENT} !important; color: #fff !important; }
        .nav-auth-h:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
      `}</style>

      {/* Header */}
      <div style={{ background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isCliente ? (
            <button onClick={() => router.push('/minha-conta')} className="nav-auth-h"
              style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Minha conta
            </button>
          ) : (
            <>
              <button onClick={() => router.push('/login')} className="nav-auth-h"
                style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Login
              </button>
              <button onClick={() => router.push('/cadastro')} className="nav-auth-h"
                style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Cadastro
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff' }}>HORÁRIOS DISPONÍVEIS</div>
          <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>Cada halter = uma vaga · Para reservar, faça login ou cadastre-se</div>
        </div>

        {!isCliente && (
          <div style={{ background: '#110008', border: `1px solid ${ACCENT}44`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: 13, color: '#ccc', lineHeight: 1.7 }}>
            👀 Você está visualizando os horários como visitante. Para fazer uma reserva,{' '}
            <span onClick={() => router.push('/cadastro')} style={{ color: ACCENT, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>crie sua conta</span>
            {' '}ou{' '}
            <span onClick={() => router.push('/login')} style={{ color: ACCENT, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>faça login</span>.
          </div>
        )}

        {unidades.length > 1 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Unidade</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {unidades.map(u => {
                const ativa = unidadeAtiva?.id === u.id
                return (
                  <button key={u.id} className="unidade-tab"
                    onClick={() => {
                      setUnidadeAtiva(u)
                      setHorarios([])
                      setDiaSel(0)
                      setSemanaOffset(0)
                    }}
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

        {unidades.length === 1 && unidadeAtiva && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 8, padding: '0.35rem 0.85rem' }}>
              <span style={{ fontSize: 12, color: ACCENT, fontWeight: 600 }}>{unidadeAtiva.nome}</span>
            </div>
          </div>
        )}

        {/* Navegação de semana */}
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
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: isSel ? ACCENT : '#555', fontWeight: 600, marginBottom: 2 }}>
                    {isHoje ? 'HOJE' : DIAS_SEMANA[d.getDay()]}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: isSel ? '#fff' : '#888', lineHeight: 1 }}>{d.getDate()}</div>
                  <div style={{ fontSize: 9, color: isSel ? ACCENT : '#444', textTransform: 'uppercase' }}>
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

        {/* Aviso de feriado */}
        {tipoDia === 'feriado' && unidadeAtiva && (
          <div style={{ background: '#1a1000', border: `1px solid ${AMARELO}44`, borderRadius: 12, padding: '0.85rem 1.25rem', marginBottom: '1rem', fontSize: 13, color: '#ddd', lineHeight: 1.6 }}>
            ⭐ <strong style={{ color: AMARELO }}>{feriadoDescricao}</strong> — funcionando com escala especial e horários de fim de semana.
          </div>
        )}

        {/* Filtro de período */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
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

        {/* Grade de horários */}
        {!unidadeAtiva ? (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#444' }}>
            Carregando unidades...
          </div>
        ) : loadingHorarios ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#555' }}>Carregando horários...</div>
        ) : horariosFiltrados.length === 0 ? (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#444' }}>
            {tipoDia === 'fds'
              ? 'Não há coaches escalados neste dia ainda.'
              : tipoDia === 'feriado'
                ? 'Feriado sem coaches escalados.'
                : semanaOffset === 0 && diaSel === 0
                  ? 'Não há mais horários disponíveis para hoje.'
                  : 'Nenhum horário disponível neste dia.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {horariosFiltrados.map((h, i) => {
              const lotado = h.livres <= 0
              return (
                <div key={i} className="slot-row-h"
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', borderRadius: 12, border: '1px solid #222', background: '#111' }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, color: '#fff', width: 58, flexShrink: 0 }}>{h.hora}</div>
                  <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    {Array.from({ length: h.total }).map((_, vi) => {
                      let estado: 'livre' | 'ocupado' | 'bloqueado' = 'livre'
                      if (vi < h.ocupados) estado = 'ocupado'
                      else if (vi < h.ocupados + h.bloqueadas) estado = 'bloqueado'
                      return <HalterSVG key={vi} estado={estado} />
                    })}
                  </div>
                  <div style={{ flexShrink: 0, minWidth: 90, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: lotado ? '#ff4444' : h.livres <= 2 ? AMARELO : ACCENT, fontWeight: 600, marginBottom: 4 }}>
                      {lotado ? 'LOTADO' : h.livres === 1 ? '1 VAGA' : `${h.livres} VAGAS`}
                    </div>
                    <button onClick={clickReservar}
                      style={{ background: lotado ? 'transparent' : ACCENT, color: lotado ? AMARELO : '#fff', border: lotado ? `1px solid ${AMARELO}` : 'none', borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                      {lotado ? 'Fila' : 'Reservar'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!isCliente && horariosFiltrados.length > 0 && (
          <div style={{ marginTop: '3rem', background: '#0d0010', border: `1px solid ${ACCENT}44`, borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', marginBottom: 8, letterSpacing: 1 }}>
              GOSTOU DO QUE VIU?
            </div>
            <div style={{ fontSize: 14, color: '#aaa', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Crie sua conta gratuitamente, ative seu plano Wellhub ou TotalPass e reserve seu primeiro treino.
            </div>
            <button onClick={() => router.push('/cadastro')}
              style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem 2rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Criar conta gratuita →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
