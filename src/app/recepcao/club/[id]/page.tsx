'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT  = '#ff2d9b'
const VERDE   = '#2ddd8b'
const AMARELO = '#ffaa00'
const VERMELHO = '#ff4444'

function tipoLabel(t: string) {
  if (t==='lift')             return 'Lift'
  if (t==='lift_for_girls')  return 'Lift for Girls'
  if (t==='running_funcional') return 'Running + Funcional'
  return t
}
function parsePlanoKey(key: string) {
  const lower = (key||'').toLowerCase()
  if (lower.startsWith('wellhub'))   return { label:'Wellhub',  icon:'💜' }
  if (lower.startsWith('totalpass')) return { label:'TotalPass', icon:'🔵' }
  return { label: key, icon:'🎟️' }
}

export default function RecepcaoClubDetalhe() {
  const { id: ocId } = useParams<{ id: string }>()
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const supabase = createClient()

  const [ocorrencia, setOcorrencia] = useState<any>(null)
  const [reservas,   setReservas]   = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [atualizando, setAtualizando] = useState<string | null>(null)
  const [msg,         setMsg]         = useState('')

  // Walk-in: agendar cliente direto
  const [buscaTexto,  setBuscaTexto]  = useState('')
  const [resultados,  setResultados]  = useState<any[]>([])
  const [buscando,    setBuscando]    = useState(false)
  const [clienteSel,  setClienteSel]  = useState<any>(null)
  const [saldoCliente,setSaldoCliente]= useState<Record<string,any>>({})
  const [tipoCredito, setTipoCredito] = useState('')
  const [agendando,   setAgendando]   = useState(false)
  const [erroAgendar, setErroAgendar] = useState('')

  useEffect(() => { if (ocId) carregarDados() }, [ocId])

  async function carregarDados() {
    setLoadingData(true)
    const { data: oc } = await supabase
      .from('club_ocorrencias')
      .select('*, club_aulas(tipo, horario, capacidade, unidade_id, coaches(nome), grupos_musculares(nome), unidades(nome))')
      .eq('id', ocId).maybeSingle()
    setOcorrencia(oc)

    const { data: res } = await supabase
      .from('club_reservas')
      .select('*, clientes(id, nome, email, telefone)')
      .eq('ocorrencia_id', ocId)
      .neq('status', 'cancelado')
      .order('created_at')
    setReservas(res || [])
    setLoadingData(false)
  }

  async function marcarStatus(reservaId: string, status: 'presente' | 'falta') {
    setAtualizando(reservaId)
    await supabase.from('club_reservas').update({ status }).eq('id', reservaId)
    await carregarDados()
    setAtualizando(null)
    showMsg(status === 'presente' ? '✅ Presença marcada!' : '❌ Falta registrada')
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
    setClienteSel(cli)
    setResultados([])
    setBuscaTexto('')
    setTipoCredito('')
    setErroAgendar('')

    if (!ocorrencia?.club_aulas?.unidade_id) return
    const agora = new Date()
    const dataOc = new Date(ocorrencia.data + 'T12:00:00')
    const mes = dataOc.getMonth() + 1
    const ano = dataOc.getFullYear()
    const { data } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: cli.id, p_mes: mes, p_ano: ano,
      p_unidade_id: ocorrencia.club_aulas.unidade_id,
    })
    setSaldoCliente(data || {})
  }

  async function agendarWalkin() {
    if (!tipoCredito) { setErroAgendar('Selecione o plano.'); return }
    if (!clienteSel || !ocorrencia) return
    setAgendando(true); setErroAgendar('')

    const { error } = await supabase.from('club_reservas').insert({
      ocorrencia_id: ocId,
      cliente_id:    clienteSel.id,
      tipo_credito:  tipoCredito,
      status:        'presente', // walk-in já marca presente direto
    })
    if (error) { setErroAgendar('Erro: ' + error.message); setAgendando(false); return }

    setAgendando(false)
    setClienteSel(null)
    setTipoCredito('')
    setSaldoCliente({})
    await carregarDados()
    showMsg('✅ Cliente adicionado e marcado como presente!')
  }

  function showMsg(texto: string) { setMsg(texto); setTimeout(() => setMsg(''), 3000) }

  const aula     = ocorrencia?.club_aulas
  const presentes = reservas.filter(r => r.status === 'presente').length
  const faltas    = reservas.filter(r => r.status === 'falta').length
  const aguardando = reservas.filter(r => r.status === 'reservado').length
  const planosDisp = Object.entries(saldoCliente).filter(([,v]:any) => v?.disponivel > 0).map(([k]) => k)

  if (loading || loadingData) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ width:32, height:32, border:`4px solid ${ACCENT}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
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
        <div>
          <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:24, color:'#111', letterSpacing:1 }}>
            {tipoLabel(aula?.tipo)} — {(aula?.horario||'').slice(0,5)}
          </div>
          <div style={{ fontSize:13, color:'#888', marginTop:2 }}>
            {aula?.grupos_musculares?.nome} · {aula?.coaches?.nome?.split(' ')[0]} ·{' '}
            {ocorrencia?.data ? new Date(ocorrencia.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'}) : ''}
          </div>
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'0.75rem 1.25rem',
          marginBottom:'1rem', fontSize:13, color:'#166534', fontWeight:600 }}>{msg}</div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:'1.5rem' }}>
        {[
          { label:'Reservas', value: reservas.length, cor:'#111' },
          { label:'Presentes', value: presentes, cor: VERDE },
          { label:'Aguardando', value: aguardando, cor: AMARELO },
          { label:'Faltas', value: faltas, cor: VERMELHO },
        ].map(s => (
          <div key={s.label} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'1rem', textAlign:'center' }}>
            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:36, color: s.cor, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:11, color:'#aaa', marginTop:4, textTransform:'uppercase', letterSpacing:0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Lista de reservas */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, marginBottom:'1.5rem', overflow:'hidden' }}>
        <div style={{ padding:'1rem 1.5rem', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>Lista de alunos</div>
          <div style={{ fontSize:12, color:'#aaa' }}>{reservas.length} de {aula?.capacidade || '—'} vagas</div>
        </div>

        {reservas.length === 0 ? (
          <div style={{ padding:'2rem', textAlign:'center', color:'#aaa', fontSize:14 }}>Nenhuma reserva para esta aula.</div>
        ) : (
          <div>
            {reservas.map((r, i) => {
              const cli  = r.clientes
              const { label, icon } = parsePlanoKey(r.tipo_credito || '')
              const isPresente  = r.status === 'presente'
              const isFalta     = r.status === 'falta'
              const isReservado = r.status === 'reservado'

              return (
                <div key={r.id} style={{ display:'flex', alignItems:'center', gap:'1rem', padding:'0.85rem 1.5rem',
                  borderBottom: i < reservas.length - 1 ? '1px solid #f3f4f6' : 'none',
                  background: isPresente ? '#f0fdf4' : isFalta ? '#fff5f5' : '#fff' }}>

                  {/* Número */}
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'#f3f4f6',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#888', flexShrink:0 }}>
                    {i+1}
                  </div>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111', marginBottom:2 }}>{cli?.nome || '—'}</div>
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, color:'#888' }}>{icon} {label}</span>
                      {r.posicao && (
                        <span style={{ fontSize:11, fontFamily:"'DM Mono', monospace", fontWeight:700,
                          color:'#555', background:'#f3f4f6', padding:'1px 7px', borderRadius:6 }}>
                          {r.posicao}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div style={{ flexShrink:0, marginRight:8 }}>
                    {isPresente && <span style={{ fontSize:11, fontWeight:700, color:VERDE }}>✓ PRESENTE</span>}
                    {isFalta    && <span style={{ fontSize:11, fontWeight:700, color:VERMELHO }}>✗ FALTA</span>}
                    {isReservado && <span style={{ fontSize:11, color:'#aaa' }}>Aguardando</span>}
                  </div>

                  {/* Botões */}
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button onClick={() => marcarStatus(r.id, 'presente')} disabled={isPresente || atualizando === r.id}
                      style={{ padding:'0.35rem 0.85rem', borderRadius:8, border:`1.5px solid ${isPresente?VERDE:'#e5e7eb'}`,
                        background: isPresente ? VERDE : '#fff', color: isPresente ? '#fff' : '#555',
                        fontSize:12, fontWeight:600, cursor: isPresente ? 'default' : 'pointer',
                        opacity: atualizando === r.id ? 0.5 : 1, fontFamily:"'DM Sans', sans-serif" }}>
                      ✓ Presente
                    </button>
                    <button onClick={() => marcarStatus(r.id, 'falta')} disabled={isFalta || atualizando === r.id}
                      style={{ padding:'0.35rem 0.85rem', borderRadius:8, border:`1.5px solid ${isFalta?VERMELHO:'#e5e7eb'}`,
                        background: isFalta ? VERMELHO : '#fff', color: isFalta ? '#fff' : '#888',
                        fontSize:12, fontWeight:600, cursor: isFalta ? 'default' : 'pointer',
                        opacity: atualizando === r.id ? 0.5 : 1, fontFamily:"'DM Sans', sans-serif" }}>
                      ✗ Falta
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Walk-in: adicionar cliente */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:16, overflow:'hidden' }}>
        <div style={{ padding:'1rem 1.5rem', borderBottom:'1px solid #f3f4f6' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>➕ Adicionar cliente (walk-in)</div>
          <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>Cliente chegou direto na unidade sem reserva prévia</div>
        </div>
        <div style={{ padding:'1.25rem 1.5rem' }}>

          {!clienteSel ? (
            <>
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <input
                  value={buscaTexto}
                  onChange={e => setBuscaTexto(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && buscarCliente()}
                  placeholder="Buscar por nome, email ou telefone..."
                  style={{ flex:1, border:'1px solid #e5e7eb', borderRadius:8, padding:'0.65rem 1rem',
                    fontSize:13, color:'#111', fontFamily:"'DM Sans', sans-serif", outline:'none' }}/>
                <button onClick={buscarCliente} disabled={buscando}
                  style={{ background: ACCENT, color:'#fff', border:'none', borderRadius:8,
                    padding:'0.65rem 1.25rem', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                  {buscando ? '...' : 'Buscar'}
                </button>
              </div>

              {resultados.length > 0 && (
                <div style={{ border:'1px solid #e5e7eb', borderRadius:8, overflow:'hidden' }}>
                  {resultados.map((cli, i) => (
                    <button key={cli.id} onClick={() => selecionarCliente(cli)}
                      style={{ display:'flex', alignItems:'center', gap:'0.75rem', width:'100%',
                        padding:'0.75rem 1rem', background:'#fff', border:'none',
                        borderBottom: i < resultados.length - 1 ? '1px solid #f3f4f6' : 'none',
                        cursor:'pointer', textAlign:'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background='#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.background='#fff')}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:`${ACCENT}20`,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color: ACCENT, flexShrink:0 }}>
                        {cli.nome?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600, color:'#111' }}>{cli.nome}</div>
                        <div style={{ fontSize:11, color:'#aaa' }}>{cli.email || cli.telefone}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div>
              {/* Cliente selecionado */}
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'#f9fafb',
                border:'1px solid #e5e7eb', borderRadius:10, padding:'0.75rem 1rem', marginBottom:'1rem' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:`${ACCENT}20`,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color: ACCENT }}>
                  {clienteSel.nome?.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'#111' }}>{clienteSel.nome}</div>
                  <div style={{ fontSize:11, color:'#aaa' }}>{clienteSel.email}</div>
                </div>
                <button onClick={() => { setClienteSel(null); setSaldoCliente({}); setTipoCredito('') }}
                  style={{ background:'transparent', border:'none', color:'#aaa', cursor:'pointer', fontSize:16 }}>✕</button>
              </div>

              {/* Planos disponíveis */}
              {planosDisp.length === 0 ? (
                <div style={{ background:'#fff8f0', border:'1px solid #fed7aa', borderRadius:8, padding:'0.75rem 1rem',
                  fontSize:13, color:'#9a3412', marginBottom:'1rem' }}>
                  ⚠️ Cliente sem créditos disponíveis para esta unidade neste mês.
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
                            background: tipoCredito===p?`${ACCENT}10`:'#fff', cursor:'pointer',
                            fontSize:13, fontWeight:600, color: tipoCredito===p?ACCENT:'#555',
                            fontFamily:"'DM Sans', sans-serif" }}>
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
                <button onClick={() => { setClienteSel(null); setSaldoCliente({}); setTipoCredito('') }}
                  style={{ flex:1, background:'#f3f4f6', border:'none', borderRadius:10,
                    padding:'0.85rem', fontSize:13, color:'#555', cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                  Cancelar
                </button>
                <button onClick={agendarWalkin} disabled={agendando || planosDisp.length === 0}
                  style={{ flex:2, background: planosDisp.length===0?'#e5e7eb':ACCENT, color: planosDisp.length===0?'#aaa':'#fff',
                    border:'none', borderRadius:10, padding:'0.85rem', fontSize:13, fontWeight:600,
                    cursor: agendando || planosDisp.length===0?'default':'pointer',
                    fontFamily:"'DM Sans', sans-serif", opacity: agendando?0.7:1 }}>
                  {agendando ? 'Adicionando...' : '✓ Confirmar presença'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
