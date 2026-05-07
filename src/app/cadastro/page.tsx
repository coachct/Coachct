'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'

export default function CadastroPage() {
  const router = useRouter()
  const supabase = createClient()

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')

  function formatarCPF(v: string) {
    return v.replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  function formatarTel(v: string) {
    return v.replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{4})$/, '$1-$2')
  }

  async function cadastrar() {
    setErro('')
    if (!nome.trim()) { setErro('Preencha seu nome completo.'); return }
    if (cpf.replace(/\D/g, '').length < 11) { setErro('CPF inválido.'); return }
    if (telefone.replace(/\D/g, '').length < 10) { setErro('Telefone inválido.'); return }
    if (!email.trim()) { setErro('Preencha o email.'); return }
    if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (senha !== senha2) { setErro('As senhas não coincidem.'); return }

    setSalvando(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } }
    })

    if (authError || !authData.user) {
      setErro(authError?.message === 'User already registered'
        ? 'Este email já está cadastrado.'
        : 'Erro ao criar conta. Tente novamente.')
      setSalvando(false)
      return
    }

    const userId = authData.user.id

    await supabase.from('perfis').upsert({
      id: userId,
      nome: nome.trim(),
      role: 'cliente',
      ativo: true,
    })

    await supabase.from('clientes').insert({
      user_id: userId,
      nome: nome.trim(),
      cpf: cpf.replace(/\D/g, ''),
      telefone: telefone.replace(/\D/g, ''),
      email: email.trim(),
    })

    setSalvando(false)
    setSucesso(true)
    setTimeout(() => router.push('/minha-conta'), 2000)
  }

  const inputStyle = {
    width: '100%',
    background: '#080808',
    border: '1px solid #333',
    borderRadius: 10,
    padding: '0.75rem 1rem',
    color: '#fff',
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    fontSize: 12,
    color: '#555',
    display: 'block',
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { outline: none; border-color: ${ACCENT} !important; }
      `}</style>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 3, cursor: 'pointer', display: 'inline-block' }}>
            JUST<span style={{ color: ACCENT }}>CT</span>
          </div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Criar conta</div>
        </div>

        {/* Card */}
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 20, padding: '2rem' }}>

          {sucesso ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: 48, marginBottom: '1rem' }}>🎉</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Conta criada!</div>
              <div style={{ fontSize: 14, color: '#555' }}>Redirecionando para sua área...</div>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: '1.5rem' }}>Seus dados</h1>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Nome completo *</label>
                  <input style={inputStyle} type="text" placeholder="Seu nome completo"
                    value={nome} onChange={e => setNome(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>CPF *</label>
                  <input style={inputStyle} type="text" placeholder="000.000.000-00"
                    value={cpf} onChange={e => setCpf(formatarCPF(e.target.value))} />
                </div>
                <div>
                  <label style={labelStyle}>Telefone / WhatsApp *</label>
                  <input style={inputStyle} type="text" placeholder="(11) 99999-9999"
                    value={telefone} onChange={e => setTelefone(formatarTel(e.target.value))} />
                </div>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input style={inputStyle} type="email" placeholder="seu@email.com"
                    value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Senha *</label>
                  <input style={inputStyle} type="password" placeholder="Mínimo 6 caracteres"
                    value={senha} onChange={e => setSenha(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Confirmar senha *</label>
                  <input style={inputStyle} type="password" placeholder="Repita a senha"
                    value={senha2} onChange={e => setSenha2(e.target.value)} />
                </div>

                {erro && (
                  <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT }}>
                    {erro}
                  </div>
                )}

                <button onClick={cadastrar} disabled={salvando}
                  style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: salvando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: salvando ? 0.7 : 1, marginTop: '0.5rem' }}>
                  {salvando ? 'Criando conta...' : 'Criar conta →'}
                </button>

                <p style={{ fontSize: 12, color: '#444', textAlign: 'center' as const, lineHeight: 1.5 }}>
                  Ao criar sua conta você concorda com nossas políticas de uso. O contrato de agendamento Coach CT será apresentado na sua primeira reserva.
                </p>
              </div>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center' as const, fontSize: 13, color: '#555', marginTop: '1.5rem' }}>
          Já tem conta?{' '}
          <span onClick={() => router.push('/login')} style={{ color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>
            Entrar
          </span>
        </p>
      </div>
    </div>
  )
}
