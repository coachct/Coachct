'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  Users,
  CalendarPlus,
  Plus,
  Pencil,
  Power,
  ListPlus,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

const supabase = createClient()

type Categoria = { id: string; nome: string; grupo: string }
type Unidade = { id: string; nome: string }

type Funcionario = {
  id: string
  nome: string
  unidade_id: string | null
  cargo: string | null
  salario: number
  vale_transporte: number
  vale_alimentacao: number
  jornada_inicio: string | null
  jornada_fim: string | null
  dias_semana: number[] | null
  dia_pagamento: number
  data_admissao: string | null
  ativo: boolean
}

type Apontamento = {
  id: string
  funcionario_id: string
  competencia: string
  descricao: string
  valor: number
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const DIAS = [
  { n: 1, label: 'Seg' },
  { n: 2, label: 'Ter' },
  { n: 3, label: 'Qua' },
  { n: 4, label: 'Qui' },
  { n: 5, label: 'Sex' },
  { n: 6, label: 'Sáb' },
  { n: 7, label: 'Dom' },
]

function competenciaStr(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`
}

// Vencimento da folha: dia 05 do mês SEGUINTE ao mês trabalhado (mes 1-based)
function vencFolhaStr(ano: number, mes: number): string {
  let vMes = mes + 1
  let vAno = ano
  if (vMes > 12) { vMes = 1; vAno = ano + 1 }
  return `${vAno}-${String(vMes).padStart(2, '0')}-05`
}

function fmtData(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

function fmtBRL(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseValor(s: string): number {
  if (!s) return 0
  let t = s.trim()
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}

function valorStr(v: number): string {
  if (!v) return ''
  return String(v).replace('.', ',')
}

export default function FuncionariosPage() {
  const { user, loading: authLoading } = useAuth()

  const agora = new Date()
  const anoAtual = agora.getFullYear()
  const mesAtual = agora.getMonth() + 1
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1]

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])

  // ---- competência da folha (padrão: mês anterior = mês trabalhado) ----
  const [gMes, setGMes] = useState(mesAtual === 1 ? 12 : mesAtual - 1)
  const [gAno, setGAno] = useState(mesAtual === 1 ? anoAtual - 1 : anoAtual)
  const [gGerando, setGGerando] = useState(false)
  const [gMsg, setGMsg] = useState<string | null>(null)
  const [gErro, setGErro] = useState(false)

  // apontamentos da competência selecionada, agrupados por funcionário
  const [apontPorFunc, setApontPorFunc] = useState<Record<string, Apontamento[]>>({})

  // ---- modal cadastro ----
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Funcionario | null>(null)
  const [mNome, setMNome] = useState('')
  const [mCargo, setMCargo] = useState('')
  const [mUnidade, setMUnidade] = useState<string>('geral')
  const [mSalario, setMSalario] = useState('')
  const [mVT, setMVT] = useState('')
  const [mVA, setMVA] = useState('')
  const [mInicio, setMInicio] = useState('')
  const [mFim, setMFim] = useState('')
  const [mDias, setMDias] = useState<number[]>([])
  const [mDiaPag, setMDiaPag] = useState('5')
  const [mAdmissao, setMAdmissao] = useState('')
  const [mSalvando, setMSalvando] = useState(false)
  const [mErro, setMErro] = useState<string | null>(null)

  // ---- modal apontamentos ----
  const [apFunc, setApFunc] = useState<Funcionario | null>(null)
  const [apDescricao, setApDescricao] = useState('')
  const [apValor, setApValor] = useState('')
  const [apSinal, setApSinal] = useState<'+' | '-'>('+')
  const [apSalvando, setApSalvando] = useState(false)
  const [apErro, setApErro] = useState<string | null>(null)

  // ---- modal revisão (quando há apontamentos) ----
  const [revisaoAberta, setRevisaoAberta] = useState(false)
  const [revisao, setRevisao] = useState<Record<string, { salario: string; vt: string; va: string }>>({})

  async function carregar() {
    setCarregando(true)
    setErro(null)
    const [resFunc, resCat, resUni] = await Promise.all([
      supabase.from('funcionarios').select('*')
        .order('ativo', { ascending: false })
        .order('nome', { ascending: true }),
      supabase.from('categorias_despesa').select('id, nome, grupo')
        .eq('ativo', true).order('ordem', { ascending: true }),
      supabase.from('unidades').select('id, nome').order('nome', { ascending: true }),
    ])
    if (resFunc.error) {
      setErro('Não foi possível carregar os funcionários.')
      setCarregando(false)
      return
    }
    setFuncionarios((resFunc.data as Funcionario[]) || [])
    setCategorias((resCat.data as Categoria[]) || [])
    setUnidades((resUni.data as Unidade[]) || [])
    setCarregando(false)
  }

  async function carregarApontamentos() {
    const comp = competenciaStr(gAno, gMes)
    const { data } = await supabase.from('folha_apontamentos').select('*').eq('competencia', comp)
    const mapa: Record<string, Apontamento[]> = {}
    for (const a of ((data as Apontamento[]) || [])) {
      if (!mapa[a.funcionario_id]) mapa[a.funcionario_id] = []
      mapa[a.funcionario_id].push(a)
    }
    setApontPorFunc(mapa)
  }

  useEffect(() => {
    if (!authLoading) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  useEffect(() => {
    if (!authLoading) carregarApontamentos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, gMes, gAno])

  const unidadePorId = useMemo(() => {
    const mapa = new Map<string, string>()
    unidades.forEach((u) => mapa.set(u.id, u.nome))
    return mapa
  }, [unidades])

  function nomeUnidade(id: string | null): string {
    if (!id) return 'Geral'
    return unidadePorId.get(id) || '—'
  }

  function categoriaId(nome: string): string | null {
    return categorias.find((c) => c.nome.toLowerCase() === nome.toLowerCase())?.id || null
  }

  function somaApont(funcId: string): number {
    return (apontPorFunc[funcId] || []).reduce((s, a) => s + Number(a.valor), 0)
  }

  const ativos = useMemo(() => funcionarios.filter((f) => f.ativo), [funcionarios])
  const ativosCount = ativos.length

  // ---------------- Cadastro ----------------
  function abrirNovo() {
    setEditando(null)
    setMNome(''); setMCargo(''); setMUnidade('geral')
    setMSalario(''); setMVT(''); setMVA('')
    setMInicio(''); setMFim(''); setMDias([]); setMDiaPag('5'); setMAdmissao('')
    setMErro(null); setModalAberto(true)
  }

  function abrirEdicao(f: Funcionario) {
    setEditando(f)
    setMNome(f.nome || '')
    setMCargo(f.cargo || '')
    setMUnidade(f.unidade_id === null ? 'geral' : f.unidade_id)
    setMSalario(valorStr(Number(f.salario)))
    setMVT(valorStr(Number(f.vale_transporte)))
    setMVA(valorStr(Number(f.vale_alimentacao)))
    setMInicio(f.jornada_inicio ? f.jornada_inicio.slice(0, 5) : '')
    setMFim(f.jornada_fim ? f.jornada_fim.slice(0, 5) : '')
    setMDias(f.dias_semana || [])
    setMDiaPag(String(f.dia_pagamento || 5))
    setMAdmissao(f.data_admissao || '')
    setMErro(null); setModalAberto(true)
  }

  function toggleDia(n: number) {
    setMDias((prev) => prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n].sort((a, b) => a - b))
  }

  async function salvarFuncionario() {
    if (!mNome.trim()) { setMErro('Informe o nome do funcionário.'); return }
    const diaPag = parseInt(mDiaPag, 10)
    if (isNaN(diaPag) || diaPag < 1 || diaPag > 28) { setMErro('Dia de pagamento deve estar entre 1 e 28.'); return }
    setMSalvando(true); setMErro(null)
    const payload: any = {
      nome: mNome.trim(),
      cargo: mCargo.trim() || null,
      unidade_id: mUnidade === 'geral' ? null : mUnidade,
      salario: parseValor(mSalario),
      vale_transporte: parseValor(mVT),
      vale_alimentacao: parseValor(mVA),
      jornada_inicio: mInicio || null,
      jornada_fim: mFim || null,
      dias_semana: mDias,
      dia_pagamento: diaPag,
      data_admissao: mAdmissao || null,
    }
    let res
    if (editando) {
      res = await supabase.from('funcionarios').update(payload).eq('id', editando.id)
    } else {
      res = await supabase.from('funcionarios').insert({ ...payload, ativo: true, criado_por: user?.id ?? null })
    }
    if (res.error) { setMErro('Erro ao salvar. Tente novamente.'); setMSalvando(false); return }
    setMSalvando(false); setModalAberto(false)
    await carregar()
  }

  async function toggleAtivo(f: Funcionario) {
    await supabase.from('funcionarios').update({ ativo: !f.ativo }).eq('id', f.id)
    await carregar()
  }

  // ---------------- Apontamentos ----------------
  function abrirApont(f: Funcionario) {
    setApFunc(f); setApDescricao(''); setApValor(''); setApSinal('+'); setApErro(null)
  }

  async function salvarApont() {
    if (!apFunc) return
    if (!apDescricao.trim()) { setApErro('Informe a descrição.'); return }
    const v = parseValor(apValor)
    if (v <= 0) { setApErro('Informe um valor maior que zero.'); return }
    setApSalvando(true); setApErro(null)
    const { error } = await supabase.from('folha_apontamentos').insert({
      funcionario_id: apFunc.id,
      competencia: competenciaStr(gAno, gMes),
      descricao: apDescricao.trim(),
      valor: apSinal === '-' ? -v : v,
      criado_por: user?.id ?? null,
    })
    if (error) { setApErro('Erro ao salvar apontamento.'); setApSalvando(false); return }
    setApDescricao(''); setApValor(''); setApSinal('+'); setApSalvando(false)
    await carregarApontamentos()
  }

  async function removerApont(id: string) {
    await supabase.from('folha_apontamentos').delete().eq('id', id)
    await carregarApontamentos()
  }

  // ---------------- Gerar folha ----------------
  function onGerarFolha() {
    setGMsg(null); setGErro(false)
    if (ativosCount === 0) { setGErro(true); setGMsg('Nenhum funcionário ativo.'); return }
    const temApont = ativos.some((f) => (apontPorFunc[f.id] || []).length > 0)
    if (temApont) {
      const init: Record<string, { salario: string; vt: string; va: string }> = {}
      for (const f of ativos) {
        init[f.id] = {
          salario: valorStr(Number(f.salario)),
          vt: valorStr(Number(f.vale_transporte)),
          va: valorStr(Number(f.vale_alimentacao)),
        }
      }
      setRevisao(init)
      setRevisaoAberta(true)
    } else {
      gerarFolha(null)
    }
  }

  async function gerarFolha(overrides: Record<string, { salario: string; vt: string; va: string }> | null) {
    setGGerando(true); setGMsg(null); setGErro(false)

    const compFirst = competenciaStr(gAno, gMes)
    const venc = vencFolhaStr(gAno, gMes)
    const catSal = categoriaId('Salário')
    const catVT = categoriaId('Vale Transporte')
    const catVA = categoriaId('Vale Alimentação')

    if (!catSal || !catVT || !catVA) {
      setGErro(true); setGMsg('Categorias da folha não encontradas. Recarregue a página.'); setGGerando(false); return
    }

    const ativIds = ativos.map((f) => f.id)
    const { data: existentes, error: errExist } = await supabase
      .from('despesas')
      .select('funcionario_id')
      .eq('competencia', compFirst)
      .eq('origem', 'folha')
      .is('excluido_em', null)
      .in('funcionario_id', ativIds)

    if (errExist) {
      setGErro(true); setGMsg('Erro ao verificar folha já gerada.'); setGGerando(false); return
    }
    const jaGerados = new Set((existentes || []).map((r: any) => r.funcionario_id))
    const aGerar = ativos.filter((f) => !jaGerados.has(f.id))

    if (aGerar.length === 0) {
      setGGerando(false)
      setGMsg(`Nada novo: a folha desta competência já tinha sido gerada para todos os ${ativos.length} funcionários.`)
      return
    }

    const linhas: any[] = []
    for (const f of aGerar) {
      const ov = overrides?.[f.id]
      const salBase = ov ? parseValor(ov.salario) : Number(f.salario)
      const vt = ov ? parseValor(ov.vt) : Number(f.vale_transporte)
      const va = ov ? parseValor(ov.va) : Number(f.vale_alimentacao)
      const salFinal = salBase + somaApont(f.id) // apontamentos (+/−) entram na linha de salário

      const base = {
        unidade_id: f.unidade_id,
        competencia: compFirst,
        vencimento: venc,
        pago: false,
        origem: 'folha',
        funcionario_id: f.id,
        criado_por: user?.id ?? null,
      }
      if (salFinal !== 0)
        linhas.push({ ...base, categoria_id: catSal, descricao: `Salário — ${f.nome}`, valor: salFinal })
      if (vt > 0)
        linhas.push({ ...base, categoria_id: catVT, descricao: `Vale Transporte — ${f.nome}`, valor: vt })
      if (va > 0)
        linhas.push({ ...base, categoria_id: catVA, descricao: `Vale Alimentação — ${f.nome}`, valor: va })
    }

    if (linhas.length === 0) {
      setGGerando(false); setGMsg('Nada a gerar (valores zerados).'); return
    }

    const { error: errIns } = await supabase.from('despesas').insert(linhas)
    if (errIns) {
      setGErro(true); setGMsg('Erro ao gerar a folha. Tente novamente.'); setGGerando(false); return
    }

    setGGerando(false)
    setRevisaoAberta(false)
    setGMsg(`Folha gerada: ${aGerar.length} funcionário(s), ${linhas.length} lançamento(s) no Contas a Pagar com vencimento em ${fmtData(venc)}.`)
  }

  // total devido por funcionário (base + apontamentos), pra facilitar o lançamento no banco
  function totalFunc(f: Funcionario): number {
    return Number(f.salario) + Number(f.vale_transporte) + Number(f.vale_alimentacao) + somaApont(f.id)
  }

  function totalRevisao(f: Funcionario): number {
    const ov = revisao[f.id]
    if (!ov) return totalFunc(f)
    return parseValor(ov.salario) + parseValor(ov.vt) + parseValor(ov.va) + somaApont(f.id)
  }

  const inputCls =
    'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-500'

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d9b]/10 text-[#ff2d9b]">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Funcionários</h1>
              <p className="text-sm text-gray-500">Cadastro da equipe e geração da folha de pagamento</p>
            </div>
          </div>
          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f]"
          >
            <Plus size={18} />
            Novo funcionário
          </button>
        </div>

        {erro && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
        )}

        {/* Gerar folha */}
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarPlus size={18} className="text-[#ff2d9b]" />
            <h2 className="text-base font-bold text-gray-900">Gerar folha</h2>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>Competência (mês trabalhado)</label>
              <div className="flex gap-2">
                <select value={gMes} onChange={(e) => setGMes(Number(e.target.value))} className={inputCls}>
                  {MESES.map((m, i) => (<option key={i} value={i + 1}>{m}</option>))}
                </select>
                <select value={gAno} onChange={(e) => setGAno(Number(e.target.value))} className={inputCls}>
                  {anos.map((a) => (<option key={a} value={a}>{a}</option>))}
                </select>
              </div>
            </div>
            <button
              onClick={onGerarFolha}
              disabled={gGerando || ativosCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0277f] disabled:opacity-60"
            >
              {gGerando && <Loader2 size={16} className="animate-spin" />}
              Gerar folha
            </button>
            <div className="min-h-[20px] flex-1 text-sm">
              {gMsg && (
                <span className={gErro ? 'text-red-600' : 'inline-flex items-center gap-1 text-green-700'}>
                  {!gErro && <CheckCircle2 size={16} />}
                  {gMsg}
                </span>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Pagamento no dia <strong>05 de {MESES[gMes % 12]}/{gMes === 12 ? gAno + 1 : gAno}</strong>. Se houver
            apontamentos na competência, os valores abrem para edição antes de gerar. Não duplica o que já foi gerado.
          </p>
        </div>

        {/* Lista */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
              <Loader2 size={18} className="animate-spin" /> Carregando…
            </div>
          ) : funcionarios.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">Nenhum funcionário cadastrado ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3 font-medium">Funcionário</th>
                    <th className="px-4 py-3 font-medium">Unidade</th>
                    <th className="px-4 py-3 font-medium text-right">Salário</th>
                    <th className="px-4 py-3 font-medium text-right">VT</th>
                    <th className="px-4 py-3 font-medium text-right">VA</th>
                    <th className="px-4 py-3 font-medium text-right">Total devido</th>
                    <th className="px-4 py-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {funcionarios.map((f) => {
                    const ap = apontPorFunc[f.id] || []
                    return (
                      <tr key={f.id} className={`border-b border-gray-50 ${f.ativo ? '' : 'opacity-50'}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{f.nome}</div>
                          <div className="text-xs text-gray-500">
                            {f.cargo || '—'}
                            {ap.length > 0 && (
                              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                {ap.length} apontamento{ap.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {!f.ativo && <span className="ml-2 text-[10px] font-semibold text-gray-400">INATIVO</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{nomeUnidade(f.unidade_id)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmtBRL(Number(f.salario))}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmtBRL(Number(f.vale_transporte))}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmtBRL(Number(f.vale_alimentacao))}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtBRL(totalFunc(f))}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => abrirApont(f)} title="Apontamentos do mês"
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-[#ff2d9b]">
                              <ListPlus size={16} />
                            </button>
                            <button onClick={() => abrirEdicao(f)} title="Editar"
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                              <Pencil size={16} />
                            </button>
                            <button onClick={() => toggleAtivo(f)} title={f.ativo ? 'Desativar' : 'Reativar'}
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                              <Power size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal cadastro/edição */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{editando ? 'Editar funcionário' : 'Novo funcionário'}</h3>
              <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nome</label>
                <input value={mNome} onChange={(e) => setMNome(e.target.value)} className={inputCls} placeholder="Nome completo" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Cargo</label>
                  <input value={mCargo} onChange={(e) => setMCargo(e.target.value)} className={inputCls} placeholder="Ex.: Recepção" />
                </div>
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select value={mUnidade} onChange={(e) => setMUnidade(e.target.value)} className={inputCls}>
                    <option value="geral">Geral</option>
                    {unidades.map((u) => (<option key={u.id} value={u.id}>{u.nome}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Salário (R$)</label>
                  <input value={mSalario} onChange={(e) => setMSalario(e.target.value)} className={inputCls} placeholder="0,00" inputMode="decimal" />
                </div>
                <div>
                  <label className={labelCls}>Vale Transporte</label>
                  <input value={mVT} onChange={(e) => setMVT(e.target.value)} className={inputCls} placeholder="0,00" inputMode="decimal" />
                </div>
                <div>
                  <label className={labelCls}>Vale Alimentação</label>
                  <input value={mVA} onChange={(e) => setMVA(e.target.value)} className={inputCls} placeholder="0,00" inputMode="decimal" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Jornada início</label>
                  <input type="time" value={mInicio} onChange={(e) => setMInicio(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Jornada fim</label>
                  <input type="time" value={mFim} onChange={(e) => setMFim(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Dia de pagamento</label>
                  <input value={mDiaPag} onChange={(e) => setMDiaPag(e.target.value)} className={inputCls} inputMode="numeric" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Dias de trabalho</label>
                <div className="flex flex-wrap gap-2">
                  {DIAS.map((d) => (
                    <button key={d.n} type="button" onClick={() => toggleDia(d.n)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        mDias.includes(d.n)
                          ? 'border-[#ff2d9b] bg-[#ff2d9b]/10 text-[#ff2d9b]'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Data de admissão</label>
                  <input type="date" value={mAdmissao} onChange={(e) => setMAdmissao(e.target.value)} className={inputCls} />
                </div>
              </div>

              {mErro && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{mErro}</div>}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModalAberto(false)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={salvarFuncionario} disabled={mSalvando}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0277f] disabled:opacity-60">
                {mSalvando && <Loader2 size={16} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal apontamentos */}
      {apFunc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Apontamentos</h3>
              <button onClick={() => setApFunc(null)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
            <p className="mb-4 text-sm text-gray-500">{apFunc.nome} · {MESES[gMes - 1]}/{gAno}</p>

            <div className="mb-4 space-y-2">
              {(apontPorFunc[apFunc.id] || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                  Nenhum apontamento neste mês.
                </div>
              ) : (
                (apontPorFunc[apFunc.id] || []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                    <div>
                      <div className="text-sm text-gray-800">{a.descricao}</div>
                      <div className={`text-xs font-semibold ${Number(a.valor) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {Number(a.valor) < 0 ? '− ' : '+ '}{fmtBRL(Math.abs(Number(a.valor)))}
                      </div>
                    </div>
                    <button onClick={() => removerApont(a.id)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Novo apontamento</div>
              <input value={apDescricao} onChange={(e) => setApDescricao(e.target.value)} className={inputCls + ' mb-2'} placeholder="Descrição (ex.: hora extra, falta, bônus)" />
              <div className="flex gap-2">
                <div className="flex overflow-hidden rounded-xl border border-gray-200">
                  <button type="button" onClick={() => setApSinal('+')}
                    className={`px-3 text-sm font-bold ${apSinal === '+' ? 'bg-green-600 text-white' : 'bg-white text-gray-500'}`}>+</button>
                  <button type="button" onClick={() => setApSinal('-')}
                    className={`px-3 text-sm font-bold ${apSinal === '-' ? 'bg-red-600 text-white' : 'bg-white text-gray-500'}`}>−</button>
                </div>
                <input value={apValor} onChange={(e) => setApValor(e.target.value)} className={inputCls} placeholder="0,00" inputMode="decimal" />
                <button onClick={salvarApont} disabled={apSalvando}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#ff2d9b] px-4 text-sm font-semibold text-white hover:bg-[#e0277f] disabled:opacity-60">
                  {apSalvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                </button>
              </div>
              {apErro && <div className="mt-2 text-sm text-red-600">{apErro}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modal revisão (há apontamentos) */}
      {revisaoAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Revisar folha — {MESES[gMes - 1]}/{gAno}</h3>
              <button onClick={() => setRevisaoAberta(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              Há apontamentos neste mês. Confira/edite os valores base — os apontamentos entram na linha de salário. Pagamento em {fmtData(vencFolhaStr(gAno, gMes))}.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-2 py-2 font-medium">Funcionário</th>
                    <th className="px-2 py-2 font-medium">Salário</th>
                    <th className="px-2 py-2 font-medium">VT</th>
                    <th className="px-2 py-2 font-medium">VA</th>
                    <th className="px-2 py-2 font-medium">Apont.</th>
                    <th className="px-2 py-2 font-medium text-right">Total devido</th>
                  </tr>
                </thead>
                <tbody>
                  {ativos.map((f) => {
                    const ov = revisao[f.id] || { salario: '', vt: '', va: '' }
                    const ap = somaApont(f.id)
                    return (
                      <tr key={f.id} className="border-b border-gray-50">
                        <td className="px-2 py-2">
                          <div className="font-medium text-gray-900">{f.nome}</div>
                          <div className="text-xs text-gray-400">{nomeUnidade(f.unidade_id)}</div>
                        </td>
                        <td className="px-2 py-2">
                          <input value={ov.salario} onChange={(e) => setRevisao((p) => ({ ...p, [f.id]: { ...ov, salario: e.target.value } }))}
                            className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-[#ff2d9b]" inputMode="decimal" />
                        </td>
                        <td className="px-2 py-2">
                          <input value={ov.vt} onChange={(e) => setRevisao((p) => ({ ...p, [f.id]: { ...ov, vt: e.target.value } }))}
                            className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-[#ff2d9b]" inputMode="decimal" />
                        </td>
                        <td className="px-2 py-2">
                          <input value={ov.va} onChange={(e) => setRevisao((p) => ({ ...p, [f.id]: { ...ov, va: e.target.value } }))}
                            className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-[#ff2d9b]" inputMode="decimal" />
                        </td>
                        <td className={`px-2 py-2 text-xs font-semibold ${ap < 0 ? 'text-red-600' : ap > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                          {ap === 0 ? '—' : (ap < 0 ? '− ' : '+ ') + fmtBRL(Math.abs(ap))}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-gray-900">{fmtBRL(totalRevisao(f))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setRevisaoAberta(false)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={() => gerarFolha(revisao)} disabled={gGerando}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ff2d9b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e0277f] disabled:opacity-60">
                {gGerando && <Loader2 size={16} className="animate-spin" />}
                Confirmar e gerar folha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
