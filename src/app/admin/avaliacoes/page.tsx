'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, KpiCard, EmptyState } from '@/components/ui'

function tipoLabel(t: string | null): string {
  if (t === 'ct') return 'Coach CT'
  if (t === 'lift') return 'Lift'
  if (t === 'lift_for_girls') return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return 'Aula'
}

function dataBR(d: string | null): string {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return dia && m && a ? `${dia}/${m}/${a}` : d
}

function dataHoraBR(ts: string | null): string {
  if (!ts) return '—'
  const dt = new Date(ts)
  if (isNaN(dt.getTime())) return '—'
  const dia = String(dt.getDate()).padStart(2, '0')
  const mes = String(dt.getMonth() + 1).padStart(2, '0')
  const hora = String(dt.getHours()).padStart(2, '0')
  const min = String(dt.getMinutes()).padStart(2, '0')
  return `${dia}/${mes} ${hora}:${min}`
}

function media(vals: (number | null)[]): { texto: string; n: number } {
  const validos = vals.filter((v): v is number => v != null)
  if (!validos.length) return { texto: '—', n: 0 }
  const m = validos.reduce((s, v) => s + v, 0) / validos.length
  return { texto: m.toFixed(1).replace('.', ','), n: validos.length }
}

function Nota({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-gray-300">—</span>
  return <span className="font-semibold text-primary-700">{valor}<span className="text-amber-400"> ★</span></span>
}

export default function AvaliacoesPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])

  const [fUnidade, setFUnidade] = useState('')
  const [fCoach, setFCoach] = useState('')
  const [fInicio, setFInicio] = useState('')
  const [fFim, setFFim] = useState('')
  const [fOrdem, setFOrdem] = useState<'recente' | 'aula'>('recente')

  useEffect(() => {
    async function load() {
      const [{ data: avals }, { data: unis }] = await Promise.all([
        supabase.from('avaliacoes_aula')
          .select('*, clientes(nome)')
          .eq('dispensado', false)
          .order('criado_em', { ascending: false })
          .order('data_aula', { ascending: false })
          .limit(500),
        supabase.from('unidades').select('id, nome').order('nome'),
      ])
      setAvaliacoes(avals || [])
      setUnidades(unis || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <Spinner />

  // Coaches presentes nas avaliações (pro filtro)
  const coachesMap: Record<string, string> = {}
  avaliacoes.forEach(a => { if (a.coach_id && a.coach_nome) coachesMap[a.coach_id] = a.coach_nome })
  const coachesUnicos = Object.entries(coachesMap).sort((a, b) => a[1].localeCompare(b[1]))

  // Aplicação dos filtros
  const filtradas = avaliacoes.filter(a => {
    if (fUnidade && a.unidade_id !== fUnidade) return false
    if (fCoach && a.coach_id !== fCoach) return false
    if (fInicio && (a.data_aula || '') < fInicio) return false
    if (fFim && (a.data_aula || '') > fFim) return false
    return true
  }).sort((a, b) => {
    if (fOrdem === 'recente') return (b.criado_em || '').localeCompare(a.criado_em || '')
    return (b.data_aula || '').localeCompare(a.data_aula || '') || (b.criado_em || '').localeCompare(a.criado_em || '')
  })

  const mAula = media(filtradas.map(a => a.nota_aula))
  const mProf = media(filtradas.map(a => a.nota_professor))
  const mMusica = media(filtradas.map(a => a.nota_musica))
  const mAmb = media(filtradas.map(a => a.nota_ambiente))

  // Média do professor por coach (sobre o filtro atual)
  const porCoach: Record<string, { nome: string; notas: number[] }> = {}
  filtradas.forEach(a => {
    if (!a.coach_id || !a.coach_nome) return
    if (!porCoach[a.coach_id]) porCoach[a.coach_id] = { nome: a.coach_nome, notas: [] }
    if (a.nota_professor != null) porCoach[a.coach_id].notas.push(a.nota_professor)
  })
  const resumoCoach = Object.values(porCoach)
    .map(c => ({ nome: c.nome, ...media(c.notas) }))
    .filter(c => c.n > 0)
    .sort((a, b) => parseFloat(b.texto.replace(',', '.')) - parseFloat(a.texto.replace(',', '.')))

  const selectCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white'

  return (
    <div>
      <PageHeader
        title="Avaliações de aula"
        subtitle="Feedback dos alunos sobre aulas e professores — visível só para a equipe"
      />

      {/* Filtros */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 uppercase tracking-wide">Unidade</label>
            <select className={selectCls} value={fUnidade} onChange={e => setFUnidade(e.target.value)}>
              <option value="">Todas</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 uppercase tracking-wide">Coach</label>
            <select className={selectCls} value={fCoach} onChange={e => setFCoach(e.target.value)}>
              <option value="">Todos</option>
              {coachesUnicos.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 uppercase tracking-wide">De</label>
            <input type="date" className={selectCls} value={fInicio} onChange={e => setFInicio(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 uppercase tracking-wide">Até</label>
            <input type="date" className={selectCls} value={fFim} onChange={e => setFFim(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 uppercase tracking-wide">Ordenar por</label>
            <select className={selectCls} value={fOrdem} onChange={e => setFOrdem(e.target.value as 'recente' | 'aula')}>
              <option value="recente">Últimas avaliadas</option>
              <option value="aula">Data da aula</option>
            </select>
          </div>
          {(fUnidade || fCoach || fInicio || fFim) && (
            <button
              onClick={() => { setFUnidade(''); setFCoach(''); setFInicio(''); setFFim('') }}
              className="text-sm text-gray-400 underline pb-2"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <KpiCard label="Avaliações" value={String(filtradas.length)} />
        <KpiCard label="Aula" value={mAula.texto} sub={`${mAula.n} notas`} />
        <KpiCard label="Professor" value={mProf.texto} sub={`${mProf.n} notas`} />
        <KpiCard label="Música" value={mMusica.texto} sub={`${mMusica.n} notas`} />
        <KpiCard label="Ambiente" value={mAmb.texto} sub={`${mAmb.n} notas`} />
      </div>

      {/* Média do professor por coach */}
      {resumoCoach.length > 0 && (
        <div className="card mb-4">
          <div className="text-sm font-medium text-gray-700 mb-3">Média do professor por coach</div>
          <div className="flex flex-wrap gap-2">
            {resumoCoach.map((c, i) => (
              <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-700">{c.nome}</span>
                <span className="ml-2 font-semibold text-primary-700">{c.texto}<span className="text-amber-400"> ★</span></span>
                <span className="ml-1 text-xs text-gray-400">({c.n})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="card">
        {filtradas.length === 0 ? (
          <EmptyState message="Nenhuma avaliação no filtro selecionado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left pb-3 pr-3">Data</th>
                  <th className="text-left pb-3 pr-3">Aula</th>
                  <th className="text-left pb-3 pr-3">Coach</th>
                  <th className="text-center pb-3 pr-3">Aula</th>
                  <th className="text-center pb-3 pr-3">Prof.</th>
                  <th className="text-center pb-3 pr-3">Música</th>
                  <th className="text-center pb-3 pr-3">Ambiente</th>
                  <th className="text-left pb-3 pr-3">Comentário</th>
                  <th className="text-left pb-3">Aluno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">
                      {dataBR(a.data_aula)}{a.horario ? ` ${a.horario}` : ''}
                      <div className="text-xs text-gray-400">avaliada {dataHoraBR(a.criado_em)}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-700 whitespace-nowrap">
                      {tipoLabel(a.tipo_aula)}
                      <div className="text-xs text-gray-400">{unidades.find(u => u.id === a.unidade_id)?.nome || ''}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">{a.coach_nome || '—'}</td>
                    <td className="py-2.5 pr-3 text-center"><Nota valor={a.nota_aula} /></td>
                    <td className="py-2.5 pr-3 text-center"><Nota valor={a.nota_professor} /></td>
                    <td className="py-2.5 pr-3 text-center"><Nota valor={a.nota_musica} /></td>
                    <td className="py-2.5 pr-3 text-center"><Nota valor={a.nota_ambiente} /></td>
                    <td className="py-2.5 pr-3 text-gray-600 max-w-xs whitespace-pre-wrap">{a.comentario || <span className="text-gray-300">—</span>}</td>
                    <td className="py-2.5 text-gray-500 whitespace-nowrap">{a.clientes?.nome || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
