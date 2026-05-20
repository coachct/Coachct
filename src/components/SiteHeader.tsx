'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const ACCENT = '#ff2d9b'

export default function SiteHeader() {
  const { perfil, loading } = useAuth()
  const router = useRouter()

  const isCliente = perfil?.role === 'cliente'
  const isLogado = !!perfil

  if (loading) return (
    <div style={{ height: 64, background: '#08080895', borderBottom: '1px solid #1a1a1a' }} />
  )

  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a' }}>
      <style>{`
        .sh-nav-auth:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .sh-nav-cta:hover { opacity: 0.85; }
      `}</style>

      <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
        JUST<span style={{ color: ACCENT }}>CT</span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {isLogado && isCliente ? (
          <button onClick={() => router.push('/minha-conta')} className="sh-nav-auth"
            style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
            Minha conta
          </button>
        ) : !isLogado ? (
          <>
            <button onClick={() => router.push('/login')} className="sh-nav-auth"
              style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
              Login
            </button>
            <button onClick={() => router.push('/cadastro')} className="sh-nav-auth"
              style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
              Cadastro
            </button>
          </>
        ) : null}

        <button onClick={() => router.push('/comprar')} className="sh-nav-cta"
          style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '0.45rem 1.25rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
          Comprar
        </button>
        <button onClick={() => router.push('/agendar')} className="sh-nav-cta"
          style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '0.45rem 1.25rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
          Agendar Treino
        </button>
      </div>
    </nav>
  )
}
