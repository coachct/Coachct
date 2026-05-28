'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ACCENT = '#ff2d9b'

export default function TrocarSenhaPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)
  const router = useRouter()

  async function handleEnviar() {
    setErro('')
    if (!email.trim()) { setErro('Digite seu email.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/resetar-senha-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.error || 'Erro ao enviar. Tente novamente.')
        setLoading(false)
        return
      }
      setEnviado(true)
    } catch (e: any) {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } input:focus { outline: none; border-color: ${ACCENT} !important; }`}</style>
      <div style={{ width: '100%', maxWidth: 400 }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 3, cursor: 'pointer', display: 'inline-block' }}>
            JUST<span style={{ color: ACCENT }}>CT</span>
          </div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Área do aluno</div>
        </div>

        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 20, padding: '2rem' }}>

          {enviado ? (
            <div style={{ textAlign: 'center' as const, padding: '0.5rem 0' }}>
              <div style={{ fontSize: 40, marginBottom: '1rem' }}>📧</div>
              <p style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Email enviado!</p>
              <p style={{ fontSize: 13, color: '#888', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                Se o email estiver cadastrado, você receberá uma <strong style={{ color: '#fff' }}>senha provisória</strong> em instantes. Use ela para entrar e depois cadastre uma nova senha em Minha Conta.
              </p>
              <button onClick={() => router.push('/login')}
                style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Voltar ao login
              </button>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Esqueci minha senha</h1>
              <p style={{ fontSize: 13, color: '#555', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                Digite seu email e enviaremos uma senha provisória para você acessar.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1 }}>Email</label>
                <input type="email" placeholder="seu@email.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleEnviar() }}
                  style={{ width: '100%', background: '#080808', border: '1px solid #333', borderRadius: 10, padding: '0.75rem 1rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }} />
              </div>
              {erro && (
                <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>
                  {erro}
                </div>
              )}
              <button onClick={handleEnviar} disabled={loading}
                style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: loading ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Enviando...' : 'Enviar senha provisória'}
              </button>
              <button onClick={() => router.push('/login')}
                style={{ width: '100%', background: 'none', border: '1px solid #333', borderRadius: 10, padding: '0.75rem', color: '#888', fontSize: 14, cursor: 'pointer', marginTop: '0.75rem', fontFamily: "'DM Sans', sans-serif" }}>
                ← Voltar ao login
              </button>
            </>
          )}

        </div>

        <p style={{ textAlign: 'center' as const, fontSize: 12, color: '#333', marginTop: '1.5rem' }}>
          É da equipe?{' '}
          <span onClick={() => router.push('/equipe')} style={{ color: '#555', cursor: 'pointer' }}>
            Acesse por aqui
          </span>
        </p>
      </div>
    </div>
  )
}
