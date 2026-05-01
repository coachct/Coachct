'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function TrocarSenhaPage() {
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [pronto, setPronto] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    // Captura o token do hash da URL quando vem pelo link do email
    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(() => {
          // limpa o hash da URL
          window.history.replaceState(null, '', window.location.pathname)
          setPronto(true)
        })
      }
    } else {
      // Acesso normal (coach logado trocando a senha)
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setPronto(true)
      })
    }
  }, [])

  async function handleSalvar() {
    setErro('')
    setMsg('')
    if (!nova || nova.length < 6) {
      setErro('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (nova !== confirma) {
      setErro('As senhas não coincidem.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: nova })
    if (error) {
      setErro('Erro ao alterar senha: ' + error.message)
    } else {
      setMsg('Senha alterada com sucesso! Redirecionando...')
      setNova('')
      setConfirma('')
      setTimeout(() => router.push('/'), 2000)
    }
    setLoading(false)
  }

  if (!pronto) return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-primary-200 text-2xl font-semibold tracking-widest mb-1">● COACH CT</div>
          <p className="text-primary-400 text-sm">Redefinição de senha</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Nova senha</h1>
          <p className="text-xs text-gray-400 mb-5">Digite e confirme sua nova senha de acesso.</p>
          <div className="space-y-4">
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
          </div>
        </div>
      </div>
    </div>
  )
}
