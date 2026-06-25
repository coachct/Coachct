'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import {
  Plus, Save, X, Calendar, List, AlertCircle,
  Pencil, Power, Users, Clock, ChevronDown, ChevronUp,
  Tag, RefreshCw, CheckCircle, CalendarDays, Filter, Trash2, CalendarX
} from 'lucide-react'

const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_FULL  = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const TIPOS = [
  { value: 'lift',               label: 'Lift' },
  { value: 'lift_for_girls',    label: 'Lift for Girls' },
  { value: 'running_funcional', label: 'Running + Funcional' },
]
const HORARIOS_VILA_OLIMPIA = [
  '06:00','07:00','08:00','09:00','10:00','10:15',
  '11:00','11:15','12:00','12:15','18:30','19:30',
]
const HORARIOS_PINHEIROS = [
  '06:20','07:20','09:00','10:00','10:15',
  '11:00','11:15','12:00','12:15','18:30','19:30',
]
const HORARIOS_PADRAO = [
  '05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:15','10:30','11:00','11:15','11:30',
  '12:00','12:15','12:30','13:00','14:00','15:00','16:00',
  '17:00','18:00','18:30','19:00','19:30','20:00',
]

function horariosParaUnidade(nomeUnidade: string): string[] {
  const nome = (nomeUnidade || '').toLowerCase()
  if (nome.includes('vila') || nome.includes('olímpia') || nome.includes('olimpia')) return HORARIOS_VILA_OLIMPIA
  if (nome.includes('pinheiros')) return HORARIOS_PINHEIROS
  return HORARIOS_PADRAO
}
const FORM_VAZIO = {
  tipo: 'lift', grupo_muscular_id: '', coach_id: '',
  dia_semana: 1, horario: '06:00', duracao_min: 50, capacidade: 24,
}

function tipoLabel(t: string) { return TIPOS.find(x => x.value === t)?.label ?? t }
function tipoColor(t: string) {
  if (t === 'lift')            return 'bg-blue-100 text-blue-700'
  if (t === 'lift_for_girls') return 'bg-pink-100 text-pink-700'
  return 'bg-cyan-100 text-cyan-700'
}
function capacidadePorUnidadeTipo(nomeUnidade: string, tipo: string): number {
  const nome = (nomeUnidade || '').toLowerCase()
  const isVila = nome.includes('vila') || nome.includes('olímpia') || nome.includes('olimpia')
  const isPinheiros = nome.includes('pinheiros')
  if (tipo === 'running_funcional') {
    if (isVila)      return 26
    if (isPinheiros) return 30
    return 30
  }
  return 24
}
function dataLocalStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function formatarDataPT(dataStr: string): string {
  const d = new Date(dataStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function gerarDatas(diaSemana: number, dataInicio: string, dataFim: string): string[] {
  const datas: string[] = []
  const fim = new Date(dataFim + 'T12:00:00')
  let cur = new Date(dataInicio + 'T12:00:00')
  while (cur.getDay() !== diaSemana) cur.setDate(cur.getDate() + 1)
  while (cur <= fim) { datas.push(dataLocalStr(cur)); cur.setDate(cur.getDate() + 7) }
  return datas
}
function dataFimPorMeses(meses: number): string {
  const d = new Date(); d.setMonth(d.getMonth() + meses); d.setDate(0)
  return dataLocalStr(d)
}

// Renderiza nome do coach na lista; quando vazio, mostra "Coach a definir" em vermelho
function NomeCoach({ nome, ehLink }: { nome?: string | null; ehLink?: boolean }) {
  if (nome && nome.trim()) return <span>{nome.split(' ')[0]}</span>
  return <span className="text-red-600 font-semibold">Coach a definir</span>
}

export default function JustClubAdminPage() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [unidades,        setUnidades]        = useState<any[]>([])
  const [unidadeAtiva,    setUnidadeAtiva]    = useState<any | null>(null)
  const [loadingUnidades, setLoadingUnidades] = useState(true)

  const [aulas,       setAulas]       = useState<any[]>([])
  const [coaches,     setCoaches]     = useState<any[]>([])
  const [grupos,      setGrupos]      = useState<any[]>([])
  const [ocorrencias, setOcorrencias] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [loadingOcs,  setLoadingOcs]  = useState(false)
  const [msg,         setMsg]         = useState('')

  const [abaAtiva, setAbaAtiva] = useState<'lista' | 'grade' | 'calendario' | 'grupos' | 'feriados'>('lista')
  const [filtroTipo,  setFiltroTipo]  = useState('todos')
  const [filtroCoach, setFiltroCoach] = useState('todos')
  const [diasCalendario, setDiasCalendario] = useState<7|15|30>(7)
  const [diasExpandidos, setDiasExpandidos] = useState<Set<number>>(new Set([1,2,3,4,5]))

  const [modalAberto, setModalAberto] = useState(false)
  const [editando,    setEditando]    = useState<any | null>(null)
  const [form,        setForm]        = useState({ ...FORM_VAZIO })
  const [salvando,    setSalvando]    = useState(false)

  // Troca de coach da grade: confirma a data de corte (congela passado, repinta futuro).
  const [confirmCoach, setConfirmCoach] = useState<null | {
    oldId: string | null; newId: string | null; oldNome: string; newNome: string; data: string
  }>(null)

  const [formReplicar, setFormReplicar] = useState(false)
  const [formMeses,    setFormMeses]    = useState(1)
  const [formInicio,   setFormInicio]   = useState(dataLocalStr(new Date()))

  const [modalReplicar,    setModalReplicar]    = useState<any | null>(null)
  const [replicarMeses,    setReplicarMeses]    = useState(1)
  const [replicarInicio,   setReplicarInicio]   = useState(dataLocalStr(new Date()))
  const [replicando,       setReplicando]        = useState(false)
  const [resultReplicacao, setResultReplicacao] = useState<{ criadas: number; existentes: number } | null>(null)

  const [novoGrupo,     setNovoGrupo]     = useState('')
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)
  const [editandoGrupo, setEditandoGrupo] = useState<any | null>(null)
  const [nomeGrupoEdit, setNomeGrupoEdit] = useState('')

  // Estado para modal de exclusão
  const [modalExcluir,   setModalExcluir]   = useState<{ aula?: any; ocorrencia?: any } | null>(null)
  const [excluindo,      setExcluindo]      = useState(false)
  const [infoReservas,   setInfoReservas]   = useState<{ ocorrencia: number; recorrencia: number; proximaData?: string } | null>(null)

  // NOVO: Feriados
  const [feriados,         setFeriados]         = useState<any[]>([])
  const [aulasFeriado,     setAulasFeriado]     = useState<any[]>([]) // club_aulas com feriado_id (desta unidade)
  const [loadingFeriados,  setLoadingFeriados]  = useState(false)
  const [modalNovoFeriado, setModalNovoFeriado] = useState(false)
  const [novoFeriadoData,  setNovoFeriadoData]  = useState('')
  const [novoFeriadoDesc,  setNovoFeriadoDesc]  = useState('')
  const [salvandoFeriado,  setSalvandoFeriado]  = useState(false)
  const [erroFeriado,      setErroFeriado]      = useState('')
  const [feriadoCtx,       setFeriadoCtx]       = useState<any | null>(null) // quando set, o modal de aula está em "modo feriado"
  const [removendoFeriado, setRemovendoFeriado] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && perfil && perfil.role !== 'admin' && perfil.role !== 'coordenadora') router.push('/')
  }, [perfil, loading])

  useEffect(() => { if (perfil) carregarUnidades() }, [perfil])
  useEffect(() => { if (perfil) carregarGrupos() }, [perfil])
  useEffect(() => {
    if (unidadeAtiva) { carregarAulas(); carregarCoachesDaUnidade() }
  }, [unidadeAtiva?.id])
  useEffect(() => {
    if (unidadeAtiva && abaAtiva === 'calendario') carregarOcorrencias(diasCalendario)
  }, [unidadeAtiva?.id, diasCalendario, abaAtiva])
  useEffect(() => {
    if (unidadeAtiva && abaAtiva === 'feriados') carregarFeriados()
  }, [unidadeAtiva?.id, abaAtiva])

  async function carregarUnidades() {
    setLoadingUnidades(true)
    const { data } = await supabase.from('unidades').select('id, nome, tipo').eq('tipo', 'club').eq('ativo', true).order('nome')
    setUnidades(data || [])
    setLoadingUnidades(false)
  }
  async function carregarGrupos() {
    const { data } = await supabase.from('grupos_musculares').select('id, nome, ativo').order('nome')
    setGrupos(data || [])
  }
  async function carregarCoachesDaUnidade() {
    if (!unidadeAtiva) return
    const { data: cu } = await supabase.from('coach_unidades').select('coach_id').eq('unidade_id', unidadeAtiva.id).eq('ativo', true)
    const ids = (cu || []).map((u: any) => u.coach_id)
    if (ids.length === 0) { setCoaches([]); return }
    const { data: cs } = await supabase.from('coaches').select('id, nome').eq('ativo', true).in('id', ids).order('nome')
    setCoaches(cs || [])
  }
  async function carregarAulas() {
    if (!unidadeAtiva) return
    setLoadingData(true)
    // Só a grade fixa regular (aulas de feriado têm feriado_id e ficam na aba Feriados)
    const { data } = await supabase.from('club_aulas')
      .select('*, coaches(id, nome), grupos_musculares(nome)')
      .eq('unidade_id', unidadeAtiva.id).is('feriado_id', null).order('dia_semana').order('horario')
    setAulas(data || [])
    setLoadingData(false)
  }
  async function carregarOcorrencias(dias: 7|15|30) {
    if (!unidadeAtiva) return
    setLoadingOcs(true)
    const hoje = dataLocalStr(new Date())
    const fim  = dataLocalStr(new Date(Date.now() + dias * 86400000))
    const { data: ids_data } = await supabase.from('club_aulas').select('id').eq('unidade_id', unidadeAtiva.id).eq('ativo', true)
    const ids = (ids_data || []).map((a: any) => a.id)
    if (!ids.length) { setOcorrencias([]); setLoadingOcs(false); return }
    const { data } = await supabase.from('club_ocorrencias')
      .select('*, club_aulas(id, tipo, horario, capacidade, coaches(id, nome), grupos_musculares(nome))')
      .in('aula_id', ids).eq('status', 'ativa').gte('data', hoje).lte('data', fim).order('data')
    setOcorrencias(data || [])
    setLoadingOcs(false)
  }

  // ===== FERIADOS =====

  async function carregarFeriados() {
    if (!unidadeAtiva) return
    setLoadingFeriados(true)
    const hoje = dataLocalStr(new Date())
    const { data: fer } = await supabase.from('feriados')
      .select('*').eq('unidade_id', unidadeAtiva.id).gte('data', hoje).order('data')
    setFeriados(fer || [])
    const ferIds = (fer || []).map((f: any) => f.id)
    if (ferIds.length) {
      const { data: af } = await supabase.from('club_aulas')
        .select('*, coaches(id, nome), grupos_musculares(nome)')
        .in('feriado_id', ferIds).order('horario')
      setAulasFeriado(af || [])
    } else {
      setAulasFeriado([])
    }
    setLoadingFeriados(false)
  }

  // IDs das aulas regulares (grade fixa) desta unidade
  async function idsAulasRegulares(): Promise<string[]> {
    if (!unidadeAtiva) return []
    const { data } = await supabase.from('club_aulas').select('id')
      .eq('unidade_id', unidadeAtiva.id).is('feriado_id', null)
    return (data || []).map((a: any) => a.id)
  }

  // Cancela as ocorrências regulares de uma data (+ reservas)
  async function cancelarOcorrenciasRegularesDoDia(data: string) {
    const ids = await idsAulasRegulares()
    if (!ids.length) return
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id').in('aula_id', ids).eq('data', data).eq('status', 'ativa')
    const ocIds = (ocs || []).map((o: any) => o.id)
    if (!ocIds.length) return
    await supabase.from('club_reservas')
      .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
      .in('ocorrencia_id', ocIds).neq('status', 'cancelado')
    await supabase.from('club_ocorrencias').update({ status: 'cancelada' }).in('id', ocIds)
  }

  async function criarFeriado() {
    if (!novoFeriadoData) { setErroFeriado('Selecione a data.'); return }
    if (!novoFeriadoDesc.trim()) { setErroFeriado('Descreva o feriado.'); return }
    if (!unidadeAtiva) return

    // Conta reservas regulares do dia que serão canceladas
    const idsReg = await idsAulasRegulares()
    let reservasNoDia = 0
    if (idsReg.length) {
      const { data: ocsDia } = await supabase.from('club_ocorrencias')
        .select('id').in('aula_id', idsReg).eq('data', novoFeriadoData).eq('status', 'ativa')
      const ocIds = (ocsDia || []).map((o: any) => o.id)
      if (ocIds.length) {
        const { count } = await supabase.from('club_reservas').select('*', { count: 'exact', head: true })
          .in('ocorrencia_id', ocIds).neq('status', 'cancelado')
        reservasNoDia = count || 0
      }
    }
    const aviso = reservasNoDia > 0 ? `\n\nAtenção: ${reservasNoDia} reserva(s) desse dia serão canceladas.` : ''
    if (!confirm(`Marcar ${novoFeriadoData} como feriado vai cancelar as aulas regulares desse dia.${aviso}\n\nContinuar?`)) return

    setSalvandoFeriado(true); setErroFeriado('')
    const { data: novoFer, error } = await supabase.from('feriados').insert({
      unidade_id: unidadeAtiva.id,
      data: novoFeriadoData,
      descricao: novoFeriadoDesc.trim(),
      ativo: true,
    }).select('id').maybeSingle()

    if (error) {
      if (error.code === '23505') setErroFeriado('Já existe feriado nesta data.')
      else setErroFeriado('Erro ao criar feriado.')
      setSalvandoFeriado(false)
      return
    }

    // Cancela as ocorrências regulares do dia
    await cancelarOcorrenciasRegularesDoDia(novoFeriadoData)

    setModalNovoFeriado(false)
    setNovoFeriadoData(''); setNovoFeriadoDesc('')
    setSalvandoFeriado(false)
    await carregarFeriados()
    showMsg('Feriado criado. Aulas regulares do dia canceladas.')
  }

  async function removerFeriado(feriado: any) {
    if (!confirm(`Remover o feriado de ${feriado.data}?\n\nAs aulas do feriado serão apagadas e as aulas regulares desse dia voltam a valer.`)) return
    setRemovendoFeriado(feriado.id)

    // 1) Aulas do feriado: cancela reservas, apaga ocorrências, apaga aulas
    const { data: af } = await supabase.from('club_aulas').select('id').eq('feriado_id', feriado.id)
    const aulaIds = (af || []).map((a: any) => a.id)
    if (aulaIds.length) {
      const { data: ocs } = await supabase.from('club_ocorrencias').select('id').in('aula_id', aulaIds)
      const ocIds = (ocs || []).map((o: any) => o.id)
      if (ocIds.length) {
        await supabase.from('club_reservas')
          .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
          .in('ocorrencia_id', ocIds).neq('status', 'cancelado')
        await supabase.from('club_ocorrencias').delete().in('id', ocIds)
      }
      await supabase.from('club_aulas').delete().in('id', aulaIds)
    }

    // 2) Reativa as ocorrências regulares do dia
    const idsReg = await idsAulasRegulares()
    if (idsReg.length) {
      await supabase.from('club_ocorrencias').update({ status: 'ativa' })
        .in('aula_id', idsReg).eq('data', feriado.data).eq('status', 'cancelada')
    }

    // 3) Apaga o feriado
    await supabase.from('feriados').delete().eq('id', feriado.id)

    setRemovendoFeriado(null)
    await carregarFeriados()
    showMsg('Feriado removido. Aulas regulares do dia reativadas.')
  }

  async function removerAulaFeriado(aula: any) {
    if (!confirm(`Remover a aula ${tipoLabel(aula.tipo)} ${(aula.horario||'').slice(0,5)} deste feriado?`)) return
    const { data: ocs } = await supabase.from('club_ocorrencias').select('id').eq('aula_id', aula.id)
    const ocIds = (ocs || []).map((o: any) => o.id)
    if (ocIds.length) {
      await supabase.from('club_reservas')
        .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
        .in('ocorrencia_id', ocIds).neq('status', 'cancelado')
      await supabase.from('club_ocorrencias').delete().in('id', ocIds)
    }
    await supabase.from('club_aulas').delete().eq('id', aula.id)
    await carregarFeriados()
    showMsg('Aula do feriado removida.')
  }

  function abrirNovaAulaFeriado(feriado: any) {
    setEditando(null)
    setFeriadoCtx(feriado)
    const weekday = new Date(feriado.data + 'T12:00:00').getDay()
    const primeiroHorario = horariosParaUnidade(unidadeAtiva?.nome || '')[0] || '06:00'
    const capInicial = capacidadePorUnidadeTipo(unidadeAtiva?.nome || '', 'lift')
    setForm({ ...FORM_VAZIO, dia_semana: weekday, horario: primeiroHorario, capacidade: capInicial, grupo_muscular_id: gruposAtivos[0]?.id || '', coach_id: '' })
    setFormReplicar(false)
    setModalAberto(true)
  }

  // ===== /FERIADOS =====

  function aplicarFiltros(lista: any[]): any[] {
    return lista.filter(a => {
      const matchTipo  = filtroTipo  === 'todos' || a.tipo === filtroTipo
      const matchCoach = filtroCoach === 'todos' || (a.coaches?.id || a.coach_id) === filtroCoach
      return matchTipo && matchCoach
    })
  }
  function aplicarFiltrosOcs(lista: any[]): any[] {
    return lista.filter(oc => {
      const a = oc.club_aulas
      return (filtroTipo==='todos'||a?.tipo===filtroTipo) && (filtroCoach==='todos'||a?.coaches?.id===filtroCoach)
    })
  }

  function abrirNovaAula() {
    setEditando(null)
    setFeriadoCtx(null)
    const primeiroHorario = horariosParaUnidade(unidadeAtiva?.nome || '')[0] || '06:00'
    const capInicial = capacidadePorUnidadeTipo(unidadeAtiva?.nome || '', 'lift')
    // coach_id começa vazio = "Coach a definir" (opcional)
    setForm({ ...FORM_VAZIO, horario: primeiroHorario, capacidade: capInicial, grupo_muscular_id: gruposAtivos[0]?.id||'', coach_id: '' })
    setFormReplicar(false); setFormMeses(1); setFormInicio(dataLocalStr(new Date()))
    setModalAberto(true)
  }
  function abrirEdicao(aula: any) {
    setEditando(aula)
    setFeriadoCtx(null)
    setForm({ tipo: aula.tipo, grupo_muscular_id: aula.grupo_muscular_id, coach_id: aula.coach_id || '',
      dia_semana: aula.dia_semana, horario: (aula.horario||'').slice(0,5),
      duracao_min: aula.duracao_min, capacidade: aula.capacidade })
    setModalAberto(true)
  }

  async function salvar() {
    if (!unidadeAtiva) return
    if (!form.grupo_muscular_id) { showMsg('Selecione o grupo muscular.'); return }

    // Editou e trocou o coach da grade → pede a data de corte antes de salvar.
    // Sem corte, a troca repintaria o histórico (relatório lê oc.coach_id || aula.coach_id).
    if (editando && !feriadoCtx && (editando.coach_id || null) !== (form.coach_id || null) && !confirmCoach) {
      const nomeDe = (id: string | null) => id ? (coaches.find((c: any) => c.id === id)?.nome || 'Coach') : 'Coach a definir'
      setConfirmCoach({
        oldId: editando.coach_id || null,
        newId: form.coach_id || null,
        oldNome: nomeDe(editando.coach_id || null),
        newNome: nomeDe(form.coach_id || null),
        data: dataLocalStr(new Date()),
      })
      return
    }

    // coach é opcional — pode salvar sem (vai como NULL = "Coach a definir")
    setSalvando(true)

    // MODO FERIADO: cria aula avulsa (feriado_id) + 1 ocorrência na data do feriado, sem recorrência
    if (feriadoCtx) {
      const payload = {
        unidade_id: unidadeAtiva.id, tipo: form.tipo,
        grupo_muscular_id: form.grupo_muscular_id,
        coach_id: form.coach_id || null,
        dia_semana: form.dia_semana, horario: form.horario+':00',
        duracao_min: form.duracao_min, capacidade: form.capacidade,
        so_mulheres: form.tipo === 'lift_for_girls',
        ativo: true, feriado_id: feriadoCtx.id,
      }
      const { data: nova, error } = await supabase.from('club_aulas').insert(payload).select('id').maybeSingle()
      if (error) { showMsg('Erro: '+error.message); setSalvando(false); return }
      const { error: errOc } = await supabase.from('club_ocorrencias')
        .insert({ aula_id: nova?.id, data: feriadoCtx.data, status: 'ativa' })
      if (errOc) { showMsg('Erro: '+errOc.message); setSalvando(false); return }
      setSalvando(false); setModalAberto(false); setFeriadoCtx(null)
      await carregarFeriados()
      showMsg('Aula do feriado criada!')
      return
    }

    const payload = {
      unidade_id: unidadeAtiva.id, tipo: form.tipo,
      grupo_muscular_id: form.grupo_muscular_id,
      coach_id: form.coach_id || null,
      dia_semana: form.dia_semana, horario: form.horario+':00',
      duracao_min: form.duracao_min, capacidade: form.capacidade,
      so_mulheres: form.tipo === 'lift_for_girls',
      ativo: true,
    }
    let aulaId = editando?.id
    // Detecta mudança de dia da semana numa edição — único campo que deixa ocorrências órfãs.
    // Number() nos dois lados evita falso positivo caso o form guarde o dia como string.
    const diaMudou = !!editando && Number(editando.dia_semana) !== Number(form.dia_semana)
    if (editando) {
      const { error } = await supabase.from('club_aulas').update(payload).eq('id', editando.id)
      if (error) { showMsg('Erro: '+error.message); setSalvando(false); return }

      // Dia da semana mudou: reconcilia as ocorrências futuras para o novo dia.
      // As ocorrências guardam apenas a DATA; ao mudar o dia da grade, as futuras continuariam
      // no dia antigo e contando pro coach no dia errado. Aqui elas são movidas para o dia novo.
      if (diaMudou && aulaId) {
        const hoje = dataLocalStr(new Date())
        const { data: futuras } = await supabase.from('club_ocorrencias')
          .select('id, data').eq('aula_id', aulaId).gte('data', hoje)
        const futIds = (futuras || []).map((o: any) => o.id)
        if (futIds.length) {
          // Horizonte = última data futura existente (mantém o alcance que a recorrência já tinha)
          const horizonte = (futuras || []).reduce((max: string, o: any) => (o.data > max ? o.data : max), hoje)
          // Derruba reservas futuras e apaga as ocorrências do dia antigo
          await supabase.from('club_reservas')
            .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
            .in('ocorrencia_id', futIds).neq('status', 'cancelado')
          await supabase.from('club_ocorrencias').delete().in('id', futIds)
          // Regenera as ocorrências futuras já no dia novo, do próximo dia válido até o horizonte
          const novasDatas = gerarDatas(form.dia_semana, hoje, horizonte)
          if (novasDatas.length > 0) {
            await supabase.from('club_ocorrencias')
              .insert(novasDatas.map(data => ({ aula_id: aulaId, data, status: 'ativa' })))
          }
        }
      }

      // Troca de coach com data de corte: congela o passado e repinta o futuro.
      // Passado sem coach explícito → carimba o coach ANTIGO (vira valor gravado, não some no relatório).
      // Futuro que estava no coach antigo → passa pro coach NOVO. Futuro sem coach segue a grade nova.
      // Dias futuros num TERCEIRO coach (escala pontual) não são tocados — esses usam "corrigir coach".
      if (confirmCoach && aulaId && confirmCoach.oldId) {
        const corte = confirmCoach.data
        await supabase.from('club_ocorrencias')
          .update({ coach_id: confirmCoach.oldId })
          .eq('aula_id', aulaId).lt('data', corte).is('coach_id', null)
        await supabase.from('club_ocorrencias')
          .update({ coach_id: confirmCoach.newId })
          .eq('aula_id', aulaId).gte('data', corte).eq('coach_id', confirmCoach.oldId)
      }
    } else {
      const { data: nova, error } = await supabase.from('club_aulas').insert(payload).select('id').maybeSingle()
      if (error) { showMsg('Erro: '+error.message); setSalvando(false); return }
      aulaId = nova?.id
    }
    if (!editando && formReplicar && aulaId) {
      const datas = gerarDatas(form.dia_semana, formInicio, dataFimPorMeses(formMeses))
      if (datas.length > 0) await supabase.from('club_ocorrencias').insert(datas.map(data => ({ aula_id: aulaId, data, status: 'ativa' })))
      showMsg(`Aula criada e ${datas.length} ocorrência${datas.length!==1?'s':''} gerada${datas.length!==1?'s':''}!`)
    } else if (editando) {
      showMsg(
        confirmCoach
          ? `Coach trocado a partir de ${confirmCoach.data.split('-').reverse().join('/')} — passado preservado.`
          : diaMudou ? 'Aula atualizada — ocorrências futuras movidas para o novo dia.' : 'Aula atualizada!'
      )
    } else {
      showMsg('Aula criada!')
    }
    setSalvando(false); setModalAberto(false); setEditando(null); setConfirmCoach(null)
    await carregarAulas()
    if (abaAtiva==='calendario') carregarOcorrencias(diasCalendario)
  }

  async function toggleAtivo(aula: any) {
    await supabase.from('club_aulas').update({ ativo: !aula.ativo }).eq('id', aula.id)
    await carregarAulas()
  }
  function abrirReplicar(aula: any) {
    setModalReplicar(aula); setReplicarMeses(1)
    setReplicarInicio(dataLocalStr(new Date())); setResultReplicacao(null)
  }
  async function executarReplicacao() {
    if (!modalReplicar) return
    setReplicando(true)
    const datas = gerarDatas(modalReplicar.dia_semana, replicarInicio, dataFimPorMeses(replicarMeses))
    if (!datas.length) { showMsg('Nenhuma data no período.'); setReplicando(false); return }
    const { data: exist } = await supabase.from('club_ocorrencias').select('data').eq('aula_id', modalReplicar.id).in('data', datas)
    const existSet = new Set((exist||[]).map((e:any)=>e.data))
    const novas = datas.filter(d=>!existSet.has(d))
    if (novas.length > 0) {
      const { error } = await supabase.from('club_ocorrencias').insert(novas.map(data=>({ aula_id: modalReplicar.id, data, status: 'ativa' })))
      if (error) { showMsg('Erro: '+error.message); setReplicando(false); return }
    }
    setResultReplicacao({ criadas: novas.length, existentes: existSet.size })
    setReplicando(false)
    if (abaAtiva==='calendario') carregarOcorrencias(diasCalendario)
  }

  // Abre modal de exclusão a partir da LISTA (aula recorrente)
  async function abrirExcluirAula(aula: any) {
    setModalExcluir({ aula })
    setInfoReservas(null)
    // Busca ocorrências futuras e próxima data
    const hoje = dataLocalStr(new Date())
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id, data').eq('aula_id', aula.id).eq('status','ativa').gte('data', hoje).order('data')
    const proximaOc = ocs?.[0]
    const ocIds = (ocs || []).map((o:any) => o.id)
    let reservasOc = 0
    let reservasRec = 0
    if (proximaOc) {
      const { count: c1 } = await supabase.from('club_reservas').select('*', { count:'exact', head:true })
        .eq('ocorrencia_id', proximaOc.id).neq('status','cancelado')
      reservasOc = c1 || 0
    }
    if (ocIds.length) {
      const { count: c2 } = await supabase.from('club_reservas').select('*', { count:'exact', head:true })
        .in('ocorrencia_id', ocIds).neq('status','cancelado')
      reservasRec = c2 || 0
    }
    setInfoReservas({ ocorrencia: reservasOc, recorrencia: reservasRec, proximaData: proximaOc?.data })
  }

  // Abre modal de exclusão a partir do CALENDÁRIO (ocorrência específica)
  async function abrirExcluirOcorrencia(ocorrencia: any) {
    setModalExcluir({ ocorrencia })
    setInfoReservas(null)
    const aulaId = ocorrencia.aula_id || ocorrencia.club_aulas?.id
    const hoje = dataLocalStr(new Date())
    // Reservas só dessa ocorrência
    const { count: c1 } = await supabase.from('club_reservas').select('*', { count:'exact', head:true })
      .eq('ocorrencia_id', ocorrencia.id).neq('status','cancelado')
    // Reservas de toda a recorrência futura
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id').eq('aula_id', aulaId).eq('status','ativa').gte('data', hoje)
    const ocIds = (ocs || []).map((o:any) => o.id)
    let reservasRec = 0
    if (ocIds.length) {
      const { count: c2 } = await supabase.from('club_reservas').select('*', { count:'exact', head:true })
        .in('ocorrencia_id', ocIds).neq('status','cancelado')
      reservasRec = c2 || 0
    }
    setInfoReservas({ ocorrencia: c1 || 0, recorrencia: reservasRec, proximaData: ocorrencia.data })
  }

  // Cancela somente a próxima ocorrência (mantém a regra)
  async function excluirSomenteOcorrencia() {
    if (!modalExcluir) return
    setExcluindo(true)
    const aulaId = modalExcluir.aula?.id || modalExcluir.ocorrencia?.aula_id || modalExcluir.ocorrencia?.club_aulas?.id
    let ocId = modalExcluir.ocorrencia?.id
    if (!ocId && aulaId) {
      const hoje = dataLocalStr(new Date())
      const { data } = await supabase.from('club_ocorrencias')
        .select('id').eq('aula_id', aulaId).eq('status','ativa').gte('data', hoje).order('data').limit(1)
      ocId = data?.[0]?.id
    }
    if (!ocId) { showMsg('Nenhuma ocorrência futura para cancelar.'); setExcluindo(false); setModalExcluir(null); return }
    // Cancela reservas dessa ocorrência
    await supabase.from('club_reservas').update({ status:'cancelado', cancelado_em: new Date().toISOString() })
      .eq('ocorrencia_id', ocId).neq('status','cancelado')
    // Marca a ocorrência como cancelada
    await supabase.from('club_ocorrencias').update({ status: 'cancelada' }).eq('id', ocId)
    setExcluindo(false); setModalExcluir(null); setInfoReservas(null)
    await carregarAulas()
    if (abaAtiva==='calendario') await carregarOcorrencias(diasCalendario)
    showMsg('Ocorrência cancelada.')
  }

  // Exclui toda a recorrência (apaga regra + todas as ocorrências futuras)
  async function excluirTodaRecorrencia() {
    if (!modalExcluir) return
    setExcluindo(true)
    const aulaId = modalExcluir.aula?.id || modalExcluir.ocorrencia?.aula_id || modalExcluir.ocorrencia?.club_aulas?.id
    if (!aulaId) { setExcluindo(false); setModalExcluir(null); return }
    const hoje = dataLocalStr(new Date())
    // Busca ocorrências futuras
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id').eq('aula_id', aulaId).gte('data', hoje)
    const ocIds = (ocs || []).map((o:any) => o.id)
    if (ocIds.length) {
      // Cancela reservas
      await supabase.from('club_reservas').update({ status:'cancelado', cancelado_em: new Date().toISOString() })
        .in('ocorrencia_id', ocIds).neq('status','cancelado')
      // Apaga ocorrências futuras
      await supabase.from('club_ocorrencias').delete().in('id', ocIds)
    }
    // Verifica se sobrou alguma ocorrência passada
    const { count: passadas } = await supabase.from('club_ocorrencias').select('*', { count:'exact', head:true }).eq('aula_id', aulaId)
    if (passadas && passadas > 0) {
      // Mantém histórico — desativa a regra
      await supabase.from('club_aulas').update({ ativo: false }).eq('id', aulaId)
    } else {
      // Sem histórico — apaga de vez
      await supabase.from('club_aulas').delete().eq('id', aulaId)
    }
    setExcluindo(false); setModalExcluir(null); setInfoReservas(null)
    await carregarAulas()
    if (abaAtiva==='calendario') await carregarOcorrencias(diasCalendario)
    showMsg('Recorrência excluída.')
  }

  async function criarGrupo() {
    if (!novoGrupo.trim()) return
    setSalvandoGrupo(true)
    const { error } = await supabase.from('grupos_musculares').insert({ nome: novoGrupo.trim(), ativo: true })
    setSalvandoGrupo(false)
    if (error) { showMsg('Erro: '+error.message); return }
    setNovoGrupo(''); await carregarGrupos(); showMsg('Grupo criado!')
  }
  async function salvarEdicaoGrupo() {
    if (!editandoGrupo||!nomeGrupoEdit.trim()) return
    await supabase.from('grupos_musculares').update({ nome: nomeGrupoEdit.trim() }).eq('id', editandoGrupo.id)
    setEditandoGrupo(null); setNomeGrupoEdit(''); await carregarGrupos(); showMsg('Grupo atualizado!')
  }
  async function toggleGrupo(grupo: any) {
    await supabase.from('grupos_musculares').update({ ativo: grupo.ativo===false?true:false }).eq('id', grupo.id)
    await carregarGrupos()
  }

  function showMsg(texto: string) { setMsg(texto); setTimeout(()=>setMsg(''), 4000) }
  function toggleDia(idx: number) {
    setDiasExpandidos(prev=>{ const n=new Set(prev); n.has(idx)?n.delete(idx):n.add(idx); return n })
  }

  const todasAulas   = aplicarFiltros(aulas)
  const aulasAtivas  = aplicarFiltros(aulas.filter(a=>a.ativo))
  const porDia       = DIAS_ABREV.map((_,i)=>aulasAtivas.filter(a=>a.dia_semana===i))
  const gruposAtivos = grupos.filter(g=>g.ativo!==false)
  const ocsFiltered  = aplicarFiltrosOcs(ocorrencias)
  const ocsPorData: Record<string,any[]> = {}
  for (const oc of ocsFiltered) { if (!ocsPorData[oc.data]) ocsPorData[oc.data]=[]; ocsPorData[oc.data].push(oc) }
  const temFiltros = filtroTipo!=='todos'||filtroCoach!=='todos'
  const datasPreview = modalReplicar ? gerarDatas(modalReplicar.dia_semana, replicarInicio, dataFimPorMeses(replicarMeses)) : []

  if (loading || loadingUnidades) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-6 pt-4 pb-0">
          <h1 className="text-lg font-semibold text-gray-900 mb-4">JustClub — Aulas coletivas</h1>
          <div className="flex gap-0">
            {unidades.map(u => {
              const ativa = unidadeAtiva?.id === u.id
              return (
                <button key={u.id} onClick={() => setUnidadeAtiva(u)}
                  className={`px-6 py-2.5 text-sm font-medium border-b-2 transition-all relative ${ativa?'border-primary-600 text-primary-700 bg-primary-50/50':'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                  {u.nome}
                  {ativa && unidadeAtiva && <span className="ml-2 text-xs text-primary-500 font-normal">{aulas.filter(a=>a.ativo).length} aulas</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {!unidadeAtiva ? (
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
            <CalendarDays size={30} className="text-gray-400"/>
          </div>
          <h3 className="font-semibold text-gray-700 text-lg mb-2">Selecione uma unidade</h3>
          <p className="text-sm text-gray-400 mb-6">Clique em uma das abas acima para gerenciar as aulas coletivas.</p>
          <div className="flex gap-3 justify-center">
            {unidades.map(u => (
              <button key={u.id} onClick={() => setUnidadeAtiva(u)}
                className="px-6 py-3 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all">
                {u.nome}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-6 py-5">

          {msg && (
            <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${msg.startsWith('Erro')?'bg-red-50 text-red-700 border border-red-100':'bg-green-50 text-green-800 border border-green-100'}`}>{msg}</div>
          )}

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {(['lista','grade','calendario','grupos','feriados'] as const).map(aba => {
              const cfg = {
                lista:      { label: 'Lista',         icon: <List size={14}/> },
                grade:      { label: 'Grade semanal', icon: <Calendar size={14}/> },
                calendario: { label: 'Calendário',    icon: <CalendarDays size={14}/> },
                grupos:     { label: 'Grupos',        icon: <Tag size={14}/> },
                feriados:   { label: 'Feriados',      icon: <CalendarX size={14}/> },
              }
              const count = aba==='lista'?aulas.filter(a=>a.ativo).length:aba==='grupos'?gruposAtivos.length:aba==='calendario'?ocsFiltered.length:aba==='feriados'?feriados.length:0
              return (
                <button key={aba}
                  onClick={() => { setAbaAtiva(aba); if (aba==='calendario') carregarOcorrencias(diasCalendario); if (aba==='feriados') carregarFeriados() }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${abaAtiva===aba?'bg-primary-600 text-white':'bg-white border border-gray-200 text-gray-600 hover:border-primary-300'}`}>
                  {cfg[aba].icon} {cfg[aba].label}
                  {count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${abaAtiva===aba?'bg-white text-primary-600':'bg-primary-100 text-primary-700'}`}>{count}</span>}
                </button>
              )
            })}
            {abaAtiva!=='grupos' && abaAtiva!=='feriados' && (
              <button onClick={abrirNovaAula}
                className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition-all">
                <Plus size={14}/> Nova aula
              </button>
            )}
          </div>

          {abaAtiva!=='grupos' && abaAtiva!=='feriados' && (
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
              <Filter size={13} className="text-gray-400 flex-shrink-0"/>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={()=>setFiltroTipo('todos')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${filtroTipo==='todos'?'bg-gray-800 text-white border-gray-800':'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  Todos
                </button>
                {TIPOS.map(t => (
                  <button key={t.value} onClick={()=>setFiltroTipo(filtroTipo===t.value?'todos':t.value)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${filtroTipo===t.value?tipoColor(t.value)+' border-transparent':'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-gray-200 flex-shrink-0"/>
              <select value={filtroCoach} onChange={e=>setFiltroCoach(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:border-primary-400">
                <option value="todos">Todos os coaches</option>
                {coaches.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              {temFiltros && (
                <button onClick={()=>{ setFiltroTipo('todos'); setFiltroCoach('todos') }}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 ml-auto">
                  <X size={11}/> Limpar
                </button>
              )}
            </div>
          )}

          {loadingData && (abaAtiva==='lista'||abaAtiva==='grade') ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : (
            <>
              {abaAtiva==='lista' && (
                <div className="space-y-3">
                  {todasAulas.length===0 ? (
                    <div className="card text-center py-14">
                      <Calendar size={32} className="text-gray-300 mx-auto mb-3"/>
                      <p className="text-gray-400 text-sm">{temFiltros?'Nenhuma aula com os filtros selecionados.':`Nenhuma aula cadastrada para ${unidadeAtiva.nome}.`}</p>
                      {!temFiltros && <button onClick={abrirNovaAula} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700"><Plus size={14}/> Criar primeira aula</button>}
                    </div>
                  ) : todasAulas.map(aula => (
                    <div key={aula.id} className={`card transition-opacity ${!aula.ativo?'opacity-50 border-dashed':''}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0 border border-primary-100">
                          {DIAS_ABREV[aula.dia_semana]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipoColor(aula.tipo)}`}>{tipoLabel(aula.tipo)}</span>
                            {!aula.ativo && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inativa</span>}
                          </div>
                          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{DIAS_FULL[aula.dia_semana]}</span>
                            <span className="flex items-center gap-1 font-mono text-sm font-bold text-primary-700"><Clock size={12}/> {(aula.horario||'').slice(0,5)}</span>
                            <span className="text-xs text-gray-400">{aula.duracao_min}min</span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span>🏋️ {aula.grupos_musculares?.nome||'—'}</span>
                            <span>👤 <NomeCoach nome={aula.coaches?.nome}/></span>
                            <span className="flex items-center gap-1"><Users size={10}/> {aula.capacidade} vagas</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <div className="flex gap-1.5">
                            <button onClick={()=>abrirEdicao(aula)} className="btn btn-sm gap-1 text-gray-600 hover:bg-gray-100"><Pencil size={12}/> Editar</button>
                            <button onClick={()=>toggleAtivo(aula)} className={`btn btn-sm gap-1 ${aula.ativo?'text-red-500 hover:bg-red-50':'text-green-600 hover:bg-green-50'}`}>
                              <Power size={12}/> {aula.ativo?'Desativar':'Ativar'}
                            </button>
                            <button onClick={()=>abrirExcluirAula(aula)} className="btn btn-sm gap-1 text-red-600 hover:bg-red-50 border border-red-200" title="Excluir">
                              <Trash2 size={12}/>
                            </button>
                          </div>
                          {aula.ativo && (
                            <button onClick={()=>abrirReplicar(aula)} className="btn btn-sm gap-1 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 w-full justify-center">
                              <RefreshCw size={12}/> Replicar grade
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {abaAtiva==='grade' && (
                <div className="space-y-3">
                  {aulasAtivas.length===0 ? (
                    <div className="card text-center py-14"><Calendar size={32} className="text-gray-300 mx-auto mb-3"/><p className="text-gray-400 text-sm">{temFiltros?'Nenhuma aula com os filtros.':'Nenhuma aula ativa.'}</p></div>
                  ) : DIAS_FULL.map((dia,idx) => {
                    const aulasNoDia = porDia[idx]
                    if (!aulasNoDia.length) return null
                    const expandido = diasExpandidos.has(idx)
                    return (
                      <div key={idx} className="card">
                        <button onClick={()=>toggleDia(idx)} className="w-full flex items-center gap-3 text-left">
                          <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{DIAS_ABREV[idx]}</div>
                          <div className="flex-1"><span className="font-semibold text-gray-900 text-sm">{dia}</span><span className="text-xs text-gray-400 ml-2">{aulasNoDia.length} aula{aulasNoDia.length!==1?'s':''}</span></div>
                          {expandido?<ChevronUp size={16} className="text-gray-400"/>:<ChevronDown size={16} className="text-gray-400"/>}
                        </button>
                        {expandido && (
                          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                            {aulasNoDia.sort((a,b)=>a.horario.localeCompare(b.horario)).map(aula => (
                              <div key={aula.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                                <span className="font-mono text-sm font-bold text-gray-900 w-12 flex-shrink-0">{(aula.horario||'').slice(0,5)}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${tipoColor(aula.tipo)}`}>{tipoLabel(aula.tipo)}</span>
                                <span className="text-xs text-gray-600 flex-1 truncate">{aula.grupos_musculares?.nome||'—'}</span>
                                <span className="text-xs text-gray-400 flex-shrink-0">👤 <NomeCoach nome={aula.coaches?.nome}/></span>
                                <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1"><Users size={10}/> {aula.capacidade}</span>
                                <button onClick={()=>abrirEdicao(aula)} className="text-gray-400 hover:text-primary-600 flex-shrink-0"><Pencil size={13}/></button>
                                <button onClick={()=>abrirExcluirAula(aula)} className="text-gray-400 hover:text-red-600 flex-shrink-0" title="Excluir"><Trash2 size={13}/></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {abaAtiva==='calendario' && (
                <div>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {([7,15,30] as const).map(d => (
                      <button key={d} onClick={()=>setDiasCalendario(d)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${diasCalendario===d?'bg-primary-600 text-white border-primary-600':'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
                        Próximos {d} dias
                      </button>
                    ))}
                    {!loadingOcs && <span className="text-xs text-gray-400 ml-auto">{ocsFiltered.length} ocorrência{ocsFiltered.length!==1?'s':''}{temFiltros?' (filtrado)':''}</span>}
                  </div>
                  {loadingOcs ? (
                    <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/></div>
                  ) : ocsFiltered.length===0 ? (
                    <div className="card text-center py-14">
                      <CalendarDays size={32} className="text-gray-300 mx-auto mb-3"/>
                      <p className="text-gray-400 text-sm">{temFiltros?'Nenhuma aula com os filtros.':'Nenhuma aula nos próximos '+diasCalendario+' dias.'}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(ocsPorData).sort().map(([data, ocs]) => {
                        const d = new Date(data+'T12:00:00')
                        const hoje  = dataLocalStr(new Date())
                        const amanha = dataLocalStr(new Date(Date.now()+86400000))
                        const ehHoje   = data===hoje
                        const ehAmanha = data===amanha
                        return (
                          <div key={data} className="card">
                            <div className="flex items-center gap-2 mb-3">
                              <div className={`w-9 h-9 rounded-xl text-xs font-bold flex items-center justify-center flex-shrink-0 ${ehHoje?'bg-primary-600 text-white':ehAmanha?'bg-primary-100 text-primary-700':'bg-gray-100 text-gray-600'}`}>
                                {DIAS_ABREV[d.getDay()]}
                              </div>
                              <div className="flex-1">
                                <span className="font-semibold text-gray-900 text-sm">{d.toLocaleDateString('pt-BR',{day:'2-digit',month:'long'})}</span>
                                {ehHoje   && <span className="ml-2 text-xs text-primary-600 font-semibold">Hoje</span>}
                                {ehAmanha && <span className="ml-2 text-xs text-primary-400 font-medium">Amanhã</span>}
                              </div>
                              <span className="text-xs text-gray-400">{(ocs as any[]).length} aula{(ocs as any[]).length!==1?'s':''}</span>
                            </div>
                            <div className="space-y-1.5">
                              {(ocs as any[]).sort((a,b)=>(a.club_aulas?.horario||'').localeCompare(b.club_aulas?.horario||'')).map(oc => (
                                <div key={oc.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
                                  <span className="font-mono text-sm font-bold text-gray-900 w-12 flex-shrink-0">{(oc.club_aulas?.horario||'').slice(0,5)}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${tipoColor(oc.club_aulas?.tipo||'')}`}>{tipoLabel(oc.club_aulas?.tipo||'')}</span>
                                  <span className="text-xs text-gray-600 flex-1 truncate">{oc.club_aulas?.grupos_musculares?.nome||'—'}</span>
                                  <span className="text-xs text-gray-400 flex-shrink-0">👤 <NomeCoach nome={oc.club_aulas?.coaches?.nome}/></span>
                                  <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1"><Users size={10}/> {oc.club_aulas?.capacidade||'—'}</span>
                                  <button onClick={()=>abrirExcluirOcorrencia(oc)} className="text-gray-400 hover:text-red-600 flex-shrink-0" title="Excluir"><Trash2 size={13}/></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {abaAtiva==='grupos' && (
                <div className="space-y-4">
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Novo grupo muscular</h3>
                    <div className="flex gap-2">
                      <input className="input flex-1" placeholder="Ex: Inferiores, Full Body, HIIT & ABS..."
                        value={novoGrupo} onChange={e=>setNovoGrupo(e.target.value)} onKeyDown={e=>e.key==='Enter'&&criarGrupo()}/>
                      <button onClick={criarGrupo} disabled={salvandoGrupo||!novoGrupo.trim()} className="btn bg-primary-600 text-white hover:bg-primary-700 gap-1 disabled:opacity-50 flex-shrink-0">
                        <Plus size={14}/> {salvandoGrupo?'Criando...':'Criar'}
                      </button>
                    </div>
                  </div>
                  <div className="card">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Grupos cadastrados <span className="ml-1 text-xs font-normal text-gray-400">{grupos.length} total</span></h3>
                    {grupos.length===0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm"><Tag size={24} className="mx-auto mb-2 text-gray-300"/> Nenhum grupo.</div>
                    ) : (
                      <div className="space-y-2">
                        {grupos.map(grupo => (
                          <div key={grupo.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${grupo.ativo===false?'bg-gray-50 border-gray-100 opacity-60':'bg-white border-gray-100'}`}>
                            {editandoGrupo?.id===grupo.id ? (
                              <>
                                <input className="input flex-1 py-1 text-sm" value={nomeGrupoEdit} onChange={e=>setNomeGrupoEdit(e.target.value)} onKeyDown={e=>e.key==='Enter'&&salvarEdicaoGrupo()} autoFocus/>
                                <button onClick={salvarEdicaoGrupo} className="btn btn-sm bg-primary-600 text-white gap-1"><Save size={12}/> Salvar</button>
                                <button onClick={()=>setEditandoGrupo(null)} className="btn btn-sm text-gray-500"><X size={12}/></button>
                              </>
                            ) : (
                              <>
                                <span className="flex-1 text-sm font-medium text-gray-800">{grupo.nome}</span>
                                {grupo.ativo===false && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inativo</span>}
                                <button onClick={()=>{setEditandoGrupo(grupo);setNomeGrupoEdit(grupo.nome)}} className="btn btn-sm text-gray-500 hover:text-primary-600"><Pencil size={12}/></button>
                                <button onClick={()=>toggleGrupo(grupo)} className={`btn btn-sm ${grupo.ativo===false?'text-green-600 hover:bg-green-50':'text-red-400 hover:bg-red-50'}`}><Power size={12}/></button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                    💡 Grupos inativos não aparecem no cadastro de novas aulas, mas são preservados nas aulas já criadas.
                  </div>
                </div>
              )}

              {abaAtiva==='feriados' && (
                <div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4 text-xs text-blue-700">
                    💡 Marcar uma data como feriado <strong>cancela as aulas regulares</strong> desse dia. Em seguida você cadastra aqui as <strong>aulas específicas</strong> do feriado (data única, sem recorrência). Remover o feriado <strong>reativa</strong> as aulas regulares do dia.
                  </div>

                  <div className="mb-4">
                    <button onClick={()=>{ setModalNovoFeriado(true); setNovoFeriadoData(''); setNovoFeriadoDesc(''); setErroFeriado('') }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700">
                      <Plus size={14}/> Novo feriado
                    </button>
                  </div>

                  {loadingFeriados ? (
                    <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"/></div>
                  ) : feriados.length===0 ? (
                    <div className="card text-center py-14">
                      <CalendarX size={32} className="text-gray-300 mx-auto mb-3"/>
                      <p className="text-gray-400 text-sm">Nenhum feriado cadastrado para {unidadeAtiva.nome}.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {feriados.map(f => {
                        const d = new Date(f.data+'T12:00:00')
                        const aulasDoFeriado = aulasFeriado.filter(a=>a.feriado_id===f.id)
                          .sort((a,b)=>(a.horario||'').localeCompare(b.horario||''))
                        return (
                          <div key={f.id} className="card" style={{ borderColor:'#fed7aa' }}>
                            <div className="flex items-start gap-3 mb-3">
                              <div className="text-center flex-shrink-0 w-14">
                                <div style={{ fontSize:24, fontWeight:700, lineHeight:1, color:'#f97316' }}>{d.getDate()}</div>
                                <div className="text-xs text-gray-400 uppercase mt-0.5">{d.toLocaleDateString('pt-BR',{month:'short'})}</div>
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900">{f.descricao}</div>
                                <div className="text-xs text-gray-400 mt-0.5 capitalize">{DIAS_FULL[d.getDay()]}</div>
                                <div style={{ fontSize:11, fontWeight:600, marginTop:4, color:'#ea580c' }}>● Feriado ativo · grade regular cancelada</div>
                              </div>
                              <button onClick={()=>removerFeriado(f)} disabled={removendoFeriado===f.id}
                                className="btn btn-sm gap-1 text-red-600 hover:bg-red-50 border border-red-200 flex-shrink-0" title="Remover feriado">
                                <Trash2 size={12}/> {removendoFeriado===f.id?'Removendo...':'Remover'}
                              </button>
                            </div>

                            {aulasDoFeriado.length===0 ? (
                              <div className="text-center text-xs text-gray-400 py-2 mb-2">Nenhuma aula cadastrada para este feriado ainda.</div>
                            ) : (
                              <div className="space-y-1.5 mb-3">
                                {aulasDoFeriado.map(a => (
                                  <div key={a.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                                    <span className="font-mono text-sm font-bold text-gray-900 w-12 flex-shrink-0">{(a.horario||'').slice(0,5)}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${tipoColor(a.tipo)}`}>{tipoLabel(a.tipo)}</span>
                                    <span className="text-xs text-gray-600 flex-1 truncate">{a.grupos_musculares?.nome||'—'}</span>
                                    <span className="text-xs text-gray-400 flex-shrink-0">👤 <NomeCoach nome={a.coaches?.nome}/></span>
                                    <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1"><Users size={10}/> {a.capacidade}</span>
                                    <button onClick={()=>removerAulaFeriado(a)} className="text-gray-400 hover:text-red-600 flex-shrink-0" title="Remover aula"><Trash2 size={13}/></button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <button onClick={()=>abrirNovaAulaFeriado(f)}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-dashed border-primary-300 text-primary-700 hover:bg-primary-50">
                              <Plus size={14}/> Adicionar aula do feriado
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="font-semibold text-gray-900">{editando?'Editar aula':feriadoCtx?'Nova aula do feriado':'Nova aula'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{feriadoCtx ? `Feriado · ${formatarDataPT(feriadoCtx.data)}` : unidadeAtiva?.nome}</p>
              </div>
              <button onClick={()=>{setModalAberto(false);setEditando(null);setFeriadoCtx(null)}} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
            </div>
            <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">

              {feriadoCtx && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-xs text-orange-800 flex items-start gap-2">
                  <CalendarX size={14} className="mt-0.5 flex-shrink-0"/>
                  <span>Esta aula acontece <strong>só nesta data</strong> ({formatarDataPT(feriadoCtx.data)}), sem recorrência.</span>
                </div>
              )}

              <div>
                <label className="label">Tipo de aula *</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIPOS.map(t => (
                    <button key={t.value} type="button"
                      onClick={()=>setForm(f=>({...f, tipo:t.value, capacidade:capacidadePorUnidadeTipo(unidadeAtiva?.nome||'',t.value)}))}
                      className={`py-2.5 px-2 rounded-xl text-xs font-medium text-center transition-all border ${form.tipo===t.value?'border-primary-400 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {form.tipo==='lift_for_girls' && (
                  <div className="mt-2 bg-pink-50 border border-pink-100 rounded-xl px-3 py-2 text-xs text-pink-700">
                    👩 Lift for Girls é automaticamente restrita a mulheres.
                  </div>
                )}
              </div>

              <div>
                <label className="label">Grupo muscular *</label>
                {gruposAtivos.length===0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-xs text-orange-700 flex items-center gap-2"><AlertCircle size={14}/> Nenhum grupo ativo. Cadastre na aba "Grupos".</div>
                ) : (
                  <select className="input" value={form.grupo_muscular_id} onChange={e=>setForm(f=>({...f,grupo_muscular_id:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {gruposAtivos.map(g=><option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="label">Coach responsável</label>
                {coaches.length===0 ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-xs text-orange-700 flex items-center gap-2"><AlertCircle size={14}/> Nenhum coach para esta unidade. Configure em Coaches.</div>
                ) : (
                  <select className="input" value={form.coach_id} onChange={e=>setForm(f=>({...f,coach_id:e.target.value}))}>
                    <option value="">⚠️ Coach a definir (escalar depois)</option>
                    {coaches.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Pode deixar em branco para escalar depois pela "Escala Club" (ex: fins de semana).
                </p>
              </div>

              {!feriadoCtx && (
                <div>
                  <label className="label">Dia da semana *</label>
                  <div className="grid grid-cols-7 gap-1">
                    {DIAS_ABREV.map((d,i)=>(
                      <button key={i} type="button" onClick={()=>setForm(f=>({...f,dia_semana:i}))}
                        className={`py-2 rounded-xl text-xs font-medium transition-all ${form.dia_semana===i?'bg-primary-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="label">Horário *</label>
                {(() => {
                  const lista = horariosParaUnidade(unidadeAtiva?.nome || '')
                  const isCustom = form.horario !== '' && !lista.includes(form.horario)
                  return (
                    <div className="space-y-2">
                      <select className="input" value={isCustom ? '__custom__' : form.horario}
                        onChange={e => {
                          if (e.target.value === '__custom__') setForm(f => ({ ...f, horario: '' }))
                          else setForm(f => ({ ...f, horario: e.target.value }))
                        }}>
                        {lista.map(h => <option key={h} value={h}>{h}</option>)}
                        <option value="__custom__">Outro horário...</option>
                      </select>
                      {(isCustom || form.horario === '') && (
                        <input type="time" className="input" value={form.horario}
                          onChange={e => setForm(f => ({ ...f, horario: e.target.value }))}/>
                      )}
                    </div>
                  )
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Duração (min)</label>
                  <input className="input" type="number" min={10} max={180} value={form.duracao_min} onChange={e=>setForm(f=>({...f,duracao_min:+e.target.value}))}/>
                </div>
                <div>
                  <label className="label">Capacidade (vagas)</label>
                  <div className="input bg-gray-50 text-gray-700 font-semibold flex items-center justify-between">
                    <span>{form.capacidade} vagas</span>
                    <span className="text-xs text-gray-400 font-normal">fixo</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {form.tipo==='running_funcional'
                      ? `Running: ${capacidadePorUnidadeTipo(unidadeAtiva?.nome||'','running_funcional')} vagas nesta unidade`
                      : 'Lift: 24 vagas'}
                  </p>
                </div>
              </div>

              {!editando && !feriadoCtx && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <button type="button" onClick={()=>setFormReplicar(r=>!r)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${formReplicar?'bg-cyan-50':'bg-gray-50 hover:bg-gray-100'}`}>
                    <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${formReplicar?'bg-cyan-500':'bg-gray-300'}`}>
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formReplicar?'translate-x-4':''}`}/>
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-gray-800">Gerar recorrências agora</span>
                      <p className="text-xs text-gray-400 mt-0.5">Cria as datas automaticamente ao salvar</p>
                    </div>
                    <RefreshCw size={14} className={formReplicar?'text-cyan-600':'text-gray-400'}/>
                  </button>
                  {formReplicar && (
                    <div className="px-4 py-4 space-y-3 border-t border-gray-100 bg-white">
                      <div><label className="label">A partir de</label><input type="date" className="input" value={formInicio} onChange={e=>setFormInicio(e.target.value)}/></div>
                      <div>
                        <label className="label">Por quantos meses?</label>
                        <div className="grid grid-cols-4 gap-2">
                          {[1,2,3,6].map(m=>(
                            <button key={m} type="button" onClick={()=>setFormMeses(m)}
                              className={`py-2 rounded-xl text-sm font-semibold transition-all border ${formMeses===m?'border-cyan-400 bg-cyan-50 text-cyan-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                              {m}m
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="bg-cyan-50 rounded-xl px-3 py-2 text-xs text-cyan-700">
                        📅 {gerarDatas(form.dia_semana, formInicio, dataFimPorMeses(formMeses)).length} ocorrências serão criadas · até {dataFimPorMeses(formMeses)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button onClick={()=>{setModalAberto(false);setEditando(null);setFeriadoCtx(null)}} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700 gap-1 disabled:opacity-60">
                <Save size={13}/> {salvando?'Salvando...':editando?'Atualizar aula':feriadoCtx?'Criar aula do feriado':'Criar aula'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR TROCA DE COACH (data de corte) */}
      {confirmCoach && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users size={16} className="text-primary-600"/> Trocar coach da recorrência</h2>
              <button onClick={()=>setConfirmCoach(null)} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="text-sm text-gray-600">
                Trocando de <strong className="text-gray-900">{confirmCoach.oldNome}</strong> para <strong className="text-gray-900">{confirmCoach.newNome}</strong>.
              </div>
              <div>
                <label className="label">Trocar a partir de</label>
                <input type="date" className="input" value={confirmCoach.data}
                  onChange={e=>setConfirmCoach(c=>c?{...c, data:e.target.value}:c)}/>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800 flex gap-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5"/>
                <span>
                  Aulas <strong>antes</strong> dessa data ficam com {confirmCoach.oldNome}. Dessa data em diante passam pra {confirmCoach.newNome}.
                  Dias futuros já escalados pra outro coach não são alterados.
                </span>
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-5">
              <button onClick={()=>setConfirmCoach(null)} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700 gap-1 disabled:opacity-60">
                <Save size={13}/> {salvando?'Aplicando...':'Confirmar troca'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalReplicar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900 flex items-center gap-2"><RefreshCw size={16} className="text-cyan-600"/> Replicar grade</h2>
                <p className="text-xs text-gray-400 mt-0.5">{tipoLabel(modalReplicar.tipo)} · {DIAS_FULL[modalReplicar.dia_semana]} às {(modalReplicar.horario||'').slice(0,5)}</p>
              </div>
              <button onClick={()=>{setModalReplicar(null);setResultReplicacao(null)}} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {resultReplicacao ? (
                <div className="text-center py-4">
                  <CheckCircle size={40} className="text-green-500 mx-auto mb-3"/>
                  <p className="font-semibold text-gray-900 text-lg">{resultReplicacao.criadas} aula{resultReplicacao.criadas!==1?'s':''} criada{resultReplicacao.criadas!==1?'s':''}</p>
                  {resultReplicacao.existentes>0 && <p className="text-xs text-gray-400 mt-1">{resultReplicacao.existentes} já existiam e foram mantidas</p>}
                  <button onClick={()=>{setModalReplicar(null);setResultReplicacao(null)}} className="mt-4 btn bg-primary-600 text-white hover:bg-primary-700 w-full">Concluir</button>
                </div>
              ) : (
                <>
                  <div><label className="label">A partir de</label><input type="date" className="input" value={replicarInicio} onChange={e=>setReplicarInicio(e.target.value)}/></div>
                  <div>
                    <label className="label">Por quantos meses?</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1,2,3,6].map(m=>(
                        <button key={m} type="button" onClick={()=>setReplicarMeses(m)}
                          className={`py-2.5 rounded-xl text-sm font-semibold transition-all border ${replicarMeses===m?'border-primary-400 bg-primary-50 text-primary-700':'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                          {m}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-cyan-50 border border-cyan-100 rounded-xl px-4 py-3">
                    <p className="text-xs text-cyan-800 font-medium">📅 {datasPreview.length} ocorrência{datasPreview.length!==1?'s':''} serão geradas</p>
                    <p className="text-xs text-cyan-500 mt-0.5">Datas já cadastradas serão mantidas sem duplicar.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>{setModalReplicar(null);setResultReplicacao(null)}} className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
                    <button onClick={executarReplicacao} disabled={replicando||!datasPreview.length} className="btn flex-1 bg-cyan-600 text-white hover:bg-cyan-700 gap-1 disabled:opacity-60">
                      <RefreshCw size={13}/> {replicando?'Gerando...':'Replicar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXCLUIR */}
      {modalExcluir && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center"><Trash2 size={16} className="text-red-600"/></div>
                <div>
                  <h2 className="font-semibold text-gray-900">Excluir aula</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {modalExcluir.aula
                      ? `${tipoLabel(modalExcluir.aula.tipo)} · ${DIAS_FULL[modalExcluir.aula.dia_semana]} às ${(modalExcluir.aula.horario||'').slice(0,5)}`
                      : `${tipoLabel(modalExcluir.ocorrencia?.club_aulas?.tipo)} · ${modalExcluir.ocorrencia?.data} às ${(modalExcluir.ocorrencia?.club_aulas?.horario||'').slice(0,5)}`}
                  </p>
                </div>
              </div>
              <button onClick={()=>{setModalExcluir(null);setInfoReservas(null)}} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-600">Escolha o que você quer excluir:</p>

              <button
                onClick={excluirSomenteOcorrencia}
                disabled={excluindo || (modalExcluir.aula && !infoReservas?.proximaData)}
                className="w-full text-left bg-white border-2 border-orange-200 hover:bg-orange-50 rounded-xl p-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <Calendar size={16} className="text-orange-600"/>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 text-sm">Somente essa aula</div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {modalExcluir.aula
                        ? (infoReservas?.proximaData
                            ? `Cancela só a próxima ocorrência (${infoReservas.proximaData}). A recorrência semanal continua ativa.`
                            : 'Nenhuma ocorrência futura encontrada para esta regra.')
                        : `Cancela só o dia ${modalExcluir.ocorrencia?.data}. A recorrência semanal continua ativa.`}
                    </p>
                    {infoReservas !== null && infoReservas.ocorrencia > 0 && (
                      <div className="mt-2 inline-flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1 text-xs text-red-700">
                        <AlertCircle size={12}/> {infoReservas.ocorrencia} reserva{infoReservas.ocorrencia!==1?'s':''} será{infoReservas.ocorrencia!==1?'ão':''} cancelada{infoReservas.ocorrencia!==1?'s':''}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              <button
                onClick={excluirTodaRecorrencia}
                disabled={excluindo}
                className="w-full text-left bg-white border-2 border-red-200 hover:bg-red-50 rounded-xl p-4 transition-all disabled:opacity-50">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                    <RefreshCw size={16} className="text-red-600"/>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900 text-sm">Toda a recorrência</div>
                    <p className="text-xs text-gray-500 mt-0.5">Apaga a regra semanal + todas as ocorrências futuras. Esta ação não pode ser desfeita.</p>
                    {infoReservas !== null && infoReservas.recorrencia > 0 && (
                      <div className="mt-2 inline-flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1 text-xs text-red-700">
                        <AlertCircle size={12}/> {infoReservas.recorrencia} reserva{infoReservas.recorrencia!==1?'s':''} ativa{infoReservas.recorrencia!==1?'s':''} no total
                      </div>
                    )}
                  </div>
                </div>
              </button>

              <button
                onClick={()=>{setModalExcluir(null);setInfoReservas(null)}}
                disabled={excluindo}
                className="btn w-full text-gray-500 border border-gray-200">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO FERIADO */}
      {modalNovoFeriado && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><CalendarX size={16} className="text-orange-600"/> Novo feriado</h2>
              <button onClick={()=>{setModalNovoFeriado(false);setNovoFeriadoData('');setNovoFeriadoDesc('');setErroFeriado('')}} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-xs text-orange-800">
                Ao criar, as aulas regulares dessa data serão <strong>canceladas</strong>. Depois cadastre as aulas específicas do dia.
              </div>
              <div>
                <label className="label">Data</label>
                <input type="date" className="input" value={novoFeriadoData} onChange={e=>setNovoFeriadoData(e.target.value)}/>
              </div>
              <div>
                <label className="label">Descrição</label>
                <input type="text" className="input" placeholder="Ex: Corpus Christi" value={novoFeriadoDesc} onChange={e=>setNovoFeriadoDesc(e.target.value)}/>
              </div>
              {erroFeriado && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{erroFeriado}</div>
              )}
              <div className="flex gap-2">
                <button onClick={()=>{setModalNovoFeriado(false);setNovoFeriadoData('');setNovoFeriadoDesc('');setErroFeriado('')}}
                  className="btn flex-1 text-gray-500 border border-gray-200">Cancelar</button>
                <button onClick={criarFeriado} disabled={salvandoFeriado}
                  className="btn flex-1 bg-primary-600 text-white hover:bg-primary-700 gap-1 disabled:opacity-60">
                  {salvandoFeriado?'Salvando...':'Criar feriado'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
