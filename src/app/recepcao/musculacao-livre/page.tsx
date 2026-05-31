'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Dumbbell, Search, X, Plus, Clock, AlertCircle, Check, ChevronRight } from 'lucide-react'

// Musculação Livre é sempre na unidade Just CT
const CT_UNIDADE_ID = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function RecepcaoMusculacaoLivrePage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const hoje = dataLocalStr(new Date())

  const [acessos, setAcessos] = useState<any[]>([])
  const [loadingAcessos, setLoadingAcessos] = useState(true)

  // Modal registrar walk-in
  const [modalAberto, setModalAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [totalEncontrados, setTotalEncontrados] = useState(0)
  const [loadingClientes, setLoadingClientes] = useState(false)

  // Confirmação
  const [clienteConfirmar, setClienteConfirmar] = useState<any>(null)
  const [registrando, setRegistrando] = useState(false)
  const [erro, setErro] = useState('')

  // ─── Guarda de acesso (recepção/admin) ───
  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/'); return }
    if ((perfil.role as any) !== 'recepcao' && (perfil.role as any) !== 'admin') { router.push('/'); return }
  }, [loading, perfil])

  // ─── Carregar acessos de hoje ───
  useEffect(() => {
    if (perfil) carregarAcessos()
  }, [perfil])

  async function carregarAcessos() {
    setLoadingAcessos(true)
    const { data } = await supabase.from('acessos_livres_ct')
      .select('*, clientes(nome, cpf)')
      .eq('unidade_id', CT_UNIDADE_ID)
      .eq('data', hoje)
      .is('cancelado_em', null)
      .order('criado_em', { ascending: false })
    setAcessos(data || [])
    setLoadingAcessos(false)
  }

  // ─── Busca de clientes com saldo avulso ───
  useEffect(() => {
    if (busca.trim().length >= 2) buscarClientes()
    else { setClientes([]); setTotalEncontrados(0) }
  }, [busca])

  async function buscarClientes() {
    setLoadingClientes(true)
    const termo = busca.trim()
    const { data: cls } = await supabase.from('clientes').select('id, nome, cpf, email')
      .or(`nome.ilike.%${termo}%,cpf.ilike.%${termo}%`)
      .order('nome').limit(20)

    const lista = cls || []
    setTotalEncontrados(lista.length)

    if (lista.length === 0) { setClientes([]); setLoadingClientes(false); return }

    // Saldo avulso disponível por cliente (usado=false e validade>=hoje)
    const ids = lista.map((c: any) => c.id)
    const { data: creds } = await supabase.from('creditos_avulsos').select('cliente_id')
      .in('cliente_id', ids).eq('usado', false).gte('validade', hoje)

    const saldoPorCliente: Record<string, number> = {}
    for (const cr of (creds || [])) saldoPorCliente[cr.cliente_id] = (saldoPorCliente[cr.cliente_id] || 0) + 1

    const comSaldo = lista
      .map((c: any) => ({ ...c, saldo: saldoPorCliente[c.id] || 0 }))
      .filter((c: any) => c.saldo > 0)

    setClientes(comSaldo)
    setLoadingClientes(false)
  }

  function abrirModal() {
    setModalAberto(true)
    setBusca('')
    setClientes([])
    setTotalEncontrados(0)
    setClienteConfirmar(null)
    setErro('')
  }

  async function confirmarRegistro() {
    if (!clienteConfirmar) return
    setRegistrando(true)
    setErro('')
    const { error } = await supabase.rpc('registrar_acesso_livre_ct', { p_cliente_id: clienteConfirmar.id })
    setRegistrando(false)
    if (error) {
      const msg = error.message || ''
      if (msg.includes('SEM_CREDITO')) setErro(`${clienteConfirmar.nome} está sem saldo avulso disponível.`)
      else if (msg.includes('NAO_AUTORIZADO')) setErro('Você não tem permissão para registrar.')
      else setErro('Erro ao registrar: ' + msg)
      return
    }
    setClienteConfirmar(null)
    setModalAberto(false)
    await carregarAcessos()
  }

  if (loading || !perfil) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const dataExtenso = new Date(hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' })

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <Dumbbell size={18} />
          </div>
          <div>
            <div className="text-base font-semibold text-gray-900">Musculação Livre</div>
            <div className="text-xs text-gray-400 capitalize">{dataExtenso}</div>
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">Just CT</span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5">

        <button onClick={abrirModal}
          className="w-full mb-5 btn gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 py-3 font-semibold shadow-sm">
          <Plus size={16} /> Registrar walk-in
        </button>

        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-900">Entraram hoje</div>
          <span className="text-xs text-gray-400">
            {acessos.length} {acessos.length === 1 ? 'entrada' : 'entradas'}
          </span>
        </div>

        {loadingAcessos ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : acessos.length === 0 ? (
          <div className="card text-center py-12">
            <Dumbbell size={32} className="mx-auto text-gray-200 mb-3" />
            <div className="text-sm text-gray-400">Nenhum walk-in registrado hoje.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {acessos.map(a => (
              <div key={a.id} className="card flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {a.clientes?.nome?.slice(0,2).toUpperCase() || '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{a.clientes?.nome || 'Cliente removido'}</div>
                  {a.clientes?.cpf && <div className="text-xs text-gray-500 font-mono mt-0.5">{a.clientes.cpf}</div>}
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                  <Clock size={12} />
                  {new Date(a.criado_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── MODAL Registrar walk-in (busca) ─── */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-gray-900 flex items-center gap-2">
                  <Dumbbell size={18} className="text-emerald-600" /> Registrar walk-in
                </div>
                <div className="text-xs text-gray-400 mt-0.5">Desconta 1 crédito avulso · Just CT</div>
              </div>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-3 text-gray-400" />
              <input className="input pl-9 w-full" placeholder="Buscar por nome ou CPF..."
                value={busca} onChange={e => setBusca(e.target.value)} autoFocus />
            </div>

            {busca.trim().length < 2 ? (
              <div className="text-center py-10">
                <Search size={28} className="mx-auto text-gray-200 mb-2" />
                <div className="text-sm text-gray-400">Digite ao menos 2 caracteres</div>
              </div>
            ) : loadingClientes ? (
              <div className="flex justify-center py-10">
                <div className="w-7 h-7 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : clientes.length === 0 ? (
              <div className="text-center py-10 text-sm text-gray-400">
                {totalEncontrados > 0
                  ? `${totalEncontrados} cliente(s) encontrado(s), mas nenhum com saldo avulso disponível.`
                  : `Nenhum cliente encontrado para "${busca}".`}
              </div>
            ) : (
              <div className="space-y-2">
                {clientes.map(c => (
                  <button key={c.id} onClick={() => { setClienteConfirmar(c); setErro('') }}
                    className="w-full card flex items-center gap-3 text-left hover:border-emerald-300 transition-all">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-700 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {c.nome?.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{c.nome}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {c.cpf && <span className="font-mono">{c.cpf}</span>}
                        <span className="ml-1 text-emerald-600 font-medium">
                          · {c.saldo} crédito{c.saldo !== 1 ? 's' : ''} avulso{c.saldo !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL Confirmação ─── */}
      {clienteConfirmar && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-gray-900 flex items-center gap-2">
                <Dumbbell size={18} className="text-emerald-600" /> Confirmar walk-in
              </div>
              <button onClick={() => { setClienteConfirmar(null); setErro('') }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                {clienteConfirmar.nome?.slice(0,2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{clienteConfirmar.nome}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {clienteConfirmar.cpf && <span className="font-mono">{clienteConfirmar.cpf}</span>}
                  <span className="ml-1 text-emerald-600 font-medium">
                    · {clienteConfirmar.saldo} crédito{clienteConfirmar.saldo !== 1 ? 's' : ''} disponível{clienteConfirmar.saldo !== 1 ? 'eis' : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-600 mb-4">
              Registrar a entrada de <strong>{clienteConfirmar.nome}</strong> hoje? Isso <strong>desconta 1 crédito avulso</strong>.
            </div>

            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{erro}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setClienteConfirmar(null); setErro('') }} disabled={registrando}
                className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={confirmarRegistro} disabled={registrando}
                className="btn flex-1 gap-1 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                <Check size={14} /> {registrando ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
