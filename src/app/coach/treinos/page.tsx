'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner } from '@/components/ui'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default function CoachTreinosPage() {
  const [publicacoes, setPublicacoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [ano, setAno] = useState(new Date().getFullYear())
  const supabase = createClient()

  useEffect(() => { loadPublicacoes() }, [mes, ano])

  async function loadPublicacoes() {
    setLoading(true)
    const { data } = await supabase
      .from('treino_publicacoes')
      .select('*, treinos(*, treino_exercicios(*, exercicios(nome, numero_maquina, observacoes)))')
      .eq('mes', mes)
      .eq('ano', ano)
      .eq('publicado', true)
      .order('publicado_em')
    setPublicacoes(data || [])
    setLoading(false)
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Treinos do mês"
        subtitle="Treinos publicados disponíveis para consulta"
      />

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select className="input w-auto" value={mes} onChange={e => setMes(+e.target.value)}>
          {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select className="input w-auto" value={ano} onChange={e => setAno(+e.target.value)}>
          {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-sm text-gray-400">
          {publicacoes.length} treino{publicacoes.length !== 1 ? 's' : ''} publicado{publicacoes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {publicacoes.length === 0 && (
        <div className="card text-center py-12">
          <div className="text-gray-400 text-sm mb-2">Nenhum treino publicado em {MESES[mes-1]} {ano}</div>
          <div className="text-gray-400 text-xs">Entre em contato com a coordenadora para mais informações</div>
        </div>
      )}

      <div className="space-y-4 max-w-2xl">
        {publicacoes.map(pub => {
          const treino = pub.treinos
          const exs = (treino?.treino_exercicios || []).sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
          return (
            <div key={pub.id} className="card border-primary-100">
              <div className="mb-3">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm text-gray-900">{treino?.nome}</span>
                  {treino?.descricao && (
                    <span className="text-xs text-gray-400">— {treino.descricao}</span>
                  )}
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Publicado
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {exs.length} exercício{exs.length !== 1 ? 's' : ''}
                </div>
              </div>

              <div className="space-y-2">
                {exs.map((te: any, idx: number) => {
                  const conjugado = te.conjugado
                  return (
                    <div key={te.id} className={`rounded-lg px-3 py-2.5 ${conjugado ? 'bg-primary-50 border border-primary-100' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${conjugado ? 'bg-primary-200 text-primary-800' : 'bg-gray-200 text-gray-600'}`}>
                          {idx + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{te.exercicios?.nome}</span>
                        {te.exercicios?.numero_maquina && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                            {te.exercicios.numero_maquina}
                          </span>
                        )}
                        {conjugado && (
                          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                            Conjugado
                          </span>
                        )}
                        {(te.series_override || te.reps_override) && (
                          <span className="text-xs text-gray-400 ml-auto">
                            {te.series_override || '?'} séries × {te.reps_override || '?'} reps
                          </span>
                        )}
                        {te.descanso_override && (
                          <span className="text-xs text-gray-400">· {te.descanso_override}s descanso</span>
                        )}
                      </div>
                      {te.observacoes_override && (
                        <div className="text-xs text-gray-500 italic mt-1 ml-7">📌 {te.observacoes_override}</div>
                      )}
                      {te.exercicios?.observacoes && (
                        <div className="text-xs text-gray-400 italic mt-0.5 ml-7">💡 {te.exercicios.observacoes}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
