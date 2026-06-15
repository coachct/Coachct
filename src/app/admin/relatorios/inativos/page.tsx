'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, Badge, Insight, EmptyState, KpiCard } from '@/components/ui'

// ---- Tipos ----
type Fonte = 'ct' | 'club'
type ScopeStat = { ultimo: string; total: number }
type SourceAgg = { ultimo: string; total: number; unidades: Record<string, ScopeStat> }
type Agg = {
  cliente: { id: string; nome: string; cpf: string | null; telefone: string | null }
  ct: SourceAgg
  club: SourceAgg
}

const PRESETS_DIAS = [7, 15, 30, 45, 60, 90]

// ---- Helpers ----
function hojeStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function diasDesde(data: string, hoje: string) {
  const a = new Date(`${hoje}T12:00:00`).getTime()
  const b = new Date(`${data}T12:00:00`).getTime()
  return Math.round((a - b) / 86400000)
}
function fmtData(s: string) {
  return new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR')
}
function novaSource(): SourceAgg {
  return { ultimo: '', total: 0, unidades: {} }
}
function registra(src: SourceAgg, data: string, unidadeId: string | null) {
  if (!data) return
  src.total++
  if (data > src.ultimo) src.ultimo = data
  const uid = unidadeId || '—'
  const u = src.unidades[uid] || (src.unidades[uid] = { ultimo: '', total: 0 })
  u.total++
  if (data > u.ultimo) u.ultimo = data
}

// Busca paginada (evita o limite de 1000 linhas do PostgREST truncar silenciosamente)
async function buscarTudo<T = any>(
  fazerQuery: (de: number, ate: number) => any
): Promise<T[]> {
  const tam = 1000
  let de = 0
  const tudo: T[] = []
  for (;;) {
    const { data, error } = await fazerQuery(de, de + tam - 1)
    if (error) throw error
    const lote = (data || []) as T[]
    tudo.push(...lote)
    if (lote.length < tam) break
    de += tam
  }
  return tudo
}

export default function ClientesInativosPage() {
  const supabase = createClient()
  const hoje = hojeStr()

  const [aggs, setAggs] = useState<Agg[]>([])
  const [unidades, setUnidades] = useState<{ id: string; nome: string; tipo: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Filtros
  const [dias, setDias] = useState(7)
  const [unidadeId, setUnidadeId] = useState('')
  const [tipo, setTipo] = useState<'todos' | Fonte>('todos')
  const [soUmTreino, setSoUmTreino] = useState(false)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [cts, clubs, clientes, unids] = await Promise.all([
          // CT: presença efetiva = status 'realizado', até hoje
          buscarTudo((de, ate) =>
            supabase
              .from('agendamentos')
              .select('cliente_id, data, unidade_id')
              .eq('status', 'realizado')
              .lte('data', hoje)
              .order('data', { ascending: true })
              .range(de, ate)
          ),
          // JustClub: presença efetiva = status 'presente'
          buscarTudo((de, ate) =>
            supabase
              .from('club_reservas')
              .select('cliente_id, club_ocorrencias!inner(data, club_aulas!inner(unidade_id))')
              .eq('status', 'presente')
              .order('id', { ascending: true })
              .range(de, ate)
          ),
          buscarTudo((de, ate) =>
            supabase.from('clientes').select('id, nome, cpf, telefone').order('nome').range(de, ate)
          ),
          supabase.from('unidades').select('id, nome, tipo').order('nome'),
        ])

        const mapa: Record<string, Agg> = {}
        const clienteById: Record<string, any> = {}
        ;(clientes as any[]).forEach(c => { clienteById[c.id] = c })

        const getAgg = (cid: string): Agg | null => {
          const c = clienteById[cid]
          if (!c) return null
          return (mapa[cid] ||= { cliente: c, ct: novaSource(), club: novaSource() })
        }

        ;(cts as any[]).forEach(r => {
          const a = getAgg(r.cliente_id)
          if (a) registra(a.ct, r.data, r.unidade_id)
        })
        ;(clubs as any[]).forEach(r => {
          const a = getAgg(r.cliente_id)
          const oc = r.club_ocorrencias
          if (a && oc?.data) registra(a.club, oc.data, oc.club_aulas?.unidade_id ?? null)
        })

        setAggs(Object.values(mapa))
        setUnidades(((unids as any).data || []) as any[])
      } catch (e: any) {
        setErro(e?.message || 'Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const nomeUnidade = useMemo(() => {
    const m: Record<string, string> = {}
    unidades.forEach(u => { m[u.id] = u.nome })
    return m
  }, [unidades])

  // ---- Aplica filtros / monta linhas ----
  const linhas = useMemo(() => {
    const sources: Fonte[] = tipo === 'todos' ? ['ct', 'club'] : [tipo]
    const q = busca.trim().toLowerCase()
    const out: {
      cliente: Agg['cliente']
      ultimo: string
      dias: number
      total: number
      fontes: Fonte[]
      unidadesNomes: string[]
    }[] = []

    for (const a of aggs) {
      if (q) {
        const alvo = `${a.cliente.nome || ''} ${a.cliente.cpf || ''}`.toLowerCase()
        if (!alvo.includes(q)) continue
      }

      let ultimo = ''
      let total = 0
      const fontes: Fonte[] = []
      const unidSet = new Set<string>()

      for (const f of sources) {
        const src = a[f]
        if (unidadeId) {
          const st = src.unidades[unidadeId]
          if (!st) continue
          total += st.total
          if (st.ultimo > ultimo) ultimo = st.ultimo
          fontes.push(f)
          unidSet.add(unidadeId)
        } else {
          if (src.total === 0) continue
          total += src.total
          if (src.ultimo > ultimo) ultimo = src.ultimo
          fontes.push(f)
          Object.keys(src.unidades).forEach(u => unidSet.add(u))
        }
      }

      if (!ultimo) continue // nunca treinou dentro do escopo selecionado
      const d = diasDesde(ultimo, hoje)
      if (d < dias) continue
      if (soUmTreino && total !== 1) continue

      out.push({
        cliente: a.cliente,
        ultimo,
        dias: d,
        total,
        fontes,
        unidadesNomes: [...unidSet].map(id => nomeUnidade[id]).filter(Boolean),
      })
    }

    out.sort((x, y) => y.dias - x.dias)
    return out
  }, [aggs, tipo, unidadeId, dias, soUmTreino, busca, hoje, nomeUnidade])

  const mediaDias = linhas.length
    ? Math.round(linhas.reduce((s, l) => s + l.dias, 0) / linhas.length)
    : 0
  const qtdUmTreino = linhas.filter(l => l.total === 1).length

  function exportarCSV() {
    const head = ['Nome', 'CPF', 'Telefone', 'Ultimo treino', 'Dias sem treinar', 'Total treinos', 'Fonte', 'Unidades']
    const linhasCsv = linhas.map(l => [
      l.cliente.nome || '',
      l.cliente.cpf || '',
      l.cliente.telefone || '',
      fmtData(l.ultimo),
      String(l.dias),
      String(l.total),
      l.fontes.map(f => (f === 'ct' ? 'Coach CT' : 'JustClub')).join(' / '),
      l.unidadesNomes.join(' / '),
    ])
    const csv = [head, ...linhasCsv]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clientes-inativos-${dias}dias-${hoje}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Clientes que não treinam"
        subtitle="Quem está parado há X dias — para retomada / win-back"
      />

      {erro && <Insight variant="red">Erro ao carregar: {erro}</Insight>}

      <Insight variant="amber">
        Conta como treino apenas <strong>presença efetiva</strong> (CT marcado como “realizado” e JustClub
        como “presente”). Aulas canceladas e faltas (no-show) não contam. Se a recepção não marcar a presença,
        o cliente pode aparecer aqui mesmo tendo treinado.
      </Insight>

      {/* Filtros */}
      <div className="card mb-4 space-y-3">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Sem treinar há (mínimo)</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS_DIAS.map(p => (
              <button
                key={p}
                onClick={() => setDias(p)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                  dias === p
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                }`}
              >
                {p} dias
              </button>
            ))}
            <div className="flex items-center gap-1.5 ml-1">
              <input
                type="number"
                min={1}
                value={dias}
                onChange={e => setDias(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-gray-400">dias</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Unidade</div>
            <select
              value={unidadeId}
              onChange={e => setUnidadeId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              <option value="">Todas as unidades</option>
              {unidades.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Tipo de aula</div>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as any)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              <option value="todos">Todas (CT + JustClub)</option>
              <option value="ct">Coach CT (personal)</option>
              <option value="club">JustClub (coletivas)</option>
            </select>
          </div>

          <div className="flex-1 min-w-[160px]">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Buscar</div>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome ou CPF"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 pb-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={soUmTreino}
              onChange={e => setSoUmTreino(e.target.checked)}
              className="rounded"
            />
            Só fez 1 treino e não voltou
          </label>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard label="Clientes na lista" value={String(linhas.length)} sub={`parados há ${dias}+ dias`} />
        <KpiCard label="Média de dias parado" value={String(mediaDias)} sub="dias sem treinar" />
        <KpiCard label="Fizeram só 1 treino" value={String(qtdUmTreino)} sub="e não voltaram" subColor="text-danger-600" />
      </div>

      <div className="flex justify-end mb-2">
        <button
          onClick={exportarCSV}
          disabled={linhas.length === 0}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-primary-300 disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </div>

      {/* Tabela */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left pb-3 pr-2">#</th>
                <th className="text-left pb-3 pr-2">Cliente</th>
                <th className="text-left pb-3 pr-2">Telefone</th>
                <th className="text-left pb-3 pr-2">Último treino</th>
                <th className="text-right pb-3 pr-2">Dias parado</th>
                <th className="text-right pb-3 pr-2">Treinos</th>
                <th className="text-left pb-3">Onde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {linhas.map((l, i) => {
                const tel = (l.cliente.telefone || '').replace(/\D/g, '')
                return (
                  <tr key={l.cliente.id}>
                    <td className="py-2.5 pr-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-2.5 pr-2">
                      <div className="font-medium text-gray-900">{l.cliente.nome}</div>
                      {l.cliente.cpf && <div className="text-xs text-gray-400">{l.cliente.cpf}</div>}
                    </td>
                    <td className="py-2.5 pr-2 text-xs">
                      {tel ? (
                        <a
                          href={`https://wa.me/55${tel}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          {l.cliente.telefone}
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-gray-600">{fmtData(l.ultimo)}</td>
                    <td className="py-2.5 pr-2 text-right">
                      <Badge variant={l.dias >= 60 ? 'red' : l.dias >= 30 ? 'amber' : 'gray'}>
                        {l.dias} dias
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-2 text-right font-semibold text-gray-700">{l.total}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {l.fontes.map(f => (
                          <Badge key={f} variant={f === 'ct' ? 'blue' : 'green'}>
                            {f === 'ct' ? 'CT' : 'Club'}
                          </Badge>
                        ))}
                        {l.unidadesNomes.length > 0 && (
                          <span className="text-xs text-gray-400">{l.unidadesNomes.join(', ')}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {linhas.length === 0 && (
            <EmptyState message="Nenhum cliente parado com os filtros atuais." />
          )}
        </div>
      </div>
    </div>
  )
}
