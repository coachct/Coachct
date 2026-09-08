'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const ACCENT = '#ff2d9b'

// Página pública de descadastro. Pede um clique de confirmação de propósito:
// antivírus e firewall de e-mail abrem os links da mensagem pra checar, e se a
// simples abertura tirasse da lista, metade da base sairia sozinha.
export default function DescadastroPage() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  )
}

function Conteudo() {
  const token = useSearchParams().get('t') || ''
  const [estado, setEstado] = useState<'inicio' | 'enviando' | 'pronto' | 'erro'>('inicio')

  async function confirmar() {
    setEstado('enviando')
    try {
      const res = await fetch(`/api/descadastro?t=${encodeURIComponent(token)}`, { method: 'POST' })
      const data = await res.json()
      setEstado(data?.ok ? 'pronto' : 'erro')
    } catch {
      setEstado('erro')
    }
  }

  return (
    <div style={{
      background: '#080808', minHeight: '100vh', color: '#f0f0f0',
      fontFamily: "'DM Sans', sans-serif", display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .btn:hover { opacity: .85; }
      `}</style>

      <div style={{
        background: '#111', border: '1px solid #222', borderRadius: 20,
        padding: '2.5rem 2rem', maxWidth: 460, width: '100%', textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2,
          color: '#fff', marginBottom: '1rem',
        }}>
          JUST <span style={{ color: ACCENT }}>CLUB &amp; CT</span>
        </div>

        {estado === 'pronto' ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: '0.75rem' }}>
              Pronto, você saiu da lista.
            </div>
            <div style={{ fontSize: 14, color: '#999', lineHeight: 1.7 }}>
              Não vamos mais te mandar novidades e promoções. Avisos das suas reservas
              e e-mails da sua conta continuam chegando normalmente.
            </div>
          </>
        ) : estado === 'erro' ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: '0.75rem' }}>
              Não consegui concluir.
            </div>
            <div style={{ fontSize: 14, color: '#999', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Esse link pode ter expirado. Fala com a gente no WhatsApp que a gente tira
              seu e-mail da lista na hora.
            </div>
            <a href="https://wa.me/5511917555878" style={{ color: ACCENT, fontSize: 14, fontWeight: 600 }}>
              Falar no WhatsApp
            </a>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: '0.75rem' }}>
              Quer parar de receber nossas novidades?
            </div>
            <div style={{ fontSize: 14, color: '#999', lineHeight: 1.7, marginBottom: '1.75rem' }}>
              Você deixa de receber promoções e novidades. Avisos das suas reservas e
              e-mails da sua conta continuam chegando.
            </div>
            <button onClick={confirmar} disabled={estado === 'enviando' || !token} className="btn"
              style={{
                width: '100%', background: ACCENT, color: '#fff', border: 'none',
                borderRadius: 10, padding: '0.9rem', fontWeight: 700, fontSize: 15,
                cursor: estado === 'enviando' ? 'default' : 'pointer',
                fontFamily: "'DM Sans', sans-serif", opacity: estado === 'enviando' ? 0.7 : 1,
              }}>
              {estado === 'enviando' ? 'Saindo...' : 'Confirmar e sair da lista'}
            </button>
            <a href="/" style={{ display: 'block', marginTop: '1rem', fontSize: 13, color: '#666' }}>
              Deixa pra lá, quero continuar recebendo
            </a>
          </>
        )}
      </div>
    </div>
  )
}
