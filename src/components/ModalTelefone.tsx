'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'

function formatarTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2)  return d.length ? `(${d}` : d
  if (d.length <= 6)  return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export default function ModalTelefone({
  aberto,
  onFechar,
  onSucesso,
}: {
  aberto: boolean
  onFechar: () => void
  onSucesso: (telefone: string) => void
}) {
  const supabase = createClient()
  const [telefone, setTelefone] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  if (!aberto) return null

  async function salvar() {
    setErro('')
    const telLimpo = telefone.replace(/\D/g, '')
    if (telLimpo.length < 10 || telLimpo.length > 11) {
      setErro('Informe DDD + número (10 ou 11 dígitos).')
      return
    }

    setSalvando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setErro('Sessão expirada. Faça login novamente.')
        setSalvando(false)
        return
      }

      const res = await fetch('/api/cliente/atualizar-telefone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ telefone: telLimpo }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErro(data.error || 'Erro ao salvar telefone. Tente novamente.')
        setSalvando(false)
        return
      }

      setSalvando(false)
      setTelefone('')
      onSucesso(data.telefone || telLimpo)
    } catch {
      setErro('Erro de conexão. Tente novamente.')
      setSalvando(false)
    }
  }

  const inputStyle = {
    width: '100%', background: '#080808', border: '1px solid #333', borderRadius: 10,
    padding: '0.85rem 1rem', color: '#fff', fontSize: 16,
    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        .mt-input:focus { outline: none; border-color: ${ACCENT} !important; }
      `}</style>
      <div style={{ background: '#111', border: `1.5px solid ${ACCENT}55`, borderRadius: 20, width: '100%', maxWidth: 420, padding: '1.5rem', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ fontSize: 36, marginBottom: '0.75rem', textAlign: 'center' }}>📱</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', marginBottom: 8, textAlign: 'center', letterSpacing: 1 }}>
          FALTA SÓ SEU TELEFONE
        </div>
        <div style={{ fontSize: 14, color: '#aaa', lineHeight: 1.7, marginBottom: '1.25rem', textAlign: 'center' }}>
          Precisamos de um número de contato para concluir sua reserva e manter seu cadastro de pagamento em dia.
        </div>

        <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
          Telefone com DDD
        </label>
        <input
          className="mt-input"
          style={inputStyle}
          type="tel"
          inputMode="numeric"
          placeholder="(11) 99999-9999"
          value={telefone}
          onChange={e => setTelefone(formatarTelefone(e.target.value))}
          autoFocus
        />

        {erro && (
          <div style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 8, padding: '0.7rem 1rem', fontSize: 13, color: ACCENT, marginTop: '1rem' }}>
            {erro}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
          <button
            onClick={onFechar}
            disabled={salvando}
            style={{ flex: 1, background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: salvando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 700, fontSize: 15, cursor: salvando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: salvando ? 0.7 : 1 }}>
            {salvando ? 'Salvando...' : 'Salvar e continuar →'}
          </button>
        </div>
      </div>
    </div>
  )
}
