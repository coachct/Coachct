'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { Clock, Users } from 'lucide-react'

function formatarData(d: string) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function tipoLabelClub(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')    return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t || 'Aula'
}

function labelPlano(t: string) {
  if (!t) return '—'
  const s = t.toLowerCase()
  if (s.startsWith('wellhub'))   return 'Wellhub'
  if (s.startsWith('totalpass')) return 'TotalPass'
  if (s.startsWith('avulso'))    return 'Avulso'
  if (s.startsWith('mensal'))    return 'Mensal'
  if (s === 'ct' || s.startsWith('ct')) return 'Coach CT'
  return t
}

function tempoRelativo(iso: string) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0) return 'agora'
  const min = Math.floor(diffMs / 60000)
  if (min < 1)  return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)   return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d} dia${d > 1 ? 's' : ''}`
}

export default function FilaEsperaPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [unidades,    setUnidades]    = useState<any[]>([])
  const [unidadeSel,  setUnidadeSel]  = useState<any>(null) // null = Todas
  const [fila,        setFila]        = useState<any[]>([])
  const [loadingFila, setLoadingFila] = useState(false)

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregarUnidades() }, [perfil])
  useEffect(() => { if (perfil && unidades.length) carregarFila() }, [perfil, unidades.length, unidadeSel?.id])

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades').select('id, nome, tipo').eq('ativo', true).order('nome')
    setUnidades(data || [])
  }

  async function carregarFila() {
    setLoadingFila(true)

    let q = supabase.from('fila_espera')
      .select('id, cliente_id, ocorrencia_id, tipo_credito, data, horario, unidade_id, criado_em')
      .eq('status', 'aguardando')
      .order('data').order('horario').order('criado_em')
    if (unidadeSel) q = q.eq('unidade_id', unidadeSel.id)

    const { data: linhas } = await q
    const fe = linhas || []
    if (!fe.length) { setFila([]); setLoadingFila(false); return }

    // Nomes dos clientes
    const cids = Array.from(new Set(fe.map((f: any) => f.cliente_id).filter(Boolean)))
    const nomeMap: Record<string, string> = {}
    if (cids.length) {
      const { data: cls } = await supabase.from('clientes').select('id, nome').in('id', cids)
      for (const c of (cls || [])) nomeMap[c.id] = c.nome
    }

    // Modalidade das ocorrências (Club)
    const ocIds = Array.from(new Set(fe.map((f: any) => f.ocorrencia_id).filter(Boolean)))
    const modMap: Record<string, string> = {}
    if (ocIds.length) {
      const { data: ocs } = await supabase.from('club_ocorrencias').select('id, aula_id').in('id', ocIds)
      const aulaIds = Array.from(new Set((ocs || []).map((o: any) => o.aula_id).filter(Boolean)))
      const aulaTipo: Record<string, string> = {}
      if (aulaIds.length) {
        const { data: aulas } = await supabase.from('club_aulas').select('id, tipo').in('id', aulaIds)
        for (const a of (aulas || [])) aulaTipo[a.id] = a.tipo
      }
      for (const o of (ocs || [])) modMap[o.id] = aulaTipo[o.aula_id] || ''
    }

    // Posição na fila por agrupamento (Club = mesma ocorrência; CT = mesma data+horário+unidade)
    const grupos: Record<string, any[]> = {}
    for (const f of fe) {
      const key = f.ocorrencia_id
        ? `oc:${f.ocorrencia_id}`
        : `ct:${f.data}|${f.horario}|${f.unidade_id}`
      if (!grupos[key]) grupos[key] = []
      grupos[key].push(f)
    }
    const posMap: Record<string, number> = {}
    for (const key of Object.keys(grupos)) {
      const arr = grupos[key].slice().sort((a, b) =>
        String(a.criado_em || '').localeCompare(String(b.criado_em || '')))
      arr.forEach((f, i) => { posMap[f.id] = i + 1 })
    }

    const uniMap: Record<string, any> = {}
    for (const u of unidades) uniMap[u.id] = u

    const rows = fe.map((f: any) => {
      const isClub = !!f.ocorrencia_id
      return {
        id:         f.id,
        cliente:    nomeMap[f.cliente_id] || '—',
        unidade:    uniMap[f.unidade_id]?.nome || '—',
        modalidade: isClub ? tipoLabelClub(modMap[f.ocorrencia_id] || '') : 'Coach CT',
        data:       f.data,
        horario:    (f.horario || '').slice(0, 5),
        plano:      labelPlano(f.tipo_credito),
        posicao:    posMap[f.id] || 1,
        criado_em:  f.criado_em,
      }
    })

    setFila(rows)
    setLoadingFila(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const total = fila.length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-semibold text-gray-900">Fila de espera</h1>
        <p className="text-xs text-gray-400 mt-0.5">Clientes aguardando vaga por cancelamento ou falta</p>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-5 space-y-5">

        {/* Filtro de unidade */}
        <div className="card space-y-4">
          <div className="text-sm font-semibold text-gray-900">Filtros</div>
          <div>
            <label className="label">Unidade</label>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setUnidadeSel(null)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  !unidadeSel
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                }`}>
                Todas
              </button>
              {unidades.map(u => (
                <button key={u.id} onClick={() => setUnidadeSel(u)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    unidadeSel?.id === u.id
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
                  }`}>
                  {u.nome}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resumo */}
        <div className="card flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
            <Clock size={20} className="text-primary-600"/>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{loadingFila ? '—' : total}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">
              {total === 1 ? 'cliente aguardando' : 'clientes aguardando'}{unidadeSel ? ` · ${unidadeSel.nome}` : ''}
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="card overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">Aguardando vaga</div>
            <div className="text-xs text-gray-400">{total} na fila</div>
          </div>

          {loadingFila ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-7 h-7 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : fila.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              <Users size={32} className="mx-auto mb-3 text-gray-300"/>
              Ninguém na fila de espera no momento.
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <div className="col-span-3">Cliente</div>
                <div className="col-span-2">Unidade</div>
                <div className="col-span-3">Aguardando</div>
                <div className="col-span-2">Plano</div>
                <div className="col-span-1 text-center">Pos.</div>
                <div className="col-span-1 text-right">Entrou</div>
              </div>
              {fila.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors items-center">
                  <div className="col-span-3 text-sm font-medium text-gray-900 truncate">{r.cliente}</div>
                  <div className="col-span-2 text-sm text-gray-600 truncate">{r.unidade}</div>
                  <div className="col-span-3 text-sm text-gray-700">
                    <span className="font-medium">{r.modalidade}</span>
                    <span className="text-gray-400"> · {formatarData(r.data)} {r.horario}</span>
                  </div>
                  <div className="col-span-2 text-sm text-gray-600 truncate">{r.plano}</div>
                  <div className="col-span-1 text-center">
                    <span className="inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs font-bold">
                      {r.posicao}º
                    </span>
                  </div>
                  <div className="col-span-1 text-right text-xs text-gray-400">{tempoRelativo(r.criado_em)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
