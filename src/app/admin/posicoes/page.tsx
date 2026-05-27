'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'
const VERDE  = '#2ddd8b'
const CINZA  = '#ff6b35'

function IconEsteira({ color }: { color: string }) {
  return (
    <svg width="22" height="18" viewBox="0 0 26 22">
      <rect x="1" y="17" width="24" height="3" rx="1.5" fill={color} opacity="0.35"/>
      <circle cx="17" cy="4.5" r="2.5" fill={color}/>
      <line x1="17" y1="7" x2="15" y2="12" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="12" x2="11" y2="17" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="12" x2="19" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="8.5" x2="13" y2="10.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="8.5" x2="21" y2="10.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function IconHaltere({ color }: { color: string }) {
  return (
    <svg width="24" height="16" viewBox="0 0 28 18">
      <rect x="0" y="6" width="5" height="6" rx="1.5" fill={color}/>
      <rect x="2" y="4" width="2" height="10" rx="1" fill={color}/>
      <rect x="7" y="8" width="14" height="2.5" rx="1.25" fill={color}/>
      <rect x="23" y="6" width="5" height="6" rx="1.5" fill={color}/>
      <rect x="24" y="4" width="2" height="10" rx="1" fill={color}/>
    </svg>
  )
}

export default function AdminPosicoesPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [unidades,    setUnidades]    = useState<any[]>([])
  const [unidadeSel,  setUnidadeSel]  = useState<any>(null)
  const [posicoes,    setPosicoes]    = useState<any[]>([])
  const [salvando,    setSalvando]    = useState<string | null>(null)
  const [loadingPos,  setLoadingPos]  = useState(false)

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if ((perfil.role as any) !== 'admin') { router.push('/'); return }
    carregarUnidades()
  }, [loading, perfil])

  useEffect(() => {
    if (unidadeSel) carregarPosicoes(unidadeSel.id)
  }, [unidadeSel?.id])

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades').select('*').eq('tipo', 'club').eq('ativo', true).order('nome')
    setUnidades(data || [])
    if (data && data.length > 0) setUnidadeSel(data[0])
  }

  async function carregarPosicoes(unidadeId: string) {
    setLoadingPos(true)
    const { data } = await supabase.from('club_posicoes').select('*').eq('unidade_id', unidadeId).eq('ativo', true).order('tipo').order('numero')
    setPosicoes(data || [])
    setLoadingPos(false)
  }

  async function toggleBloqueio(pos: any) {
    const label = `${pos.tipo}${String(pos.numero).padStart(2, '0')}`
    setSalvando(pos.id)
    const { error } = await supabase.from('club_posicoes').update({ bloqueado: !pos.bloqueado }).eq('id', pos.id)
    if (!error) {
      setPosicoes(prev => prev.map(p => p.id === pos.id ? { ...p, bloqueado: !p.bloqueado } : p))
    }
    setSalvando(null)
  }

  const esteiras   = posicoes.filter(p => p.tipo === 'R').sort((a, b) => b.numero - a.numero)
  const funcional1 = posicoes.filter(p => p.tipo === 'F' && p.numero % 2 === 1).sort((a, b) => b.numero - a.numero)
  const funcional2 = posicoes.filter(p => p.tipo === 'F' && p.numero % 2 === 0).sort((a, b) => b.numero - a.numero)

  const totalBloqueadas = posicoes.filter(p => p.bloqueado).length

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  function PosCard({ pos }: { pos: any }) {
    const label = `${pos.tipo}${String(pos.numero).padStart(2, '0')}`
    const isR = pos.tipo === 'R'
    const bloqueado = pos.bloqueado
    const carregando = salvando === pos.id
    const cor = bloqueado ? CINZA : isR ? ACCENT : VERDE

    return (
      <button
        onClick={() => toggleBloqueio(pos)}
        disabled={!!carregando}
        style={{
          width: 56, height: 68, borderRadius: 10,
          border: `1.5px solid ${bloqueado ? CINZA + '99' : '#2a2a2a'}`,
          background: bloqueado ? '#1a0a00' : '#111',
          cursor: carregando ? 'wait' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 4, transition: 'all .15s',
          opacity: carregando ? 0.6 : 1,
          position: 'relative',
        }}
      >
        {bloqueado && (
          <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 8, color: CINZA, fontWeight: 900 }}>✕</div>
        )}
        {isR ? <IconEsteira color={cor}/> : <IconHaltere color={cor}/>}
        <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", fontWeight: 700, color: bloqueado ? CINZA : '#555', lineHeight: 1 }}>
          {label}
        </span>
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.push('/admin')} className="text-gray-500 hover:text-gray-300 text-lg">‹</button>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1 }}>Mapa de Posições</div>
          <div className="text-xs text-gray-500 mt-0.5">Bloquear / desbloquear posições do Running</div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Seletor de unidade */}
        <div className="flex gap-3 mb-6">
          {unidades.map(u => (
            <button key={u.id} onClick={() => setUnidadeSel(u)}
              style={{
                flex: 1, padding: '0.75rem 1rem', borderRadius: 12,
                border: `1.5px solid ${unidadeSel?.id === u.id ? ACCENT + '88' : '#2a2a2a'}`,
                background: unidadeSel?.id === u.id ? '#1a0010' : '#111',
                color: unidadeSel?.id === u.id ? '#fff' : '#666',
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {u.nome}
            </button>
          ))}
        </div>

        {/* Status */}
        {posicoes.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: '0.6rem 1rem', fontSize: 13 }}>
              <span style={{ color: '#555' }}>Total: </span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{posicoes.length} posições</span>
            </div>
            <div style={{ background: totalBloqueadas > 0 ? '#1a0a00' : '#111', border: `1px solid ${totalBloqueadas > 0 ? CINZA + '44' : '#222'}`, borderRadius: 10, padding: '0.6rem 1rem', fontSize: 13 }}>
              <span style={{ color: '#555' }}>Bloqueadas: </span>
              <span style={{ color: totalBloqueadas > 0 ? CINZA : '#fff', fontWeight: 600 }}>{totalBloqueadas}</span>
            </div>
            <div style={{ background: '#111', border: '1px solid #222', borderRadius: 10, padding: '0.6rem 1rem', fontSize: 13 }}>
              <span style={{ color: '#555' }}>Disponíveis: </span>
              <span style={{ color: VERDE, fontWeight: 600 }}>{posicoes.length - totalBloqueadas}</span>
            </div>
          </div>
        )}

        {loadingPos ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#444' }}>Carregando posições...</div>
        ) : posicoes.length === 0 ? (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#444', fontSize: 14 }}>
            Nenhuma posição cadastrada para esta unidade.
          </div>
        ) : (
          <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 16, padding: '1.5rem' }}>

            {/* Legenda */}
            <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {[
                { bg: '#111', border: '#2a2a2a', cor: '#555', label: 'Disponível' },
                { bg: '#1a0a00', border: CINZA + '99', cor: CINZA, label: 'Bloqueada' },
              ].map(({ bg, border, cor, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: cor }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: bg, border: `1.5px solid ${border}` }}/>
                  {label}
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#444', marginLeft: 'auto' }}>Clique para bloquear / desbloquear</div>
            </div>

            {/* Esteiras */}
            {esteiras.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>ESTEIRAS</div>
                <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 6, minWidth: 'max-content', margin: '0 auto', width: 'fit-content' }}>
                    {esteiras.map(pos => <PosCard key={pos.id} pos={pos}/>)}
                  </div>
                </div>
              </div>
            )}

            {(funcional1.length > 0 || funcional2.length > 0) && (
              <>
                <div style={{ height: 1, background: '#1e1e1e', marginBottom: '1.5rem' }}/>
                <div>
                  <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>FUNCIONAL</div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 6 }}>
                    {funcional1.map(pos => <PosCard key={pos.id} pos={pos}/>)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', paddingLeft: 31 }}>
                    {funcional2.map(pos => <PosCard key={pos.id} pos={pos}/>)}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Info */}
        <div style={{ marginTop: '1.25rem', background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 12, padding: '0.85rem 1rem', fontSize: 12, color: '#555', lineHeight: 1.7 }}>
          ⚠️ Posições bloqueadas aparecem como <strong style={{ color: CINZA }}>indisponíveis</strong> no mapa de reserva dos clientes. O bloqueio é permanente até você desbloquear manualmente.
        </div>
      </div>
    </div>
  )
}
