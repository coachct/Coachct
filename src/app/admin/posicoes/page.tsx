'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

function IconEsteira({ blocked }: { blocked: boolean }) {
  const color = blocked ? '#ef4444' : '#9ca3af'
  return (
    <svg width="20" height="17" viewBox="0 0 26 22">
      <rect x="1" y="17" width="24" height="3" rx="1.5" fill={color} opacity="0.4"/>
      <circle cx="17" cy="4.5" r="2.5" fill={color}/>
      <line x1="17" y1="7" x2="15" y2="12" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="12" x2="11" y2="17" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="12" x2="19" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="8.5" x2="13" y2="10.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="8.5" x2="21" y2="10.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function IconHaltere({ blocked }: { blocked: boolean }) {
  const color = blocked ? '#ef4444' : '#9ca3af'
  return (
    <svg width="22" height="15" viewBox="0 0 28 18">
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

  const [unidades,   setUnidades]   = useState<any[]>([])
  const [unidadeSel, setUnidadeSel] = useState<any>(null)
  const [posicoes,   setPosicoes]   = useState<any[]>([])
  const [salvando,   setSalvando]   = useState<string | null>(null)
  const [loadingPos, setLoadingPos] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if (!['admin','coordenadora'].includes(perfil.role as string)) { router.push('/'); return }
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
    setSalvando(pos.id)
    const novoEstado = !pos.bloqueado
    const { error } = await supabase.from('club_posicoes').update({ bloqueado: novoEstado }).eq('id', pos.id)
    if (!error) {
      setPosicoes(prev => prev.map(p => p.id === pos.id ? { ...p, bloqueado: novoEstado } : p))
      // Se desbloqueou, processa fila das ocorrências futuras desta unidade
      if (!novoEstado) {
        const hoje = new Date().toISOString().split('T')[0]
        const { data: ocs } = await supabase
          .from('club_ocorrencias')
          .select('id, club_aulas!inner(unidade_id, tipo)')
          .eq('club_aulas.unidade_id', pos.unidade_id)
          .eq('club_aulas.tipo', 'running_funcional')
          .gte('data', hoje)
          .eq('status', 'ativa')
        for (const oc of (ocs || [])) {
          await supabase.rpc('processar_fila_espera_club', { p_ocorrencia_id: oc.id })
        }
      }
    }
    setSalvando(null)
  }

  const esteiras  = posicoes.filter(p => p.tipo === 'R').sort((a, b) => b.numero - a.numero)
  const funcional = posicoes.filter(p => p.tipo === 'F').sort((a, b) => b.numero - a.numero)
  const totalBloqueadas = posicoes.filter(p => p.bloqueado).length

  function PosCard({ pos }: { pos: any }) {
    const label = `${pos.tipo}${String(pos.numero).padStart(2, '0')}`
    const isR = pos.tipo === 'R'
    const bloqueado = pos.bloqueado
    const carregando = salvando === pos.id

    return (
      <button
        onClick={() => toggleBloqueio(pos)}
        disabled={!!carregando}
        title={bloqueado ? 'Clique para desbloquear' : 'Clique para bloquear'}
        className={`
          relative flex flex-col items-center justify-center gap-1 rounded-xl border transition-all
          ${bloqueado
            ? 'bg-red-50 border-red-200 hover:bg-red-100'
            : 'bg-white border-gray-200 hover:border-gray-400 hover:bg-gray-50'}
          ${carregando ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
        `}
        style={{ width: 58, height: 66, padding: '6px 4px' }}
      >
        {bloqueado && (
          <span className="absolute top-1 right-1.5 text-red-400 font-black" style={{ fontSize: 9 }}>✕</span>
        )}
        {isR ? <IconEsteira blocked={bloqueado}/> : <IconHaltere blocked={bloqueado}/>}
        <span className={`font-mono font-bold leading-none ${bloqueado ? 'text-red-400' : 'text-gray-400'}`} style={{ fontSize: 9 }}>
          {label}
        </span>
      </button>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="text-base font-semibold text-gray-900">Mapa de Posições</div>
        <div className="text-xs text-gray-400 mt-0.5">Bloquear / desbloquear posições do Running</div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Seletor de unidade */}
        <div className="flex gap-2">
          {unidades.map(u => (
            <button key={u.id} onClick={() => setUnidadeSel(u)}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all
                ${unidadeSel?.id === u.id
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
              {u.nome}
            </button>
          ))}
        </div>

        {/* Contadores */}
        {posicoes.length > 0 && (
          <div className="flex gap-2">
            <div className="card py-2 px-4 flex-1 text-center">
              <div className="text-xs text-gray-400">Total</div>
              <div className="text-lg font-bold text-gray-900">{posicoes.length}</div>
            </div>
            <div className={`card py-2 px-4 flex-1 text-center ${totalBloqueadas > 0 ? 'border-red-200 bg-red-50' : ''}`}>
              <div className="text-xs text-gray-400">Bloqueadas</div>
              <div className={`text-lg font-bold ${totalBloqueadas > 0 ? 'text-red-500' : 'text-gray-900'}`}>{totalBloqueadas}</div>
            </div>
            <div className="card py-2 px-4 flex-1 text-center">
              <div className="text-xs text-gray-400">Disponíveis</div>
              <div className="text-lg font-bold text-green-600">{posicoes.length - totalBloqueadas}</div>
            </div>
          </div>
        )}

        {/* Mapa */}
        {loadingPos ? (
          <div className="card text-center py-12 text-gray-400 text-sm">Carregando posições...</div>
        ) : posicoes.length === 0 ? (
          <div className="card text-center py-12 text-gray-400 text-sm">Nenhuma posição cadastrada para esta unidade.</div>
        ) : (
          <div className="card space-y-5">
            {/* Legenda */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-3.5 h-3.5 rounded bg-white border border-gray-300"/>Disponível
              </div>
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <div className="w-3.5 h-3.5 rounded bg-red-50 border border-red-300"/>Bloqueada
              </div>
              <span className="ml-auto text-xs text-gray-400">Clique para bloquear / desbloquear</span>
            </div>

            <hr className="border-gray-100"/>

            {/* Esteiras */}
            {esteiras.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center mb-3">Esteiras</div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {esteiras.map(pos => <PosCard key={pos.id} pos={pos}/>)}
                </div>
              </div>
            )}

            {funcional.length > 0 && (
              <>
                <hr className="border-gray-100"/>
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center mb-3">Funcional</div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {funcional.map(pos => <PosCard key={pos.id} pos={pos}/>)}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Aviso */}
        <div className="card border-amber-200 bg-amber-50 text-xs text-amber-700 leading-relaxed">
          ⚠️ Posições bloqueadas ficam indisponíveis para reserva imediatamente. O bloqueio é permanente até você desbloquear manualmente.
        </div>
      </div>
    </div>
  )
}
