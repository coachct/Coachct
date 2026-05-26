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

export default function MinhaContaPage() {
  const { user, perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [cliente,           setCliente]           = useState<any>(null)
  const [agendamentos,      setAgendamentos]      = useState<any[]>([])
  const [clubReservas,      setClubReservas]      = useState<any[]>([])
  const [filas,             setFilas]             = useState<any[]>([])
  const [saldoAtual,        setSaldoAtual]        = useState<Record<string,any>>({})
  const [saldoProximo,      setSaldoProximo]      = useState<Record<string,any>>({})
  const [clientePlanos,     setClientePlanos]     = useState<any[]>([])
  const [compras,           setCompras]           = useState<any[]>([])
  const [planosDisponiveis, setPlanosDisponiveis] = useState<any[]>([])
  const [loadingData,       setLoadingData]       = useState(true)

  // Modais existentes
  const [modalCancelar, setModalCancelar] = useState<any>(null)
  const [cancelando,    setCancelando]    = useState(false)
  const [erroCancelar,  setErroCancelar]  = useState('')
  const [modalSairFila, setModalSairFila] = useState<any>(null)
  const [saindoFila,    setSaindoFila]    = useState(false)

  // Modal App Parceiros / Contrato
  const [modalAtivar,    setModalAtivar]    = useState<any>(null)
  const [contratoAceito, setContratoAceito] = useState(false)
  const [ativando,       setAtivando]       = useState(false)
  const [erroAtivar,     setErroAtivar]     = useState('')
  const [unidadeSel,     setUnidadeSel]     = useState<string|null>(null)
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

    const hoje = dataLocalStr(agora)
    const [
      { data: ags },
      { data: filasData },
      { data: cliPlanos },
      { data: vendasData },
      { data: crData },
      { data: planosData },
    ] = await Promise.all([
      supabase.from('agendamentos').select('*, unidades(nome)')
        .eq('cliente_id', cli.id).gte('data', hoje)
        .not('status','in','("cancelado")').order('data').order('horario').limit(30),
      supabase.from('fila_espera').select('*, unidades(nome)')
        .eq('cliente_id', cli.id).eq('status','aguardando').gte('data', hoje)
        .order('data').order('horario'),
      supabase.from('cliente_planos').select('*, planos_disponiveis(id, nome, tipo, unidade_id)')
        .eq('cliente_id', cli.id).eq('ativo', true),
      supabase.from('vendas').select('*, produtos(nome, subtipo, dias_validade)')
        .eq('cliente_id', cli.id).order('vendido_em',{ascending:false}).limit(10),
      supabase.from('club_reservas').select(`
        id, status, tipo_credito, posicao, cancelado_em,
        club_ocorrencias(id, data, club_aulas(tipo, horario, unidade_id, unidades(nome)))
      `).eq('cliente_id', cli.id).not('status','in','("cancelado")'),
      supabase.from('planos_disponiveis')
        .select('id, nome, tipo, creditos_mes, unidade_id, unidades(id, nome, tipo)')
        .in('tipo', ['wellhub', 'totalpass'])
        .eq('ativo', true)
        .order('tipo').order('unidade_id'),
    ])

    setAgendamentos(ags||[])
    setFilas(filasData||[])
    setClientePlanos(cliPlanos||[])
    setCompras(vendasData||[])
    setPlanosDisponiveis(planosData||[])

    const crFuturas = (crData||[]).filter((cr:any) => (cr.club_ocorrencias?.data||'') >= hoje)
    setClubReservas(crFuturas)
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
    const ma:Record<string,any>={};  sa.forEach(r=>Object.assign(ma,r.data||{})); setSaldoAtual(ma)
    const mp:Record<string,any>={}; sp.forEach(r=>Object.assign(mp,r.data||{})); setSaldoProximo(mp)
  }

  // Feed unificado CT + Club ordenado por data/hora
  const feedUnificado = [
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

  // ── App Parceiros helpers ─────────────────────────────────────────────────
  function planoJaAtivo(planoId: string): boolean {
    return clientePlanos.some(cp => cp.plano_id === planoId && cp.ativo)
  }

  function abrirModalAtivar(plano: any) {
    setModalAtivar({ plano })
    setContratoAceito(false)
    setErroAtivar('')
  }

  async function confirmarAtivacao() {
    if (!contratoAceito || !modalAtivar || ativando) return
    setAtivando(true)
    setErroAtivar('')
    try {
      const { error } = await supabase.from('cliente_planos').insert({
        cliente_id: cliente.id,
        plano_id: modalAtivar.plano.id,
        ativo: true,
        contrato_aceito_em: new Date().toISOString(),
        aceite_pendente: false,
        inicio: dataLocalStr(new Date()),
      })
      if (error) throw error
      setModalAtivar(null)
      await loadDados()
    } catch {
      setErroAtivar('Erro ao ativar plano. Tente novamente ou fale com a recepção.')
    } finally {
      setAtivando(false)
    }
  }

  // ── Cancelamento ──────────────────────────────────────────────────────────
  async function abrirModalCancelar(item: typeof feedUnificado[0]) {
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
      else aviso = 'Há fila de espera. Você pode cancelar e o crédito será devolvido.'
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
  function formatarData(d:string)  { return new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}) }
  function labelPagamento(f:string) { return f==='cartao_credito'?'💳 Cartão':f==='pix'?'⚡ PIX':f==='dinheiro'?'💵 Dinheiro':f }

  if (loading||loadingData) return (
    <div style={{minHeight:'100vh',background:'#080808',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:32,height:32,border:`4px solid ${ACCENT}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const temPlanoAtivo     = clientePlanos.length>0
  const todoSaldoEsgotado = temPlanoAtivo&&Object.keys(saldoAtual).length>0&&Object.values(saldoAtual).every((s:any)=>s.disponivel===0)
  const temSaldoProximo   = Object.values(saldoProximo).some((s:any)=>s.disponivel>0)
  const planosProxLabel   = Object.entries(saldoProximo).filter(([,s]:any)=>s.disponivel>0).map(([p,s]:any)=>`${s.disponivel} ${parsePlanoKey(p).label}`).join(', ')

  // Agrupa planos por unidade
  const unidadesComPlanos = Object.values(
    planosDisponiveis.reduce((acc: Record<string, any>, p: any) => {
      if (!acc[p.unidade_id]) acc[p.unidade_id] = { ...p.unidades, id: p.unidade_id, planos: [] }
      acc[p.unidade_id].planos.push(p)
      return acc
    }, {})
  ) as any[]

  const planosUnidadeSel = unidadeSel
    ? planosDisponiveis.filter(p => p.unidade_id === unidadeSel)
    : []

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:'100vh',background:'#080808',fontFamily:"'DM Sans', sans-serif",color:'#f0f0f0'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        .btn-acao:hover{transform:translateY(-1px);}
        .parceiro-card:hover{border-color:#444!important;}
        .contrato-scroll::-webkit-scrollbar{width:4px}
        .contrato-scroll::-webkit-scrollbar-track{background:#1a1a1a}
        .contrato-scroll::-webkit-scrollbar-thumb{background:#444;border-radius:2px}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <SiteHeader/>
      <div style={{maxWidth:700,margin:'0 auto',padding:'6rem 1.5rem 2rem'}}>

        {/* Header */}
        <div style={{marginBottom:'1.5rem'}}>
          <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:32,color:'#fff',letterSpacing:1}}>Olá, {perfil?.nome?.split(' ')[0]}! 👋</div>
          <div style={{fontSize:14,color:'#aaa',marginTop:4}}>Bem-vindo à sua área do aluno</div>
        </div>

        {/* Botões de ação (só se tiver plano) */}
        {temPlanoAtivo && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:10,marginBottom:'1.5rem'}}>
              <button className="btn-acao" onClick={()=>router.push('/agendar')} style={{background:ACCENT,color:'#fff',border:'none',borderRadius:12,padding:'0.95rem',fontWeight:600,fontSize:15,cursor:'pointer',fontFamily:"'DM Sans', sans-serif",transition:'transform .15s'}}>+ Agendar Treino</button>
              <button className="btn-acao" onClick={()=>router.push('/aulas')} style={{background:'transparent',color:'#fff',border:`1.5px solid ${ACCENT}66`,borderRadius:12,padding:'0.95rem',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:"'DM Sans', sans-serif",transition:'transform .15s'}}>Ver Aulas</button>
            </div>

            {/* Saldo de créditos */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
              {Object.entries(saldoAtual).map(([plano,info]:any) => {
                const restante=info.disponivel; const {label,icon}=parsePlanoKey(plano)
                const cor=plano.startsWith('coach_ct_pro')?AMARELO:plano.startsWith('avulso')||plano.startsWith('credito')?CYAN:ACCENT
                return (
                  <div key={plano} style={{background:'#111',border:`1px solid ${restante===0?'#333':cor+'33'}`,borderRadius:16,padding:'1.25rem'}}>
                    <div style={{fontSize:11,color:restante===0?'#555':cor,fontWeight:700,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>{icon} {label}</div>
                    <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:48,color:restante===0?'#333':'#fff',lineHeight:1}}>{restante}</div>
                    <div style={{fontSize:12,color:'#666',marginTop:4}}>de {info.total} sessões em {nomeMesAtual}</div>
                    {restante===0 && <div style={{fontSize:11,color:'#ff6b6b',marginTop:6}}>Esgotado neste mês</div>}
                  </div>
                )
              })}
              <div style={{background:'#111',border:'1px solid #333',borderRadius:16,padding:'1.25rem'}}>
                <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:1,textTransform:'uppercase',marginBottom:8}}>Próximos treinos</div>
                <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:48,color:'#fff',lineHeight:1}}>{feedUnificado.length}</div>
                <div style={{fontSize:12,color:'#666',marginTop:4}}>agendamentos ativos</div>
              </div>
            </div>

            {todoSaldoEsgotado && temSaldoProximo && (
              <div style={{background:'#0a1a0a',border:'1px solid #aaff0033',borderRadius:12,padding:'1rem 1.25rem',marginBottom:'1rem'}}>
                <div style={{fontSize:13,color:'#aaff88',fontWeight:600,marginBottom:4}}>✅ Você usou todas as sessões de {nomeMesAtual}</div>
                <div style={{fontSize:13,color:'#bbb',lineHeight:1.6}}>Créditos para <strong style={{color:'#fff'}}>{nomeMesProximo}</strong>: <strong style={{color:'#fff'}}>{planosProxLabel}</strong>.</div>
              </div>
            )}
          </>
        )}

        {/* ── APP PARCEIROS ──────────────────────────────────────────────── */}
        <div style={{background:'#0c0c0c',border:'1px solid #222',borderRadius:16,padding:'1.25rem',marginBottom:'1.5rem'}}>

          {/* Header */}
          <div style={{marginBottom:'1.25rem'}}>
            <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:4}}>Planos & Parceiros</div>
            <div style={{fontSize:15,color:'#e0e0e0',fontWeight:500,lineHeight:1.5}}>
              Como você quer treinar?
            </div>
            <div style={{fontSize:12,color:'#555',marginTop:4}}>Ative um app parceiro ou conheça nossos planos exclusivos</div>
          </div>

          {/* Card Nossos Planos */}
          <button
            onClick={() => router.push('/comprar')}
            className="parceiro-card"
            style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              background:'linear-gradient(135deg,#1a0010,#0d0008)',
              border:`1.5px solid ${ACCENT}44`,
              borderRadius:12, padding:'0.85rem 1rem',
              cursor:'pointer', textAlign:'left', width:'100%',
              fontFamily:"'DM Sans', sans-serif",
              marginBottom:12,
              transition:'all .15s',
            }}
          >
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{
                width:40,height:40,borderRadius:10,
                background:`${ACCENT}18`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:20,flexShrink:0,
                border:`1px solid ${ACCENT}33`,
              }}>🏆</div>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:'#fff'}}>Nossos Planos</div>
                <div style={{fontSize:11,color:'#777',marginTop:2}}>Coach CT Pro · Avulso · Pacotes exclusivos</div>
              </div>
            </div>
            <div style={{fontSize:16,color:ACCENT}}>›</div>
          </button>

          {/* Divisor */}
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{flex:1,height:1,background:'#1e1e1e'}}/>
            <span style={{fontSize:11,color:'#444',fontWeight:600,letterSpacing:1}}>OU ATIVE SEU APP PARCEIRO</span>
            <div style={{flex:1,height:1,background:'#1e1e1e'}}/>
          </div>

          {/* Subtítulo unidades */}
          <div style={{fontSize:13,color:'#888',marginBottom:10}}>Onde você gostaria de treinar?</div>

          {/* Cards de unidade com painel inline */}
          {unidadesComPlanos.length === 0 ? (
            <div style={{textAlign:'center',padding:'1.5rem',color:'#444',fontSize:13}}>
              Nenhum plano parceiro disponível no momento.
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {unidadesComPlanos.map((unidade: any) => {
                const isClub  = unidade.tipo === 'club'
                const isSel   = unidadeSel === unidade.id
                const temAtivoNessa = unidade.planos?.some((p: any) => planoJaAtivo(p.id))
                const planosDestaUnidade = planosDisponiveis.filter(p => p.unidade_id === unidade.id)
                return (
                  <div key={unidade.id} style={{display:'flex',flexDirection:'column',gap:0}}>
                    {/* Card da unidade */}
                    <button
                      onClick={() => setUnidadeSel(isSel ? null : unidade.id)}
                      className="parceiro-card"
                      style={{
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        background: isSel ? '#181018' : '#111',
                        border: `1.5px solid ${isSel ? ACCENT+'88' : '#2a2a2a'}`,
                        borderRadius: isSel ? '12px 12px 0 0' : '12px',
                        padding:'0.85rem 1rem',
                        cursor:'pointer', textAlign:'left', width:'100%',
                        fontFamily:"'DM Sans', sans-serif",
                        transition:'all .15s',
                      }}
                    >
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <div style={{
                          width:40,height:40,borderRadius:10,
                          background: isSel ? `${ACCENT}22` : '#1a1a1a',
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:20,flexShrink:0,
                          border:`1px solid ${isSel ? ACCENT+'44' : '#2a2a2a'}`,
                          transition:'all .15s',
                        }}>
                          {isClub ? '🏢' : '🏋️'}
                        </div>
                        <div>
                          <div style={{fontSize:15,fontWeight:600,color:'#fff'}}>{unidade.nome}</div>
                          <div style={{fontSize:11,color:'#555',marginTop:2}}>
                            {isClub ? 'JustClub' : 'Just CT'} · Wellhub & TotalPass disponíveis
                          </div>
                        </div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                        {temAtivoNessa && (
                          <div style={{display:'flex',alignItems:'center',gap:4,background:'#0a1a0a',borderRadius:20,padding:'0.2rem 0.6rem'}}>
                            <div style={{width:5,height:5,borderRadius:'50%',background:VERDE}}/>
                            <span style={{fontSize:10,fontWeight:700,color:VERDE}}>ATIVO</span>
                          </div>
                        )}
                        <div style={{
                          fontSize:16,color: isSel ? ACCENT : '#444',
                          transition:'transform .2s, color .15s',
                          transform: isSel ? 'rotate(90deg)' : 'rotate(0deg)',
                        }}>›</div>
                      </div>
                    </button>

                    {/* Painel de apps — aparece INLINE logo abaixo desta unidade */}
                    {isSel && planosDestaUnidade.length > 0 && (
                      <div style={{
                        background:'#130010',
                        border:`1.5px solid ${ACCENT}55`,
                        borderTop:'none',
                        borderRadius:'0 0 12px 12px',
                        padding:'0.85rem',
                        animation:'fadeIn .18s ease',
                      }}>
                        {/* Aviso informativo para o CT */}
                        {!isClub && (
                          <div style={{
                            background:'#0d0d0d',border:'1px solid #2a2a2a',
                            borderRadius:8,padding:'0.65rem 0.85rem',
                            marginBottom:10,
                            display:'flex',gap:8,alignItems:'flex-start',
                          }}>
                            <span style={{fontSize:14,flexShrink:0,marginTop:1}}>ℹ️</span>
                            <div style={{fontSize:12,color:'#999',lineHeight:1.6}}>
                              Os créditos abaixo são exclusivos para <strong style={{color:'#fff'}}>sessões com coach</strong>. A <strong style={{color:'#fff'}}>musculação livre</strong> não requer agendamento — é só aparecer!
                            </div>
                          </div>
                        )}
                        <div style={{fontSize:10,color:ACCENT,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',marginBottom:8,paddingLeft:4}}>
                          Escolha seu app parceiro
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:6}}>
                          {planosDestaUnidade.map((plano: any) => {
                            const ativo    = planoJaAtivo(plano.id)
                            const isWell   = plano.tipo === 'wellhub'
                            const cor      = isWell ? '#a78bfa' : '#38bdf8'
                            const corBg    = isWell ? '#2d1b69' : '#0c2340'
                            const gradiente = isWell
                              ? 'linear-gradient(135deg,#7c3aed,#a855f7)'
                              : 'linear-gradient(135deg,#0369a1,#0ea5e9)'
                            return (
                              <div key={plano.id} style={{
                                display:'flex',alignItems:'center',justifyContent:'space-between',
                                background: ativo ? corBg : '#0d0008',
                                border:`1px solid ${ativo ? cor+'44' : '#2a2a2a'}`,
                                borderRadius:10,padding:'0.7rem 0.85rem',
                              }}>
                                <div style={{display:'flex',alignItems:'center',gap:10}}>
                                  <span style={{fontSize:18}}>{isWell ? '💜' : '🔵'}</span>
                                  <div>
                                    <div style={{fontSize:14,fontWeight:700,color: ativo ? cor : '#fff'}}>
                                      {isWell ? 'Wellhub' : 'TotalPass'}
                                    </div>
                                    <div style={{fontSize:11,color:'#555',marginTop:1}}>
                                      {plano.creditos_mes} treinos/mês
                                    </div>
                                  </div>
                                </div>
                                {ativo ? (
                                  <div style={{display:'flex',alignItems:'center',gap:6,background:corBg,borderRadius:20,padding:'0.3rem 0.85rem',border:`1px solid ${cor}44`}}>
                                    <div style={{width:6,height:6,borderRadius:'50%',background:cor}}/>
                                    <span style={{fontSize:12,fontWeight:700,color:cor}}>ATIVO</span>
                                  </div>
                                ) : (
                                  <button onClick={() => abrirModalAtivar(plano)} style={{
                                    background: gradiente,
                                    color:'#fff',border:'none',borderRadius:20,
                                    padding:'0.4rem 1.1rem',fontSize:12,fontWeight:700,
                                    cursor:'pointer',fontFamily:"'DM Sans', sans-serif",
                                    whiteSpace:'nowrap',
                                  }}>Ativar →</button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Feed unificado */}
        <div style={{marginTop:'2rem',marginBottom:'2rem'}}>
          <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'1rem'}}>Meus agendamentos</div>
          {feedUnificado.length===0 ? (
            <div style={{background:'#111',border:'1px solid #222',borderRadius:16,padding:'2rem',textAlign:'center',color:'#555',fontSize:14}}>
              {temPlanoAtivo ? 'Nenhum agendamento. Que tal reservar uma sessão?' : 'Ative um plano acima para começar a agendar! 👆'}
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {feedUnificado.map(item => {
                const statusColor:Record<string,string>={agendado:CYAN,confirmado:'#aaff00',reservado:VERDE,realizado:'#888',cancelado:'#ff6b6b',falta:'#ff8c00'}
                const podeCancelar=['agendado','confirmado','reservado'].includes(item.status)
                const {label}=parsePlanoKey(item.tipoCredito)
                const isClub=item.tipo==='club'
                const dataItem = new Date(item.data+'T12:00:00')
                const isProximoMes = dataItem.getMonth() !== agora.getMonth() || dataItem.getFullYear() !== agora.getFullYear()
                const nomeMesItem = MESES[dataItem.getMonth()]
                return (
                  <div key={`${item.tipo}-${item.id}`} style={{background:'#111',border:`1px solid ${isClub?'#2a2a2a':'#222'}`,borderRadius:12,padding:'1rem 1.25rem'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
                      <div style={{textAlign:'center',flexShrink:0}}>
                        <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:28,color:'#fff',lineHeight:1}}>{dataItem.getDate()}</div>
                        <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase'}}>{dataItem.toLocaleDateString('pt-BR',{month:'short'})}</div>
                      </div>
                      <div style={{width:1,height:36,background:'#2a2a2a',flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:15,fontWeight:600,color:'#fff',marginBottom:2}}>{item.unidadeNome} — {item.horario}</div>
                        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                          {isClub && item.tipoAula && (
                            <span style={{fontSize:11,color:ACCENT,background:`${ACCENT}18`,padding:'1px 8px',borderRadius:20,fontWeight:600}}>{tipoAulaLabel(item.tipoAula)}</span>
                          )}
                          {isClub && item.posicao && (
                            <span style={{fontSize:11,color:VERDE,fontFamily:"'DM Mono', monospace",fontWeight:700}}>{item.posicao}</span>
                          )}
                          <span style={{fontSize:12,color:'#555'}}>{label}</span>
                          {isProximoMes && (
                            <span style={{fontSize:10,color:AMARELO,background:`${AMARELO}15`,padding:'1px 7px',borderRadius:20}}>
                              crédito de {nomeMesItem}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0}}>
                        <div style={{fontSize:11,fontWeight:600,color:statusColor[item.status]||'#888',textTransform:'uppercase'}}>
                          {item.status==='reservado'?'RESERVADO ✓':item.status}
                        </div>
                        {podeCancelar && (
                          <button onClick={()=>abrirModalCancelar(item)} style={{background:'transparent',border:'1px solid #333',borderRadius:6,padding:'0.2rem 0.6rem',fontSize:11,color:'#888',cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>Cancelar</button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Fila de espera */}
        {filas.length>0 && (
          <div style={{marginBottom:'2rem'}}>
            <div style={{fontSize:11,color:AMARELO,fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'1rem'}}>⏳ Na fila de espera</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {filas.map(f => (
                <div key={f.id} style={{background:'#1a1000',border:`1px solid ${AMARELO}44`,borderRadius:12,padding:'1rem 1.25rem'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
                    <div style={{textAlign:'center',flexShrink:0}}>
                      <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:28,color:AMARELO,lineHeight:1}}>{new Date(f.data+'T12:00:00').getDate()}</div>
                      <div style={{fontSize:10,color:AMARELO,textTransform:'uppercase',opacity:0.85}}>{new Date(f.data+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'})}</div>
                    </div>
                    <div style={{width:1,height:36,background:'#332200',flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15,fontWeight:600,color:'#fff'}}>{f.unidades?.nome||'Just CT'} — {(f.horario||'').slice(0,5)}</div>
                      <div style={{fontSize:12,color:'#bbb'}}>{parsePlanoKey(f.tipo_credito||'').label}</div>
                      <div style={{fontSize:11,color:AMARELO,marginTop:4}}>Você será avisado se uma vaga abrir</div>
                    </div>
                    <button onClick={()=>setModalSairFila(f)} style={{background:'transparent',border:`1px solid ${AMARELO}77`,borderRadius:6,padding:'0.3rem 0.75rem',fontSize:11,color:AMARELO,cursor:'pointer',fontFamily:"'DM Sans', sans-serif",flexShrink:0}}>Sair da fila</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compras */}
        {compras.length>0 && (
          <div style={{marginBottom:'2rem'}}>
            <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'1rem'}}>🛒 Minhas compras</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {compras.map(c => (
                <div key={c.id} style={{background:'#111',border:'1px solid #222',borderRadius:12,padding:'1rem 1.25rem'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'1rem'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600,color:'#fff',marginBottom:4}}>{c.produtos?.nome||'Produto'}</div>
                      <div style={{fontSize:12,color:'#555'}}>{formatarData(c.vendido_em)} · {labelPagamento(c.forma_pagamento)}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:20,color:'#fff',lineHeight:1}}>{formatarValor(c.valor_total)}</div>
                      <div style={{fontSize:11,color:'#22c55e',marginTop:4,fontWeight:600}}>✓ Pago</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dados pessoais */}
        {cliente && (
          <div style={{background:'#111',border:'1px solid #222',borderRadius:16,padding:'1.25rem',marginBottom:'2rem'}}>
            <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'1rem'}}>Minha conta</div>
            {[
              {label:'Nome',value:cliente.nome},
              {label:'Email',value:cliente.email||'—'},
              {label:'Telefone',value:cliente.telefone},
              {label:'Notificações',value:cliente.notificacao_preferida==='whatsapp'?'💬 WhatsApp':cliente.notificacao_preferida==='email'?'📧 Email':'🔕 Desativadas'},
            ].map((item,i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'0.5rem 0',borderBottom:'1px solid #1a1a1a'}}>
                <span style={{fontSize:13,color:'#555'}}>{item.label}</span>
                <span style={{fontSize:13,color:'#fff'}}>{item.value}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{textAlign:'center',paddingBottom:'3rem'}}>
          <span onClick={sair} style={{fontSize:13,color:'#444',cursor:'pointer',textDecoration:'underline'}}
            onMouseEnter={e=>(e.currentTarget.style.color='#888')} onMouseLeave={e=>(e.currentTarget.style.color='#444')}>
            Sair da conta
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL — CONTRATO + ATIVAÇÃO APP PARCEIRO
      ══════════════════════════════════════════════════════════════════════ */}
      {modalAtivar && (
        <div style={{position:'fixed',inset:0,background:'#000000dd',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#111',border:'1px solid #333',borderRadius:20,width:'100%',maxWidth:480,maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>

            {/* Header modal */}
            <div style={{padding:'1.25rem 1.5rem 1rem',borderBottom:'1px solid #222',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                <span style={{fontSize:22}}>{modalAtivar.plano.tipo==='wellhub'?'💜':'🔵'}</span>
                <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:22,color:'#fff',letterSpacing:1}}>
                  ATIVAR {modalAtivar.plano.tipo==='wellhub'?'WELLHUB':'TOTALPASS'}
                </div>
              </div>
              <div style={{fontSize:13,color:'#aaa'}}>
                {modalAtivar.plano.unidades?.nome} · {modalAtivar.plano.creditos_mes} treinos/mês
              </div>
            </div>

            {/* Aviso */}
            <div style={{padding:'0.75rem 1.5rem',background:'#0a0a0a',borderBottom:'1px solid #1a1a1a',flexShrink:0}}>
              <div style={{fontSize:12,color:'#aaa',lineHeight:1.6}}>
                Leia os termos abaixo antes de ativar seu plano. O aceite é necessário para liberar seus agendamentos.
              </div>
            </div>

            {/* Texto do contrato - scrollable */}
            <div
              ref={contratoRef}
              className="contrato-scroll"
              style={{
                flex:1,overflow:'auto',
                padding:'1.25rem 1.5rem',
                fontSize:12,color:'#bbb',lineHeight:1.8,
                whiteSpace:'pre-wrap',
                fontFamily:"'DM Mono', monospace",
                letterSpacing:0.3,
              }}
            >
              {CONTRATO_TEXTO}
            </div>

            {/* Footer modal */}
            <div style={{padding:'1rem 1.5rem 1.25rem',borderTop:'1px solid #222',flexShrink:0,background:'#0d0d0d'}}>
              {/* Checkbox aceite */}
              <label style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',marginBottom:'1rem'}}>
                <div
                  onClick={()=>setContratoAceito(!contratoAceito)}
                  style={{
                    width:20,height:20,borderRadius:5,flexShrink:0,marginTop:1,
                    border:`2px solid ${contratoAceito?VERDE:'#555'}`,
                    background:contratoAceito?VERDE:'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    cursor:'pointer',transition:'all .15s',
                  }}
                >
                  {contratoAceito && <span style={{fontSize:12,color:'#000',fontWeight:900,lineHeight:1}}>✓</span>}
                </div>
                <span style={{fontSize:13,color:'#ccc',lineHeight:1.5,cursor:'pointer'}} onClick={()=>setContratoAceito(!contratoAceito)}>
                  Li e concordo com os Termos de Uso do Just CT e JustClub
                </span>
              </label>

              {erroAtivar && (
                <div style={{background:'#1a0a0a',border:`1px solid ${ACCENT}44`,borderRadius:8,padding:'0.6rem 1rem',fontSize:12,color:ACCENT,marginBottom:'0.75rem'}}>
                  {erroAtivar}
                </div>
              )}

              <div style={{display:'flex',gap:8}}>
                <button
                  onClick={()=>setModalAtivar(null)}
                  style={{flex:1,background:'transparent',border:'1px solid #444',borderRadius:10,padding:'0.85rem',color:'#bbb',fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarAtivacao}
                  disabled={!contratoAceito||ativando}
                  style={{
                    flex:2,
                    background: contratoAceito
                      ? `linear-gradient(135deg,${VERDE},#00b37e)`
                      : '#1a1a1a',
                    color: contratoAceito ? '#000' : '#444',
                    border:'none',borderRadius:10,padding:'0.85rem',
                    fontWeight:700,fontSize:15,
                    cursor: contratoAceito&&!ativando ? 'pointer' : 'default',
                    fontFamily:"'DM Sans', sans-serif",
                    transition:'all .2s',
                  }}
                >
                  {ativando ? 'Ativando...' : '✓ Aceitar e Ativar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CANCELAR */}
      {modalCancelar && (
        <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
          <div style={{background:'#111',border:'1px solid #333',borderRadius:20,width:'100%',maxWidth:420,padding:'1.5rem'}}>
            <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:22,color:'#fff',marginBottom:4}}>CANCELAR AGENDAMENTO</div>
            <div style={{fontSize:13,color:'#aaa',marginBottom:'1.5rem',textTransform:'capitalize'}}>
              {new Date(modalCancelar.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} · {modalCancelar.horario}
              {modalCancelar.tipo==='club'&&modalCancelar.tipoAula&&<span style={{marginLeft:8,color:ACCENT,fontSize:12}}>· {tipoAulaLabel(modalCancelar.tipoAula)}</span>}
            </div>
            <div style={{background:modalCancelar.pode?'#0a1a0a':'#1a0a0a',border:`1px solid ${modalCancelar.pode?'#aaff0044':'#ff444444'}`,borderRadius:10,padding:'1rem',marginBottom:'1.5rem',fontSize:13,color:modalCancelar.pode?'#cfc':'#ffaaaa',lineHeight:1.6}}>
              {modalCancelar.pode?'✅ ':'❌ '}{modalCancelar.aviso}
            </div>
            {erroCancelar&&<div style={{background:'#ff2d9b15',border:'1px solid #ff2d9b44',borderRadius:8,padding:'0.6rem 1rem',fontSize:13,color:ACCENT,marginBottom:'1rem'}}>{erroCancelar}</div>}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setModalCancelar(null)} style={{flex:1,background:'transparent',border:'1px solid #444',borderRadius:10,padding:'0.85rem',color:'#bbb',fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>Voltar</button>
              {modalCancelar.pode&&(
                <button onClick={confirmarCancelamento} disabled={cancelando} style={{flex:2,background:'#ff4444',color:'#fff',border:'none',borderRadius:10,padding:'0.85rem',fontWeight:600,fontSize:15,cursor:cancelando?'default':'pointer',fontFamily:"'DM Sans', sans-serif",opacity:cancelando?0.7:1}}>
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
          <div style={{background:'#111',border:`1px solid ${AMARELO}44`,borderRadius:20,width:'100%',maxWidth:420,padding:'1.5rem'}}>
            <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:22,color:AMARELO,marginBottom:4}}>SAIR DA FILA DE ESPERA</div>
            <div style={{fontSize:13,color:'#aaa',marginBottom:'1.5rem',textTransform:'capitalize'}}>
              {new Date(modalSairFila.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})} · {(modalSairFila.horario||'').slice(0,5)}
            </div>
            <div style={{background:'#1a1000',border:`1px solid ${AMARELO}44`,borderRadius:10,padding:'1rem',marginBottom:'1.5rem',fontSize:13,color:'#ddd',lineHeight:1.6}}>
              Você ainda não foi confirmado. Pode sair sem multa ou desconto de crédito.
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setModalSairFila(null)} style={{flex:1,background:'transparent',border:'1px solid #444',borderRadius:10,padding:'0.85rem',color:'#bbb',fontSize:14,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>Voltar</button>
              <button onClick={sairDaFila} disabled={saindoFila} style={{flex:2,background:AMARELO,color:'#000',border:'none',borderRadius:10,padding:'0.85rem',fontWeight:700,fontSize:15,cursor:saindoFila?'default':'pointer',fontFamily:"'DM Sans', sans-serif",opacity:saindoFila?0.7:1}}>
                {saindoFila?'Saindo...':'Sair da fila'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
