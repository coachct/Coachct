'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const ACCENT = '#ff2d9b'
// ID da unidade Just CT (única que tem produtos ativos pro go-live de 01/06)
const JUST_CT_ID = 'c28bf4bb-56f8-44ff-818a-c7836e58bcef'

export default function ComprarPage() {
  const router = useRouter()
  const supabase = createClient()
  const { perfil } = useAuth()

  const [produtos, setProdutos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarProdutos()
  }, [])

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

  function irParaCheckout(produtoId: string) {
    router.push(`/comprar/checkout?produto=${produtoId}`)
  }

  // Helpers
  function formatarValor(v: number) {
    const reais = Math.floor(v)
    const cents = Math.round((v - reais) * 100)
    return { reais: `R$ ${reais}`, cents: `,${cents.toString().padStart(2, '0')}` }
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

  // Rota da área de cada papel da equipe (pra botão "Minha área")
  function rotaEquipe(): string {
    const role = perfil?.role as string
    if (role === 'admin') return '/admin/dashboard'
    if (role === 'coach') return '/coach/painel'
    if (role === 'coordenadora') return '/ju/biblioteca'
    if (role === 'recepcao') return '/recepcao/agenda'
    return '/'
  }

  const isCliente = perfil?.role === 'cliente'
  const isLogado = !!perfil
  const isEquipe = isLogado && !isCliente

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        .produto-card-h { transition: all .25s; }
        .produto-card-h:hover { border-color: ${ACCENT} !important; transform: translateY(-4px); }
        .btn-comprar-h:hover { opacity: 0.85; }
        .btn-comprar-ghost-h:hover { background: ${ACCENT} !important; color: #fff !important; }
        .nav-link-h:hover { color: ${ACCENT} !important; }
        .nav-auth-h:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        @media (max-width: 768px) {
          .nav-links-d { display: none !important; }
          .grid-produtos-r { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* NAV (igual ao da home) */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a' }}>
        <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div className="nav-links-d" style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <span onClick={() => router.push('/#coach-ct')} className="nav-link-h" style={{ color: '#999', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Coach CT</span>
          <span onClick={() => router.push('/#espaco')} className="nav-link-h" style={{ color: '#999', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Espaço</span>
          <span onClick={() => router.push('/#planos')} className="nav-link-h" style={{ color: '#999', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Planos</span>
          <span onClick={() => router.push('/#localizacao')} className="nav-link-h" style={{ color: '#999', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Localização</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isCliente ? (
            <button onClick={() => router.push('/minha-conta')} className="nav-auth-h" style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Minha conta
            </button>
          ) : isEquipe ? (
            <button onClick={() => router.push(rotaEquipe())} className="nav-auth-h" style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Minha área
            </button>
          ) : (
            <button onClick={() => router.push('/login')} className="nav-auth-h" style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Login
            </button>
          )}
        </div>
      </nav>

      {/* HEADER DA PÁGINA */}
      <div style={{ paddingTop: 120, paddingBottom: '3rem', padding: '120px 2.5rem 3rem', maxWidth: 1100, margin: '0 auto', textAlign: 'center' as const }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>
          // comprar online
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(48px, 6vw, 72px)', color: '#fff', lineHeight: 1.05, marginBottom: '1rem', letterSpacing: 2 }}>
          PLANOS
        </div>
        <div style={{ color: '#999', fontSize: 16, maxWidth: 560, lineHeight: 1.7, margin: '0 auto' }}>
          Acesso ilimitado ao CT ou créditos avulsos para Coach CT e musculação.
          Pagamento via PIX ou Cartão de crédito.
        </div>
      </div>

      {/* LISTA DE PRODUTOS */}
      <div style={{ padding: '0 2.5rem 6rem', maxWidth: 1100, margin: '0 auto' }}>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : produtos.length === 0 ? (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '3rem', textAlign: 'center' as const }}>
            <div style={{ fontSize: 32, marginBottom: '1rem' }}>📦</div>
            <div style={{ color: '#888', fontSize: 16 }}>Nenhum produto disponível no momento.</div>
            <div style={{ color: '#999', fontSize: 13, marginTop: 8 }}>Entre em contato com a recepção: <strong style={{ color: '#fff' }}>(11) 9XXXX-XXXX</strong></div>
          </div>
        ) : (
          <>
            {/* Planos de Acesso */}
            {produtos.filter(p => p.subtipo === 'acesso').length > 0 && (
              <>
                <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#999', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>
                  Planos de acesso
                </div>
                <div className="grid-produtos-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                  {produtos.filter(p => p.subtipo === 'acesso').map(p => {
                    const valor = formatarValor(Number(p.valor))
                    const badge = badgeProduto(p)
                    return (
                      <div key={p.id} className="produto-card-h" style={{
                        background: '#111',
                        border: `1px solid ${badge?.isMaisPopular ? ACCENT : '#222'}`,
                        borderRadius: 16, padding: '2rem',
                        position: 'relative', overflow: 'hidden',
                        display: 'flex', flexDirection: 'column'
                      }}>
                        {badge && (
                          <div style={{ position: 'absolute', top: 12, right: -16, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.25rem 2.5rem', transform: 'rotate(15deg)', letterSpacing: 1 }}>
                            {badge.label}
                          </div>
                        )}
                        <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#999', marginBottom: '0.5rem' }}>
                          {p.nome}
                        </div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
                          {valor.reais}<span style={{ fontSize: 24 }}>{valor.cents}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: '1rem' }}>
                          {periodoTexto(p)}
                        </div>
                        <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6, flex: 1, marginBottom: '1.5rem' }}>
                          {descricaoProduto(p)}
                        </div>
                        <button
                          onClick={() => irParaCheckout(p.id)}
                          className={badge?.isMaisPopular ? 'btn-comprar-h' : 'btn-comprar-ghost-h'}
                          style={badge?.isMaisPopular
                            ? { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'opacity .2s' }
                            : { background: 'transparent', color: ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 8, padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s' }
                          }>
                          Comprar agora →
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Créditos avulsos */}
            {produtos.filter(p => p.subtipo !== 'acesso').length > 0 && (
              <>
                <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#999', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>
                  Créditos avulsos
                </div>
                <div className="grid-produtos-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  {produtos.filter(p => p.subtipo !== 'acesso').map(p => {
                    const valor = formatarValor(Number(p.valor))
                    const ehCoachCT = p.nome?.toLowerCase().includes('coach')
                    return (
                      <div key={p.id} className="produto-card-h" style={{
                        background: '#111',
                        border: `1px solid ${ehCoachCT ? ACCENT : '#222'}`,
                        borderRadius: 16, padding: '2rem',
                        display: 'flex', flexDirection: 'column'
                      }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#999', marginBottom: '0.5rem' }}>
                          {p.nome}
                        </div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
                          {valor.reais}<span style={{ fontSize: 24 }}>{valor.cents}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: '1rem' }}>
                          {periodoTexto(p)}
                        </div>
                        <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6, flex: 1, marginBottom: '1.5rem' }}>
                          {descricaoProduto(p)}
                        </div>
                        <button
                          onClick={() => irParaCheckout(p.id)}
                          className={ehCoachCT ? 'btn-comprar-h' : 'btn-comprar-ghost-h'}
                          style={ehCoachCT
                            ? { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'opacity .2s' }
                            : { background: 'transparent', color: ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 8, padding: '0.85rem 1.25rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', transition: 'all .2s' }
                          }>
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

        {/* Aviso de segurança */}
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

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '1rem' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#fff', letterSpacing: 2 }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>© 2025 Just CT — Serious Training</div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <span onClick={() => router.push('/')} style={{ fontSize: 12, color: '#999', cursor: 'pointer' }}>← Voltar pra home</span>
        </div>
      </footer>
    </div>
  )
}
