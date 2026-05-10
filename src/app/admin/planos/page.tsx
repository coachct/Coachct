'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { CreditCard, Plus, Edit, X, Check } from 'lucide-react'

type Plano = {
  id: string
  unidade_id: string | null
  nome: string
  tipo: string
  creditos_mes: number
  precisa_contrato: boolean
  ativo: boolean
}

type Unidade = {
  id: string
  nome: string
  tipo: string
}

export default function AdminPlanosPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [planos, setPlanos] = useState<Plano[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Plano | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [form, setForm] = useState({
    unidade_id: '',
    nome: '',
    tipo: 'wellhub',
    creditos_mes: 8,
    precisa_contrato: true,
    ativo: true,
  })

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') {
      router.push('/')
    }
  }, [perfil, loading])

  useEffect(() => {
    if (perfil?.role === 'admin') carregar()
  }, [perfil])

  async function carregar() {
    const [{ data: planosData }, { data: unidadesData }] = await Promise.all([
      supabase.from('planos_disponiveis').select('*').order('tipo').order('creditos_mes'),
      supabase.from('unidades').select('id, nome, tipo').eq('ativo', true).order('nome'),
    ])
    setPlanos(planosData || [])
    setUnidades(unidadesData || [])
    setLoadingData(false)
  }

  function abrirNovo() {
    setEditando(null)
    setForm({
      unidade_id: unidades[0]?.id || '',
      nome: '',
      tipo: 'wellhub',
      creditos_mes: 8,
      precisa_contrato: true,
      ativo: true,
    })
    setErro('')
    setModalAberto(true)
  }

  function abrirEdicao(p: Plano) {
    setEditando(p)
    setForm({
      unidade_id: p.unidade_id || '',
      nome: p.nome,
      tipo: p.tipo,
      creditos_mes: p.creditos_mes,
      precisa_contrato: p.precisa_contrato,
      ativo: p.ativo,
    })
    setErro('')
    setModalAberto(true)
  }

  async function salvar() {
    if (!form.nome.trim() || !form.unidade_id || form.creditos_mes < 0) {
      setErro('Preencha todos os campos obrigatórios.')
      return
    }

    setSalvando(true)
    setErro('')

    const payload = {
      unidade_id: form.unidade_id,
      nome: form.nome.trim(),
      tipo: form.tipo.trim().toLowerCase(),
      creditos_mes: form.creditos_mes,
      precisa_contrato: form.precisa_contrato,
      ativo: form.ativo,
    }

    let error
    if (editando) {
      ({ error } = await supabase.from('planos_disponiveis').update(payload).eq('id', editando.id))
    } else {
      ({ error } = await supabase.from('planos_disponiveis').insert(payload))
    }

    if (error) {
      setErro('Erro: ' + error.message)
      setSalvando(false)
      return
    }

    setModalAberto(false)
    setSalvando(false)
    await carregar()
  }

  async function alternarAtivo(p: Plano) {
    await supabase.from('planos_disponiveis').update({ ativo: !p.ativo }).eq('id', p.id)
    await carregar()
  }

  function nomeUnidade(unidadeId: string | null) {
    if (!unidadeId) return 'Rede'
    return unidades.find(u => u.id === unidadeId)?.nome || '—'
  }

  // Agrupa planos por unidade
  const planosPorUnidade: Record<string, Plano[]> = {}
  for (const p of planos) {
    const key = p.unidade_id || 'rede'
    if (!planosPorUnidade[key]) planosPorUnidade[key] = []
    planosPorUnidade[key].push(p)
  }

  if (loading || loadingData) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <CreditCard size={20} className="text-primary-600" />
            Planos disponíveis
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Catálogo de planos que podem ser atribuídos aos clientes
          </p>
        </div>
        <button onClick={abrirNovo} className="btn gap-1 bg-primary-600 text-white hover:bg-primary-700">
          <Plus size={14} /> Novo plano
        </button>
      </div>

      <div className="space-y-6 max-w-3xl">
        {unidades.map(u => {
          const planosDaUnidade = planosPorUnidade[u.id] || []
          if (planosDaUnidade.length === 0) return null

          return (
            <div key={u.id}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  u.tipo === 'ct'
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {u.tipo === 'ct' ? 'Coach CT' : 'Just Club'}
                </span>
                <h2 className="text-sm font-semibold text-gray-700">{u.nome}</h2>
              </div>

              <div className="space-y-2">
                {planosDaUnidade.map(p => (
                  <div key={p.id} className={`card flex items-center justify-between gap-3 ${
                    !p.ativo ? 'opacity-60' : ''
                  }`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900">{p.nome}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-mono">
                          {p.tipo}
                        </span>
                        {!p.ativo && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                            Inativo
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        <span className="font-bold text-primary-600">{p.creditos_mes}</span> sessões/mês
                        {p.precisa_contrato && ' · contrato obrigatório'}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => abrirEdicao(p)}
                        className="btn btn-sm gap-1 text-primary-600 hover:bg-primary-50">
                        <Edit size={11} /> Editar
                      </button>
                      <button
                        onClick={() => alternarAtivo(p)}
                        className={`btn btn-sm ${
                          p.ativo
                            ? 'text-orange-600 hover:bg-orange-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}>
                        {p.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {planos.length === 0 && (
          <div className="card text-center py-12 text-gray-400 text-sm">
            Nenhum plano cadastrado.
          </div>
        )}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900">
                {editando ? 'Editar plano' : 'Novo plano'}
              </div>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Unidade *</label>
                <select className="input w-full" value={form.unidade_id}
                  onChange={e => setForm({ ...form, unidade_id: e.target.value })}>
                  <option value="">Selecione...</option>
                  {unidades.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Nome do plano *</label>
                <input className="input w-full" value={form.nome}
                  onChange={e => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Wellhub Diamond CT" />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Tipo (identificador) *</label>
                <input className="input w-full font-mono" value={form.tipo}
                  onChange={e => setForm({ ...form, tipo: e.target.value })}
                  placeholder="wellhub, totalpass, ..." />
                <div className="text-xs text-gray-400 mt-1">Use letras minúsculas, sem espaço</div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Sessões por mês *</label>
                <input type="number" min={0} max={50} className="input w-full"
                  value={form.creditos_mes}
                  onChange={e => setForm({ ...form, creditos_mes: parseInt(e.target.value) || 0 })} />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.precisa_contrato}
                  onChange={e => setForm({ ...form, precisa_contrato: e.target.checked })}
                  className="w-4 h-4 accent-primary-600" />
                <span className="text-sm text-gray-700">Exige aceite de contrato</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.ativo}
                  onChange={e => setForm({ ...form, ativo: e.target.checked })}
                  className="w-4 h-4 accent-primary-600" />
                <span className="text-sm text-gray-700">Plano ativo</span>
              </label>
            </div>

            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mt-3 text-sm text-red-600">
                {erro}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button onClick={() => setModalAberto(false)}
                className="btn flex-1 text-gray-500 border border-gray-200">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="btn flex-1 bg-primary-600 text-white gap-1">
                <Check size={14} /> {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
