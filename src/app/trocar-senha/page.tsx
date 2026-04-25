'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PageHeader } from '@/components/ui'

export default function TrocarSenhaPage() {
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const supabase = createClient()

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
      setMsg('Senha alterada com sucesso!')
      setNova('')
      setConfirma('')
    }
    setLoading(false)
  }

  return (
    <div>
      <PageHeader title="Trocar senha" subtitle="Altere a senha da sua conta" />
      <div className="max-w-md">
        <div className="card">
          <div className="space-y-4">
            <div>
              <label className="label">Nova senha</label>
              <input className="input" type="password" placeholder="Mínimo 6 caracteres" value={nova} onChange={e => setNova(e.target.value)} />
            </div>
            <div>
              <label className="label">Confirmar nova senha</label>
              <input className="input" type="password" placeholder="Digite novamente" value={confirma} onChange={e => setConfirma(e.target.value)} />
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
