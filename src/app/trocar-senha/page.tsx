'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function TrocarSenhaPage() {
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [pronto, setPronto] = useState(false)
  const [linkInvalido, setLinkInvalido] = useState(false)
  const router = useRouter()

  // ── Instância única do cliente para toda a vida do componente ─────────────
  const supabase = useRef(createClient()).current

  useEffect(() => {
    async function verificar() {
      // ── Fluxo 1: PKCE — ?code= na query string ────────────────────────────
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        window.history.replaceState(null, '', window.location.pathname)
        if (error) {
          setLinkInvalido(true)
        } else {
          setPronto(true)
        }
        return
      }

      // ── Fluxo 2: Implicit — #access_token= no hash ────────────────────────
      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token') || ''
        if (accessToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          window.history.replaceState(null, '', window.location.pathname)
          if (error) {
            setLinkInvalido(true)
          } else {
            setPronto(true)
          }
          return
        }
      }

      // ── Fluxo 3: sessão já ativa ──────────────────────────────────────────
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setPronto(true)
        return
      }

      setLinkInvalido(true)
    }

    verificar()
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

    // Confirma que a sessão ainda está ativa antes de tentar salvar
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      setErro('Sessão expirada. Solicite um novo link de redefinição.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: nova })
    if (error) {
      setErro('Erro ao alterar senha: ' + error.message)
      setLoading(false)
      return
    }

    setMsg('Senha alterada com sucesso! Redirecionando...')
    setNova('')
    setConfirma('')

    setTimeout(async () => {
      await supabase.auth.signOut()
      router.push('/login')
    }, 2000)

    setLoading(false)
  }

  // Link inválido ou expirado
  if (linkInvalido) return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-primary-200 text-2xl font-semibold tracking-widest mb-1">● COACH CT</div>
          <p className="text-primary-400 text-sm">Redefinição de senha</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-xl text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Link expirado</h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Este link de redefinição expirou ou já foi usado. Solicite um novo na tela de login.
          </p>
          <button onClick={() => router.push('/login')} className="btn btn-primary w-full">
            Solicitar novo link
          </button>
        </div>
      </div>
    </div>
  )

  // Carregando / verificando token
  if (!pronto) return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // Formulário de nova senha
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
