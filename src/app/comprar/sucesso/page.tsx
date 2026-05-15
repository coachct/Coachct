'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const ACCENT = '#ff2d9b'
const SUCCESS = '#22c55e'

export default function SucessoPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    }>
      <SucessoContent />
    </Suspense>
  )
}

function SucessoContent() {
  const router = useRouter()
  const supabase = createClient()
  const { perfil } = useAuth()
  const searchParams = useSearchParams()
  const produtoId = searchParams.get('produto')
  const metodo = searchParams.get('metodo') || 'pix'

  const [produto, setProduto] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (produtoId) carregarProduto()
    else setLoading(false)
  }, [produtoId])

  async function carregarProduto() {
    const { data } = await supabase
      .from('produtos')
      .select('*')
      .eq('id', produtoId)
      .maybeSingle()
    setProduto(data)
    setLoading(false)
  }

  function formatarValor(v: number) {
    return `R$ ${v.toFixed(2).replace('.', ',')}`
  }

  function gerarNumeroPedido() {
    const seed = produtoId ? produtoId.slice(-6).toUpperCase() : 'XXXXXX'
    return `#${seed}`
  }

  const ehAcesso = produto?.subtipo === 'acesso'
  const ehPix = metodo === 'pix'
  const metodoLabel = ehPix ? 'PIX' : 'Cartão de crédito'
  const tituloSucesso = ehPix ? 'PAGAMENTO CONFIRMADO!' : 'PAGAMENTO APROVADO!'
  const subtitulo = ehAcesso
    ? 'Seu plano de acesso foi ativado e já está disponível na sua conta.'
    : 'Seu crédito foi liberado e já está disponível para agendamento.'

  function dataValidade(): string {
    if (!produto?.dias_validade) return ''
    const fim = new Date()
    fim.setDate(fim.getDate() + produto.dias_validade)
    return fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes scaleIn { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes fadeUp { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 ${SUCCESS}66; } 50% { box-shadow: 0 0 0 20px ${SUCCESS}00; } }
        .btn-primary-h:hover { opacity: 0.85; }
        .btn-ghost-h:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
      `}</style>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a' }}>
        <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
      </nav>

      <div style={{ paddingTop: 100, padding: '100px 1.5rem 4rem', maxWidth: 540, margin: '0 auto' }}>

        {/* CHECK GIGANTE */}
        <div style={{ textAlign: 'center' as const, marginBottom: '2.5rem' }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: SUCCESS,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem',
            animation: 'scaleIn 0.5s ease-out, pulse 2s ease-out 0.5s infinite',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div style={{ animation: 'fadeUp 0.5s ease-out 0.3s both' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(36px, 5vw, 48px)', color: '#fff', lineHeight: 1.05, marginBottom: '0.75rem', letterSpacing: 1 }}>
              {tituloSucesso}
            </div>
            <div style={{ color: '#999', fontSize: 15, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              {subtitulo}
            </div>
          </div>
        </div>

        {/* RESUMO DO PEDIDO */}
        {produto && (
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem 2rem', marginBottom: '1rem', animation: 'fadeUp 0.5s ease-out 0.5s both' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#999', fontFamily: "'DM Mono', monospace" }}>
                Pedido {gerarNumeroPedido()}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: 20,
                background: `${SUCCESS}20`, color: SUCCESS, textTransform: 'uppercase' as const, letterSpacing: 1,
              }}>
                ✓ Pago
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid #222' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                  {produto.nome}
                </div>
                <div style={{ fontSize: 13, color: '#999', lineHeight: 1.5 }}>
                  {ehAcesso
                    ? `Acesso ilimitado por ${produto.dias_validade} dias`
                    : `1 crédito · válido por ${produto.dias_validade || 30} dias`}
                </div>
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const }}>
                {formatarValor(Number(produto.valor))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#999' }}>Forma de pagamento</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>
                  {ehPix ? '⚡ ' : '💳 '}{metodoLabel}
                </span>
              </div>
              {ehAcesso && dataValidade() && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#999' }}>Válido até</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{dataValidade()}</span>
                </div>
              )}
              {!ehAcesso && dataValidade() && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#999' }}>Crédito expira em</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{dataValidade()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PRÓXIMOS PASSOS REAIS */}
        <div style={{ background: '#111', border: `1px solid ${ACCENT}40`, borderRadius: 16, padding: '1.5rem 2rem', marginBottom: '2rem', animation: 'fadeUp 0.5s ease-out 0.7s both' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: ACCENT, marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>
            Próximos passos
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {ehAcesso ? (
              <>
                <PassoItem num="1"
                  title="Seu plano está ativo"
                  desc="Você já pode acessar o Just CT em qualquer horário de funcionamento. Apresente seu CPF na recepção." />
                <PassoItem num="2"
                  title="Agende seu Coach CT"
                  desc="Quer treinar com personal exclusivo? Compre créditos Coach CT à parte e agende quando quiser." />
                <PassoItem num="3"
                  title="Recibo no seu email"
                  desc="Você receberá o comprovante fiscal em alguns minutos no email cadastrado." />
              </>
            ) : (
              <>
                <PassoItem num="1"
                  title="Agende seu treino"
                  desc="Vá em 'Agendar Treino' e use seu crédito recém-adicionado para marcar com o Coach CT." />
                <PassoItem num="2"
                  title="Compareça no horário"
                  desc="Apresente seu CPF na recepção e o Coach CT vai te receber para uma sessão de 1h, 1×1." />
                <PassoItem num="3"
                  title="Recibo no seu email"
                  desc="Você receberá o comprovante fiscal em alguns minutos no email cadastrado." />
              </>
            )}
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeUp 0.5s ease-out 0.9s both' }}>
          {perfil?.role === 'cliente' ? (
            <>
              <button onClick={() => router.push(ehAcesso ? '/minha-conta' : '/agendar')}
                className="btn-primary-h"
                style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                {ehAcesso ? 'Ir para minha conta →' : 'Agendar Coach CT →'}
              </button>
              <button onClick={() => router.push('/minha-conta')}
                className="btn-ghost-h"
                style={{ width: '100%', background: 'transparent', color: '#aaa', border: '1.5px solid #333', borderRadius: 12, padding: '0.9rem', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Ver meus planos e créditos
              </button>
            </>
          ) : (
            <button onClick={() => router.push('/login')}
              className="btn-primary-h"
              style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Entrar na minha conta →
            </button>
          )}
        </div>

        {/* RODAPÉ DISCRETO */}
        <div style={{ textAlign: 'center' as const, marginTop: '3rem', fontSize: 12, color: '#555', animation: 'fadeUp 0.5s ease-out 1.1s both' }}>
          Algum problema com sua compra? <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: 'none', fontWeight: 600 }}>Fale com a gente</a>
        </div>

      </div>
    </div>
  )
}

function PassoItem({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: `${ACCENT}20`, border: `1.5px solid ${ACCENT}`,
        color: ACCENT,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 13, flexShrink: 0,
      }}>
        {num}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: '#999', lineHeight: 1.6 }}>
          {desc}
        </div>
      </div>
    </div>
  )
}
