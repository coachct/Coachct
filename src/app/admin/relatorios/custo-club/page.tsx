'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fmt } from '@/lib/utils'
import { KpiCard, PageHeader, Spinner } from '@/components/ui'

// ─────────────────────────────────────────────────────────────────────────────
// Custo × Retorno — coaches do Club (Lift / Lift for Girls / Running + Funcional)
//
// CUSTO  = ocorrências que o coach assumiu no mês (até hoje) × coaches.adicional_por_aula
//          (conta toda aula dada, independente de quantos alunos vieram)
// RETORNO= soma do valor de cada PRESENÇA (status='presente') por tipo_credito:
//          wellhub_*      → 32,50   (constante — valor de validação parceiro)
//          totalpass_*    → 33,00   (constante — valor de validação parceiro)
//          classpass      → 28,00   (constante — média acordada)
//          avulso_importado → 25,00 (constante — crédito migrado do sistema antigo)
//          avulso / avulso_<slug> → VENDA REAL: preço efetivo por sessão do cliente
//            = Σ valor_total ÷ Σ (quantidade × creditos_por_venda) das vendas
//              credito_treino daquele cliente (pool cross-unit). Fallback p/ catálogo
//              quando não há venda rastreável.
// ─────────────────────────────────────────────────────────────────────────────

const VAL_WELLHUB         = 32.50
const VAL_TOTALPASS       = 33.00
const VAL_CLASSPASS       = 28.00
const VAL_IMPORTADO       = 25.00
const VAL_AVULSO_FALLBACK = 64.90 // preço de catálogo do "Treino Avulso" — usado só quando o cliente não tem venda credito_treino rastreável

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

type CoachLinha = {
  coach_id: string
  nome: string
  valor_aula: number
  aulas: number
  faturamento: number
  // detalhamento do faturamento por origem (pra leitura)
  porTipo: Record<string, { qtd: number; valor: number }>
}

const TIPO_LABEL: Record<string, string> = {
  wellhub: 'Wellhub', totalpass: 'TotalPass', classpass: 'ClassPass',
  importado: 'Importado', avulso: 'Avulso/Pacote', outro: 'Não classificado',
}

function categoria(tipoCredito: string): keyof typeof TIPO_LABEL {
  const t = (tipoCredito || '').toLowerCase()
  if (t.startsWith('wellhub'))   return 'wellhub'
  if (t.startsWith('totalpass')) return 'totalpass'
  if (t === 'classpass')         return 'classpass'
  if (t === 'avulso_importado')  return 'importado'
  if (t.startsWith('avulso'))    return 'avulso'
  return 'outro'
}

export default function CustoRetornoClubPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [linhas, setLinhas] = useState<CoachLinha[]>([])
  const [naoClass, setNaoClass] = useState(0)
  const [carregando, setCarregando] = useState(true)

  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()
  const nomeMes = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregar() }, [perfil])

  async function carregar() {
    setCarregando(true)

    const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`
    const hoje = dataLocalStr(now)

    // Unidades Club (Pinheiros + Vila Olímpia)
    const { data: us } = await supabase.from('unidades')
      .select('id, nome, tipo').eq('tipo', 'club').eq('ativo', true)
    const unitIds = (us || []).filter((u: any) => /pinheiros|ol[ií]mpia/i.test(u.nome || '')).map((u: any) => u.id)
    if (!unitIds.length) { setLinhas([]); setNaoClass(0); setCarregando(false); return }

    // Coaches (valor/aula) — mapa por id
    const { data: cs } = await supabase.from('coaches').select('id, nome, adicional_por_aula')
    const coachInfo: Record<string, { nome: string; valor: number }> = {}
    ;(cs || []).forEach((c: any) => { coachInfo[c.id] = { nome: c.nome, valor: Number(c.adicional_por_aula) || 0 } })

    // 1) Ocorrências do mês até hoje, nessas unidades (com coach escalado + coach da grade)
    const ocs = await buscarTudo(() => supabase.from('club_ocorrencias')
      .select('id, aula_id, data, coach_id, coach_escalado:coaches!coach_id(id, nome), club_aulas!inner(unidade_id, coaches(id, nome))')
      .gte('data', inicioMes).lte('data', hoje).eq('status', 'ativa')
      .in('club_aulas.unidade_id', unitIds))

    // Mapa ocorrência → coach resolvido (escalado tem prioridade sobre o da grade)
    const ocCoach: Record<string, { id: string; nome: string }> = {}
    const acc: Record<string, CoachLinha> = {}
    const garante = (id: string, nome: string): CoachLinha => {
      if (!acc[id]) acc[id] = { coach_id: id, nome, valor_aula: coachInfo[id]?.valor ?? 0, aulas: 0, faturamento: 0, porTipo: {} }
      return acc[id]
    }

    for (const oc of ocs) {
      const esc  = (oc as any).coach_escalado
      const grade = (oc as any).club_aulas?.coaches
      const cid  = esc?.id || grade?.id || 'sem'
      const nome = esc?.nome || grade?.nome || 'A definir'
      ocCoach[oc.id] = { id: cid, nome }
      garante(cid, nome).aulas++   // custo: toda aula dada conta
    }

    // 2) Presenças dessas ocorrências (em lotes)
    const ocIds = ocs.map((o: any) => o.id)
    const presencas: any[] = []
    for (const lote of chunk(ocIds, 150)) {
      if (!lote.length) continue
      const parte = await buscarTudo(() => supabase.from('club_reservas')
        .select('ocorrencia_id, cliente_id, tipo_credito')
        .in('ocorrencia_id', lote).eq('status', 'presente'))
      presencas.push(...parte)
    }

    // 3) Preço efetivo por sessão (avulso/pacote) por cliente — só p/ quem tem presença avulso
    const clientesAvulso = new Set<string>()
    for (const p of presencas) {
      if (categoria(p.tipo_credito) === 'avulso' && p.cliente_id) clientesAvulso.add(p.cliente_id)
    }
    const precoAvulso: Record<string, number> = {}
    const idsAv = [...clientesAvulso]
    for (const lote of chunk(idsAv, 200)) {
      if (!lote.length) continue
      const vendas = await buscarTudo(() => supabase.from('vendas')
        .select('cliente_id, quantidade, valor_total, produtos!inner(creditos_por_venda, tipo)')
        .in('cliente_id', lote).eq('produtos.tipo', 'credito_treino').is('excluido_em', null))
      const somaVal: Record<string, number> = {}
      const somaSes: Record<string, number> = {}
      for (const v of vendas) {
        const cpv = Number((v as any).produtos?.creditos_por_venda) || 0
        const qtd = Number(v.quantidade) || 0
        const sessoes = qtd * cpv
        if (sessoes <= 0) continue
        somaVal[v.cliente_id] = (somaVal[v.cliente_id] || 0) + (Number(v.valor_total) || 0)
        somaSes[v.cliente_id] = (somaSes[v.cliente_id] || 0) + sessoes
      }
      for (const cid of Object.keys(somaSes)) {
        precoAvulso[cid] = somaSes[cid] > 0 ? somaVal[cid] / somaSes[cid] : VAL_AVULSO_FALLBACK
      }
    }

    // 4) Valora cada presença e soma no coach da ocorrência
    let semClassificacao = 0
    for (const p of presencas) {
      const coach = ocCoach[p.ocorrencia_id]
      if (!coach) continue
      const cat = categoria(p.tipo_credito)
      let valor = 0
      if      (cat === 'wellhub')   valor = VAL_WELLHUB
      else if (cat === 'totalpass') valor = VAL_TOTALPASS
      else if (cat === 'classpass') valor = VAL_CLASSPASS
      else if (cat === 'importado') valor = VAL_IMPORTADO
      else if (cat === 'avulso')    valor = precoAvulso[p.cliente_id] ?? VAL_AVULSO_FALLBACK
      else { semClassificacao++ }

      const linha = garante(coach.id, coach.nome)
      linha.faturamento += valor
      const b = (linha.porTipo[cat] ||= { qtd: 0, valor: 0 })
      b.qtd++; b.valor += valor
    }

    const arr = Object.values(acc).sort((a, b) => {
      const ma = a.faturamento - a.aulas * a.valor_aula
      const mb = b.faturamento - b.aulas * b.valor_aula
      return mb - ma
    })
    setLinhas(arr)
    setNaoClass(semClassificacao)
    setCarregando(false)
  }

  const fatT = linhas.reduce((s, l) => s + l.faturamento, 0)
  const custoT = linhas.reduce((s, l) => s + l.aulas * l.valor_aula, 0)
  const aulasT = linhas.reduce((s, l) => s + l.aulas, 0)

  if (loading || carregando) return <Spinner />

  return (
    <div>
      <PageHeader title="Custo × Retorno · Club" subtitle={`Coaches de Lift, LFG e Running — ${nomeMes} (presenças realizadas até hoje)`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Faturamento total" value={fmt(fatT)} sub="presenças valoradas" subColor="text-primary-600" />
        <KpiCard label="Custo total" value={fmt(custoT)} sub="aulas × valor/aula" subColor="text-danger-600" />
        <KpiCard label="Margem bruta" value={fmt(fatT - custoT)} sub={`${fatT > 0 ? ((fatT - custoT) / fatT * 100).toFixed(1) : 0}%`} subColor="text-primary-600" />
        <KpiCard label="Aulas dadas" value={String(aulasT)} sub="no período" subColor="text-gray-400" />
      </div>

      {naoClass > 0 && (
        <div className="mb-4 text-xs text-warning-700 bg-warning-50 border border-amber-200 rounded-xl px-4 py-2">
          ⚠ {naoClass} presença(s) com tipo de crédito não reconhecido entraram com valor R$ 0. Verifique se há novos tipos de plano a mapear.
        </div>
      )}

      {linhas.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">Nenhuma aula de Club registrada neste mês até agora.</div>
      ) : (
        <div className="space-y-4 mb-6">
          {linhas.map(l => {
            const custo = l.aulas * l.valor_aula
            const margem = l.faturamento - custo
            const margemPct = l.faturamento > 0 ? (margem / l.faturamento * 100).toFixed(1) : '0'
            const cats = Object.entries(l.porTipo).filter(([, b]) => b.qtd > 0)
            return (
              <div key={l.coach_id} className={`card border-l-4 ${margem >= 0 ? 'border-l-primary-400' : 'border-l-danger-400'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-800 text-sm font-semibold flex items-center justify-center flex-shrink-0">
                    {l.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{l.nome}</div>
                    <div className="text-xs text-gray-400">Coach Club · R${l.valor_aula}/aula</div>
                  </div>
                  <span className={`badge badge-${margem >= 0 ? 'green' : 'red'}`}>{margem >= 0 ? 'Positivo' : 'Negativo'}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[
                    { l: 'Aulas', v: String(l.aulas), c: 'text-gray-900' },
                    { l: 'Custo', v: fmt(custo), c: 'text-danger-600' },
                    { l: 'Faturamento', v: fmt(l.faturamento), c: 'text-primary-700' },
                    { l: 'Margem', v: fmt(margem), c: margem >= 0 ? 'text-primary-700' : 'text-danger-600' },
                  ].map(item => (
                    <div key={item.l} className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-400 mb-1">{item.l}</div>
                      <div className={`text-sm font-semibold ${item.c}`}>{item.v}</div>
                    </div>
                  ))}
                </div>

                {cats.length > 0 && (
                  <div className="text-xs text-gray-500">
                    <span className="text-gray-400">Margem: {margemPct}% · Origem do faturamento: </span>
                    {cats.map(([cat, b], i) => (
                      <span key={cat}>
                        {i > 0 ? ' · ' : ''}{TIPO_LABEL[cat]} {b.qtd} ({fmt(b.valor)})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
