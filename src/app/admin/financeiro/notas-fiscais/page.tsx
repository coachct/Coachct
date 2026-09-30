'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { FileText, RefreshCw, Send, XCircle, AlertTriangle, CheckCircle, Clock, Ban, X } from 'lucide-react'

// Emissão MANUAL de NFS-e (NFE.io) das vendas de balcão. Só admin.
// A lista vem da RPC notas_fiscais_vendas, que já tira venda do site, multa no
// cartão salvo (ambas com nota pelo Pagar.me) e cortesia.

type Linha = {
  venda_id: string
  vendido_em: string
  unidade_id: string | null
  unidade_nome: string | null
  cliente_id: string | null
  cliente_nome: string | null
  cpf_mascarado: string | null
  tem_cpf: boolean
  tem_email: boolean
  produto_id: string | null
  produto_nome: string | null
  valor: number
  forma_pagamento: string | null
  nota_id: string | null
  nota_status: string | null
  nota_ambiente: string | null
  numero_nota: string | null
  pdf_url: string | null
  mensagem_erro: string | null
}

type Config = { ativo: boolean; ambiente: string; chave_configurada: boolean }

const LOTE = 5

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function inicioMesISO(deslocMes = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + deslocMes)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function fimMesISO(deslocMes = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + deslocMes + 1); d.setDate(0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatarValor(v: number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatarData(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function labelForma(f: string | null) {
  const v = (f || '').toLowerCase()
  if (v.includes('debito')) return 'Débito'
  if (v.includes('credito')) return 'Crédito'
  if (v === 'pix') return 'PIX'
  if (v.includes('dinheiro')) return 'Dinheiro'
  return f || '—'
}

function badgeNota(s: string | null) {
  if (!s) return { label: 'Sem nota', icon: FileText, cls: 'text-gray-500 bg-gray-50 border-gray-200' }
  if (s === 'enviando') return { label: 'Enviando', icon: Clock, cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
  if (s === 'emitida') return { label: 'Emitida', icon: CheckCircle, cls: 'text-green-700 bg-green-50 border-green-200' }
  if (s === 'erro') return { label: 'Erro', icon: XCircle, cls: 'text-red-700 bg-red-50 border-red-200' }
  if (s === 'cancelando') return { label: 'Cancelando', icon: Clock, cls: 'text-orange-700 bg-orange-50 border-orange-200' }
  if (s === 'cancelada') return { label: 'Cancelada', icon: Ban, cls: 'text-gray-600 bg-gray-100 border-gray-300' }
  return { label: s, icon: FileText, cls: 'text-gray-500 bg-gray-50 border-gray-200' }
}

// Pode ir pra emissão: cadastro ok e nenhuma nota viva (sem nota, cancelada ou erro)
function selecionavel(l: Linha) {
  if (!l.tem_cpf || !l.tem_email) return false
  return !l.nota_status || l.nota_status === 'cancelada' || l.nota_status === 'erro'
}

export default function NotasFiscaisPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')

  const [periodo, setPeriodo] = useState<'mes_atual' | 'mes_anterior' | 'custom'>('mes_atual')
  const [dataInicio, setDataInicio] = useState(inicioMesISO())
  const [dataFim, setDataFim] = useState(hojeISO())
  const [filtroUnidade, setFiltroUnidade] = useState('todas')
  const [filtroForma, setFiltroForma] = useState('todas')
  const [filtroProduto, setFiltroProduto] = useState('todos')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [modalEmitir, setModalEmitir] = useState(false)
  const [emitindo, setEmitindo] = useState(false)
  const [progresso, setProgresso] = useState({ feitas: 0, total: 0 })
  const [falhas, setFalhas] = useState<{ nome: string; motivo: string }[]>([])
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') router.push('/')
  }, [perfil, loading])

  useEffect(() => {
    if (perfil?.role !== 'admin') return
    supabase.from('unidades').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setUnidades(data || []))
    chamarApi('/api/admin/nfeio/sincronizar', 'GET').then(r => { if (r.ok) setConfig(r.json) })
  }, [perfil])

  useEffect(() => {
    if (periodo === 'mes_atual') { setDataInicio(inicioMesISO()); setDataFim(hojeISO()) }
    if (periodo === 'mes_anterior') { setDataInicio(inicioMesISO(-1)); setDataFim(fimMesISO(-1)) }
  }, [periodo])

  useEffect(() => {
    if (perfil?.role === 'admin' && dataInicio && dataFim) carregar()
  }, [perfil, dataInicio, dataFim, filtroUnidade])

  async function token() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  async function chamarApi(url: string, metodo: 'GET' | 'POST', corpo?: any): Promise<{ ok: boolean; json: any }> {
    try {
      const resp = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: corpo ? JSON.stringify(corpo) : undefined,
      })
      const json = await resp.json().catch(() => ({}))
      return { ok: resp.ok, json }
    } catch (e: any) {
      return { ok: false, json: { error: e?.message || 'Falha de rede' } }
    }
  }

  async function carregar(sincronizarPendentes = true) {
    setCarregando(true); setErroCarga('')
    const { data, error } = await supabase.rpc('notas_fiscais_vendas', {
      p_inicio: dataInicio, p_fim: dataFim,
      p_unidade: filtroUnidade === 'todas' ? null : filtroUnidade,
    })
    if (error) { setErroCarga(error.message); setCarregando(false); return }
    const lista = (data || []) as Linha[]
    setLinhas(lista)
    setSelecionadas(prev => new Set([...prev].filter(id => lista.some(l => l.venda_id === id && selecionavel(l)))))
    setCarregando(false)

    // Notas em andamento: pergunta à NFE.io uma vez e recarrega
    const pendentes = lista.filter(l => l.nota_id && (l.nota_status === 'enviando' || l.nota_status === 'cancelando')).map(l => l.nota_id)
    if (sincronizarPendentes && pendentes.length) {
      await chamarApi('/api/admin/nfeio/sincronizar', 'POST', { nota_ids: pendentes })
      carregar(false)
    }
  }

  async function atualizarStatus() {
    setSincronizando(true)
    await chamarApi('/api/admin/nfeio/sincronizar', 'POST', {})
    setSincronizando(false)
    carregar(false)
  }

  const produtos = useMemo(
    () => [...new Set(linhas.map(l => l.produto_nome).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas]
  )
  const formas = useMemo(() => [...new Set(linhas.map(l => l.forma_pagamento).filter(Boolean) as string[])].sort(), [linhas])

  const filtradas = useMemo(() => {
    const busca = filtroCliente.trim().toLowerCase()
    return linhas.filter(l =>
      (filtroForma === 'todas' || l.forma_pagamento === filtroForma) &&
      (filtroProduto === 'todos' || l.produto_nome === filtroProduto) &&
      (!busca || (l.cliente_nome || '').toLowerCase().includes(busca)) &&
      (filtroStatus === 'todos' || (filtroStatus === 'sem_nota' ? !l.nota_status : l.nota_status === filtroStatus))
    )
  }, [linhas, filtroForma, filtroProduto, filtroCliente, filtroStatus])

  const selecionaveisFiltro = filtradas.filter(selecionavel)
  const todasFiltroMarcadas = selecionaveisFiltro.length > 0 && selecionaveisFiltro.every(l => selecionadas.has(l.venda_id))
  const escolhidas = linhas.filter(l => selecionadas.has(l.venda_id))
  const totalEscolhido = escolhidas.reduce((s, l) => s + Number(l.valor), 0)

  const resumo = {
    sem_nota: filtradas.filter(l => !l.nota_status).length,
    emitidas: filtradas.filter(l => l.nota_status === 'emitida').length,
    erro: filtradas.filter(l => l.nota_status === 'erro').length,
    cadastro: filtradas.filter(l => !l.tem_cpf || !l.tem_email).length,
  }

  function alternar(id: string) {
    setSelecionadas(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function alternarTodasFiltro() {
    setSelecionadas(prev => {
      const n = new Set(prev)
      if (todasFiltroMarcadas) selecionaveisFiltro.forEach(l => n.delete(l.venda_id))
      else selecionaveisFiltro.forEach(l => n.add(l.venda_id))
      return n
    })
  }

  async function emitir(ids: string[]) {
    setEmitindo(true); setFalhas([]); setProgresso({ feitas: 0, total: ids.length })
    const nomes = new Map(linhas.map(l => [l.venda_id, l.cliente_nome || '—']))
    const erros: { nome: string; motivo: string }[] = []
    for (let i = 0; i < ids.length; i += LOTE) {
      const lote = ids.slice(i, i + LOTE)
      const r = await chamarApi('/api/admin/nfeio/emitir', 'POST', { venda_ids: lote })
      if (!r.ok) {
        lote.forEach(id => erros.push({ nome: nomes.get(id) || id, motivo: r.json?.error || 'Falha' }))
        if (r.json?.error?.includes('NFEIO_ATIVO')) break
      } else {
        for (const res of r.json?.resultados || [])
          if (!res.ok) erros.push({ nome: nomes.get(res.venda_id) || res.venda_id, motivo: res.motivo || res.status || 'Falha' })
      }
      setProgresso({ feitas: Math.min(i + LOTE, ids.length), total: ids.length })
    }
    setFalhas(erros)
    setEmitindo(false)
    setSelecionadas(new Set())
    carregar()
  }

  async function reenviar(l: Linha) {
    setOcupado(l.venda_id)
    const r = await chamarApi('/api/admin/nfeio/emitir', 'POST', { venda_ids: [l.venda_id] })
    const res = r.json?.resultados?.[0]
    if (!r.ok || (res && !res.ok)) alert('Não foi possível reenviar: ' + (r.json?.error || res?.motivo || 'falha'))
    setOcupado(null)
    carregar()
  }

  async function cancelar(l: Linha) {
    if (!l.nota_id) return
    if (!confirm(`Cancelar a nota nº ${l.numero_nota || '—'} de ${l.cliente_nome} (${formatarValor(l.valor)})?\n\nO cancelamento vai para a prefeitura e não pode ser desfeito.`)) return
    setOcupado(l.venda_id)
    const r = await chamarApi('/api/admin/nfeio/cancelar', 'POST', { nota_id: l.nota_id })
    if (!r.ok) alert('Não foi possível cancelar: ' + (r.json?.error || 'falha'))
    setOcupado(null)
    carregar()
  }

  async function abrirPdf(l: Linha) {
    if (!l.nota_id) return
    setOcupado(l.venda_id)
    const janela = window.open('', '_blank')
    try {
      const resp = await fetch(`/api/admin/nfeio/pdf?nota_id=${l.nota_id}`, { headers: { Authorization: `Bearer ${await token()}` } })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        janela?.close(); alert('PDF indisponível: ' + (j?.error || resp.status))
      } else {
        const url = URL.createObjectURL(await resp.blob())
        if (janela) janela.location.href = url; else window.open(url, '_blank')
      }
    } catch {
      janela?.close(); alert('Falha ao baixar o PDF.')
    }
    setOcupado(null)
  }

  if (loading || perfil?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const botaoFiltro = (ativo: boolean) => `btn btn-sm ${ativo ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-500'}`

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Notas Fiscais</h1>
            <p className="text-xs text-gray-400 mt-0.5">Emissão manual de NFS-e das vendas de balcão (NFE.io). Vendas do site e multas já recebem nota pelo Pagar.me.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={atualizarStatus} disabled={sincronizando}
              className="btn border border-gray-200 text-gray-600 gap-1.5 text-sm">
              <RefreshCw size={14} className={sincronizando ? 'animate-spin' : ''}/> Atualizar status
            </button>
            <button onClick={() => { setFalhas([]); setProgresso({ feitas: 0, total: 0 }); setModalEmitir(true) }} disabled={!selecionadas.size || emitindo || !config?.ativo}
              className="btn bg-emerald-600 text-white hover:bg-emerald-700 gap-1.5 text-sm disabled:opacity-40">
              <Send size={14}/> Emitir notas selecionadas{selecionadas.size ? ` (${selecionadas.size})` : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-0 md:px-6 py-5">
        {config && !config.ativo && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
            <span>
              Emissão desligada: a tela lista e consulta, mas não envia nada para a NFE.io.
              {!config.chave_configurada && ' A chave NFEIO_API_KEY também não está configurada.'}
            </span>
          </div>
        )}

        {/* Resumo */}
        <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-4">
          <div className="card text-center"><div className="text-2xl font-bold text-gray-800">{resumo.sem_nota}</div><div className="text-xs text-gray-400 mt-1">Sem nota</div></div>
          <div className="card text-center"><div className="text-2xl font-bold text-green-600">{resumo.emitidas}</div><div className="text-xs text-gray-400 mt-1">Emitidas</div></div>
          <div className="card text-center"><div className="text-2xl font-bold text-red-500">{resumo.erro}</div><div className="text-xs text-gray-400 mt-1">Com erro</div></div>
          <div className="card text-center"><div className="text-2xl font-bold text-amber-500">{resumo.cadastro}</div><div className="text-xs text-gray-400 mt-1">Corrigir cadastro</div></div>
        </div>

        {/* Filtros */}
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-1">Período</div>
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={() => setPeriodo('mes_atual')} className={botaoFiltro(periodo === 'mes_atual')}>Mês atual</button>
            <button onClick={() => setPeriodo('mes_anterior')} className={botaoFiltro(periodo === 'mes_anterior')}>Mês anterior</button>
            <button onClick={() => setPeriodo('custom')} className={botaoFiltro(periodo === 'custom')}>Personalizado</button>
            {periodo === 'custom' && (
              <>
                <input type="date" className="input text-sm" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
                <span className="text-xs text-gray-400">até</span>
                <input type="date" className="input text-sm" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              </>
            )}
          </div>
        </div>

        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-1">Unidade</div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFiltroUnidade('todas')} className={botaoFiltro(filtroUnidade === 'todas')}>Todas</button>
            {unidades.map(u => (
              <button key={u.id} onClick={() => setFiltroUnidade(u.id)} className={botaoFiltro(filtroUnidade === u.id)}>{u.nome}</button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-1">Status da nota</div>
          <div className="flex gap-2 flex-wrap">
            {[
              { k: 'todos', l: 'Todos' }, { k: 'sem_nota', l: 'Sem nota' }, { k: 'enviando', l: 'Enviando' },
              { k: 'emitida', l: 'Emitida' }, { k: 'erro', l: 'Erro' }, { k: 'cancelada', l: 'Cancelada' },
            ].map(s => (
              <button key={s.k} onClick={() => setFiltroStatus(s.k)}
                className={`btn btn-sm ${filtroStatus === s.k ? 'bg-gray-800 text-white' : 'border border-gray-200 text-gray-500'}`}>{s.l}</button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select className="input text-sm" value={filtroForma} onChange={e => setFiltroForma(e.target.value)}>
            <option value="todas">Todas as formas de pagamento</option>
            {formas.map(f => <option key={f} value={f}>{labelForma(f)}</option>)}
          </select>
          <select className="input text-sm" value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)}>
            <option value="todos">Todos os produtos</option>
            {produtos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className="input text-sm" placeholder="Buscar cliente" value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} />
        </div>

        {falhas.length > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <div className="font-medium mb-1">{falhas.length} venda(s) não foram emitidas:</div>
            <ul className="list-disc ml-5 space-y-0.5">
              {falhas.map((f, i) => <li key={i}>{f.nome}: {f.motivo}</li>)}
            </ul>
          </div>
        )}

        {erroCarga && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">Erro ao carregar: {erroCarga}</div>}

        {/* Lista */}
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="p-2 w-8">
                  <input type="checkbox" checked={todasFiltroMarcadas} disabled={!selecionaveisFiltro.length}
                    onChange={alternarTodasFiltro} title="Selecionar todas do filtro" />
                </th>
                <th className="p-2 text-left">Data</th>
                <th className="p-2 text-left">Unidade</th>
                <th className="p-2 text-left">Cliente</th>
                <th className="p-2 text-left">Produto</th>
                <th className="p-2 text-right">Valor</th>
                <th className="p-2 text-left">Pagto</th>
                <th className="p-2 text-left">Nota</th>
                <th className="p-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td colSpan={9} className="p-6 text-center text-gray-400">Carregando...</td></tr>
              )}
              {!carregando && filtradas.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-gray-400">Nenhuma venda de balcão neste filtro.</td></tr>
              )}
              {!carregando && filtradas.map(l => {
                const b = badgeNota(l.nota_status)
                const Icone = b.icon
                const cadastroRuim = !l.tem_cpf || !l.tem_email
                const podeMarcar = selecionavel(l)
                return (
                  <tr key={l.venda_id} className="border-t border-gray-100 align-top">
                    <td className="p-2 text-center">
                      <input type="checkbox" disabled={!podeMarcar || emitindo}
                        checked={selecionadas.has(l.venda_id)} onChange={() => alternar(l.venda_id)} />
                    </td>
                    <td className="p-2 whitespace-nowrap text-gray-600">{formatarData(l.vendido_em)}</td>
                    <td className="p-2 text-gray-600">{l.unidade_nome || '—'}</td>
                    <td className="p-2">
                      <div className="text-gray-900">{l.cliente_nome || '—'}</div>
                      <div className="text-xs text-gray-400">{l.cpf_mascarado || 'sem CPF'}</div>
                      {cadastroRuim && (
                        <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                          <AlertTriangle size={11}/> corrigir cadastro ({[!l.tem_cpf && 'CPF', !l.tem_email && 'e-mail'].filter(Boolean).join(' e ')})
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-gray-600">{l.produto_nome || '—'}</td>
                    <td className="p-2 text-right whitespace-nowrap font-medium">{formatarValor(l.valor)}</td>
                    <td className="p-2 text-gray-600">{labelForma(l.forma_pagamento)}</td>
                    <td className="p-2">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${b.cls}`}>
                        <Icone size={11}/> {b.label}
                      </span>
                      {l.numero_nota && <div className="text-xs text-gray-500 mt-0.5">nº {l.numero_nota}</div>}
                      {l.nota_ambiente === 'teste' && <div className="text-[10px] text-gray-400">teste</div>}
                      {l.mensagem_erro && <div className="text-xs text-red-600 mt-0.5 max-w-[220px]">{l.mensagem_erro}</div>}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <div className="flex gap-1 justify-end">
                        {l.nota_id && ['emitida', 'cancelando', 'cancelada'].includes(l.nota_status || '') && (
                          <button onClick={() => abrirPdf(l)} disabled={ocupado === l.venda_id}
                            className="btn btn-sm border border-gray-200 text-gray-600">PDF</button>
                        )}
                        {l.nota_status === 'erro' && !cadastroRuim && (
                          <button onClick={() => reenviar(l)} disabled={ocupado === l.venda_id || !config?.ativo}
                            className="btn btn-sm border border-blue-200 text-blue-700">Reenviar</button>
                        )}
                        {l.nota_status === 'emitida' && (
                          <button onClick={() => cancelar(l)} disabled={ocupado === l.venda_id || !config?.ativo}
                            className="btn btn-sm border border-red-200 text-red-600">Cancelar nota</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmação / progresso da emissão */}
      {modalEmitir && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !emitindo && setModalEmitir(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Send size={18} className="text-emerald-600"/> Emitir notas</h2>
              {!emitindo && <button onClick={() => setModalEmitir(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>}
            </div>
            {!emitindo && progresso.total === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-700">
                  Você vai emitir <b>{escolhidas.length} {escolhidas.length === 1 ? 'nota' : 'notas'}</b>, total <b>{formatarValor(totalEscolhido)}</b>. Confirmar?
                </p>
                {config?.ambiente === 'producao' && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Notas reais: vão para a prefeitura e o cliente recebe por e-mail.</p>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setModalEmitir(false)} className="btn flex-1 border border-gray-200 text-gray-500">Voltar</button>
                  <button onClick={() => emitir(escolhidas.map(l => l.venda_id))} className="btn flex-1 bg-emerald-600 text-white hover:bg-emerald-700">Confirmar</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-700">
                  {emitindo ? 'Enviando' : 'Enviadas'} {progresso.feitas} de {progresso.total}...
                </p>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progresso.total ? (progresso.feitas / progresso.total) * 100 : 0}%` }} />
                </div>
                {!emitindo && (
                  <>
                    <p className="text-xs text-gray-500">
                      {falhas.length ? `${falhas.length} com problema (lista na tela).` : 'Tudo enviado.'} A prefeitura confirma em alguns minutos: use "Atualizar status".
                    </p>
                    <button onClick={() => { setModalEmitir(false); setProgresso({ feitas: 0, total: 0 }) }} className="btn w-full border border-gray-200 text-gray-600">Fechar</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
