'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Edit, X, Check } from 'lucide-react'

type Unidade = {
  id: string
  slug: string
  nome: string
  tipo: 'ct' | 'club'
  endereco: string | null
  telefone: string | null
  ativo: boolean
  criado_em: string
}

export default function AdminUnidadesPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Unidade | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [form, setForm] = useState({
    slug: '',
    nome: '',
    tipo: 'ct' as 'ct' | 'club',
    endereco: '',
    telefone: '',
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
    const { data } = await supabase
      .from('unidades')
      .select('*')
      .order('tipo', { ascending: true })
      .order('nome', { ascending: true })
    setUnidades(data || [])
    setLoadingData(false)
  }

  function abrirNovo() {
    setEditando(null)
    setForm({
      slug: '',
      nome: '',
      tipo: 'ct',
      endereco: '',
      telefone: '',
      ativo: true,
    })
    setErro('')
    setModalAberto(true)
  }

  function abrirEdicao(u: Unidade) {
    setEditando(u)
    setForm({
      slug: u.slug,
      nome: u.nome,
      tipo: u.tipo,
      endereco: u.endereco || '',
      telefone: u.telefone || '',
      ativo: u.ativo,
    })
    setErro('')
    setModalAberto(true)
  }

  async function salvar() {
    if (!form.nome.trim() || !form.slug.trim()) {
      setErro('Preencha nome e slug.')
      return
    }

    setSalvando(true)
    setErro('')

    const payload = {
      slug: form.slug.trim().toLowerCase(),
      nome: form.nome.trim(),
      tipo: form.tipo,
      endereco: form.endereco.trim() || null,
      telefone: form.telefone.trim() || null,
      ativo: form.ativo,
    }

    let error
    if (editando) {
      ({ error } = await supabase.from('unidades').update(payload).eq('id', editando.id))
    } else {
      ({ error } = await supabase.from('unidades').insert(payload))
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

  async function alternarAtivo(u: Unidade) {
    await supabase.from('unidades').update({ ativo: !u.ativo }).eq('id', u.id)
    await carregar()
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
            <Building2 size={20} className="text-primary-600" />
            Unidades
          </h1>
          <p className="text-sm text-gray-400 mt-1">Gerencie as unidades da rede</p>
        </div>
        <button onClick={abrirNovo} className="btn gap-1 bg-primary-600 text-white hover:bg-primary-700">
          <Plus size={14} /> Nova unidade
        </button>
      </div>

      <div className="space-y-3 max-w-3xl">
        {unidades.length === 0 ? (
          <div className="card text-center py-12 text-gray-400 text-sm">
            Nenhuma unidade cadastrada.
          </div>
        ) : (
          unidades.map(u => (
            <div key={u.id} className={`card border-l-4 ${
              u.tipo === 'ct' ? 'border-l-primary-400' : 'border-l-blue-400'
            } ${!u.ativo ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{u.nome}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.tipo === 'ct'
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {u.tipo === 'ct' ? 'Coach CT' : 'Just Club'}
                    </span>
                    {!u.ativo && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Inativa
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 font-mono">{u.slug}</div>
                  {u.endereco && (
                    <div className="text-xs text-gray-500 mt-1">📍 {u.endereco}</div>
                  )}
                  {u.telefone && (
                    <div className="text-xs text-gray-500 mt-0.5">📞 {u.telefone}</div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => abrirEdicao(u)}
                    className="btn btn-sm gap-1 text-primary-600 hover:bg-primary-50">
                    <Edit size={12} /> Editar
                  </button>
                  <button
                    onClick={() => alternarAtivo(u)}
                    className={`btn btn-sm ${
                      u.ativo
                        ? 'text-orange-600 hover:bg-orange-50'
                        : 'text-green-600 hover:bg-green-50'
                    }`}>
                    {u.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900">
                {editando ? 'Editar unidade' : 'Nova unidade'}
              </div>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Nome *</label>
                <input className="input w-full" value={form.nome}
                  onChange={e => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Just CT" />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Slug (identificador) *</label>
                <input className="input w-full font-mono" value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  placeholder="just_ct" />
                <div className="text-xs text-gray-400 mt-1">Use apenas letras minúsculas, números e _</div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Tipo *</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm({ ...form, tipo: 'ct' })}
                    className={`flex-1 p-3 rounded-xl border text-sm font-medium ${
                      form.tipo === 'ct'
                        ? 'border-primary-400 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600'
                    }`}>
                    Coach CT
                  </button>
                  <button
                    onClick={() => setForm({ ...form, tipo: 'club' })}
                    className={`flex-1 p-3 rounded-xl border text-sm font-medium ${
                      form.tipo === 'club'
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600'
                    }`}>
                    Just Club
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Endereço</label>
                <input className="input w-full" value={form.endereco}
                  onChange={e => setForm({ ...form, endereco: e.target.value })}
                  placeholder="Rua, número, bairro" />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Telefone</label>
                <input className="input w-full" value={form.telefone}
                  onChange={e => setForm({ ...form, telefone: e.target.value })}
                  placeholder="(11) 99999-9999" />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.ativo}
                  onChange={e => setForm({ ...form, ativo: e.target.checked })}
                  className="w-4 h-4 accent-primary-600" />
                <span className="text-sm text-gray-700">Unidade ativa</span>
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
