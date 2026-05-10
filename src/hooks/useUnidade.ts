'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from './useAuth'

export type Unidade = {
  id: string
  slug: string
  nome: string
  tipo: 'ct' | 'club'
  ativo: boolean
}

const STORAGE_KEY = 'unidade_ativa_id'

export function useUnidade() {
  const { perfil, loading: loadingAuth } = useAuth()
  const supabase = createClient()
  const [unidadesPermitidas, setUnidadesPermitidas] = useState<Unidade[]>([])
  const [unidadeAtiva, setUnidadeAtivaState] = useState<Unidade | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (loadingAuth) return
    if (!perfil) {
      setLoading(false)
      return
    }
    carregar()
  }, [perfil?.id, loadingAuth])

  async function carregar() {
    if (!perfil) return

    let unidades: Unidade[] = []

    // Cliente não usa perfil_unidades, vê todas as unidades ativas
    if (perfil.role === 'cliente' || perfil.role === 'coach') {
      const { data } = await supabase
        .from('unidades')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      unidades = data || []
    } else {
      // Equipe (admin, recepcao, coordenadora): busca permissões
      const { data: perms } = await supabase
        .from('perfil_unidades')
        .select('unidade_id, unidades(*)')
        .eq('perfil_id', perfil.id)

      unidades = (perms || [])
        .map((p: any) => p.unidades)
        .filter((u: any) => u && u.ativo)
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome))
    }

    setUnidadesPermitidas(unidades)

    // Define unidade ativa
    if (unidades.length === 0) {
      setUnidadeAtivaState(null)
    } else if (unidades.length === 1) {
      // Só 1 unidade: usa ela automaticamente
      setUnidadeAtivaState(unidades[0])
    } else {
      // Múltiplas: usa a do localStorage ou a primeira
      const salva = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      const encontrada = salva ? unidades.find(u => u.id === salva) : null
      setUnidadeAtivaState(encontrada || unidades[0])
    }

    setLoading(false)
  }

  function setUnidadeAtiva(u: Unidade) {
    setUnidadeAtivaState(u)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, u.id)
    }
  }

  return {
    unidadeAtiva,
    setUnidadeAtiva,
    unidadesPermitidas,
    loading,
    temMultiplasUnidades: unidadesPermitidas.length > 1,
  }
}
