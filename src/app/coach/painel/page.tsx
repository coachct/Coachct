'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fmt } from '@/lib/utils'
import { Users, ClipboardList, BarChart2, Tag } from 'lucide-react'

export default function CoachPainelPage() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [coach, setCoach] = useState<any>(null)
  const [stats, setStats] = useState({
    aulasHoje: 0,
    aulasMes: 0,
    slotsSemana: 0,
    aulasMesPassado: 0,
  })
  const [ultimasAulas, setUltimasAulas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const hoje = new Date()
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()
  const mesNome = hoje.toLocaleDateString('pt-BR', { month: 'long' })
  const diaSemana = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  const mesPassado = mes === 1 ? 12 : mes - 1
  const anoMesPassado = mes === 1 ? ano - 1 : ano

  useEffect(() => {
    if (perfil?.id) loadData()
  }, [perfil])

  async function loadData() {
    // Busca dados do coach
    const { data: coachData } = await supabase
      .from('coaches')
      .select('*')
      .eq('user_id', perfil!.id)
      .single()

    if (!coachData) { setLoading(false); return }
    setCoach(coachData)

    const inicioMes = `${ano}-${String(mes).padStart(2,'0')}-01`
    const fimMes = `${ano}-${String(mes).padStart(2,'0')}-31`
    const inicioMesPassado = `${anoMesPassado}-${String(mesPassado).padStart(2,'0')}-01`
    const fimMesPassado = `${anoMesPassado}-${String(mesPassado).padStart(2,'0')}-31`
    const inicioHoje = hoje.toISOString().split('T')[0]
    const fimHoje = inicioHoje + 'T23:59:59'

    const [
      { count: aulasHoje },
      { count: aulasMes },
      { count: aulasMesPassado },
      { data: horarios },
      { data: ultimas },
    ] = await Promise.all([
      supabase.from('aulas').select('*', { count: 'exact', head: true })
        .eq('coach_id', coachData.id)
        .eq('status', 'finalizada')
        .gte('horario_agendado', inicioHoje)
        .lte('horario_agendado', fimHoje),
      supabase.from('aulas').select('*', { count: 'exact', head: true })
        .eq('coach_id', coachData.id)
        .eq('status', 'finalizada')
        .gte('horario_agendado', inicioMes)
        .lte('horario_agendado', fimMes),
      supabase.from('aulas').select('*', { count: 'exact', head: true })
        .eq('coach_id', coachData.id)
        .eq('status', 'finalizada')
        .gte('horario_agendado', inicioMesPassado)
        .lte('horario_agendado', fimMesPassado),
      supabase.from('coach_horarios').select('*')
        .eq('coach_id', coachData.id)
        .eq('ativo', true),
      supabase.from('aulas').select('*, alunos(nome), treinos(nome)')
        .eq('coach_id', coachData.id)
        .eq('status', 'finalizada')
        .order('finalizada_em', { ascending: false })
        .limit(5),
    ])

    // Calcula slots disponíveis na semana atual
    const diaSemanaHoje = hoje.getDay() // 0=dom, 1=seg...
    const slotsSemana = (horarios || []).filter(h => h.dia_semana >= diaSemanaHoje).length

    setStats({
      aulasHoje: aulasHoje || 0,
      aulasMes: aulasMes || 0,
      slotsSemana,
      aulasMesPassado: aulasMesPassado || 0,
    })
    setUltimasAulas(ultimas || [])
    setLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!coach) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-sm">Coach não encontrado. Contate o administrador.</p>
    </div>
  )

  const bonus = (stats.aulasMes * (coach.adicional_por_aula || 0))
  const totalSlotsGrade = stats.slotsSemana
  const aproveitamento = totalSlotsGrade > 0
    ? Math.round((stats.aulasHoje / totalSlotsGrade) * 100)
    : 0

  const mesesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Olá, {coach.nome.split(' ')[0]}! 👋</h1>
        <p className="text-sm text-gray-400 capitalize">{diaSemana}</p>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">Aulas hoje</div>
          <div className="text-2xl font-bold text-gray-900">{stats.aulasHoje}</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">Aulas em {mesNome}</div>
          <div className="text-2xl font-bold text-gray-900">{stats.aulasMes}</div>
          {stats.aulasMesPassado > 0 && (
            <div className={`text-xs mt-1 ${stats.aulasMes >= stats.aulasMesPassado ? 'text-green-600' : 'text-red-500'}`}>
              {stats.aulasMes >= stats.aulasMesPassado ? '↑' : '↓'} vs {mesesNomes[mesPassado-1]} ({stats.aulasMesPassado})
            </div>
          )}
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">Bônus no mês</div>
          <div className="text-2xl font-bold text-primary-700">{fmt(bonus)}</div>
          <div className="text-xs text-gray-400 mt-1">R${coach.adicional_por_aula}/aula</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">Slots restantes</div>
          <div className="text-2xl font-bold text-blue-600">{stats.slotsSemana}</div>
          <div className="text-xs text-gray-400 mt-1">ainda esta semana</div>
        </div>
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button onClick={() => router.push('/coach/alunos')}
          className="card flex items-center gap-3 hover:border-primary-200 transition-colors text-left">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <Users size={18} className="text-green-700" />
          </div>
          <div>
            <div className="font-medium text-sm text-gray-900">Alunos</div>
            <div className="text-xs text-gray-400">Buscar ou cadastrar</div>
          </div>
        </button>
        <button onClick={() => router.push('/coach/treino')}
          className="card flex items-center gap-3 hover:border-primary-200 transition-colors text-left">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <ClipboardList size={18} className="text-orange-700" />
          </div>
          <div>
            <div className="font-medium text-sm text-gray-900">Registrar aula</div>
            <div className="text-xs text-gray-400">Iniciar agora</div>
          </div>
        </button>
        <button onClick={() => router.push('/coach/historico')}
          className="card flex items-center gap-3 hover:border-primary-200 transition-colors text-left">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <BarChart2 size={18} className="text-purple-700" />
          </div>
          <div>
            <div className="font-medium text-sm text-gray-900">Histórico</div>
            <div className="text-xs text-gray-400">Evolução de cargas</div>
          </div>
        </button>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
            <Tag size={18} className="text-yellow-700" />
          </div>
          <div>
            <div className="font-medium text-sm text-gray-900">Treinos ativos</div>
            <div className="text-xs text-gray-400 capitalize">{mesNome}</div>
          </div>
        </div>
      </div>

      {/* Últimas aulas */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Últimas aulas registradas</h2>
        {ultimasAulas.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-6 italic">
            Nenhuma aula registrada ainda este mês.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {ultimasAulas.map(aula => (
              <div key={aula.id} className="py-2.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                  {aula.alunos?.nome?.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{aula.alunos?.nome}</div>
                  <div className="text-xs text-gray-400">
                    {aula.treinos?.nome} · {new Date(aula.finalizada_em).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
