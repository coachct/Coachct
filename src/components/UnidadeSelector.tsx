'use client'
import { useState, useRef, useEffect } from 'react'
import { useUnidade } from '@/hooks/useUnidade'
import { Building2, ChevronDown, Check } from 'lucide-react'

export default function UnidadeSelector() {
  const { unidadeAtiva, setUnidadeAtiva, unidadesPermitidas, loading, temMultiplasUnidades } = useUnidade()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [])

  if (loading || !unidadeAtiva) return null

  // Se tem só 1 unidade, mostra como tag estática (sem dropdown)
  if (!temMultiplasUnidades) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200">
        <Building2 size={13} className="text-gray-500" />
        <span className="text-xs font-medium text-gray-700">{unidadeAtiva.nome}</span>
      </div>
    )
  }

  // Múltiplas unidades: dropdown
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
          aberto
            ? 'bg-primary-50 border-primary-300'
            : 'bg-white border-gray-200 hover:border-primary-300'
        }`}>
        <Building2 size={13} className={aberto ? 'text-primary-600' : 'text-gray-500'} />
        <span className="text-xs font-medium text-gray-700">{unidadeAtiva.nome}</span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 min-w-[220px]">
          <div className="px-3 py-1.5 text-xs text-gray-400 uppercase tracking-wide font-semibold border-b border-gray-100">
            Alternar unidade
          </div>
          {unidadesPermitidas.map(u => (
            <button
              key={u.id}
              onClick={() => {
                setUnidadeAtiva(u)
                setAberto(false)
              }}
              className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors ${
                u.id === unidadeAtiva.id ? 'bg-primary-50' : ''
              }`}>
              <div className="flex items-center gap-2 flex-1">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  u.tipo === 'ct'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {u.tipo === 'ct' ? 'CT' : 'Club'}
                </span>
                <span className="text-sm text-gray-900">{u.nome}</span>
              </div>
              {u.id === unidadeAtiva.id && (
                <Check size={13} className="text-primary-600 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
