'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { EyeOff, CheckCircle } from 'lucide-react'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default function JuTreinosPage() {
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
      .select('*, treinos(*, treino_exercicios(*, exercicios(nome, numero_maquina)))')
      .eq('mes', mes)
      .eq('ano', ano)
      .order('nome', { referencedTable: 'treinos', ascending: true })
    setPublicacoes(data || [])
    setLoading(false)
  }

  async function togglePublicado(pub: any) {
    await supabase
      .from('treino_publicacoes')
      .update({ publicado: !pub.publicado })
      .eq('id', pub.id)
    loadPublicacoes()
  }

  async function removerDoMes(pubId: string) {
    if (!confirm('Remover este treino do mês? Ele continuará na biblioteca.')) return
    await supabase.from('treino_publicacoes').delete().eq('id', pubId)
    loadPublicacoes()
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Treinos do mês" subtitle="Treinos publicados e disponíveis para os coaches" />

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select className="input w-auto" value={mes} onChange={e => setMes(+e.target.value)}>
          {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select className="input w-auto" value={ano} onChange={e => setAno(+e.target.value)}>
          {[2025, 2026, 2027].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-sm text-gray-400">
          {publicacoes.filter(p => p.publicado).length} publicados · {publicacoes.filter(p => !p.publicado).length} despublicados
        </span>
      </div>

      {publicacoes.length === 0 && (
        <div className="card text-center py-12">
          <div className="text-gray-400 text-sm mb-2">Nenhum treino publicado em {MESES[mes-1]} {ano}</div>
          <div className="text-gray-400 text-xs">Vá em "Biblioteca de treinos" e publique um treino neste mês</div>
        </div>
      )}

      <div className="space-y-3">
        {publicacoes.map(pub => {
          const treino = pub.treinos
          const exs = treino?.treino_exercicios || []
          return (
            <div key={pub.id} className={`card ${pub.publicado ? 'border-primary-100' : 'border-dashed border-gray-200 opacity-70'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{treino?.nome}</span>
                    {treino?.descricao && <span className="text-xs text-gray-400">— {treino.descricao}</span>}
                    <span className={`badge ${pub.publicado ? 'badge-green' : 'badge-gray'}`}>
                      {pub.publicado ? 'Publicado' : 'Despublicado'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {exs.map((te: any) => (
                      <span key={te.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full">
                        {te.exercicios?.nome}
                        {te.series_override && <span className="text-gray-400">· {te.series_override}×{te.reps_override}</span>}
                        {te.exercicios?.numero_maquina && <span className="text-blue-500">· {te.exercicios.numero_maquina}</span>}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400">
                    {exs.length} exercícios · publicado em {new Date(pub.publicado_em).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => togglePublicado(pub)}
                    className={`btn btn-sm gap-1 ${pub.publicado ? '' : 'btn-primary'}`}>
                    {pub.publicado
                      ? <><EyeOff size={12} />Despublicar</>
                      : <><CheckCircle size={12} />Publicar</>
                    }
                  </button>
                  <button onClick={() => removerDoMes(pub.id)}
                    className="btn btn-sm text-red-400 hover:bg-red-50 text-xs">
                    Remover do mês
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
