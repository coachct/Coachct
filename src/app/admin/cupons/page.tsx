'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Plus, X, Edit2, Ticket, AlertCircle, Check } from 'lucide-react'

const PINK = '#ff2d9b'

type Cupom = {
  id: string
  codigo: string
  descricao: string | null
  desconto_percentual: number
  produtos_ids: string[] | null
  max_usos_total: number | null
  max_usos_por_cliente: number
  valido_de: string | null
  valido_ate: string | null
  ativo: boolean
  criado_em: string
}

const FORM_VAZIO = {
  codigo: '',
  descricao: '',
  desconto_percentual: '',
  todos_produtos: true,
  produtos_ids: [] as string[],
  max_usos_total: '',
  max_usos_por_cliente: '1',
  valido_de: '',
  valido_ate: '',
  ativo: true,
}

function soData(ts: string | null) {
  if (!ts) return ''
  return ts.slice(0, 10) // YYYY-MM-DD
}

export default function AdminCuponsPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [cupons, setCupons] = useState<Cupom[]>([])
  const [produtos, setProdutos] = useState<any[]>([])
  const [usos, setUsos] = useState<Record<string, number>>({})
  const [loadingData, setLoadingData] = useState(true)

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Cupom | null>(null)
  const [form, setForm] = useState({ ...FORM_VAZIO })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!loading && perfil?.role !== 'admin') router.push('/')
  }, [perfil, loading])

  useEffect(() => {
    if (perfil?.role === 'admin') carregar()
  }, [perfil])

  async function carregar() {
    setLoadingData(true)
    const [{ data: prod }, { data: cup }, { data: us }] = await Promise.all([
      supabase.from('produtos').select('id, nome, valor, ativo').eq('ativo', true).order('nome'),
      supabase.from('cupons').select('*').order('ativo', { ascending: false }).order('criado_em', { ascending: false }),
      supabase.from('cupons_usos').select('cupom_id'),
    ])
    setProdutos(prod || [])
    setCupons((cup as Cupom[]) || [])
    const tally: Record<string, number> = {}
    ;(us || []).forEach((u: any) => { tally[u.cupom_id] = (tally[u.cupom_id] || 0) + 1 })
    setUsos(tally)
    setLoadingData(false)
  }

  function abrirNovo() {
    setEditando(null)
    setForm({ ...FORM_VAZIO })
    setErro('')
    setModalAberto(true)
  }

  function abrirEdicao(c: Cupom) {
    setEditando(c)
    setForm({
      codigo: c.codigo,
      descricao: c.descricao || '',
      desconto_percentual: String(c.desconto_percentual),
      todos_produtos: !c.produtos_ids || c.produtos_ids.length === 0,
      produtos_ids: c.produtos_ids || [],
      max_usos_total: c.max_usos_total != null ? String(c.max_usos_total) : '',
      max_usos_por_cliente: String(c.max_usos_por_cliente),
      valido_de: soData(c.valido_de),
      valido_ate: soData(c.valido_ate),
      ativo: c.ativo,
    })
    setErro('')
    setModalAberto(true)
  }

  function toggleProduto(id: string) {
    setForm(f => ({
      ...f,
      produtos_ids: f.produtos_ids.includes(id)
        ? f.produtos_ids.filter(p => p !== id)
        : [...f.produtos_ids, id],
    }))
  }

  async function salvar() {
    setErro('')
    const codigo = form.codigo.trim().toUpperCase()
    if (!codigo) { setErro('Informe o código do cupom.'); return }
    const pct = Number(form.desconto_percentual)
    if (!pct || pct <= 0 || pct > 100) { setErro('Desconto deve ser entre 1 e 100%.'); return }
    if (!form.todos_produtos && form.produtos_ids.length === 0) {
      setErro('Selecione ao menos um produto ou marque "Todos os produtos".'); return
    }
    const maxTotal = form.max_usos_total.trim() === '' ? null : Number(form.max_usos_total)
    if (maxTotal != null && (isNaN(maxTotal) || maxTotal < 1)) { setErro('Máx. usos total inválido.'); return }
    const maxCliente = Number(form.max_usos_por_cliente)
    if (!maxCliente || maxCliente < 1) { setErro('Máx. por cliente deve ser ao menos 1.'); return }
    if (form.valido_de && form.valido_ate && form.valido_ate < form.valido_de) {
      setErro('A data final não pode ser antes da inicial.'); return
    }

    const dados: any = {
      codigo,
      descricao: form.descricao.trim() || null,
      desconto_percentual: pct,
      produtos_ids: form.todos_produtos ? null : form.produtos_ids,
      max_usos_total: maxTotal,
      max_usos_por_cliente: maxCliente,
      valido_de: form.valido_de ? `${form.valido_de}T00:00:00` : null,
      valido_ate: form.valido_ate ? `${form.valido_ate}T23:59:59` : null,
      ativo: form.ativo,
    }

    setSalvando(true)
    let error: any = null
    if (editando) {
      ;({ error } = await supabase.from('cupons').update(dados).eq('id', editando.id))
    } else {
      dados.criado_por = perfil?.id || null
      ;({ error } = await supabase.from('cupons').insert(dados))
    }
    setSalvando(false)

    if (error) {
      setErro(error.code === '23505' ? 'Já existe um cupom com esse código.' : 'Erro ao salvar: ' + error.message)
      return
    }
    setModalAberto(false)
    carregar()
  }

  async function alternarAtivo(c: Cupom) {
    await supabase.from('cupons').update({ ativo: !c.ativo }).eq('id', c.id)
    carregar()
  }

  function nomeProduto(id: string) {
    return produtos.find(p => p.id === id)?.nome || '—'
  }

  if (loading || loadingData) {
    return <div className="p-8 text-gray-500">Carregando…</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Ticket size={22} style={{ color: PINK }} /> Cupons de desconto
          </h1>
          <p className="text-sm text-gray-500 mt-1">Crie e gerencie cupons usados no checkout do cliente.</p>
        </div>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-1 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ background: PINK }}>
          <Plus size={16} /> Novo cupom
        </button>
      </div>

      {cupons.length === 0 ? (
        <div className="card text-center text-gray-500 py-10">Nenhum cupom criado ainda.</div>
      ) : (
        <div className="space-y-3">
          {cupons.map(c => {
            const usados = usos[c.id] || 0
            const todos = !c.produtos_ids || c.produtos_ids.length === 0
            return (
              <div key={c.id} className={`card flex items-start gap-4 ${!c.ativo ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold text-gray-900 tracking-wide">{c.codigo}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white" style={{ background: PINK }}>
                      {Number(c.desconto_percentual)}% OFF
                    </span>
                    {!c.ativo && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Inativo</span>
                    )}
                  </div>
                  {c.descricao && <div className="text-sm text-gray-600 mt-1">{c.descricao}</div>}
                  <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                    <div>Produtos: {todos ? 'Todos' : (c.produtos_ids || []).map(nomeProduto).join(', ')}</div>
                    <div>
                      Usos: {usados}{c.max_usos_total != null ? ` / ${c.max_usos_total}` : ' (ilimitado)'}
                      {' · '}máx. {c.max_usos_por_cliente} por cliente
                    </div>
                    {(c.valido_de || c.valido_ate) && (
                      <div>
                        Validade: {c.valido_de ? soData(c.valido_de).split('-').reverse().join('/') : '—'}
                        {' até '}
                        {c.valido_ate ? soData(c.valido_ate).split('-').reverse().join('/') : '—'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => abrirEdicao(c)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900">
                    <Edit2 size={13} /> Editar
                  </button>
                  <button onClick={() => alternarAtivo(c)} className="text-xs text-gray-500 hover:text-gray-800">
                    {c.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModalAberto(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{editando ? 'Editar cupom' : 'Novo cupom'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Código</label>
                <input
                  value={form.codigo}
                  onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                  placeholder="Ex: VERAO10"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase tracking-wide" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descrição (opcional)</label>
                <input
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Promoção de verão"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Desconto (%)</label>
                <input
                  type="number" min={1} max={100}
                  value={form.desconto_percentual}
                  onChange={e => setForm(f => ({ ...f, desconto_percentual: e.target.value }))}
                  placeholder="Ex: 10"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Produtos</label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                  <input
                    type="checkbox"
                    checked={form.todos_produtos}
                    onChange={e => setForm(f => ({ ...f, todos_produtos: e.target.checked }))} />
                  Todos os produtos
                </label>
                {!form.todos_produtos && (
                  <div className="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                    {produtos.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700 px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={form.produtos_ids.includes(p.id)}
                          onChange={() => toggleProduto(p.id)} />
                        {p.nome}
                      </label>
                    ))}
                    {produtos.length === 0 && <div className="text-xs text-gray-400 px-1">Nenhum produto ativo.</div>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Máx. usos total</label>
                  <input
                    type="number" min={1}
                    value={form.max_usos_total}
                    onChange={e => setForm(f => ({ ...f, max_usos_total: e.target.value }))}
                    placeholder="ilimitado"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Máx. por cliente</label>
                  <input
                    type="number" min={1}
                    value={form.max_usos_por_cliente}
                    onChange={e => setForm(f => ({ ...f, max_usos_por_cliente: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Válido de (opcional)</label>
                  <input
                    type="date"
                    value={form.valido_de}
                    onChange={e => setForm(f => ({ ...f, valido_de: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Válido até (opcional)</label>
                  <input
                    type="date"
                    value={form.valido_ate}
                    onChange={e => setForm(f => ({ ...f, valido_ate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
                Cupom ativo
              </label>

              {erro && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" /> {erro}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={salvar}
                  disabled={salvando}
                  className="flex-1 flex items-center justify-center gap-1 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                  style={{ background: PINK }}>
                  <Check size={16} /> {salvando ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  onClick={() => setModalAberto(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
