'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'

const CONTRATO = `CONTRATO DE ADESÃO — COACH CT / JUST CT

1. OBJETO
O presente contrato regula as condições de uso do serviço Coach CT, que consiste no agendamento de sessões de treinamento personalizado com coaches da unidade Just CT.

2. REGRAS DE AGENDAMENTO
2.1. Wellhub Diamond: até 8 sessões Coach CT por mês-calendário.
2.2. TotalPass TP6: até 10 sessões Coach CT por mês-calendário.
2.3. Plano Avulso Coach CT: crédito válido por 30 dias a partir da compra.
2.4. Os créditos dos planos Wellhub e TotalPass não são acumulativos e renovam-se todo dia 1º de cada mês.
2.5. É permitido agendar para o mês seguinte, consumindo créditos do período correspondente.

3. CANCELAMENTO
3.1. Cancelamentos até 12h antes resultam na devolução do crédito.
3.2. Entre 12h e 3h antes: cancelamento só permitido se houver cliente na fila de espera.
3.3. Menos de 3h antes: não é possível cancelar.

4. POLÍTICA DE FALTAS
4.1. Falta sem cancelamento gera bloqueio de novos agendamentos.
4.2. Para reativação: regularização na recepção do Just CT.
4.3. Agendamentos futuros são cancelados automaticamente.

5. FILA DE ESPERA
5.1. Ao entrar na fila de espera, o cliente aceita automaticamente as regras de agendamento.
5.2. Quando uma vaga abrir, o agendamento é confirmado automaticamente.
5.3. As mesmas regras de falta e cancelamento se aplicam.

6. ACEITE
Ao concluir o cadastro, o cliente declara ter lido e concordado com todos os termos acima.`

export default function CadastroPage() {
  const router = useRouter()
  const supabase = createClient()

  const [etapa, setEtapa] = useState<1 | 2 | 3>(1)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [plano, setPlano] = useState<'wellhub' | 'totalpass' | 'avulso' | ''>('')
  const [aceite, setAceite] = useState(false)

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

  function avancar() {
    setErro('')
    if (etapa === 1) {
      if (!nome.trim()) { setErro('Preencha seu nome completo.'); return }
      if (cpf.replace(/\D/g, '').length < 11) { setErro('CPF inválido.'); return }
      if (telefone.replace(/\D/g, '').length < 10) { setErro('Telefone inválido.'); return }
      if (!email.trim()) { setErro('Preencha o email.'); return }
      setEtapa(2)
    } else if (etapa === 2) {
      if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
      if (senha !== senha2) { setErro('As senhas não coincidem.'); return }
      if (!plano) { setErro('Selecione seu plano de acesso.'); return }
      setEtapa(3)
    }
  }

  async function finalizar() {
    if (!aceite) { setErro('Você precisa aceitar o contrato para continuar.'); return }
    setErro('')
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

    const { data: clienteData } = await supabase.from('clientes').insert({
      user_id: userId,
      nome: nome.trim(),
      cpf: cpf.replace(/\D/g, ''),
      telefone: telefone.replace(/\D/g, ''),
      email: email.trim(),
    }).select().maybeSingle()

    if (clienteData) {
      const agora = new Date()
      const mes = agora.getMonth() + 1
      const ano = agora.getFullYear()

      if (plano === 'wellhub') {
        await supabase.from('cliente_creditos').insert({
          cliente_id: clienteData.id, tipo: 'wellhub', total: 8, usado: 0, mes, ano,
        })
      } else if (plano === 'totalpass') {
        await supabase.from('cliente_creditos').insert({
          cliente_id: clienteData.id, tipo: 'totalpass', total: 10, usado: 0, mes, ano,
        })
      }
    }

    setSalvando(false)
    router.push('/minha-conta')
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

  const planos = [
    { key: 'wellhub', label: 'Wellhub', desc: 'Diamond → 8 sessões Coach CT/mês', icon: '💜' },
    { key: 'totalpass', label: 'TotalPass', desc: 'TP6 → 10 sessões Coach CT/mês', icon: '🔵' },
    { key: 'avulso', label: 'Avulso / Mensalista', desc: 'Crédito Coach CT avulso ou plano Just CT', icon: '🏋️' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { outline: none; border-color: ${ACCENT} !important; }
        textarea:focus { outline: none; border-color: ${ACCENT} !important; }
      `}</style>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 3, cursor: 'pointer', display: 'inline-block' }}>
            JUST<span style={{ color: ACCENT }}>CT</span>
          </div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Criar conta</div>
        </div>

        {/* Progresso */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= etapa ? ACCENT : '#222', transition: 'background .3s' }} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#555', marginBottom: '1.5rem', textAlign: 'center' as const }}>
          {etapa === 1 && 'Passo 1 de 3 — Seus dados'}
          {etapa === 2 && 'Passo 2 de 3 — Senha e plano'}
          {etapa === 3 && 'Passo 3 de 3 — Contrato'}
        </div>

        {/* Card */}
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 20, padding: '2rem' }}>

          {/* ETAPA 1 — dados + email */}
          {etapa === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>Seus dados</h1>
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
            </div>
          )}

          {/* ETAPA 2 — senha + plano */}
          {etapa === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>Senha e plano</h1>
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
              <div>
                <label style={labelStyle}>Seu plano de acesso *</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {planos.map(p => (
                    <div key={p.key} onClick={() => setPlano(p.key as any)}
                      style={{ border: `1.5px solid ${plano === p.key ? ACCENT : '#333'}`, background: plano === p.key ? `${ACCENT}12` : 'transparent', borderRadius: 12, padding: '0.85rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all .15s' }}>
                      <span style={{ fontSize: 20 }}>{p.icon}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: plano === p.key ? '#fff' : '#888' }}>{p.label}</div>
                        <div style={{ fontSize: 12, color: '#555' }}>{p.desc}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', width: 18, height: 18, borderRadius: '50%', border: `2px solid ${plano === p.key ? ACCENT : '#444'}`, background: plano === p.key ? ACCENT : 'transparent', flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ETAPA 3 — contrato */}
          {etapa === 3 && (
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>Contrato de adesão</h1>
              <p style={{ fontSize: 13, color: '#555', marginBottom: '1rem' }}>Leia com atenção antes de aceitar.</p>
              <div style={{ background: '#080808', border: '1px solid #222', borderRadius: 12, padding: '1rem', height: 280, overflowY: 'auto', marginBottom: '1.5rem' }}>
                <pre style={{ fontSize: 12, color: '#666', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: "'DM Sans', sans-serif" }}>
                  {CONTRATO}
                </pre>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)}
                  style={{ marginTop: 2, accentColor: ACCENT, width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
                  Li e aceito o contrato. Entendo as regras de agendamento, cancelamento e falta.
                </span>
              </label>
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div style={{ background: '#ff2d9b15', border: '1px solid #ff2d9b44', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginTop: '1rem' }}>
              {erro}
            </div>
          )}

          {/* Botões */}
          <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
            {etapa > 1 && (
              <button onClick={() => { setEtapa(e => (e - 1) as any); setErro('') }}
                style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                ← Voltar
              </button>
            )}
            {etapa < 3 && (
              <button onClick={avancar}
                style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Continuar →
              </button>
            )}
            {etapa === 3 && (
              <button onClick={finalizar} disabled={salvando}
                style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: salvando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: salvando ? 0.7 : 1 }}>
                {salvando ? 'Criando conta...' : 'Criar conta ✓'}
              </button>
            )}
          </div>
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
