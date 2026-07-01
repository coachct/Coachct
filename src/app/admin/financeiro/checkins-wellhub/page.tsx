'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { CheckCircle2, TrendingUp, AlertCircle, Loader2, Clock, RefreshCw } from 'lucide-react'

const supabase = createClient()

type Checkin = {
  id: string
  origem: string
  status: string
  id_externo: string | null
  produto: string | null
  valor: number | null
  recebido_em: string
  validado_em: string | null
  cliente_id: string | null
  clientes: any
  raw: any
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const ORIGEM_LABEL: Record<string, string> = {
  wellhub: 'Wellhub',
  totalpass: 'TotalPass',
}
const ORIGEM_BADGE: Record<string, string> = {
  wellhub: 'bg-orange-100 text-orange-700',
  totalpass: 'bg-indigo-100 text-indigo-700',
}
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  validado: { label: 'Validado', cls: 'bg-green-100 text-green-700' },
  recebido: { label: 'Recebido', cls: 'bg-amber-100 text-amber-700' },
  erro: { label: 'Erro', cls: 'bg-red-100 text-red-700' },
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function inicioMesStr(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01T00:00:00-03:00`
}

function dataHoraSP(ts: string): string {
  const d = new Date(ts)
  const data = d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
  })
  const hora = d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  })
  return `${data} ${hora}`
}

function nomeExibicao(r: Checkin): string {
  const c = r.clientes
  const nomeCliente = Array.isArray(c) ? c[0]?.nome : c?.nome
  if (nomeCliente) return nomeCliente
  // Wellhub -> event_data.user.first_name/last_name; TotalPass -> user.name.
  const u = r.raw?.event_data?.user
  const nomeWellhub = [u?.first_name, u?.last_name].filter(Boolean).join(' ').trim()
  if (nomeWellhub) return nomeWellhub
  const nomeTotalpass = r.raw?.user?.name?.trim()
  if (nomeTotalpass) return nomeTotalpass
  const label = ORIGEM_LABEL[r.origem] ?? r.origem
  return r.id_externo ? `${label} · ${r.id_externo}` : label
}

export default function CheckinsWellhubPage() {
  const { loading: authLoading } = useAuth()

  const agora = new Date()
  const [mes, setMes] = useState(agora.getMonth() + 1)
  const [ano, setAno] = useState(agora.getFullYear())
  const [fOrigem, setFOrigem] = useState<string>('todas')
  const [fStatus, setFStatus] = useState<string>('todos')

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [itens, setItens] = useState<Checkin[]>([])
  const [revalidandoId, setRevalidandoId] = useState<string | null>(null)
  const [corrigindo, setCorrigindo] = useState(false)

  const anos = [agora.getFullYear() - 1, agora.getFullYear(), agora.getFullYear() + 1]

  async function carregar() {
    setCarregando(true)
    setErro(null)

    const inicio = inicioMesStr(ano, mes)
    const prox = mes === 12 ? inicioMesStr(ano + 1, 1) : inicioMesStr(ano, mes + 1)

    const { data, error } = await supabase
      .from('entradas_walkin')
      .select(
        'id, origem, status, id_externo, produto, valor, recebido_em, validado_em, cliente_id, raw, clientes(nome)'
      )
      .in('origem', ['wellhub', 'totalpass'])
      .gte('recebido_em', inicio)
      .lt('recebido_em', prox)
      .order('recebido_em', { ascending: false })

    if (error) {
      setErro('Não foi possível carregar os check-ins.')
      setCarregando(false)
      return
    }
    setItens((data as Checkin[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    if (!authLoading) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, mes, ano])

  async function revalidar(id: string) {
    setRevalidandoId(id)
    setErro(null)
    try {
      const res = await fetch('/api/wellhub/revalidar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entradaId: id }),
      })
      if (!res.ok) {
        setErro('Não foi possível revalidar. Tente novamente.')
      } else {
        await carregar()
      }
    } catch {
      setErro('Não foi possível revalidar. Tente novamente.')
    } finally {
      setRevalidandoId(null)
    }
  }

  function precisaRevalidar(r: Checkin): boolean {
    return r.status === 'erro' || r.status === 'recebido' || (r.status === 'validado' && r.valor == null)
  }

  // Preenche o valor de todos os validados-sem-valor de uma vez (local, sem Gympass).
  async function corrigirTodos() {
    const alvos = itens.filter((r) => r.status === 'validado' && r.valor == null)
    if (alvos.length === 0) return
    setCorrigindo(true)
    setErro(null)
    try {
      for (const r of alvos) {
        await fetch('/api/wellhub/revalidar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entradaId: r.id }),
        })
      }
      await carregar()
    } catch {
      setErro('Não foi possível corrigir todos os valores.')
    } finally {
      setCorrigindo(false)
    }
  }

  // Por origem (afeta cards e tabela)
  const porOrigem = useMemo(() => {
    if (fOrigem === 'todas') return itens
    return itens.filter((r) => r.origem === fOrigem)
  }, [itens, fOrigem])

  // Cards: resumo do mês+origem (todos os status)
  const resumo = useMemo(() => {
    let validados = 0
    let receita = 0
    let pendentesErros = 0
    for (const r of porOrigem) {
      if (r.status === 'validado') {
        validados++
        receita += Number(r.valor || 0)
      } else {
        pendentesErros++
      }
    }
    return { validados, receita, pendentesErros }
  }, [porOrigem])

  // Tabela: mês+origem+status
  const lista = useMemo(() => {
    if (fStatus === 'todos') return porOrigem
    return porOrigem.filter((r) => r.status === fStatus)
  }, [porOrigem, fStatus])

  // Totais por origem (Wellhub / TotalPass) do mês — sempre os dois, ignora o
  // filtro de origem. Conta validados e soma os valores.
  const totaisPorOrigem = useMemo(() => {
    const calc = (o: string) => {
      const rows = itens.filter((r) => r.origem === o && r.status === 'validado')
      return {
        count: rows.length,
        receita: rows.reduce((s, r) => s + Number(r.valor || 0), 0),
      }
    }
    return { wellhub: calc('wellhub'), totalpass: calc('totalpass') }
  }, [itens])

  const inputCls =
    'rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-[#ff2d9b] focus:ring-2 focus:ring-[#ff2d9b]/20'

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Cabeçalho */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff2d9b]/10 text-[#ff2d9b]">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Check-ins Apps</h1>
              <p className="text-sm text-gray-500">
                Check-ins dos agregadores com valor por check-in e receita esperada
              </p>
            </div>
          </div>

          <button
            onClick={corrigirTodos}
            disabled={corrigindo}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            title="Preenche o valor dos check-ins validados que estão sem valor"
          >
            {corrigindo ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Corrigir valores
          </button>
        </div>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Competência</label>
            <div className="flex items-center gap-2">
              <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputCls}>
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className={inputCls}>
                {anos.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Origem</label>
            <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} className={inputCls}>
              <option value="todas">Todas</option>
              <option value="wellhub">Wellhub</option>
              <option value="totalpass">TotalPass</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={inputCls}>
              <option value="todos">Todos</option>
              <option value="validado">Validado</option>
              <option value="recebido">Recebido</option>
              <option value="erro">Erro</option>
            </select>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-2 flex items-center gap-2 text-gray-500">
              <CheckCircle2 size={16} className="text-green-600" />
              <span className="text-sm font-medium">Check-ins validados</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{resumo.validados}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-2 flex items-center gap-2 text-gray-500">
              <TrendingUp size={16} className="text-[#ff2d9b]" />
              <span className="text-sm font-medium">Receita esperada</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{fmtBRL(resumo.receita)}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-2 flex items-center gap-2 text-gray-500">
              <AlertCircle size={16} className="text-amber-600" />
              <span className="text-sm font-medium">Pendentes / erros</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{resumo.pendentesErros}</div>
          </div>
        </div>

        {/* Cards por origem — quantidade + soma dos valores (mês) */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(['wellhub', 'totalpass'] as const).map((o) => (
            <div key={o} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-3">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ORIGEM_BADGE[o] ?? 'bg-gray-100 text-gray-600'}`}>
                  {ORIGEM_LABEL[o] ?? o}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold text-gray-900">{totaisPorOrigem[o].count}</div>
                  <div className="text-xs text-gray-500">check-ins validados</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">{fmtBRL(totaisPorOrigem[o].receita)}</div>
                  <div className="text-xs text-gray-500">em valores</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabela */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
              <Loader2 size={18} className="animate-spin" />
              Carregando…
            </div>
          ) : erro ? (
            <div className="py-16 text-center text-sm text-red-600">{erro}</div>
          ) : lista.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">
              Nenhum check-in encontrado para os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-3 font-medium">Data / hora</th>
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">Origem</th>
                    <th className="px-4 py-3 font-medium">Produto</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Valor</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((r) => {
                    const st = STATUS_BADGE[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-600' }
                    return (
                      <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-4 py-3 text-gray-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={13} className="text-gray-400" />
                            {dataHoraSP(r.recebido_em)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{nomeExibicao(r)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ORIGEM_BADGE[r.origem] ?? 'bg-gray-100 text-gray-600'}`}>
                            {ORIGEM_LABEL[r.origem] ?? r.origem}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.produto || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {r.valor != null ? fmtBRL(Number(r.valor)) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {precisaRevalidar(r) && (
                            <button
                              onClick={() => revalidar(r.id)}
                              disabled={revalidandoId === r.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-[#ff2d9b] disabled:opacity-50"
                            >
                              {revalidandoId === r.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <RefreshCw size={13} />
                              )}
                              Revalidar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50/60">
                    <td colSpan={5} className="px-4 py-3 text-sm font-medium text-gray-600">
                      {lista.length} check-in{lista.length !== 1 ? 's' : ''} no filtro
                    </td>
                    <td className="px-4 py-3 text-right text-base font-bold text-gray-900">
                      {fmtBRL(lista.reduce((acc, r) => acc + Number(r.valor || 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-400">
          A <strong>receita esperada</strong> soma o valor dos check-ins validados. Entradas sem valor
          (—) são de produtos ainda não cadastrados em <strong>Valores check-in</strong>.
        </p>
      </div>
    </div>
  )
}
