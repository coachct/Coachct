'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import SiteHeader from '@/components/SiteHeader'

const ACCENT = '#ff2d9b'
const VERDE  = '#2ddd8b'
const JUST_CT_ID = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'

export default function ComprarPage() {
  const router = useRouter()
  const supabase = createClient()
  const { perfil } = useAuth()

  const [produtos, setProdutos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
        if (chave.includes('coach_ct_pro') && valor.disponivel > 0) { setCoachCtProAtivo(valor); return }
      }
    }
    setCoachCtProAtivo(null)
  }

  function irParaCheckout(produtoId: string) { router.push(`/comprar/checkout?produto=${produtoId}`) }

  function formatarValor(v: number) {
    const reais = Math.floor(v)
    const cents = Math.round((v - reais) * 100)
    return { reais: `R$ ${reais.toLocaleString('pt-BR')}`, cents: cents > 0 ? `,${cents.toString().padStart(2, '0')}` : '' }
  }

  function formatarData(dataIso: string): string {
    if (!dataIso) return ''
    const [ano, mes, dia] = dataIso.split('-')
    return `${dia}/${mes}/${ano}`
  }

  // Coach CT Pro
  function isCoachCtPro(p: any)        { return p.subtipo === 'coach_ct_pro' }
  function isCoachCtProPromo(p: any)    { return isCoachCtPro(p) && /promo/i.test(p.nome || '') }
  function isCoachCtProTrimestral(p: any) { return isCoachCtPro(p) && /trimestral/i.test(p.nome || '') }

  function valorMensalCoachPro(p: any) {
    const total = Number(p.valor)
    const parcelas = p.max_parcelas || 1
    return { mensal: total / parcelas, total, parcelas }
  }

  function beneficiosCoachPro(p: any): string[] {
    const isTrimestral = isCoachCtProTrimestral(p)
    return [
      '3 treinos / semana',
      `${isTrimestral ? 36 : 72} sessões em ${isTrimestral ? 3 : 6} meses`,
      'Escolha do coach no agendamento',
      'Calendário preferencial · 14 dias',
      'Cancelamento até 3h antes',
      'Open Gym (acesso ao CT)',
    ]
  }

  // Acesso
  function badgeProduto(p: any): { label: string; isMaisPopular: boolean } | null {
    if (p.nome?.toLowerCase().includes('semestral')) return { label: 'MAIS POPULAR', isMaisPopular: true }
    if (p.nome?.toLowerCase().includes('anual'))    return { label: 'MELHOR PREÇO', isMaisPopular: false }
    return null
  }

  function valorMensalAcesso(p: any) {
    const total = Number(p.valor)
    const meses = p.nome?.toLowerCase().includes('anual') ? 12 : p.nome?.toLowerCase().includes('semestral') ? 6 : 1
    return { mensal: total / meses, total, meses }
  }

  // Pacotes
  function valorPorCredito(p: any) {
    return Number(p.valor) / (p.creditos_por_venda || 1)
  }

  // Separação por subtipo
  const produtosCoachPro     = produtos.filter(p => p.subtipo === 'coach_ct_pro')
  const produtosAcesso       = produtos.filter(p => p.subtipo === 'acesso')
  const produtosIlimitado    = produtos.filter(p => p.subtipo === 'ilimitado_club')
  const produtosPacotes      = produtos.filter(p => p.subtipo === 'pacote').sort((a, b) => Number(a.valor) - Number(b.valor))
  const produtosCreditos     = produtos.filter(p => p.subtipo === 'credito')

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        .produto-card-h { transition: all .25s; }
        .produto-card-h:hover { border-color: ${ACCENT} !important; transform: translateY(-4px); }
        .card-club-h { transition: all .25s; }
        .card-club-h:hover { border-color: ${VERDE} !important; transform: translateY(-4px); }
        .coach-pro-card { transition: all .3s; }
        .coach-pro-card:hover { transform: translateY(-6px); box-shadow: 0 12px 32px -8px ${ACCENT}33; }
        .ilimitado-card { transition: all .3s; }
        .ilimitado-card:hover { transform: translateY(-6px); box-shadow: 0 12px 32px -8px ${VERDE}33; }
        .btn-comprar-h:hover { opacity: 0.85; }
        .btn-comprar-ghost-h:hover { background: ${ACCENT} !important; color: #fff !important; }
        .btn-club-ghost-h:hover { background: ${VERDE} !important; color: #000 !important; }
        @media (max-width: 768px) {
          .grid-produtos-r { grid-template-columns: 1fr !important; }
          .grid-coach-pro  { grid-template-columns: 1fr !important; }
          .grid-pacotes    { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <SiteHeader />

      {/* HERO */}
      <div style={{ paddingTop: 120, padding: '120px 2.5rem 3rem', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>// comprar online</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(48px, 6vw, 72px)', color: '#fff', lineHeight: 1.05, marginBottom: '1rem', letterSpacing: 2 }}>PLANOS & PACOTES</div>
        <div style={{ color: '#999', fontSize: 16, maxWidth: 600, lineHeight: 1.7, margin: '0 auto' }}>
          Coach CT personal training, acesso ilimitado ao CT, pacotes de treinos para as JustClubs ou créditos avulsos. Pagamento via PIX ou cartão de crédito.
        </div>
      </div>

      <div style={{ padding: '0 2.5rem 6rem', maxWidth: 1100, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* ── COACH CT PRO ── */}
            {produtosCoachPro.length > 0 && (
              <div style={{ marginBottom: '5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: ACCENT, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>// planos coach ct</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', letterSpacing: 1.5 }}>PERSONAL TRAINING PREMIUM</div>
                </div>

                {coachCtProAtivo && (
                  <div style={{ background: `${ACCENT}10`, border: `1.5px solid ${ACCENT}66`, borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>✓</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Você já tem Coach CT Pro ativo</div>
                      <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>
                        Plano válido até <strong style={{ color: '#fff' }}>{formatarData(coachCtProAtivo.fim)}</strong> · {coachCtProAtivo.disponivel} de {coachCtProAtivo.total} créditos disponíveis.
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid-coach-pro" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                  {produtosCoachPro.map(p => {
                    const promo = isCoachCtProPromo(p)
                    const trimestral = isCoachCtProTrimestral(p)
                    const { mensal, total, parcelas } = valorMensalCoachPro(p)
                    const beneficios = beneficiosCoachPro(p)
                    const vMensal = formatarValor(mensal)
                    const vTotal  = formatarValor(total)
                    const bloqueado = !!coachCtProAtivo
                    return (
                      <div key={p.id} className="coach-pro-card" style={{ position: 'relative', background: promo ? 'linear-gradient(135deg,#111 0%,#1a0a14 100%)' : '#111', border: `1.5px solid ${promo ? ACCENT : '#2a2a2a'}`, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column', overflow: 'hidden', opacity: bloqueado ? 0.55 : 1 }}>
                        {promo && <div style={{ position: 'absolute', top: 16, right: -38, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.3rem 3rem', transform: 'rotate(38deg)', letterSpacing: 1.5, fontFamily: "'DM Mono', monospace" }}>OFERTA LANÇAMENTO</div>}
                        <div style={{ marginBottom: '1.5rem' }}>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: ACCENT, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>coach ct pro</div>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 1.5 }}>{trimestral ? 'TRIMESTRAL' : 'SEMESTRAL'}</div>
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                          {promo && <div style={{ fontSize: 14, color: '#555', textDecoration: 'line-through', marginBottom: 4 }}>R$ 1.199 /mês</div>}
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, color: '#fff', lineHeight: 1 }}>{vMensal.reais}<span style={{ fontSize: 28 }}>{vMensal.cents}</span></div>
                            <div style={{ fontSize: 16, color: '#999' }}>/mês</div>
                          </div>
                          <div style={{ fontSize: 13, color: '#888', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{vTotal.reais}{vTotal.cents} em {parcelas}x</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', flex: 1 }}>
                          {beneficios.map((b, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div style={{ width: 18, height: 18, borderRadius: '50%', background: `${ACCENT}25`, color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</div>
                              <span style={{ fontSize: 14, color: '#ddd' }}>{b}</span>
                            </div>
                          ))}
                        </div>
                        {bloqueado
                          ? <div style={{ background: '#222', color: '#888', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', fontWeight: 500, fontSize: 13, textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>🔒 Plano já ativo</div>
                          : <button onClick={() => irParaCheckout(p.id)} className="btn-comprar-h" style={{ background: promo ? ACCENT : 'transparent', color: promo ? '#fff' : ACCENT, border: promo ? 'none' : `1.5px solid ${ACCENT}`, borderRadius: 10, padding: '0.95rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', letterSpacing: 0.5 }}>COMPRAR AGORA →</button>
                        }
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── ILIMITADO JUSTCLUB ── */}
            {produtosIlimitado.length > 0 && (
              <div style={{ marginBottom: '5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: VERDE, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>// justclub</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', letterSpacing: 1.5 }}>ACESSO ILIMITADO ÀS CLUBS</div>
                </div>

                <div className="grid-coach-pro" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                  {produtosIlimitado.map(p => {
                    const mensal = Number(p.valor) / 6
                    const vMensal = formatarValor(mensal)
                    const vTotal  = formatarValor(Number(p.valor))
                    return (
                      <div key={p.id} className="ilimitado-card" style={{ position: 'relative', background: 'linear-gradient(135deg,#071a0f 0%,#0a1a14 100%)', border: `1.5px solid ${VERDE}66`, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 16, right: -30, background: VERDE, color: '#000', fontSize: 10, fontWeight: 700, padding: '0.3rem 3rem', transform: 'rotate(38deg)', letterSpacing: 1.5, fontFamily: "'DM Mono', monospace" }}>MAIS POPULAR</div>
                        <div style={{ marginBottom: '1.5rem' }}>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: VERDE, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>justclub ilimitado</div>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 1.5 }}>SEMESTRAL</div>
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, color: '#fff', lineHeight: 1 }}>{vMensal.reais}<span style={{ fontSize: 28 }}>{vMensal.cents}</span></div>
                            <div style={{ fontSize: 16, color: '#999' }}>/mês</div>
                          </div>
                          <div style={{ fontSize: 13, color: '#888', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{vTotal.reais}{vTotal.cents} em {p.max_parcelas || 6}x</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', flex: 1 }}>
                          {[
                            '30 treinos por mês',
                            'JustClub Pinheiros + Vila Olímpia',
                            'Entrada livre no Just CT (musculação)',
                            'Créditos renovam todo mês na data da compra',
                            'Créditos não utilizados não acumulam',
                            'Validade de 6 meses',
                          ].map((b, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div style={{ width: 18, height: 18, borderRadius: '50%', background: `${VERDE}25`, color: VERDE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</div>
                              <span style={{ fontSize: 14, color: '#ddd' }}>{b}</span>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => irParaCheckout(p.id)} className="btn-comprar-h" style={{ background: VERDE, color: '#000', border: 'none', borderRadius: 10, padding: '0.95rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', letterSpacing: 0.5 }}>COMPRAR AGORA →</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── PACOTES DE TREINOS ── */}
            {produtosPacotes.length > 0 && (
              <div style={{ marginBottom: '5rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: VERDE, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>// pacotes de treinos</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', letterSpacing: 1.5 }}>QUANTO MAIS, MENOR O PREÇO</div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>Válidos para JustClub Pinheiros, JustClub Vila Olímpia e Just CT (musculação livre)</div>
                </div>

                <div className="grid-pacotes" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {produtosPacotes.map(p => {
                    const total = Number(p.valor)
                    const creditos = p.creditos_por_venda || 1
                    const porCredito = total / creditos
                    const vTotal = formatarValor(total)
                    const vPorCredito = formatarValor(porCredito)
                    const isMaisPopular = creditos === 10
                    return (
                      <div key={p.id} className="card-club-h" style={{ background: '#111', border: `1.5px solid ${isMaisPopular ? VERDE : '#222'}`, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                        {isMaisPopular && (
                          <div style={{ position: 'absolute', top: 12, right: -20, background: VERDE, color: '#000', fontSize: 10, fontWeight: 700, padding: '0.25rem 2.75rem', transform: 'rotate(15deg)', letterSpacing: 1 }}>MAIS POPULAR</div>
                        )}
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: VERDE, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>{creditos} créditos</div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
                          {vPorCredito.reais}<span style={{ fontSize: 24 }}>{vPorCredito.cents}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>/ treino</div>
                        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, padding: '0.65rem 0.85rem', marginBottom: '1rem' }}>
                          <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>Total</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{vTotal.reais}{vTotal.cents}</div>
                          {p.max_parcelas > 1 && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>em até {p.max_parcelas}x</div>}
                        </div>
                        <div style={{ fontSize: 13, color: '#666', flex: 1, marginBottom: '1.5rem' }}>
                          Válido por <strong style={{ color: '#aaa' }}>{p.dias_validade} dias</strong> a partir da compra
                        </div>
                        <button onClick={() => irParaCheckout(p.id)} className="btn-club-ghost-h"
                          style={{ background: isMaisPopular ? VERDE : 'transparent', color: isMaisPopular ? '#000' : VERDE, border: `1.5px solid ${VERDE}`, borderRadius: 8, padding: '0.85rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s' }}>
                          Comprar agora →
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── ACESSO AO CT ── */}
            {produtosAcesso.length > 0 && (
              <div style={{ marginBottom: '5rem' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#999', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>// acesso just ct</div>
                <div className="grid-produtos-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {produtosAcesso.map(p => {
                    const badge = badgeProduto(p)
                    const { mensal, total, meses } = valorMensalAcesso(p)
                    const vMensal = formatarValor(mensal)
                    const vTotal  = formatarValor(total)
                    return (
                      <div key={p.id} className="produto-card-h" style={{ background: '#111', border: `1px solid ${badge?.isMaisPopular ? ACCENT : '#222'}`, borderRadius: 16, padding: '2rem', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {badge && <div style={{ position: 'absolute', top: 12, right: -16, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.25rem 2.5rem', transform: 'rotate(15deg)', letterSpacing: 1 }}>{badge.label}</div>}
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#555', marginBottom: '0.5rem' }}>{p.nome}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: 4 }}>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>{vMensal.reais}<span style={{ fontSize: 24 }}>{vMensal.cents}</span></div>
                          <div style={{ fontSize: 14, color: '#999' }}>/mês</div>
                        </div>
                        <div style={{ fontSize: 12, color: '#555', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>{vTotal.reais}{vTotal.cents} total · {meses}x</div>
                        <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6, flex: 1, marginBottom: '1.5rem' }}>
                          Acesso ilimitado ao espaço de musculação Just CT por {p.dias_validade} dias. Válido somente para o titular.
                        </div>
                        <button onClick={() => irParaCheckout(p.id)}
                          className={badge?.isMaisPopular ? 'btn-comprar-h' : 'btn-comprar-ghost-h'}
                          style={badge?.isMaisPopular
                            ? { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.85rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%' }
                            : { background: 'transparent', color: ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 8, padding: '0.85rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s' }
                          }>
                          Comprar agora →
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── CRÉDITOS AVULSOS ── */}
            {produtosCreditos.length > 0 && (
              <div style={{ marginBottom: '3rem' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#999', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>// créditos avulsos</div>
                <div className="grid-produtos-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {produtosCreditos.map(p => {
                    const valor = formatarValor(Number(p.valor))
                    const ehCoach  = p.tipo === 'credito_coach'
                    const ehTreino = p.tipo === 'credito_treino'
                    const borderColor = ehCoach ? ACCENT : ehTreino ? VERDE : '#222'
                    return (
                      <div key={p.id} className={ehCoach ? 'produto-card-h' : 'card-club-h'} style={{ background: '#111', border: `1px solid ${borderColor}`, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: ehCoach ? ACCENT : VERDE, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>
                          {ehCoach ? 'just ct · coach' : 'todas as unidades'}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{p.nome}</div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>{valor.reais}<span style={{ fontSize: 24 }}>{valor.cents}</span></div>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: '1rem' }}>/ crédito · válido {p.dias_validade || 30} dias</div>
                        <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6, flex: 1, marginBottom: '1.5rem' }}>
                          {ehCoach
                            ? 'Crédito avulso para sessão com coach no Just CT. Necessário ter acesso ao CT via plano ou app parceiro.'
                            : 'Crédito avulso válido para JustClub Pinheiros, JustClub Vila Olímpia e Just CT (musculação livre). Não válido para treino com coach.'
                          }
                        </div>
                        <button onClick={() => irParaCheckout(p.id)}
                          className={ehCoach ? 'btn-comprar-h' : 'btn-club-ghost-h'}
                          style={ehCoach
                            ? { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.85rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%' }
                            : { background: 'transparent', color: VERDE, border: `1.5px solid ${VERDE}`, borderRadius: 8, padding: '0.85rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s' }
                          }>
                          Comprar agora →
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
            { icon: '💬', title: 'Suporte',          desc: 'Atendimento via WhatsApp' },
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
