'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { dashboardDoRole } from '@/lib/auth-redirect'
import SiteHeader from '@/components/SiteHeader'

const ACCENT  = '#ff2d9b'
const CYAN    = '#00e5ff'
const AMARELO = '#ffaa00'
const VERDE   = '#2ddd8b'

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

// Tier mínimo por app + unidade (texto fixo, casado por tipo + nome da unidade)
const TIER_INFO: Record<string, { tier: string; creditos: number }> = {
  'wellhub|Just CT':         { tier: 'Diamond', creditos: 8 },
  'totalpass|Just CT':       { tier: 'TP6',     creditos: 10 },
  'wellhub|Vila Olímpia':    { tier: 'Gold',    creditos: 12 },
  'totalpass|Vila Olímpia':  { tier: 'TP3',     creditos: 12 },
  'wellhub|Pinheiros':       { tier: 'Gold',    creditos: 12 },
  'totalpass|Pinheiros':     { tier: 'TP3',     creditos: 12 },
}

function tierDoPlano(tipo: string, nomeUnidade: string): { tier: string; creditos: number } | null {
  return TIER_INFO[`${tipo}|${nomeUnidade}`] || null
}

const CONTRATO_TEXTO = `TERMOS DE USO — JUST CT & JUSTCLUB

Última atualização: maio de 2025

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. PLANOS E CRÉDITOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1.1. Cada plano gera créditos mensais conforme o tipo de parceiro (Wellhub, TotalPass) ou pacote adquirido.
1.2. Os créditos são pessoais, intransferíveis e expiram ao final de cada mês calendário.
1.3. Créditos não utilizados não acumulam para o mês seguinte.
1.4. Plano Avulso Coach CT: crédito válido por 30 dias a partir da compra.
1.5. Coach CT Pro: pacote completo de sessões com janela estendida de 14 dias.
1.6. Wellhub e TotalPass: renovam automaticamente todo dia 1º de cada mês — 12 treinos/mês por unidade.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. AGENDAMENTOS — JUST CT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2.1. Janela rolante: 7 dias para Wellhub, TotalPass e Avulso · 14 dias para Coach CT Pro.
2.2. Cada crédito permite reservar uma sessão individual com coach.
2.3. Horários sujeitos à disponibilidade. Máximo de um agendamento por dia no Just CT.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. CANCELAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3.1. Cancelamento com mais de 12h de antecedência: crédito devolvido integralmente.
3.2. Entre 12h e 3h antes: cancelamento permitido somente se houver cliente na fila de espera.
3.3. Com menos de 3h de antecedência: cancelamento não é possível.
3.4. Esta regra aplica-se a todas as unidades (Just CT e JustClub).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. POLÍTICA DE FALTAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4.1. Falta sem cancelamento prévio gera bloqueio automático de novos agendamentos.
4.2. Para reativar a conta: regularização presencial na recepção da unidade correspondente.
4.3. Agendamentos futuros são cancelados automaticamente em caso de bloqueio.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. FILA DE ESPERA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5.1. Ao entrar na fila, o cliente aceita automaticamente as regras do agendamento.
5.2. Se uma vaga abrir, o agendamento é confirmado automaticamente sem necessidade de ação.
5.3. As mesmas regras de cancelamento e falta se aplicam — inclusive multa por no-show.
5.4. A confirmação pode ocorrer a qualquer momento até 3h antes do treino.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. JUSTCLUB — REGRAS ESPECÍFICAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6.1. As aulas do JustClub têm capacidade limitada por modalidade: Lift, Lift for Girls e Running + Funcional.
6.2. Wellhub e TotalPass nas unidades Club: até 12 treinos/mês por unidade. Cada unidade tem saldo independente.
6.3. Janela de agendamento: 7 dias corridos a partir da data atual.
6.4. Cancelamento: mesmas regras gerais (item 3) — mínimo de 3h de antecedência.
6.5. NO-SHOW: falta sem cancelamento prévio nas unidades Club gera multa de R$ 49,90, cobrada no cartão cadastrado.
6.6. Após geração de multa, a conta fica bloqueada para novos agendamentos nas unidades Club até a regularização do pagamento.
6.7. Running + Funcional: posições numéricas são atribuídas no momento da reserva e aparecem no seu agendamento. Trocas de posição devem ser solicitadas presencialmente na recepção.
6.8. Os créditos JustClub são independentes dos créditos Just CT — trocar de unidade não compartilha saldo.
6.9. A modalidade (Lift, Lift for Girls, Running + Funcional) é definida pela grade da unidade e pode variar a cada semana.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. ACEITE E VIGÊNCIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ao ativar seu plano e confirmar o aceite abaixo, você declara ter lido, compreendido e concordado integralmente com todos os termos acima. Este contrato entra em vigor imediatamente e permanece válido enquanto houver ao menos um plano ativo vinculado à sua conta.`

function parsePlanoKey(key: string): { label: string; icon: string } {
  const lower = (key||'').toLowerCase()
  let tipo = '', icon = '🏋️', slugUnidade = ''
  if (lower.startsWith('coach_ct_pro'))      { tipo = 'Coach CT Pro'; icon = '🏆'; slugUnidade = key.substring('coach_ct_pro_'.length) }
  else if (lower.startsWith('wellhub'))      { tipo = 'Wellhub'; icon = '💜'; slugUnidade = key.split('_').slice(1).join('_') }
  else if (lower.startsWith('totalpass'))    { tipo = 'TotalPass'; icon = '🔵'; slugUnidade = key.split('_').slice(1).join('_') }
  else if (lower.startsWith('avulso')||lower.startsWith('credito')) { tipo = 'Crédito Avulso'; icon = '🎟️'; slugUnidade = key.split('_').slice(1).join('_') }
  else { tipo = key }
  const nomeUnidade: Record<string,string> = { just_ct:'Just CT', just_club_vila_olimpia:'Vila Olímpia', just_club_pinheiros:'Pinheiros' }
  return { label: `${tipo} — ${nomeUnidade[slugUnidade]||slugUnidade.replace(/_/g,' ')}`, icon }
}

function tipoAulaLabel(t: string) {
  if (t==='lift')              return 'Lift'
  if (t==='lift_for_girls')   return 'Lift for Girls'
  if (t==='running_funcional') return 'Running + Funcional'
  return t
}

function dataLocalStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function DiaSemana({ data }: { data: string }) {
  const d = new Date(data + 'T12:00:00')
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  return <span>{dias[d.getDay()]}</span>
}

export default function MinhaContaPage() {
  const { user, perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [cliente,            setCliente]            = useState<any>(null)
  const [agendamentos,       setAgendamentos]       = useState<any[]>([])
  const [agendamentosPassados, setAgendamentosPassados] = useState<any[]>([])
  const [clubReservas,       setClubReservas]       = useState<any[]>([])
  const [clubReservasPassadas,setClubReservasPassadas] = useState<any[]>([])
  const [filas,              setFilas]              = useState<any[]>([])
  const [saldoAtual,         setSaldoAtual]         = useState<Record<string,any>>({})
  const [saldoProximo,       setSaldoProximo]       = useState<Record<string,any>>({})
  const [clientePlanos,      setClientePlanos]      = useState<any[]>([])
  const [compras,            setCompras]            = useState<any[]>([])
  const [planosDisponiveis,  setPlanosDisponiveis]  = useState<any[]>([])
  const [cobrancasPendentes, setCobrancasPendentes] = useState<any[]>([])
  const [loadingData,        setLoadingData]        = useState(true)
  const [verTodosHistorico,  setVerTodosHistorico]  = useState(false)

  const [modalCancelar, setModalCancelar] = useState<any>(null)
  const [cancelando,    setCancelando]    = useState(false)
  const [erroCancelar,  setErroCancelar]  = useState('')
  const [modalSairFila, setModalSairFila] = useState<any>(null)
  const [saindoFila,    setSaindoFila]    = useState(false)

  const [modalAtivar,    setModalAtivar]    = useState<any>(null)
  const [contratoAceito, setContratoAceito] = useState(false)
  const [ativando,       setAtivando]       = useState(false)
  const [erroAtivar,     setErroAtivar]     = useState('')
  const [modalSucesso,   setModalSucesso]   = useState<any>(null)

  // ── Alterar senha ──
  const [modalSenha,     setModalSenha]     = useState(false)
  const [novaSenha,      setNovaSenha]      = useState('')
  const [confirmaSenha,  setConfirmaSenha]  = useState('')
  const [salvandoSenha,  setSalvandoSenha]  = useState(false)
  const [erroSenha,      setErroSenha]      = useState('')
  const [senhaSalva,     setSenhaSalva]     = useState(false)

  const contratoRef = useRef<HTMLDivElement>(null)

  const agora          = new Date()
  const mesAtual       = agora.getMonth()+1
  const anoAtual       = agora.getFullYear()
  const mesProximo     = mesAtual===12?1:mesAtual+1
  const anoProximo     = mesAtual===12?anoAtual+1:anoAtual
  const nomeMesAtual   = MESES[mesAtual-1]
  const nomeMesProximo = MESES[mesProximo-1]

  useEffect(() => {
    if (loading) return
    if (!user) { router.push('/'); return }
    if (perfil?.role && perfil.role !== 'cliente') router.push(dashboardDoRole(perfil.role))
  }, [user, perfil, loading])

  useEffect(() => { if (perfil) loadDados() }, [perfil])

  async function loadDados() {
    const { data: cli } = await supabase.from('clientes').select('*').eq('user_id', perfil!.id).maybeSingle()
    setCliente(cli)
    if (!cli) { setLoadingData(false); return }

    // auto-cura: garante o crédito do mês corrente para os planos ativos (na unidade do plano)
    await supabase.rpc('garantir_creditos_cliente', { p_cliente_id: cli.id, p_mes: mesAtual, p_ano: anoAtual })

    const hoje = dataLocalStr(agora)
    const [
      { data: ags },
      { data: agsPassadas },
      { data: filasData },
      { data: cliPlanos },
      { data: vendasData },
      { data: crData },
      { data: crPassadasData },
      { data: planosData },
      { data: cobrancasData },
    ] = await Promise.all([
      // Futuros CT
      supabase.from('agendamentos').select('*, unidades(nome)')
        .eq('cliente_id', cli.id).gte('data', hoje)
        .not('status','in','("cancelado")').order('data').order('horario').limit(30),
      // Passados CT
      supabase.from('agendamentos').select('*, unidades(nome)')
        .eq('cliente_id', cli.id).lt('data', hoje)
        .in('status', ['realizado','falta']).order('data',{ascending:false}).limit(20),
      // Fila
      supabase.from('fila_espera').select('*, unidades(nome)')
        .eq('cliente_id', cli.id).eq('status','aguardando').gte('data', hoje)
        .order('data').order('horario'),
      // Planos
      supabase.from('cliente_planos').select('*, planos_disponiveis(id, nome, tipo, unidade_id)')
        .eq('cliente_id', cli.id).eq('ativo', true),
      // Compras
      supabase.from('vendas').select('*, produtos(nome, subtipo, dias_validade)')
        .eq('cliente_id', cli.id).order('vendido_em',{ascending:false}).limit(10),
      // Club reservas futuras
      supabase.from('club_reservas').select(`
        id, status, tipo_credito, posicao, cancelado_em,
        club_ocorrencias(id, data, club_aulas(tipo, horario, unidade_id, unidades(nome)))
      `).eq('cliente_id', cli.id).not('status','in','("cancelado")'),
      // Club reservas passadas
      supabase.from('club_reservas').select(`
        id, status, tipo_credito, posicao,
        club_ocorrencias(id, data, club_aulas(tipo, horario, unidade_id, unidades(nome)))
      `).eq('cliente_id', cli.id).in('status',['presente','realizado','falta']).limit(20),
      // Planos disponíveis
      supabase.from('planos_disponiveis')
        .select('id, nome, tipo, creditos_mes, unidade_id, unidades(id, nome, tipo)')
        .in('tipo', ['wellhub', 'totalpass']).eq('ativo', true)
        .order('tipo').order('unidade_id'),
      // Cobranças
      supabase.from('cobrancas_pendentes').select('*').eq('cliente_id', cli.id).eq('status', 'pendente'),
    ])

    setAgendamentos(ags||[])
    setAgendamentosPassados(agsPassadas||[])
    setFilas(filasData||[])
    setClientePlanos(cliPlanos||[])
    setCompras(vendasData||[])
    setPlanosDisponiveis(planosData||[])
    setCobrancasPendentes(cobrancasData||[])

    const crFuturas = (crData||[]).filter((cr:any) => (cr.club_ocorrencias?.data||'') >= hoje)
    setClubReservas(crFuturas)
    const crPass = (crPassadasData||[]).filter((cr:any) => (cr.club_ocorrencias?.data||'') < hoje)
    setClubReservasPassadas(crPass)

    await carregarTodosSaldos(cli.id, cliPlanos||[])
    setLoadingData(false)
  }

  async function carregarTodosSaldos(clienteId: string, cliPlanos: any[]) {
    const uids = [...new Set(cliPlanos.map((cp:any) => cp.planos_disponiveis?.unidade_id).filter(Boolean))] as string[]
    if (!uids.length) { setSaldoAtual({}); setSaldoProximo({}); return }
    const [sa, sp] = await Promise.all([
      Promise.all(uids.map(uid => supabase.rpc('saldo_creditos_cliente',{p_cliente_id:clienteId,p_mes:mesAtual,p_ano:anoAtual,p_unidade_id:uid}))),
      Promise.all(uids.map(uid => supabase.rpc('saldo_creditos_cliente',{p_cliente_id:clienteId,p_mes:mesProximo,p_ano:anoProximo,p_unidade_id:uid}))),
    ])
    const ma:Record<string,any>={}; sa.forEach(r=>Object.assign(ma,r.data||{})); setSaldoAtual(ma)
    const mp:Record<string,any>={}; sp.forEach(r=>Object.assign(mp,r.data||{})); setSaldoProximo(mp)
  }

  // Feed futuro unificado
  const feedFuturo = [
    ...(agendamentos.map(ag => ({
      id: ag.id, tipo:'ct' as const,
      data: ag.data, horario:(ag.horario||'').slice(0,5),
      unidadeNome: ag.unidades?.nome||'Just CT',
      tipoCredito: ag.tipo_credito||'', status: ag.status,
      tipoAula: undefined as string|undefined, posicao: undefined as string|undefined,
      original: ag,
    }))),
    ...(clubReservas.map(cr => ({
      id: cr.id, tipo:'club' as const,
      data: cr.club_ocorrencias?.data||'',
      horario: (cr.club_ocorrencias?.club_aulas?.horario||'').slice(0,5),
      unidadeNome: cr.club_ocorrencias?.club_aulas?.unidades?.nome||'JustClub',
      tipoCredito: cr.tipo_credito||'', status: cr.status,
      tipoAula: cr.club_ocorrencias?.club_aulas?.tipo as string|undefined,
      posicao: cr.posicao as string|undefined,
      original: cr,
    }))),
  ].sort((a,b) => `${a.data}T${a.horario}`.localeCompare(`${b.data}T${b.horario}`))

  // Feed histórico unificado
  const feedHistorico = [
    ...(agendamentosPassados.map(ag => ({
      id: ag.id, tipo:'ct' as const,
      data: ag.data, horario:(ag.horario||'').slice(0,5),
      unidadeNome: ag.unidades?.nome||'Just CT',
      status: ag.status, tipoAula: undefined as string|undefined,
    }))),
    ...(clubReservasPassadas.map(cr => ({
      id: cr.id, tipo:'club' as const,
      data: cr.club_ocorrencias?.data||'',
      horario:(cr.club_ocorrencias?.club_aulas?.horario||'').slice(0,5),
      unidadeNome: cr.club_ocorrencias?.club_aulas?.unidades?.nome||'JustClub',
      status: cr.status,
      tipoAula: cr.club_ocorrencias?.club_aulas?.tipo as string|undefined,
    }))),
  ].sort((a,b) => b.data.localeCompare(a.data))

  function planoJaAtivo(planoId: string): boolean {
    return clientePlanos.some(cp => cp.plano_id === planoId && cp.ativo)
  }

  function abrirModalAtivar(plano: any) {
    setModalAtivar({ plano }); setContratoAceito(false); setErroAtivar('')
  }

  async function confirmarAtivacao() {
    if (!contratoAceito || !modalAtivar || ativando) return
    setAtivando(true); setErroAtivar('')
    try {
      const { error } = await supabase.from('cliente_planos').insert({
        cliente_id: cliente.id, plano_id: modalAtivar.plano.id,
        ativo: true, contrato_aceito_em: new Date().toISOString(),
        aceite_pendente: false, inicio: dataLocalStr(new Date()),
      })
      if (error) throw error
      // cria o crédito do mês na unidade do plano (idempotente)
      await supabase.rpc('garantir_creditos_cliente', { p_cliente_id: cliente.id, p_mes: mesAtual, p_ano: anoAtual })
      setModalAtivar(null)
      setModalSucesso({ plano: modalAtivar.plano })
      await loadDados()
    } catch { setErroAtivar('Erro ao ativar plano. Tente novamente ou fale com a recepção.') }
    finally { setAtivando(false) }
  }

  // ── Alterar senha ──
  function abrirModalSenha() {
    setNovaSenha(''); setConfirmaSenha(''); setErroSenha(''); setSenhaSalva(false); setModalSenha(true)
  }

  async function salvarNovaSenha() {
    setErroSenha('')
    if (novaSenha.length < 6) { setErroSenha('A senha deve ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== confirmaSenha) { setErroSenha('As senhas não coincidem.'); return }
    setSalvandoSenha(true)
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setSalvandoSenha(false)
    if (error) { setErroSenha('Erro ao alterar a senha. Tente novamente.'); return }
    setSenhaSalva(true)
    setNovaSenha(''); setConfirmaSenha('')
  }

  // ── Gênero (necessário para aulas exclusivas, ex: Lift for Girls) ──
  async function salvarGenero(valor: 'F' | 'M') {
    if (!cliente || cliente.sexo === valor) return
    const { error } = await supabase.from('clientes').update({ sexo: valor }).eq('id', cliente.id)
    if (!error) setCliente({ ...cliente, sexo: valor })
  }

  async function abrirModalCancelar(item: typeof feedFuturo[0]) {
    const dataHora = new Date(`${item.data}T${item.horario}`)
    const diffHoras = (dataHora.getTime()-agora.getTime())/(1000*60*60)
    let aviso = '', pode = true
    if (diffHoras <= 3)       { pode=false; aviso='Não é possível cancelar com menos de 3h. Falta gera multa.' }
    else if (diffHoras <= 12) { aviso='Dentro de 12h — verificando fila de espera...' }
    else                      { aviso='Cancelamento com mais de 12h. Crédito devolvido integralmente.' }
    if (pode && diffHoras <= 12) {
      let temFila = false
      if (item.tipo==='ct') {
        const {data:f} = await supabase.from('fila_espera').select('id').eq('data',item.data).eq('unidade_id',item.original.unidade_id).eq('status','aguardando').limit(1)
        temFila = (f||[]).length>0
      } else {
        const {data:f} = await supabase.from('fila_espera').select('id').eq('ocorrencia_id',item.original.club_ocorrencias?.id).eq('status','aguardando').limit(1)
        temFila = (f||[]).length>0
      }
      if (!temFila) { pode=false; aviso='Faltam menos de 12h e não há fila de espera. Cancelamento não permitido.' }
      else aviso='Há fila de espera. Você pode cancelar e o crédito será devolvido.'
    }
    setModalCancelar({...item, pode, aviso}); setErroCancelar('')
  }

  async function confirmarCancelamento() {
    if (!modalCancelar?.pode) return
    setCancelando(true); setErroCancelar('')
    let error:any = null
    if (modalCancelar.tipo==='ct') {
      const {error:e} = await supabase.from('agendamentos').update({status:'cancelado',cancelado_em:new Date().toISOString(),motivo_cancelamento:'Cancelado pelo cliente'}).eq('id',modalCancelar.id)
      error=e
    } else {
      const {error:e} = await supabase.from('club_reservas').update({status:'cancelado',cancelado_em:new Date().toISOString()}).eq('id',modalCancelar.id)
      error=e
    }
    if (error) { setErroCancelar('Erro ao cancelar. Tente novamente.'); setCancelando(false); return }
    setModalCancelar(null); setCancelando(false); await loadDados()
  }

  async function sairDaFila() {
    if (!modalSairFila) return
    setSaindoFila(true)
    const {error} = await supabase.from('fila_espera').delete().eq('id',modalSairFila.id)
    if (!error) { setModalSairFila(null); await loadDados() }
    setSaindoFila(false)
  }

  async function sair() { await supabase.auth.signOut(); window.location.href='/' }
  function formatarValor(v:number) { return `R$ ${Number(v).toFixed(2).replace('.',',')}` }
  function formatarData(d:string)  { return new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}) }
  function labelPagamento(f:string) { return f==='cartao_credito'?'Cartão':f==='pix'?'PIX':f==='dinheiro'?'Dinheiro':f==='cortesia'?'Cortesia':f }

  if (loading||loadingData) return (
    <div style={{minHeight:'100vh',background:'#080808',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:32,height:32,border:`4px solid ${ACCENT}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const temPlanoAtivo       = clientePlanos.length>0
  const estaBloqueado       = !!cliente?.bloqueado
  const temCobrancaPendente = cobrancasPendentes.length>0
  const historicoExibido    = verTodosHistorico ? feedHistorico : feedHistorico.slice(0,5)

  // Agrupa os planos parceiros por unidade (para o bloco de ativação visível)
  const gruposParceiros = planosDisponiveis.reduce((acc:any[],p:any)=>{
    const uid=p.unidade_id
    if(!acc.find((g:any)=>g.uid===uid)) acc.push({uid,nome:p.unidades?.nome,tipo:p.unidades?.tipo,planos:[]})
    acc.find((g:any)=>g.uid===uid).planos.push(p)
    return acc
  },[])

  const statusConfig: Record<string,{label:string;cor:string}> = {
    agendado:   {label:'Agendado',   cor:CYAN},
    confirmado: {label:'Confirmado', cor:'#aaff00'},
    reservado:  {label:'Reservado',  cor:VERDE},
    realizado:  {label:'Realizado',  cor:'#666'},
    falta:      {label:'Falta',      cor:'#ff8c00'},
    cancelado:  {label:'Cancelado',  cor:'#ff6b6b'},
  }

  return (
    <div style={{minHeight:'100vh',background:'#080808',fontFamily:"'DM Sans', sans-serif",color:'#f0f0f0'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        .contrato-scroll::-webkit-scrollbar{width:4px}
        .contrato-scroll::-webkit-scrollbar-track{background:#1a1a1a}
        .contrato-scroll::-webkit-scrollbar-thumb{background:#444;border-radius:2px}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
        input:focus{outline:none;border-color:${ACCENT} !important;}
      `}</style>
      <SiteHeader/>

      <div style={{maxWidth:680,margin:'0 auto',padding:'6rem 1.25rem 4rem'}}>

        {/* ── HEADER ── */}
        <div style={{marginBottom:'1.75rem'}}>
          <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:30,color:'#fff',letterSpacing:1}}>
            Olá, {perfil?.nome?.split(' ')[0]}! 👋
          </div>
          <div style={{fontSize:13,color:'#555',marginTop:3}}>Área do aluno</div>
        </div>

        {/* ── BANNER BLOQUEIO ── */}
        {estaBloqueado && (
          temCobrancaPendente ? (
            <div style={{background:'#150000',border:'1.5px solid #ff444455',borderRadius:14,padding:'1.25rem',marginBottom:'1.5rem',animation:'fadeIn .2s ease'}}>
              <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                <span style={{fontSize:22,flexShrink:0}}>🔒</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:18,color:'#ff6b6b',letterSpacing:1,marginBottom:6}}>CONTA BLOQUEADA — PAGAMENTO PENDENTE</div>
                  <div style={{fontSize:13,color:'#ffaaaa',lineHeight:1.6,marginBottom:'1rem'}}>{cliente.motivo_bloqueio||'Há uma cobrança pendente. Novos agendamentos estão suspensos.'}</div>
                  {cobrancasPendentes.map((c:any)=>(
                    <div key={c.id} style={{background:'#0a0000',border:'1px solid #ff444433',borderRadius:8,padding:'0.65rem 1rem',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{fontSize:12,color:'#ff9999',fontWeight:600}}>{c.motivo||'Multa pendente'}</div>
                      <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:18,color:'#ff6b6b'}}>R$ {Number(c.valor).toFixed(2).replace('.',',')}</div>
                    </div>
                  ))}
                  <button onClick={()=>router.push('/cadastrar-cartao')} style={{width:'100%',background:'#cc0000',color:'#fff',border:'none',borderRadius:10,padding:'0.75rem',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                    💳 Atualizar cartão e regularizar →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{background:'#120d00',border:'1.5px solid #ffaa0055',borderRadius:14,padding:'1.25rem',marginBottom:'1.5rem',animation:'fadeIn .2s ease'}}>
              <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                <span style={{fontSize:22,flexShrink:0,animation:'pulse 2s ease infinite'}}>⚠️</span>
                <div>
                  <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:18,color:AMARELO,letterSpacing:1,marginBottom:4}}>CONTA BLOQUEADA</div>
                  <div style={{fontSize:13,color:'#ffddaa',lineHeight:1.6,marginBottom:8}}>{cliente.motivo_bloqueio||'Sua conta está temporariamente bloqueada.'}</div>
                  <div style={{background:'#0a0700',border:`1px solid ${AMARELO}33`,borderRadius:8,padding:'0.6rem 0.85rem',fontSize:12,color:'#ffcc88'}}>
                    Compareça à recepção da sua unidade para regularizar.
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {/* ── BOTÕES DE AÇÃO ── */}
        {!estaBloqueado && (
          <div style={{marginBottom:'2rem'}}>
            <button onClick={()=>router.push('/agendar')} style={{width:'100%',background:ACCENT,color:'#fff',border:'none',borderRadius:12,padding:'0.9rem',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
              + Agendar Treino
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════
            SEÇÃO 1 — PRÓXIMOS TREINOS
        ══════════════════════════════════════════ */}
        <div style={{marginBottom:'2rem'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.85rem'}}>
            <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase'}}>📅 Próximos treinos</div>
            <div style={{fontSize:12,color:'#555'}}>{feedFuturo.length} agendamento{feedFuturo.length!==1?'s':''}</div>
          </div>

          {feedFuturo.length===0 ? (
            <div style={{background:'#111',border:'1px solid #1e1e1e',borderRadius:14,padding:'2rem',textAlign:'center'}}>
              <div style={{fontSize:28,marginBottom:8}}>🏋️</div>
              <div style={{fontSize:14,color:'#555'}}>Nenhum treino agendado</div>
              {temPlanoAtivo && !estaBloqueado && (
                <button onClick={()=>router.push('/agendar')} style={{marginTop:'1rem',background:ACCENT,color:'#fff',border:'none',borderRadius:10,padding:'0.6rem 1.25rem',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                  Agendar agora →
                </button>
              )}
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {feedFuturo.map(item => {
                const d = new Date(item.data+'T12:00:00')
                const podeCancelar = ['agendado','confirmado','reservado'].includes(item.status)
                const isClub = item.tipo==='club'
                const isProxMes = d.getMonth()!==agora.getMonth()||d.getFullYear()!==agora.getFullYear()
                const sc = statusConfig[item.status]||{label:item.status,cor:'#888'}
                const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
                return (
                  <div key={`${item.tipo}-${item.id}`} style={{background:'#111',border:'1px solid #1e1e1e',borderRadius:12,padding:'0.9rem 1rem',display:'flex',alignItems:'center',gap:'0.85rem'}}>
                    {/* Data */}
                    <div style={{flexShrink:0,textAlign:'center',width:42}}>
                      <div style={{fontSize:9,color:'#555',fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{dias[d.getDay()]}</div>
                      <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:26,color:'#fff',lineHeight:1}}>{d.getDate()}</div>
                      <div style={{fontSize:9,color:'#444',textTransform:'uppercase'}}>{d.toLocaleDateString('pt-BR',{month:'short'})}</div>
                    </div>

                    <div style={{width:1,height:40,background:'#222',flexShrink:0}}/>

                    {/* Info */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:3}}>
                        <span style={{fontSize:14,fontWeight:600,color:'#fff'}}>{item.horario}</span>
                        <span style={{fontSize:13,color:'#888'}}>· {item.unidadeNome}</span>
                      </div>
                      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                        {isClub && item.tipoAula && (
                          <span style={{fontSize:10,color:ACCENT,background:`${ACCENT}15`,padding:'1px 7px',borderRadius:20,fontWeight:600}}>{tipoAulaLabel(item.tipoAula)}</span>
                        )}
                        {isClub && item.posicao && (
                          <span style={{fontSize:10,color:VERDE,fontFamily:"'DM Mono', monospace",fontWeight:700,background:`${VERDE}15`,padding:'1px 7px',borderRadius:20}}>{item.posicao}</span>
                        )}
                        {item.tipoCredito && (()=>{ const {label,icon}=parsePlanoKey(item.tipoCredito); return (
                          <span style={{fontSize:10,color:'#777',background:'#1a1a1a',padding:'1px 7px',borderRadius:20,border:'1px solid #2a2a2a'}}>{icon} {label}</span>
                        )})()}
                        {isProxMes && (
                          <span style={{fontSize:10,color:AMARELO,background:`${AMARELO}15`,padding:'1px 7px',borderRadius:20}}>crédito {MESES[d.getMonth()]}</span>
                        )}
                      </div>
                    </div>

                    {/* Status + cancelar */}
                    <div style={{flexShrink:0,textAlign:'right'}}>
                      <div style={{fontSize:10,fontWeight:700,color:sc.cor,textTransform:'uppercase',marginBottom:4}}>{sc.label}</div>
                      {podeCancelar && (
                        <button onClick={()=>abrirModalCancelar(item)} style={{background:'transparent',border:'1px solid #2a2a2a',borderRadius:6,padding:'0.2rem 0.6rem',fontSize:10,color:'#666',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>Cancelar</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── FILA DE ESPERA ── */}
        {filas.length>0 && (
          <div style={{marginBottom:'2rem'}}>
            <div style={{fontSize:11,color:AMARELO,fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'0.85rem'}}>⏳ Fila de espera</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {filas.map(f => {
                const d = new Date(f.data+'T12:00:00')
                const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
                return (
                  <div key={f.id} style={{background:'#120d00',border:`1px solid ${AMARELO}33`,borderRadius:12,padding:'0.9rem 1rem',display:'flex',alignItems:'center',gap:'0.85rem'}}>
                    <div style={{flexShrink:0,textAlign:'center',width:42}}>
                      <div style={{fontSize:9,color:AMARELO,fontWeight:700,letterSpacing:1,textTransform:'uppercase',opacity:0.8}}>{dias[d.getDay()]}</div>
                      <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:26,color:AMARELO,lineHeight:1}}>{d.getDate()}</div>
                      <div style={{fontSize:9,color:AMARELO,textTransform:'uppercase',opacity:0.7}}>{d.toLocaleDateString('pt-BR',{month:'short'})}</div>
                    </div>
                    <div style={{width:1,height:40,background:`${AMARELO}33`,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,color:'#fff',marginBottom:2}}>{(f.horario||'').slice(0,5)} · {f.unidades?.nome||'Just CT'}</div>
                      <div style={{fontSize:11,color:AMARELO,opacity:0.8}}>Aguardando vaga — você será avisado</div>
                    </div>
                    <button onClick={()=>setModalSairFila(f)} style={{background:'transparent',border:`1px solid ${AMARELO}55`,borderRadius:8,padding:'0.3rem 0.75rem',fontSize:11,color:AMARELO,cursor:'pointer',fontFamily:"'DM Sans', sans-serif",flexShrink:0}}>Sair</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            SEÇÃO 2 — MEUS PLANOS & CRÉDITOS
        ══════════════════════════════════════════ */}
        <div style={{marginBottom:'2rem'}}>
          <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'0.85rem'}}>🏆 Meus planos & créditos</div>

          {Object.keys(saldoAtual).length===0 && clientePlanos.length===0 ? (
            <div style={{background:'#111',border:'1px solid #1e1e1e',borderRadius:14,padding:'1.5rem',textAlign:'center'}}>
              <div style={{fontSize:13,color:'#555'}}>Nenhum plano ativo no momento.</div>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {Object.entries(saldoAtual).map(([plano,info]:any) => {
                const {label,icon}=parsePlanoKey(plano)
                const restante=info.disponivel; const total=info.total
                const pct=total>0?Math.round((restante/total)*100):0
                const cor=restante===0?'#333':plano.startsWith('coach_ct_pro')?AMARELO:plano.startsWith('avulso')||plano.startsWith('credito')?CYAN:ACCENT
                const saldoProx=saldoProximo[plano]
                return (
                  <div key={plano} style={{background:'#111',border:`1px solid ${restante===0?'#1a1a1a':cor+'22'}`,borderRadius:12,padding:'1rem'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.65rem'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:16}}>{icon}</span>
                        <span style={{fontSize:13,fontWeight:600,color:restante===0?'#444':'#ddd'}}>{label}</span>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <span style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:22,color:restante===0?'#333':cor,lineHeight:1}}>{restante}</span>
                        <span style={{fontSize:12,color:'#444'}}> / {total}</span>
                      </div>
                    </div>
                    {/* Barra de progresso */}
                    <div style={{height:3,background:'#1a1a1a',borderRadius:2,overflow:'hidden',marginBottom:6}}>
                      <div style={{height:'100%',borderRadius:2,background:restante===0?'#222':cor,width:`${pct}%`,transition:'width .3s'}}/>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:11,color:'#444'}}>{restante===0?`Esgotado em ${nomeMesAtual}`:`${restante} restante${restante!==1?'s':''} em ${nomeMesAtual}`}</span>
                      {saldoProx?.disponivel>0 && <span style={{fontSize:11,color:'#666'}}>{saldoProx.disponivel} em {nomeMesProximo} →</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Botão comprar abaixo dos planos */}
          {(Object.keys(saldoAtual).length>0||clientePlanos.length>0) && (
            <div style={{display:'flex',gap:8,marginTop:10}}>
              <button onClick={()=>router.push('/comprar')} style={{flex:1,background:'transparent',color:'#aaa',border:'1px solid #222',borderRadius:10,padding:'0.6rem',fontSize:12,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                🛍️ Ver planos e pacotes
              </button>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════
            SEÇÃO 2B — ATIVAR PLANO DE APP PARCEIRO (visível)
        ══════════════════════════════════════════ */}
        <div style={{marginBottom:'2rem'}}>
          <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'0.85rem'}}>📲 Ativar plano de app parceiro</div>

          {/* Explicação */}
          <div style={{background:'#0d0d0d',border:'1px solid #1e1e1e',borderRadius:14,padding:'1.1rem 1.25rem',marginBottom:'1rem'}}>
            <p style={{fontSize:13,color:'#bbb',lineHeight:1.7,marginBottom:'0.75rem'}}>
              É cliente <strong style={{color:'#a78bfa'}}>Wellhub</strong> ou <strong style={{color:'#38bdf8'}}>TotalPass</strong>? Ative o plano da unidade onde quer treinar. Cada unidade tem seu próprio limite de treinos no mês, e você pode ter os dois apps ativos ao mesmo tempo, sem problema.
            </p>
            <div style={{background:'#0a0a0a',border:`1px solid ${AMARELO}22`,borderRadius:10,padding:'0.75rem 0.9rem',fontSize:12.5,color:'#ddd',lineHeight:1.6}}>
              💡 No <strong>Just CT</strong>, só precisa ativar se quiser agendar <strong>Coach CT</strong>. Para <strong>musculação livre</strong>, é só fazer o check-in direto na recepção da unidade.
            </div>
          </div>

          {/* Cards por unidade */}
          {gruposParceiros.length===0 ? (
            <div style={{background:'#111',border:'1px solid #1e1e1e',borderRadius:14,padding:'1.5rem',textAlign:'center',fontSize:13,color:'#555'}}>
              Nenhum plano parceiro disponível no momento.
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
              {gruposParceiros.map((grupo:any)=>(
                <div key={grupo.uid}>
                  <div style={{fontSize:11,color:'#666',fontWeight:700,letterSpacing:1,textTransform:'uppercase',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                    <span>{grupo.tipo==='club'?'🏢':'🏋️'}</span>{grupo.nome}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {grupo.planos.map((plano:any)=>{
                      const ativo=planoJaAtivo(plano.id)
                      const isWell=plano.tipo==='wellhub'
                      const cor=isWell?'#a78bfa':'#38bdf8'
                      const info=tierDoPlano(plano.tipo, grupo.nome)
                      const creditosTxt = info ? info.creditos : plano.creditos_mes
                      return (
                        <div key={plano.id} style={{background:ativo?'#111':'#0a0a0a',border:`1px solid ${ativo?cor+'44':'#222'}`,borderRadius:12,padding:'0.9rem 1rem',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                          <div style={{display:'flex',alignItems:'center',gap:11,minWidth:0}}>
                            <span style={{fontSize:20,flexShrink:0}}>{isWell?'💜':'🔵'}</span>
                            <div style={{minWidth:0}}>
                              <div style={{fontSize:14,fontWeight:600,color:ativo?cor:'#eee'}}>{isWell?'Wellhub':'TotalPass'}</div>
                              <div style={{fontSize:11.5,color:'#888',marginTop:2,lineHeight:1.4}}>
                                {info ? <>a partir do <strong style={{color:'#aaa'}}>{info.tier}</strong> · {creditosTxt} treinos/mês</> : <>{creditosTxt} treinos/mês</>}
                              </div>
                            </div>
                          </div>
                          {ativo?(
                            <div style={{display:'flex',alignItems:'center',gap:5,background:'#0a1a0a',borderRadius:20,padding:'0.35rem 0.85rem',border:`1px solid ${cor}44`,flexShrink:0}}>
                              <div style={{width:5,height:5,borderRadius:'50%',background:cor}}/>
                              <span style={{fontSize:11,fontWeight:700,color:cor}}>ATIVO</span>
                            </div>
                          ):(
                            <button onClick={()=>abrirModalAtivar(plano)} style={{background:isWell?'linear-gradient(135deg,#7c3aed,#a855f7)':'linear-gradient(135deg,#0369a1,#0ea5e9)',color:'#fff',border:'none',borderRadius:20,padding:'0.45rem 1.15rem',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans', sans-serif",flexShrink:0}}>
                              Ativar →
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════
            SEÇÃO 3 — HISTÓRICO DE TREINOS
        ══════════════════════════════════════════ */}
        {feedHistorico.length>0 && (
          <div style={{marginBottom:'2rem'}}>
            <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'0.85rem'}}>🕐 Histórico de treinos</div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {historicoExibido.map(item => {
                const d = new Date(item.data+'T12:00:00')
                const sc=statusConfig[item.status]||{label:item.status,cor:'#888'}
                const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
                const isClub=item.tipo==='club'
                return (
                  <div key={`h-${item.tipo}-${item.id}`} style={{background:'#0d0d0d',border:'1px solid #181818',borderRadius:10,padding:'0.75rem 1rem',display:'flex',alignItems:'center',gap:'0.75rem'}}>
                    <div style={{flexShrink:0,textAlign:'center',width:36}}>
                      <div style={{fontSize:8,color:'#444',fontWeight:700,textTransform:'uppercase'}}>{dias[d.getDay()]}</div>
                      <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:20,color:'#666',lineHeight:1}}>{d.getDate()}</div>
                      <div style={{fontSize:8,color:'#333',textTransform:'uppercase'}}>{d.toLocaleDateString('pt-BR',{month:'short'})}</div>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,color:'#888',fontWeight:500}}>{item.horario} · {item.unidadeNome}</div>
                      {isClub&&item.tipoAula&&<div style={{fontSize:11,color:'#555',marginTop:1}}>{tipoAulaLabel(item.tipoAula)}</div>}
                    </div>
                    <div style={{fontSize:10,fontWeight:700,color:sc.cor,textTransform:'uppercase',flexShrink:0}}>
                      {item.status==='realizado'?'✓':item.status==='falta'?'✗':''} {sc.label}
                    </div>
                  </div>
                )
              })}
            </div>
            {feedHistorico.length>5 && (
              <button onClick={()=>setVerTodosHistorico(!verTodosHistorico)} style={{width:'100%',marginTop:8,background:'transparent',border:'1px solid #1e1e1e',borderRadius:10,padding:'0.6rem',fontSize:12,color:'#555',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                {verTodosHistorico?'Ver menos':'Ver todos os treinos'}
              </button>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            SEÇÃO 4 — COMPRAS RECENTES
        ══════════════════════════════════════════ */}
        {compras.length>0 && (
          <div style={{marginBottom:'2rem'}}>
            <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'0.85rem'}}>🛒 Compras recentes</div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {compras.map(c=>(
                <div key={c.id} style={{background:'#0d0d0d',border:'1px solid #181818',borderRadius:10,padding:'0.75rem 1rem',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'1rem'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,color:'#ccc',fontWeight:500,marginBottom:2}}>{c.produtos?.nome||'Produto'}</div>
                    <div style={{fontSize:11,color:'#444'}}>{formatarData(c.vendido_em)} · {labelPagamento(c.forma_pagamento)}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:16,color:'#888'}}>{formatarValor(c.valor_total)}</div>
                    <div style={{fontSize:10,color:VERDE,marginTop:2,fontWeight:600}}>✓ Pago</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            SEÇÃO 5 — MINHA CONTA
        ══════════════════════════════════════════ */}
        <div style={{background:'#0d0d0d',border:'1px solid #181818',borderRadius:14,padding:'1.25rem',marginBottom:'2rem'}}>
          <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'1rem'}}>👤 Minha conta</div>
          {[
            {label:'Nome',    value:cliente?.nome},
            {label:'Email',   value:cliente?.email||'—'},
            {label:'Telefone',value:cliente?.telefone||'—'},
          ].map((item,i,arr)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'0.5rem 0',borderBottom:'1px solid #181818'}}>
              <span style={{fontSize:13,color:'#444'}}>{item.label}</span>
              <span style={{fontSize:13,color:'#888'}}>{item.value}</span>
            </div>
          ))}

          {/* Gênero — libera aulas exclusivas (ex: Lift for Girls) */}
          <div style={{padding:'0.75rem 0',borderBottom:'1px solid #181818'}}>
            <div style={{fontSize:13,color:'#444',marginBottom:8}}>Gênero</div>
            <div style={{display:'flex',gap:8}}>
              {([['F','Feminino'],['M','Masculino']] as const).map(([val,label])=>{
                const ativo = cliente?.sexo === val
                return (
                  <button key={val} onClick={()=>salvarGenero(val)} style={{flex:1,background:ativo?`${ACCENT}18`:'transparent',border:`1px solid ${ativo?ACCENT:'#2a2a2a'}`,color:ativo?ACCENT:'#888',borderRadius:10,padding:'0.6rem',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans', sans-serif",transition:'all .15s'}}>
                    {label}
                  </button>
                )
              })}
            </div>
            <div style={{fontSize:11,color:'#555',marginTop:6,lineHeight:1.5}}>Necessário para aulas exclusivas, como a Lift for Girls.</div>
          </div>

          <button onClick={abrirModalSenha} style={{width:'100%',marginTop:'1rem',background:'transparent',border:`1px solid ${ACCENT}44`,borderRadius:10,padding:'0.7rem',fontSize:13,color:ACCENT,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
            🔑 Alterar senha
          </button>
        </div>

        <div style={{textAlign:'center',paddingBottom:'3rem'}}>
          <span onClick={sair} style={{fontSize:13,color:'#333',cursor:'pointer',textDecoration:'underline'}}
            onMouseEnter={e=>(e.currentTarget.style.color='#666')}
            onMouseLeave={e=>(e.currentTarget.style.color='#333')}>
            Sair da conta
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MODAL — ALTERAR SENHA
      ══════════════════════════════════════════ */}
      {modalSenha && (
        <div style={{position:'fixed',inset:0,background:'#000000dd',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#111',border:'1px solid #333',borderRadius:20,width:'100%',maxWidth:400,padding:'1.5rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem'}}>
              <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:22,color:'#fff',letterSpacing:1}}>ALTERAR SENHA</div>
              <button onClick={()=>setModalSenha(false)} style={{background:'transparent',border:'none',color:'#555',fontSize:20,cursor:'pointer'}}>✕</button>
            </div>

            {senhaSalva ? (
              <div style={{textAlign:'center',padding:'1rem 0'}}>
                <div style={{fontSize:40,marginBottom:'1rem'}}>✅</div>
                <div style={{fontSize:16,fontWeight:600,color:'#fff',marginBottom:6}}>Senha alterada!</div>
                <div style={{fontSize:13,color:'#888',marginBottom:'1.5rem',lineHeight:1.6}}>Sua nova senha já está valendo. Use ela no próximo login.</div>
                <button onClick={()=>setModalSenha(false)} style={{width:'100%',background:VERDE,color:'#000',border:'none',borderRadius:10,padding:'0.85rem',fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <div style={{marginBottom:'1rem'}}>
                  <label style={{fontSize:12,color:'#555',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Nova senha</label>
                  <input type="password" placeholder="Mínimo 6 caracteres" value={novaSenha}
                    onChange={e=>setNovaSenha(e.target.value)}
                    style={{width:'100%',background:'#080808',border:'1px solid #333',borderRadius:10,padding:'0.75rem 1rem',color:'#fff',fontSize:14,fontFamily:"'DM Sans', sans-serif"}}/>
                </div>
                <div style={{marginBottom:'1.25rem'}}>
                  <label style={{fontSize:12,color:'#555',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Confirmar nova senha</label>
                  <input type="password" placeholder="Digite novamente" value={confirmaSenha}
                    onChange={e=>setConfirmaSenha(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter') salvarNovaSenha() }}
                    style={{width:'100%',background:'#080808',border:'1px solid #333',borderRadius:10,padding:'0.75rem 1rem',color:'#fff',fontSize:14,fontFamily:"'DM Sans', sans-serif"}}/>
                </div>
                {erroSenha && <div style={{background:'#ff2d9b15',border:'1px solid #ff2d9b44',borderRadius:8,padding:'0.6rem 1rem',fontSize:13,color:ACCENT,marginBottom:'1rem'}}>{erroSenha}</div>}
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setModalSenha(false)} style={{flex:1,background:'transparent',border:'1px solid #333',borderRadius:10,padding:'0.85rem',color:'#888',fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>Cancelar</button>
                  <button onClick={salvarNovaSenha} disabled={salvandoSenha} style={{flex:2,background:ACCENT,color:'#fff',border:'none',borderRadius:10,padding:'0.85rem',fontWeight:600,fontSize:15,cursor:salvandoSenha?'default':'pointer',fontFamily:"'DM Sans', sans-serif",opacity:salvandoSenha?0.7:1}}>
                    {salvandoSenha?'Salvando...':'Salvar nova senha'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL CONTRATO */}
      {modalAtivar && (
        <div style={{position:'fixed',inset:0,background:'#000000dd',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#111',border:'1px solid #333',borderRadius:20,width:'100%',maxWidth:480,maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'1.25rem 1.5rem 1rem',borderBottom:'1px solid #222',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                <span style={{fontSize:22}}>{modalAtivar.plano.tipo==='wellhub'?'💜':'🔵'}</span>
                <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:22,color:'#fff',letterSpacing:1}}>
                  ATIVAR {modalAtivar.plano.tipo==='wellhub'?'WELLHUB':'TOTALPASS'}
                </div>
              </div>
              <div style={{fontSize:13,color:'#555'}}>{modalAtivar.plano.unidades?.nome} · {modalAtivar.plano.creditos_mes} treinos/mês</div>
            </div>
            <div ref={contratoRef} className="contrato-scroll" style={{flex:1,overflow:'auto',padding:'1.25rem 1.5rem',fontSize:12,color:'#bbb',lineHeight:1.8,whiteSpace:'pre-wrap',fontFamily:"'DM Mono', monospace",letterSpacing:0.3}}>
              {CONTRATO_TEXTO}
            </div>
            <div style={{padding:'1rem 1.5rem 1.25rem',borderTop:'1px solid #222',flexShrink:0,background:'#0d0d0d'}}>
              <label style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',marginBottom:'1rem'}} onClick={()=>setContratoAceito(!contratoAceito)}>
                <div style={{width:20,height:20,borderRadius:5,flexShrink:0,marginTop:1,border:`2px solid ${contratoAceito?VERDE:'#555'}`,background:contratoAceito?VERDE:'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}}>
                  {contratoAceito&&<span style={{fontSize:12,color:'#000',fontWeight:900,lineHeight:1}}>✓</span>}
                </div>
                <span style={{fontSize:13,color:'#ccc',lineHeight:1.5}}>Li e concordo com os Termos de Uso</span>
              </label>
              {erroAtivar&&<div style={{background:'#1a0a0a',border:`1px solid ${ACCENT}44`,borderRadius:8,padding:'0.6rem 1rem',fontSize:12,color:ACCENT,marginBottom:'0.75rem'}}>{erroAtivar}</div>}
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setModalAtivar(null)} style={{flex:1,background:'transparent',border:'1px solid #444',borderRadius:10,padding:'0.85rem',color:'#bbb',fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>Voltar</button>
                <button onClick={confirmarAtivacao} disabled={!contratoAceito||ativando} style={{flex:2,background:contratoAceito?`linear-gradient(135deg,${VERDE},#00b37e)`:'#1a1a1a',color:contratoAceito?'#000':'#444',border:'none',borderRadius:10,padding:'0.85rem',fontWeight:700,fontSize:15,cursor:contratoAceito&&!ativando?'pointer':'default',fontFamily:"'DM Sans', sans-serif",transition:'all .2s'}}>
                  {ativando?'Ativando...':'✓ Aceitar e Ativar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUCESSO */}
      {modalSucesso && (()=>{
        const plano=modalSucesso.plano
        const isClub=plano?.unidades?.tipo==='club'
        const isWell=plano?.tipo==='wellhub'
        const temCartao=cliente?.pagarme_card_id&&cliente?.pagarme_card_last4
        return (
          <div style={{position:'fixed',inset:0,background:'#000000ee',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
            <div style={{background:'#111',border:'1px solid #333',borderRadius:20,width:'100%',maxWidth:400,padding:'1.75rem',display:'flex',flexDirection:'column',gap:'1rem'}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:44,marginBottom:8}}>🎉</div>
                <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:24,color:VERDE,letterSpacing:1}}>PLANO ATIVADO!</div>
                <div style={{fontSize:13,color:'#777',marginTop:4}}>{isWell?'💜 Wellhub':'🔵 TotalPass'} · {plano?.unidades?.nome}</div>
              </div>
              <div style={{background:'#0a1a0a',border:`1px solid ${VERDE}33`,borderRadius:12,padding:'1rem',textAlign:'center'}}>
                <div style={{fontSize:11,color:VERDE,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',marginBottom:4}}>Seu direito mensal</div>
                <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:40,color:'#fff',lineHeight:1}}>{plano?.creditos_mes}</div>
                <div style={{fontSize:12,color:VERDE,fontWeight:600,marginTop:2}}>treinos por mês</div>
              </div>
              <div style={{background:'#120d00',border:`1px solid ${AMARELO}33`,borderRadius:10,padding:'0.85rem',fontSize:12,color:'#ccc',lineHeight:1.7}}>
                ⚠️ Cancele com <strong>12h de antecedência</strong> para recuperar o crédito. Falta sem aviso gera <strong>bloqueio</strong>{isClub?' e multa de R$49,90':''}.
              </div>
              {!temCartao&&(
                <div style={{background:'#0d000a',border:`1px solid ${ACCENT}33`,borderRadius:10,padding:'0.85rem',fontSize:12,color:'#ccc',lineHeight:1.6}}>
                  💳 <strong style={{color:'#fff'}}>Cadastre um cartão</strong> para poder confirmar seus agendamentos. Nada será cobrado agora.
                </div>
              )}
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {!temCartao?(
                  <button onClick={()=>{setModalSucesso(null);router.push('/cadastrar-cartao')}} style={{width:'100%',background:ACCENT,color:'#fff',border:'none',borderRadius:12,padding:'0.85rem',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                    💳 Cadastrar cartão →
                  </button>
                ):(
                  <button onClick={()=>{setModalSucesso(null);router.push(isClub?'/aulas':'/agendar')}} style={{width:'100%',background:VERDE,color:'#000',border:'none',borderRadius:12,padding:'0.85rem',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                    {isClub?'Ver aulas →':'Agendar treino →'}
                  </button>
                )}
                <button onClick={()=>setModalSucesso(null)} style={{width:'100%',background:'transparent',color:'#555',border:'1px solid #2a2a2a',borderRadius:12,padding:'0.75rem',fontSize:13,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* MODAL CANCELAR */}
      {modalCancelar&&(
        <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#111',border:'1px solid #333',borderRadius:20,width:'100%',maxWidth:420,padding:'1.5rem'}}>
            <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:20,color:'#fff',marginBottom:4}}>CANCELAR AGENDAMENTO</div>
            <div style={{fontSize:13,color:'#555',marginBottom:'1.25rem',textTransform:'capitalize'}}>
              {new Date(modalCancelar.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} · {modalCancelar.horario}
              {modalCancelar.tipo==='club'&&modalCancelar.tipoAula&&<span style={{marginLeft:6,color:ACCENT,fontSize:12}}>· {tipoAulaLabel(modalCancelar.tipoAula)}</span>}
            </div>
            <div style={{background:modalCancelar.pode?'#0a1a0a':'#150a0a',border:`1px solid ${modalCancelar.pode?'#aaff0033':'#ff444433'}`,borderRadius:10,padding:'0.85rem',marginBottom:'1.25rem',fontSize:13,color:modalCancelar.pode?'#cfc':'#ffaaaa',lineHeight:1.6}}>
              {modalCancelar.pode?'✅ ':'❌ '}{modalCancelar.aviso}
            </div>
            {erroCancelar&&<div style={{background:'#ff2d9b15',border:'1px solid #ff2d9b44',borderRadius:8,padding:'0.6rem 1rem',fontSize:13,color:ACCENT,marginBottom:'1rem'}}>{erroCancelar}</div>}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setModalCancelar(null)} style={{flex:1,background:'transparent',border:'1px solid #333',borderRadius:10,padding:'0.85rem',color:'#888',fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>Voltar</button>
              {modalCancelar.pode&&(
                <button onClick={confirmarCancelamento} disabled={cancelando} style={{flex:2,background:'#cc2222',color:'#fff',border:'none',borderRadius:10,padding:'0.85rem',fontWeight:600,fontSize:14,cursor:cancelando?'default':'pointer',fontFamily:"'DM Sans', sans-serif",opacity:cancelando?0.7:1}}>
                  {cancelando?'Cancelando...':'Confirmar cancelamento'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL SAIR FILA */}
      {modalSairFila&&(
        <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#111',border:`1px solid ${AMARELO}44`,borderRadius:20,width:'100%',maxWidth:400,padding:'1.5rem'}}>
            <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:20,color:AMARELO,marginBottom:4}}>SAIR DA FILA</div>
            <div style={{fontSize:13,color:'#555',marginBottom:'1.25rem',textTransform:'capitalize'}}>
              {new Date(modalSairFila.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} · {(modalSairFila.horario||'').slice(0,5)}
            </div>
            <div style={{background:'#120d00',border:`1px solid ${AMARELO}33`,borderRadius:10,padding:'0.85rem',marginBottom:'1.25rem',fontSize:13,color:'#ddd',lineHeight:1.6}}>
              Você ainda não foi confirmado. Pode sair sem multa ou desconto de crédito.
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setModalSairFila(null)} style={{flex:1,background:'transparent',border:'1px solid #333',borderRadius:10,padding:'0.85rem',color:'#888',fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>Voltar</button>
              <button onClick={sairDaFila} disabled={saindoFila} style={{flex:2,background:AMARELO,color:'#000',border:'none',borderRadius:10,padding:'0.85rem',fontWeight:700,fontSize:14,cursor:saindoFila?'default':'pointer',fontFamily:"'DM Sans', sans-serif",opacity:saindoFila?0.7:1}}>
                {saindoFila?'Saindo...':'Confirmar saída'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
