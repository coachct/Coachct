'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fmt } from '@/lib/utils'
import { Users, BarChart2, TrendingUp, TrendingDown, Clock, PlayCircle, AlertTriangle } from 'lucide-react'

const TURNOS = [{ label: 'Manhã' }, { label: 'Tarde' }, { label: 'Noite' }]
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

export default function CoachPainelPage() {
  const { perfil } = useAuth()
  const router = useRouter()
  const [coach, setCoach] = useState<any>(null)
  const [stats, setStats] = useState({ aulasHoje: 0, aulasMes: 0, slotsSemana: 0, aulasMesPassado: 0 })
  const [ultimasAulas, setUltimasAulas] = useState<any[]>([])
  const [alunosFieis, setAlunosFieis] = useState<any[]>([])
  const [alunosSumidos, setAlunosSumidos] = useState<any[]>([])
  const [heatmap, setHeatmap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [aulaAberta, setAulaAberta] = useState<any>(null)
  const [cancelando, setCancelando] = useState(false)
  const supabase = createClient()

  const hoje = new Date()
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()
  const mesNome = hoje.toLocaleDateString('pt-BR', { month: 'long' })
  const diaSemana = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const mesPassado = mes === 1 ? 12 : mes - 1
  const mesesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  useEffect(() => {
    if (perfil?.id) loadData()
    const timeout = setTimeout(() => setLoading(false), 5000)
    return () => clearTimeout(timeout)
  }, [perfil])

  async function loadData() {
    try {
      const { data: coachData } = await supabase
        .from('coaches').select('*').eq('user_id', perfil!.id).maybeSingle()
      if (!coachData) return
      setCoach(coachData)

      // ✅ usa API route — bypassa RLS
      const res = await fetch(`/api/aulas?painel=1&coach_id=${coachData.id}`)
      const json = await res.json()
      const {
        aulasHoje, aulasMes, aulasMesPassado,
        horarios, ultimas, todasAulas, alunosMap, aulaPendente
      } = json.data

      if (aulaPendente) {
        setAulaAberta(aulaPendente)
        return
      }

      const diaSemanaHoje = hoje.getDay()
      const slotsSemana = (horarios || []).filter((h: any) => h.dia_semana >= diaSemanaHoje).length

      setUltimasAulas(ultimas || [])

      const ha2semanas = new Date(hoje)
      ha2semanas.setDate(hoje.getDate() - 14)

      const contagemAlunos: Record<string, { nome: string; count: number; ultima: string }> = {}
      for (const aula of (todasAulas || [])) {
        const id = aula.aluno_id
        const nome = alunosMap[id] || 'Aluno'
        if (!contagemAlunos[id]) contagemAlunos[id] = { nome, count: 0, ultima: aula.horario_agendado }
        contagemAlunos[id].count++
        if (aula.horario_agendado > contagemAlunos[id].ultima) contagemAlunos[id].ultima = aula.horario_agendado
      }
      const sorted = Object.values(contagemAlunos).sort((a, b) => b.count - a.count)
      setAlunosFieis(sorted.slice(0, 3))

      const sumidos = Object.values(contagemAlunos)
        .filter(a => new Date(a.ultima) < ha2semanas)
        .sort((a, b) => new Date(a.ultima).getTime() - new Date(b.ultima).getTime())
        .slice(0, 3)
      setAlunosSumidos(sumidos)

      const hm: Record<string, number> = {}
      for (const aula of (todasAulas || [])) {
        const d = new Date(aula.horario_agendado)
        const dia = d.getDay()
        const hora = d.getHours()
        const turno = hora < 12 ? 'Manhã' : hora < 18 ? 'Tarde' : 'Noite'
        hm[`${dia}-${turno}`] = (hm[`${dia}-${turno}`] || 0) + 1
      }
      setHeatmap(hm)

      setStats({ aulasHoje, aulasMes, slotsSemana, aulasMesPassado })

    } catch (err) {
      console.error('Erro no painel:', err)
    } finally {
      setLoading(false)
    }
  }

  async function cancelarAula() {
    if (!aulaAberta) return
    setCancelando(true)
    await fetch('/api/aulas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: aulaAberta.id,
        status: 'cancelada',
        finalizada_em: new Date().toISOString(),
        observacoes: 'cancelada_pelo_coach',
      })
    })
    setAulaAberta(null)
    setCancelando(false)
    loadData()
  }

  const maxHeatmap = Math.max(1, ...Object.values(heatmap))

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (aulaAberta) return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={32} className="text-orange-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Aula em andamento!</h1>
          <p className="text-sm text-gray-500 mt-1">Você tem uma aula não finalizada.</p>
        </div>
        <div className="card mb-4 text-center">
          <div className="text-xs text-gray-400 mb-1">Aluno</div>
          <div className="font-semibold text-gray-900">{aulaAberta.alunos?.nome}</div>
          <div className="text-xs text-gray-400 mt-1">{aulaAberta.treinos?.nome}</div>
          <div className="text-xs text-gray-400 mt-1">
            Iniciada às {new Date(aulaAberta.iniciada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div className="space-y-2">
          <button onClick={() => router.push('/coach/treino')} className="btn btn-primary w-full gap-2 py-3">
            <PlayCircle size={16} /> Continuar aula
          </button>
          <button onClick={cancelarAula} disabled={cancelando} className="btn w-full text-red-500 hover:bg-red-50">
            {cancelando ? 'Cancelando...' : 'Cancelar esta aula'}
          </button>
        </div>
      </div>
    </div>
  )

  const bonus = stats.aulasMes * (coach?.adicional_por_aula || 0)

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Olá, {coach?.nome.split(' ')[0]}! 👋</h1>
        <p className="text-sm text-gray-400 capitalize">{diaSemana}</p>
      </div>

      <button onClick={() => router.push('/coach/treino')}
        className="w-full mb-5 bg-primary-400 hover:bg-primary-500 text-white rounded-2xl p-5 flex items-center gap-4 transition-colors shadow-sm">
        <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <PlayCircle size={32} className="text-white" />
        </div>
        <div className="text-left">
          <div className="text-lg font-bold text-white">Iniciar treino</div>
          <div className="text-sm text-white/80">Buscar aluno e registrar aula agora</div>
        </div>
      </button>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
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
          <div className="text-xs text-gray-400 mt-1">R${coach?.adicional_por_aula}/aula</div>
        </div>
        <div className="card text-center">
          <div className="text-xs text-gray-400 mb-1">Slots restantes</div>
          <div className="text-2xl font-bold text-blue-600">{stats.slotsSemana}</div>
          <div className="text-xs text-gray-400 mt-1">ainda esta semana</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
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
        <button onClick={() => router.push('/coach/historico')}
          className="card flex items-center gap-3 hover:border-primary-200 transition-colors text-left">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <BarChart2 size={18} className="text-purple-700" />
          </div>
          <div>
            <div className="font-medium text-sm text-gray-900">Histórico</div>
            <div className="text-xs text-gray-400">Minhas aulas</div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-green-600" /> Alunos mais fiéis
          </h2>
          {alunosFieis.length === 0 ? (
            <div className="text-xs text-gray-400 italic text-center py-3">Nenhum dado ainda</div>
          ) : (
            <div className="space-y-2">
              {alunosFieis.map((a, i) => (
                <div key={a.nome} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i===0?'bg-yellow-100 text-yellow-700':i===1?'bg-gray-100 text-gray-600':'bg-orange-100 text-orange-700'}`}>
                    {i+1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{a.nome}</div>
                    <div className="text-xs text-gray-400">{a.count} aulas no total</div>
                  </div>
                  <div className="text-xs text-green-600 font-medium">{a.count}×</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingDown size={14} className="text-red-500" /> Alunos sumidos
          </h2>
          {alunosSumidos.length === 0 ? (
            <div className="text-xs text-gray-400 italic text-center py-3">Nenhum aluno sumido 🎉</div>
          ) : (
            <div className="space-y-2">
              {alunosSumidos.map(a => {
                const dias = Math.floor((hoje.getTime() - new Date(a.ultima).getTime()) / (1000*60*60*24))
                return (
                  <div key={a.nome} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <TrendingDown size={12} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{a.nome}</div>
                      <div className="text-xs text-gray-400">última aula há {dias} dias</div>
                    </div>
                    <div className="text-xs text-red-500 font-medium">{dias}d</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock size={14} className="text-blue-600" /> Seus horários mais movimentados
        </h2>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr>
                <th className="text-gray-400 font-normal text-left pb-2 pr-3 w-16">Turno</th>
                {DIAS.slice(1).map(d => (
                  <th key={d} className="text-gray-400 font-normal text-center pb-2 px-1">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TURNOS.map(turno => (
                <tr key={turno.label}>
                  <td className="text-gray-500 py-1 pr-3 font-medium">{turno.label}</td>
                  {[1,2,3,4,5,6].map(dia => {
                    const val = heatmap[`${dia}-${turno.label}`] || 0
                    const intensity = val / maxHeatmap
                    const bg = val === 0 ? 'bg-gray-50' :
                      intensity < 0.33 ? 'bg-primary-100' :
                      intensity < 0.66 ? 'bg-primary-200' : 'bg-primary-400'
                    const txt = intensity >= 0.66 ? 'text-white' : 'text-primary-800'
                    return (
                      <td key={dia} className="px-1 py-1">
                        <div className={`h-8 rounded flex items-center justify-center text-xs font-medium ${bg} ${val > 0 ? txt : 'text-gray-300'}`}>
                          {val > 0 ? val : ''}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-50 border border-gray-200" /> Nenhuma</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-primary-100" /> Poucas</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-primary-200" /> Médio</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-primary-400" /> Muito</div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Últimas aulas registradas</h2>
        {ultimasAulas.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-6 italic">Nenhuma aula registrada ainda.</div>
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
