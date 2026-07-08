'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { KpiCard, PageHeader, Spinner } from '@/components/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Relatório — Reservas feitas pelo app do Wellhub (Club).
// Lista as club_reservas com wellhub_booking_number preenchido (= vieram do app
// deles), no período escolhido (pela data da aula). Filtro por status + export CSV.
// Só-leitura; não toca em nada do fluxo. Espelho da tela Reservas TotalPass.
// ─────────────────────────────────────────────────────────────────────────────

function tipoLabel(t: string) {
  if (t === 'lift') return 'Lift'
  if (t === 'lift_for_girls') return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t || '—'
}

function fmtData(d: string): string {
  // 'YYYY-MM-DD' → 'DD/MM · seg'
  if (!d) return '—'
  const [y, m, dd] = d.split('-').map(Number)
  const dt = new Date(y, m - 1, dd)
  const wd = dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')} · ${wd}`
}

function fmtCpf(cpf: string | null): string {
  const s = (cpf || '').replace(/\D/g, '')
  if (s.length !== 11) return cpf || '—'
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`
}

const STATUS: Record<string, { label: string; cls: string }> = {
  reservado: { label: 'Reservado', cls: 'badge-blue' },
  presente: { label: 'Presente', cls: 'badge-green' },
  cancelado: { label: 'Cancelado', cls: 'badge-gray' },
  falta: { label: 'Falta', cls: 'badge-red' },
}

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function buscarTudo(builder: () => any): Promise<any[]> {
  const tam = 1000
  let inicio = 0
  const todos: any[] = []
  while (true) {
    const { data, error } = await builder().range(inicio, inicio + tam - 1)
    if (error) { console.error('Erro na busca paginada:', error); break }
    todos.push(...(data || []))
    if (!data || data.length < tam) break
    inicio += tam
  }
  return todos
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

type Linha = {
  id: string
  data: string
  horario: string
  aula: string
  unidade: string
  cliente: string
  cpf: string
  posicao: string
  status: string
  origem: string
}

export default function ReservasWellhubPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const hoje = new Date()
  const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const daqui21 = new Date(hoje.getTime() + 21 * 24 * 60 * 60 * 1000)

  const [de, setDe] = useState(inicioMes)
  const [ate, setAte] = useState(dataLocalStr(daqui21))
  const [statusFiltro, setStatusFiltro] = useState<string>('todas')
  const [origemFiltro, setOrigemFiltro] = useState<string>('app')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregar() }, [perfil, de, ate])

  async function carregar() {
    setCarregando(true)

    // 1) Ocorrências no período, com aula (tipo/horário) e unidade.
    const ocs = await buscarTudo(() => supabase.from('club_ocorrencias')
      .select('id, data, club_aulas!inner(tipo, horario, unidades(nome))')
      .gte('data', de).lte('data', ate))
    const ocInfo: Record<string, { data: string; tipo: string; horario: string; unidade: string }> = {}
    for (const o of ocs) {
      const a = (o as any).club_aulas
      ocInfo[(o as any).id] = {
        data: (o as any).data,
        tipo: a?.tipo || '',
        horario: (a?.horario || '').slice(0, 5),
        unidade: a?.unidades?.nome || '—',
      }
    }
    const ocIds = Object.keys(ocInfo)
    if (!ocIds.length) { setLinhas([]); setCarregando(false); return }

    // 2) Reservas Wellhub (wellhub_booking_number != null OU tipo_credito wellhub%).
    const reservas: any[] = []
    for (const lote of chunk(ocIds, 150)) {
      if (!lote.length) continue
      const parte = await buscarTudo(() => supabase.from('club_reservas')
        .select('id, status, posicao, ocorrencia_id, wellhub_booking_number, tipo_credito, clientes(nome, cpf)')
        .in('ocorrencia_id', lote)
        .or('wellhub_booking_number.not.is.null,tipo_credito.ilike.wellhub%'))
      reservas.push(...parte)
    }

    const arr: Linha[] = reservas.map((r: any) => {
      const oc = ocInfo[r.ocorrencia_id] || { data: '', tipo: '', horario: '', unidade: '—' }
      return {
        id: r.id,
        data: oc.data,
        horario: oc.horario,
        aula: tipoLabel(oc.tipo),
        unidade: oc.unidade,
        cliente: r.clientes?.nome || 'Cliente Wellhub',
        cpf: fmtCpf(r.clientes?.cpf ?? null),
        posicao: r.posicao || '—',
        status: r.status || '—',
        origem: r.wellhub_booking_number ? 'App' : 'Site',
      }
    })
    // Mais recentes (data) primeiro, depois horário.
    arr.sort((a, b) => (a.data === b.data ? a.horario.localeCompare(b.horario) : b.data.localeCompare(a.data)))
    setLinhas(arr)
    setCarregando(false)
  }

  const visiveis = linhas.filter(l =>
    (statusFiltro === 'todas' || l.status === statusFiltro) &&
    (origemFiltro === 'todas' || l.origem.toLowerCase() === origemFiltro)
  )

  const kpis = {
    total: visiveis.length,
    reservado: visiveis.filter(l => l.status === 'reservado').length,
    presente: visiveis.filter(l => l.status === 'presente').length,
    cancelado: visiveis.filter(l => l.status === 'cancelado').length,
  }

  function baixarCsv() {
    const header = ['Data', 'Horário', 'Aula', 'Unidade', 'Cliente', 'CPF', 'Posição', 'Origem', 'Status']
    const corpo = visiveis.map(l => [l.data, l.horario, l.aula, l.unidade, l.cliente, l.cpf, l.posicao, l.origem, (STATUS[l.status]?.label || l.status)])
    const csv = [header, ...corpo]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reservas-wellhub-${de}_a_${ate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Reservas Wellhub · Club" subtitle="App (reservou no app do Wellhub) e Site (lançada no nosso sistema) — por data da aula" />

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <label className="text-xs text-gray-500">
          <div className="mb-1">De</div>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} className="input" />
        </label>
        <label className="text-xs text-gray-500">
          <div className="mb-1">Até</div>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} className="input" />
        </label>
        <label className="text-xs text-gray-500">
          <div className="mb-1">Origem</div>
          <select value={origemFiltro} onChange={e => setOrigemFiltro(e.target.value)} className="input">
            <option value="app">App (Wellhub)</option>
            <option value="site">Site (nosso sistema)</option>
            <option value="todas">Todas</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">
          <div className="mb-1">Status</div>
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="input">
            <option value="todas">Todas</option>
            <option value="reservado">Reservado</option>
            <option value="presente">Presente</option>
            <option value="cancelado">Cancelado</option>
            <option value="falta">Falta</option>
          </select>
        </label>
        <button onClick={baixarCsv} disabled={!visiveis.length} className="btn btn-primary btn-sm ml-auto disabled:opacity-40">
          ⬇ Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Reservas Wellhub" value={String(kpis.total)} sub="no período/filtro" subColor="text-primary-600" />
        <KpiCard label="Reservado" value={String(kpis.reservado)} sub="aguardando aula" subColor="text-gray-400" />
        <KpiCard label="Presente" value={String(kpis.presente)} sub="compareceram" subColor="text-primary-600" />
        <KpiCard label="Cancelado" value={String(kpis.cancelado)} sub="no período" subColor="text-danger-600" />
      </div>

      {carregando ? (
        <Spinner />
      ) : !visiveis.length ? (
        <div className="text-center py-10 text-sm text-gray-400">Nenhuma reserva Wellhub neste período/filtro.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Hora</th>
                <th className="py-2 pr-3">Aula</th>
                <th className="py-2 pr-3">Unidade</th>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">CPF</th>
                <th className="py-2 pr-3">Posição</th>
                <th className="py-2 pr-3">Origem</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => (
                <tr key={l.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-700">{fmtData(l.data)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-700">{l.horario}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{l.aula}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{l.unidade}</td>
                  <td className="py-2 pr-3 font-medium text-gray-900">{l.cliente}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{l.cpf}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-500">{l.posicao}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span className={`badge ${l.origem === 'App' ? 'badge-blue' : 'badge-gray'}`}>{l.origem}</span>
                  </td>
                  <td className="py-2">
                    <span className={`badge ${STATUS[l.status]?.cls || 'badge-gray'}`}>{STATUS[l.status]?.label || l.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
