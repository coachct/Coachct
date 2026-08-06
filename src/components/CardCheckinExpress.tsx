'use client'
// Card mostrado logo após uma reserva Wellhub numa Club: convida o cliente a
// informar o email do Wellhub + cadastrar a foto, pro Check-in Express (EM BREVE).
// Alimenta o auto-vínculo (clientes.wellhub_email) e o reconhecimento facial.
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import CadastroRosto from '@/components/CadastroRosto'

export default function CardCheckinExpress({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState('')

  async function salvarEmail() {
    const e = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setErro('Informe um email válido.'); return }
    setSalvando(true); setErro('')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/conta/wellhub-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: e }),
      }).then(x => x.json()).catch(() => ({}))
      if (r?.ok) setSalvo(true)
      else setErro('Não deu para salvar agora. Tente de novo.')
    } catch { setErro('Não deu para salvar agora. Tente de novo.') }
    setSalvando(false)
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    fontFamily: "'DM Sans', sans-serif",
  }
  const card: React.CSSProperties = {
    background: '#0d0d0d', border: '1px solid #222', borderRadius: 18, padding: '1.5rem',
    maxWidth: 440, width: '100%', maxHeight: '92vh', overflow: 'auto', color: '#f5f5fa',
  }
  const inp: React.CSSProperties = {
    width: '100%', background: '#080808', border: '1px solid #333', borderRadius: 10,
    padding: '0.8rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
  }
  const btn: React.CSSProperties = {
    width: '100%', background: '#ff2d8e', color: '#fff', border: 'none', borderRadius: 10,
    padding: '0.8rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  }
  const btnGhost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid #333', color: '#aaa' }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(ev) => ev.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ fontSize: 34 }}>⚡</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 1, color: '#ff5aa6', lineHeight: 1.1 }}>
            EM BREVE: SELF CHECK-IN EXPRESS
          </div>
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.6, marginTop: 8 }}>
            Reserva confirmada! ✅ Em breve você vai entrar na unidade <b style={{ color: '#ccc' }}>sem fila na recepção</b>.
            Deixe tudo pronto: informe o email que você usa no <b style={{ color: '#ccc' }}>Wellhub</b> e cadastre sua foto.
          </div>
        </div>

        {/* Email do Wellhub */}
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 14, padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 1, marginBottom: 8 }}>💜 SEU EMAIL DO WELLHUB</div>
          {salvo ? (
            <div style={{ fontSize: 13, color: '#86efac' }}>✓ Email salvo! Assim seu check-in é reconhecido automaticamente.</div>
          ) : (
            <>
              <input style={inp} type="email" inputMode="email" placeholder="email que você usa no app Wellhub"
                value={email} onChange={(ev) => setEmail(ev.target.value)} />
              {erro && <div style={{ fontSize: 12, color: '#ff8888', marginTop: 6 }}>{erro}</div>}
              <button style={{ ...btn, marginTop: 10, opacity: salvando ? 0.6 : 1 }} disabled={salvando} onClick={salvarEmail}>
                {salvando ? 'Salvando…' : 'Salvar email'}
              </button>
            </>
          )}
        </div>

        {/* Foto (reusa o componente de cadastro de rosto) */}
        <CadastroRosto />

        <button style={{ ...btnGhost, marginTop: 4 }} onClick={onClose}>Concluir</button>
      </div>
    </div>
  )
}
