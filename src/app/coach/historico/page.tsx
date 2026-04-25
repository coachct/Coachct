'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Aluno, Exercicio } from '@/types'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'

export default function CoachHistoricoPage() {
  const { user } = useAuth()
  const supabase = createClient()
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [alunoSel, setAlunoSel] = useState('')
  const [exSel, setExSel] = useState('')
  const [historico, setHistorico] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: al }, { data: ex }] = await Promise.all([
        supabase.from('alunos').select('*').eq('ativo', true).order('nome'),
        supabase.from('exercicios').select('*, categorias(nome)').eq('ativo', true).order('nome'),
      ])
      setAlunos(al || [])
      setExercicios(ex || [])
      setLoading(false)
    }
    load()
  }, [])

  async function buscar() {
    if (!alunoSel) return
    setSearching(true)
    let query = supabase
      .from('registros_carga')
      .select('*, exercicios(nome, numero_maquina), aulas!inner(horario_agendado, aluno_id, coaches(nome))')
      .eq('aulas.aluno_id', alunoSel)
      .order('aulas.horario_agendado', { ascending: false })
      .limit(50)

    if (exSel) query = query.eq('exercicio_id', exSel)

    const { data } = await query
    setHistorico(data || [])
    setSearching(false)
  }

  if (loading) return <Spinner />

  const progresso = historico.length >= 2
    ? (historico[0]?.carga_kg || 0) - (historico[historico.length - 1]?.carga_kg || 0)
    : null

  return (
    <div>
      <PageHeader title="Histórico de treinos" subtitle="Evolução de cargas por aluno e exercício" />

      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="label">Aluno</label>
            <select className="input" value={alunoSel} onChange={e => setAlunoSel(e.target.value)}>
              <option value="">Selecionar aluno...</option>
              {alunos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Exercício (opcional)</label>
            <select className="input" value={exSel} onChange={e => setExSel(e.target.value)}>
              <option value="">Todos os exercícios</option>
              {exercicios.map(e => <option key={e.id} value={e.id}>{e.nome}{e.numero_maquina ? ` · Máq.${e.numero_maquina}` : ''}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={buscar} disabled={!alunoSel || searching} className="btn btn-primary w-full">
              {searching ? 'Buscando...' : 'Buscar histórico'}
            </button>
          </div>
        </div>
      </div>

      {historico.length > 0 && (
        <>
          {progresso !== null && (
            <div className={`rounded-xl px-4 py-3 mb-4 text-sm font-medium ${progresso > 0 ? 'bg-primary-50 text-primary-800' : progresso < 0 ? 'bg-danger-50 text-danger-700' : 'bg-gray-50 text-gray-600'}`}>
              {progresso > 0 ? `↑ Progresso de +${progresso} kg no período` : progresso < 0 ? `↓ Redução de ${Math.abs(progresso)} kg no período` : '→ Carga estável no período'}
            </div>
          )}

          <div className="card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left pb-3 pr-4">Data</th>
                    <th className="text-left pb-3 pr-4">Exercício</th>
                    <th className="text-left pb-3 pr-4">Máquina</th>
                    <th className="text-left pb-3 pr-4">Coach</th>
                    <th className="text-right pb-3 pr-4">Carga</th>
                    <th className="text-right pb-3 pr-4">Reps</th>
                    <th className="text-left pb-3">Obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historico.map((r, i) => (
                    <tr key={r.id} className={i === 0 ? 'font-medium' : ''}>
                      <td className="py-2.5 pr-4 text-gray-500 text-xs">
                        {new Date((r.aulas as any).horario_agendado).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-900">{r.exercicios?.nome || '—'}</td>
                      <td className="py-2.5 pr-4 text-xs">
                        {r.maquina ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Máq.{r.maquina}</span> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-500">{(r.aulas as any).coaches?.nome?.split(' ')[0] || '—'}</td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">
                        {r.carga_kg ? `${r.carga_kg} kg` : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-500">{r.reps_realizadas || '—'}</td>
                      <td className="py-2.5 text-xs text-gray-400 max-w-[120px] truncate">{r.observacoes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {historico.length === 0 && !searching && alunoSel && (
        <EmptyState message="Nenhum registro encontrado para este aluno." />
      )}
    </div>
  )
}
