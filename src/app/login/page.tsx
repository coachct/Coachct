'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo] = useState<'login' | 'reset'>('login')
  const [resetEnviado, setResetEnviado] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const { signIn } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError('Email ou senha incorretos.')
      setLoading(false)
      return
    }
    router.push('/')
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
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-primary-200 text-2xl font-semibold tracking-widest mb-1">● COACH CT</div>
          <p className="text-primary-400 text-sm">Sistema de gestão de coaches</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-xl">

          {/* ─── LOGIN ─── */}
          {modo === 'login' && (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-5">Entrar</h1>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Senha</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}
                <button type="submit" disabled={loading} className="btn btn-primary w-full mt-2">
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
              <button
                onClick={() => { setModo('reset'); setError(''); setResetEnviado(false) }}
                className="text-xs text-primary-600 hover:underline mt-4 w-full text-center block"
              >
                Esqueci minha senha
              </button>
            </>
          )}

          {/* ─── RESET ─── */}
          {modo === 'reset' && (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-1">Redefinir senha</h1>
              <p className="text-xs text-gray-400 mb-5">
                Digite seu email e enviaremos um link para criar uma nova senha.
              </p>

              {resetEnviado ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">📧</div>
                  <p className="text-sm font-medium text-gray-900 mb-1">Email enviado!</p>
                  <p className="text-xs text-gray-400 mb-4">
                    Verifique sua caixa de entrada e clique no link para redefinir sua senha.
                  </p>
                  <button
                    onClick={() => { setModo('login'); setResetEnviado(false); setEmail('') }}
                    className="btn btn-primary w-full"
                  >
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  <div>
                    <label className="label">Email</label>
                    <input
                      className="input"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  {error && (
                    <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                  )}
                  <button type="submit" disabled={resetLoading} className="btn btn-primary w-full">
                    {resetLoading ? 'Enviando...' : 'Enviar link de redefinição'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setModo('login'); setError('') }}
                    className="btn w-full text-sm"
                  >
                    ← Voltar ao login
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <p className="text-center text-primary-600 text-xs mt-6">
          Não tem acesso? Solicite ao administrador.
        </p>
      </div>
    </div>
  )
}
