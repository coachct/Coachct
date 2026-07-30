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

function media(vals: (number | null)[]): { texto: string; n: number; num: number | null } {
  const validos = vals.filter((v): v is number => v != null)
  if (!validos.length) return { texto: '—', n: 0, num: null }
  const m = validos.reduce((s, v) => s + v, 0) / validos.length
  return { texto: m.toFixed(1).replace('.', ','), n: validos.length, num: m }
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

  // Drawer de histórico por aluno
  const [drawerCliente, setDrawerCliente] = useState<{ id: string; nome: string } | null>(null)
  const [drawerAvals, setDrawerAvals] = useState<any[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  // Resposta ao comentário do aluno (modal)
  const [respAval, setRespAval] = useState<any>(null)   // avaliação em edição
  const [respTexto, setRespTexto] = useState('')
  const [respSalvando, setRespSalvando] = useState(false)
  const [respErro, setRespErro] = useState('')
  const [respAviso, setRespAviso] = useState('')

  function abrirResposta(a: any) {
    setRespAval(a)
    setRespTexto(a.resposta || '')
    setRespErro('')
    setRespAviso('')
  }

  function fecharResposta() {
    if (respSalvando) return
    setRespAval(null)
    setRespTexto('')
    setRespErro('')
  }

  async function salvarResposta() {
    if (!respAval) return
    const avaliacaoId = respAval.id
    const texto = respTexto.trim()
    if (!texto) { setRespErro('Escreva a resposta antes de enviar.'); return }
    setRespSalvando(true)
    setRespErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const t = session?.access_token
      if (!t) { setRespErro('Sessão expirada. Recarregue a página.'); setRespSalvando(false); return }
      const res = await fetch('/api/admin/responder-avaliacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ avaliacao_id: avaliacaoId, resposta: texto }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setRespErro(d?.error || 'Erro ao salvar. Tente novamente.'); setRespSalvando(false); return }
      // Atualiza estado local (lista e drawer) sem recarregar
      const patch = (arr: any[]) => arr.map(x => x.id === avaliacaoId
        ? { ...x, resposta: texto, resposta_em: new Date().toISOString() } : x)
      setAvaliacoes(prev => patch(prev))
      setDrawerAvals(prev => patch(prev))
      setRespSalvando(false)
      if (d?.aviso) { setRespAviso(d.aviso); return }  // mantém aberto pra mostrar o aviso
      setRespAval(null)
      setRespTexto('')
    } catch {
      setRespErro('Erro ao salvar. Tente novamente.')
      setRespSalvando(false)
    }
  }

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

  async function abrirHistorico(clienteId: string, nome: string) {
    setDrawerCliente({ id: clienteId, nome })
    setDrawerAvals([])
    setDrawerLoading(true)
    const { data } = await supabase.from('avaliacoes_aula')
      .select('*, clientes(nome)')
      .eq('cliente_id', clienteId)
      .eq('dispensado', false)
      .order('criado_em', { ascending: false })
      .order('data_aula', { ascending: false })
    setDrawerAvals(data || [])
    setDrawerLoading(false)
  }

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

  // Média geral da tela filtrada (pool das 4 dimensões) — base pra tarja do aluno
  const mGeralTela = media(
    filtradas.flatMap(a => [a.nota_aula, a.nota_professor, a.nota_musica, a.nota_ambiente])
  )

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

  // Bloco de comentário do aluno + resposta da equipe (usado na tabela e no drawer)
  function blocoComentario(a: any) {
    if (!a.comentario) return <span className="text-gray-300">—</span>
    return (
      <div>
        <div className="whitespace-pre-wrap text-gray-600">{a.comentario}</div>

        {a.resposta ? (
          <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2">
            <div className="text-[11px] font-medium text-emerald-700 mb-0.5">
              ✓ Respondido{a.resposta_em ? ` · ${dataHoraBR(a.resposta_em)}` : ''}
            </div>
            <div className="text-sm text-gray-600 whitespace-pre-wrap">{a.resposta}</div>
            <button
              onClick={() => abrirResposta(a)}
              className="text-[11px] text-gray-400 underline mt-1"
            >
              Editar / reenviar
            </button>
          </div>
        ) : (
          <button
            onClick={() => abrirResposta(a)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[#ff2d9b] border border-[#ff2d9b]/30 rounded-lg px-2.5 py-1 hover:bg-[#ff2d9b]/5 transition-colors"
          >
            ✉ Responder
          </button>
        )}
      </div>
    )
  }

  // Cálculos do drawer (aluno selecionado)
  const dAula = media(drawerAvals.map(a => a.nota_aula))
  const dProf = media(drawerAvals.map(a => a.nota_professor))
  const dMusica = media(drawerAvals.map(a => a.nota_musica))
  const dAmb = media(drawerAvals.map(a => a.nota_ambiente))
  const dGeralAluno = media(
    drawerAvals.flatMap(a => [a.nota_aula, a.nota_professor, a.nota_musica, a.nota_ambiente])
  )

  // Tarja: exigente / generoso / neutro (delta ±0,3 vs média geral da tela)
  let tarja: { texto: string; cls: string } | null = null
  if (dGeralAluno.num != null && mGeralTela.num != null) {
    const delta = dGeralAluno.num - mGeralTela.num
    if (delta >= 0.3) tarja = { texto: 'Avaliador generoso', cls: 'bg-emerald-50 text-emerald-700' }
    else if (delta <= -0.3) tarja = { texto: 'Avaliador exigente', cls: 'bg-rose-50 text-rose-700' }
    else tarja = { texto: 'Avaliador neutro', cls: 'bg-gray-100 text-gray-600' }
  }

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
                    <td className="py-2.5 pr-3 text-gray-600 max-w-xs align-top">{blocoComentario(a)}</td>
                    <td className="py-2.5 text-gray-500 whitespace-nowrap">
                      {a.cliente_id && a.clientes?.nome ? (
                        <button
                          onClick={() => abrirHistorico(a.cliente_id, a.clientes.nome)}
                          className="text-left text-gray-600 underline decoration-gray-200 hover:text-[#ff2d9b] hover:decoration-[#ff2d9b] transition-colors"
                        >
                          {a.clientes.nome}
                        </button>
                      ) : (
                        a.clientes?.nome || '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer de histórico do aluno */}
      {drawerCliente && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerCliente(null)}
          />
          <div className="relative w-full max-w-2xl h-full bg-white shadow-xl overflow-y-auto">
            {/* Cabeçalho */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-800">{drawerCliente.nome}</div>
                <a
                  href={`/admin/clientes?cliente=${drawerCliente.id}`}
                  className="text-sm text-[#ff2d9b] underline"
                >
                  Ver ficha completa
                </a>
              </div>
              <button
                onClick={() => setDrawerCliente(null)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4">
              {drawerLoading ? (
                <div className="py-10"><Spinner /></div>
              ) : drawerAvals.length === 0 ? (
                <EmptyState message="Nenhuma avaliação encontrada para este aluno." />
              ) : (
                <>
                  {/* Resumo */}
                  <div className="mb-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-sm text-gray-600">
                        {drawerAvals.length} {drawerAvals.length === 1 ? 'avaliação' : 'avaliações'}
                      </span>
                      {tarja && (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${tarja.cls}`}>
                          {tarja.texto}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Aula', m: dAula },
                        { label: 'Prof.', m: dProf },
                        { label: 'Música', m: dMusica },
                        { label: 'Ambiente', m: dAmb },
                      ].map((d) => (
                        <div key={d.label} className="bg-gray-50 rounded-lg px-3 py-2">
                          <div className="text-xs text-gray-400 uppercase tracking-wide">{d.label}</div>
                          <div className="text-sm font-semibold text-primary-700">
                            {d.m.texto}<span className="text-amber-400"> ★</span>
                            <span className="ml-1 text-xs font-normal text-gray-400">({d.m.n})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Histórico */}
                  <div className="space-y-3">
                    {drawerAvals.map((a) => (
                      <div key={a.id} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-sm font-medium text-gray-700">
                            {tipoLabel(a.tipo_aula)}
                            {a.coach_nome ? <span className="text-gray-400 font-normal"> · {a.coach_nome}</span> : ''}
                          </div>
                          <div className="text-xs text-gray-400 whitespace-nowrap">
                            {dataBR(a.data_aula)}{a.horario ? ` ${a.horario}` : ''}
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 mb-2">
                          {unidades.find(u => u.id === a.unidade_id)?.nome || ''}
                          {' · avaliada '}{dataHoraBR(a.criado_em)}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <span className="text-gray-500">Aula: <Nota valor={a.nota_aula} /></span>
                          <span className="text-gray-500">Prof.: <Nota valor={a.nota_professor} /></span>
                          <span className="text-gray-500">Música: <Nota valor={a.nota_musica} /></span>
                          <span className="text-gray-500">Ambiente: <Nota valor={a.nota_ambiente} /></span>
                        </div>
                        {a.comentario && (
                          <div className="mt-2 text-sm">{blocoComentario(a)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de resposta ao comentário */}
      {respAval && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={fecharResposta} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Cabeçalho */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-gray-800">Responder avaliação</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {respAval.clientes?.nome || 'Aluno'}
                  </div>
                </div>
                <button
                  onClick={fecharResposta}
                  className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {[
                  tipoLabel(respAval.tipo_aula),
                  unidades.find(u => u.id === respAval.unidade_id)?.nome,
                  dataBR(respAval.data_aula) + (respAval.horario ? ` ${respAval.horario}` : ''),
                  respAval.coach_nome,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>

            <div className="px-6 py-5">
              {/* Comentário original */}
              <div className="mb-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Comentário do aluno</div>
                <div className="bg-gray-50 border-l-2 border-gray-200 rounded-r-lg px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">
                  {respAval.comentario}
                </div>
              </div>

              {/* Resposta */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide mb-1 block">Sua resposta</label>
                <textarea
                  value={respTexto}
                  onChange={e => setRespTexto(e.target.value)}
                  placeholder="Escreva a resposta para o aluno…"
                  maxLength={2000}
                  rows={6}
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#ff2d9b] resize-y leading-relaxed"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-400">O aluno recebe por e-mail.</span>
                  <span className="text-xs text-gray-300">{respTexto.length}/2000</span>
                </div>
              </div>

              {respErro && <div className="mt-3 text-sm text-rose-600">{respErro}</div>}
              {respAviso && (
                <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {respAviso}
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              {respAviso ? (
                <button
                  onClick={() => { setRespAval(null); setRespTexto(''); setRespAviso('') }}
                  className="text-sm font-medium text-white bg-gray-700 rounded-lg px-4 py-2"
                >
                  Entendi
                </button>
              ) : (
                <>
                  <button
                    onClick={fecharResposta}
                    disabled={respSalvando}
                    className="text-sm text-gray-500 px-4 py-2 hover:text-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={salvarResposta}
                    disabled={respSalvando || !respTexto.trim()}
                    className="text-sm font-medium text-white bg-[#ff2d9b] rounded-lg px-5 py-2 disabled:opacity-50"
                  >
                    {respSalvando ? 'Enviando…' : 'Enviar e-mail'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
