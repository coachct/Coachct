'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(true)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

const ACCENT  = '#ff2d9b'
const CYAN    = '#00e5ff'
const AMARELO = '#ffaa00'
const VERDE   = '#2ddd8b'

const DIAS_ABREV  = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']

function dataLocalStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function parsePlanoKey(key: string): { label: string; icon: string } {
  const lower = (key||'').toLowerCase()
  if (lower.startsWith('wellhub'))    return { label: 'Wellhub',       icon: '💜' }
  if (lower.startsWith('totalpass')) return { label: 'TotalPass',     icon: '🔵' }
  if (lower.startsWith('avulso') || lower.startsWith('credito')) return { label: 'Crédito Avulso', icon: '🎟️' }
  return { label: key, icon: '🏋️' }
}

function tipoLabel(t: string) {
  if (t === 'lift')              return 'Lift'
  if (t === 'lift_for_girls')   return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return t
}

function tipoColor(t: string) {
  if (t === 'lift')              return { bg: '#0a1520', border: '#00e5ff22', text: CYAN,  badge: '#00e5ff18' }
  if (t === 'lift_for_girls')   return { bg: '#150a15', border: '#ff2d9b22', text: ACCENT, badge: '#ff2d9b18' }
  return                               { bg: '#0a150a', border: '#2ddd8b22', text: VERDE,  badge: '#2ddd8b18' }
}

function IconEsteira({ color }: { color: string }) {
  return (
    <svg width="26" height="22" viewBox="0 0 26 22">
      <rect x="1" y="17" width="24" height="3" rx="1.5" fill={color} opacity="0.35"/>
      <circle cx="17" cy="4.5" r="2.5" fill={color}/>
      <line x1="17" y1="7" x2="15" y2="12" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="12" x2="11" y2="17" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="12" x2="19" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="8.5" x2="13" y2="10.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="8.5" x2="21" y2="10.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function IconHaltere({ color }: { color: string }) {
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      <rect x="0" y="6" width="5" height="6" rx="1.5" fill={color}/>
      <rect x="2" y="4" width="2" height="10" rx="1" fill={color}/>
      <rect x="7" y="8" width="14" height="2.5" rx="1.25" fill={color}/>
      <rect x="23" y="6" width="5" height="6" rx="1.5" fill={color}/>
      <rect x="24" y="4" width="2" height="10" rx="1" fill={color}/>
    </svg>
  )
}

function PosicaoBtn({ label, tomado, selecionado, cor, onClick }: {
  label: string; tomado: boolean; selecionado: boolean; cor: string; onClick: () => void
}) {
  const isR = label.startsWith('R')
  const iconColor = selecionado ? cor : tomado ? '#1f1f1f' : '#555'
  return (
    <button disabled={tomado} onClick={onClick}
      style={{ width:50, height:60, borderRadius:10, border:`1.5px solid ${selecionado?cor:tomado?'#111':'#252525'}`, background:selecionado?`${cor}20`:tomado?'#0a0a0a':'#141414', cursor:tomado?'not-allowed':'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5, transition:'all .15s', padding:'6px 4px' }}>
      {isR ? <IconEsteira color={iconColor}/> : <IconHaltere color={iconColor}/>}
      <span style={{ fontSize:9, fontFamily:"'DM Mono', monospace", fontWeight:700, color:selecionado?cor:tomado?'#252525':'#555', lineHeight:1 }}>{label}</span>
    </button>
  )
}

function AulasPageInner() {
  const router    = useRouter()
  const params    = useSearchParams()
  const unidadeId = params.get('unidade') || ''
  const { user, perfil } = useAuth()
  const supabase  = createClient()
  const isMobile  = useIsMobile()

  const [unidade,         setUnidade]         = useState<any>(null)
  const [cliente,         setCliente]         = useState<any>(null)
  const [cobrancasPend,   setCobrancasPend]   = useState<any[]>([])
  const [saldo,           setSaldo]           = useState<Record<string, any>>({})
  const [saldoProximo,    setSaldoProximo]    = useState<Record<string, any>>({})
  const [ocorrencias,     setOcorrencias]     = useState<any[]>([])
  const [reservasCont,    setReservasCont]    = useState<Record<string, number>>({})
  const [minhasReservas,  setMinhasReservas]  = useState<Record<string, any>>({})
  const [filaCliente,     setFilaCliente]     = useState<Record<string, any>>({})
  const [posicoes,        setPosicoes]        = useState<any[]>([])
  const [posicoesTomadas, setPosicoesTomadas] = useState<string[]>([])
  const [loadingOcs,      setLoadingOcs]      = useState(false)
  const [semanaOffset,    setSemanaOffset]    = useState(0)
  const [diaSel,          setDiaSel]          = useState(0)
  const [periodo,         setPeriodo]         = useState<'todos'|'manha'|'tarde'|'noite'>('todos')
  const [bloqueadasCount, setBloqueadasCount] = useState(0)
  const [ocorrenciasSemana, setOcorrenciasSemana] = useState<Record<string, any[]>>({})
  const [loadingSemana,    setLoadingSemana]    = useState(false)

  const [modalReserva,   setModalReserva]   = useState<any>(null)
  const [modalFila,      setModalFila]      = useState<any>(null)
  const [modalSemCartao, setModalSemCartao] = useState(false)
  const [tipoCredito,    setTipoCredito]    = useState('')
  const [posicaoSel,     setPosicaoSel]     = useState('')
  const [confirmando,    setConfirmando]    = useState(false)
  const [entrandoFila,   setEntrandoFila]   = useState(false)
  const [erroModal,      setErroModal]      = useState('')
  const [filaAceite,     setFilaAceite]     = useState(false)
  const [modalGenero,    setModalGenero]    = useState(false)
  const [filaConfirmada, setFilaConfirmada] = useState<{ posicao: number; oc: any; data: string } | null>(null)

  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + semanaOffset * 7 + i); return d
  })
  const dataSel    = diasSemana[diaSel]
  const dataSelStr = dataLocalStr(dataSel)
  const agora      = new Date()
  const horaAtual  = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`
  const isHoje     = dataSelStr === dataLocalStr(agora)

  const dataSelEhProximoMes = dataSel.getMonth() !== agora.getMonth() || dataSel.getFullYear() !== agora.getFullYear()
  const mesProximo   = agora.getMonth() === 11 ? 1 : agora.getMonth() + 2
  const anoProximo   = agora.getMonth() === 11 ? agora.getFullYear() + 1 : agora.getFullYear()
  const nomeMesProximo = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][mesProximo - 1]

  const temPlanoParceiroAtivo = Object.entries(saldo).some(([k, v]: any) => !k.startsWith('avulso') && v?.disponivel > 0) ||
    Object.entries(saldoProximo).some(([k, v]: any) => !k.startsWith('avulso') && v?.disponivel > 0)
  const precisaCartao = !!cliente && temPlanoParceiroAtivo && !cliente?.pagarme_card_id

  function saldoParaData() { return dataSelEhProximoMes ? saldoProximo : saldo }

  useEffect(() => { if (!unidadeId) router.replace('/agendar') }, [unidadeId])
  useEffect(() => { if (unidadeId) carregarUnidade() }, [unidadeId])
  useEffect(() => { if (perfil) carregarCliente() }, [perfil])
  useEffect(() => { if (unidadeId) carregarOcorrencias(dataSelStr) }, [dataSelStr, unidadeId, cliente?.id])
  useEffect(() => { if (!isMobile && unidadeId) carregarSemana() }, [isMobile, semanaOffset, unidadeId, cliente?.id])
  useEffect(() => { if (cliente && unidadeId) carregarSaldo() }, [cliente?.id, unidadeId])

  async function carregarUnidade() {
    const { data } = await supabase.from('unidades').select('id, nome, tipo').eq('id', unidadeId).maybeSingle()
    setUnidade(data)
  }

  async function carregarSemana() {
    if (!unidadeId) return
    setLoadingSemana(true)
    const dataInicio = dataLocalStr(diasSemana[0])
    const dataFim    = dataLocalStr(diasSemana[6])

    const { data: aulasIds } = await supabase.from('club_aulas').select('id').eq('unidade_id', unidadeId).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    if (!ids.length) { setOcorrenciasSemana({}); setLoadingSemana(false); return }

    const { data: ocs } = await supabase
      .from('club_ocorrencias')
      .select('*, club_aulas(id, tipo, horario, capacidade, duracao_min, so_mulheres, grupo_muscular_id, coaches(nome))')
      .in('aula_id', ids)
      .eq('status', 'ativa')
      .gte('data', dataInicio)
      .lte('data', dataFim)

    const ocsList = (ocs || []).sort((a: any, b: any) => (a.club_aulas?.horario||'').localeCompare(b.club_aulas?.horario||''))

    const grupoIds = [...new Set(ocsList.map((o: any) => o.club_aulas?.grupo_muscular_id).filter(Boolean))]
    let gruposMap: Record<string, string> = {}
    if (grupoIds.length) {
      const { data: grupos } = await supabase.from('grupos_musculares').select('id, nome').in('id', grupoIds)
      for (const g of (grupos || [])) gruposMap[g.id] = g.nome
    }

    const ocsComGrupo = ocsList.map((o: any) => ({
      ...o,
      club_aulas: { ...o.club_aulas, grupo_muscular_nome: o.club_aulas?.grupo_muscular_id ? (gruposMap[o.club_aulas.grupo_muscular_id] || null) : null }
    }))

    const porDia: Record<string, any[]> = {}
    diasSemana.forEach(d => { porDia[dataLocalStr(d)] = [] })
    ocsComGrupo.forEach((oc: any) => { if (porDia[oc.data]) porDia[oc.data].push(oc) })
    setOcorrenciasSemana(porDia)

    const ocIds = ocsComGrupo.map((o: any) => o.id)
    if (ocIds.length) {
      const { data: reservas } = await supabase.from('club_reservas').select('ocorrencia_id').in('ocorrencia_id', ocIds).in('status', ['reservado','presente'])
      const cont: Record<string, number> = {}
      for (const r of (reservas||[])) cont[r.ocorrencia_id] = (cont[r.ocorrencia_id]||0)+1
      setReservasCont(cont)

      const { data: bloqData } = await supabase.from('club_posicoes').select('id').eq('unidade_id', unidadeId).eq('ativo', true).eq('bloqueado', true)
      setBloqueadasCount((bloqData || []).length)

      if (cliente) {
        const [{ data: minhas }, { data: filas }] = await Promise.all([
          supabase.from('club_reservas').select('*').in('ocorrencia_id', ocIds).eq('cliente_id', cliente.id).neq('status','cancelado'),
          supabase.from('fila_espera').select('*').in('ocorrencia_id', ocIds).eq('cliente_id', cliente.id).eq('status','aguardando'),
        ])
        const minhasMap: Record<string, any> = {}
        for (const r of (minhas||[])) minhasMap[r.ocorrencia_id] = r
        setMinhasReservas(minhasMap)
        const filaMap: Record<string, any> = {}
        for (const f of (filas||[])) if (f.ocorrencia_id) filaMap[f.ocorrencia_id] = f
        setFilaCliente(filaMap)
      }
    }
    setLoadingSemana(false)
  }
  async function carregarCliente() {
    if (!perfil) return
    const { data } = await supabase.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
    setCliente(data)
    if (data) {
      const { data: cobs } = await supabase.from('cobrancas_pendentes').select('*').eq('cliente_id', data.id).eq('status', 'pendente')
      setCobrancasPend(cobs || [])
    }
  }
  async function carregarSaldo() {
    if (!cliente || !unidadeId) return
    const agora = new Date()
    const mes  = agora.getMonth() + 1
    const ano  = agora.getFullYear()
    const mesP = agora.getMonth() === 11 ? 1 : agora.getMonth() + 2
    const anoP = agora.getMonth() === 11 ? agora.getFullYear() + 1 : agora.getFullYear()
    const [{ data: atual }, { data: proximo }] = await Promise.all([
      supabase.rpc('saldo_creditos_cliente', { p_cliente_id: cliente.id, p_mes: mes,  p_ano: ano,  p_unidade_id: unidadeId }),
      supabase.rpc('saldo_creditos_cliente', { p_cliente_id: cliente.id, p_mes: mesP, p_ano: anoP, p_unidade_id: unidadeId }),
    ])
    setSaldo(atual || {})
    setSaldoProximo(proximo || {})
  }

  async function carregarOcorrencias(data: string) {
    if (!unidadeId) return
    setLoadingOcs(true)
    const { data: aulasIds } = await supabase.from('club_aulas').select('id').eq('unidade_id', unidadeId).eq('ativo', true)
    const ids = (aulasIds || []).map((a: any) => a.id)
    if (!ids.length) { setOcorrencias([]); setLoadingOcs(false); return }

    const { data: ocs } = await supabase
      .from('club_ocorrencias')
      .select('*, club_aulas(id, tipo, horario, capacidade, so_mulheres, grupo_muscular_id, coaches(nome))')
      .in('aula_id', ids).eq('data', data).eq('status', 'ativa')

    const ocsList = (ocs || []).sort((a: any, b: any) => (a.club_aulas?.horario||'').localeCompare(b.club_aulas?.horario||''))

    const grupoIds = [...new Set(ocsList.map((o: any) => o.club_aulas?.grupo_muscular_id).filter(Boolean))]
    let gruposMap: Record<string, string> = {}
    if (grupoIds.length) {
      const { data: grupos } = await supabase.from('grupos_musculares').select('id, nome').in('id', grupoIds)
      for (const g of (grupos || [])) gruposMap[g.id] = g.nome
    }

    const ocsComGrupo = ocsList.map((o: any) => ({
      ...o,
      club_aulas: {
        ...o.club_aulas,
        grupo_muscular_nome: o.club_aulas?.grupo_muscular_id ? (gruposMap[o.club_aulas.grupo_muscular_id] || null) : null,
      }
    }))

    setOcorrencias(ocsComGrupo)
    if (!ocsComGrupo.length) { setLoadingOcs(false); return }

    const ocIds = ocsComGrupo.map((o: any) => o.id)
    const { data: reservas } = await supabase.from('club_reservas').select('ocorrencia_id, posicao, status').in('ocorrencia_id', ocIds).in('status', ['reservado','presente'])
    const cont: Record<string, number> = {}
    for (const r of (reservas||[])) cont[r.ocorrencia_id] = (cont[r.ocorrencia_id]||0)+1
    setReservasCont(cont)

    const { data: bloqData } = await supabase.from('club_posicoes').select('id').eq('unidade_id', unidadeId).eq('ativo', true).eq('bloqueado', true)
    setBloqueadasCount((bloqData || []).length)

    if (cliente) {
      const [{ data: minhas }, { data: filas }] = await Promise.all([
        supabase.from('club_reservas').select('*').in('ocorrencia_id', ocIds).eq('cliente_id', cliente.id).neq('status','cancelado'),
        supabase.from('fila_espera').select('*').in('ocorrencia_id', ocIds).eq('cliente_id', cliente.id).eq('status','aguardando'),
      ])
      const minhasMap: Record<string, any> = {}
      for (const r of (minhas||[])) minhasMap[r.ocorrencia_id] = r
      setMinhasReservas(minhasMap)
      const filaMap: Record<string, any> = {}
      for (const f of (filas||[])) if (f.ocorrencia_id) filaMap[f.ocorrencia_id] = f
      setFilaCliente(filaMap)
    }
    setLoadingOcs(false)
  }

  async function carregarPosicoes(ocorrenciaId: string) {
    const [{ data: pos }, { data: tomadas }] = await Promise.all([
      supabase.from('club_posicoes').select('*').eq('unidade_id', unidadeId).eq('ativo', true).order('tipo').order('numero'),
      supabase.from('club_reservas').select('posicao').eq('ocorrencia_id', ocorrenciaId).in('status',['reservado','presente']),
    ])
    setPosicoes(pos||[])
    const reservadas = (tomadas||[]).map((t: any) => t.posicao).filter(Boolean)
    const bloqueadas = (pos||[]).filter((p: any) => p.bloqueado).map((p: any) => `${p.tipo}${String(p.numero).padStart(2,'0')}`)
    setPosicoesTomadas([...reservadas, ...bloqueadas])
  }

  function tentarReservar(oc: any) {
    if (!user) { router.push(`/login?redirect=${encodeURIComponent("/aulas?unidade="+unidadeId)}`); return }
    if (cliente?.bloqueado) return
    if (precisaCartao) { setModalSemCartao(true); return }
    if (oc.club_aulas?.so_mulheres && cliente?.sexo !== "F") { setModalGenero(true); return }
    if (oc.club_aulas?.tipo === "running_funcional") { router.push(`/mapa?ocorrencia=${oc.id}&unidade=${unidadeId}`); return }
    abrirModalReserva(oc)
  }
  function tentarFila(oc: any) {
    if (!user) { router.push(`/login?redirect=${encodeURIComponent('/aulas?unidade='+unidadeId)}`); return }
    if (cliente?.bloqueado) return
    if (precisaCartao) { setModalSemCartao(true); return }
    setModalFila(oc); setTipoCredito(''); setFilaAceite(false); setErroModal('')
  }
  async function abrirModalReserva(oc: any) {
    setModalReserva(oc); setTipoCredito(''); setPosicaoSel(''); setErroModal('')
    if (oc.club_aulas?.tipo === 'running_funcional') await carregarPosicoes(oc.id)
  }
  async function confirmarReserva() {
    if (!tipoCredito) { setErroModal('Selecione o plano para usar.'); return }
    if (modalReserva?.club_aulas?.tipo === 'running_funcional' && !posicaoSel) { setErroModal('Selecione sua posição no mapa.'); return }
    if (!cliente || !modalReserva) return
    setConfirmando(true); setErroModal('')
    const payload: any = { ocorrencia_id: modalReserva.id, cliente_id: cliente.id, tipo_credito: tipoCredito, status: 'reservado' }
    if (posicaoSel) payload.posicao = posicaoSel
    const { error } = await supabase.from('club_reservas').insert(payload)
    if (error) {
      const msg = error.message?.includes('já tem uma reserva')
        ? 'Você já tem uma reserva nesta unidade neste dia com este plano. Cada plano permite apenas uma reserva por dia por unidade.'
        : 'Erro ao reservar: ' + error.message
      setErroModal(msg); setConfirmando(false); return
    }
    setConfirmando(false); setModalReserva(null)
    router.push('/minha-conta')
  }
  async function confirmarFila() {
    if (!tipoCredito) { setErroModal('Selecione o plano para usar.'); return }
    if (!filaAceite) { setErroModal('Confirme que entendeu as regras da fila.'); return }
    if (!cliente || !modalFila) return
    setEntrandoFila(true); setErroModal('')
    const { error } = await supabase.from('fila_espera').insert({
      ocorrencia_id: modalFila.id, cliente_id: cliente.id, tipo_credito: tipoCredito,
      status: 'aguardando', data: dataSelStr, horario: modalFila.club_aulas?.horario, unidade_id: unidadeId,
    })
    if (error) { setErroModal('Erro ao entrar na fila: '+error.message); setEntrandoFila(false); return }
    const { count } = await supabase.from('fila_espera').select('*', { count: 'exact', head: true }).eq('ocorrencia_id', modalFila.id).eq('status', 'aguardando')
    setEntrandoFila(false)
    setFilaConfirmada({ posicao: count || 1, oc: modalFila, data: dataSelStr })
    setModalFila(null)
    await carregarOcorrencias(dataSelStr)
  }

  const ocsFiltradas = ocorrencias.filter(oc => {
    if (isHoje && (oc.club_aulas?.horario||'').slice(0,5) <= horaAtual) return false
    const hora = parseInt((oc.club_aulas?.horario||'').slice(0,2))
    if (periodo === 'manha') return hora < 12
    if (periodo === 'tarde') return hora >= 12 && hora < 18
    if (periodo === 'noite') return hora >= 18
    return true
  })
  const planosDisponiveis = Object.entries(saldoParaData()).filter(([,v]: [string,any]) => v?.disponivel > 0).map(([k]) => k)
  function vagasInfo(oc: any) {
    const cap=oc.club_aulas?.capacidade||0; const usadas=reservasCont[oc.id]||0
    const isRunning=oc.club_aulas?.tipo==='running_funcional'
    const efetivas = isRunning ? Math.max(0, cap - bloqueadasCount) : cap
    const livres=Math.max(0,efetivas-usadas)
    return { livres, lotado: livres<=0 }
  }

  // Rótulo da semana (desktop): "26 mai – 1 jun"
  const semanaLabel = (() => {
    const ini = diasSemana[0]; const fim = diasSemana[6]
    const mesIni = MESES_ABREV[ini.getMonth()].toLowerCase()
    const mesFim = MESES_ABREV[fim.getMonth()].toLowerCase()
    return `${ini.getDate()} ${mesIni} – ${fim.getDate()} ${mesFim}`
  })()

  if (!unidadeId) return (
    <div style={{ minHeight:'100vh', background:'#080808', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:32, height:32, border:`4px solid ${ACCENT}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#080808', fontFamily:"'DM Sans', sans-serif", color:'#f0f0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        .dia-tab:hover{color:#fff!important;}
      `}</style>
      <SiteHeader/>
      <div style={{ maxWidth: isMobile ? 700 : 1400, margin:'0 auto', padding: isMobile ? '6rem 1.5rem 4rem' : '6rem 2rem 4rem' }}>

        <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'2rem' }}>
          <button onClick={() => router.push('/agendar')} style={{ background:'transparent', border:'1px solid #2a2a2a', borderRadius:'50%', width:36, height:36, color:'#666', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>‹</button>
          <div>
            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:28, color:'#fff', letterSpacing:1 }}>{unidade?.nome||'Aulas coletivas'}</div>
            <div style={{ fontSize:13, color:'#888', marginTop:2 }}>Lift · Lift for Girls · Running + Funcional</div>
          </div>
        </div>

        {user && cliente?.bloqueado && cobrancasPend.length > 0 && (
          <div style={{ background:'#1a0000', border:'2px solid #ff4444', borderRadius:16, padding:'1.5rem', marginBottom:'1.5rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:'1rem' }}>
              <div style={{ fontSize:32 }}>🚫</div>
              <div>
                <div style={{ fontSize:18, color:'#ff4444', fontWeight:700, fontFamily:"'Bebas Neue', sans-serif", letterSpacing:1 }}>CARTÃO RECUSADO</div>
                <div style={{ fontSize:13, color:'#ccc' }}>Não conseguimos cobrar a multa no seu cartão</div>
              </div>
            </div>
            <div style={{ background:'#0a0000', border:'1px solid #ff444433', borderRadius:10, padding:'1rem', marginBottom:'1rem' }}>
              <div style={{ fontSize:13, color:'#fff', fontWeight:600, marginBottom:8 }}>Multas pendentes:</div>
              {cobrancasPend.map((c:any, i:number) => (
                <div key={c.id} style={{ display:'flex', justifyContent:'space-between', padding:'0.5rem 0', borderBottom: i < cobrancasPend.length-1 ? '1px solid #220000' : 'none' }}>
                  <div style={{ fontSize:13, color:'#ddd' }}>{c.motivo}</div>
                  <div style={{ fontSize:14, color:'#ff4444', fontWeight:700, fontFamily:"'DM Mono', monospace" }}>R$ {Number(c.valor).toFixed(2).replace('.',',')}</div>
                </div>
              ))}
            </div>
            <button onClick={() => router.push('/cadastrar-cartao')} style={{ width:'100%', background:'#ff4444', color:'#fff', border:'none', borderRadius:10, padding:'0.85rem', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
              💳 Atualizar cartão e regularizar
            </button>
          </div>
        )}

        {user && cliente?.bloqueado && cobrancasPend.length === 0 && (
          <div style={{ background:'#1a1000', border:`2px solid ${AMARELO}`, borderRadius:16, padding:'1.5rem', marginBottom:'1.5rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:'0.75rem' }}>
              <div style={{ fontSize:32 }}>⏳</div>
              <div>
                <div style={{ fontSize:18, color:AMARELO, fontWeight:700, fontFamily:"'Bebas Neue', sans-serif", letterSpacing:1 }}>AGUARDANDO REGULARIZAÇÃO</div>
                <div style={{ fontSize:13, color:'#ccc' }}>Conta temporariamente bloqueada</div>
              </div>
            </div>
            <div style={{ fontSize:14, color:'#ddd', lineHeight:1.7, marginBottom:'0.75rem' }}>{cliente?.motivo_bloqueio || 'Você teve uma falta sem cancelamento prévio.'}</div>
            <div style={{ background:'#0a0500', border:`1px solid ${AMARELO}33`, borderRadius:10, padding:'0.85rem 1rem', fontSize:13, color:'#aaa' }}>
              ⏳ <strong style={{ color:'#fff' }}>Aguarde a regularização da cobrança</strong> para fazer novas reservas.
            </div>
          </div>
        )}

        {user && cliente && !cliente.bloqueado && precisaCartao && (
          <div style={{ background:'#1a1000', border:`1.5px solid ${AMARELO}55`, borderRadius:16, padding:'1.25rem 1.5rem', marginBottom:'1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:14, color:AMARELO, fontWeight:700, marginBottom:4 }}>💳 Cadastre um cartão para liberar reservas</div>
              <div style={{ fontSize:13, color:'#888', lineHeight:1.5 }}>Para reservar aulas no JustClub, precisamos de um cartão registrado. <strong style={{ color:'#fff' }}>Nada será cobrado agora.</strong></div>
            </div>
            <button onClick={() => router.push('/cadastrar-cartao')} style={{ background:AMARELO, color:'#000', border:'none', borderRadius:10, padding:'0.65rem 1.25rem', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'DM Sans', sans-serif", whiteSpace:'nowrap' }}>Cadastrar cartão →</button>
          </div>
        )}

        {!user && (
          <div style={{ background:'#0a0014', border:`1px solid ${ACCENT}33`, borderRadius:12, padding:'0.85rem 1.25rem', marginBottom:'1.5rem', fontSize:13, color:'#aaa' }}>
            👋 Navegando como visitante.{' '}
            <span onClick={() => router.push(`/login?redirect=${encodeURIComponent('/aulas?unidade='+unidadeId)}`)} style={{ color:ACCENT, cursor:'pointer', fontWeight:600 }}>Faça login</span> para reservar aulas.
          </div>
        )}

        {user && dataSelEhProximoMes && (
          <div style={{ background:'#1a1000', border:`1px solid ${AMARELO}44`, borderRadius:12, padding:'0.85rem 1.25rem', marginBottom:'1.5rem', fontSize:13, color:'#ddd', lineHeight:1.6 }}>
            📅 <strong style={{ color:AMARELO }}>Você está vendo aulas de {nomeMesProximo}.</strong>{' '}
            As reservas feitas aqui consumirão seus créditos de <strong style={{ color:'#fff' }}>{nomeMesProximo}</strong>.
          </div>
        )}

        {/* ── NAVEGAÇÃO DE DATA ── */}
        {isMobile ? (
          /* MOBILE: régua de tabs por dia (inalterada) */
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:0 }}>
            <button onClick={() => { setSemanaOffset(o=>Math.max(0,o-1)); setDiaSel(0) }} disabled={semanaOffset===0}
              style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #2a2a2a', background:'transparent', color:semanaOffset===0?'#2a2a2a':'#666', fontSize:16, cursor:semanaOffset===0?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>‹</button>
            <div style={{ flex:1, display:'flex', borderBottom:'1px solid #1a1a1a' }}>
              {diasSemana.map((d,i) => {
                const sel=i===diaSel; const isHojeTab=semanaOffset===0&&i===0
                return (
                  <button key={i} className="dia-tab" onClick={() => setDiaSel(i)}
                    style={{ flex:1, minWidth:0, padding:'0.75rem 0.25rem', background:'transparent', border:'none', borderBottom:`2px solid ${sel?ACCENT:'transparent'}`, cursor:'pointer', textAlign:'center', transition:'all .15s', color:sel?'#fff':'#444' }}>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:1, marginBottom:4, color:sel?ACCENT:'#333' }}>{isHojeTab?'HOJE':DIAS_ABREV[d.getDay()]}</div>
                    <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, lineHeight:1, color:sel?'#fff':'#555' }}>{d.getDate()}</div>
                    <div style={{ fontSize:9, color:sel?ACCENT:'#2a2a2a', textTransform:'uppercase', marginTop:2 }}>{MESES_ABREV[d.getMonth()]}</div>
                  </button>
                )
              })}
            </div>
            <button onClick={() => { setSemanaOffset(o=>Math.min(3,o+1)); setDiaSel(0) }} disabled={semanaOffset>=3}
              style={{ width:32, height:32, borderRadius:'50%', border:'1px solid #2a2a2a', background:'transparent', color:semanaOffset>=3?'#2a2a2a':'#666', fontSize:16, cursor:semanaOffset>=3?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>›</button>
          </div>
        ) : (
          /* DESKTOP: só navegação de semana (a grade já mostra os 7 dias) */
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'1.25rem', marginBottom:0 }}>
            <button onClick={() => { setSemanaOffset(o=>Math.max(0,o-1)); setDiaSel(0) }} disabled={semanaOffset===0}
              style={{ width:40, height:40, borderRadius:'50%', border:`1px solid ${semanaOffset===0?'#2a2a2a':'#444'}`, background:'transparent', color:semanaOffset===0?'#333':'#ccc', fontSize:18, cursor:semanaOffset===0?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>‹</button>
            <div style={{ textAlign:'center', minWidth:220 }}>
              <div style={{ fontSize:11, color:'#888', fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:2 }}>
                {semanaOffset===0 ? 'Esta semana' : `Semana +${semanaOffset}`}
              </div>
              <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#fff', letterSpacing:1 }}>{semanaLabel}</div>
            </div>
            <button onClick={() => { setSemanaOffset(o=>Math.min(3,o+1)); setDiaSel(0) }} disabled={semanaOffset>=3}
              style={{ width:40, height:40, borderRadius:'50%', border:`1px solid ${semanaOffset>=3?'#2a2a2a':'#444'}`, background:'transparent', color:semanaOffset>=3?'#333':'#ccc', fontSize:18, cursor:semanaOffset>=3?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>›</button>
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:'1.25rem', marginBottom:'1.5rem', flexWrap:'wrap' }}>
          {[{key:'todos',label:'Todos'},{key:'manha',label:'🌅 Manhã'},{key:'tarde',label:'☀️ Tarde'},{key:'noite',label:'🌙 Noite'}].map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key as any)}
              style={{ padding:'0.35rem 1rem', borderRadius:20, border:`1px solid ${periodo===p.key?ACCENT:'#2a2a2a'}`, background:periodo===p.key?`${ACCENT}20`:'transparent', color:periodo===p.key?ACCENT:'#888', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* ── DESKTOP: grade semanal ── */}
        {!isMobile && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7, minmax(0, 1fr))', gap:8, marginTop:'1.5rem' }}>
            {diasSemana.map((dia, i) => {
              const diaStr  = dataLocalStr(dia)
              const isHojeDia = diaStr === dataLocalStr(new Date())
              const aulas   = (ocorrenciasSemana[diaStr] || []).filter(oc => {
                const hora = parseInt((oc.club_aulas?.horario||'').slice(0,2))
                if (periodo === 'manha') return hora < 12
                if (periodo === 'tarde') return hora >= 12 && hora < 18
                if (periodo === 'noite') return hora >= 18
                return true
              })
              return (
                <div key={i}>
                  {/* Cabeçalho do dia */}
                  <div style={{ textAlign:'center', padding:'8px 4px', borderRadius:10, background:'#0d0d0d', border:`1px solid ${isHojeDia ? ACCENT+'66' : '#222'}`, marginBottom:8 }}>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:1, color: isHojeDia ? ACCENT : '#fff', textTransform:'uppercase' }}>
                      {isHojeDia ? 'HOJE' : DIAS_ABREV[dia.getDay()]}
                    </div>
                    <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:20, lineHeight:1.1, color:'#fff', marginTop:2 }}>
                      {dia.getDate()}
                    </div>
                    <div style={{ fontSize:9, color: isHojeDia ? ACCENT : '#999', textTransform:'uppercase' }}>
                      {MESES_ABREV[dia.getMonth()]}
                    </div>
                  </div>

                  {loadingSemana ? (
                    <div style={{ textAlign:'center', padding:'1rem 0', color:'#555', fontSize:11 }}>...</div>
                  ) : aulas.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'1rem 0', color:'#444', fontSize:11 }}>—</div>
                  ) : aulas.map((oc: any) => {
                    const aula       = oc.club_aulas
                    const { livres, lotado } = vagasInfo(oc)
                    const minhaRes   = minhasReservas[oc.id]
                    const naFila     = filaCliente[oc.id]
                    const cores      = tipoColor(aula?.tipo||'')
                    const nomeCoach  = aula?.coaches?.nome?.split(' ')[0]||'—'
                    const duracao    = aula?.duracao_min||50
                    const poucasVagas = livres > 0 && livres <= 3
                    const borderColor = minhaRes ? CYAN+'55' : naFila ? AMARELO+'55' : cores.border
                    return (
                      <div key={oc.id} style={{ background:cores.bg, border:`1px solid ${borderColor}`, borderRadius:12, padding:'10px', marginBottom:8, overflow:'hidden' }}>
                        {/* Horário + duração */}
                        <div style={{ fontFamily:"'DM Mono', monospace", fontSize:13, fontWeight:700, color:'#fff', lineHeight:1 }}>
                          {(aula?.horario||'').slice(0,5)}
                        </div>
                        <div style={{ fontSize:10, color:'#888', marginBottom:5 }}>{duracao} min</div>

                        {/* Badge nome da aula */}
                        <div style={{ background:cores.badge, color:cores.text, border:`1px solid ${cores.text}55`, fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:20, letterSpacing:0.4, display:'inline-block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%', marginBottom:5 }}>
                          {tipoLabel(aula?.tipo)}
                        </div>

                        {/* Grupo muscular */}
                        {aula?.grupo_muscular_nome && (
                          <div style={{ fontSize:10, color:'#bbb', marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {aula.grupo_muscular_nome}
                          </div>
                        )}

                        {/* Professor */}
                        <div style={{ fontSize:10, color:'#aaa', marginBottom:6, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          👤 {nomeCoach}
                        </div>

                        {/* Status ou botão */}
                        {minhaRes ? (
                          <div style={{ fontSize:10, color:CYAN, fontWeight:700 }}>✓ Reservado</div>
                        ) : naFila ? (
                          <div style={{ fontSize:10, color:AMARELO, fontWeight:700 }}>⏳ Na fila</div>
                        ) : (
                          <>
                            {poucasVagas && (
                              <div style={{ fontSize:9, fontFamily:"'DM Mono', monospace", fontWeight:700, color:livres===1?'#ff4444':AMARELO, marginBottom:4 }}>
                                {livres===1?'ÚLTIMA VAGA':`${livres} VAGAS`}
                              </div>
                            )}
                            {lotado ? (
                              <button onClick={() => tentarFila(oc)} style={{ width:'100%', background:`${AMARELO}15`, color:AMARELO, border:`1px solid ${AMARELO}55`, borderRadius:8, padding:'5px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                                ⏳ Fila
                              </button>
                            ) : (
                              <button onClick={() => tentarReservar(oc)} style={{ width:'100%', background:ACCENT, color:'#fff', border:'none', borderRadius:8, padding:'6px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                                Reservar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* ── MOBILE: lista do dia selecionado ── */}
        {isMobile && (
          <>
        {loadingOcs ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#444' }}>Carregando aulas...</div>
        ) : ocsFiltradas.length===0 ? (
          <div style={{ background:'#0d0d0d', border:'1px solid #1a1a1a', borderRadius:16, padding:'3rem', textAlign:'center', color:'#444' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📅</div>
            <div style={{ fontSize:14 }}>{isHoje&&ocorrencias.length>0?'Não há mais aulas disponíveis hoje.':'Nenhuma aula disponível neste dia.'}</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {ocsFiltradas.map(oc => {
              const aula=oc.club_aulas; const {livres,lotado}=vagasInfo(oc)
              const minhaRes=minhasReservas[oc.id]; const naFila=filaCliente[oc.id]
              const cores=tipoColor(aula?.tipo||'')
              const isRunning=aula?.tipo==='running_funcional'
              const nomeCoach=aula?.coaches?.nome?.split(' ')[0]||'—'
              const duracao=aula?.duracao_min||50
              const poucasVagas=livres>0&&livres<=3
              const borderColor=minhaRes?CYAN+'55':naFila?AMARELO+'55':cores.border
              return (
                <div key={oc.id} style={{ background:cores.bg, border:`1.5px solid ${borderColor}`, borderRadius:18, overflow:'hidden' }}>
                  {/* Topo: horário à esquerda, badge à direita */}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding: isMobile ? '1rem 1.25rem 0.25rem' : '0.75rem 1rem 0.2rem' }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:3, flexShrink:0 }}>
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize: isMobile ? 20 : 15, fontWeight:700, color:'#fff', lineHeight:1, letterSpacing:-0.5 }}>
                        {(aula?.horario||'').slice(0,5)}
                      </div>
                      <div style={{ fontSize: isMobile ? 11 : 10, color:'#555' }}>{duracao} min</div>
                    </div>
                    <span style={{ background:cores.badge, color:cores.text, border:`1px solid ${cores.text}55`, fontSize: isMobile ? 13 : 11, fontWeight:700, padding: isMobile ? '4px 12px' : '3px 9px', borderRadius:20, letterSpacing:0.5, whiteSpace:'nowrap' }}>
                      {tipoLabel(aula?.tipo)}
                    </span>
                  </div>

                  {/* Grupo muscular + professor alinhados à direita */}
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, padding: isMobile ? '0.5rem 1.25rem 1rem' : '0.35rem 1rem 0.75rem' }}>
                    {aula?.so_mulheres && (
                      <span style={{ background:'#ff2d9b18', color:ACCENT, border:`1px solid ${ACCENT}44`, fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:20 }}>👩 Só mulheres</span>
                    )}
                    {minhaRes && (
                      <div style={{ background:`${CYAN}18`, border:`1px solid ${CYAN}44`, borderRadius:20, padding:'3px 10px', fontSize:11, color:CYAN, fontWeight:700 }}>✓ Reservado</div>
                    )}
                    {naFila && (
                      <div style={{ background:`${AMARELO}18`, border:`1px solid ${AMARELO}44`, borderRadius:20, padding:'3px 10px', fontSize:11, color:AMARELO, fontWeight:700 }}>⏳ Na fila</div>
                    )}
                    {!minhaRes && !naFila && poucasVagas && (
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, fontWeight:700, color:livres===1?'#ff4444':AMARELO }}>
                        {livres===1?'ÚLTIMA VAGA':`${livres} VAGAS`}
                      </div>
                    )}
                    {!minhaRes && !naFila && lotado && (
                      <div style={{ fontFamily:"'DM Mono', monospace", fontSize:11, fontWeight:700, color:'#ff4444' }}>LOTADA</div>
                    )}
                    {aula?.grupo_muscular_nome && (
                      <div style={{ fontSize: isMobile ? 13 : 11, color:'#888' }}>{aula.grupo_muscular_nome}</div>
                    )}
                    <div style={{ fontSize: isMobile ? 13 : 11, color:'#666' }}>👤 {nomeCoach}</div>
                  </div>

                  {/* Botão de ação — full-width, só aparece se não tiver reservado/fila */}
                  {!minhaRes && !naFila && (
                    <div style={{ padding: isMobile ? '0 1.25rem 1.25rem' : '0 1rem 1rem' }}>
                      {lotado ? (
                        <button onClick={() => tentarFila(oc)} style={{
                          width:'100%', background:`${AMARELO}15`, color:AMARELO,
                          border:`1.5px solid ${AMARELO}55`, borderRadius:12,
                          padding: isMobile ? '0.85rem' : '0.6rem', fontSize: isMobile ? 14 : 12, fontWeight:700,
                          cursor:'pointer', fontFamily:"'DM Sans', sans-serif", letterSpacing:0.3
                        }}>
                          ⏳ Entrar na fila de espera
                        </button>
                      ) : (
                        <button onClick={() => tentarReservar(oc)} style={{
                          width:'100%', background:'#cc2580', color:'#fff',
                          border:'none', borderRadius:12,
                          padding: isMobile ? '0.9rem' : '0.65rem', fontSize: isMobile ? 15 : 13, fontWeight:700,
                          cursor:'pointer', fontFamily:"'DM Sans', sans-serif", letterSpacing:0.3
                        }}>
                          Reservar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
          </>
        )}
      </div>

      {modalSemCartao && (
        <div style={{ position:'fixed', inset:0, background:'#000000cc', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#111', border:`1.5px solid ${AMARELO}55`, borderRadius:20, width:'100%', maxWidth:420, padding:'1.5rem' }}>
            <div style={{ fontSize:36, marginBottom:'1rem', textAlign:'center' }}>💳</div>
            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#fff', marginBottom:8, textAlign:'center' }}>CARTÃO NECESSÁRIO</div>
            <div style={{ fontSize:14, color:'#aaa', lineHeight:1.7, marginBottom:'1rem', textAlign:'center' }}>Para reservar aulas no <strong style={{ color:'#fff' }}>JustClub</strong>, precisamos de um cartão cadastrado pra cobrir possíveis multas por faltas.</div>
            <div style={{ background:'#0a0a0a', border:`1px solid ${AMARELO}33`, borderRadius:10, padding:'0.75rem 1rem', marginBottom:'1.5rem', fontSize:13, color:AMARELO, textAlign:'center', fontWeight:600 }}>🔒 Nada será cobrado agora</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setModalSemCartao(false)} style={{ flex:1, background:'transparent', border:'1px solid #333', borderRadius:10, padding:'0.85rem', color:'#888', fontSize:14, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Fechar</button>
              <button onClick={() => router.push('/cadastrar-cartao')} style={{ flex:2, background:AMARELO, color:'#000', border:'none', borderRadius:10, padding:'0.85rem', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Cadastrar cartão →</button>
            </div>
          </div>
        </div>
      )}

      {modalReserva && (
        <div style={{ position:'fixed', inset:0, background:'#000000dd', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:'20px 20px 16px 16px', width:'100%', maxWidth:520, maxHeight:'92vh', overflowY:'auto' }}>
            <div style={{ padding:'1.5rem 1.5rem 1rem', borderBottom:'1px solid #1a1a1a' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#fff', letterSpacing:1 }}>CONFIRMAR RESERVA</div>
                  <div style={{ fontSize:13, color:'#555', marginTop:3 }}>{tipoLabel(modalReserva.club_aulas?.tipo)} · {(modalReserva.club_aulas?.horario||'').slice(0,5)} · {unidade?.nome}</div>
                </div>
                <button onClick={() => setModalReserva(null)} style={{ background:'transparent', border:'none', color:'#555', fontSize:20, cursor:'pointer', padding:'4px 8px' }}>✕</button>
              </div>
            </div>
            <div style={{ padding:'1.25rem 1.5rem' }}>
              <div style={{ marginBottom:'1.5rem' }}>
                <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Usar crédito de qual plano?</div>
                {dataSelEhProximoMes && (
                  <div style={{ background:'#1a1000', border:`1px solid ${AMARELO}44`, borderRadius:8, padding:'0.6rem 1rem', marginBottom:10, fontSize:12, color:AMARELO }}>
                    📅 Estes créditos são de <strong>{nomeMesProximo}</strong>
                  </div>
                )}
                {planosDisponiveis.length===0 ? (
                  <div style={{ background:'#1a1000', border:'1px solid #ff660033', borderRadius:10, padding:'1rem', fontSize:13, color:AMARELO }}>
                    ⚠️ Você não tem créditos disponíveis para {dataSelEhProximoMes ? nomeMesProximo : 'esta unidade'}.
                  </div>
                ) : planosDisponiveis.map(p => {
                  const {label,icon}=parsePlanoKey(p); const info=saldoParaData()[p]
                  return (
                    <div key={p} onClick={() => setTipoCredito(p)}
                      style={{ border:`1.5px solid ${tipoCredito===p?ACCENT:'#2a2a2a'}`, background:tipoCredito===p?`${ACCENT}12`:'transparent', borderRadius:10, padding:'0.85rem 1rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:8, transition:'all .15s' }}>
                      <span style={{ fontSize:20 }}>{icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:tipoCredito===p?'#fff':'#888' }}>{label}</div>
                        {info && <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{info.disponivel} crédito{info.disponivel!==1?'s':''} restante{info.disponivel!==1?'s':''} em {dataSelEhProximoMes?nomeMesProximo:'este mês'}</div>}
                      </div>
                      <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${tipoCredito===p?ACCENT:'#444'}`, background:tipoCredito===p?ACCENT:'transparent', flexShrink:0 }}/>
                    </div>
                  )
                })}
              </div>

              {modalReserva.club_aulas?.tipo === 'running_funcional' && (
                <div style={{ marginBottom:'1.5rem' }}>
                  <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:1, marginBottom:14 }}>Escolha sua posição</div>
                  {posicoes.length===0 ? (
                    <div style={{ fontSize:13, color:'#444', textAlign:'center', padding:'1.5rem' }}>Carregando posições...</div>
                  ) : (
                    <div style={{ background:'#080808', border:'1px solid #1a1a1a', borderRadius:16, padding:'1.25rem 1rem' }}>
                      <div style={{ marginBottom:'1.25rem' }}>
                        <div style={{ fontSize:10, color:'#444', letterSpacing:2, marginBottom:10, textAlign:'center' }}>ESTEIRAS</div>
                        <div style={{ overflowX:'auto', paddingBottom:4 }}>
                          <div style={{ display:'flex', gap:4, flexWrap:'nowrap', minWidth:'max-content', margin:'0 auto', width:'fit-content' }}>
                            {posicoes.filter((p:any) => p.tipo==='R').sort((a:any,b:any) => b.numero-a.numero).map((pos:any) => {
                              const label = `R${String(pos.numero).padStart(2,'0')}`
                              return <PosicaoBtn key={pos.id} label={label} tomado={posicoesTomadas.includes(label)} selecionado={posicaoSel===label} cor={ACCENT} onClick={() => setPosicaoSel(posicaoSel===label?'':label)}/>
                            })}
                          </div>
                        </div>
                      </div>
                      <div style={{ height:1, background:'#1a1a1a', marginBottom:'1.25rem' }}/>
                      <div>
                        <div style={{ fontSize:10, color:'#444', letterSpacing:2, marginBottom:10, textAlign:'center' }}>FUNCIONAL</div>
                        <div style={{ display:'flex', gap:5, justifyContent:'center', marginBottom:5 }}>
                          {posicoes.filter((p:any) => p.tipo==='F' && p.numero%2===1).sort((a:any,b:any) => b.numero-a.numero).map((pos:any) => {
                            const label = `F${String(pos.numero).padStart(2,'0')}`
                            return <PosicaoBtn key={pos.id} label={label} tomado={posicoesTomadas.includes(label)} selecionado={posicaoSel===label} cor={VERDE} onClick={() => setPosicaoSel(posicaoSel===label?'':label)}/>
                          })}
                        </div>
                        <div style={{ display:'flex', gap:5, justifyContent:'center', paddingLeft:27 }}>
                          {posicoes.filter((p:any) => p.tipo==='F' && p.numero%2===0).sort((a:any,b:any) => b.numero-a.numero).map((pos:any) => {
                            const label = `F${String(pos.numero).padStart(2,'0')}`
                            return <PosicaoBtn key={pos.id} label={label} tomado={posicoesTomadas.includes(label)} selecionado={posicaoSel===label} cor={VERDE} onClick={() => setPosicaoSel(posicaoSel===label?'':label)}/>
                          })}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:'1rem', marginTop:14, paddingTop:12, borderTop:'1px solid #1a1a1a', justifyContent:'center', flexWrap:'wrap' }}>
                        {[['#252525','#444','Disponível'],['#0a0a0a','#222','Ocupado'],[`${ACCENT}20`,ACCENT,'R selecionado'],[`${VERDE}20`,VERDE,'F selecionado']].map(([bg,cor,txt]) => (
                          <span key={txt} style={{ fontSize:10, color:cor==='#222'?'#333':cor, display:'flex', alignItems:'center', gap:5 }}>
                            <span style={{ width:12, height:12, background:bg, border:`1.5px solid ${cor}`, borderRadius:3, display:'inline-block', flexShrink:0 }}/>
                            {txt}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ background:'#0a0a0a', border:'1px solid #1a1a1a', borderRadius:10, padding:'0.75rem 1rem', marginBottom:'1.25rem', fontSize:12, color:'#444', lineHeight:1.7 }}>
                ⚠️ Cancelamento gratuito <strong style={{ color:'#666' }}>até 12h antes</strong>. Com fila de espera, prazo reduz para 3h. Falta sem aviso gera multa de <strong style={{ color:'#666' }}>R$49,90</strong>.
              </div>
              {erroModal && <div style={{ background:'#ff2d9b15', border:'1px solid #ff2d9b44', borderRadius:8, padding:'0.6rem 1rem', fontSize:13, color:ACCENT, marginBottom:'1rem' }}>{erroModal}</div>}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setModalReserva(null)} style={{ flex:1, background:'transparent', border:'1px solid #2a2a2a', borderRadius:10, padding:'0.85rem', color:'#555', fontSize:14, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Cancelar</button>
                <button onClick={confirmarReserva} disabled={confirmando||planosDisponiveis.length===0}
                  style={{ flex:2, background:planosDisponiveis.length===0?'#1a1a1a':ACCENT, color:planosDisponiveis.length===0?'#444':'#fff', border:'none', borderRadius:10, padding:'0.85rem', fontWeight:600, fontSize:15, cursor:confirmando||planosDisponiveis.length===0?'default':'pointer', fontFamily:"'DM Sans', sans-serif", opacity:confirmando?0.7:1 }}>
                  {confirmando?'Confirmando...':'Confirmar reserva ✓'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalFila && (
        <div style={{ position:'fixed', inset:0, background:'#000000dd', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#111', border:`1px solid ${AMARELO}33`, borderRadius:'20px 20px 16px 16px', width:'100%', maxWidth:500, padding:'1.5rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:AMARELO, letterSpacing:1 }}>FILA DE ESPERA</div>
                <div style={{ fontSize:13, color:'#555', marginTop:2 }}>{tipoLabel(modalFila.club_aulas?.tipo)} · {(modalFila.club_aulas?.horario||'').slice(0,5)}</div>
              </div>
              <button onClick={() => setModalFila(null)} style={{ background:'transparent', border:'none', color:'#555', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ background:'#1a1000', border:`1px solid ${AMARELO}22`, borderRadius:10, padding:'1rem', marginBottom:'1.25rem', fontSize:13, color:'#888', lineHeight:1.7 }}>
              <div style={{ color:AMARELO, fontWeight:600, marginBottom:6 }}>⚠️ Atenção</div>
              <ul style={{ paddingLeft:'1.2rem', display:'flex', flexDirection:'column', gap:5 }}>
                <li>Cancelamentos são permitidos <strong style={{ color:'#fff' }}>até 3h antes</strong> — vagas podem abrir até esse limite.</li>
                <li>Se uma vaga abrir, <strong style={{ color:'#fff' }}>você será confirmado automaticamente</strong> a qualquer momento até 3h antes do início.</li>
                <li>Após confirmado, as mesmas regras se aplicam. Falta sem aviso gera multa de R$49,90.</li>
              </ul>
            </div>
            <div style={{ marginBottom:'1.25rem' }}>
              <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Usar crédito de qual plano?</div>
              {planosDisponiveis.map(p => {
                const {label,icon}=parsePlanoKey(p)
                return (
                  <div key={p} onClick={() => setTipoCredito(p)}
                    style={{ border:`1.5px solid ${tipoCredito===p?AMARELO:'#2a2a2a'}`, background:tipoCredito===p?`${AMARELO}12`:'transparent', borderRadius:10, padding:'0.75rem 1rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:8, transition:'all .15s' }}>
                    <span style={{ fontSize:18 }}>{icon}</span>
                    <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:600, color:tipoCredito===p?'#fff':'#888' }}>{label}</div></div>
                    <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${tipoCredito===p?AMARELO:'#444'}`, background:tipoCredito===p?AMARELO:'transparent', flexShrink:0 }}/>
                  </div>
                )
              })}
            </div>
            <label style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem', cursor:'pointer', marginBottom:'1.25rem' }}>
              <input type="checkbox" checked={filaAceite} onChange={e => setFilaAceite(e.target.checked)} style={{ marginTop:2, accentColor:AMARELO, width:16, height:16, flexShrink:0 }}/>
              <span style={{ fontSize:13, color:'#777', lineHeight:1.5 }}>Entendi as regras e aceito o agendamento automático se uma vaga abrir.</span>
            </label>
            {erroModal && <div style={{ background:'#ffaa0015', border:'1px solid #ffaa0044', borderRadius:8, padding:'0.6rem 1rem', fontSize:13, color:AMARELO, marginBottom:'1rem' }}>{erroModal}</div>}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setModalFila(null)} style={{ flex:1, background:'transparent', border:'1px solid #2a2a2a', borderRadius:10, padding:'0.85rem', color:'#555', fontSize:14, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Cancelar</button>
              <button onClick={confirmarFila} disabled={entrandoFila}
                style={{ flex:2, background:AMARELO, color:'#000', border:'none', borderRadius:10, padding:'0.85rem', fontWeight:700, fontSize:15, cursor:entrandoFila?'default':'pointer', fontFamily:"'DM Sans', sans-serif", opacity:entrandoFila?0.7:1 }}>
                {entrandoFila?'Entrando...':'Entrar na fila ⏳'}
              </button>
            </div>
          </div>
        </div>
      )}

      {filaConfirmada && (
        <div style={{ position:'fixed', inset:0, background:'#000000dd', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
          <div style={{ background:'#111', border:`2px solid ${AMARELO}55`, borderRadius:20, width:'100%', maxWidth:420, padding:'2rem', textAlign:'center' }}>
            <div style={{ fontSize:52, marginBottom:'0.75rem' }}>⏳</div>
            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:26, color:AMARELO, letterSpacing:1, marginBottom:6 }}>VOCÊ ESTÁ NA FILA!</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:'1.5rem' }}>
              {filaConfirmada.data ? `${filaConfirmada.data.split('-')[2]}/${filaConfirmada.data.split('-')[1]} · ` : ''}
              {tipoLabel(filaConfirmada.oc?.club_aulas?.tipo)} · {(filaConfirmada.oc?.club_aulas?.horario||'').slice(0,5)} · {unidade?.nome}
            </div>
            <div style={{ background:'#1a1200', border:`1px solid ${AMARELO}33`, borderRadius:14, padding:'1.25rem', marginBottom:'1.5rem' }}>
              <div style={{ fontSize:13, color:'#888', marginBottom:8 }}>Sua posição na fila</div>
              <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:52, color:AMARELO, lineHeight:1 }}>#{filaConfirmada.posicao}</div>
            </div>
            <div style={{ background:'#0d0d0d', border:'1px solid #222', borderRadius:12, padding:'1rem', marginBottom:'1.5rem', fontSize:13, color:'#666', lineHeight:1.7, textAlign:'left' }}>
              <div style={{ color:'#aaa', fontWeight:600, marginBottom:6 }}>Lembre-se:</div>
              <ul style={{ paddingLeft:'1.1rem', display:'flex', flexDirection:'column', gap:4 }}>
                <li>Se houver cancelamento, você será <strong style={{ color:'#fff' }}>reservado automaticamente</strong></li>
                <li>Vagas podem abrir até <strong style={{ color:'#fff' }}>3h antes</strong> do início</li>
                <li>Fique atento ao seu email e ao <strong style={{ color:'#fff' }}>Minha Conta</strong></li>
              </ul>
            </div>
            <button onClick={() => setFilaConfirmada(null)} style={{ width:'100%', background:AMARELO, color:'#000', border:'none', borderRadius:12, padding:'0.9rem', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
              Entendido ✓
            </button>
          </div>
        </div>
      )}

      {modalGenero && (
        <div style={{ position:'fixed', inset:0, background:'#000000dd', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
          <div style={{ background:'#111', border:`1.5px solid ${ACCENT}55`, borderRadius:20, width:'100%', maxWidth:380, padding:'2rem', textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:'1rem' }}>👩</div>
            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#fff', marginBottom:8 }}>AULA EXCLUSIVA</div>
            <div style={{ fontSize:14, color:'#888', lineHeight:1.7, marginBottom:'1.5rem' }}>
              O <strong style={{ color:'#fff' }}>Lift for Girls</strong> é uma aula exclusiva para mulheres.
              {!cliente?.sexo && <><br/><br/>Seu perfil não tem o gênero cadastrado. Acesse <strong style={{ color:ACCENT }}>Minha conta</strong> e atualize.</>}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setModalGenero(false)} style={{ flex:1, background:'transparent', border:'1px solid #2a2a2a', borderRadius:10, padding:'0.85rem', color:'#555', fontSize:14, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Fechar</button>
              {!cliente?.sexo && <button onClick={() => router.push('/minha-conta')} style={{ flex:2, background:ACCENT, color:'#fff', border:'none', borderRadius:10, padding:'0.85rem', fontWeight:600, fontSize:14, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>Atualizar perfil →</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AulasPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', background:'#080808', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:32, height:32, border:'4px solid #ff2d9b', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <AulasPageInner/>
    </Suspense>
  )
}
