'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Coach } from '@/types'
import { fmt, DIAS_SEMANA, HORARIOS } from '@/lib/utils'
import { PageHeader, Spinner, EmptyState } from '@/components/ui'
import { Plus, ChevronDown, ChevronUp, Save, Trash2, X, ClipboardList, KeyRound, Building2, CalendarOff, Settings2 } from 'lucide-react'

const EMPTY = {
  nome: '', cpf: '', email: '', senha: '',
  salario_fixo: 0,
  cargo: 'estagiario' as 'estagiario' | 'professor',
  valor_hora: 0,
}

const TIPOS_CT    = [{ key: 'ct', label: 'Coach CT' }]
const TIPOS_CLUB  = [
  { key: 'lift',              label: 'Lift' },
  { key: 'lift_for_girls',   label: 'Lift for Girls' },
  { key: 'running_funcional', label: 'Running + Funcional' },
]

function tiposParaUnidade(u: any) {
  return u.tipo === 'ct' ? TIPOS_CT : TIPOS_CLUB
}

export default function CoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Painel único expansível por coach
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Coach>>({})

  // Grade
  const [horarios, setHorarios] = useState<Record<string, Set<string>>>({})

  // Unidades + valores
  const [unidades,        setUnidades]        = useState<any[]>([])
  const [coachUnidades,   setCoachUnidades]   = useState<Record<string, Set<string>>>({})
  const [salvandoUnidade, setSalvandoUnidade] = useState<string | null>(null)
  const [valoresLocais,  setValoresLocais]  = useState<Record<string, number>>({})
  const [salvandoValor,  setSalvandoValor]  = useState<string | null>(null)

  // Aulas (inline no painel)
  const [aulasLista,   setAulasLista]   = useState<any[]>([])
  const [loadingAulas, setLoadingAulas] = useState(false)
  const [excluindo,    setExcluindo]    = useState<string | null>(null)
  const [mesAulas,     setMesAulas]     = useState(new Date().getMonth() + 1)
  const [anoAulas,     setAnoAulas]     = useState(new Date().getFullYear())

  // Senha (pop-up acionado pelo rodapé do painel)
  const [senhaModal, setSenhaModal] = useState<Coach | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [msgSenha, setMsgSenha] = useState('')
  const [excluindoCoach, setExcluindoCoach] = useState<string | null>(null)

  // ─── Férias / Ausências (exclusivo CT) ───
  const [feriasPorCoach,  setFeriasPorCoach]  = useState<Record<string, any[]>>({})
  const [feriasForm,      setFeriasForm]      = useState<{ data_inicio: string; data_fim: string; motivo: string }>({ data_inicio: '', data_fim: '', motivo: '' })
  const [salvandoFerias,  setSalvandoFerias]  = useState<string | null>(null)
  const [removendoFerias, setRemovendoFerias] = useState<string | null>(null)
  const [avisoFerias,     setAvisoFerias]     = useState<{ data: string; horario: string }[] | null>(null)

  // ─── Grade extra por período (exclusivo professor CT — entra no cálculo de horas) ───
  const [extrasPorCoach,  setExtrasPorCoach]  = useState<Record<string, any[]>>({})
  const [extraGrade,      setExtraGrade]      = useState<Record<string, Set<string>>>({})
  const [extraForm,       setExtraForm]       = useState<{ data_inicio: string; data_fim: string; motivo: string }>({ data_inicio: '', data_fim: '', motivo: '' })
  const [salvandoExtra,   setSalvandoExtra]   = useState<string | null>(null)
  const [removendoExtra,  setRemovendoExtra]  = useState<string | null>(null)

  const supabase = createClient()
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  useEffect(() => { loadCoaches(); carregarUnidades() }, [])

  async function loadCoaches() {
    const { data } = await supabase.from('coaches').select('*').order('nome')
    setCoaches(data || [])
    setLoading(false)
  }

  async function carregarUnidades() {
    const { data } = await supabase.from('unidades').select('id, nome, tipo').eq('ativo', true).order('tipo').order('nome')
    setUnidades(data || [])
  }

  // ─── Abrir / fechar painel do coach ───
  function toggleCoach(coach: Coach) {
    const abrindo = expandedCoach !== coach.id
    if (!abrindo) { setExpandedCoach(null); return }
    setExpandedCoach(coach.id)
    setEditDraft({ id: coach.id, nome: coach.nome, cpf: coach.cpf, salario_fixo: coach.salario_fixo, cargo: coach.cargo, valor_hora: coach.valor_hora })
    loadCoachUnidades(coach.id)
    loadHorarios(coach.id)
    loadFerias(coach.id)
    setFeriasForm({ data_inicio: '', data_fim: '', motivo: '' })
    setAvisoFerias(null)
    setExtraForm({ data_inicio: '', data_fim: '', motivo: '' })
    setExtraGrade(prev => ({ ...prev, [coach.id]: new Set() }))
    loadExtras(coach.id)
    setAulasLista([])
    buscarAulasCoach(coach, mesAulas, anoAulas)
  }

  // ─── Horários ───
  async function loadHorarios(coachId: string) {
    const { data } = await supabase.from('coach_horarios').select('*').eq('coach_id', coachId).eq('ativo', true)
    const set = new Set((data || []).map((h: any) => `${h.dia_semana}-${h.hora}`))
    setHorarios(prev => ({ ...prev, [coachId]: set }))
  }

  function toggleHorario(coachId: string, key: string) {
    setHorarios(prev => {
      const set = new Set(prev[coachId] || [])
      set.has(key) ? set.delete(key) : set.add(key)
      return { ...prev, [coachId]: set }
    })
  }

  async function saveHorarios(coachId: string) {
    const set = horarios[coachId] || new Set()
    const { error: delError } = await supabase.from('coach_horarios').delete().eq('coach_id', coachId)
    if (delError) { setMsg('Erro ao salvar: ' + delError.message); return }
    if (set.size > 0) {
      const { data: unidsCT } = await supabase.from('unidades').select('id').eq('tipo', 'ct').eq('ativo', true).limit(1)
      const unidadeId = unidsCT?.[0]?.id || null
      const rows = Array.from(set).map(key => {
        const idx = key.indexOf('-')
        return { coach_id: coachId, dia_semana: parseInt(key.substring(0, idx)), hora: key.substring(idx + 1), unidade_id: unidadeId, ativo: true }
      })
      const { error: insError } = await supabase.from('coach_horarios').insert(rows)
      if (insError) { setMsg('Erro ao salvar: ' + insError.message); return }
    }
    setMsg('Grade salva!')
    setTimeout(() => setMsg(''), 2000)
  }

  // ─── Unidades + valores ───
  async function loadCoachUnidades(coachId: string) {
    const [{ data: us }, { data: vs }] = await Promise.all([
      supabase.from('coach_unidades').select('unidade_id').eq('coach_id', coachId).eq('ativo', true),
      supabase.from('coach_valores').select('*').eq('coach_id', coachId),
    ])
    const set = new Set((us || []).map((u: any) => u.unidade_id))
    setCoachUnidades(prev => ({ ...prev, [coachId]: set }))

    const novoLocais: Record<string, number> = { ...valoresLocais }
    for (const v of (vs || [])) {
      novoLocais[`${coachId}-${v.unidade_id}-${v.tipo_aula}`] = Number(v.valor_por_aula)
    }
    setValoresLocais(novoLocais)
  }

  async function toggleCoachUnidade(coachId: string, unidadeId: string) {
    setSalvandoUnidade(unidadeId)
    const set = new Set(coachUnidades[coachId] || [])
    const removendo = set.has(unidadeId)
    if (removendo) {
      const { error } = await supabase.from('coach_unidades').delete().eq('coach_id', coachId).eq('unidade_id', unidadeId)
      if (error) { setMsg('Erro: ' + error.message); setSalvandoUnidade(null); return }
      set.delete(unidadeId)
    } else {
      const { error } = await supabase.from('coach_unidades').upsert({ coach_id: coachId, unidade_id: unidadeId, ativo: true }, { onConflict: 'coach_id,unidade_id' })
      if (error) { setMsg('Erro: ' + error.message); setSalvandoUnidade(null); return }
      set.add(unidadeId)
    }
    setCoachUnidades(prev => ({ ...prev, [coachId]: new Set(set) }))
    setSalvandoUnidade(null)
  }

  function getValorLocal(coachId: string, unidadeId: string, tipoAula: string): number {
    return valoresLocais[`${coachId}-${unidadeId}-${tipoAula}`] ?? 0
  }

  function setValorLocal(coachId: string, unidadeId: string, tipoAula: string, valor: number) {
    setValoresLocais(prev => ({ ...prev, [`${coachId}-${unidadeId}-${tipoAula}`]: valor }))
  }

  async function saveValor(coachId: string, unidadeId: string, tipoAula: string, valor: number) {
    const key = `${coachId}-${unidadeId}-${tipoAula}`
    setSalvandoValor(key)
    setValoresLocais(prev => ({ ...prev, [key]: valor }))
    const { error } = await supabase.from('coach_valores').upsert({
      coach_id: coachId, unidade_id: unidadeId, tipo_aula: tipoAula, valor_por_aula: valor,
    }, { onConflict: 'coach_id,unidade_id,tipo_aula' })
    if (error) setMsg('Erro ao salvar valor: ' + error.message)
    setSalvandoValor(null)
  }

  // ─── Aulas (CT lê de `aulas`; Club lê de `club_ocorrencias` pelo coach efetivo) ───
  async function buscarAulasCoach(coach: Coach, mes: number, ano: number) {
    setLoadingAulas(true)

    // Período em string YYYY-MM-DD (evita o bug de timezone do toISOString para datas Club).
    const mm        = String(mes).padStart(2, '0')
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const inicioStr = `${ano}-${mm}-01`
    const fimStr    = `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`

    // Unidades do coach buscadas direto no banco (não do estado, p/ evitar race no open).
    const { data: cu } = await supabase.from('coach_unidades')
      .select('unidade_id').eq('coach_id', coach.id).eq('ativo', true)
    const unidIds = (cu || []).map((x: any) => x.unidade_id)
    const unidadesCoach = unidades.filter(u => unidIds.includes(u.id))
    const temCT        = unidadesCoach.some(u => u.tipo === 'ct')
    const unidadesClub = unidadesCoach.filter(u => u.tipo === 'club')

    const linhas: any[] = []

    // CT — sessões de personal (tabela `aulas`, por coach)
    if (temCT) {
      const inicioTs = new Date(ano, mes - 1, 1).toISOString()
      const fimTs    = new Date(ano, mes, 0, 23, 59, 59).toISOString()
      const { data } = await supabase.from('aulas').select('*, clientes:cliente_id(nome), treinos(nome)')
        .eq('coach_id', coach.id).in('status', ['finalizada', 'em_andamento'])
        .gte('horario_agendado', inicioTs).lte('horario_agendado', fimTs)
        .order('horario_agendado', { ascending: false })
      for (const a of (data || [])) {
        linhas.push({
          key: `ct-${a.id}`,
          kind: 'ct',
          aulaId: a.id,
          dataOrd: a.horario_agendado,
          titulo: a.clientes?.nome || 'Aluno',
          sub: a.treinos?.nome || '—',
          status: a.status,
          unidadeNome: 'Coach CT',
          quando: new Date(a.horario_agendado).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        })
      }
    }

    // Club — paga por OCORRÊNCIA, pelo coach EFETIVO daquele dia
    // (correção pontual em club_ocorrencias.coach_id; na ausência, o da grade em club_aulas.coach_id).
    for (const u of unidadesClub) {
      const { data: aulasUnidade } = await supabase.from('club_aulas')
        .select('id, tipo, horario, coach_id').eq('unidade_id', u.id).eq('ativo', true)
      const ids = (aulasUnidade || []).map((a: any) => a.id)
      if (!ids.length) continue
      const aulaMap: Record<string, any> = {}
      for (const a of (aulasUnidade || [])) aulaMap[a.id] = a

      const { data: ocs } = await supabase.from('club_ocorrencias')
        .select('id, data, aula_id, coach_id, status')
        .in('aula_id', ids).gte('data', inicioStr).lte('data', fimStr)
        .eq('status', 'ativa').order('data')

      const minhas = (ocs || []).filter((oc: any) => {
        const efetivo = oc.coach_id || aulaMap[oc.aula_id]?.coach_id || null
        return efetivo === coach.id
      })

      for (const oc of minhas) {
        const a = aulaMap[oc.aula_id] || {}
        const tipoLabel = (TIPOS_CLUB.find(t => t.key === a.tipo)?.label) || a.tipo || 'Aula'
        const corrigido = !!oc.coach_id && a.coach_id !== coach.id
        linhas.push({
          key: `club-${oc.id}`,
          kind: 'club',
          dataOrd: `${oc.data}T${a.horario || '00:00'}`,
          titulo: tipoLabel,
          sub: a.horario || '',
          unidadeNome: u.nome,
          corrigido,
          quando: `${fmtData(oc.data)}${a.horario ? ' às ' + a.horario : ''}`,
        })
      }
    }

    linhas.sort((a, b) => String(b.dataOrd || '').localeCompare(String(a.dataOrd || '')))
    setAulasLista(linhas)
    setLoadingAulas(false)
  }

  async function excluirAula(aulaId: string) {
    if (!confirm('Excluir esta aula permanentemente?')) return
    setExcluindo(aulaId)
    await supabase.from('registros_carga').delete().eq('aula_id', aulaId)
    await supabase.from('aulas').delete().eq('id', aulaId)
    setAulasLista(prev => prev.filter(a => a.aulaId !== aulaId))
    setExcluindo(null)
  }

  // ─── Senha ───
  async function salvarSenha() {
    if (!senhaModal || !novaSenha || novaSenha.length < 6) { setMsgSenha('A senha deve ter pelo menos 6 caracteres.'); return }
    setSalvandoSenha(true); setMsgSenha('')
    const res = await fetch('/api/admin/reset-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: senhaModal.user_id, nova_senha: novaSenha }) })
    const json = await res.json()
    setSalvandoSenha(false)
    if (json.ok) { setMsgSenha('✅ Senha alterada!'); setNovaSenha(''); setTimeout(() => { setSenhaModal(null); setMsgSenha('') }, 1500) }
    else setMsgSenha('Erro: ' + json.error)
  }

  // ─── Excluir coach ───
  async function excluirCoach(coach: Coach) {
    if (!confirm(`Desativar ${coach.nome}?\n\nO histórico será preservado. O acesso será bloqueado imediatamente.`)) return
    setExcluindoCoach(coach.id)
    const res = await fetch('/api/excluir-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coach_id: coach.id, user_id: coach.user_id }) })
    const json = await res.json()
    setExcluindoCoach(null)
    if (json.ok) { setMsg(`${coach.nome} foi desativado.`); setExpandedCoach(null); loadCoaches() }
    else setMsg('Erro: ' + json.error)
    setTimeout(() => setMsg(''), 3000)
  }

  // ─── Férias / Ausências ───
  async function loadFerias(coachId: string) {
    const { data } = await supabase.from('coach_ferias').select('*').eq('coach_id', coachId).order('data_inicio', { ascending: false })
    setFeriasPorCoach(prev => ({ ...prev, [coachId]: data || [] }))
  }

  async function addFerias(coachId: string) {
    if (!feriasForm.data_inicio || !feriasForm.data_fim) { setMsg('Preencha as datas de início e fim.'); return }
    if (feriasForm.data_fim < feriasForm.data_inicio) { setMsg('A data de fim deve ser igual ou posterior à data de início.'); return }
    setSalvandoFerias(coachId); setMsg(''); setAvisoFerias(null)

    // Rede de segurança: lista agendamentos existentes do coach no intervalo (não cancela nada).
    const { data: conflitos } = await supabase.from('agendamentos')
      .select('data, horario')
      .eq('coach_id', coachId)
      .gte('data', feriasForm.data_inicio)
      .lte('data', feriasForm.data_fim)
      .neq('status', 'cancelado')
      .order('data').order('horario')

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('coach_ferias').insert({
      coach_id: coachId,
      data_inicio: feriasForm.data_inicio,
      data_fim: feriasForm.data_fim,
      motivo: feriasForm.motivo.trim() || null,
      criado_por: user?.id || null,
    })
    setSalvandoFerias(null)
    if (error) { setMsg('Erro ao salvar período: ' + error.message); return }
    setFeriasForm({ data_inicio: '', data_fim: '', motivo: '' })
    if (conflitos && conflitos.length > 0) setAvisoFerias(conflitos)
    setMsg('Período de ausência salvo!')
    setTimeout(() => setMsg(''), 2500)
    loadFerias(coachId)
  }

  async function removeFerias(feriasId: string, coachId: string) {
    if (!confirm('Remover este período de ausência?')) return
    setRemovendoFerias(feriasId)
    const { error } = await supabase.from('coach_ferias').delete().eq('id', feriasId)
    setRemovendoFerias(null)
    if (error) { setMsg('Erro ao remover: ' + error.message); return }
    loadFerias(coachId)
  }

  // ─── Grade extra por período (professor CT) ───
  async function loadExtras(coachId: string) {
    const { data } = await supabase.from('coach_horarios_extra')
      .select('*').eq('coach_id', coachId).order('data_inicio', { ascending: false })
    // Agrupa por grupo_id: cada lançamento em lote é um grupo (removível de uma vez).
    const grupos: Record<string, any> = {}
    for (const r of (data || [])) {
      if (!grupos[r.grupo_id]) grupos[r.grupo_id] = {
        grupo_id: r.grupo_id, data_inicio: r.data_inicio, data_fim: r.data_fim,
        motivo: r.motivo, slots: [] as any[],
      }
      grupos[r.grupo_id].slots.push({ dia_semana: r.dia_semana, hora: r.hora })
    }
    const lista = Object.values(grupos).sort((a: any, b: any) => b.data_inicio.localeCompare(a.data_inicio))
    setExtrasPorCoach(prev => ({ ...prev, [coachId]: lista }))
  }

  function toggleExtra(coachId: string, key: string) {
    setExtraGrade(prev => {
      const set = new Set(prev[coachId] || [])
      set.has(key) ? set.delete(key) : set.add(key)
      return { ...prev, [coachId]: set }
    })
  }

  async function addExtra(coachId: string) {
    const set = extraGrade[coachId] || new Set<string>()
    if (!extraForm.data_inicio || !extraForm.data_fim) { setMsg('Preencha as datas de início e fim da grade extra.'); return }
    if (extraForm.data_fim < extraForm.data_inicio) { setMsg('A data de fim deve ser igual ou posterior à de início.'); return }
    if (set.size === 0) { setMsg('Marque ao menos um horário extra no grid.'); return }
    setSalvandoExtra(coachId); setMsg('')

    const { data: unidsCT } = await supabase.from('unidades').select('id').eq('tipo', 'ct').eq('ativo', true).limit(1)
    const unidadeId = unidsCT?.[0]?.id
    if (!unidadeId) { setSalvandoExtra(null); setMsg('Nenhuma unidade CT ativa encontrada.'); return }

    const grupoId = crypto.randomUUID()
    const { data: { user } } = await supabase.auth.getUser()
    const rows = Array.from(set).map(key => {
      const idx = key.indexOf('-')
      return {
        grupo_id:    grupoId,
        coach_id:    coachId,
        unidade_id:  unidadeId,
        data_inicio: extraForm.data_inicio,
        data_fim:    extraForm.data_fim,
        dia_semana:  parseInt(key.substring(0, idx)),
        hora:        key.substring(idx + 1),
        motivo:      extraForm.motivo.trim() || null,
        criado_por:  user?.id || null,
      }
    })
    const { error } = await supabase.from('coach_horarios_extra').insert(rows)
    setSalvandoExtra(null)
    if (error) { setMsg('Erro ao salvar grade extra: ' + error.message); return }
    setExtraForm({ data_inicio: '', data_fim: '', motivo: '' })
    setExtraGrade(prev => ({ ...prev, [coachId]: new Set() }))
    setMsg('Grade extra adicionada!')
    setTimeout(() => setMsg(''), 2500)
    loadExtras(coachId)
  }

  async function removeExtra(grupoId: string, coachId: string) {
    if (!confirm('Remover este lançamento de grade extra?')) return
    setRemovendoExtra(grupoId)
    const { error } = await supabase.from('coach_horarios_extra').delete().eq('grupo_id', grupoId)
    setRemovendoExtra(null)
    if (error) { setMsg('Erro ao remover: ' + error.message); return }
    loadExtras(coachId)
  }

  function fmtData(s: string) {
    if (!s) return ''
    const [y, m, d] = s.split('T')[0].split('-')
    return `${d}/${m}/${y}`
  }

  // ─── Criar / editar ───
  async function handleCreate() {
    if (!form.nome || !form.email || !form.senha) { setMsg('Preencha nome, email e senha.'); return }
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/criar-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, contrato: 'PJ', adicional_por_aula: 0, valor_cliente_aula: 0 }) })
      const data = await res.json()
      if (!res.ok) { setMsg('Erro: ' + data.error); setSaving(false); return }
      setMsg('Coach criado!'); setForm(EMPTY); setShowForm(false); loadCoaches()
    } catch (e: any) { setMsg('Erro: ' + e.message) }
    setSaving(false)
  }

  async function handleEdit() {
    if (!editDraft?.id) return
    setSaving(true)
    const { error } = await supabase.from('coaches').update({
      nome: editDraft.nome, cpf: editDraft.cpf,
      cargo: editDraft.cargo || 'estagiario',
      salario_fixo: editDraft.salario_fixo || 0,
      valor_hora: editDraft.valor_hora || 0,
    }).eq('id', editDraft.id)
    if (error) setMsg('Erro: ' + error.message)
    else { setMsg('Coach atualizado!'); loadCoaches() }
    setSaving(false); setTimeout(() => setMsg(''), 2000)
  }

  function tipoUnidadeBadge(tipo: string) {
    return tipo === 'ct' ? 'bg-primary-100 text-primary-700' : tipo === 'club' ? 'bg-cyan-100 text-cyan-700' : 'bg-gray-100 text-gray-600'
  }
  function tipoUnidadeLabel(tipo: string) {
    return tipo === 'ct' ? 'Coach CT' : tipo === 'club' ? 'JustClub' : tipo
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="Coaches" subtitle="Cadastro, unidades, valores por tipo de aula e grade de horários" />

      {msg && <div className={`px-4 py-2 rounded-lg text-sm mb-4 ${msg.startsWith('Erro') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{msg}</div>}

      <button onClick={() => setShowForm(!showForm)} className="btn btn-primary mb-4 gap-2">
        <Plus size={14} /> Novo coach
      </button>

      {/* ── Formulário novo coach ── */}
      {showForm && (
        <div className="card border-primary-200 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Novo coach</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div><label className="label">Nome completo *</label><input className="input" value={form.nome} onChange={e => setForm(f=>({...f,nome:e.target.value}))} /></div>
            <div><label className="label">CPF</label><input className="input" value={form.cpf} onChange={e => setForm(f=>({...f,cpf:e.target.value}))} placeholder="000.000.000-00 (opcional)" /></div>
            <div><label className="label">Email de acesso *</label><input className="input" type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} /></div>
            <div><label className="label">Senha inicial *</label><input className="input" type="password" value={form.senha} onChange={e => setForm(f=>({...f,senha:e.target.value}))} placeholder="Mínimo 6 caracteres" /></div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Cargo & remuneração</div>
            <p className="text-xs text-gray-400 mb-3">Estagiário: salário fixo/mês. Professor: valor por hora trabalhada (grade do CT).</p>
            <div className="flex gap-2 mb-3">
              {(['estagiario','professor'] as const).map(c => (
                <button key={c} type="button" onClick={() => setForm(f=>({...f,cargo:c}))}
                  className={`btn btn-sm ${form.cargo===c ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                  {c === 'estagiario' ? 'Estagiário' : 'Professor'}
                </button>
              ))}
            </div>
            {form.cargo === 'estagiario' ? (
              <div className="max-w-xs">
                <label className="label">Salário fixo/mês (R$)</label>
                <input className="input" type="number" value={form.salario_fixo} onChange={e => setForm(f=>({...f,salario_fixo:+e.target.value}))} placeholder="0" />
              </div>
            ) : (
              <div className="max-w-xs">
                <label className="label">Valor por hora (R$)</label>
                <input className="input" type="number" value={form.valor_hora} onChange={e => setForm(f=>({...f,valor_hora:+e.target.value}))} placeholder="0" />
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">💡 O bônus por aula é configurado na seção <strong>Unidades</strong> de cada coach após o cadastro.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving} className="btn btn-primary gap-2"><Save size={14}/>{saving?'Criando...':'Criar coach'}</button>
            <button onClick={() => setShowForm(false)} className="btn">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Lista coaches ── */}
      <div className="space-y-3">
        {coaches.length === 0 && <EmptyState message="Nenhum coach cadastrado ainda." />}
        {coaches.map(coach => {
          const inativo  = !coach.ativo
          const qtdUnids = coachUnidades[coach.id]?.size || 0
          const aberto   = expandedCoach === coach.id

          return (
            <div key={coach.id} className={`card ${inativo?'opacity-60 border-dashed':''} ${aberto?'ring-1 ring-primary-200':''}`}>
              {/* ── Linha principal (sempre visível, limpa) ── */}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${inativo?'bg-gray-100 text-gray-400':'bg-primary-100 text-primary-800'}`}>
                  {coach.nome.slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-gray-900 text-sm">{coach.nome}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${coach.cargo === 'professor' ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                      {coach.cargo === 'professor' ? 'Professor' : 'Estagiário'}
                    </span>
                    {inativo && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inativo</span>}
                    {!inativo && qtdUnids > 0 && (
                      <span className="text-xs bg-cyan-50 text-cyan-700 border border-cyan-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Building2 size={10}/> {qtdUnids} unidade{qtdUnids!==1?'s':''}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {coach.cargo === 'professor'
                      ? `Professor · ${fmt(coach.valor_hora)}/hora`
                      : (Number(coach.salario_fixo) > 0 ? `Estagiário · Fixo ${fmt(coach.salario_fixo)}/mês` : 'Estagiário · Sem fixo')}
                    {' · bônus por aula nas unidades'}
                  </div>
                </div>
                <button onClick={() => toggleCoach(coach)}
                  className={`btn btn-sm gap-1.5 flex-shrink-0 ${aberto?'bg-primary-50 text-primary-700 border border-primary-200':''}`}>
                  <Settings2 size={13}/> Gerenciar {aberto?<ChevronUp size={13}/>:<ChevronDown size={13}/>}
                </button>
              </div>

              {/* ── Painel expandido (seções empilhadas) ── */}
              {aberto && (
                <div className="mt-4 space-y-5">

                  {/* Seção: Dados */}
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Dados do coach</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div><label className="label">Nome</label><input className="input" value={editDraft.nome||''} onChange={e => setEditDraft(f=>({...f,nome:e.target.value}))} /></div>
                      <div><label className="label">CPF</label><input className="input" value={editDraft.cpf||''} onChange={e => setEditDraft(f=>({...f,cpf:e.target.value}))} /></div>
                    </div>
                    <div className="mb-3">
                      <label className="label">Cargo</label>
                      <div className="flex gap-2 mt-1">
                        {(['estagiario','professor'] as const).map(c => (
                          <button key={c} type="button" onClick={() => setEditDraft(f=>({...f,cargo:c}))}
                            className={`btn btn-sm ${(editDraft.cargo||'estagiario')===c ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                            {c === 'estagiario' ? 'Estagiário' : 'Professor'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(editDraft.cargo||'estagiario') === 'estagiario' ? (
                      <div className="max-w-xs mb-3">
                        <label className="label">Salário fixo/mês (R$) <span className="text-gray-400 font-normal">— opcional</span></label>
                        <input className="input" type="number" value={editDraft.salario_fixo||0} onChange={e => setEditDraft(f=>({...f,salario_fixo:+e.target.value}))} placeholder="0" />
                      </div>
                    ) : (
                      <div className="max-w-xs mb-3">
                        <label className="label">Valor por hora (R$)</label>
                        <input className="input" type="number" value={editDraft.valor_hora||0} onChange={e => setEditDraft(f=>({...f,valor_hora:+e.target.value}))} placeholder="0" />
                      </div>
                    )}
                    <button onClick={handleEdit} disabled={saving} className="btn btn-primary btn-sm gap-2"><Save size={12}/>{saving?'Salvando...':'Salvar dados'}</button>
                  </section>

                  {/* Seção: Unidades + Valores */}
                  <section className="pt-5 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 size={14} className="text-cyan-600"/>
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Unidades e valores por tipo de aula</span>
                    </div>
                    <div className="space-y-3">
                      {unidades.map(u => {
                        const ativo      = coachUnidades[coach.id]?.has(u.id) || false
                        const carregando = salvandoUnidade === u.id
                        const tipos      = tiposParaUnidade(u)
                        return (
                          <div key={u.id} className={`rounded-xl border transition-all ${ativo?'bg-cyan-50 border-cyan-200':'bg-gray-50 border-gray-200'}`}>
                            <button onClick={() => toggleCoachUnidade(coach.id, u.id)} disabled={carregando}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:opacity-60">
                              {carregando ? (
                                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0"/>
                              ) : (
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${ativo?'bg-cyan-500 border-cyan-500':'border-gray-300'}`}>
                                  {ativo && <div className="w-2 h-2 rounded-full bg-white"/>}
                                </div>
                              )}
                              <span className={`text-sm font-medium flex-1 ${ativo?'text-cyan-800':'text-gray-600'}`}>{u.nome}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${tipoUnidadeBadge(u.tipo)}`}>
                                {tipoUnidadeLabel(u.tipo)}
                              </span>
                            </button>
                            {ativo && (
                              <div className="px-4 pb-3 border-t border-cyan-200">
                                <div className="text-xs text-cyan-700 font-semibold mt-2 mb-2 uppercase tracking-wide">Valor por aula (R$)</div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {tipos.map(tipo => {
                                    const vkey = `${coach.id}-${u.id}-${tipo.key}`
                                    const salvando = salvandoValor === vkey
                                    return (
                                      <div key={tipo.key} className="bg-white rounded-lg border border-cyan-100 px-3 py-2">
                                        <div className="text-xs text-gray-500 mb-1">{tipo.label}</div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-gray-400">R$</span>
                                          <input
                                            type="number" min={0} step="0.01"
                                            className="input py-1 text-sm flex-1 min-w-0"
                                            value={getValorLocal(coach.id, u.id, tipo.key) || ''}
                                            placeholder="0,00"
                                            onChange={e => setValorLocal(coach.id, u.id, tipo.key, parseFloat(e.target.value) || 0)}
                                            onBlur={(e) => saveValor(coach.id, u.id, tipo.key, parseFloat(e.target.value) || 0)}
                                          />
                                          {salvando && <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0"/>}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                                <p className="text-xs text-gray-400 mt-2">Salvo automaticamente ao sair do campo.</p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>

                  {/* Seção: Grade */}
                  <section className="pt-5 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Grade de horários — Coach CT</span>
                      <span className="text-xs text-gray-400">{horarios[coach.id]?.size || 0} slots/semana</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead>
                          <tr>
                            <th className="text-gray-400 font-normal w-14 text-left pb-2 pr-2">Hora</th>
                            {DIAS_SEMANA.map(d => <th key={d} className="text-gray-400 font-normal text-center pb-2 px-0.5 min-w-[32px]">{d}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {HORARIOS.map(hora => (
                            <tr key={hora}>
                              <td className="text-gray-400 py-0.5 pr-2 whitespace-nowrap">{hora}</td>
                              {[0,1,2,3,4,5,6].map(dia => {
                                const key = `${dia}-${hora}`
                                const on  = horarios[coach.id]?.has(key)
                                return (
                                  <td key={dia} className="px-0.5 py-0.5">
                                    <button onClick={() => toggleHorario(coach.id, key)}
                                      className={`w-full h-6 rounded text-xs transition-colors ${on?'bg-primary-100 text-primary-800 border border-primary-300':'bg-gray-50 border border-gray-100 hover:bg-gray-100'}`}>
                                      {on?'✓':''}
                                    </button>
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button onClick={() => saveHorarios(coach.id)} className="btn btn-primary btn-sm gap-1"><Save size={12}/>Salvar grade</button>
                      <button onClick={() => { const all = new Set<string>(); HORARIOS.forEach(h => [0,1,2,3,4,5,6].forEach(d => all.add(`${d}-${h}`))); setHorarios(prev=>({...prev,[coach.id]:all})) }} className="btn btn-sm">Marcar todos</button>
                      <button onClick={() => setHorarios(prev=>({...prev,[coach.id]:new Set()}))} className="btn btn-sm">Limpar</button>
                    </div>
                  </section>

                  {/* Seção: Grade extra por período (escala o coach só no período; professor também conta horas) */}
                  <section className="pt-5 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <Settings2 size={14} className="text-blue-600"/>
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Grade extra por período — Coach CT</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Escala o coach na grade <strong>só dentro do período informado</strong> (ex.: cobertura, reforço) — soma à grade fixa. {coach.cargo === 'professor' ? 'Para professor, também conta como horas no Pagamento de Coaches.' : 'Não altera o pagamento (estagiário segue o salário fixo).'} Feriado/FDS e férias seguem as regras normais.</p>

                    {(extrasPorCoach[coach.id]?.length ?? 0) === 0 ? (
                      <p className="text-xs text-gray-400 italic mb-4">Nenhuma grade extra cadastrada.</p>
                    ) : (
                      <div className="space-y-2 mb-4">
                        {extrasPorCoach[coach.id]!.map(g => (
                          <div key={g.grupo_id} className="flex items-start gap-3 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800">{fmtData(g.data_inicio)} → {fmtData(g.data_fim)}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {[...g.slots].sort((a:any,b:any)=>a.dia_semana-b.dia_semana||String(a.hora).localeCompare(String(b.hora))).map((s:any,i:number)=>(
                                  <span key={i} className="inline-block mr-1.5 whitespace-nowrap">{DIAS_SEMANA[s.dia_semana]} {String(s.hora).slice(0,5)}</span>
                                ))}
                              </div>
                              {g.motivo && <div className="text-xs text-gray-400 mt-0.5">{g.motivo}</div>}
                            </div>
                            <button onClick={() => removeExtra(g.grupo_id, coach.id)} disabled={removendoExtra===g.grupo_id}
                              className="flex-shrink-0 p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                              {removendoExtra===g.grupo_id?<div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/>:<Trash2 size={14}/>}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Adicionar grade extra</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div><label className="label">Início *</label><input type="date" className="input" value={extraForm.data_inicio} onChange={e=>setExtraForm(f=>({...f,data_inicio:e.target.value}))}/></div>
                        <div><label className="label">Fim *</label><input type="date" className="input" value={extraForm.data_fim} onChange={e=>setExtraForm(f=>({...f,data_fim:e.target.value}))}/></div>
                      </div>
                      <div className="mb-3">
                        <label className="label">Motivo <span className="text-gray-400 font-normal">— opcional</span></label>
                        <input className="input" value={extraForm.motivo} placeholder="Cobertura, reforço…" onChange={e=>setExtraForm(f=>({...f,motivo:e.target.value}))}/>
                      </div>
                      <label className="label">Horários extras <span className="text-gray-400 font-normal">— {extraGrade[coach.id]?.size || 0} marcados</span></label>
                      <div className="overflow-x-auto mb-3">
                        <table className="text-xs w-full">
                          <thead>
                            <tr>
                              <th className="text-gray-400 font-normal w-14 text-left pb-2 pr-2">Hora</th>
                              {DIAS_SEMANA.map(d => <th key={d} className="text-gray-400 font-normal text-center pb-2 px-0.5 min-w-[32px]">{d}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {HORARIOS.map(hora => (
                              <tr key={hora}>
                                <td className="text-gray-400 py-0.5 pr-2 whitespace-nowrap">{hora}</td>
                                {[0,1,2,3,4,5,6].map(dia => {
                                  const key = `${dia}-${hora}`
                                  const on  = extraGrade[coach.id]?.has(key)
                                  return (
                                    <td key={dia} className="px-0.5 py-0.5">
                                      <button onClick={() => toggleExtra(coach.id, key)}
                                        className={`w-full h-6 rounded text-xs transition-colors ${on?'bg-blue-100 text-blue-800 border border-blue-300':'bg-gray-50 border border-gray-100 hover:bg-gray-100'}`}>
                                        {on?'✓':''}
                                      </button>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => addExtra(coach.id)} disabled={salvandoExtra===coach.id} className="btn btn-primary btn-sm gap-1">
                          {salvandoExtra===coach.id?<div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>:<Save size={12}/>}
                          {salvandoExtra===coach.id?'Salvando...':'Adicionar grade extra'}
                        </button>
                        <button onClick={() => setExtraGrade(prev=>({...prev,[coach.id]:new Set()}))} className="btn btn-sm">Limpar seleção</button>
                      </div>
                    </div>
                  </section>

                  {/* Seção: Férias / Ausências */}
                  <section className="pt-5 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                      <CalendarOff size={14} className="text-amber-600"/>
                      <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Férias / Ausências — Coach CT</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Enquanto o período estiver vigente, a grade deste coach não sobe no CT (não conta vaga, não aparece como selecionável). Volta sozinho quando o período passa.</p>

                    {(feriasPorCoach[coach.id]?.length ?? 0) === 0 ? (
                      <p className="text-xs text-gray-400 italic mb-4">Nenhum período cadastrado.</p>
                    ) : (
                      <div className="space-y-2 mb-4">
                        {feriasPorCoach[coach.id]!.map(f => (
                          <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800">{fmtData(f.data_inicio)} → {fmtData(f.data_fim)}</div>
                              {f.motivo && <div className="text-xs text-gray-500 mt-0.5">{f.motivo}</div>}
                            </div>
                            <button onClick={() => removeFerias(f.id, coach.id)} disabled={removendoFerias===f.id}
                              className="flex-shrink-0 p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                              {removendoFerias===f.id?<div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/>:<Trash2 size={14}/>}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {avisoFerias && avisoFerias.length > 0 && (
                      <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                        <div className="text-xs font-semibold text-orange-800 mb-1">⚠️ {avisoFerias.length} agendamento{avisoFerias.length!==1?'s':''} já existe{avisoFerias.length!==1?'m':''} neste intervalo</div>
                        <p className="text-xs text-orange-700 mb-2">Os agendamentos NÃO foram cancelados. Verifique e trate manualmente:</p>
                        <ul className="text-xs text-orange-800 space-y-0.5 max-h-32 overflow-y-auto">
                          {avisoFerias.map((a, i) => <li key={i}>• {fmtData(a.data)} às {a.horario}</li>)}
                        </ul>
                      </div>
                    )}

                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Adicionar período</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div><label className="label">Início *</label><input type="date" className="input" value={feriasForm.data_inicio} onChange={e=>setFeriasForm(f=>({...f,data_inicio:e.target.value}))}/></div>
                        <div><label className="label">Fim *</label><input type="date" className="input" value={feriasForm.data_fim} onChange={e=>setFeriasForm(f=>({...f,data_fim:e.target.value}))}/></div>
                      </div>
                      <div className="mb-3">
                        <label className="label">Motivo <span className="text-gray-400 font-normal">— opcional</span></label>
                        <input className="input" value={feriasForm.motivo} placeholder="Férias, atestado, folga…" onChange={e=>setFeriasForm(f=>({...f,motivo:e.target.value}))}/>
                      </div>
                      <button onClick={() => addFerias(coach.id)} disabled={salvandoFerias===coach.id} className="btn btn-primary btn-sm gap-1">
                        {salvandoFerias===coach.id?<div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>:<Save size={12}/>}
                        {salvandoFerias===coach.id?'Salvando...':'Adicionar período'}
                      </button>
                    </div>
                  </section>

                  {/* Seção: Aulas do mês (CT + Club) */}
                  <section className="pt-5 border-t border-gray-100">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <ClipboardList size={14} className="text-primary-600"/>
                        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Aulas do mês</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select className="input w-auto py-1 text-sm" value={mesAulas} onChange={e=>{const m=+e.target.value;setMesAulas(m);buscarAulasCoach(coach,m,anoAulas)}}>
                          {MESES.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
                        </select>
                        <select className="input w-auto py-1 text-sm" value={anoAulas} onChange={e=>{const a=+e.target.value;setAnoAulas(a);buscarAulasCoach(coach,mesAulas,a)}}>
                          {[2025,2026,2027].map(a=><option key={a} value={a}>{a}</option>)}
                        </select>
                        <span className="text-xs text-gray-400">{aulasLista.length} aula{aulasLista.length!==1?'s':''}</span>
                      </div>
                    </div>
                    {loadingAulas ? (
                      <div className="flex items-center justify-center py-10"><div className="w-6 h-6 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/></div>
                    ) : aulasLista.length===0 ? (
                      <div className="text-center py-10 text-sm text-gray-400 italic">Nenhuma aula registrada neste mês.</div>
                    ) : (
                      <div className="space-y-2">
                        {aulasLista.map(aula => (
                          <div key={aula.key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-900 truncate">{aula.titulo}</span>
                                {aula.kind==='ct' ? (
                                  <>
                                    <span className="text-xs text-gray-400">·</span>
                                    <span className="text-xs text-gray-500 truncate">{aula.sub}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${aula.status==='finalizada'?'bg-green-100 text-green-700':'bg-orange-100 text-orange-700'}`}>
                                      {aula.status==='finalizada'?'Finalizada':'Em andamento'}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-cyan-100 text-cyan-700">{aula.unidadeNome}</span>
                                    {aula.corrigido && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">correção pontual</span>}
                                  </>
                                )}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">{aula.quando}</div>
                            </div>
                            {aula.kind==='ct' && (
                              <button onClick={()=>excluirAula(aula.aulaId)} disabled={excluindo===aula.aulaId}
                                className="flex-shrink-0 p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                                {excluindo===aula.aulaId?<div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/>:<Trash2 size={14}/>}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Rodapé: ações secundárias discretas */}
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                    <button onClick={() => { setSenhaModal(coach); setNovaSenha(''); setMsgSenha('') }}
                      className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1.5">
                      <KeyRound size={13}/> Trocar senha
                    </button>
                    {!inativo && (
                      <button onClick={() => excluirCoach(coach)} disabled={excluindoCoach===coach.id}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1.5 disabled:opacity-50">
                        {excluindoCoach===coach.id?<div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin"/>:<Trash2 size={13}/>}
                        Desativar coach
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Pop-up senha (acionado pelo rodapé do painel) ── */}
      {senhaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div><h2 className="font-semibold text-gray-900">Redefinir senha</h2><p className="text-xs text-gray-400 mt-0.5">{senhaModal.nome}</p></div>
              <button onClick={()=>setSenhaModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500"/></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div><label className="label">Nova senha</label><input className="input" type="password" placeholder="Mínimo 6 caracteres" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)}/></div>
              {msgSenha && <p className={`text-xs px-3 py-2 rounded-lg ${msgSenha.startsWith('✅')?'bg-green-50 text-green-700':'bg-red-50 text-red-600'}`}>{msgSenha}</p>}
              <div className="flex gap-2">
                <button onClick={salvarSenha} disabled={salvandoSenha} className="btn btn-primary flex-1 gap-2"><KeyRound size={13}/>{salvandoSenha?'Salvando...':'Salvar senha'}</button>
                <button onClick={()=>setSenhaModal(null)} className="btn">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
