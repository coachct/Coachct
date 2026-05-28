'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const ACCENT = '#ff2d9b'

export default function SiteHeader() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const isClienteLogado = perfil?.role === 'cliente'

  if (loading) return (
    <div style={{ height: 64, background: '#08080895', borderBottom: '1px solid #1a1a1a' }} />
  )

  return (
    <nav className="sh-nav">
      <style>{`
        .sh-nav {
          position: fixed; top: 0; left: 0; right: 0;
          z-index: 200;
          padding: 0 2rem; height: 64px;
          display: flex; align-items: center; justify-content: space-between;
          background: #08080895; backdrop-filter: blur(16px);
          border-bottom: 1px solid #1a1a1a;
        }
        .sh-logo {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 26px; color: #fff; letter-spacing: 2px; cursor: pointer;
          flex-shrink: 0;
        }
        .sh-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
        .sh-btn {
          border-radius: 6px; font-weight: 500; font-size: 13px; cursor: pointer;
          font-family: 'DM Sans', sans-serif; transition: all .2s; white-space: nowrap;
        }
        .sh-btn-auth {
          background: transparent; color: #aaa; border: 1px solid #333;
          padding: 0.45rem 1rem;
        }
        .sh-btn-auth:hover { border-color: ${ACCENT}; color: ${ACCENT}; }
        .sh-btn-cta {
          background: ${ACCENT}; color: #fff; border: none; font-weight: 600;
          padding: 0.45rem 1.25rem;
        }
        .sh-btn-cta:hover { opacity: 0.85; }

        /* ── Mobile: reduz padding, encolhe botões, esconde "Comprar" ── */
        @media (max-width: 560px) {
          .sh-nav { padding: 0 1rem; }
          .sh-logo { font-size: 22px; letter-spacing: 1px; }
          .sh-actions { gap: 6px; }
          .sh-btn { font-size: 12px; }
          .sh-btn-auth { padding: 0.4rem 0.7rem; }
          .sh-btn-cta { padding: 0.4rem 0.85rem; }
          .sh-hide-mobile { display: none !important; }
        }
      `}</style>

      <div className="sh-logo" onClick={() => router.push('/')}>
        JUST<span style={{ color: ACCENT }}>CT</span>
      </div>

      <div className="sh-actions">
        {isClienteLogado ? (
          <button onClick={() => router.push('/minha-conta')} className="sh-btn sh-btn-auth">
            Minha conta
          </button>
        ) : (
          <>
            <button onClick={() => router.push('/login')} className="sh-btn sh-btn-auth">
              Login
            </button>
            <button onClick={() => router.push('/cadastro')} className="sh-btn sh-btn-auth sh-hide-mobile">
              Cadastro
            </button>
          </>
        )}
        <button onClick={() => router.push('/comprar')} className="sh-btn sh-btn-cta sh-hide-mobile">
          Comprar
        </button>
        <button onClick={() => router.push('/agendar')} className="sh-btn sh-btn-cta">
          Agendar Treino
        </button>
      </div>
    </nav>
  )
}
