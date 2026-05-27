'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import SiteHeader from '@/components/SiteHeader'

const ACCENT   = '#ff2d9b'
const VERDE    = '#2ddd8b'
const JUST_CT_ID = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'

export default function ComprarPage() {
  const router   = useRouter()
  const supabase = createClient()
  const { perfil } = useAuth()

  const [produtos, setProdutos]             = useState<any[]>([])
  const [loading, setLoading]               = useState(true)
  const [coachCtProAtivo, setCoachCtProAtivo] = useState<any | null>(null)

  useEffect(() => { carregarProdutos() }, [])
  useEffect(() => {
    if (perfil?.role === 'cliente') verificarCoachCtProAtivo()
    else setCoachCtProAtivo(null)
  }, [perfil])

  async function carregarProdutos() {
    setLoading(true)
    const { data } = await supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .not('subtipo', 'eq', 'multa')
      .or(`unidade_id.eq.${JUST_CT_ID},unidade_id.is.null`)
      .order('valor', { ascending: false })
    setProdutos(data || [])
    setLoading(false)
  }

  async function verificarCoachCtProAtivo() {
    if (!perfil) return
    const { data: cliente } = await supabase.from('clientes').select('id').eq('user_id', perfil.id).maybeSingle()
    if (!cliente) return
    const hoje = new Date()
    const { data: saldoData } = await supabase.rpc('saldo_creditos_cliente', {
      p_cliente_id: cliente.id, p_mes: hoje.getMonth() + 1,
      p_ano: hoje.getFullYear(), p_unidade_id: null,
    })
    if (saldoData && typeof saldoData === 'object') {
      for (const [chave, valor] of Object.entries(saldoData as Record<string, any>)) {
        if (chave.includes('coach_ct_pro') && (valor as any).disponivel > 0) { setCoachCtProAtivo(valor); return }
      }
    }
    setCoachCtProAtivo(null)
  }

  function irParaCheckout(id: string) { router.push(`/comprar/checkout?produto=${id}`) }

  function fmt(v: number) {
    const reais = Math.floor(v)
    const cents = Math.round((v - reais) * 100)
    return { reais: `R$ ${reais.toLocaleString('pt-BR')}`, cents: cents > 0 ? `,${cents.toString().padStart(2, '0')}` : '' }
  }

  function fmtData(iso: string) {
    if (!iso) return ''
    const [ano, mes, dia] = iso.split('-')
    return `${dia}/${mes}/${ano}`
  }

  // ── Coach CT Pro
  const isPromo      = (p: any) => p.subtipo === 'coach_ct_pro' && /promo/i.test(p.nome || '')
  const isTrimestral = (p: any) => p.subtipo === 'coach_ct_pro' && /trimestral/i.test(p.nome || '')
  const beneficiosPro = (p: any) => {
    const trim = isTrimestral(p)
    return ['3 treinos / semana', `${trim ? 36 : 72} sessões em ${trim ? 3 : 6} meses`, 'Escolha do coach no agendamento', 'Calendário preferencial · 14 dias', 'Cancelamento até 3h antes', 'Open Gym (acesso ao CT)']
  }

  // ── Separação
  const produtosCoachPro  = produtos.filter(p => p.subtipo === 'coach_ct_pro')
  const produtosAcessoCT  = produtos.filter(p => p.subtipo === 'acesso')
  const produtosIlimitado = produtos.filter(p => p.subtipo === 'ilimitado_club')
  // Pacotes & avulsos juntos — ordenar: coach avulso, treino avulso, pacotes crescente
  const produtosPacotesAvulsos = [
    ...produtos.filter(p => p.subtipo === 'credito' && p.tipo === 'credito_coach'),
    ...produtos.filter(p => p.subtipo === 'credito' && p.tipo === 'credito_treino'),
    ...produtos.filter(p => p.subtipo === 'pacote').sort((a, b) => Number(a.valor) - Number(b.valor)),
  ]

  // ── Estilos reutilizáveis
  const card = { background: '#111', border: '1px solid #222', borderRadius: 16, padding: '2rem' }

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        .card-h    { transition: all .25s; }
        .card-h:hover { border-color: ${ACCENT} !important; transform: translateY(-4px); }
        .card-pro  { transition: all .3s; }
        .card-pro:hover { transform: translateY(-6px); box-shadow: 0 12px 32px -8px ${ACCENT}33; }
        .card-club { transition: all .3s; }
        .card-club:hover { transform: translateY(-6px); box-shadow: 0 12px 32px -8px ${VERDE}33; border-color: ${VERDE} !important; }
        .btn-h:hover { opacity: 0.85; }
        .btn-ghost:hover { background: ${ACCENT} !important; color: #fff !important; }
        @media (max-width: 768px) { .grid-3 { grid-template-columns: 1fr !important; } }
      `}</style>

      <SiteHeader />

      {/* HERO */}
      <div style={{ padding: '120px 2.5rem 3rem', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>// comprar online</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(48px,6vw,72px)', color: '#fff', lineHeight: 1.05, marginBottom: '1rem', letterSpacing: 2 }}>PLANOS & PACOTES</div>
        <div style={{ color: '#999', fontSize: 16, maxWidth: 580, lineHeight: 1.7, margin: '0 auto' }}>
          Coach CT personal training, acesso ao CT, plano ilimitado JustClub ou pacotes de créditos. Pagamento via PIX ou cartão de crédito.
        </div>
      </div>

      <div style={{ padding: '0 2.5rem 6rem', maxWidth: 1100, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* ══════════════════════════════
                1. COACH CT PRO
            ══════════════════════════════ */}
            {produtosCoachPro.length > 0 && (
              <div style={{ marginBottom: '5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: ACCENT, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>// planos coach ct</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', letterSpacing: 1.5 }}>PERSONAL TRAINING PREMIUM</div>
                </div>

                {coachCtProAtivo && (
                  <div style={{ background: `${ACCENT}10`, border: `1.5px solid ${ACCENT}55`, borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>✓</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 2 }}>Você já tem Coach CT Pro ativo</div>
                      <div style={{ fontSize: 13, color: '#aaa' }}>
                        Válido até <strong style={{ color: '#fff' }}>{fmtData(coachCtProAtivo.fim)}</strong> · {coachCtProAtivo.disponivel} de {coachCtProAtivo.total} créditos disponíveis.
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                  {produtosCoachPro.map(p => {
                    const promo  = isPromo(p)
                    const trim   = isTrimestral(p)
                    const total  = Number(p.valor)
                    const parc   = p.max_parcelas || 1
                    const mensal = total / parc
                    const vM = fmt(mensal), vT = fmt(total)
                    const bloq = !!coachCtProAtivo
                    return (
                      <div key={p.id} className="card-pro" style={{ position: 'relative', background: promo ? 'linear-gradient(135deg,#111 0%,#1a0a14 100%)' : '#111', border: `1.5px solid ${promo ? ACCENT : '#2a2a2a'}`, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column', overflow: 'hidden', opacity: bloq ? 0.6 : 1 }}>
                        {promo && <div style={{ position: 'absolute', top: 16, right: -38, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.3rem 3rem', transform: 'rotate(38deg)', letterSpacing: 1.5, fontFamily: "'DM Mono', monospace" }}>OFERTA LANÇAMENTO</div>}
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: ACCENT, marginBottom: '0.4rem', fontFamily: "'DM Mono', monospace" }}>coach ct pro</div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, color: '#fff', letterSpacing: 1.5, marginBottom: '1.25rem' }}>{trim ? 'TRIMESTRAL' : 'SEMESTRAL'}</div>
                        {promo && <div style={{ fontSize: 13, color: '#555', textDecoration: 'line-through', marginBottom: 4 }}>R$ 1.199 /mês</div>}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: 4 }}>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: '#fff', lineHeight: 1 }}>{vM.reais}<span style={{ fontSize: 26 }}>{vM.cents}</span></div>
                          <div style={{ fontSize: 15, color: '#999' }}>/mês</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#777', marginBottom: '1.5rem', fontFamily: "'DM Mono', monospace" }}>{vT.reais}{vT.cents} em {parc}x</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '2rem', flex: 1 }}>
                          {beneficiosPro(p).map((b, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <div style={{ width: 17, height: 17, borderRadius: '50%', background: `${ACCENT}25`, color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>✓</div>
                              <span style={{ fontSize: 13, color: '#ddd' }}>{b}</span>
                            </div>
                          ))}
                        </div>
                        {bloq
                          ? <div style={{ background: '#222', color: '#666', border: '1px solid #333', borderRadius: 10, padding: '0.8rem', fontSize: 13, textAlign: 'center' }}>🔒 Plano já ativo</div>
                          : <button onClick={() => irParaCheckout(p.id)} className="btn-h" style={{ background: promo ? ACCENT : 'transparent', color: promo ? '#fff' : ACCENT, border: promo ? 'none' : `1.5px solid ${ACCENT}`, borderRadius: 10, padding: '0.9rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', letterSpacing: 0.5 }}>COMPRAR AGORA →</button>
                        }
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ══════════════════════════════
                2. PLANOS DE ACESSO (CT + Club juntos)
            ══════════════════════════════ */}
            {(produtosAcessoCT.length > 0 || produtosIlimitado.length > 0) && (
              <div style={{ marginBottom: '5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#888', marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>// planos de acesso</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', letterSpacing: 1.5 }}>ACESSO AO ESPAÇO</div>
                </div>

                <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>

                  {/* Cards CT (Semestral + Anual) */}
                  {produtosAcessoCT.map(p => {
                    const isAnual = /anual/i.test(p.nome)
                    const isSemestral = /semestral/i.test(p.nome)
                    const meses = isAnual ? 12 : isSemestral ? 6 : 1
                    const total = Number(p.valor)
                    const mensal = total / meses
                    const vM = fmt(mensal), vT = fmt(total)
                    const destaque = isSemestral
                    return (
                      <div key={p.id} className="card-h" style={{ ...card, border: `1px solid ${destaque ? ACCENT : '#222'}`, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {destaque && <div style={{ position: 'absolute', top: 12, right: -20, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.25rem 2.75rem', transform: 'rotate(15deg)', letterSpacing: 1 }}>MAIS POPULAR</div>}
                        {isAnual  && <div style={{ position: 'absolute', top: 12, right: -20, background: '#444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.25rem 2.75rem', transform: 'rotate(15deg)', letterSpacing: 1 }}>MELHOR PREÇO</div>}
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#555', marginBottom: '0.4rem', fontFamily: "'DM Mono', monospace" }}>just ct</div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#fff', marginBottom: '1rem' }}>{p.nome.replace('Just CT', '').replace('Just Ct', '').trim()}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: 4 }}>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, color: '#fff', lineHeight: 1 }}>{vM.reais}<span style={{ fontSize: 22 }}>{vM.cents}</span></div>
                          <div style={{ fontSize: 13, color: '#999' }}>/mês</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#555', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>{vT.reais}{vT.cents} total · {meses}x</div>
                        <div style={{ fontSize: 13, color: '#777', lineHeight: 1.6, flex: 1, marginBottom: '1.5rem' }}>
                          Acesso ilimitado ao espaço de musculação Just CT por {p.dias_validade} dias. Válido somente para o titular.
                        </div>
                        <button onClick={() => irParaCheckout(p.id)}
                          className={destaque ? 'btn-h' : 'btn-ghost'}
                          style={destaque
                            ? { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.8rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%' }
                            : { background: 'transparent', color: ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 8, padding: '0.8rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s' }
                          }>
                          Comprar agora →
                        </button>
                      </div>
                    )
                  })}

                  {/* Card Ilimitado JustClub */}
                  {produtosIlimitado.map(p => {
                    const total  = Number(p.valor)
                    const mensal = total / 6
                    const vM = fmt(mensal), vT = fmt(total)
                    return (
                      <div key={p.id} className="card-club" style={{ background: '#0c140f', border: `1.5px solid ${VERDE}44`, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: VERDE, marginBottom: '0.4rem', fontFamily: "'DM Mono', monospace" }}>justclub</div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#fff', marginBottom: '1rem' }}>ILIMITADO SEMESTRAL</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: 4 }}>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, color: '#fff', lineHeight: 1 }}>{vM.reais}<span style={{ fontSize: 22 }}>{vM.cents}</span></div>
                          <div style={{ fontSize: 13, color: '#999' }}>/mês</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#555', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>{vT.reais}{vT.cents} total · {p.max_parcelas || 6}x</div>
                        <div style={{ fontSize: 13, color: '#777', lineHeight: 1.7, flex: 1, marginBottom: '0.75rem' }}>
                          30 treinos por mês · renovação mensal na data da compra · créditos não utilizados não acumulam.
                        </div>
                        <div style={{ fontSize: 12, color: VERDE + 'cc', marginBottom: '1.5rem', fontWeight: 600 }}>
                          📍 JustClub Pinheiros + JustClub Vila Olímpia
                        </div>
                        <button onClick={() => irParaCheckout(p.id)} className="btn-h"
                          style={{ background: VERDE, color: '#000', border: 'none', borderRadius: 8, padding: '0.8rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%' }}>
                          Comprar agora →
                        </button>
                      </div>
                    )
                  })}

                </div>
              </div>
            )}

            {/* ══════════════════════════════
                3. PACOTES & AVULSOS
            ══════════════════════════════ */}
            {produtosPacotesAvulsos.length > 0 && (
              <div style={{ marginBottom: '3rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#888', marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>// créditos</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', letterSpacing: 1.5 }}>PACOTES & AVULSOS</div>
                </div>

                <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                  {produtosPacotesAvulsos.map(p => {
                    const ehCoach  = p.tipo === 'credito_coach'
                    const ehPacote = p.subtipo === 'pacote'
                    const creditos = p.creditos_por_venda || 1
                    const total    = Number(p.valor)
                    const porCred  = total / creditos
                    const vPC = fmt(porCred), vT = fmt(total)

                    return (
                      <div key={p.id} className="card-h" style={{ ...card, border: `1px solid ${ehCoach ? ACCENT + '66' : '#222'}`, display: 'flex', flexDirection: 'column' }}>

                        {/* Label */}
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: ehCoach ? ACCENT : '#555', marginBottom: '0.35rem', fontFamily: "'DM Mono', monospace" }}>
                          {ehCoach ? 'just ct · coach' : ehPacote ? `pacote ${creditos} treinos` : 'todas as unidades'}
                        </div>

                        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: '0.75rem' }}>{p.nome}</div>

                        {/* Preço */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem', marginBottom: 2 }}>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, color: '#fff', lineHeight: 1 }}>{vPC.reais}<span style={{ fontSize: 20 }}>{vPC.cents}</span></div>
                          <div style={{ fontSize: 12, color: '#777' }}>/ treino</div>
                        </div>

                        {/* Total / parcelas */}
                        {ehPacote && (
                          <div style={{ fontSize: 12, color: '#555', marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>
                            {vT.reais}{vT.cents} total{p.max_parcelas > 1 ? ` · ${p.max_parcelas}x` : ''}
                          </div>
                        )}

                        <div style={{ fontSize: 12, color: '#555', flex: 1, marginBottom: '1.25rem', lineHeight: 1.6 }}>
                          {ehCoach
                            ? `Crédito para sessão com coach. Válido ${p.dias_validade} dias. Necessário ter acesso ao CT.`
                            : ehPacote
                            ? `${creditos} créditos válidos por ${p.dias_validade} dias. Just CT (musculação livre) + JustClubs.`
                            : `Crédito avulso válido ${p.dias_validade} dias. Just CT (musculação livre) + JustClubs.`
                          }
                        </div>

                        <button onClick={() => irParaCheckout(p.id)}
                          className={ehCoach ? 'btn-h' : 'btn-ghost'}
                          style={ehCoach
                            ? { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.75rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%' }
                            : { background: 'transparent', color: ACCENT, border: `1.5px solid ${ACCENT}55`, borderRadius: 8, padding: '0.75rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s' }
                          }>
                          Comprar →
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* TRUST SIGNALS */}
        <div style={{ marginTop: '4rem', display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', borderTop: '1px solid #1a1a1a', paddingTop: '2.5rem' }}>
          {[
            { icon: '🔒', title: 'Pagamento seguro', desc: 'Processado pela Pagar.me' },
            { icon: '⚡', title: 'Ativação rápida',  desc: 'Confirmação em minutos' },
            { icon: '💬', title: 'Suporte',           desc: 'Atendimento via WhatsApp' },
          ].map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: 24 }}>{it.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{it.title}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{it.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#fff', letterSpacing: 2 }}>JUST<span style={{ color: ACCENT }}>CT</span></div>
        <div style={{ fontSize: 12, color: '#666' }}>© 2025 Just CT — Serious Training</div>
        <span onClick={() => router.push('/')} style={{ fontSize: 12, color: '#999', cursor: 'pointer' }}>← Voltar pra home</span>
      </footer>
    </div>
  )
}
