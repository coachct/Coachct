'use client'
import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const ACCENT   = '#ff2d9b'
const CYAN     = '#00e5ff'
const VERDE    = '#2ddd8b'
const AMARELO  = '#ffaa00'
const VERMELHO = '#ff4444'

const DIAS_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function tipoLabel(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')    return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t || '—'
}
function tipoColor(t: string) {
  if (t === 'lift')              return CYAN
  if (t === 'lift_for_girls')    return ACCENT
  return VERDE
}
function pct(n: number) { return `${Math.round(n * 100)}%` }
function corOcupacao(o: number) {
  if (o >= 0.85) return VERDE
  if (o >= 0.5)  return AMARELO
  return VERMELHO
}

// Acumulador de métricas de um conjunto de ocorrências
type Bucket = {
  nAulas: number
  somaCap: number
  somaReserva: number   // reservado + presente + falta (ignora cancelado)
  somaPresente: number
  somaFalta: number
}
function novoBucket(): Bucket {
  return { nAulas: 0, somaCap: 0, somaReserva: 0, somaPresente: 0, somaFalta: 0 }
}
function ocupacao(b: Bucket)   { return b.somaCap > 0 ? b.somaReserva / b.somaCap : 0 }
function presenca(b: Bucket)   { const d = b.somaPresente + b.somaFalta; return d > 0 ? b.somaPresente / d : 0 }
function noShow(b: Bucket)     { const d = b.somaPresente + b.somaFalta; return d > 0 ? b.somaFalta / d : 0 }

// Agregado completo (o mesmo cálculo, aplicado ao total e a cada unidade separadamente)
type Agreg = {
  geral:     Bucket
  porDia:    Bucket[]
  porHorario: Record<string, Bucket>
  porTipo:   Record<string, Bucket>
  porCoach:  Record<string, { nome: string; b: Bucket }>
  alunos:    Set<string>
}
function novoAgreg(): Agreg {
  return {
    geral: novoBucket(),
    porDia: Array.from({ length: 7 }, novoBucket),
    porHorario: {},
    porTipo: {},
    porCoach: {},
    alunos: new Set<string>(),
  }
}
type Fatia = {
  cap: number; reserva: number; pres: number; falta: number
  dia: number; hora: string; tipo: string
  coachId: string; coachNome: string; clientes: string[]
}
function aplicarNoAgreg(a: Agreg, f: Fatia) {
  const soma = (b: Bucket) => {
    b.nAulas++; b.somaCap += f.cap; b.somaReserva += f.reserva
    b.somaPresente += f.pres; b.somaFalta += f.falta
  }
  soma(a.geral)
  soma(a.porDia[f.dia])
  soma(a.porHorario[f.hora] ||= novoBucket())
  soma(a.porTipo[f.tipo]    ||= novoBucket())
  soma((a.porCoach[f.coachId] ||= { nome: f.coachNome, b: novoBucket() }).b)
  for (const c of f.clientes) a.alunos.add(c)
}
function somaBuckets(bs: (Bucket | undefined)[]): Bucket {
  const t = novoBucket()
  for (const b of bs) {
    if (!b) continue
    t.nAulas += b.nAulas; t.somaCap += b.somaCap; t.somaReserva += b.somaReserva
    t.somaPresente += b.somaPresente; t.somaFalta += b.somaFalta
  }
  return t
}
function nomeCurto(n: string) { return (n || '').replace(/^just\s*club\s*/i, '').trim() || n }

// Busca paginada (o Supabase corta em 1000 linhas por requisição)
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

export default function AdminRelatorioClubPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [unidades,   setUnidades]   = useState<any[]>([])      // só Pinheiros + Vila Olímpia
  const [unidadeSel, setUnidadeSel] = useState<string>('ambas') // 'ambas' | unidade_id
  const [periodo,    setPeriodo]    = useState<'7' | '15' | '30' | 'custom'>('30')
  const [dataIni,    setDataIni]    = useState(dataLocalStr(new Date(Date.now() - 29 * 86400000)))
  const [dataFim,    setDataFim]    = useState(dataLocalStr(new Date()))

  const [carregando, setCarregando] = useState(false)
  const [rel,        setRel]        = useState<any>(null)

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregarUnidades() }, [perfil])

  // Ajusta as datas quando muda o preset de período
  useEffect(() => {
    if (periodo === 'custom') return
    const dias = Number(periodo)
    setDataFim(dataLocalStr(new Date()))
    setDataIni(dataLocalStr(new Date(Date.now() - (dias - 1) * 86400000)))
  }, [periodo])

  useEffect(() => {
    if (unidades.length) gerar()
  }, [unidades, unidadeSel, dataIni, dataFim])

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades')
      .select('id, nome, tipo').eq('tipo', 'club').eq('ativo', true).order('nome')
    // Somente Pinheiros e Vila Olímpia
    const alvo = (data || []).filter((u: any) => /pinheiros|ol[ií]mpia/i.test(u.nome || ''))
    setUnidades(alvo)
  }

  function unidadesAlvo(): any[] {
    return (unidadeSel === 'ambas' || unidadeSel === 'comparar')
      ? unidades
      : unidades.filter(u => u.id === unidadeSel)
  }

  async function gerar() {
    const alvo = unidadesAlvo()
    if (!alvo.length) { setRel(null); return }
    setCarregando(true)

    const unitIds = alvo.map(u => u.id)

    // 1) Ocorrências do período nessas unidades (join interno na grade pra filtrar por unidade)
    const ocs = await buscarTudo(() => supabase.from('club_ocorrencias')
      .select('id, aula_id, data, coach_id, coach_escalado:coaches!coach_id(id, nome), club_aulas!inner(unidade_id, tipo, horario, capacidade, coaches(id, nome))')
      .gte('data', dataIni).lte('data', dataFim).eq('status', 'ativa')
      .in('club_aulas.unidade_id', unitIds))

    // 2) Reservas de todas as ocorrências (em lotes pra não estourar a URL)
    const ocIds = ocs.map(o => o.id)
    const reservas: any[] = []
    for (const lote of chunk(ocIds, 150)) {
      if (!lote.length) continue
      const parte = await buscarTudo(() => supabase.from('club_reservas')
        .select('ocorrencia_id, status, cliente_id').in('ocorrencia_id', lote))
      reservas.push(...parte)
    }

    // 3) Avaliações do período (pra nota média por coach)
    const avals = await buscarTudo(() => supabase.from('avaliacoes_aula')
      .select('coach_id, coach_nome, nota_professor, nota_aula, dispensado, unidade_id')
      .eq('origem', 'club').eq('dispensado', false)
      .in('unidade_id', unitIds).gte('data_aula', dataIni).lte('data_aula', dataFim))

    // Agrupa reservas por ocorrência
    const reservasPorOc: Record<string, any[]> = {}
    for (const r of reservas) (reservasPorOc[r.ocorrencia_id] ||= []).push(r)

    // Buckets — o total e, em paralelo, um agregado completo por unidade
    const agregGeral = novoAgreg()
    const agregPorUnidade: Record<string, Agreg> = {}

    for (const oc of ocs) {
      const aula = (oc as any).club_aulas
      const unidadeId = aula?.unidade_id
      const cap   = aula?.capacidade || 0
      const tipo  = aula?.tipo || '—'
      const hora  = (aula?.horario || '').slice(0, 5) || '—'
      const dia   = new Date(oc.data + 'T12:00:00').getDay()
      const coachId   = (oc as any).coach_escalado?.id || aula?.coaches?.id || 'sem'
      const coachNome = (oc as any).coach_escalado?.nome || aula?.coaches?.nome || 'A definir'

      const rs = reservasPorOc[oc.id] || []
      let reserva = 0, pres = 0, falta = 0
      const clientes: string[] = []
      for (const r of rs) {
        if (r.status === 'cancelado' || r.status === 'cancelada') continue
        reserva++
        if (r.status === 'presente') pres++
        else if (r.status === 'falta') falta++
        if (r.cliente_id) clientes.push(r.cliente_id)
      }

      const fatia: Fatia = { cap, reserva, pres, falta, dia, hora, tipo, coachId, coachNome, clientes }
      aplicarNoAgreg(agregGeral, fatia)
      if (unidadeId) aplicarNoAgreg((agregPorUnidade[unidadeId] ||= novoAgreg()), fatia)
    }

    // Notas por coach (total e por unidade)
    const notaPorCoach: Record<string, { soma: number; n: number }> = {}
    const notaPorCoachUnidade: Record<string, Record<string, { soma: number; n: number }>> = {}
    for (const a of avals) {
      const nota = a.nota_professor ?? a.nota_aula
      if (a.coach_id == null || nota == null) continue
      const acc = (notaPorCoach[a.coach_id] ||= { soma: 0, n: 0 })
      acc.soma += Number(nota); acc.n++
      if (a.unidade_id) {
        const porUni = (notaPorCoachUnidade[a.unidade_id] ||= {})
        const accU = (porUni[a.coach_id] ||= { soma: 0, n: 0 })
        accU.soma += Number(nota); accU.n++
      }
    }

    const montar = (a: Agreg, notas: Record<string, { soma: number; n: number }>) => ({
      geral:      a.geral,
      porDia:     a.porDia,
      porHorario: Object.entries(a.porHorario).sort((x, y) => x[0].localeCompare(y[0])),
      porTipo:    Object.entries(a.porTipo).sort((x, y) => ocupacao(y[1]) - ocupacao(x[1])),
      porCoach:   Object.entries(a.porCoach)
        .map(([id, v]) => ({ id, nome: v.nome, b: v.b, nota: notas[id] }))
        .sort((x, y) => ocupacao(y.b) - ocupacao(x.b)),
      totalReservas: a.geral.somaReserva,
      alunosUnicos:  a.alunos.size,
    })

    const porUnidade: Record<string, Bucket> = {}
    const detalhePorUnidade: Record<string, any> = {}
    for (const [uid, ag] of Object.entries(agregPorUnidade)) {
      porUnidade[uid] = ag.geral
      detalhePorUnidade[uid] = montar(ag, notaPorCoachUnidade[uid] || {})
    }

    setRel({ ...montar(agregGeral, notaPorCoach), porUnidade, detalhePorUnidade })
    setCarregando(false)
  }

  const nomeUnidade = (id: string) => unidades.find(u => u.id === id)?.nome || '—'

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Relatório Club</h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
        Frequência, ocupação, presença e desempenho dos coaches — Pinheiros e Vila Olímpia.
      </p>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['7', '15', '30', 'custom'] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${periodo === p ? ACCENT : '#ddd'}`,
                background: periodo === p ? ACCENT : '#fff',
                color: periodo === p ? '#fff' : '#444',
              }}>
              {p === 'custom' ? 'Período' : `${p} dias`}
            </button>
          ))}
        </div>

        {periodo === 'custom' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }} />
            <span style={{ color: '#999' }}>até</span>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button onClick={() => setUnidadeSel('ambas')}
            style={{
              padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${unidadeSel === 'ambas' ? CYAN : '#ddd'}`,
              background: unidadeSel === 'ambas' ? CYAN : '#fff',
              color: unidadeSel === 'ambas' ? '#003' : '#444',
            }}>
            Ambas
          </button>
          {unidades.map(u => (
            <button key={u.id} onClick={() => setUnidadeSel(u.id)}
              style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${unidadeSel === u.id ? CYAN : '#ddd'}`,
                background: unidadeSel === u.id ? CYAN : '#fff',
                color: unidadeSel === u.id ? '#003' : '#444',
              }}>
              {u.nome}
            </button>
          ))}
          {unidades.length > 1 && (
            <button onClick={() => setUnidadeSel('comparar')}
              style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${unidadeSel === 'comparar' ? ACCENT : '#ddd'}`,
                background: unidadeSel === 'comparar' ? ACCENT : '#fff',
                color: unidadeSel === 'comparar' ? '#fff' : '#444',
              }}>
              Comparar
            </button>
          )}
        </div>
      </div>

      {carregando && (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Calculando…</div>
      )}

      {!carregando && rel && rel.geral.nAulas === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          Nenhuma aula encontrada nesse período.
        </div>
      )}

      {!carregando && rel && rel.geral.nAulas > 0 && unidadeSel === 'comparar' && (
        <Comparativo rel={rel} unidades={unidades} dataIni={dataIni} dataFim={dataFim} />
      )}

      {!carregando && rel && rel.geral.nAulas > 0 && unidadeSel !== 'comparar' && (
        <>
          {/* Cards-resumo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
            <Card titulo="Ocupação média"   valor={pct(ocupacao(rel.geral))} cor={corOcupacao(ocupacao(rel.geral))} />
            <Card titulo="Aulas dadas"      valor={String(rel.geral.nAulas)} cor="#111" />
            <Card titulo="Reservas"         valor={String(rel.totalReservas)} cor="#111" />
            <Card titulo="Alunos únicos"    valor={String(rel.alunosUnicos)} cor="#111" />
            <Card titulo="Presença"         valor={pct(presenca(rel.geral))} cor={VERDE} />
            <Card titulo="No-show"          valor={pct(noShow(rel.geral))} cor={VERMELHO} />
          </div>

          {/* Comparativo Pinheiros x Vila Olímpia */}
          {unidadeSel === 'ambas' && Object.keys(rel.porUnidade).length > 1 && (
            <Secao titulo="Comparativo por unidade">
              <Tabela
                colunas={['Unidade', 'Aulas', 'Ocupação', 'Presença', 'No-show', 'Reservas']}
                linhas={Object.entries(rel.porUnidade).map(([id, b]: any) => [
                  nomeUnidade(id), b.nAulas, barra(ocupacao(b)), pct(presenca(b)),
                  <span style={{ color: VERMELHO }}>{pct(noShow(b))}</span>, b.somaReserva,
                ])}
              />
            </Secao>
          )}

          {/* Dias da semana */}
          <Secao titulo="Dias da semana">
            <Tabela
              colunas={['Dia', 'Aulas', 'Ocupação', 'Presença', 'No-show']}
              linhas={rel.porDia
                .map((b: Bucket, i: number) => ({ b, i }))
                .filter((x: any) => x.b.nAulas > 0)
                .sort((a: any, b: any) => ocupacao(b.b) - ocupacao(a.b))
                .map((x: any) => [
                  DIAS_SEMANA_LABEL[x.i], x.b.nAulas, barra(ocupacao(x.b)),
                  pct(presenca(x.b)), <span style={{ color: VERMELHO }}>{pct(noShow(x.b))}</span>,
                ])}
            />
          </Secao>

          {/* Horários */}
          <Secao titulo="Horários (ocupação)">
            <Tabela
              colunas={['Horário', 'Aulas', 'Ocupação', 'Presença', 'No-show']}
              linhas={rel.porHorario
                .filter(([, b]: any) => b.nAulas > 0)
                .sort((a: any, b: any) => ocupacao(b[1]) - ocupacao(a[1]))
                .map(([h, b]: any) => [
                  h, b.nAulas, barra(ocupacao(b)),
                  pct(presenca(b)), <span style={{ color: VERMELHO }}>{pct(noShow(b))}</span>,
                ])}
            />
          </Secao>

          {/* Coaches */}
          <Secao titulo="Coaches">
            <Tabela
              colunas={['Coach', 'Aulas', 'Alunos', 'Ocupação', 'Presença', 'No-show', 'Nota']}
              linhas={rel.porCoach
                .filter((c: any) => c.b.nAulas > 0)
                .map((c: any) => [
                  c.nome, c.b.nAulas, c.b.somaPresente, barra(ocupacao(c.b)),
                  pct(presenca(c.b)), <span style={{ color: VERMELHO }}>{pct(noShow(c.b))}</span>,
                  c.nota ? `${(c.nota.soma / c.nota.n).toFixed(1)} (${c.nota.n})` : '—',
                ])}
            />
          </Secao>

          {/* Tipos de aula */}
          <Secao titulo="Tipos de aula">
            <Tabela
              colunas={['Tipo', 'Aulas', 'Ocupação', 'Presença', 'Reservas']}
              linhas={rel.porTipo.map(([t, b]: any) => [
                <span style={{ color: tipoColor(t), fontWeight: 700 }}>{tipoLabel(t)}</span>,
                b.nAulas, barra(ocupacao(b)), pct(presenca(b)), b.somaReserva,
              ])}
            />
          </Secao>

          <p style={{ color: '#aaa', fontSize: 12, marginTop: 24 }}>
            Ocupação = reservas ativas ÷ capacidade. Presença = presentes ÷ (presentes + faltas).
            Período: {dataIni} a {dataFim}.
          </p>
        </>
      )}
    </div>
  )
}

// ---- Componentes de apresentação -------------------------------------------

function Card({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor }}>{valor}</div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: any }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, color: '#222' }}>{titulo}</h2>
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function Tabela({ colunas, linhas }: { colunas: string[]; linhas: any[][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: '#fafafa', textAlign: 'left' }}>
          {colunas.map((c, i) => (
            <th key={i} style={{ padding: '10px 14px', color: '#888', fontWeight: 700, fontSize: 12,
              textAlign: i === 0 ? 'left' : 'center' }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, r) => (
          <tr key={r} style={{ borderTop: '1px solid #f0f0f0' }}>
            {linha.map((cel, c) => (
              <td key={c} style={{ padding: '10px 14px', textAlign: c === 0 ? 'left' : 'center',
                fontWeight: c === 0 ? 700 : 500, color: c === 0 ? '#111' : '#444' }}>{cel}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---- Modo comparativo (unidade x unidade) ----------------------------------

type LinhaComp = { chave: string; label: any; por: Record<string, Bucket>; extra: Record<string, any> }
type Metrica   = { titulo: string; render: (b: Bucket, uid: string, l: LinhaComp) => any }

const METRICAS_PADRAO: Metrica[] = [
  { titulo: 'Aulas', render: b => b.nAulas },
  { titulo: 'Ocup.', render: b => <span style={{ color: corOcupacao(ocupacao(b)), fontWeight: 700 }}>{pct(ocupacao(b))}</span> },
  { titulo: 'Reservas', render: b => b.somaReserva },
]

// Junta as linhas das duas unidades pela mesma chave (dia, horário, coach, tipo)
function montarLinhas(
  ids: string[],
  pega: (uid: string) => [string, any, Bucket, any?][],
): LinhaComp[] {
  const mapa: Record<string, LinhaComp> = {}
  for (const uid of ids) {
    for (const [chave, label, b, extra] of pega(uid)) {
      if (!b || b.nAulas === 0) continue
      const linha = (mapa[chave] ||= { chave, label, por: {}, extra: {} })
      linha.por[uid] = b
      if (extra !== undefined) linha.extra[uid] = extra
    }
  }
  return Object.values(mapa).sort((a, b) =>
    ocupacao(somaBuckets(ids.map(u => b.por[u]))) - ocupacao(somaBuckets(ids.map(u => a.por[u]))))
}

function Comparativo({ rel, unidades, dataIni, dataFim }: {
  rel: any; unidades: any[]; dataIni: string; dataFim: string
}) {
  const ids = unidades.map(u => u.id)
  const det = (uid: string) => rel.detalhePorUnidade?.[uid]
  const [uA, uB] = unidades
  const gA = det(uA?.id)?.geral as Bucket | undefined
  const gB = det(uB?.id)?.geral as Bucket | undefined
  const podeDelta = unidades.length === 2 && !!gA && !!gB && gA.nAulas > 0 && gB.nAulas > 0

  return (
    <>
      {/* Resumo lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12, marginBottom: 14 }}>
        {unidades.map(u => {
          const d = det(u.id)
          return (
            <div key={u.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, color: '#111' }}>{u.nome}</div>
              {!d || d.geral.nAulas === 0 ? (
                <div style={{ color: '#999', fontSize: 13, padding: '10px 0' }}>Sem aulas no período.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <Mini titulo="Ocupação" valor={pct(ocupacao(d.geral))} cor={corOcupacao(ocupacao(d.geral))} />
                  <Mini titulo="Aulas"    valor={String(d.geral.nAulas)} cor="#111" />
                  <Mini titulo="Reservas" valor={String(d.totalReservas)} cor="#111" />
                  <Mini titulo="Alunos"   valor={String(d.alunosUnicos)} cor="#111" />
                  <Mini titulo="Presença" valor={pct(presenca(d.geral))} cor={VERDE} />
                  <Mini titulo="No-show"  valor={pct(noShow(d.geral))} cor={VERMELHO} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Faixa de diferença */}
      {podeDelta && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 28 }}>
          <span style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>
            Diferença ({nomeCurto(uA.nome)} − {nomeCurto(uB.nome)}):
          </span>
          <Chip titulo="Ocupação" delta={ocupacao(gA!) - ocupacao(gB!)} bomQuandoMaior />
          <Chip titulo="Presença" delta={presenca(gA!) - presenca(gB!)} bomQuandoMaior />
          <Chip titulo="No-show"  delta={noShow(gA!)  - noShow(gB!)} />
          <Chip titulo="Aulas"    delta={gA!.nAulas - gB!.nAulas} bomQuandoMaior bruto sufixo="" />
        </div>
      )}

      <Secao titulo="Dias da semana">
        <TabelaComp primeira="Dia" unidades={unidades}
          linhas={montarLinhas(ids, uid => (det(uid)?.porDia || [])
            .map((b: Bucket, i: number) => [String(i), DIAS_SEMANA_LABEL[i], b] as [string, any, Bucket]))} />
      </Secao>

      <Secao titulo="Horários (ocupação)">
        <TabelaComp primeira="Horário" unidades={unidades}
          linhas={montarLinhas(ids, uid => (det(uid)?.porHorario || [])
            .map(([h, b]: any) => [h, h, b] as [string, any, Bucket]))} />
      </Secao>

      <Secao titulo="Coaches">
        <TabelaComp primeira="Coach" unidades={unidades}
          metricas={[
            ...METRICAS_PADRAO,
            { titulo: 'Nota', render: (_b, uid, l) => l.extra[uid] ? `${(l.extra[uid].soma / l.extra[uid].n).toFixed(1)}` : '—' },
          ]}
          linhas={montarLinhas(ids, uid => (det(uid)?.porCoach || [])
            .map((c: any) => [c.id, c.nome, c.b, c.nota] as [string, any, Bucket, any]))} />
      </Secao>

      <Secao titulo="Tipos de aula">
        <TabelaComp primeira="Tipo" unidades={unidades}
          linhas={montarLinhas(ids, uid => (det(uid)?.porTipo || [])
            .map(([t, b]: any) => [t, <span key={t} style={{ color: tipoColor(t), fontWeight: 700 }}>{tipoLabel(t)}</span>, b] as [string, any, Bucket]))} />
      </Secao>

      <p style={{ color: '#aaa', fontSize: 12, marginTop: 24 }}>
        Ocupação = reservas ativas ÷ capacidade. Presença = presentes ÷ (presentes + faltas).
        {podeDelta && ` Δ = ${nomeCurto(uA.nome)} − ${nomeCurto(uB.nome)}, em pontos percentuais de ocupação.`}
        {' '}Alunos únicos são contados dentro de cada unidade — quem treina nas duas aparece nas duas.
        Período: {dataIni} a {dataFim}.
      </p>
    </>
  )
}

function Mini({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 2 }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: cor }}>{valor}</div>
    </div>
  )
}

// Chip de diferença: delta em fração (0.07 = +7 p.p.)
function Chip({ titulo, delta, bomQuandoMaior, bruto, sufixo = ' p.p.' }:
  { titulo: string; delta: number; bomQuandoMaior?: boolean; bruto?: boolean; sufixo?: string }) {
  const n = Math.round(bruto ? delta : delta * 100)
  const bom = bomQuandoMaior ? n >= 0 : n <= 0
  const cor = n === 0 ? '#888' : (bom ? VERDE : VERMELHO)
  return (
    <span style={{
      display: 'inline-flex', gap: 6, alignItems: 'center', background: '#fff',
      border: '1px solid #eee', borderRadius: 999, padding: '5px 12px', fontSize: 12,
    }}>
      <span style={{ color: '#888', fontWeight: 600 }}>{titulo}</span>
      <strong style={{ color: cor }}>{n > 0 ? '+' : ''}{n}{sufixo}</strong>
    </span>
  )
}

function TabelaComp({ primeira, unidades, linhas, metricas = METRICAS_PADRAO }: {
  primeira: string; unidades: any[]; linhas: LinhaComp[]; metricas?: Metrica[]
}) {
  const ids = unidades.map(u => u.id)
  const th = { padding: '8px 10px', color: '#888', fontWeight: 700, fontSize: 11, textAlign: 'center' as const }

  if (!linhas.length) {
    return <div style={{ padding: 20, color: '#999', fontSize: 13 }}>Sem dados no período.</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: '#fafafa' }}>
            <th rowSpan={2} style={{ ...th, textAlign: 'left' }}>{primeira}</th>
            {unidades.map(u => (
              <th key={u.id} colSpan={metricas.length} style={{ ...th, borderLeft: '1px solid #ececec', color: '#111', fontSize: 12 }}>
                {nomeCurto(u.nome)}
              </th>
            ))}
            {ids.length === 2 && <th rowSpan={2} style={{ ...th, borderLeft: '1px solid #ececec' }}>Δ ocup.</th>}
          </tr>
          <tr style={{ background: '#fafafa' }}>
            {unidades.map(u => (
              <Fragment key={u.id}>
                {metricas.map((m, i) => (
                  <th key={m.titulo} style={{ ...th, borderLeft: i === 0 ? '1px solid #ececec' : undefined }}>{m.titulo}</th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => {
            const bA = l.por[ids[0]], bB = l.por[ids[1]]
            const temDelta = ids.length === 2 && bA && bB
            const d = temDelta ? Math.round((ocupacao(bA) - ocupacao(bB)) * 100) : 0
            return (
              <tr key={l.chave} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '9px 10px', fontWeight: 700, color: '#111' }}>{l.label}</td>
                {unidades.map(u => {
                  const b = l.por[u.id]
                  return (
                    <Fragment key={u.id}>
                      {metricas.map((m, i) => (
                        <td key={m.titulo} style={{
                          padding: '9px 10px', textAlign: 'center', color: '#444',
                          borderLeft: i === 0 ? '1px solid #f4f4f4' : undefined,
                        }}>
                          {b ? m.render(b, u.id, l) : <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                      ))}
                    </Fragment>
                  )
                })}
                {ids.length === 2 && (
                  <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, borderLeft: '1px solid #f4f4f4',
                    color: !temDelta ? '#ccc' : d === 0 ? '#888' : d > 0 ? VERDE : VERMELHO }}>
                    {!temDelta ? '—' : `${d > 0 ? '+' : ''}${d}`}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Mini-barra de ocupação para usar dentro das tabelas
function barra(o: number) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
      <div style={{ width: 70, height: 8, background: '#f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.round(o * 100))}%`, height: '100%', background: corOcupacao(o) }} />
      </div>
      <span style={{ fontWeight: 700, color: corOcupacao(o), minWidth: 36, textAlign: 'right' }}>{pct(o)}</span>
    </div>
  )
}
