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
// RETORNO= faturamento de cada aula pela RPC club_faturamento_aulas — a mesma conta
//          da tela "Faturamento por aula · Club" (regras em
//          supabase/club-faturamento-aulas.sql; valores em club_valores_faturamento).
// ─────────────────────────────────────────────────────────────────────────────

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  importado: 'Migração', avulso: 'Avulso/Pacote', multas: 'Multas',
}

// categoria → colunas da RPC
const CATEGORIAS: [string, string, string][] = [
  ['wellhub', 'qtd_wellhub', 'fat_wellhub'],
  ['totalpass', 'qtd_totalpass', 'fat_totalpass'],
  ['classpass', 'qtd_classpass', 'fat_classpass'],
  ['importado', 'qtd_migracao', 'fat_migracao'],
  ['avulso', 'qtd_creditos', 'fat_creditos'],
  ['multas', 'qtd_multas', 'fat_multas'],
]

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

    // Aulas do mês até hoje (uma linha por ocorrência), em blocos de 1000
    const aulas: any[] = []
    for (let ini = 0; ; ini += 1000) {
      const { data, error } = await supabase
        .rpc('club_faturamento_aulas', { p_inicio: inicioMes, p_fim: hoje, p_unidade_id: null })
        .order('data').order('horario').order('ocorrencia_id')
        .range(ini, ini + 999)
      if (error) { console.error('Erro ao calcular faturamento Club:', error); break }
      aulas.push(...(data || []))
      if (!data || data.length < 1000) break
    }

    const acc: Record<string, CoachLinha> = {}
    let semValor = 0
    for (const a of aulas) {
      const cid = a.coach_id || 'sem'
      const linha = (acc[cid] ||= {
        coach_id: cid, nome: a.coach_nome || 'A definir', valor_aula: Number(a.custo_coach) || 0,
        aulas: 0, faturamento: 0, porTipo: {},
      })
      linha.aulas++
      linha.faturamento += Number(a.faturamento) || 0
      semValor += Number(a.sem_valor) || 0
      for (const [cat, qtd, fat] of CATEGORIAS) {
        const b = (linha.porTipo[cat] ||= { qtd: 0, valor: 0 })
        b.qtd += Number(a[qtd]) || 0
        b.valor += Number(a[fat]) || 0
      }
    }

    const arr = Object.values(acc).sort((a, b) => {
      const ma = a.faturamento - a.aulas * a.valor_aula
      const mb = b.faturamento - b.aulas * b.valor_aula
      return mb - ma
    })
    setLinhas(arr)
    setNaoClass(semValor)
    setCarregando(false)
  }

  const fatT = linhas.reduce((s, l) => s + l.faturamento, 0)
  const custoT = linhas.reduce((s, l) => s + l.aulas * l.valor_aula, 0)
  const aulasT = linhas.reduce((s, l) => s + l.aulas, 0)

  if (loading || carregando) return <Spinner />

  return (
    <div>
      <PageHeader title="Custo × Retorno · Club" subtitle={`Coaches de Lift, LFG e Running — ${nomeMes} (aulas dadas até hoje)`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Faturamento total" value={fmt(fatT)} sub="presenças, faltas e multas" subColor="text-primary-600" />
        <KpiCard label="Custo total" value={fmt(custoT)} sub="aulas × valor/aula" subColor="text-danger-600" />
        <KpiCard label="Margem bruta" value={fmt(fatT - custoT)} sub={`${fatT > 0 ? ((fatT - custoT) / fatT * 100).toFixed(1) : 0}%`} subColor="text-primary-600" />
        <KpiCard label="Aulas dadas" value={String(aulasT)} sub="no período" subColor="text-gray-400" />
      </div>

      {naoClass > 0 && (
        <div className="mb-4 text-xs text-warning-700 bg-warning-50 border border-amber-200 rounded-xl px-4 py-2">
          ⚠ {naoClass} presença(s)/falta(s) entraram sem valor (R$ 0) — normalmente créditos da migração. Defina o valor em Faturamento por aula · Club → Valores.
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
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{l.nome}</div>
                    <div className="text-xs text-gray-400">Coach Club · R${l.valor_aula}/aula</div>
                  </div>
                  <span className={`badge badge-${margem >= 0 ? 'green' : 'red'}`}>{margem >= 0 ? 'Positivo' : 'Negativo'}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
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
