'use client'
import { useEffect, useState } from 'react'
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
    return unidadeSel === 'ambas' ? unidades : unidades.filter(u => u.id === unidadeSel)
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
      .select('coach_id, coach_nome, nota_professor, nota_aula, dispensado')
      .eq('origem', 'club').eq('dispensado', false)
      .in('unidade_id', unitIds).gte('data_aula', dataIni).lte('data_aula', dataFim))

    // Agrupa reservas por ocorrência
    const reservasPorOc: Record<string, any[]> = {}
    for (const r of reservas) (reservasPorOc[r.ocorrencia_id] ||= []).push(r)

    // Buckets
    const geral = novoBucket()
    const porUnidade: Record<string, Bucket> = {}
    const porDia:     Bucket[] = Array.from({ length: 7 }, novoBucket)
    const porHorario: Record<string, Bucket> = {}
    const porTipo:    Record<string, Bucket> = {}
    const porCoach:   Record<string, { nome: string; b: Bucket }> = {}
    const alunosUnicos = new Set<string>()

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
      for (const r of rs) {
        if (r.status === 'cancelado' || r.status === 'cancelada') continue
        reserva++
        if (r.status === 'presente') pres++
        else if (r.status === 'falta') falta++
        if (r.cliente_id) alunosUnicos.add(r.cliente_id)
      }

      const aplicar = (b: Bucket) => {
        b.nAulas++; b.somaCap += cap; b.somaReserva += reserva
        b.somaPresente += pres; b.somaFalta += falta
      }
      aplicar(geral)
      aplicar((porUnidade[unidadeId] ||= novoBucket()))
      aplicar(porDia[dia])
      aplicar((porHorario[hora] ||= novoBucket()))
      aplicar((porTipo[tipo] ||= novoBucket()))
      aplicar((porCoach[coachId] ||= { nome: coachNome, b: novoBucket() }).b)
    }

    // Notas por coach
    const notaPorCoach: Record<string, { soma: number; n: number }> = {}
    for (const a of avals) {
      const nota = a.nota_professor ?? a.nota_aula
      if (a.coach_id == null || nota == null) continue
      const acc = (notaPorCoach[a.coach_id] ||= { soma: 0, n: 0 })
      acc.soma += Number(nota); acc.n++
    }

    setRel({
      geral,
      porUnidade,
      porDia,
      porHorario: Object.entries(porHorario).sort((a, b) => a[0].localeCompare(b[0])),
      porTipo:    Object.entries(porTipo).sort((a, b) => ocupacao(b[1]) - ocupacao(a[1])),
      porCoach:   Object.entries(porCoach)
        .map(([id, v]) => ({ id, nome: v.nome, b: v.b, nota: notaPorCoach[id] }))
        .sort((a, b) => ocupacao(b.b) - ocupacao(a.b)),
      totalReservas: geral.somaReserva,
      alunosUnicos: alunosUnicos.size,
    })
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

      {!carregando && rel && rel.geral.nAulas > 0 && (
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
