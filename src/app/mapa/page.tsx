'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'

const ACCENT  = '#ff2d9b'
const VERDE   = '#2ddd8b'
const AMARELO = '#ffaa00'

function parsePlanoKey(key: string): { label: string; icon: string } {
  const lower = (key||'').toLowerCase()
  if (lower.startsWith('wellhub'))   return { label: 'Wellhub',   icon: '💜' }
  if (lower.startsWith('totalpass')) return { label: 'TotalPass', icon: '🔵' }
  return { label: key, icon: '🎟️' }
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

function MapaPageInner() {
  const router    = useRouter()
  const params    = useSearchParams()
  const ocId      = params.get('ocorrencia') || ''
  const unidadeId = params.get('unidade') || ''
  const { user, perfil, loading: loadingAuth } = useAuth()
  const supabase  = createClient()

  const [ocorrencia,      setOcorrencia]      = useState<any>(null)
  const [posicoes,        setPosicoes]        = useState<any[]>([])
  const [posicoesTomadas, setPosicoesTomadas] = useState<string[]>([])
  const [posicaoSel,      setPosicaoSel]      = useState('')
  const [cliente,         setCliente]         = useState<any>(null)
  const [saldo,           setSaldo]           = useState<Record<string,any>>({})
  const [loading,         setLoading]         = useState(true)

  const [modalAberto, setModalAberto] = useState(false)
  const [tipoCredito, setTipoCredito] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [erroModal,   setErroModal]   = useState('')

  useEffect(() => {
    if (loadingAuth) return
    if (!ocId || !unidadeId) { router.replace('/agendar'); return }
    if (!user) { router.push(`/login?redirect=${encodeURIComponent(`/mapa?ocorrencia=${ocId}&unidade=${unidadeId}`)}`); return }
    carregarTudo()
  }, [ocId, unidadeId, user, loadingAuth])

  useEffect(() => {
    if (loadingAuth) return
    if (perfil) carregarCliente()
  }, [perfil])

  async function carregarTudo() {
    setLoading(true)
    const [{ data: oc }, { data: pos }, { data: tomadas }] = await Promise.all([
      supabase.from('club_ocorrencias')
        .select('*, club_aulas(tipo, horario, capacidade, coaches(nome), grupos_musculares(nome))')
        .eq('id', ocId).maybeSingle(),
      supabase.from('club_posicoes').select('*')
        .eq('unidade_id', unidadeId).eq('ativo', true).order('tipo').order('numero'),
      // Usa RPC para contornar RLS — retorna só posicoes tomadas sem dados pessoais
      supabase.rpc('posicoes_tomadas', { p_ocorrencia_id: ocId }),
    ])
    setOcorrencia(oc)
    setPosicoes(pos || [])
    setPosicoesTomadas((tomadas || []).map((t: any) => t.posicao).filter(Boolean))
    setLoading(false)
  }

  async function carregarCliente() {
    if (!perfil) return
    const { data } = await supabase.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
    setCliente(data)
    if (data && unidadeId) {
      const agora = new Date()
      const { data: s } = await supabase.rpc('saldo_creditos_cliente', {
        p_cliente_id: data.id, p_mes: agora.getMonth()+1, p_ano: agora.getFullYear(), p_unidade_id: unidadeId,
      })
      setSaldo(s || {})
    }
  }

  async function confirmarReserva() {
    if (!tipoCredito) { setErroModal('Selecione o plano.'); return }
    if (!posicaoSel || !cliente) return
    setConfirmando(true); setErroModal('')
    const { error } = await supabase.from('club_reservas').insert({
      ocorrencia_id: ocId, cliente_id: cliente.id, tipo_credito: tipoCredito,
      posicao: posicaoSel, status: 'reservado',
    })
    if (error) { setErroModal('Erro ao reservar: '+error.message); setConfirmando(false); return }
    router.push('/minha-conta')
  }

  const planosDisponiveis = Object.entries(saldo).filter(([,v]:any) => v?.disponivel > 0).map(([k]) => k)

  const aula    = ocorrencia?.club_aulas
  const horario = (aula?.horario||'').slice(0,5)
  const coach   = aula?.coaches?.nome?.split(' ')[0] || '—'
  const grupo   = aula?.grupos_musculares?.nome || '—'
  const dataStr = ocorrencia?.data || ''
  const dataFmt = dataStr ? new Date(dataStr+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'}) : ''

  const posR     = posicoes.filter((p:any) => p.tipo==='R').sort((a:any,b:any) => b.numero-a.numero)
  const posF_imp = posicoes.filter((p:any) => p.tipo==='F' && p.numero%2===1).sort((a:any,b:any) => b.numero-a.numero)
  const posF_par = posicoes.filter((p:any) => p.tipo==='F' && p.numero%2===0).sort((a:any,b:any) => b.numero-a.numero)

  function corBtn(label: string) {
    const tomado     = posicoesTomadas.includes(label)
    const selecionado = posicaoSel === label
    if (tomado)      return { borderColor:'#111', bg:'#0a0a0a', iconColor:'#1a1a1a', labelColor:'#1a1a1a' }
    if (selecionado) return { borderColor:'#333', bg:'#1a1a1a', iconColor:'#333', labelColor:'#444' }
    return                  { borderColor:ACCENT, bg:`${ACCENT}18`, iconColor:ACCENT, labelColor:ACCENT }
  }

  if (loading) return (
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
        .pos-btn{transition:all .15s;}
        .pos-btn:hover:not(:disabled){opacity:0.8;}
      `}</style>

      <SiteHeader/>

      <div style={{ maxWidth:700, margin:'0 auto', padding:'5.5rem 1rem 6rem' }}>

        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.25rem' }}>
          <button onClick={() => router.push(`/aulas?unidade=${unidadeId}`)}
            style={{ background:'transparent', border:'1px solid #2a2a2a', borderRadius:'50%', width:36, height:36,
              color:'#666', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>‹</button>
          <div>
            <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#fff', letterSpacing:1 }}>
              RUNNING + FUNCIONAL
            </div>
            <div style={{ fontSize:12, color:'#555', marginTop:1 }}>
              {dataFmt} · {horario} · {coach} · {grupo}
            </div>
          </div>
        </div>

        <div style={{ fontSize:12, color:'#444', marginBottom:'1.5rem', textAlign:'center', lineHeight:1.5 }}>
          Escolha a posição por onde deseja iniciar o treino.
        </div>

        <div style={{ background:'#0d0d0d', border:'1px solid #1a1a1a', borderRadius:16, padding:'1.25rem 0.75rem' }}>

          {/* Esteiras */}
          <div style={{ marginBottom:'1.5rem' }}>
            <div style={{ fontSize:10, color:'#444', letterSpacing:2, textAlign:'center', marginBottom:10 }}>ESTEIRAS</div>
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${posR.length}, 1fr)`, gap:3 }}>
              {posR.map((pos:any) => {
                const label = `R${String(pos.numero).padStart(2,'0')}`
                const s = corBtn(label)
                const tomado = posicoesTomadas.includes(label)
                return (
                  <button key={pos.id} className="pos-btn" disabled={tomado}
                    onClick={() => { if (!tomado) { setPosicaoSel(label); setModalAberto(true) } }}
                    style={{ border:`1.5px solid ${s.borderColor}`, background:s.bg, borderRadius:8,
                      cursor:tomado?'not-allowed':'pointer', padding:'6px 0',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ width:'70%', maxWidth:36 }}><IconEsteira color={s.iconColor}/></div>
                    <span style={{ fontSize:8, fontFamily:"'DM Mono', monospace", fontWeight:700, color:s.labelColor, lineHeight:1 }}>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ height:1, background:'#1a1a1a', marginBottom:'1.5rem', marginLeft:'-0.75rem', marginRight:'-0.75rem' }}/>

          {/* Funcional */}
          <div>
            <div style={{ fontSize:10, color:'#444', letterSpacing:2, textAlign:'center', marginBottom:10 }}>FUNCIONAL</div>
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${posF_imp.length}, 1fr)`, gap:3, marginBottom:3 }}>
              {posF_imp.map((pos:any) => {
                const label = `F${String(pos.numero).padStart(2,'0')}`
                const s = corBtn(label)
                const tomado = posicoesTomadas.includes(label)
                return (
                  <button key={pos.id} className="pos-btn" disabled={tomado}
                    onClick={() => { if (!tomado) { setPosicaoSel(label); setModalAberto(true) } }}
                    style={{ border:`1.5px solid ${s.borderColor}`, background:s.bg, borderRadius:8,
                      cursor:tomado?'not-allowed':'pointer', padding:'6px 0',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ width:'70%', maxWidth:36 }}><IconHaltere color={s.iconColor}/></div>
                    <span style={{ fontSize:8, fontFamily:"'DM Mono', monospace", fontWeight:700, color:s.labelColor, lineHeight:1 }}>{label}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ paddingLeft:`calc(100% / ${posF_imp.length * 2})` }}>
              <div style={{ display:'grid', gridTemplateColumns:`repeat(${posF_par.length}, 1fr)`, gap:3 }}>
                {posF_par.map((pos:any) => {
                  const label = `F${String(pos.numero).padStart(2,'0')}`
                  const s = corBtn(label)
                  const tomado = posicoesTomadas.includes(label)
                  return (
                    <button key={pos.id} className="pos-btn" disabled={tomado}
                      onClick={() => { if (!tomado) { setPosicaoSel(label); setModalAberto(true) } }}
                      style={{ border:`1.5px solid ${s.borderColor}`, background:s.bg, borderRadius:8,
                        cursor:tomado?'not-allowed':'pointer', padding:'6px 0',
                        display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <div style={{ width:'70%', maxWidth:36 }}><IconHaltere color={s.iconColor}/></div>
                      <span style={{ fontSize:8, fontFamily:"'DM Mono', monospace", fontWeight:700, color:s.labelColor, lineHeight:1 }}>{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Legenda */}
          <div style={{ display:'flex', gap:'1.25rem', marginTop:16, paddingTop:12, borderTop:'1px solid #1a1a1a', justifyContent:'center', flexWrap:'wrap' }}>
            {[[`${ACCENT}18`,ACCENT,'Disponível'],['#0a0a0a','#222','Ocupado']].map(([bg,cor,txt]) => (
              <span key={txt} style={{ fontSize:10, color:cor==='#222'?'#333':cor, display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:12, height:12, background:bg, border:`1.5px solid ${cor}`, borderRadius:3, display:'inline-block', flexShrink:0 }}/>
                {txt}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Modal confirmação */}
      {modalAberto && posicaoSel && (
        <div style={{ position:'fixed', inset:0, background:'#000000dd', zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:'1rem' }}>
          <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:'20px 20px 16px 16px', width:'100%', maxWidth:480, padding:'1.5rem' }}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:20, color:'#fff', letterSpacing:1 }}>CONFIRMAR RESERVA</div>
                <div style={{ fontSize:13, color:'#555', marginTop:2 }}>
                  Posição <strong style={{ color:ACCENT, fontFamily:"'DM Mono', monospace" }}>{posicaoSel}</strong> · {horario} · {dataFmt}
                </div>
              </div>
              <button onClick={() => { setModalAberto(false); setPosicaoSel('') }}
                style={{ background:'transparent', border:'none', color:'#555', fontSize:20, cursor:'pointer' }}>✕</button>
            </div>

            <div style={{ marginBottom:'1.25rem' }}>
              <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Usar crédito de qual plano?</div>
              {planosDisponiveis.length === 0 ? (
                <div style={{ background:'#1a1000', border:'1px solid #ff660033', borderRadius:10, padding:'0.85rem', fontSize:13, color:AMARELO }}>
                  ⚠️ Sem créditos disponíveis para esta unidade.
                </div>
              ) : planosDisponiveis.map(p => {
                const { label, icon } = parsePlanoKey(p); const info = saldo[p]
                return (
                  <div key={p} onClick={() => setTipoCredito(p)}
                    style={{ border:`1.5px solid ${tipoCredito===p?ACCENT:'#2a2a2a'}`, background:tipoCredito===p?`${ACCENT}12`:'transparent',
                      borderRadius:10, padding:'0.75rem 1rem', cursor:'pointer', display:'flex', alignItems:'center',
                      gap:'0.75rem', marginBottom:8, transition:'all .15s' }}>
                    <span style={{ fontSize:20 }}>{icon}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:tipoCredito===p?'#fff':'#888' }}>{label}</div>
                      {info && <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{info.disponivel} crédito{info.disponivel!==1?'s':''} restante{info.disponivel!==1?'s':''}</div>}
                    </div>
                    <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${tipoCredito===p?ACCENT:'#444'}`,
                      background:tipoCredito===p?ACCENT:'transparent', flexShrink:0 }}/>
                  </div>
                )
              })}
            </div>

            <div style={{ background:'#0a0a0a', border:'1px solid #1a1a1a', borderRadius:10, padding:'0.65rem 1rem',
              marginBottom:'1rem', fontSize:12, color:'#444', lineHeight:1.6 }}>
              ⚠️ Cancelamento gratuito <strong style={{ color:'#666' }}>até 12h antes</strong>. Falta sem aviso gera multa de R$49,90.
            </div>

            {erroModal && (
              <div style={{ background:'#ff2d9b15', border:'1px solid #ff2d9b44', borderRadius:8,
                padding:'0.6rem 1rem', fontSize:13, color:ACCENT, marginBottom:'1rem' }}>{erroModal}</div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => { setModalAberto(false); setPosicaoSel('') }}
                style={{ flex:1, background:'transparent', border:'1px solid #2a2a2a', borderRadius:10,
                  padding:'0.85rem', color:'#555', fontSize:14, cursor:'pointer', fontFamily:"'DM Sans', sans-serif" }}>
                Cancelar
              </button>
              <button onClick={confirmarReserva} disabled={confirmando || planosDisponiveis.length === 0}
                style={{ flex:2, background:planosDisponiveis.length===0?'#1a1a1a':ACCENT,
                  color:planosDisponiveis.length===0?'#444':'#fff', border:'none', borderRadius:10,
                  padding:'0.85rem', fontWeight:600, fontSize:15,
                  cursor:confirmando||planosDisponiveis.length===0?'default':'pointer',
                  fontFamily:"'DM Sans', sans-serif", opacity:confirmando?0.7:1 }}>
                {confirmando ? 'Confirmando...' : 'Confirmar reserva ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MapaPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', background:'#080808', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:32, height:32, border:'4px solid #ff2d9b', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <MapaPageInner/>
    </Suspense>
  )
}
