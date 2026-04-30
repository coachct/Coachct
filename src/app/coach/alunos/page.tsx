'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Users, Clock, ChevronRight } from 'lucide-react'

type Aluno = {
  id: string
  nome: string
  ultima_aula: string | null
  total_aulas: number
}

export default function AlunosPage() {
  const router = useRouter()
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadAlunos()
  }, [])

  async function loadAlunos() {
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select(`
          id,
          nome,
          aulas (
            id,
            finalizada_em,
            status
          )
        `)
        .order('nome', { ascending: true })

      if (error) throw error

      const mapped: Aluno[] = (data || []).map((a: any) => {
        const aulasFinalizadas = (a.aulas || []).filter(
          (au: any) => au.status === 'finalizada' && au.finalizada_em
        )
        aulasFinalizadas.sort(
          (x: any, y: any) =>
            new Date(y.finalizada_em).getTime() - new Date(x.finalizada_em).getTime()
        )
        return {
          id: a.id,
          nome: a.nome,
          ultima_aula: aulasFinalizadas[0]?.finalizada_em ?? null,
          total_aulas: aulasFinalizadas.length,
        }
      })

      setAlunos(mapped)
    } catch (err) {
      console.error('Erro ao carregar alunos:', err)
    } finally {
      setLoading(false)
    }
  }

  const alunosFiltrados = alunos.filter((a) =>
    a.nome.toLowerCase().includes(busca.toLowerCase())
  )

  function formatarData(data: string | null) {
    if (!data) return 'Nenhuma aula ainda'
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Alunos"
        subtitle={`${alunos.length} aluno${alunos.length !== 1 ? 's' : ''} cadastrado${alunos.length !== 1 ? 's' : ''}`}
      />

      <div className="mb-4 max-w-sm">
        <input
          type="text"
          placeholder="Buscar aluno..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="input input-sm w-full"
        />
      </div>

      {alunosFiltrados.length === 0 && (
        <EmptyState message={busca ? 'Nenhum aluno encontrado.' : 'Nenhum aluno cadastrado ainda.'} />
      )}

      <div className="space-y-2 max-w-2xl">
        {alunosFiltrados.map((aluno) => (
          <div
            key={aluno.id}
            className="card cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push(`/coach/alunos/${aluno.id}`)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Users size={16} className="text-primary-600" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">{aluno.nome}</div>
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                    <Clock size={11} />
                    <span>{formatarData(aluno.ultima_aula)}</span>
                    {aluno.total_aulas > 0 && (
                      <span className="ml-2 bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        {aluno.total_aulas} aula{aluno.total_aulas !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
