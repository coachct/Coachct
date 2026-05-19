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
  duracao_meses: number | null
  total_creditos: number | null
  dias_janela_agendamento: number
  horas_antecedencia_cancelamento: number
  horas_cancelamento_sem_fila: number
  prioridade_fila: number
  bloqueia_por_falta: boolean
  permite_escolher_coach: boolean
  open_gym: boolean
  creditos_acumulativos: boolean
}

type Unidade = {
  id: string
  nome: string
  tipo: string
}

const TIPOS_PLANO = [
  { value: 'wellhub', label: 'Wellhub' },
  { value: 'totalpass', label: 'TotalPass' },
  { value: 'coach_ct_pro', label: 'Coach CT Pro' },
  { value: 'avulso', label: 'Avulso' },
  { value: 'outro', label: 'Outro (digitar)' },
]

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
  const [tipoSelect, setTipoSelect] = useState<string>('wellhub')

  const [form, setForm] = useState({
    unidade_id: '',
    nome: '',
    tipo: 'wellhub',
    creditos_mes: 8,
    precisa_contrato: true,
    ativo: true,
    duracao_meses: null as number | null,
    total_creditos: null as number | null,
    dias_janela_agendamento: 7,
    horas_antecedencia_cancelamento: 3,
    horas_cancelamento_sem_fila: 12,
    prioridade_fila: 0,
    bloqueia_por_falta: true,
    permite_escolher_coach: false,
    open_gym: false,
    creditos_acumulativos: false,
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
    setTipoSelect('wellhub')
    setForm({
      unidade_id: unidades[0]?.id || '',
      nome: '',
      tipo: 'wellhub',
      creditos_mes: 8,
      precisa_contrato: true,
      ativo: true,
      duracao_meses: null,
      total_creditos: null,
      dias_janela_agendamento: 7,
      horas_antecedencia_cancelamento: 3,
      horas_cancelamento_sem_fila: 12,
      prioridade_fila: 0,
      bloqueia_por_falta: true,
      permite_escolher_coach: false,
      open_gym: false,
      creditos_acumulativos: false,
    })
    setErro('')
    setModalAberto(true)
  }

  function abrirEdicao(p: Plano) {
    setEditando(p)
    const tipoConhecido = TIPOS_PLANO.find(t => t.value === p.tipo)
    setTipoSelect(tipoConhecido && tipoConhecido.value !== 'outro' ? p.tipo : 'outro')
    setForm({
      unidade_id: p.unidade_id || '',
      nome: p.nome,
      tipo: p.tipo,
      creditos_mes: p.creditos_mes,
      precisa_contrato: p.precisa_contrato,
      ativo: p.ativo,
      duracao_meses: p.duracao_meses,
      total_creditos: p.total_creditos,
      dias_janela_agendamento: p.dias_janela_agendamento ?? 7,
      horas_antecedencia_cancelamento: p.horas_antecedencia_cancelamento ?? 3,
      horas_cancelamento_sem_fila: p.horas_cancelamento_sem_fila ?? 12,
      prioridade_fila: p.prioridade_fila ?? 0,
      bloqueia_por_falta: p.bloqueia_por_falta ?? true,
      permite_escolher_coach: p.permite_escolher_coach ?? false,
      open_gym: p.open_gym ?? false,
      creditos_acumulativos: p.creditos_acumulativos ?? false,
    })
    setErro('')
    setModalAberto(true)
  }

  function handleTipoChange(novoTipo: string) {
    setTipoSelect(novoTipo)

    if (novoTipo === 'outro') return

    setForm(prev => ({ ...prev, tipo: novoTipo }))

    if (novoTipo === 'coach_ct_pro') {
      setForm(prev => ({
        ...prev,
        tipo: 'coach_ct_pro',
        creditos_mes: 0,
        precisa_contrato: true,
        total_creditos: 72,
        duracao_meses: 6,
        dias_janela_agendamento: 14,
        horas_antecedencia_cancelamento: 3,
        horas_cancelamento_sem_fila: 3,
        prioridade_fila: 10,
        bloqueia_por_falta: false,
        permite_escolher_coach: true,
        open_gym: true,
        creditos_acumulativos: true,
      }))
    } else if (novoTipo === 'wellhub') {
      setForm(prev => ({
        ...prev,
        tipo: 'wellhub',
        creditos_mes: 8,
        precisa_contrato: true,
        total_creditos: null,
        duracao_meses: null,
        dias_janela_agendamento: 7,
        horas_antecedencia_cancelamento: 3,
        horas_cancelamento_sem_fila: 12,
        prioridade_fila: 0,
        bloqueia_por_falta: true,
        permite_escolher_coach: false,
        open_gym: false,
        creditos_acumulativos: false,
      }))
    } else if (novoTipo === 'totalpass') {
      setForm(prev => ({
        ...prev,
        tipo: 'totalpass',
        creditos_mes: 10,
        precisa_contrato: true,
        total_creditos: null,
        duracao_meses: null,
        dias_janela_agendamento: 7,
        horas_antecedencia_cancelamento: 3,
        horas_cancelamento_sem_fila: 12,
        prioridade_fila: 0,
        bloqueia_por_falta: true,
        permite_escolher_coach: false,
        open_gym: false,
        creditos_acumulativos: false,
      }))
    } else if (novoTipo === 'avulso') {
      setForm(prev => ({
        ...prev,
        tipo: 'avulso',
        creditos_mes: 0,
        precisa_contrato: false,
        total_creditos: null,
        duracao_meses: null,
        dias_janela_agendamento: 7,
        horas_antecedencia_cancelamento: 3,
        horas_cancelamento_sem_fila: 12,
        prioridade_fila: 0,
        bloqueia_por_falta: true,
        permite_escolher_coach: false,
        open_gym: false,
        creditos_acumulativos: false,
      }))
    }
  }

  async function salvar() {
    if (!form.nome.trim() || !form.unidade_id) {
      setErro('Preencha nome e unidade.')
      return
    }

    if (!form.tipo.trim()) {
      setErro('Selecione ou digite o tipo do plano.')
      return
    }

    if (form.tipo === 'coach_ct_pro') {
      if (!form.total_creditos || form.total_creditos < 1) {
        setErro('Coach CT Pro precisa ter total de créditos.')
        return
      }
      if (!form.duracao_meses || form.duracao_meses < 1) {
        setErro('Coach CT Pro precisa ter duração em meses.')
        return
      }
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
      duracao_meses: form.duracao_meses,
      total_creditos: form.total_creditos,
      dias_janela_agendamento: form.dias_janela_agendamento,
      horas_antecedencia_cancelamento: form.horas_antecedencia_cancelamento,
      horas_cancelamento_sem_fila: form.horas_cancelamento_sem_fila,
      prioridade_fila: form.prioridade_fila,
      bloqueia_por_falta: form.bloqueia_por_falta,
      permite_escolher_coach: form.permite_escolher_coach,
      open_gym: form.open_gym,
      creditos_acumulativos: form.creditos_acumulativos,
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

  const planosPorUnidade: Record<string, Plano[]> = {}
  for (const p of planos) {
    const key = p.unidade_id || 'rede'
    if (!planosPorUnidade[key]) planosPorUnidade[key] = []
    planosPorUnidade[key].push(p)
  }

  const ehCoachCTPro = form.tipo === 'coach_ct_pro'

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
                {planosDaUnidade.map(p => {
                  const ehProPlano = p.tipo === 'coach_ct_pro'
                  return (
                    <div key={p.id} className={`card flex items-center justify-between gap-3 ${
                      !p.ativo ? 'opacity-60' : ''
                    } ${ehProPlano ? 'border-l-4 border-l-primary-600' : ''}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900">{p.nome}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                            ehProPlano
                              ? 'bg-primary-100 text-primary-700 font-semibold'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {p.tipo}
                          </span>
                          {!p.ativo && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                              Inativo
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {ehProPlano && p.total_creditos ? (
                            <>
                              <span className="font-bold text-primary-600">{p.total_creditos}</span> créditos / {p.duracao_meses} meses
                              {p.permite_escolher_coach && ' · escolhe coach'}
                              {p.open_gym && ' · open gym'}
                            </>
                          ) : (
                            <>
                              <span className="font-bold text-primary-600">{p.creditos_mes}</span> sessões/mês
                              {p.precisa_contrato && ' · contrato obrigatório'}
                            </>
                          )}
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
                  )
                })}
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
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
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
                  placeholder="Ex: Coach CT Pro Semestral" />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block font-medium">Tipo do plano *</label>
                <select className="input w-full" value={tipoSelect}
                  onChange={e => handleTipoChange(e.target.value)}>
                  {TIPOS_PLANO.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {tipoSelect === 'outro' && (
                  <input className="input w-full font-mono mt-2" value={form.tipo}
                    onChange={e => setForm({ ...form, tipo: e.target.value })}
                    placeholder="Digite o tipo (letras minúsculas)" />
                )}
                <div className="text-xs text-gray-400 mt-1">
                  {ehCoachCTPro
                    ? '✓ Plano direto Just CT — usa pacote total de créditos'
                    : 'Identificador interno do plano'
                  }
                </div>
              </div>

              {!ehCoachCTPro && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block font-medium">Sessões por mês *</label>
                  <input type="number" min={0} max={50} className="input w-full"
                    value={form.creditos_mes}
                    onChange={e => setForm({ ...form, creditos_mes: parseInt(e.target.value) || 0 })} />
                </div>
              )}

              {ehCoachCTPro && (
                <>
                  <div className="border-t border-gray-100 pt-4 mt-4">
                    <div className="text-xs font-semibold text-primary-600 uppercase tracking-wide mb-3">
                      Configurações Coach CT Pro
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block font-medium">Total de créditos *</label>
                      <input type="number" min={1} className="input w-full"
                        value={form.total_creditos ?? ''}
                        onChange={e => setForm({ ...form, total_creditos: parseInt(e.target.value) || null })}
                        placeholder="72" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block font-medium">Duração (meses) *</label>
                      <input type="number" min={1} max={24} className="input w-full"
                        value={form.duracao_meses ?? ''}
                        onChange={e => setForm({ ...form, duracao_meses: parseInt(e.target.value) || null })}
                        placeholder="6" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block font-medium">Janela agendamento (dias)</label>
                      <input type="number" min={1} max={60} className="input w-full"
                        value={form.dias_janela_agendamento}
                        onChange={e => setForm({ ...form, dias_janela_agendamento: parseInt(e.target.value) || 7 })} />
                      <div className="text-xs text-gray-400 mt-1">Quantos dias à frente</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block font-medium">Prioridade na fila</label>
                      <input type="number" min={0} max={100} className="input w-full"
                        value={form.prioridade_fila}
                        onChange={e => setForm({ ...form, prioridade_fila: parseInt(e.target.value) || 0 })} />
                      <div className="text-xs text-gray-400 mt-1">Maior = mais prioridade</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block font-medium">Cancelar sem fila (horas)</label>
                      <input type="number" min={0} max={48} className="input w-full"
                        value={form.horas_cancelamento_sem_fila}
                        onChange={e => setForm({ ...form, horas_cancelamento_sem_fila: parseInt(e.target.value) || 0 })} />
                      <div className="text-xs text-gray-400 mt-1">Antes disso cancela livre</div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block font-medium">Limite cancelamento (horas)</label>
                      <input type="number" min={0} max={48} className="input w-full"
                        value={form.horas_antecedencia_cancelamento}
                        onChange={e => setForm({ ...form, horas_antecedencia_cancelamento: parseInt(e.target.value) || 0 })} />
                      <div className="text-xs text-gray-400 mt-1">Abaixo disso bloqueia</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={form.permite_escolher_coach}
                        onChange={e => setForm({ ...form, permite_escolher_coach: e.target.checked })}
                        className="w-4 h-4 accent-primary-600" />
                      Cliente escolhe coach
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={form.open_gym}
                        onChange={e => setForm({ ...form, open_gym: e.target.checked })}
                        className="w-4 h-4 accent-primary-600" />
                      Acesso open gym
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={form.creditos_acumulativos}
                        onChange={e => setForm({ ...form, creditos_acumulativos: e.target.checked })}
                        className="w-4 h-4 accent-primary-600" />
                      Créditos acumulativos
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                      <input type="checkbox" checked={form.bloqueia_por_falta}
                        onChange={e => setForm({ ...form, bloqueia_por_falta: e.target.checked })}
                        className="w-4 h-4 accent-primary-600" />
                      Bloqueia por falta
                    </label>
                  </div>
                </>
              )}

              <div className="border-t border-gray-100 pt-4 mt-2 space-y-2">
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
