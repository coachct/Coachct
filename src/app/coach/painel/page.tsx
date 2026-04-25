'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Aula, Coach } from '@/types'
import { fmt, calcCoachMetrics } from '@/lib/utils'
import { KpiCard, PageHeader, Spinner } from '@/components/ui'
import Link from 'next/link'

export default function CoachPainelPage() {
  const { user, perfil } = useAuth()
  const supabase = createClient()
  const [coach, setCoach] = useState<Coach | null>(null)
  const [aulas, setAulas] = useState<Aula[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const mes = now.getMonth() + 1
  const ano = now.getFullYear()

  useEffect(() => {
    if (!user) return
    async function load() {
      const { data: c } = await supabase.from('coaches').select('*').eq('user_id', user!.id).single()
      if (!c) { setLoading(false); return }
      setCoach(c)
      const inicioMes = `${ano}-${String(mes).padStart(2,'0')}-01`
      const { data: a } = await supabase.from('aulas').select('*, alunos(nome), treinos(nome)').eq('coach_id', c.id).gte('horario_agendado', inicioMes).order('horario_agendado', { ascending: false })
      setAulas(a || [])
      setLoading(false)
    }
    load()
  }, [user])

  if (loading) return <Spinner />
  if (!coach) return <div className="text-sm text-gray-500 p-4">Coach não encontrado. Contate o administrador.</div>

  const aulasMes = aulas.filter(a => a.status === 'finalizada').length
  const aulasHoje = aulas.filter(a => {
    const d = new Date(a.horario_agendado)
    return d.toDateString() === now.toDateString() && a.status === 'finalizada'
  }).length
  const metrics = calcCoachMetrics(coach, aulasMes, 54)
  const mesNome = now.toLocaleDateString('pt-BR', { month: 'long' })

  return (
    <div>
      <PageHeader
        title={`Olá, ${coach.nome.split(' ')[0]}!`}
        subtitle={now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
      />

      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiCard label="Aulas hoje" value={String(aulasHoje)} />
        <KpiCard label={`Aulas em ${mesNome}`} value={String(aulasMes)} />
        <KpiCard
          label="A receber"
          value={fmt(metrics.custo_total)}
          sub={`fixo ${fmt(metrics.custo_fixo)} + ${aulasMes}×R$${coach.adicional_por_aula}`}
          subColor="text-primary-600"
        />
      </div>

      {/* Ponto de equilíbrio */}
      <div className={`rounded-xl px-4 py-3 mb-6 text-sm ${metrics.breakeven_atingido ? 'bg-primary-50 border border-primary-100 text-primary-800' : 'bg-warning-50 border border-warning-200 text-warning-800'}`}>
        {metrics.breakeven_atingido
          ? `✓ Você já atingiu o ponto de equilíbrio! ${aulasMes - metrics.breakeven_aulas} aulas acima do mínimo de ${metrics.breakeven_aulas}.`
          : `⚠ Faltam ${metrics.breakeven_aulas - aulasMes} aulas para cobrir seu custo fixo de ${fmt(coach.salario_fixo)}.`}
      </div>

      {/* Ações rápidas */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/coach/alunos" className="card flex items-center gap-3 hover:border-primary-200 transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700 text-xl">👥</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Alunos</div>
            <div className="text-xs text-gray-400">Buscar ou cadastrar</div>
          </div>
        </Link>
        <Link href="/coach/treino" className="card flex items-center gap-3 hover:border-primary-200 transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-700 text-xl">💪</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Registrar aula</div>
            <div className="text-xs text-gray-400">Iniciar agora</div>
          </div>
        </Link>
        <Link href="/coach/historico" className="card flex items-center gap-3 hover:border-primary-200 transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 text-xl">📊</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Histórico</div>
            <div className="text-xs text-gray-400">Evolução de cargas</div>
          </div>
        </Link>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 text-xl">🏷️</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Treinos ativos</div>
            <div className="text-xs text-gray-400">{now.toLocaleDateString('pt-BR',{month:'long'})}</div>
          </div>
        </div>
      </div>

      {/* Últimas aulas */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Últimas aulas registradas</h2>
        {aulas.length === 0 && <div className="text-sm text-gray-400 text-center py-6">Nenhuma aula registrada ainda este mês.</div>}
        <div className="divide-y divide-gray-100">
          {aulas.slice(0, 8).map(a => (
            <div key={a.id} className="flex items-center gap-3 py-2.5">
              <div className="text-xs text-gray-400 w-14 flex-shrink-0">
                {new Date(a.horario_agendado).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 truncate">{(a as any).alunos?.nome || '—'}</div>
                <div className="text-xs text-gray-400">{(a as any).treinos?.nome || '—'}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === 'finalizada' ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                {a.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
