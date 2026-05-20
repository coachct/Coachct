'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import SiteHeader from '@/components/SiteHeader'

const ACCENT = '#ff2d9b'
const JUST_CT_ID = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'

export default function ComprarPage() {
  const router = useRouter()
  const supabase = createClient()
  const { perfil } = useAuth()

  const [produtos, setProdutos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [coachCtProAtivo, setCoachCtProAtivo] = useState<any | null>(null)

  useEffect(() => {
    carregarProdutos()
  }, [])

  useEffect(() => {
    if (perfil?.role === 'cliente') {
      verificarCoachCtProAtivo()
    } else {
      setCoachCtProAtivo(null)
    }
  }, [perfil])

  async function carregarProdutos() {
    setLoading(true)
    const { data } = await supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
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
      p_cliente_id: cliente.id,
      p_mes: hoje.getMonth() + 1,
      p_ano: hoje.getFullYear(),
      p_unidade_id: null,
    })
    if (saldoData && typeof saldoData === 'object') {
      for (const [chave, valor] of Object.entries(saldoData as Record<string, any>)) {
        if (chave.includes('coach_ct_pro') && valor.disponivel > 0) {
          setCoachCtProAtivo(valor)
          return
        }
      }
    }
    setCoachCtProAtivo(null)
  }

  function irParaCheckout(produtoId: string) {
    router.push(`/comprar/checkout?produto=${produtoId}`)
  }

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

  function descricaoProduto(p: any): string {
    if (p.subtipo === 'acesso') {
      return `Acesso ilimitado ao espaço de musculação Just CT por ${p.dias_validade} dias. Válido somente para o titular.`
    }
    return `Crédito avulso válido por ${p.dias_validade || 30} dias após a compra. ${p.nome.includes('Coach') ? 'Necessário ter acesso ao CT via plano ou app parceiro.' : ''}`.trim()
  }

  function badgeProduto(p: any): { label: string; isMaisPopular: boolean } | null {
    if (p.nome?.toLowerCase().includes('semestral')) return { label: 'MAIS POPULAR', isMaisPopular: true }
    if (p.nome?.toLowerCase().includes('anual')) return { label: 'MELHOR PREÇO', isMaisPopular: false }
    return null
  }

  function periodoTexto(p: any): string {
    if (p.subtipo === 'acesso') {
      if (p.nome?.toLowerCase().includes('anual')) return 'pagamento único · 12 meses'
      if (p.nome?.toLowerCase().includes('semestral')) return 'pagamento único · 6 meses'
      return `${p.dias_validade} dias`
    }
    return `/ crédito · válido ${p.dias_validade || 30} dias`
  }

  function isCoachCtPro(p: any): boolean { return p.subtipo === 'coach_ct_pro' }
  function isCoachCtProPromo(p: any): boolean { return isCoachCtPro(p) && /promo/i.test(p.nome || '') }
  function isCoachCtProTrimestral(p: any): boolean { return isCoachCtPro(p) && /trimestral/i.test(p.nome || '') }

  function valorMensalCoachPro(p: any): { mensal: number; total: number; parcelas: number } {
    const total = Number(p.valor)
    const parcelas = p.max_parcelas || 1
    const mensal = total / parcelas
    return { mensal, total, parcelas }
  }

  function beneficiosCoachPro(p: any): string[] {
    const isTrimestral = isCoachCtProTrimestral(p)
    const sessoes = isTrimestral ? 36 : 72
    const meses = isTrimestral ? 3 : 6
    return [
      '3 treinos / semana',
      `${sessoes} sessões em ${meses} meses`,
      'Escolha do coach no agendamento',
      'Calendário preferencial · 14 dias',
      'Cancelamento até 3h antes',
      'Open Gym (acesso ao CT)',
    ]
  }

  const produtosCoachPro = produtos.filter(p => isCoachCtPro(p))
  const produtosAcesso = produtos.filter(p => p.subtipo === 'acesso')
  const produtosCreditos = produtos.filter(p => p.subtipo === 'credito')

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 0 0 ${ACCENT}40 } 50% { box-shadow: 0 0 24px 4px ${ACCENT}40 } }
        .produto-card-h { transition: all .25s; }
        .produto-card-h:hover { border-color: ${ACCENT} !important; transform: translateY(-4px); }
        .coach-pro-card { transition: all .3s; }
        .coach-pro-card:hover { transform: translateY(-6px); box-shadow: 0 12px 32px -8px ${ACCENT}33; }
        .btn-comprar-h:hover { opacity: 0.85; }
        .btn-comprar-ghost-h:hover { background: ${ACCENT} !important; color: #fff !important; }
        @media (max-width: 768px) {
          .grid-produtos-r { grid-template-columns: 1fr !important; }
          .grid-coach-pro { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <SiteHeader />

      <div style={{ paddingTop: 120, paddingBottom: '3rem', padding: '120px 2.5rem 3rem', maxWidth: 1100, margin: '0 auto', textAlign: 'center' as const }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>
          // comprar online
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(48px, 6vw, 72px)', color: '#fff', lineHeight: 1.05, marginBottom: '1rem', letterSpacing: 2 }}>
          PLANOS
        </div>
        <div style={{ color: '#999', fontSize: 16, maxWidth: 560, lineHeight: 1.7, margin: '0 auto' }}>
          Acesso ilimitado ao CT, planos Coach CT ou créditos avulsos. Pagamento via PIX ou Cartão de crédito.
        </div>
      </div>

      <div style={{ padding: '0 2.5rem 6rem', maxWidth: 1100, margin: '0 auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : produtos.length === 0 ? (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center' as const }}>
            <div style={{ fontSize: 32, marginBottom: '1rem' }}>📦</div>
            <div style={{ color: '#888', fontSize: 16 }}>Nenhum produto disponível no momento.</div>
          </div>
        ) : (
          <>
            {produtosCoachPro.length > 0 && (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: ACCENT, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>// planos coach ct</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', letterSpacing: 1.5, lineHeight: 1.2 }}>PERSONAL TRAINING PREMIUM</div>
                </div>

                {coachCtProAtivo && (
                  <div style={{ background: `${ACCENT}10`, border: `1.5px solid ${ACCENT}66`, borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>✓</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Você já tem Coach CT Pro ativo</div>
                      <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>
                        Plano válido até <strong style={{ color: '#fff' }}>{formatarData(coachCtProAtivo.fim)}</strong> · {coachCtProAtivo.disponivel} de {coachCtProAtivo.total} créditos disponíveis.
                        <br />Para adquirir um novo, aguarde o término dos créditos ou do plano.
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid-coach-pro" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '4rem' }}>
                  {produtosCoachPro.map(p => {
                    const promo = isCoachCtProPromo(p)
                    const trimestral = isCoachCtProTrimestral(p)
                    const { mensal, total, parcelas } = valorMensalCoachPro(p)
                    const beneficios = beneficiosCoachPro(p)
                    const valorMensalFmt = formatarValor(mensal)
                    const totalFmt = formatarValor(total)
                    const bloqueado = !!coachCtProAtivo
                    return (
                      <div key={p.id} className="coach-pro-card" style={{ position: 'relative' as const, background: promo ? `linear-gradient(135deg, #111 0%, #1a0a14 100%)` : '#111', border: `1.5px solid ${promo ? ACCENT : '#2a2a2a'}`, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' as const, opacity: bloqueado ? 0.55 : 1 }}>
                        {promo && (
                          <div style={{ position: 'absolute' as const, top: 16, right: -38, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.3rem 3rem', transform: 'rotate(38deg)', letterSpacing: 1.5, fontFamily: "'DM Mono', monospace" }}>
                            OFERTA LANÇAMENTO
                          </div>
                        )}
                        <div style={{ marginBottom: '1.5rem' }}>
                          <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: ACCENT, marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>coach ct pro</div>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 1.5, lineHeight: 1.1 }}>{trimestral ? 'TRIMESTRAL' : 'SEMESTRAL'}</div>
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                          {promo && <div style={{ fontSize: 14, color: '#555', textDecoration: 'line-through' as const, marginBottom: 4 }}>R$ 1.199 /mês</div>}
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, color: '#fff', lineHeight: 1 }}>{valorMensalFmt.reais}<span style={{ fontSize: 28 }}>{valorMensalFmt.cents}</span></div>
                            <div style={{ fontSize: 16, color: '#999', fontWeight: 500 }}>/mês</div>
                          </div>
                          <div style={{ fontSize: 13, color: '#888', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{totalFmt.reais}{totalFmt.cents} em {parcelas}x</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', marginBottom: '2rem', flex: 1 }}>
                          {beneficios.map((b, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div style={{ width: 18, height: 18, borderRadius: '50%', background: `${ACCENT}25`, color: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✓</div>
                              <span style={{ fontSize: 14, color: '#ddd', lineHeight: 1.4 }}>{b}</span>
                            </div>
                          ))}
                        </div>
                        {bloqueado ? (
                          <div style={{ background: '#222', color: '#888', border: '1px solid #333', borderRadius: 10, padding: '0.85rem 1.25rem', fontWeight: 500, fontSize: 13, textAlign: 'center' as const, fontFamily: "'DM Sans', sans-serif", width: '100%' }}>🔒 Plano já ativo</div>
                        ) : (
                          <button onClick={() => irParaCheckout(p.id)} className="btn-comprar-h" style={{ background: promo ? ACCENT : 'transparent', color: promo ? '#fff' : ACCENT, border: promo ? 'none' : `1.5px solid ${ACCENT}`, borderRadius: 10, padding: '0.95rem 1.25rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s', letterSpacing: 0.5 }}>
                            COMPRAR AGORA →
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {produtosAcesso.length > 0 && (
              <>
                <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#999', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>Planos de acesso</div>
                <div className="grid-produtos-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                  {produtosAcesso.map(p => {
                    const valor = formatarValor(Number(p.valor))
                    const badge = badgeProduto(p)
                    return (
                      <div key={p.id} className="produto-card-h" style={{ background: '#111', border: `1px solid ${badge?.isMaisPopular ? ACCENT : '#222'}`, borderRadius: 16, padding: '2rem', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {badge && <div style={{ position: 'absolute', top: 12, right: -16, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.25rem 2.5rem', transform: 'rotate(15deg)', letterSpacing: 1 }}>{badge.label}</div>}
                        <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#999', marginBottom: '0.5rem' }}>{p.nome}</div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>{valor.reais}<span style={{ fontSize: 24 }}>{valor.cents}</span></div>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: '1rem' }}>{periodoTexto(p)}</div>
                        <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6, flex: 1, marginBottom: '1.5rem' }}>{descricaoProduto(p)}</div>
                        <button onClick={() => irParaCheckout(p.id)} className={badge?.isMaisPopular ? 'btn-comprar-h' : 'btn-comprar-ghost-h'} style={badge?.isMaisPopular ? { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'opacity .2s' } : { background: 'transparent', color: ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 8, padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s' }}>
                          Comprar agora →
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {produtosCreditos.length > 0 && (
              <>
                <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#999', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>Créditos avulsos</div>
                <div className="grid-produtos-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {produtosCreditos.map(p => {
                    const valor = formatarValor(Number(p.valor))
                    const ehCoachCT = p.nome?.toLowerCase().includes('coach')
                    return (
                      <div key={p.id} className="produto-card-h" style={{ background: '#111', border: `1px solid ${ehCoachCT ? ACCENT : '#222'}`, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#999', marginBottom: '0.5rem' }}>{p.nome}</div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>{valor.reais}<span style={{ fontSize: 24 }}>{valor.cents}</span></div>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: '1rem' }}>{periodoTexto(p)}</div>
                        <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6, flex: 1, marginBottom: '1.5rem' }}>{descricaoProduto(p)}</div>
                        <button onClick={() => irParaCheckout(p.id)} className={ehCoachCT ? 'btn-comprar-h' : 'btn-comprar-ghost-h'} style={ehCoachCT ? { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'opacity .2s' } : { background: 'transparent', color: ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 8, padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s' }}>
                          Comprar agora →
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

        <div style={{ marginTop: '4rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' as const, justifyContent: 'center', borderTop: '1px solid #1a1a1a', paddingTop: '2.5rem' }}>
          {[
            { icon: '🔒', title: 'Pagamento seguro', desc: 'Processado pela Pagar.me' },
            { icon: '⚡', title: 'Ativação rápida', desc: 'Confirmação em minutos' },
            { icon: '💬', title: 'Suporte', desc: 'Atendimento via WhatsApp' },
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

      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '1rem' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#fff', letterSpacing: 2 }}>JUST<span style={{ color: ACCENT }}>CT</span></div>
        <div style={{ fontSize: 12, color: '#666' }}>© 2025 Just CT — Serious Training</div>
        <span onClick={() => router.push('/')} style={{ fontSize: 12, color: '#999', cursor: 'pointer' }}>← Voltar pra home</span>
      </footer>
    </div>
  )
}
