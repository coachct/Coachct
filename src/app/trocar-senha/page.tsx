'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-primary-200 text-2xl font-semibold tracking-widest mb-1">● COACH CT</div>
          <p className="text-primary-400 text-sm">Redefinição de senha</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-xl">

          {enviado ? (
            <div className="text-center py-2">
              <div className="text-4xl mb-4">📧</div>
              <h1 className="text-lg font-semibold text-gray-900 mb-2">Email enviado!</h1>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                Se o email estiver cadastrado, você receberá uma <strong>senha provisória</strong> em instantes. Use ela para entrar e depois cadastre uma nova senha em Minha Conta.
              </p>
              <button onClick={() => router.push('/login')} className="btn btn-primary w-full">
                Voltar ao login
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-1">Esqueci minha senha</h1>
              <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                Digite seu email e enviaremos uma senha provisória para você acessar.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                {erro && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
                <button onClick={handleEnviar} disabled={loading} className="btn btn-primary w-full">
                  {loading ? 'Enviando...' : 'Enviar senha provisória'}
                </button>
                <button onClick={() => router.push('/login')}
                  className="w-full text-sm text-gray-400 hover:text-gray-600 text-center mt-2">
                  ← Voltar ao login
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
