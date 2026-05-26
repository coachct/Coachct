'use client'
import { useEffect, useState } from 'react'
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
  if (t==='lift')             return 'Lift'
  if (t==='lift_for_girls')  return 'Lift for Girls'
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

  const [cliente,       setCliente]       = useState<any>(null)
  const [agendamentos,  setAgendamentos]  = useState<any[]>([])
  const [clubReservas,  setClubReservas]  = useState<any[]>([])
  const [filas,         setFilas]         = useState<any[]>([])
  const [saldoAtual,    setSaldoAtual]    = useState<Record<string,any>>({})
  const [saldoProximo,  setSaldoProximo]  = useState<Record<string,any>>({})
  const [clientePlanos, setClientePlanos] = useState<any[]>([])
  const [compras,       setCompras]       = useState<any[]>([])
  const [loadingData,   setLoadingData]   = useState(true)

  const [modalCancelar, setModalCancelar] = useState<any>(null)
  const [cancelando,    setCancelando]    = useState(false)
  const [erroCancelar,  setErroCancelar]  = useState('')
  const [modalSairFila, setModalSairFila] = useState<any>(null)
  const [saindoFila,    setSaindoFila]    = useState(false)

  const agora        = new Date()
  const mesAtual     = agora.getMonth()+1
  const anoAtual     = agora.getFullYear()
  const mesProximo   = mesAtual===12?1:mesAtual+1
  const anoProximo   = mesAtual===12?anoAtual+1:anoAtual
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
    ])
    setAgendamentos(ags||[])
    setFilas(filasData||[])
    setClientePlanos(cliPlanos||[])
    setCompras(vendasData||[])
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

  const temPlanoAtivo    = clientePlanos.length>0
  const todoSaldoEsgotado = temPlanoAtivo&&Object.keys(saldoAtual).length>0&&Object.values(saldoAtual).every((s:any)=>s.disponivel===0)
  const temSaldoProximo   = Object.values(saldoProximo).some((s:any)=>s.disponivel>0)
  const planosProxLabel   = Object.entries(saldoProximo).filter(([,s]:any)=>s.disponivel>0).map(([p,s]:any)=>`${s.disponivel} ${parsePlanoKey(p).label}`).join(', ')

  return (
    <div style={{minHeight:'100vh',background:'#080808',fontFamily:"'DM Sans', sans-serif",color:'#f0f0f0'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        .btn-acao:hover{transform:translateY(-1px);}
      `}</style>
      <SiteHeader/>
      <div style={{maxWidth:700,margin:'0 auto',padding:'6rem 1.5rem 2rem'}}>

        <div style={{marginBottom:'1.5rem'}}>
          <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:32,color:'#fff',letterSpacing:1}}>Olá, {perfil?.nome?.split(' ')[0]}! 👋</div>
          <div style={{fontSize:14,color:'#aaa',marginTop:4}}>Bem-vindo à sua área do aluno</div>
        </div>

        {!temPlanoAtivo ? (
          <div style={{background:'#110008',border:`1.5px solid ${ACCENT}55`,borderRadius:16,padding:'1.5rem',marginBottom:'1.5rem'}}>
            <div style={{fontSize:13,color:ACCENT,fontWeight:700,marginBottom:8}}>⚡ Você ainda não tem um plano ativo</div>
            <div style={{fontSize:14,color:'#ccc',lineHeight:1.7,marginBottom:'1.25rem'}}>Ative seu <strong style={{color:'#fff'}}>Wellhub</strong> ou <strong style={{color:'#fff'}}>TotalPass</strong> para começar.</div>
            <button onClick={()=>router.push('/meus-planos')} style={{width:'100%',background:ACCENT,color:'#fff',border:'none',borderRadius:12,padding:'0.9rem',fontWeight:600,fontSize:15,cursor:'pointer',fontFamily:"'DM Sans', sans-serif"}}>Ative seu plano →</button>
          </div>
        ) : (
          <>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:10,marginBottom:'1.5rem'}}>
              <button className="btn-acao" onClick={()=>router.push('/agendar')} style={{background:ACCENT,color:'#fff',border:'none',borderRadius:12,padding:'0.95rem',fontWeight:600,fontSize:15,cursor:'pointer',fontFamily:"'DM Sans', sans-serif",transition:'transform .15s'}}>+ Agendar Treino</button>
              <button className="btn-acao" onClick={()=>router.push('/meus-planos')} style={{background:'transparent',color:'#fff',border:`1.5px solid ${ACCENT}66`,borderRadius:12,padding:'0.95rem',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:"'DM Sans', sans-serif",transition:'transform .15s'}}>Meus Planos</button>
            </div>

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

        {/* Feed unificado */}
        <div style={{marginTop:'2rem',marginBottom:'2rem'}}>
          <div style={{fontSize:11,color:'#aaa',fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:'1rem'}}>Meus agendamentos</div>
          {feedUnificado.length===0 ? (
            <div style={{background:'#111',border:'1px solid #222',borderRadius:16,padding:'2rem',textAlign:'center',color:'#555',fontSize:14}}>Nenhum agendamento. Que tal reservar uma sessão?</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {feedUnificado.map(item => {
                const statusColor:Record<string,string>={agendado:CYAN,confirmado:'#aaff00',reservado:VERDE,realizado:'#888',cancelado:'#ff6b6b',falta:'#ff8c00'}
                const podeCancelar=['agendado','confirmado','reservado'].includes(item.status)
                const {label}=parsePlanoKey(item.tipoCredito)
                const isClub=item.tipo==='club'
                return (
                  <div key={`${item.tipo}-${item.id}`} style={{background:'#111',border:`1px solid ${isClub?'#2a2a2a':'#222'}`,borderRadius:12,padding:'1rem 1.25rem'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
                      <div style={{textAlign:'center',flexShrink:0}}>
                        <div style={{fontFamily:"'Bebas Neue', sans-serif",fontSize:28,color:'#fff',lineHeight:1}}>{new Date(item.data+'T12:00:00').getDate()}</div>
                        <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase'}}>{new Date(item.data+'T12:00:00').toLocaleDateString('pt-BR',{month:'short'})}</div>
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
            {[{label:'Nome',value:cliente.nome},{label:'Email',value:cliente.email||'—'},{label:'Telefone',value:cliente.telefone},{label:'Notificações',value:cliente.notificacao_preferida==='whatsapp'?'💬 WhatsApp':cliente.notificacao_preferida==='email'?'📧 Email':'🔕 Desativadas'}].map((item,i) => (
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
