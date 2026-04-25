'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [pronto, setPronto] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPronto(true)
      }
    })
  }, [])

  async function handleSalvar() {
    setErro('')
    setMsg('')
    if (!senha || senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirma) {
      setErro('As senhas não coincidem.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setErro('Erro: ' + error.message)
    } else {
      setMsg('Senha alterada! Redirecionando...')
      setTimeout(() => router.push('/'), 2000)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-2xl font-semibold text-gray-900 tracking-wider mb-1">● COACH CT</div>
          <p className="text-gray-500 text-sm">Redefinir senha</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          {!pronto ? (
            <div className="text-center py-4">
              <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Verificando link...</p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-gray-900 mb-5">Nova senha</h1>
              <div className="space-y-4">
                <div>
                  <label className="label">Nova senha</label>
                  <input className="input" type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} />
                </div>
                <div>
                  <label className="label">Confirmar senha</label>
                  <input className="input" type="password" placeholder="Digite novamente" value={confirma} onChange={e => setConfirma(e.target.value)} />
                </div>
                {erro && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
                {msg && <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">{msg}</p>}
                <button onClick={handleSalvar} disabled={loading} className="btn btn-primary w-full">
                  {loading ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
