'use client'
// Biblioteca de treinos da musculação livre. O aluno vê os treinos publicados em /treinos
// (se teve entrada no Just CT nos últimos 7 dias). Usa os mesmos exercícios e grupos
// musculares da biblioteca da Ju.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Categoria, Exercicio } from '@/types'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Plus, X, Save, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react'

interface ExLinha {
  exercicio_id: string
  nome: string
  numero_maquina: string | null
  series: string
  reps: string
  descanso: string
  observacao: string
}
interface TreinoLivre {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  ordem: number
  treino_livre_exercicios?: any[]
}

const SELECT_TREINOS = '*, treino_livre_exercicios(id, exercicio_id, ordem, series, reps, descanso, observacao, exercicios(id, nome, numero_maquina))'

export default function TreinosLivresAdminPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [exercicios, setExercicios] = useState<Exercicio[]>([])
  const [treinos, setTreinos] = useState<TreinoLivre[]>([])
  const [catFiltro, setCatFiltro] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [descEdit, setDescEdit] = useState('')
  const [exsEdit, setExsEdit] = useState<ExLinha[]>([])
  const [modalNovo, setModalNovo] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: cats }, { data: exs }, { data: tr }] = await Promise.all([
      supabase.from('categorias').select('*').order('ordem'),
      supabase.from('exercicios').select('*, categorias(nome)').eq('ativo', true).order('nome'),
      supabase.from('treino_livre').select(SELECT_TREINOS).order('ordem').order('nome'),
    ])
    setCategorias(cats || [])
    setExercicios(exs || [])
    setTreinos(tr || [])
    setLoading(false)
  }

  async function recarregarTreinos() {
    const { data } = await supabase.from('treino_livre').select(SELECT_TREINOS).order('ordem').order('nome')
    setTreinos(data || [])
  }

  function aviso(texto: string) {
    setMsg(texto)
    setTimeout(() => setMsg(''), 2500)
  }

  function abrirEdicao(t: TreinoLivre) {
    setEditandoId(t.id)
    setNomeEdit(t.nome)
    setDescEdit(t.descricao || '')
    setExsEdit((t.treino_livre_exercicios || [])
      .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((te: any) => ({
        exercicio_id: te.exercicio_id,
        nome: te.exercicios?.nome || '',
        numero_maquina: te.exercicios?.numero_maquina || null,
        series: String(te.series),
        reps: te.reps,
        descanso: String(te.descanso),
        observacao: te.observacao || '',
      })))
  }

  async function criarNovo() {
    if (!nomeNovo.trim()) return
    const { data, error } = await supabase.from('treino_livre')
      .insert({ nome: nomeNovo.trim(), ordem: treinos.length })
      .select().single()
    if (error) { aviso('Erro: ' + error.message); return }
    setTreinos(prev => [...prev, { ...data, treino_livre_exercicios: [] }])
    abrirEdicao({ ...data, treino_livre_exercicios: [] })
    setModalNovo(false)
    setNomeNovo('')
  }

  async function salvarEdicao() {
    if (!editandoId) return
    setSaving(true)
    const { error } = await supabase.from('treino_livre')
      .update({ nome: nomeEdit.trim() || 'Sem nome', descricao: descEdit.trim() || null })
      .eq('id', editandoId)
    if (!error) {
      await supabase.from('treino_livre_exercicios').delete().eq('treino_id', editandoId)
      if (exsEdit.length > 0) {
        const { error: e2 } = await supabase.from('treino_livre_exercicios').insert(exsEdit.map((ex, i) => ({
          treino_id: editandoId,
          exercicio_id: ex.exercicio_id,
          ordem: i,
          series: parseInt(ex.series) || 3,
          reps: ex.reps || '12',
          descanso: parseInt(ex.descanso) || 60,
          observacao: ex.observacao.trim() || null,
        })))
        if (e2) aviso('Erro: ' + e2.message)
        else aviso('Treino salvo!')
      } else aviso('Treino salvo!')
    } else aviso('Erro: ' + error.message)
    await recarregarTreinos()
    setSaving(false)
  }

  async function alternarPublicado(t: TreinoLivre) {
    const { error } = await supabase.from('treino_livre').update({ ativo: !t.ativo }).eq('id', t.id)
    if (error) { aviso('Erro: ' + error.message); return }
    setTreinos(prev => prev.map(x => x.id === t.id ? { ...x, ativo: !t.ativo } : x))
    aviso(t.ativo ? 'Treino ocultado dos alunos.' : 'Treino publicado para os alunos!')
  }

  async function deletarTreino(id: string) {
    if (!confirm('Remover este treino da biblioteca? O histórico dos alunos é mantido.')) return
    const { error } = await supabase.from('treino_livre').delete().eq('id', id)
    if (error) { aviso('Erro: ' + error.message); return }
    setTreinos(prev => prev.filter(t => t.id !== id))
    if (editandoId === id) { setEditandoId(null); setExsEdit([]) }
  }

  function addEx(ex: Exercicio) {
    if (exsEdit.find(e => e.exercicio_id === ex.id)) return
    setExsEdit(prev => [...prev, {
      exercicio_id: ex.id, nome: ex.nome, numero_maquina: ex.numero_maquina || null,
      series: '3', reps: '12', descanso: '60', observacao: '',
    }])
  }

  function updateEx(idx: number, field: keyof ExLinha, value: string) {
    setExsEdit(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  function moverEx(idx: number, dir: -1 | 1) {
    setExsEdit(prev => {
      const alvo = idx + dir
      if (alvo < 0 || alvo >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[alvo]] = [arr[alvo], arr[idx]]
      return arr
    })
  }

  const exsFiltrados = catFiltro === 'todos' ? exercicios : exercicios.filter(e => e.categoria_id === catFiltro)
  const treinoAtual = treinos.find(t => t.id === editandoId)

  function renderEditor() {
    return (
      <div className="card p-3 md:p-5">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input className="text-base font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary-400 flex-1 min-w-0"
            value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} placeholder="Nome do treino..." />
          <input className="text-base md:text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-primary-400 flex-1 min-w-0"
            value={descEdit} onChange={e => setDescEdit(e.target.value)} placeholder="Descrição (opcional)..." />
          <button onClick={salvarEdicao} disabled={saving} className="btn btn-primary btn-sm gap-1 flex-shrink-0">
            <Save size={12} />{saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>

        {treinoAtual && (
          <div className={`text-xs mb-4 px-3 py-2 rounded-lg ${treinoAtual.ativo ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-500'}`}>
            {treinoAtual.ativo ? 'Publicado — visível para os alunos.' : 'Oculto — os alunos ainda não veem este treino.'}
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4">
          <div className="w-full md:w-52 flex-shrink-0">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs font-semibold text-gray-500 mb-2">Adicionar exercício</div>
              <div className="flex flex-wrap gap-1 mb-2">
                <button onClick={() => setCatFiltro('todos')}
                  className={`px-2 py-0.5 rounded-full text-xs border ${catFiltro === 'todos' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'text-gray-500 border-gray-200'}`}>
                  Todos
                </button>
                {categorias.map(c => (
                  <button key={c.id} onClick={() => setCatFiltro(c.id)}
                    className={`px-2 py-0.5 rounded-full text-xs border ${catFiltro === c.id ? 'bg-blue-100 text-blue-700 border-blue-300' : 'text-gray-500 border-gray-200'}`}>
                    {c.nome}
                  </button>
                ))}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                {exsFiltrados.map(ex => {
                  const ja = exsEdit.find(e => e.exercicio_id === ex.id)
                  return (
                    <div key={ex.id} className="py-1.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{ex.nome}</div>
                        {ex.numero_maquina && <div className="text-xs text-blue-500">{ex.numero_maquina}</div>}
                      </div>
                      <button onClick={() => !ja && addEx(ex)} disabled={!!ja}
                        className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs flex-shrink-0 ${ja ? 'bg-primary-100 border-primary-300 text-primary-600 cursor-default' : 'border-primary-200 text-primary-600 hover:bg-primary-50'}`}>
                        {ja ? '✓' : '+'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {exsEdit.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8 italic">← Adicione exercícios da biblioteca</div>
            ) : (
              <div className="space-y-2">
                {exsEdit.map((ex, idx) => (
                  <div key={ex.exercicio_id} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 px-3 py-2.5 bg-gray-50">
                      <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center flex-shrink-0">{idx + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{ex.nome}</div>
                        {ex.numero_maquina && <div className="text-xs text-blue-500">{ex.numero_maquina}</div>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => moverEx(idx, -1)} disabled={idx === 0} className="btn btn-sm p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20"><ArrowUp size={12} /></button>
                        <button onClick={() => moverEx(idx, 1)} disabled={idx >= exsEdit.length - 1} className="btn btn-sm p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20"><ArrowDown size={12} /></button>
                        <button onClick={() => setExsEdit(prev => prev.filter((_, i) => i !== idx))} className="btn btn-sm p-1 text-red-400 hover:bg-red-50"><X size={13} /></button>
                      </div>
                    </div>
                    <div className="px-3 py-3 grid grid-cols-3 gap-2">
                      <div>
                        <label className="label">Séries</label>
                        <input className="input text-center text-base md:text-sm" value={ex.series} onChange={e => updateEx(idx, 'series', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Reps</label>
                        <input className="input text-center text-base md:text-sm" value={ex.reps} onChange={e => updateEx(idx, 'reps', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Descanso (s)</label>
                        <input className="input text-center text-base md:text-sm" value={ex.descanso} onChange={e => updateEx(idx, 'descanso', e.target.value)} />
                      </div>
                      <div className="col-span-3">
                        <label className="label">Observação</label>
                        <input className="input text-base md:text-sm" value={ex.observacao} placeholder="Observação para o aluno..."
                          onChange={e => updateEx(idx, 'observacao', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="text-xs text-gray-400 pt-2 italic">💡 Use ↑↓ para reordenar · Salvar para confirmar</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Treinos · Musculação livre"
        subtitle="Biblioteca que o aluno segue pelo site. Só vê quem teve entrada no Just CT nos últimos 7 dias." />

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium mb-4 ${msg.startsWith('Erro') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{msg}</div>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">Treinos ({treinos.length})</span>
            <button onClick={() => setModalNovo(true)} className="btn btn-primary btn-sm gap-1"><Plus size={12} />Novo</button>
          </div>
          <div className="space-y-2">
            {treinos.length === 0 && <EmptyState message="Nenhum treino criado ainda." />}
            {treinos.map(t => (
              <div key={t.id}>
                <div className={`card p-3 cursor-pointer transition-all ${editandoId === t.id ? 'border-primary-400 ring-1 ring-primary-200' : 'hover:border-gray-200'}`}
                  onClick={() => editandoId === t.id ? setEditandoId(null) : abrirEdicao(t)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{t.nome}</div>
                      {t.descricao && <div className="text-xs text-gray-400 truncate">{t.descricao}</div>}
                      <div className="text-xs mt-0.5 flex gap-2">
                        <span className="text-gray-400">{t.treino_livre_exercicios?.length || 0} exercícios</span>
                        <span className={t.ativo ? 'text-green-600' : 'text-gray-400'}>{t.ativo ? 'Publicado' : 'Oculto'}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => alternarPublicado(t)} className="btn btn-sm p-1.5 text-primary-600" title={t.ativo ? 'Ocultar dos alunos' : 'Publicar para os alunos'}>
                        {t.ativo ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button onClick={() => deletarTreino(t.id)} className="btn btn-sm p-1.5 text-red-400 hover:bg-red-50" title="Remover"><X size={13} /></button>
                    </div>
                  </div>
                </div>
                {editandoId === t.id && <div className="md:hidden mt-2">{renderEditor()}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0 hidden md:block">
          {!editandoId ? (
            <div className="card flex items-center justify-center py-16 text-gray-400 text-sm italic">← Selecione um treino para editar ou crie um novo</div>
          ) : renderEditor()}
        </div>
      </div>

      {modalNovo && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Novo treino</h2>
            <div className="mb-4">
              <label className="label">Nome do treino</label>
              <input className="input text-base md:text-sm" placeholder="Ex: Peito e tríceps" value={nomeNovo}
                onChange={e => setNomeNovo(e.target.value)} onKeyDown={e => e.key === 'Enter' && criarNovo()} autoFocus />
            </div>
            <div className="flex gap-2">
              <button onClick={criarNovo} disabled={!nomeNovo.trim()} className="btn btn-primary flex-1">Criar treino</button>
              <button onClick={() => { setModalNovo(false); setNomeNovo('') }} className="btn flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
