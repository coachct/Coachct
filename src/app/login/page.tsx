'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo] = useState<'login' | 'reset'>('login')
  const [resetEnviado, setResetEnviado] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const { signIn, perfil } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (perfil) {
      if (['admin', 'coach', 'coordenadora', 'recepcao'].includes(perfil.role)) {
        router.push('/equipe')
        return
      }
      router.push('/minha-conta')
    }
  }, [perfil])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError('Email ou senha incorretos.')
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!email) { setError('Digite seu email.'); return }
    setError('')
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/trocar-senha`,
    })
    setResetLoading(false)
    if (error) {
      setError('Erro ao enviar. Verifique o email e tente novamente.')
    } else {
      setResetEnviado(true)
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

          {modo === 'login' && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginBottom: '1.5rem' }}>Entrar</h1>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1 }}>Email</label>
                  <input type="email" placeholder="seu@email.com" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    style={{ width: '100%', background: '#080808', border: '1px solid #333', borderRadius: 10, padding: '0.75rem 1rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }} />
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1 }}>Senha</label>
                  <input type="password" placeholder="••••••••" value={password}
                    onChange={e => setPassword(e.target.value)} required
                    style={{ width: '100%', background: '#080808', border: '1px solid #333', borderRadius: 10, padding: '0.75rem 1rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }} />
                </div>
                {error && (
                  <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>
                    {error}
                  </div>
                )}
                <button type="submit" disabled={loading}
                  style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: loading ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.7 : 1 }}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
              <button onClick={() => { setModo('reset'); setError('') }}
                style={{ width: '100%', background: 'none', border: 'none', color: '#555', fontSize: 13, cursor: 'pointer', marginTop: '1rem', fontFamily: "'DM Sans', sans-serif" }}>
                Esqueci minha senha
              </button>
              <div style={{ borderTop: '1px solid #222', marginTop: '1.5rem', paddingTop: '1.5rem', textAlign: 'center' as const }}>
                <span style={{ fontSize: 13, color: '#555' }}>Não tem conta? </span>
                <span onClick={() => router.push('/cadastro')}
                  style={{ fontSize: 13, color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>
                  Criar conta
                </span>
              </div>
            </>
          )}

          {modo === 'reset' && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Redefinir senha</h1>
              <p style={{ fontSize: 13, color: '#555', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                Digite seu email e enviaremos um link para criar uma nova senha.
              </p>
              {resetEnviado ? (
                <div style={{ textAlign: 'center' as const, padding: '1rem 0' }}>
                  <div style={{ fontSize: 40, marginBottom: '1rem' }}>📧</div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Email enviado!</p>
                  <p style={{ fontSize: 13, color: '#555', marginBottom: '1.5rem' }}>Verifique sua caixa de entrada.</p>
                  <button onClick={() => { setModo('login'); setResetEnviado(false); setEmail('') }}
                    style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReset}>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1 }}>Email</label>
                    <input type="email" placeholder="seu@email.com" value={email}
                      onChange={e => setEmail(e.target.value)} required
                      style={{ width: '100%', background: '#080808', border: '1px solid #333', borderRadius: 10, padding: '0.75rem 1rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }} />
                  </div>
                  {error && (
                    <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>
                      {error}
                    </div>
                  )}
                  <button type="submit" disabled={resetLoading}
                    style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    {resetLoading ? 'Enviando...' : 'Enviar link'}
                  </button>
                  <button type="button" onClick={() => { setModo('login'); setError('') }}
                    style={{ width: '100%', background: 'none', border: '1px solid #333', borderRadius: 10, padding: '0.75rem', color: '#888', fontSize: 14, cursor: 'pointer', marginTop: '0.75rem', fontFamily: "'DM Sans', sans-serif" }}>
                    ← Voltar
                  </button>
                </form>
              )}
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
