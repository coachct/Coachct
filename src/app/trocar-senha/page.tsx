'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function TrocarSenhaPage() {
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const router = useRouter()
  const supabase = useRef(createClient()).current

  async function handleEnviarCodigo() {
    setErro('')
    if (!email) { setErro('Digite seu email.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    })
    setLoading(false)
    if (error) {
      setErro('Email não encontrado. Verifique e tente novamente.')
      return
    }
    setEtapa('codigo')
  }

  async function handleSalvar() {
    setErro('')
    if (!codigo || codigo.length < 6) { setErro('Digite o código de 6 dígitos.'); return }
    if (!nova || nova.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (nova !== confirma) { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    // Verifica o OTP e cria sessão
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token: codigo,
      type: 'email',
    })
    if (otpError) {
      setErro('Código inválido ou expirado. Tente novamente.')
      setLoading(false)
      return
    }
    // Atualiza a senha
    const { error: updateError } = await supabase.auth.updateUser({ password: nova })
    if (updateError) {
      setErro('Erro ao salvar senha. Tente novamente.')
      setLoading(false)
      return
    }
    setMsg('Senha alterada com sucesso! Redirecionando...')
    setTimeout(async () => {
      await supabase.auth.signOut()
      router.push('/login')
    }, 2000)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-primary-200 text-2xl font-semibold tracking-widest mb-1">● COACH CT</div>
          <p className="text-primary-400 text-sm">Redefinição de senha</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-xl">

          {etapa === 'email' && (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-1">Esqueci minha senha</h1>
              <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                Digite seu email e enviaremos um código de verificação.
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
                <button onClick={handleEnviarCodigo} disabled={loading} className="btn btn-primary w-full">
                  {loading ? 'Enviando...' : 'Enviar código'}
                </button>
                <button onClick={() => router.push('/login')}
                  className="w-full text-sm text-gray-400 hover:text-gray-600 text-center mt-2">
                  ← Voltar ao login
                </button>
              </div>
            </>
          )}

          {etapa === 'codigo' && (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-1">Nova senha</h1>
              <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                Digite o código enviado para <strong>{email}</strong> e escolha uma nova senha.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="label">Código de verificação</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="000000"
                    maxLength={6}
                    value={codigo}
                    onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div>
                  <label className="label">Nova senha</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={nova}
                    onChange={e => setNova(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Confirmar nova senha</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Digite novamente"
                    value={confirma}
                    onChange={e => setConfirma(e.target.value)}
                  />
                </div>
                {erro && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
                {msg && <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">{msg}</p>}
                <button onClick={handleSalvar} disabled={loading} className="btn btn-primary w-full">
                  {loading ? 'Salvando...' : 'Salvar nova senha'}
                </button>
                <button onClick={() => { setEtapa('email'); setErro(''); setCodigo('') }}
                  className="w-full text-sm text-gray-400 hover:text-gray-600 text-center mt-2">
                  ← Reenviar código
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
