'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Shield, Check, X } from 'lucide-react'

type Perfil = {
  id: string
  nome: string
  role: string
  ativo: boolean
}

type Unidade = {
  id: string
  nome: string
  tipo: string
}

type PermissaoMap = Record<string, Record<string, { id: string; pode_ver_dashboard: boolean; pode_agendar_outras: boolean }>>

const ROLES_GERENCIAVEIS = ['admin', 'recepcao', 'coordenadora']

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  recepcao: 'Recepção',
  coordenadora: 'Coordenadora',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  recepcao: 'bg-blue-100 text-blue-700',
  coordenadora: 'bg-green-100 text-green-700',
}

export default function AdminPermissoesPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [permissoes, setPermissoes] = useState<PermissaoMap>({})
  const [loadingData, setLoadingData] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') {
      router.push('/')
    }
  }, [perfil, loading])

  useEffect(() => {
    if (perfil?.role === 'admin') carregar()
  }, [perfil])

  async function carregar() {
    const [
      { data: perfisData },
      { data: unidadesData },
      { data: permsData },
    ] = await Promise.all([
      supabase.from('perfis')
        .select('id, nome, role, ativo')
        .in('role', ROLES_GERENCIAVEIS)
        .eq('ativo', true)
        .order('role')
        .order('nome'),
      supabase.from('unidades')
        .select('id, nome, tipo')
        .eq('ativo', true)
        .order('tipo')
        .order('nome'),
      supabase.from('perfil_unidades').select('*'),
    ])

    setPerfis(perfisData || [])
    setUnidades(unidadesData || [])

    // Monta o mapa: perfil_id -> unidade_id -> permissões
    const map: PermissaoMap = {}
    for (const p of (permsData || [])) {
      if (!p.perfil_id || !p.unidade_id) continue
      if (!map[p.perfil_id]) map[p.perfil_id] = {}
      map[p.perfil_id][p.unidade_id] = {
        id: p.id,
        pode_ver_dashboard: p.pode_ver_dashboard,
        pode_agendar_outras: p.pode_agendar_outras,
      }
    }
    setPermissoes(map)
    setLoadingData(false)
  }

  async function alternarAcesso(perfilId: string, unidadeId: string) {
    const chave = `${perfilId}_${unidadeId}`
    setSalvando(chave)

    const existente = permissoes[perfilId]?.[unidadeId]

    if (existente) {
      // Remove permissão
      await supabase.from('perfil_unidades').delete().eq('id', existente.id)
    } else {
      // Adiciona permissão
      await supabase.from('perfil_unidades').insert({
        perfil_id: perfilId,
        unidade_id: unidadeId,
        pode_ver_dashboard: true,
        pode_agendar_outras: true,
      })
    }

    await carregar()
    setSalvando(null)
  }

  async function alternarDashboard(perfilId: string, unidadeId: string) {
    const existente = permissoes[perfilId]?.[unidadeId]
    if (!existente) return
    
    const chave = `${perfilId}_${unidadeId}_dash`
    setSalvando(chave)

    await supabase.from('perfil_unidades')
      .update({ pode_ver_dashboard: !existente.pode_ver_dashboard })
      .eq('id', existente.id)

    await carregar()
    setSalvando(null)
  }

  async function alternarAgendar(perfilId: string, unidadeId: string) {
    const existente = permissoes[perfilId]?.[unidadeId]
    if (!existente) return
    
    const chave = `${perfilId}_${unidadeId}_ag`
    setSalvando(chave)

    await supabase.from('perfil_unidades')
      .update({ pode_agendar_outras: !existente.pode_agendar_outras })
      .eq('id', existente.id)

    await carregar()
    setSalvando(null)
  }

  if (loading || loadingData) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Shield size={20} className="text-primary-600" />
          Permissões da equipe
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Defina quais unidades cada membro da equipe pode gerenciar
        </p>
      </div>

      <div className="card mb-5 bg-blue-50 border-blue-200">
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Como funciona:</p>
          <ul className="space-y-0.5 text-xs">
            <li>• <strong>Acesso à unidade:</strong> permite que o membro veja agendamentos, clientes e operações daquela unidade</li>
            <li>• <strong>Dashboard:</strong> permite ver os relatórios e indicadores daquela unidade</li>
            <li>• <strong>Agendar outras:</strong> permite agendar treinos para unidades diferentes da sua</li>
          </ul>
        </div>
      </div>

      {perfis.length === 0 ? (
        <div className="card text-center py-12 text-gray-400 text-sm">
          Nenhum membro da equipe encontrado.
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl">
          {perfis.map(p => {
            const permsDoPerfil = permissoes[p.id] || {}

            return (
              <div key={p.id} className="card">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {p.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm text-gray-900">{p.nome}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[p.role] || 'bg-gray-100 text-gray-700'}`}>
                      {ROLE_LABELS[p.role] || p.role}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {unidades.map(u => {
                    const tem = !!permsDoPerfil[u.id]
                    const perm = permsDoPerfil[u.id]
                    const chave = `${p.id}_${u.id}`
                    const chaveDash = `${p.id}_${u.id}_dash`
                    const chaveAg = `${p.id}_${u.id}_ag`

                    return (
                      <div key={u.id} className={`rounded-xl border p-3 ${
                        tem ? 'border-primary-200 bg-primary-50' : 'border-gray-200'
                      }`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap flex-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              u.tipo === 'ct'
                                ? 'bg-primary-100 text-primary-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {u.tipo === 'ct' ? 'CT' : 'Club'}
                            </span>
                            <span className="text-sm font-medium text-gray-900">{u.nome}</span>
                          </div>
                          <button
                            onClick={() => alternarAcesso(p.id, u.id)}
                            disabled={salvando === chave}
                            className={`btn btn-sm gap-1 ${
                              tem
                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                : 'bg-green-50 text-green-600 hover:bg-green-100'
                            }`}>
                            {tem ? (
                              <><X size={11} /> Remover acesso</>
                            ) : (
                              <><Check size={11} /> Dar acesso</>
                            )}
                          </button>
                        </div>

                        {tem && perm && (
                          <div className="mt-3 pt-3 border-t border-primary-200 flex flex-wrap gap-2">
                            <button
                              onClick={() => alternarDashboard(p.id, u.id)}
                              disabled={salvando === chaveDash}
                              className={`btn btn-sm gap-1 text-xs ${
                                perm.pode_ver_dashboard
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                              {perm.pode_ver_dashboard ? <Check size={10} /> : <X size={10} />}
                              Ver dashboard
                            </button>
                            <button
                              onClick={() => alternarAgendar(p.id, u.id)}
                              disabled={salvando === chaveAg}
                              className={`btn btn-sm gap-1 text-xs ${
                                perm.pode_agendar_outras
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                              {perm.pode_agendar_outras ? <Check size={10} /> : <X size={10} />}
                              Agendar outras unidades
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
