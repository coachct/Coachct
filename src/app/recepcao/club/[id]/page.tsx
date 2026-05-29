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
  if (lower.startsWith('wellhub'))   return { label:'Wellhub',  icon:'💜' }
  if (lower.startsWith('totalpass')) return { label:'TotalPass', icon:'🔵' }
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

  // Troca de posição
  const [trocandoReserva, setTrocandoReserva] = useState<any>(null)
  const [salvandoTroca,   setSalvandoTroca]   = useState(false)

  const isRunning = ocorrencia?.club_aulas?.tipo === 'running_funcional'

  useEffect(() => { if (ocId) carregarDados() }, [ocId])

  async function carregarDados() {
    setLoadingData(true)
    // Inclui coach_escalado (FK coach_id da ocorrência) — prioridade sobre o coach da grade
    const { data: oc } = await supabase
      .from('club_ocorrencias')
      .select('*, coach_escalado:coaches!coach_id(id, nome), club_aulas(tipo, horario, capacidade, unidade_id, coaches(nome), grupos_musculares(nome), unidades(nome))')
      .eq('id', ocId).maybeSingle()
    setOcorrencia(oc)

    const { data: res } = await supabase
      .from('club_reservas')
      .select('id, status, tipo_credito, posicao, clientes(id, nome, email, telefone)')
      .eq('ocorrencia_id', ocId)
      .neq('status', 'cancelado')
    const sorted = (res || []).sort((a: any, b: any) =>
      (a.clientes?.nome || '').localeCompare(b.clientes?.nome || '', 'pt-BR'))
    setReservas(sorted)
    setPosicoesTomadas(
      sorted.filter((r: any) => ['reservado','presente'].includes(r.status) && r.posicao)
            .map((r: any) => r.posicao)
    )

    if (oc?.club_aulas?.tipo === 'running_funcional' && oc?.club_aulas?.unidade_id) {
      const { data: pos } = await supabase.from('club_posicoes').select('*')
        .eq('unidade_id', oc.club_aulas.unidade_id)
        .eq('ativo', true).order('tipo').order('numero')
      setPosicoes(pos || [])
    }
    setLoadingData(false)
  }

  const hoje     = dataLocalStr(new Date())
  const dataAula = ocorrencia?.data || ''
  const isHoje   = dataAula === hoje
  const isFuturo = dataAula > hoje
  const isPassado = dataAula < hoje

  async function marcarStatus(reservaId: string, status: 'presente' | 'falta') {
    setAtualizando(reservaId)
    await supabase.from('club_reservas').update({ status }).eq('id', reservaId)
    await carregarDados()
    setAtualizando(null)
    showMsg(status === 'presente' ? '✅ Presença marcada!' : '❌ Falta registrada')
  }

  async function confirmarTrocaPosicao(novaPosicao: string) {
    if (!trocandoReserva) return
    setSalvandoTroca(true)
    await supabase.from('club_reservas').update({ posicao: novaPosicao }).eq('id', trocandoReserva.id)
    setTrocandoReserva(null)
    await carregarDados()
    setSalvandoTroca(false)
    showMsg('✅ Posição alterada!')
  }

  async function buscarCliente() {
    if (!buscaTexto.trim()) return
    setBuscando(true)
    const { data } = await supabase.from('clientes').select('id, nome, email, telefone')
      .or(`nome.ilike.%${buscaTexto}%,email.ilike.%${buscaTexto}%,telefone.ilike.%${buscaTexto}%`)
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

    // Se existir reserva cancelada para este cliente nesta ocorrência, reativa em vez de inserir
    const { data: cancelada } = await supabase.from('club_reservas')
      .select('id').eq('ocorrencia_id', ocId).eq('cliente_id', clienteSel.id)
      .eq('status', 'cancelado').maybeSingle()

    let error: any = null
    if (cancelada) {
      const { error: e } = await supabase.from('club_reservas').update({
        tipo_credito: tipoCredito,
        status: isFuturo ? 'reservado' : 'presente',
        ...(isRunning && posicaoSel ? { posicao: posicaoSel } : {}),
      }).eq('id', cancelada.id)
      error = e
    } else {
      const { error: e } = await supabase.from('club_reservas').insert({
        ocorrencia_id: ocId, cliente_id: clienteSel.id, tipo_credito: tipoCredito,
        status: isFuturo ? 'reservado' : 'presente',
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
  // modo: 'view' = somente visualizar | 'walkin' = selecionar nova posição | 'troca' = trocar posição de cliente
  function MapaPosicoes({ modo }: { modo: 'view' | 'walkin' | 'troca' }) {
    const posicaoAtualTroca = trocandoReserva?.posicao

    function estadoPos(label: string) {
      const reserva = reservas.find((r:any) => r.posicao === label && ['reservado','presente'].includes(r.status))
      const tomado  = !!reserva
      const ehTrocando = posicaoAtualTroca === label

      if (modo === 'view') {
        if (!tomado) return { bg:`${ACCENT}15`, border:ACCENT, icon:ACCENT, cursor:'default', nome: null, atual: false }
        return { bg:'#e5e5e5', border:'#bbb', icon:'#bbb', cursor:'default',
          nome: reserva?.clientes?.nome?.split(' ')[0] || '?', atual: false }
      }
      if (modo === 'walkin') {
        if (label === posicaoSel) return { bg:`${ACCENT}15`, border:ACCENT, icon:ACCENT, cursor:'pointer', nome:null, atual:false }
        if (tomado) return { bg:'#f3f4f6', border:'#d1d5db', icon:'#d1d5db', cursor:'not-allowed', nome:null, atual:false }
        return { bg:'#fff', border:'#e5e7eb', icon:'#aaa', cursor:'pointer', nome:null, atual:false }
      }
      // modo troca
      if (ehTrocando) return { bg:`${AMARELO}15`, border:AMARELO, icon:AMARELO, cursor:'default',
        nome: reserva?.clientes?.nome?.split(' ')[0] || '?', atual: true }
      if (tomado) return { bg:'#f3f4f6', border:'#d1d5db', icon:'#d1d5db', cursor:'not-allowed',
        nome: reserva?.clientes?.nome?.split(' ')[0] || '?', atual: false }
      return { bg:'#f0fff4', border:VERDE, icon:VERDE, cursor:'pointer', nome:null, atual:false }
    }

    function handleClick(label: string) {
      if (modo === 'view') return
      if (modo === 'walkin') {
        if (!posicoesTomadas.includes(label)) setPosicaoSel(label)
      }
      if (modo === 'troca') {
        if (label === posicaoAtualTroca) return // mesma posição, sem mudança
        const tomadaPorOutro = posicoesTomadas.includes(label)
        if (tomadaPorOutro) return // posição de outro cliente
        confirmarTrocaPosicao(label)
      }
    }

    function PosBtn({ label, tipo }: { label: string; tipo: 'R'|'F' }) {
      const s = estadoPos(label)
      const tomado = posicoesTomadas.includes(label)
      const clicavel = modo !== 'view' && (!tomado || (modo === 'troca' && label === posicaoAtualTroca))
      return (
        <button
          disabled={modo !== 'view' && tomado && !(modo === 'troca' && !tomado)}
          onClick={() => handleClick(label)}
          title={s.nome ? s.nome : label}
          style={{ border:`1.5px solid ${s.border}`, background:s.bg, borderRadius:8,
            cursor: clicavel ? 'pointer' : s.cursor,
            padding:'4px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:2,
            position:'relative', minWidth:0 }}>
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
            ['#f9fafb','#e5e7eb','Livre'],
            [`${ACCENT}10`,ACCENT,'Ocupado'],
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

      {/* Mapa permanente — só Running */}
      {isRunning && posicoes.length > 0 && !trocandoReserva && (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, marginBottom:'1.5rem', overflow:'hidden' }}>
          <div style={{ padding:'0.85rem 1.5rem', borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>Mapa de posições</div>
          </div>
          <div style={{ padding:'1rem' }}>
            <MapaPosicoes modo="view" />
          </div>
        </div>
      )}

      {/* Modal de troca de posição */}
      {trocandoReserva && (
        <div style={{ background:'#fff', border:`2px solid ${AMARELO}`, borderRadius:16, marginBottom:'1.5rem', overflow:'hidden' }}>
          <div style={{ padding:'0.85rem 1.5rem', borderBottom:'1px solid #f3f4f6', background:`${AMARELO}08`,
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>
                Trocando posição de <strong>{trocandoReserva.clientes?.nome?.split(' ')[0]}</strong>
              </div>
              <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>
                Posição atual: <span style={{ fontFamily:"'DM Mono', monospace", fontWeight:700, color:AMARELO }}>{trocandoReserva.posicao || '—'}</span>
                {' '}· Clique em uma posição verde para trocar
              </div>
            </div>
            <button onClick={() => setTrocandoReserva(null)}
              style={{ background:'transparent', border:'none', color:'#aaa', cursor:'pointer', fontSize:20 }}>✕</button>
          </div>
          <div style={{ padding:'1rem' }}>
            <MapaPosicoes modo="troca" />
            <div style={{ display:'flex', gap:8, marginTop:'1rem' }}>
              <button onClick={() => setTrocandoReserva(null)}
                style={{ flex:1, background:'#f3f4f6', border:'none', borderRadius:10,
                  padding:'0.75rem', fontSize:13, color:'#555', cursor:'pointer' }}>
                Cancelar
              </button>
            </div>
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
              const isReservado = r.status === 'reservado'

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
                      <span style={{ fontSize:11, color:'#888' }}>{icon} {label}</span>
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
                    {isReservado && <span style={{ fontSize:11, color:isFuturo?CYAN:'#aaa' }}>{isFuturo?'📅 AGENDADO':'Aguardando'}</span>}
                  </div>

                  {/* Botão trocar posição — só Running */}
                  {isRunning && !isFalta && (
                    <button onClick={() => setTrocandoReserva(r)}
                      style={{ padding:'0.3rem 0.7rem', borderRadius:8, border:`1.5px solid ${AMARELO}`,
                        background:`${AMARELO}10`, color:'#b45309', fontSize:11, fontWeight:600,
                        cursor:'pointer', flexShrink:0, fontFamily:"'DM Sans', sans-serif" }}>
                      Trocar
                    </button>
                  )}

                  {!isFalta && (
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <button onClick={() => marcarStatus(r.id, 'presente')} disabled={isPresente||atualizando===r.id}
                        style={{ padding:'0.35rem 0.75rem', borderRadius:8, border:`1.5px solid ${isPresente?VERDE:'#e5e7eb'}`,
                          background:isPresente?VERDE:'#fff', color:isPresente?'#fff':'#555',
                          fontSize:12, fontWeight:600, cursor:isPresente?'default':'pointer',
                          opacity:atualizando===r.id?0.5:1, fontFamily:"'DM Sans', sans-serif" }}>
                        ✓
                      </button>
                      <button onClick={() => marcarStatus(r.id, 'falta')} disabled={isFalta||atualizando===r.id}
                        style={{ padding:'0.35rem 0.75rem', borderRadius:8, border:`1.5px solid ${isFalta?VERMELHO:'#e5e7eb'}`,
                          background:isFalta?VERMELHO:'#fff', color:isFalta?'#fff':'#888',
                          fontSize:12, fontWeight:600, cursor:isFalta?'default':'pointer',
                          opacity:atualizando===r.id?0.5:1, fontFamily:"'DM Sans', sans-serif" }}>
                        ✗
                      </button>
                    </div>
                  )}

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
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  <input value={buscaTexto} onChange={e => setBuscaTexto(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && buscarCliente()}
                    placeholder="Buscar por nome, email ou telefone..."
                    style={{ flex:1, border:'1px solid #e5e7eb', borderRadius:8, padding:'0.65rem 1rem',
                      fontSize:13, color:'#111', fontFamily:"'DM Sans', sans-serif", outline:'none' }}/>
                  <button onClick={buscarCliente} disabled={buscando}
                    style={{ background:ACCENT, color:'#fff', border:'none', borderRadius:8,
                      padding:'0.65rem 1.25rem', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                    {buscando?'...':'Buscar'}
                  </button>
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
