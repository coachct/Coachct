'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { dashboardDoRole } from '@/lib/auth-redirect'

const ACCENT = '#ff2d9b'

export default function CadastroPage() {
  const router = useRouter()
  const supabase = createClient()
  const { perfil, loading: loadingAuth } = useAuth()

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [jaSubmeteu, setJaSubmeteu] = useState(false)

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [sexo, setSexo] = useState<'M' | 'F' | ''>('')
  const [notificacao, setNotificacao] = useState<'whatsapp' | 'email' | 'nenhuma'>('whatsapp')

  useEffect(() => {
    if (loadingAuth) return
    if (jaSubmeteu) return
    if (perfil && perfil.role) router.push(dashboardDoRole(perfil.role))
  }, [perfil, loadingAuth, jaSubmeteu])

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
    if (nome.trim().split(' ').length < 2) { setErro('Digite seu nome completo (nome e sobrenome).'); return }
    if (cpf.replace(/\D/g, '').length < 11) { setErro('CPF inválido.'); return }
    if (telefone.replace(/\D/g, '').length < 10) { setErro('Telefone inválido.'); return }
    if (!email.trim()) { setErro('Preencha o email.'); return }
    if (!sexo) { setErro('Selecione seu sexo.'); return }
    if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (senha !== senha2) { setErro('As senhas não coincidem.'); return }

    setJaSubmeteu(true)
    setSalvando(true)

    const cpfLimpo = cpf.replace(/\D/g, '')
    const { data: cpfExiste } = await supabase.from('clientes').select('id').eq('cpf', cpfLimpo).maybeSingle()
    if (cpfExiste) {
      setErro('Este CPF já está cadastrado. Faça login ou recupere sua senha.')
      setSalvando(false); setJaSubmeteu(false); return
    }

    const { data: emailExiste } = await supabase.from('clientes').select('id').ilike('email', email.trim()).maybeSingle()
    if (emailExiste) {
      setErro('Este email já está cadastrado. Faça login ou recupere sua senha.')
      setSalvando(false); setJaSubmeteu(false); return
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email, password: senha,
      options: { data: { nome: nome.trim(), role: 'cliente' } }
    })

    if (authError || !authData.user) {
      setErro(authError?.message === 'User already registered'
        ? 'Este email já está cadastrado.'
        : 'Erro ao criar conta. Tente novamente.')
      setSalvando(false); setJaSubmeteu(false); return
    }

    const userId = authData.user.id
    await new Promise(res => setTimeout(res, 500))
    await supabase.from('perfis').upsert({ id: userId, nome: nome.trim(), role: 'cliente', ativo: true })

    const { error: clienteError } = await supabase.from('clientes').insert({
      user_id: userId,
      nome: nome.trim(),
      cpf: cpfLimpo,
      telefone: telefone.replace(/\D/g, ''),
      whatsapp: telefone.replace(/\D/g, ''),
      email: email.trim(),
      sexo,
      notificacao_preferida: notificacao,
      bloqueado: false,
      ativo: true,
    })

    if (clienteError) {
      setErro('Erro ao finalizar cadastro. Entre em contato com a recepção.')
      setSalvando(false); setJaSubmeteu(false); return
    }

    setSalvando(false)
    setSucesso(true)
    setTimeout(() => { window.location.href = '/meus-planos' }, 1500)
  }

  const inputStyle = {
    width: '100%', background: '#080808', border: '1px solid #333',
    borderRadius: 10, padding: '0.75rem 1rem', color: '#fff', fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    fontSize: 12, color: '#555', display: 'block', marginBottom: 6,
    textTransform: 'uppercase' as const, letterSpacing: 1,
  }
  const notifOpcoes = [
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬', desc: 'Aviso pelo número cadastrado' },
    { key: 'email',    label: 'Email',    icon: '📧', desc: 'Aviso no seu email' },
    { key: 'nenhuma',  label: 'Nenhuma',  icon: '🔕', desc: 'Sem notificações' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { outline: none; border-color: ${ACCENT} !important; }
      `}</style>
      <div style={{ width: '100%', maxWidth: 440 }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 3, cursor: 'pointer', display: 'inline-block' }}>
            JUST<span style={{ color: ACCENT }}>CT</span>
          </div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Criar conta</div>
        </div>

        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 20, padding: '2rem' }}>
          {sucesso ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: 48, marginBottom: '1rem' }}>🎉</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Conta criada!</div>
              <div style={{ fontSize: 14, color: '#555' }}>Redirecionando para ativar seus planos...</div>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: '1.5rem' }}>Seus dados</h1>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                <div>
                  <label style={labelStyle}>Nome completo *</label>
                  <input style={inputStyle} type="text" placeholder="Seu nome completo" value={nome} onChange={e => setNome(e.target.value)} />
                </div>

                <div>
                  <label style={labelStyle}>CPF *</label>
                  <input style={inputStyle} type="text" placeholder="000.000.000-00" value={cpf} onChange={e => setCpf(formatarCPF(e.target.value))} />
                </div>

                <div>
                  <label style={labelStyle}>Telefone / WhatsApp *</label>
                  <input style={inputStyle} type="text" placeholder="(11) 99999-9999" value={telefone} onChange={e => setTelefone(formatarTel(e.target.value))} />
                </div>

                <div>
                  <label style={labelStyle}>Email *</label>
                  <input style={inputStyle} type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>

                {/* ── Sexo ── */}
                <div>
                  <label style={labelStyle}>Sexo *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([
                      { key: 'M' as const, label: 'Masculino', icon: '♂️' },
                      { key: 'F' as const, label: 'Feminino',  icon: '♀️' },
                    ]).map(op => (
                      <div key={op.key} onClick={() => setSexo(op.key)}
                        style={{
                          border: `1.5px solid ${sexo === op.key ? ACCENT : '#333'}`,
                          background: sexo === op.key ? `${ACCENT}15` : 'transparent',
                          borderRadius: 10, padding: '0.75rem 1rem',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem',
                          transition: 'all .15s',
                        }}>
                        <span style={{ fontSize: 20 }}>{op.icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: sexo === op.key ? '#fff' : '#777', flex: 1 }}>
                          {op.label}
                        </span>
                        <div style={{
                          width: 14, height: 14, borderRadius: '50%',
                          border: `2px solid ${sexo === op.key ? ACCENT : '#444'}`,
                          background: sexo === op.key ? ACCENT : 'transparent',
                          flexShrink: 0,
                        }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#444', marginTop: 6, paddingLeft: 2 }}>
                    Necessário para aulas com restrição de gênero (ex: Lift for Girls).
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Senha *</label>
                  <input style={inputStyle} type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} />
                </div>

                <div>
                  <label style={labelStyle}>Confirmar senha *</label>
                  <input style={inputStyle} type="password" placeholder="Repita a senha" value={senha2} onChange={e => setSenha2(e.target.value)} />
                </div>

                <div>
                  <label style={labelStyle}>Como quer ser avisado?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {notifOpcoes.map(op => (
                      <div key={op.key} onClick={() => setNotificacao(op.key as any)}
                        style={{
                          border: `1.5px solid ${notificacao === op.key ? ACCENT : '#333'}`,
                          background: notificacao === op.key ? `${ACCENT}10` : 'transparent',
                          borderRadius: 10, padding: '0.65rem 1rem',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem',
                          transition: 'all .15s',
                        }}>
                        <span style={{ fontSize: 18 }}>{op.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: notificacao === op.key ? '#fff' : '#888' }}>{op.label}</div>
                          <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>{op.desc}</div>
                        </div>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          border: `2px solid ${notificacao === op.key ? ACCENT : '#444'}`,
                          background: notificacao === op.key ? ACCENT : 'transparent',
                          flexShrink: 0,
                        }} />
                      </div>
                    ))}
                  </div>
                  {notificacao === 'whatsapp' && (
                    <div style={{ fontSize: 11, color: '#555', marginTop: 6, paddingLeft: 4 }}>
                      📱 Usaremos o número de WhatsApp informado acima.
                    </div>
                  )}
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
                  Após criar a conta, você poderá ativar seus planos Wellhub ou TotalPass e começar a agendar seus treinos.
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
