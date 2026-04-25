'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Treino } from '@/types'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { CheckCircle, EyeOff } from 'lucide-react'

export default function JuTreinosPage() {
  const [treinos, setTreinos] = useState<Treino[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [ano, setAno] = useState(new Date().getFullYear())
  const supabase = createClient()

  useEffect(() => { loadTreinos() }, [mes, ano])

  async function loadTreinos() {
    setLoading(true)
    const { data } = await supabase
      .from('treinos')
      .select('*, treino_exercicios(*, exercicios(nome, numero_maquina))')
      .eq('mes', mes).eq('ano', ano)
      .order('nome')
    setTreinos(data || [])
    setLoading(false)
  }

  async function togglePublicado(treino: Treino) {
    await supabase.from('treinos').update({ publicado: !treino.publicado }).eq('id', treino.id)
    loadTreinos()
  }

  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Treinos do mês" subtitle="Publicados e disponíveis para os coaches" />

      <div className="flex gap-3 mb-4 items-center">
        <select className="input w-auto" value={`${mes}-${ano}`} onChange={e => { const [m,a] = e.target.value.split('-'); setMes(+m); setAno(+a) }}>
          {Array.from({length: 6}, (_,i) => { const d = new Date(); d.setMonth(d.getMonth()-1+i); return d }).map(d => {
            const m = d.getMonth()+1; const a = d.getFullYear()
            return <option key={`${m}-${a}`} value={`${m}-${a}`}>{meses[m-1]} {a}</option>
          })}
        </select>
        <span className="text-xs text-gray-400">{treinos.filter(t=>t.publicado).length} publicados · {treinos.filter(t=>!t.publicado).length} rascunhos</span>
      </div>

      {treinos.length === 0 && <EmptyState message="Nenhum treino para este mês. Use 'Montar treinos' para criar." />}

      <div className="space-y-3">
        {treinos.map(t => (
          <div key={t.id} className={`card ${t.publicado ? 'border-primary-100' : 'border-dashed border-gray-200'}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-gray-900">{t.nome}</span>
                  {t.descricao && <span className="text-xs text-gray-400">— {t.descricao}</span>}
                  <span className={`badge ${t.publicado ? 'badge-green' : 'badge-gray'}`}>
                    {t.publicado ? 'Publicado' : 'Rascunho'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(t as any).treino_exercicios?.map((te: any) => (
                    <span key={te.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                      {te.exercicios?.nome}
                      {te.exercicios?.numero_maquina && <span className="text-blue-500">· Máq.{te.exercicios.numero_maquina}</span>}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {(t as any).treino_exercicios?.length || 0} exercícios · criado em {new Date(t.criado_em).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => togglePublicado(t)}
                  className={`btn btn-sm gap-1 ${t.publicado ? '' : 'btn-primary'}`}>
                  {t.publicado ? <><EyeOff size={12} />Despublicar</> : <><CheckCircle size={12} />Publicar</>}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
