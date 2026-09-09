'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Plus, X, Edit2, PackagePlus, Receipt, ArrowUpRight, ArrowDownRight } from 'lucide-react'

type Unidade = { id: string; nome: string; tipo: string }
type Produto = { id: string; nome: string; categoria: string; preco: number; ativo: boolean }
type Saldo   = { produto_id: string; unidade_id: string; saldo: number }
type Movimento = {
  id: string; tipo: string; quantidade: number; motivo: string | null; criado_em: string
  loja_produtos: { nome: string } | null
  perfis: { nome: string } | null
}

const CATEGORIAS = [
  { key: 'bebida', label: 'Bebida' },
  { key: 'comida', label: 'Comida' },
  { key: 'outro',  label: 'Outro'  },
]

const TIPOS_MOVIMENTO = [
  { key: 'entrada', label: 'Entrada',  descricao: 'Chegou mercadoria na unidade',      sinal:  1 },
  { key: 'perda',   label: 'Perda',    descricao: 'Quebrou, venceu ou sumiu',          sinal: -1 },
  { key: 'ajuste',  label: 'Ajuste',   descricao: 'Correção depois de contar o estoque', sinal: 0 },
]

const LABEL_TIPO: Record<string, string> = {
  entrada: 'Entrada', venda: 'Venda', perda: 'Perda', ajuste: 'Ajuste', estorno: 'Estorno',
}

function moeda(v: number) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
}

export default function AdminLojaPage() {
  const supabase = createClient()
  const { perfil } = useAuth()

  const [carregando, setCarregando] = useState(true)
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [saldos, setSaldos]     = useState<Saldo[]>([])
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [unidadeMov, setUnidadeMov] = useState<string>('')
  const [mostrarInativos, setMostrarInativos] = useState(false)

  // Modal de produto
  const [modalProduto, setModalProduto] = useState<Produto | 'novo' | null>(null)
  const [fNome, setFNome] = useState('')
  const [fCategoria, setFCategoria] = useState('bebida')
  const [fPreco, setFPreco] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Modal de movimento de estoque
  const [modalMov, setModalMov] = useState<Produto | null>(null)
  const [mUnidade, setMUnidade] = useState('')
  const [mTipo, setMTipo] = useState('entrada')
  const [mQtd, setMQtd] = useState('')
  const [mSinalAjuste, setMSinalAjuste] = useState(1)
  const [mMotivo, setMMotivo] = useState('')

  useEffect(() => { carregarTudo() }, [])
  useEffect(() => { if (unidadeMov) carregarMovimentos(unidadeMov) }, [unidadeMov])

  async function carregarTudo() {
    const [u, p, s] = await Promise.all([
      supabase.from('unidades').select('id, nome, tipo').eq('ativo', true).order('nome'),
      supabase.from('loja_produtos').select('*').order('categoria').order('nome'),
      supabase.from('loja_estoque_atual').select('*'),
    ])
    const listaUnidades = (u.data || []) as Unidade[]
    setUnidades(listaUnidades)
    setProdutos((p.data || []) as Produto[])
    setSaldos((s.data || []) as Saldo[])
    if (!unidadeMov && listaUnidades.length) setUnidadeMov(listaUnidades[0].id)
    setCarregando(false)
  }

  async function carregarSaldos() {
    const { data } = await supabase.from('loja_estoque_atual').select('*')
    setSaldos((data || []) as Saldo[])
  }

  async function carregarMovimentos(unidadeId: string) {
    const { data } = await supabase
      .from('loja_estoque_movimentos')
      .select('id, tipo, quantidade, motivo, criado_em, loja_produtos(nome), perfis(nome)')
      .eq('unidade_id', unidadeId)
      .order('criado_em', { ascending: false })
      .limit(50)
    setMovimentos((data || []) as any)
  }

  function saldoDe(produtoId: string, unidadeId: string) {
    return saldos.find(s => s.produto_id === produtoId && s.unidade_id === unidadeId)?.saldo ?? 0
  }

  // ---------- produto ----------
  function abrirProduto(p: Produto | 'novo') {
    setErro('')
    setModalProduto(p)
    if (p === 'novo') {
      setFNome(''); setFCategoria('bebida'); setFPreco('')
    } else {
      setFNome(p.nome); setFCategoria(p.categoria); setFPreco(String(p.preco).replace('.', ','))
    }
  }

  async function salvarProduto() {
    const nome = fNome.trim()
    const preco = Number(fPreco.replace(',', '.'))
    if (!nome) { setErro('Informe o nome do produto.'); return }
    if (!Number.isFinite(preco) || preco < 0) { setErro('Informe um preço válido.'); return }

    setSalvando(true); setErro('')
    const payload = { nome, categoria: fCategoria, preco }
    const { error } = modalProduto === 'novo'
      ? await supabase.from('loja_produtos').insert({ ...payload, criado_por: perfil?.id })
      : await supabase.from('loja_produtos').update(payload).eq('id', (modalProduto as Produto).id)
    setSalvando(false)

    if (error) {
      setErro(error.message.includes('loja_produtos_nome_ativo_unico')
        ? 'Já existe um produto ativo com esse nome.'
        : 'Erro ao salvar: ' + error.message)
      return
    }
    setModalProduto(null)
    carregarTudo()
  }

  async function alternarAtivo(p: Produto) {
    await supabase.from('loja_produtos').update({ ativo: !p.ativo }).eq('id', p.id)
    carregarTudo()
  }

  // ---------- estoque ----------
  function abrirMovimento(p: Produto) {
    setErro('')
    setModalMov(p)
    setMUnidade(unidades[0]?.id || '')
    setMTipo('entrada'); setMQtd(''); setMSinalAjuste(1); setMMotivo('')
  }

  async function salvarMovimento() {
    const qtd = parseInt(mQtd, 10)
    if (!mUnidade) { setErro('Escolha a unidade.'); return }
    if (!Number.isFinite(qtd) || qtd < 1) { setErro('Informe uma quantidade a partir de 1.'); return }

    const sinal = mTipo === 'ajuste' ? mSinalAjuste : TIPOS_MOVIMENTO.find(t => t.key === mTipo)!.sinal
    const quantidade = qtd * sinal

    // Estoque não pode ficar negativo: o que saiu tem que existir.
    const saldoAtual = saldoDe(modalMov!.id, mUnidade)
    if (quantidade < 0 && saldoAtual + quantidade < 0) {
      setErro(`Saldo atual é ${saldoAtual}. Não dá para baixar ${qtd}.`)
      return
    }

    setSalvando(true); setErro('')
    const { error } = await supabase.from('loja_estoque_movimentos').insert({
      produto_id: modalMov!.id,
      unidade_id: mUnidade,
      tipo: mTipo,
      quantidade,
      motivo: mMotivo.trim() || null,
      criado_por: perfil?.id,
    })
    setSalvando(false)

    if (error) { setErro('Erro ao lançar: ' + error.message); return }
    setModalMov(null)
    await Promise.all([carregarSaldos(), carregarMovimentos(unidadeMov)])
  }

  if (carregando) return <Spinner />

  const visiveis = mostrarInativos ? produtos : produtos.filter(p => p.ativo)

  return (
    <div>
      <PageHeader
        title="Loja — Produtos e Estoque"
        subtitle="Bebidas e comida vendidas no balcão. Cadastre o produto, lance a entrada em cada unidade e acompanhe o saldo."
      />

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => abrirProduto('novo')}>
            <Plus size={14} /> Novo produto
          </button>
          <Link href="/admin/loja/vendas" className="btn btn-sm">
            <Receipt size={14} /> Vendas da loja
          </Link>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {visiveis.length === 0 ? (
        <div className="card"><EmptyState message="Nenhum produto cadastrado ainda." /></div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="text-left font-medium px-4 py-3">Produto</th>
                <th className="text-right font-medium px-3 py-3">Preço</th>
                {unidades.map(u => (
                  <th key={u.id} className="text-center font-medium px-3 py-3 whitespace-nowrap">{u.nome}</th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map(p => (
                <tr key={p.id} className={`border-b border-gray-50 last:border-0 ${p.ativo ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.nome}</div>
                    <div className="text-xs text-gray-400">
                      {CATEGORIAS.find(c => c.key === p.categoria)?.label || p.categoria}
                      {!p.ativo && ' · inativo'}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-gray-700 whitespace-nowrap">{moeda(p.preco)}</td>
                  {unidades.map(u => {
                    const s = saldoDe(p.id, u.id)
                    return (
                      <td key={u.id} className="px-3 py-3 text-center">
                        <span className={`badge ${s === 0 ? 'badge-red' : s <= 5 ? 'badge-amber' : 'badge-green'}`}>
                          {s}
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn btn-sm" onClick={() => abrirMovimento(p)} title="Lançar entrada, perda ou ajuste">
                        <PackagePlus size={13} /> Estoque
                      </button>
                      <button className="btn btn-sm" onClick={() => abrirProduto(p)} title="Editar produto">
                        <Edit2 size={13} />
                      </button>
                      <button className="btn btn-sm" onClick={() => alternarAtivo(p)}>
                        {p.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- Movimentos recentes ---------- */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900">Movimentos recentes</h2>
          <select className="input w-auto" value={unidadeMov} onChange={e => setUnidadeMov(e.target.value)}>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>

        {movimentos.length === 0 ? (
          <div className="card"><EmptyState message="Nenhum movimento nesta unidade ainda." /></div>
        ) : (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left font-medium px-4 py-3">Quando</th>
                  <th className="text-left font-medium px-3 py-3">Produto</th>
                  <th className="text-left font-medium px-3 py-3">Tipo</th>
                  <th className="text-right font-medium px-3 py-3">Qtd</th>
                  <th className="text-left font-medium px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map(m => (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                      {new Date(m.criado_em).toLocaleDateString('pt-BR')}{' '}
                      {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5 text-gray-900">{m.loja_produtos?.nome || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{LABEL_TIPO[m.tipo] || m.tipo}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium whitespace-nowrap ${m.quantidade > 0 ? 'text-primary-700' : 'text-danger-600'}`}>
                      <span className="inline-flex items-center gap-1">
                        {m.quantidade > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {m.quantidade > 0 ? '+' : ''}{m.quantidade}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {m.motivo || '—'}
                      {m.perfis?.nome && <span className="text-gray-400"> · {m.perfis.nome}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Modal: produto ---------- */}
      {modalProduto && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setModalProduto(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                {modalProduto === 'novo' ? 'Novo produto' : 'Editar produto'}
              </h3>
              <button className="text-gray-400 hover:text-gray-700" onClick={() => setModalProduto(null)}><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Nome</label>
                <input className="input" value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Ex: Água sem gás 500ml" />
              </div>
              <div>
                <label className="label">Categoria</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIAS.map(c => (
                    <button key={c.key} onClick={() => setFCategoria(c.key)}
                      className={`p-2 rounded-lg border text-sm font-medium transition-all ${fCategoria === c.key ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Preço de venda (mesmo em todas as unidades)</label>
                <input className="input" value={fPreco} onChange={e => setFPreco(e.target.value)} placeholder="Ex: 5,00" inputMode="decimal" />
              </div>
            </div>

            {erro && <div className="mt-3 text-sm text-danger-600">{erro}</div>}

            <div className="flex justify-end gap-2 mt-5">
              <button className="btn" onClick={() => setModalProduto(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvarProduto} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal: movimento de estoque ---------- */}
      {modalMov && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setModalMov(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-900">Estoque · {modalMov.nome}</h3>
              <button className="text-gray-400 hover:text-gray-700" onClick={() => setModalMov(null)}><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Saldo hoje: {unidades.map(u => `${u.nome} ${saldoDe(modalMov.id, u.id)}`).join(' · ')}
            </p>

            <div className="space-y-3">
              <div>
                <label className="label">Unidade</label>
                <select className="input" value={mUnidade} onChange={e => setMUnidade(e.target.value)}>
                  {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="label">O que aconteceu</label>
                <div className="space-y-2">
                  {TIPOS_MOVIMENTO.map(t => (
                    <button key={t.key} onClick={() => setMTipo(t.key)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all ${mTipo === t.key ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className={`text-sm font-medium ${mTipo === t.key ? 'text-primary-800' : 'text-gray-700'}`}>{t.label}</div>
                      <div className="text-xs text-gray-500">{t.descricao}</div>
                    </button>
                  ))}
                </div>
              </div>

              {mTipo === 'ajuste' && (
                <div>
                  <label className="label">O ajuste soma ou tira do estoque?</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setMSinalAjuste(1)}
                      className={`p-2 rounded-lg border text-sm font-medium ${mSinalAjuste === 1 ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-gray-200 text-gray-600'}`}>
                      Soma (+)
                    </button>
                    <button onClick={() => setMSinalAjuste(-1)}
                      className={`p-2 rounded-lg border text-sm font-medium ${mSinalAjuste === -1 ? 'border-danger-400 bg-danger-50 text-danger-600' : 'border-gray-200 text-gray-600'}`}>
                      Tira (−)
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="label">Quantidade</label>
                <input className="input" value={mQtd} onChange={e => setMQtd(e.target.value)} placeholder="Ex: 24" inputMode="numeric" />
              </div>

              <div>
                <label className="label">Observação (opcional)</label>
                <input className="input" value={mMotivo} onChange={e => setMMotivo(e.target.value)} placeholder="Ex: compra no atacado" />
              </div>
            </div>

            {erro && <div className="mt-3 text-sm text-danger-600">{erro}</div>}

            <div className="flex justify-end gap-2 mt-5">
              <button className="btn" onClick={() => setModalMov(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvarMovimento} disabled={salvando}>
                {salvando ? 'Lançando...' : 'Lançar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
