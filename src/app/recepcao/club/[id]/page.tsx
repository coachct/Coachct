'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT   = '#ff2d9b'
const VERDE    = '#2ddd8b'
const AMARELO  = '#ffaa00'
const VERMELHO = '#ff4444'
const CYAN     = '#00e5ff'

function dataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function tipoLabel(t: string) {
  if (t==='lift')              return 'Lift'
  if (t==='lift_for_girls')   return 'Lift for Girls'
  if (t==='running_funcional') return 'Running + Funcional'
  return t
}
function parsePlanoKey(key: string) {
  const lower = (key||'').toLowerCase()
  if (lower.startsWith('wellhub_app'))   return { label:'Wellhub - app',  icon:'💜' }
  if (lower.startsWith('wellhub'))       return { label:'Wellhub - site', icon:'💜' }
  if (lower.startsWith('totalpass_app')) return { label:'TotalPass - app', icon:'🔵' }
  if (lower.startsWith('totalpass'))     return { label:'TotalPass - site', icon:'🔵' }
  return { label: key, icon:'🎟️' }
}

// Prioridade: coach escalado pontualmente na ocorrência > coach da grade > null
function primeiroNomeCoachOc(oc: any): string | null {
  const escalado = oc?.coach_escalado?.nome
  if (escalado) return String(escalado).split(' ')[0]
  const grade = oc?.club_aulas?.coaches?.nome
  if (grade) return String(grade).split(' ')[0]
  return null
}

function IconEsteira({ color }: { color: string }) {
  return (
    <svg width="100%" viewBox="0 0 56 48" style={{ display:'block' }}>
      <rect x="3" y="38" width="40" height="6" rx="3" fill={color}/>
      <circle cx="6.5" cy="41" r="3.5" fill={color}/>
      <circle cx="39.5" cy="41" r="3.5" fill={color}/>
      <rect x="38" y="20" width="4" height="20" rx="2" fill={color}/>
      <rect x="36" y="13" width="11" height="8" rx="2" fill={color}/>
      <circle cx="19" cy="7" r="4.5" fill={color}/>
      <line x1="19" y1="11.5" x2="16" y2="24" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <line x1="18" y1="15" x2="28" y2="19" stroke={color} strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="18" y1="15" x2="9" y2="20" stroke={color} strokeWidth="3.5" strokeLinecap="round"/>
      <line x1="16" y1="24" x2="9" y2="36" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <line x1="16" y1="24" x2="22" y2="31" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <line x1="22" y1="31" x2="16" y2="38" stroke={color} strokeWidth="3.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconHaltere({ color }: { color: string }) {
  return (
    <svg width="100%" viewBox="0 0 44 28" style={{ display:'block' }}>
      <rect x="0"  y="9"  width="8"  height="10" rx="2" fill={color}/>
      <rect x="3"  y="6"  width="3"  height="16" rx="1.5" fill={color}/>
      <rect x="11" y="12" width="22" height="4"  rx="2" fill={color}/>
      <rect x="36" y="9"  width="8"  height="10" rx="2" fill={color}/>
      <rect x="38" y="6"  width="3"  height="16" rx="1.5" fill={color}/>
    </svg>
  )
}

export default function RecepcaoClubDetalhe() {
  const { id: ocId } = useParams<{ id: string }>()
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [ocorrencia,   setOcorrencia]   = useState<any>(null)
  const [reservas,     setReservas]     = useState<any[]>([])
  const [loadingData,  setLoadingData]  = useState(true)
  const [atualizando,  setAtualizando]  = useState<string | null>(null)
  const [msg,          setMsg]          = useState('')

  // Walk-in
  const [buscaTexto,   setBuscaTexto]   = useState('')
  const [resultados,   setResultados]   = useState<any[]>([])
  const [buscando,     setBuscando]     = useState(false)
  const [clienteSel,   setClienteSel]   = useState<any>(null)
  const [saldoCliente, setSaldoCliente] = useState<Record<string,any>>({})
  const [tipoCredito,  setTipoCredito]  = useState('')
  const [agendando,    setAgendando]    = useState(false)
  const [erroAgendar,  setErroAgendar]  = useState('')

  // Mapa
  const [posicoes,        setPosicoes]        = useState<any[]>([])
  const [posicoesTomadas, setPosicoesTomadas] = useState<string[]>([])
  const [posicaoSel,      setPosicaoSel]      = useState('')
  const [etapa,           setEtapa]           = useState<'busca'|'mapa'|'credito'>('busca')

  // NOVO: bloqueios pontuais (só dessa ocorrência)
  const [posicoesBloqueadasPontual, setPosicoesBloqueadasPontual] = useState<string[]>([])
  const [salvandoBloqueio,          setSalvandoBloqueio]          = useState<string | null>(null)

  // NOVO: bloqueios globais da unidade (tela /admin/posicoes — club_posicoes.bloqueado). Valem pra todas as aulas.
  const [posicoesBloqueadasGlobal,  setPosicoesBloqueadasGlobal]  = useState<string[]>([])

  // Troca de posição
  const [trocandoReserva, setTrocandoReserva] = useState<any>(null)
  const [salvandoTroca,   setSalvandoTroca]   = useState(false)
  const [modoTrocaAtivo,  setModoTrocaAtivo]  = useState(false)

  // NOVO: bloqueio de vagas (Lift / Lift for Girls)
  const [vagasBloqueadas, setVagasBloqueadas] = useState(0)
  const [salvandoVagas,   setSalvandoVagas]   = useState(false)

  // NOVO: vagas expostas ao Wellhub (pool compartilhado). null = usa o default global.
  const [vagasWellhub,    setVagasWellhub]    = useState<number | null>(null)
  const [vagasDefaultWh,  setVagasDefaultWh]  = useState(10)
  const [wellhubEstado,   setWellhubEstado]   = useState<string | null>(null)
  const [salvandoWellhub, setSalvandoWellhub] = useState(false)

  // Navegação entre aulas do dia (‹ anterior / próxima ›)
  const [navPrev, setNavPrev] = useState<string | null>(null)
  const [navNext, setNavNext] = useState<string | null>(null)

  const isRunning = ocorrencia?.club_aulas?.tipo === 'running_funcional'

  useEffect(() => {
    if (!ocId) return
    carregarDados()
    // Ao trocar de aula (‹ / ›), limpa o estado de walk-in/troca da aula anterior
    resetWalkin(); setTrocandoReserva(null); setBuscaTexto(''); setResultados([])
  }, [ocId])

  // Busca instantânea de cliente no walk-in (nome, CPF, email ou telefone)
  useEffect(() => {
    if (buscaTexto.trim().length >= 2) buscarCliente()
    else setResultados([])
  }, [buscaTexto])

  // Realtime: recarrega quando reservas/ocorrência mudam em qualquer tablet
  useEffect(() => {
    if (!ocId) return
    const recarregar = () => { if (document.visibilityState === 'visible') carregarDados(true) } // aba em segundo plano: não recarrega
    const canal = supabase
      .channel(`recepcao_club_oc_${ocId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'club_reservas', filter: `ocorrencia_id=eq.${ocId}` },
        recarregar)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'club_ocorrencias', filter: `id=eq.${ocId}` },
        recarregar)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [ocId])

  // Rede de segurança: rebusca silenciosa a cada 10s (só com a aba visível) e ao focar a aba.
  // Garante sincronizar mesmo se o realtime falhar/cair no aparelho (ex.: INSERT de walk-in).
  useEffect(() => {
    if (!ocId) return
    const tick = () => { if (document.visibilityState === 'visible') carregarDados(true) }
    const intervalo = setInterval(tick, 30000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(intervalo); document.removeEventListener('visibilitychange', tick) }
  }, [ocId])

  // Carrega aulas vizinhas do mesmo dia/unidade para navegar (‹ / ›)
  useEffect(() => {
    if (ocorrencia?.id && ocorrencia?.club_aulas?.unidade_id && ocorrencia?.data) carregarVizinhos()
  }, [ocorrencia?.id])

  async function carregarVizinhos() {
    const uid = ocorrencia.club_aulas.unidade_id
    const { data: aulasIds } = await supabase.from('club_aulas').select('id')
      .eq('unidade_id', uid).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    if (!ids.length) { setNavPrev(null); setNavNext(null); return }
    const { data: ocs } = await supabase.from('club_ocorrencias')
      .select('id, club_aulas(horario)')
      .in('aula_id', ids).eq('data', ocorrencia.data).eq('status', 'ativa')
    const ordenadas = (ocs || []).sort((a: any, b: any) =>
      (a.club_aulas?.horario || '').localeCompare(b.club_aulas?.horario || ''))
    const idx = ordenadas.findIndex((o: any) => o.id === ocorrencia.id)
    setNavPrev(idx > 0 ? ordenadas[idx - 1].id : null)
    setNavNext(idx >= 0 && idx < ordenadas.length - 1 ? ordenadas[idx + 1].id : null)
  }

  async function carregarDados(silent = false) {
    if (!silent) setLoadingData(true)
    // Inclui coach_escalado (FK coach_id da ocorrência) — prioridade sobre o coach da grade
    const { data: oc } = await supabase
      .from('club_ocorrencias')
      .select('*, coach_escalado:coaches!coach_id(id, nome), club_aulas(tipo, horario, capacidade, unidade_id, coaches(nome), grupos_musculares(nome), unidades(nome, wellhub_estado))')
      .eq('id', ocId).maybeSingle()
    setOcorrencia(oc)
    setVagasBloqueadas(oc?.vagas_bloqueadas || 0)
    setVagasWellhub(oc?.vagas_wellhub ?? null)
    setWellhubEstado((oc as any)?.club_aulas?.unidades?.wellhub_estado ?? null)
    // Blindado: a integração Wellhub NUNCA pode afetar o carregamento desta tela.
    try {
      const { data: whCfg } = await supabase.from('wellhub_config').select('vagas_default').maybeSingle()
      if (whCfg?.vagas_default != null) setVagasDefaultWh(whCfg.vagas_default)
    } catch { /* ignora: a tela segue normal mesmo se a config Wellhub falhar */ }

    const { data: res } = await supabase
      .from('club_reservas')
      .select('id, status, tipo_credito, posicao, credito_avulso_id, creditos_avulsos(observacao), clientes(id, nome, email, telefone)')
      .eq('ocorrencia_id', ocId)
      .neq('status', 'cancelado')
    const sorted = (res || []).sort((a: any, b: any) =>
      (a.clientes?.nome || '').localeCompare(b.clientes?.nome || '', 'pt-BR'))
    setReservas(sorted)
    setPosicoesTomadas(
      sorted.filter((r: any) => ['reservado','presente'].includes(r.status) && r.posicao)
            .map((r: any) => r.posicao)
    )

    // NOVO: carrega bloqueios pontuais desta ocorrência
    const { data: bloq } = await supabase
      .from('club_posicoes_bloqueios_ocorrencia')
      .select('posicao').eq('ocorrencia_id', ocId)
    setPosicoesBloqueadasPontual((bloq || []).map((b: any) => b.posicao))

    if (oc?.club_aulas?.tipo === 'running_funcional' && oc?.club_aulas?.unidade_id) {
      const { data: pos } = await supabase.from('club_posicoes').select('*')
        .eq('unidade_id', oc.club_aulas.unidade_id)
        .eq('ativo', true).order('tipo').order('numero')
      setPosicoes(pos || [])
      // NOVO: posições bloqueadas globalmente (club_posicoes.bloqueado) — valem pra todas as aulas
      setPosicoesBloqueadasGlobal(
        (pos || []).filter((p: any) => p.bloqueado).map((p: any) => `${p.tipo}${String(p.numero).padStart(2, '0')}`)
      )
    }
    if (!silent) setLoadingData(false)
  }

  const hoje     = dataLocalStr(new Date())
  const dataAula = ocorrencia?.data || ''
  const isHoje   = dataAula === hoje
  const isFuturo = dataAula > hoje
  const isPassado = dataAula < hoje

  async function marcarStatus(reservaId: string, status: 'presente' | 'falta' | 'reservado') {
    if (status === 'falta' && !confirm('Marcar falta? Essa falta vai para o relatório de no-show.')) return
    setAtualizando(reservaId)
    await supabase.from('club_reservas').update({ status }).eq('id', reservaId)
    await carregarDados()
    setAtualizando(null)
    showMsg(status === 'presente' ? '✅ Presença marcada!' : status === 'falta' ? '❌ Falta registrada' : '↩️ Marcação removida')
  }

  async function confirmarTrocaPosicao(novaPosicao: string) {
    if (!trocandoReserva) return
    setSalvandoTroca(true)
    await supabase.from('club_reservas').update({ posicao: novaPosicao }).eq('id', trocandoReserva.id)
    setTrocandoReserva(null)
    setModoTrocaAtivo(false)
    await carregarDados()
    setSalvandoTroca(false)
    showMsg('✅ Posição alterada!')
  }

  // NOVO: bloqueia/desbloqueia posição APENAS nesta ocorrência
  async function toggleBloqueioPontual(label: string) {
    // Se posição tem reserva ativa, não permite bloquear direto — usuário deve trocar antes
    const reservaAqui = reservas.find((r:any) =>
      r.posicao === label && ['reservado','presente'].includes(r.status))
    if (reservaAqui) {
      const nome = reservaAqui.clientes?.nome?.split(' ')[0] || 'cliente'
      showMsg(`⚠️ ${nome} está na ${label}. Use "Trocar" antes de bloquear.`)
      return
    }
    setSalvandoBloqueio(label)
    const jaBloqueada = posicoesBloqueadasPontual.includes(label)
    if (jaBloqueada) {
      const { error } = await supabase
        .from('club_posicoes_bloqueios_ocorrencia')
        .delete()
        .eq('ocorrencia_id', ocId)
        .eq('posicao', label)
      if (error) { showMsg('Erro: '+error.message); setSalvandoBloqueio(null); return }
      setPosicoesBloqueadasPontual(prev => prev.filter(p => p !== label))
      showMsg(`✅ Posição ${label} desbloqueada`)
    } else {
      const { error } = await supabase
        .from('club_posicoes_bloqueios_ocorrencia')
        .insert({
          ocorrencia_id: ocId,
          posicao: label,
          criado_por: perfil?.id || null,
        })
      if (error) { showMsg('Erro: '+error.message); setSalvandoBloqueio(null); return }
      setPosicoesBloqueadasPontual(prev => [...prev, label])
      showMsg(`🚫 Posição ${label} bloqueada nesta aula`)
    }
    setSalvandoBloqueio(null)
  }

  // NOVO: define quantas vagas ficam bloqueadas nesta aula (Lift / Lift for Girls)
  async function salvarBloqueioVagas(n: number) {
    const cap = ocorrencia?.club_aulas?.capacidade || 0
    const max = Math.max(0, cap - reservas.length)
    const val = Math.max(0, Math.min(n, max))
    setSalvandoVagas(true)
    const { error } = await supabase
      .from('club_ocorrencias')
      .update({ vagas_bloqueadas: val })
      .eq('id', ocId)
    if (error) { showMsg('Erro: '+error.message); setSalvandoVagas(false); return }
    setVagasBloqueadas(val)
    setSalvandoVagas(false)
    showMsg(val === 0
      ? '✅ Vagas liberadas'
      : `🚫 ${val} vaga${val>1?'s':''} bloqueada${val>1?'s':''} nesta aula`)
  }

  // NOVO: define quantas vagas desta aula aparecem no app do Wellhub.
  // null = usa o default global; 0 = some do app (parado); número = explícito.
  async function salvarVagasWellhub(n: number | null) {
    setSalvandoWellhub(true)
    const { error } = await supabase
      .from('club_ocorrencias')
      .update({ vagas_wellhub: n })
      .eq('id', ocId)
    if (error) { showMsg('Erro: '+error.message); setSalvandoWellhub(false); return }
    setVagasWellhub(n)
    setSalvandoWellhub(false)
    showMsg(n === null
      ? `✅ Usando o padrão do Wellhub (${vagasDefaultWh})`
      : n === 0
        ? '🚫 Aula pausada no Wellhub (0 vagas)'
        : `📲 ${n} vaga${n>1?'s':''} no Wellhub`)
  }

  async function buscarCliente() {
    const termo = buscaTexto.trim()
    if (termo.length < 2) { setResultados([]); return }
    setBuscando(true)
    const { data } = await supabase.from('clientes').select('id, nome, email, telefone, cpf')
      .or(`nome.ilike.%${termo}%,cpf.ilike.%${termo}%,email.ilike.%${termo}%,telefone.ilike.%${termo}%`)
      .limit(5)
    setResultados(data || [])
    setBuscando(false)
  }

  async function selecionarCliente(cli: any) {
    // Verifica se cliente já tem reserva ativa nessa ocorrência
    const { data: jaReservou } = await supabase.from('club_reservas')
      .select('id').eq('ocorrencia_id', ocId).eq('cliente_id', cli.id)
      .neq('status', 'cancelado').maybeSingle()
    if (jaReservou) { setErroAgendar('Este cliente já possui reserva nesta aula.'); return }

    setClienteSel(cli)
    setResultados([])
    setBuscaTexto('')
    setTipoCredito('')
    setErroAgendar('')
    setPosicaoSel('')
    if (!ocorrencia?.club_aulas?.unidade_id) return
    const dataOc = new Date(ocorrencia.data + 'T12:00:00')
    const { data } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: cli.id,
      p_mes: dataOc.getMonth() + 1,
      p_ano: dataOc.getFullYear(),
      p_unidade_id: ocorrencia.club_aulas.unidade_id,
    })
    setSaldoCliente(data || {})
    setEtapa(isRunning ? 'mapa' : 'credito')
  }

  function resetWalkin() {
    setClienteSel(null); setSaldoCliente({}); setTipoCredito('')
    setPosicaoSel(''); setEtapa('busca'); setErroAgendar('')
  }

  async function ativarPlanoRapido(tipo: string) {
    if (!clienteSel || !ocorrencia?.club_aulas?.unidade_id) return
    const unidadeId = ocorrencia.club_aulas.unidade_id
    const dataOc = new Date(ocorrencia.data + 'T12:00:00')
    const mes = dataOc.getMonth() + 1; const ano = dataOc.getFullYear()
    const { data: plano } = await supabase.from('planos_disponiveis').select('id')
      .eq('tipo', tipo).eq('unidade_id', unidadeId).maybeSingle()
    if (!plano) { showMsg('❌ Plano não encontrado.'); return }
    await supabase.from('cliente_planos').upsert({
      cliente_id: clienteSel.id, plano_id: plano.id, ativo: true,
      inicio: dataOc.toISOString().split('T')[0],
    }, { onConflict: 'cliente_id,plano_id' })
    await supabase.from('cliente_creditos').upsert({
      cliente_id: clienteSel.id, unidade_id: unidadeId, tipo, total: 12, mes, ano,
    }, { onConflict: 'cliente_id,unidade_id,tipo,mes,ano' })
    await selecionarCliente(clienteSel)
    showMsg(`✅ Plano ${tipo === 'wellhub' ? 'Wellhub' : 'TotalPass'} ativado!`)
  }

  async function agendarOuWalkin() {
    if (!tipoCredito) { setErroAgendar('Selecione o plano.'); return }
    if (isRunning && !posicaoSel) { setErroAgendar('Selecione uma posição.'); return }
    if (!clienteSel || !ocorrencia) return
    setAgendando(true); setErroAgendar('')

    // NOVO (Lift/LFG): respeita a capacidade contando só ocupação efetiva (reservado + presente).
    // Faltas NÃO contam — assim cada falta marcada pela equipe libera uma vaga para encaixe.
    if (!isRunning) {
      const cap = ocorrencia.club_aulas?.capacidade || 0
      const ocupadasEfetivas = reservas.filter((r: any) => ['reservado','presente'].includes(r.status)).length
      const livres = cap - ocupadasEfetivas - vagasBloqueadas
      if (livres <= 0) {
        setErroAgendar('Aula lotada. Marque uma falta para liberar vaga e encaixar.')
        setAgendando(false); return
      }
    }

    // NOVO (Running): se a posição escolhida está ocupada por uma falta, libera a posição
    // (mantém status='falta' para o relatório/multa) antes de inserir o encaixe.
    if (isRunning && posicaoSel) {
      const faltaNaPosicao = reservas.find((r: any) => r.posicao === posicaoSel && r.status === 'falta')
      if (faltaNaPosicao) {
        await supabase.from('club_reservas').update({ posicao: null }).eq('id', faltaNaPosicao.id)
      }
    }

    // Se existir reserva cancelada para este cliente nesta ocorrência, reativa em vez de inserir
    const { data: cancelada } = await supabase.from('club_reservas')
      .select('id').eq('ocorrencia_id', ocId).eq('cliente_id', clienteSel.id)
      .eq('status', 'cancelado').maybeSingle()

    let error: any = null
    if (cancelada) {
      const { error: e } = await supabase.from('club_reservas').update({
        tipo_credito: tipoCredito,
        status: isFuturo ? 'reservado' : 'presente',
        criado_via: 'recepcao', criado_por: perfil?.id || null, created_at: new Date().toISOString(),
        ...(isRunning && posicaoSel ? { posicao: posicaoSel } : {}),
      }).eq('id', cancelada.id)
      error = e
    } else {
      const { error: e } = await supabase.from('club_reservas').insert({
        ocorrencia_id: ocId, cliente_id: clienteSel.id, tipo_credito: tipoCredito,
        status: isFuturo ? 'reservado' : 'presente',
        criado_via: 'recepcao', criado_por: perfil?.id || null,
        ...(isRunning && posicaoSel ? { posicao: posicaoSel } : {}),
      })
      error = e
    }
    if (error) { setErroAgendar('Erro: ' + error.message); setAgendando(false); return }
    setAgendando(false); resetWalkin(); await carregarDados()
    showMsg(isFuturo ? '✅ Reserva criada!' : '✅ Cliente adicionado como presente!')
  }

  function showMsg(texto: string) { setMsg(texto); setTimeout(() => setMsg(''), 3500) }

  const aula      = ocorrencia?.club_aulas
  const presentes = reservas.filter(r => r.status === 'presente').length
  const faltas    = reservas.filter(r => r.status === 'falta').length
  const aguardando = reservas.filter(r => r.status === 'reservado').length
  const planosDisp = Object.entries(saldoCliente).filter(([,v]:any) => v?.disponivel > 0).map(([k]) => k)
  const nomeCoachExibir = ocorrencia ? primeiroNomeCoachOc(ocorrencia) : null

  function badgeData() {
    if (isHoje)   return { label:'Hoje',               cor: VERDE }
    if (isFuturo) return { label:'Agendamento futuro', cor: CYAN }
    return              { label:'Aula encerrada',      cor:'#aaa' }
  }
  const badge = badgeData()

  const posR     = posicoes.filter((p:any) => p.tipo==='R').sort((a:any,b:any) => b.numero-a.numero)
  const posF_imp = posicoes.filter((p:any) => p.tipo==='F' && p.numero%2===1).sort((a:any,b:any) => b.numero-a.numero)
  const posF_par = posicoes.filter((p:any) => p.tipo==='F' && p.numero%2===0).sort((a:any,b:any) => b.numero-a.numero)

  // Mapa compartilhado — usado tanto na visão geral quanto no walk-in
  // modo: 'view' = visualizar e bloquear/desbloquear | 'walkin' = selecionar nova posição | 'troca' = trocar posição de cliente
  function MapaPosicoes({ modo }: { modo: 'view' | 'walkin' | 'troca' }) {
    const posicaoAtualTroca = trocandoReserva?.posicao

    function estadoPos(label: string) {
      const reserva = reservas.find((r:any) => r.posicao === label && ['reservado','presente'].includes(r.status))
      const tomado  = !!reserva
      const bloqueadaPontual = posicoesBloqueadasPontual.includes(label)
      const bloqueadaGlobal  = posicoesBloqueadasGlobal.includes(label)
      const ehTrocando = posicaoAtualTroca === label

      if (modo === 'view') {
        if (bloqueadaGlobal) return { bg:`${VERMELHO}15`, border:VERMELHO, icon:VERMELHO, cursor:'not-allowed',
          nome:null, atual:false, bloqueada:true }
        if (bloqueadaPontual) return { bg:`${VERMELHO}15`, border:VERMELHO, icon:VERMELHO, cursor:'pointer',
          nome:null, atual:false, bloqueada:true }
        if (!tomado) return { bg:`${ACCENT}15`, border:ACCENT, icon:ACCENT, cursor:'pointer',
          nome:null, atual:false, bloqueada:false }
        return { bg:'#e5e5e5', border:'#bbb', icon:'#bbb', cursor:'default',
          nome: reserva?.clientes?.nome?.split(' ')[0] || '?', atual:false, bloqueada:false }
      }
      if (modo === 'walkin') {
        if (label === posicaoSel) return { bg:`${ACCENT}15`, border:ACCENT, icon:ACCENT, cursor:'pointer', nome:null, atual:false, bloqueada:false }
        if (bloqueadaPontual || bloqueadaGlobal) return { bg:`${VERMELHO}15`, border:VERMELHO, icon:VERMELHO, cursor:'not-allowed', nome:null, atual:false, bloqueada:true }
        if (tomado) return { bg:'#f3f4f6', border:'#d1d5db', icon:'#d1d5db', cursor:'not-allowed', nome:null, atual:false, bloqueada:false }
        return { bg:'#fff', border:'#e5e7eb', icon:'#aaa', cursor:'pointer', nome:null, atual:false, bloqueada:false }
      }
      // modo troca
      // fase 1: nenhuma origem escolhida ainda — só ocupadas ficam clicáveis (escolher quem troca)
      if (!trocandoReserva) {
        if (bloqueadaPontual || bloqueadaGlobal) return { bg:`${VERMELHO}15`, border:VERMELHO, icon:VERMELHO, cursor:'not-allowed',
          nome:null, atual:false, bloqueada:true }
        if (tomado) return { bg:`${AMARELO}10`, border:AMARELO, icon:AMARELO, cursor:'pointer',
          nome: reserva?.clientes?.nome?.split(' ')[0] || '?', atual:false, bloqueada:false }
        return { bg:'#f3f4f6', border:'#e5e7eb', icon:'#d1d5db', cursor:'default',
          nome:null, atual:false, bloqueada:false }
      }
      // fase 2: origem escolhida — escolher o destino
      if (ehTrocando) return { bg:`${AMARELO}15`, border:AMARELO, icon:AMARELO, cursor:'pointer',
        nome: reserva?.clientes?.nome?.split(' ')[0] || '?', atual:true, bloqueada:false }
      if (bloqueadaPontual || bloqueadaGlobal) return { bg:`${VERMELHO}15`, border:VERMELHO, icon:VERMELHO, cursor:'not-allowed',
        nome:null, atual:false, bloqueada:true }
      if (tomado) return { bg:'#f3f4f6', border:'#d1d5db', icon:'#d1d5db', cursor:'not-allowed',
        nome: reserva?.clientes?.nome?.split(' ')[0] || '?', atual:false, bloqueada:false }
      return { bg:'#f0fff4', border:VERDE, icon:VERDE, cursor:'pointer', nome:null, atual:false, bloqueada:false }
    }

    function handleClick(label: string) {
      if (modo === 'view') {
        if (posicoesBloqueadasGlobal.includes(label)) return // bloqueio global: destravar só em /admin/posicoes
        toggleBloqueioPontual(label)
        return
      }
      if (modo === 'walkin') {
        if (posicoesTomadas.includes(label)) return
        if (posicoesBloqueadasPontual.includes(label)) return
        if (posicoesBloqueadasGlobal.includes(label)) return // bloqueada globalmente
        setPosicaoSel(label)
      }
      if (modo === 'troca') {
        // fase 1: sem origem — clicar num ocupado seleciona quem vai trocar
        if (!trocandoReserva) {
          if (posicoesBloqueadasPontual.includes(label)) return
          if (posicoesBloqueadasGlobal.includes(label)) return
          const reservaAqui = reservas.find((r:any) => r.posicao === label && ['reservado','presente'].includes(r.status))
          if (reservaAqui) setTrocandoReserva(reservaAqui)
          return
        }
        // fase 2: origem escolhida — clicar na própria origem desmarca; num livre grava
        if (label === posicaoAtualTroca) { setTrocandoReserva(null); return }
        if (posicoesTomadas.includes(label)) return // posição de outro cliente
        if (posicoesBloqueadasPontual.includes(label)) return // bloqueada pontual
        if (posicoesBloqueadasGlobal.includes(label)) return // bloqueada globalmente
        confirmarTrocaPosicao(label)
      }
    }

    function PosBtn({ label, tipo }: { label: string; tipo: 'R'|'F' }) {
      const s = estadoPos(label)
      const tomado = posicoesTomadas.includes(label)
      const bloqueadaPontual = posicoesBloqueadasPontual.includes(label)
      const bloqueadaGlobal  = posicoesBloqueadasGlobal.includes(label)
      const salvandoEssa = salvandoBloqueio === label

      // disabled:
      // - view: nunca desabilitado quando livre/bloqueada (clica pra toggle); só quando ocupada ou bloqueada globalmente
      // - walkin/troca: desabilitado se tomado por outro ou bloqueada (pontual ou global)
      let disabled = false
      if (modo === 'view') disabled = tomado || salvandoEssa || bloqueadaGlobal
      else if (modo === 'walkin') disabled = (tomado || bloqueadaPontual || bloqueadaGlobal) && label !== posicaoSel
      else if (modo === 'troca') disabled = !trocandoReserva
        ? (!tomado || bloqueadaPontual || bloqueadaGlobal)                             // fase 1: só ocupadas clicáveis
        : ((tomado && label !== posicaoAtualTroca) || bloqueadaPontual || bloqueadaGlobal) // fase 2: só livres clicáveis

      return (
        <button
          disabled={disabled}
          onClick={() => handleClick(label)}
          title={bloqueadaGlobal ? `${label} bloqueada (global — Mapa de Posições)` : bloqueadaPontual ? `${label} bloqueada — clique para desbloquear` : (s.nome ? s.nome : label)}
          style={{ border:`1.5px solid ${s.border}`, background:s.bg, borderRadius:8,
            cursor: disabled ? 'not-allowed' : s.cursor,
            padding:'4px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:2,
            position:'relative', minWidth:0,
            opacity: salvandoEssa ? 0.5 : 1 }}>
          <div style={{ width:'65%', maxWidth:28 }}>
            {tipo === 'R' ? <IconEsteira color={s.icon}/> : <IconHaltere color={s.icon}/>}
          </div>
          {s.nome ? (
            <span style={{ fontSize:7, fontWeight:700, color:s.icon, lineHeight:1,
              fontFamily:"'DM Sans', sans-serif", maxWidth:'90%', overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {s.nome}
            </span>
          ) : (
            <span style={{ fontSize:7, fontFamily:"'DM Mono', monospace", fontWeight:700,
              color:s.icon, lineHeight:1 }}>{label}</span>
          )}
          {s.bloqueada && (
            <span style={{ position:'absolute', top:1, right:2, fontSize:10, fontWeight:900,
              color:VERMELHO, lineHeight:1 }}>✕</span>
          )}
          {s.atual && (
            <span style={{ position:'absolute', top:-4, right:-4, background:AMARELO,
              borderRadius:'50%', width:8, height:8 }}/>
          )}
        </button>
      )
    }

    return (
      <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:12,
        padding:'0.85rem 0.75rem' }}>
        {modo === 'view' && (
          <div style={{ fontSize:11, color:'#888', textAlign:'center', marginBottom:8, lineHeight:1.5 }}>
            💡 Clique numa posição livre para bloquear nesta aula. Posição com cliente: use "Trocar" antes.
          </div>
        )}
        {posR.length > 0 && (
          <div style={{ marginBottom:'1rem' }}>
            <div style={{ fontSize:9, color:'#aaa', letterSpacing:2, textAlign:'center', marginBottom:6 }}>ESTEIRAS</div>
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${posR.length}, 1fr)`, gap:3 }}>
              {posR.map((pos:any) => {
                const label = `R${String(pos.numero).padStart(2,'0')}`
                return <PosBtn key={pos.id} label={label} tipo="R" />
              })}
            </div>
          </div>
        )}
        {posR.length > 0 && posF_imp.length > 0 && (
          <div style={{ height:1, background:'#e5e7eb', margin:'0 -0.75rem 1rem' }}/>
        )}
        {posF_imp.length > 0 && (
          <div>
            <div style={{ fontSize:9, color:'#aaa', letterSpacing:2, textAlign:'center', marginBottom:6 }}>FUNCIONAL</div>
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${posF_imp.length}, 1fr)`, gap:3, marginBottom:3 }}>
              {posF_imp.map((pos:any) => {
                const label = `F${String(pos.numero).padStart(2,'0')}`
                return <PosBtn key={pos.id} label={label} tipo="F" />
              })}
            </div>
            {posF_par.length > 0 && (
              <div style={{ paddingLeft:`calc(100% / ${posF_imp.length * 2})` }}>
                <div style={{ display:'grid', gridTemplateColumns:`repeat(${posF_par.length}, 1fr)`, gap:3 }}>
                  {posF_par.map((pos:any) => {
                    const label = `F${String(pos.numero).padStart(2,'0')}`
                    return <PosBtn key={pos.id} label={label} tipo="F" />
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Legenda */}
        <div style={{ display:'flex', gap:10, marginTop:10, justifyContent:'center', flexWrap:'wrap' }}>
          {modo === 'view' && [
            [`${ACCENT}15`,ACCENT,'Livre'],
            ['#e5e5e5','#bbb','Com cliente'],
            [`${VERMELHO}15`,VERMELHO,'Bloqueada nesta aula'],
          ].map(([bg,brd,txt]) => (
            <span key={txt} style={{ fontSize:9, color:brd, display:'flex', alignItems:'center', gap:3 }}>
              <span style={{ width:8, height:8, background:bg, border:`1.5px solid ${brd}`, borderRadius:2, display:'inline-block' }}/>
              {txt}
            </span>
          ))}
          {modo === 'troca' && [
            [`${AMARELO}15`,AMARELO,'Posição atual'],
            ['#f0fff4',VERDE,'Disponível'],
            ['#f3f4f6','#d1d5db','Ocupado'],
            [`${VERMELHO}15`,VERMELHO,'Bloqueada'],
          ].map(([bg,brd,txt]) => (
            <span key={txt} style={{ fontSize:9, color:brd, display:'flex', alignItems:'center', gap:3 }}>
              <span style={{ width:8, height:8, background:bg, border:`1.5px solid ${brd}`, borderRadius:2, display:'inline-block' }}/>
              {txt}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (loading || loadingData) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ width:32, height:32, border:`4px solid ${ACCENT}`, borderTopColor:'transparent',
        borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding:'2rem', fontFamily:"'DM Sans', sans-serif", maxWidth:900 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');`}</style>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1.5rem' }}>
        <button onClick={() => router.push('/recepcao/club')}
          style={{ background:'#f3f4f6', border:'none', borderRadius:8, width:36, height:36,
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'#555', flexShrink:0 }}>
          ‹
        </button>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:24, color:'#111', letterSpacing:1 }}>
              {tipoLabel(aula?.tipo)} — {(aula?.horario||'').slice(0,5)}
            </div>
            <span style={{ fontSize:10, fontWeight:700, color:badge.cor, background:`${badge.cor}18`,
              padding:'3px 10px', borderRadius:20, textTransform:'uppercase', letterSpacing:0.5 }}>
              {badge.label}
            </span>
          </div>
          <div style={{ fontSize:13, color:'#888' }}>
            {aula?.grupos_musculares?.nome} ·{' '}
            {nomeCoachExibir
              ? nomeCoachExibir
              : <span style={{ color:VERMELHO, fontWeight:700 }}>Coach a definir</span>}
            {' · '}
            {ocorrencia?.data ? new Date(ocorrencia.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}) : ''}
          </div>
        </div>

        {/* Navegação entre aulas do dia */}
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={() => navPrev && router.push(`/recepcao/club/${navPrev}`)} disabled={!navPrev}
            title="Aula anterior"
            style={{ background:'#f3f4f6', border:'none', borderRadius:8, padding:'0.55rem 0.9rem',
              cursor: navPrev ? 'pointer' : 'default', opacity: navPrev ? 1 : 0.4,
              fontSize:13, fontWeight:600, color:'#555', fontFamily:"'DM Sans', sans-serif", whiteSpace:'nowrap' }}>
            ‹ Anterior
          </button>
          <button onClick={() => navNext && router.push(`/recepcao/club/${navNext}`)} disabled={!navNext}
            title="Próxima aula"
            style={{ background:'#f3f4f6', border:'none', borderRadius:8, padding:'0.55rem 0.9rem',
              cursor: navNext ? 'pointer' : 'default', opacity: navNext ? 1 : 0.4,
              fontSize:13, fontWeight:600, color:'#555', fontFamily:"'DM Sans', sans-serif", whiteSpace:'nowrap' }}>
            Próxima ›
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10,
          padding:'0.75rem 1.25rem', marginBottom:'1rem', fontSize:13, color:'#166534', fontWeight:600 }}>
          {msg}
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:'1.5rem' }}>
        {[
          { label:'Reservas',   value:reservas.length, cor:'#111' },
          { label:'Presentes',  value:presentes,       cor:VERDE },
          { label:'Aguardando', value:aguardando,      cor:AMARELO },
          { label:'Faltas',     value:faltas,          cor:VERMELHO },
        ].map(s => (
          <div key={s.label} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'1rem', textAlign:'center' }}>
            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:36, color:s.cor, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:11, color:'#aaa', marginTop:4, textTransform:'uppercase', letterSpacing:0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* NOVO: Bloquear vagas — só Lift / Lift for Girls, em aula de hoje/futuro */}
      {!isRunning && !isPassado && aula && (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, marginBottom:'1.5rem', overflow:'hidden' }}>
          <div style={{ padding:'0.85rem 1.5rem', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>Bloquear vagas</div>
            <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>
              Reduz as vagas disponíveis desta aula (ex: equipamento quebrado). Não afeta reservas já feitas.
            </div>
          </div>
          <div style={{ padding:'1.25rem 1.5rem' }}>
            {(() => {
              const cap = aula?.capacidade || 0
              const reservadas = reservas.length
              const livres = Math.max(0, cap - reservadas - vagasBloqueadas)
              const maxBloq = Math.max(0, cap - reservadas)
              return (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:'1.25rem' }}>
                    {[
                      { label:'Capacidade', value:cap,             cor:'#111' },
                      { label:'Reservadas', value:reservadas,      cor:CYAN },
                      { label:'Bloqueadas', value:vagasBloqueadas, cor:VERMELHO },
                      { label:'Livres',     value:livres,          cor:VERDE },
                    ].map(s => (
                      <div key={s.label} style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:10, padding:'0.75rem', textAlign:'center' }}>
                        <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:30, color:s.cor, lineHeight:1 }}>{s.value}</div>
                        <div style={{ fontSize:10, color:'#aaa', marginTop:4, textTransform:'uppercase', letterSpacing:0.5 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14 }}>
                    <button onClick={() => salvarBloqueioVagas(vagasBloqueadas - 1)}
                      disabled={salvandoVagas || vagasBloqueadas <= 0}
                      style={{ width:44, height:44, borderRadius:'50%', border:'1.5px solid #e5e7eb',
                        background:'#fff', fontSize:22, color: vagasBloqueadas<=0 ? '#ddd' : '#555',
                        cursor: (salvandoVagas||vagasBloqueadas<=0) ? 'default' : 'pointer', lineHeight:1 }}>
                      −
                    </button>
                    <div style={{ minWidth:90, textAlign:'center' }}>
                      <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:40, color:VERMELHO, lineHeight:1 }}>{vagasBloqueadas}</div>
                      <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5, marginTop:2 }}>bloqueadas</div>
                    </div>
                    <button onClick={() => salvarBloqueioVagas(vagasBloqueadas + 1)}
                      disabled={salvandoVagas || vagasBloqueadas >= maxBloq}
                      style={{ width:44, height:44, borderRadius:'50%',
                        border:`1.5px solid ${vagasBloqueadas>=maxBloq?'#e5e7eb':VERMELHO}`,
                        background: vagasBloqueadas>=maxBloq ? '#fff' : `${VERMELHO}10`, fontSize:22,
                        color: vagasBloqueadas>=maxBloq ? '#ddd' : VERMELHO,
                        cursor: (salvandoVagas||vagasBloqueadas>=maxBloq) ? 'default' : 'pointer', lineHeight:1 }}>
                      +
                    </button>
                  </div>
                  {vagasBloqueadas > 0 && (
                    <div style={{ textAlign:'center', marginTop:'1rem' }}>
                      <button onClick={() => salvarBloqueioVagas(0)} disabled={salvandoVagas}
                        style={{ background:'transparent', border:'none', color:'#888', fontSize:12,
                          textDecoration:'underline', cursor: salvandoVagas ? 'default' : 'pointer',
                          fontFamily:"'DM Sans', sans-serif" }}>
                        Liberar todas
                      </button>
                    </div>
                  )}
                  {maxBloq === 0 && (
                    <div style={{ textAlign:'center', marginTop:'0.85rem', fontSize:12, color:'#aaa' }}>
                      Todas as vagas já estão reservadas — não há vagas livres para bloquear.
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* NOVO: Vagas no Wellhub — só em unidade integrada, aula de hoje/futuro */}
      {!isPassado && aula && (wellhubEstado === 'ativo' || wellhubEstado === 'pausado') && (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, marginBottom:'1.5rem', overflow:'hidden' }}>
          <div style={{ padding:'0.85rem 1.5rem', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>Vagas no Wellhub</div>
            <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>
              Quantas vagas desta aula aparecem no app do Wellhub. Os dois canais dividem o mesmo pool de vagas.
              {wellhubEstado === 'pausado' && ' — integração PAUSADA nesta unidade no momento.'}
            </div>
          </div>
          <div style={{ padding:'1.25rem 1.5rem' }}>
            {(() => {
              const resolvido = vagasWellhub ?? vagasDefaultWh
              const usandoPadrao = vagasWellhub === null
              return (
                <>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14 }}>
                    <button onClick={() => salvarVagasWellhub(Math.max(0, resolvido - 1))}
                      disabled={salvandoWellhub || resolvido <= 0}
                      style={{ width:44, height:44, borderRadius:'50%', border:'1.5px solid #e5e7eb',
                        background:'#fff', fontSize:22, color: resolvido<=0 ? '#ddd' : '#555',
                        cursor: (salvandoWellhub||resolvido<=0) ? 'default' : 'pointer', lineHeight:1 }}>
                      −
                    </button>
                    <div style={{ minWidth:120, textAlign:'center' }}>
                      <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:40, color: resolvido===0 ? VERMELHO : ACCENT, lineHeight:1 }}>
                        {resolvido === 0 ? 'Parado' : resolvido}
                      </div>
                      <div style={{ fontSize:10, color:'#aaa', textTransform:'uppercase', letterSpacing:0.5, marginTop:2 }}>
                        {usandoPadrao ? `padrão (${vagasDefaultWh})` : 'vagas no app'}
                      </div>
                    </div>
                    <button onClick={() => salvarVagasWellhub(resolvido + 1)}
                      disabled={salvandoWellhub}
                      style={{ width:44, height:44, borderRadius:'50%',
                        border:`1.5px solid ${ACCENT}`, background:`${ACCENT}10`, fontSize:22, color: ACCENT,
                        cursor: salvandoWellhub ? 'default' : 'pointer', lineHeight:1 }}>
                      +
                    </button>
                  </div>
                  {!usandoPadrao && (
                    <div style={{ textAlign:'center', marginTop:'1rem' }}>
                      <button onClick={() => salvarVagasWellhub(null)} disabled={salvandoWellhub}
                        style={{ background:'transparent', border:'none', color:'#888', fontSize:12,
                          textDecoration:'underline', cursor: salvandoWellhub ? 'default' : 'pointer',
                          fontFamily:"'DM Sans', sans-serif" }}>
                        Usar padrão ({vagasDefaultWh})
                      </button>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Mapa permanente — só Running */}
      {isRunning && posicoes.length > 0 && (
        <div style={{ background:'#fff', border:`1px solid ${modoTrocaAtivo?AMARELO:'#e5e7eb'}`, borderRadius:16, marginBottom:'1.5rem', overflow:'hidden' }}>
          <div style={{ padding:'0.85rem 1.5rem', borderBottom:'1px solid #f3f4f6', background: modoTrocaAtivo?`${AMARELO}08`:'transparent' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>
              {modoTrocaAtivo
                ? (trocandoReserva
                    ? <>Trocando <strong>{trocandoReserva.clientes?.nome?.split(' ')[0]}</strong> (<span style={{ fontFamily:"'DM Mono', monospace", color:AMARELO }}>{trocandoReserva.posicao || '—'}</span>) · clique no destino livre</>
                    : 'Clique no aluno que vai trocar de lugar')
                : 'Mapa de posições'}
            </div>
          </div>
          <div style={{ padding:'1rem' }}>
            <MapaPosicoes modo={modoTrocaAtivo ? 'troca' : 'view'} />
            {!modoTrocaAtivo ? (
              <button onClick={() => setModoTrocaAtivo(true)}
                style={{ marginTop:'0.85rem', width:'100%', background:`${AMARELO}10`, border:`1.5px solid ${AMARELO}`,
                  borderRadius:10, padding:'0.6rem', fontSize:13, fontWeight:600, color:'#b45309', cursor:'pointer',
                  fontFamily:"'DM Sans', sans-serif" }}>
                Trocar posição
              </button>
            ) : (
              <button onClick={() => { setModoTrocaAtivo(false); setTrocandoReserva(null) }}
                style={{ marginTop:'0.85rem', width:'100%', background:'#f3f4f6', border:'none',
                  borderRadius:10, padding:'0.6rem', fontSize:13, fontWeight:600, color:'#555', cursor:'pointer',
                  fontFamily:"'DM Sans', sans-serif" }}>
                Cancelar troca
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lista de reservas */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, marginBottom:'1.5rem', overflow:'hidden' }}>
        <div style={{ padding:'1rem 1.5rem', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>Lista de alunos</div>
          <div style={{ fontSize:12, color:'#aaa' }}>{reservas.length} de {aula?.capacidade||'—'} vagas</div>
        </div>
        {reservas.length === 0 ? (
          <div style={{ padding:'2rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
            {isFuturo ? 'Nenhuma reserva ainda.' : 'Nenhuma reserva para esta aula.'}
          </div>
        ) : (
          <div>
            {reservas.map((r, i) => {
              const cli = r.clientes
              const { label, icon } = parsePlanoKey(r.tipo_credito || '')
              const isPresente  = r.status === 'presente'
              const isFalta     = r.status === 'falta'

              return (
                <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'0.85rem 1.5rem',
                  borderBottom: i < reservas.length - 1 ? '1px solid #f3f4f6' : 'none',
                  background: isPresente ? '#f0fdf4' : isFalta ? '#fff5f5' : '#fff' }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'#f3f4f6',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#888', flexShrink:0 }}>
                    {i+1}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111', marginBottom:2 }}>{cli?.nome||'—'}</div>
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, color:'#888' }}>{icon} {(r as any).creditos_avulsos?.observacao || label}</span>
                      {r.posicao ? (
                        <span style={{ fontSize:14, fontFamily:"'DM Mono', monospace", fontWeight:800,
                          color:'#fff', background:ACCENT, padding:'3px 12px', borderRadius:8,
                          letterSpacing:1 }}>
                          {r.posicao}
                        </span>
                      ) : isRunning && (
                        <span style={{ fontSize:11, color:'#ccc', fontStyle:'italic' }}>sem posição</span>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink:0, marginRight:4 }}>
                    {isPresente  && <span style={{ fontSize:11, fontWeight:700, color:VERDE }}>✓ PRESENTE</span>}
                    {isFalta     && <span style={{ fontSize:11, fontWeight:700, color:VERMELHO }}>✗ FALTA</span>}
                  </div>

                  {/* Presença / Falta — livre, com toggle (clicar no ativo desmarca; falta pede confirmação) */}
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button onClick={() => marcarStatus(r.id, isPresente ? 'reservado' : 'presente')} disabled={atualizando===r.id}
                      title={isPresente ? 'Clique para desmarcar' : 'Marcar presença'}
                      style={{ padding:'0.35rem 0.75rem', borderRadius:8, border:`1.5px solid ${isPresente?VERDE:'#e5e7eb'}`,
                        background:isPresente?VERDE:'#fff', color:isPresente?'#fff':'#555',
                        fontSize:12, fontWeight:600, cursor:atualizando===r.id?'default':'pointer',
                        opacity:atualizando===r.id?0.5:1, fontFamily:"'DM Sans', sans-serif" }}>
                      ✓
                    </button>
                    <button onClick={() => marcarStatus(r.id, isFalta ? 'reservado' : 'falta')} disabled={atualizando===r.id}
                      title={isFalta ? 'Clique para desmarcar' : 'Marcar falta'}
                      style={{ padding:'0.35rem 0.75rem', borderRadius:8, border:`1.5px solid ${isFalta?VERMELHO:'#e5e7eb'}`,
                        background:isFalta?VERMELHO:'#fff', color:isFalta?'#fff':'#888',
                        fontSize:12, fontWeight:600, cursor:atualizando===r.id?'default':'pointer',
                        opacity:atualizando===r.id?0.5:1, fontFamily:"'DM Sans', sans-serif" }}>
                      ✗
                    </button>
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Walk-in / Agendamento */}
      {!isPassado && (
        <div style={{ background:'#fff', border:`1px solid ${isFuturo?`${CYAN}40`:'#e5e7eb'}`, borderRadius:16, overflow:'hidden' }}>
          <div style={{ padding:'1rem 1.5rem', borderBottom:'1px solid #f3f4f6', background:isFuturo?`${CYAN}08`:'#fff' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>
              {isFuturo ? '📅 Agendar cliente' : '➕ Adicionar cliente (walk-in)'}
            </div>
            <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>
              {isFuturo ? 'Reserve uma vaga para o cliente nesta aula futura' : 'Cliente chegou direto na unidade sem reserva prévia'}
            </div>
          </div>
          <div style={{ padding:'1.25rem 1.5rem' }}>

            {etapa === 'busca' && (
              <>
                <div style={{ marginBottom:8 }}>
                  <input value={buscaTexto} onChange={e => setBuscaTexto(e.target.value)}
                    placeholder="Buscar por nome, CPF, email ou telefone..."
                    style={{ width:'100%', boxSizing:'border-box', border:'1px solid #e5e7eb', borderRadius:8, padding:'0.65rem 1rem',
                      fontSize:13, color:'#111', fontFamily:"'DM Sans', sans-serif", outline:'none' }}/>
                  {buscando && (
                    <div style={{ fontSize:11, color:'#aaa', marginTop:6 }}>Buscando...</div>
                  )}
                  {!buscando && buscaTexto.trim().length >= 2 && resultados.length === 0 && (
                    <div style={{ fontSize:12, color:'#aaa', marginTop:8, textAlign:'center' }}>
                      Nenhum cliente encontrado para "{buscaTexto.trim()}".
                    </div>
                  )}
                </div>
                {resultados.length > 0 && (
                  <div style={{ border:'1px solid #e5e7eb', borderRadius:8, overflow:'hidden' }}>
                    {resultados.map((cli, i) => (
                      <button key={cli.id} onClick={() => selecionarCliente(cli)}
                        style={{ display:'flex', alignItems:'center', gap:'0.75rem', width:'100%',
                          padding:'0.75rem 1rem', background:'#fff', border:'none',
                          borderBottom:i<resultados.length-1?'1px solid #f3f4f6':'none',
                          cursor:'pointer', textAlign:'left' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='#f9fafb')}
                        onMouseLeave={e=>(e.currentTarget.style.background='#fff')}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:`${ACCENT}20`,
                          display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:ACCENT, flexShrink:0 }}>
                          {cli.nome?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:600, color:'#111' }}>{cli.nome}</div>
                          <div style={{ fontSize:11, color:'#aaa' }}>{cli.email||cli.telefone}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {etapa === 'mapa' && clienteSel && (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'#f9fafb',
                  border:'1px solid #e5e7eb', borderRadius:10, padding:'0.75rem 1rem', marginBottom:'1.25rem' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:`${ACCENT}20`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:ACCENT }}>
                    {clienteSel.nome?.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111' }}>{clienteSel.nome}</div>
                    <div style={{ fontSize:11, color:'#aaa' }}>{clienteSel.email}</div>
                  </div>
                  <button onClick={resetWalkin} style={{ background:'transparent', border:'none', color:'#aaa', cursor:'pointer', fontSize:16 }}>✕</button>
                </div>
                <div style={{ fontSize:12, color:'#888', marginBottom:'0.75rem', textAlign:'center' }}>
                  Escolha a posição do cliente
                </div>
                <MapaPosicoes modo="walkin" />
                {posicaoSel && (
                  <div style={{ background:`${ACCENT}08`, border:`1px solid ${ACCENT}30`, borderRadius:8,
                    padding:'0.5rem 1rem', fontSize:13, color:ACCENT, margin:'0.75rem 0', fontWeight:600 }}>
                    Selecionada: <span style={{ fontFamily:"'DM Mono', monospace" }}>{posicaoSel}</span>
                  </div>
                )}
                <div style={{ display:'flex', gap:8, marginTop:'0.75rem' }}>
                  <button onClick={resetWalkin}
                    style={{ flex:1, background:'#f3f4f6', border:'none', borderRadius:10,
                      padding:'0.85rem', fontSize:13, color:'#555', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    Cancelar
                  </button>
                  <button onClick={() => setEtapa('credito')} disabled={!posicaoSel}
                    style={{ flex:2, background:posicaoSel?ACCENT:'#e5e7eb', color:posicaoSel?'#fff':'#aaa',
                      border:'none', borderRadius:10, padding:'0.85rem', fontSize:13, fontWeight:600,
                      cursor:posicaoSel?'pointer':'default', fontFamily:"'DM Sans', sans-serif" }}>
                    Continuar →
                  </button>
                </div>
              </div>
            )}

            {etapa === 'credito' && clienteSel && (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'#f9fafb',
                  border:'1px solid #e5e7eb', borderRadius:10, padding:'0.75rem 1rem', marginBottom:'1rem' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:`${ACCENT}20`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:ACCENT }}>
                    {clienteSel.nome?.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111' }}>{clienteSel.nome}</div>
                    <div style={{ fontSize:11, color:'#aaa' }}>
                      {clienteSel.email}
                      {posicaoSel && <span style={{ marginLeft:6, fontFamily:"'DM Mono', monospace", fontWeight:700, color:ACCENT }}>· {posicaoSel}</span>}
                    </div>
                  </div>
                  <button onClick={resetWalkin} style={{ background:'transparent', border:'none', color:'#aaa', cursor:'pointer', fontSize:16 }}>✕</button>
                </div>

                {planosDisp.length === 0 ? (
                  <div>
                    <div style={{ background:'#fff8f0', border:'1px solid #fed7aa', borderRadius:8,
                      padding:'0.75rem 1rem', fontSize:13, color:'#9a3412', marginBottom:'1rem' }}>
                      ⚠️ Cliente sem créditos para esta unidade neste mês.
                    </div>
                    <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:10, padding:'1rem', marginBottom:'1rem' }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#0369a1', marginBottom:10 }}>⚡ Ativar plano agora</div>
                      <div style={{ display:'flex', gap:8 }}>
                        {['wellhub','totalpass'].map(tipo => (
                          <button key={tipo} onClick={() => ativarPlanoRapido(tipo)}
                            style={{ padding:'0.5rem 1rem', borderRadius:8, border:'1.5px solid #bae6fd',
                              background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600,
                              color:'#0369a1', fontFamily:"'DM Sans', sans-serif" }}>
                            {tipo==='wellhub'?'💜 Wellhub':'🔵 TotalPass'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom:'1rem' }}>
                    <div style={{ fontSize:12, color:'#888', marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>Usar crédito de:</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {planosDisp.map(p => {
                        const { label, icon } = parsePlanoKey(p)
                        const info = saldoCliente[p]
                        return (
                          <button key={p} onClick={() => setTipoCredito(p)}
                            style={{ padding:'0.5rem 1rem', borderRadius:10, border:`1.5px solid ${tipoCredito===p?ACCENT:'#e5e7eb'}`,
                              background:tipoCredito===p?`${ACCENT}10`:'#fff', cursor:'pointer',
                              fontSize:13, fontWeight:600, color:tipoCredito===p?ACCENT:'#555', fontFamily:"'DM Sans', sans-serif" }}>
                            {icon} {label} <span style={{ fontSize:11, opacity:0.7 }}>({info?.disponivel} restantes)</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {erroAgendar && (
                  <div style={{ background:'#fff5f5', border:'1px solid #fecaca', borderRadius:8,
                    padding:'0.6rem 1rem', fontSize:13, color:'#991b1b', marginBottom:'1rem' }}>{erroAgendar}</div>
                )}

                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => isRunning ? setEtapa('mapa') : resetWalkin()}
                    style={{ flex:1, background:'#f3f4f6', border:'none', borderRadius:10,
                      padding:'0.85rem', fontSize:13, color:'#555', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    {isRunning ? '← Posição' : 'Cancelar'}
                  </button>
                  <button onClick={agendarOuWalkin} disabled={agendando||planosDisp.length===0}
                    style={{ flex:2, background:planosDisp.length===0?'#e5e7eb':isFuturo?CYAN:ACCENT,
                      color:planosDisp.length===0?'#aaa':'#fff', border:'none', borderRadius:10,
                      padding:'0.85rem', fontSize:13, fontWeight:600,
                      cursor:agendando||planosDisp.length===0?'default':'pointer',
                      fontFamily:"'DM Sans', sans-serif", opacity:agendando?0.7:1 }}>
                    {agendando?(isFuturo?'Agendando...':'Adicionando...'):(isFuturo?'📅 Confirmar agendamento':'✓ Confirmar presença')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isPassado && (
        <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:16,
          padding:'1.25rem 1.5rem', textAlign:'center', color:'#aaa', fontSize:13 }}>
          Aula encerrada — não é possível adicionar novas presenças.
        </div>
      )}
    </div>
  )
}
