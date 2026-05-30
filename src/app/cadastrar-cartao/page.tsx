'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import SiteHeader from '@/components/SiteHeader'

const ACCENT = '#ff2d9b'
const VERDE = '#2ddd8b'

export default function CadastrarCartaoPage() {
  const router = useRouter()
  const supabase = createClient()
  const { perfil, loading: loadingAuth } = useAuth()

  const [cliente, setCliente] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const [resultadoPendencias, setResultadoPendencias] = useState<any>(null)

  const [numero, setNumero] = useState('')
  const [nome, setNome] = useState('')
  const [cvv, setCvv] = useState('')
  const [mes, setMes] = useState('')
  const [ano, setAno] = useState('')
  const [cpf, setCpf] = useState('')
  const [mostrarCpf, setMostrarCpf] = useState(false)

  useEffect(() => {
    if (loadingAuth) return
    if (!perfil) {
      router.push('/login?redirect=/cadastrar-cartao')
      return
    }
    if (perfil.role !== 'cliente') {
      setErro('Apenas clientes podem cadastrar cartão.')
      setLoading(false)
      return
    }
    carregarCliente()
  }, [perfil, loadingAuth])

  async function carregarCliente() {
    if (!perfil) return
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('user_id', perfil.id)
      .maybeSingle()
    setCliente(data)
    setLoading(false)
  }

  function formatarCartao(v: string) {
    return v.replace(/\D/g, '').slice(0, 19)
      .replace(/(\d{4})(\d)/, '$1 $2')
      .replace(/(\d{4})(\d)/, '$1 $2')
      .replace(/(\d{4})(\d)/, '$1 $2')
  }

  function formatarCpf(v: string) {
    return v.replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    const numeroLimpo = numero.replace(/\s/g, '')
    if (numeroLimpo.length < 13) { setErro('Número do cartão inválido.'); return }
    if (!nome.trim() || nome.trim().length < 3) { setErro('Digite o nome impresso no cartão.'); return }
    if (!mes || !ano) { setErro('Digite a validade completa.'); return }
    const mesNum = parseInt(mes)
    if (mesNum < 1 || mesNum > 12) { setErro('Mês inválido.'); return }
    const anoNum = parseInt(ano)
    const anoAtual = new Date().getFullYear()
    if (anoNum < anoAtual || anoNum > anoAtual + 20) { setErro('Ano inválido.'); return }
    if (cvv.length < 3) { setErro('CVV inválido.'); return }

    const cpfLimpo = cpf.replace(/\D/g, '')
    if (mostrarCampoCpf && cpfLimpo.length !== 11) { setErro('Digite um CPF válido (11 dígitos).'); return }

    setSalvando(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setErro('Sessão expirada. Faça login novamente.')
        setSalvando(false)
        return
      }

      const res = await fetch('/api/cliente/cadastrar-cartao', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          numero: numeroLimpo,
          nome: nome.trim(),
          cvv,
          mes,
          ano,
          cpf: cpfLimpo,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErro(data.error || 'Erro ao cadastrar cartão.')
        if (data.precisa_cpf) setMostrarCpf(true)
        setSalvando(false)
        return
      }

      setSucesso(true)
      setResultadoPendencias(data.pendencias || null)
      await carregarCliente()

      setNumero('')
      setNome('')
      setCvv('')
      setMes('')
      setAno('')
      setCpf('')
    } catch (err) {
      setErro('Erro de conexão. Tente novamente.')
    }

    setSalvando(false)
  }

  if (loading || loadingAuth) {
    return (
      <div style={{ background: '#080808', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const cartaoSalvo = cliente?.pagarme_card_id && cliente?.pagarme_card_last4

  // CPF: campo aparece só se o cadastro estiver sem CPF válido, ou se a API pedir (precisa_cpf)
  const cpfCadastroLimpo = (cliente?.cpf || '').replace(/\D/g, '')
  const semCpfCadastro = !!cliente && cpfCadastroLimpo.length !== 11
  const mostrarCampoCpf = semCpfCadastro || mostrarCpf

  // Lógica de exibição após sucesso
  const pendenciasResolvidas = resultadoPendencias?.havia > 0 && resultadoPendencias?.cliente_desbloqueado
  const pendenciasParciais = resultadoPendencias?.havia > 0 && !resultadoPendencias?.cliente_desbloqueado && resultadoPendencias?.cobradas > 0
  const pendenciasFalharam = resultadoPendencias?.havia > 0 && resultadoPendencias?.cobradas === 0

  const card = { background: '#111', border: '1px solid #222', borderRadius: 16, padding: '2rem' }
  const inputStyle = {
    width: '100%', background: '#080808', border: '1px solid #333', borderRadius: 10,
    padding: '0.75rem 1rem', color: '#fff', fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    fontSize: 12, color: '#555', display: 'block', marginBottom: 6,
    textTransform: 'uppercase' as const, letterSpacing: 1,
  }

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        input:focus { outline: none; border-color: ${ACCENT} !important; }
        .btn-primary-h:hover { opacity: 0.85; }
        .btn-verde-h:hover { opacity: 0.85; }
      `}</style>

      <SiteHeader />

      <div style={{ paddingTop: 120, padding: '120px 1.5rem 4rem', maxWidth: 540, margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '0.5rem' }}>// método de pagamento</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#fff', lineHeight: 1.05 }}>CADASTRAR CARTÃO</div>
        </div>

        {/* Cartão atualmente salvo */}
        {cartaoSalvo && !sucesso && (
          <div style={{ ...card, marginBottom: '1.5rem', borderColor: '#22c55e44', background: '#0a1f0f' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#22c55e', marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>// cartão atual</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: 30 }}>💳</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', textTransform: 'uppercase' as const }}>
                  {cliente.pagarme_card_brand || 'Cartão'} •••• {cliente.pagarme_card_last4}
                </div>
                <div style={{ fontSize: 13, color: '#888' }}>Cartão cadastrado e validado</div>
              </div>
            </div>
            <div style={{ marginTop: '1rem', fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>
              Para trocar, preencha um novo cartão abaixo. O antigo será substituído.
            </div>
          </div>
        )}

        {/* SUCESSO — PENDÊNCIA REGULARIZADA */}
        {sucesso && pendenciasResolvidas && (
          <div style={{ ...card, marginBottom: '1.5rem', borderColor: VERDE, background: `${VERDE}10`, textAlign: 'center' as const }}>
            <div style={{ fontSize: 48, marginBottom: '0.5rem' }}>✓</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: '0.75rem', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
              PENDÊNCIA REGULARIZADA COM SUCESSO!
            </div>
            <div style={{ fontSize: 14, color: '#ddd', lineHeight: 1.7, marginBottom: '1rem' }}>
              Foram cobrados <strong style={{ color: VERDE }}>R$ {Number(resultadoPendencias.valor_cobrado).toFixed(2).replace('.', ',')}</strong> ({resultadoPendencias.cobradas} {resultadoPendencias.cobradas === 1 ? 'cobrança' : 'cobranças'}) no seu novo cartão.
            </div>
            <div style={{ background: '#0a0a0a', border: `1px solid ${VERDE}33`, borderRadius: 10, padding: '0.75rem 1rem', fontSize: 13, color: VERDE, fontWeight: 600 }}>
              🎉 Sua conta foi desbloqueada — você já pode agendar treinos novamente!
            </div>
          </div>
        )}

        {/* SUCESSO — PENDÊNCIAS PARCIAIS (algumas falharam) */}
        {sucesso && pendenciasParciais && (
          <div style={{ ...card, marginBottom: '1.5rem', borderColor: '#ffaa00', background: '#1a1000', textAlign: 'center' as const }}>
            <div style={{ fontSize: 40, marginBottom: '0.5rem' }}>⚠️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: '0.75rem', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
              REGULARIZAÇÃO PARCIAL
            </div>
            <div style={{ fontSize: 14, color: '#ddd', lineHeight: 1.7, marginBottom: '1rem' }}>
              {resultadoPendencias.cobradas} de {resultadoPendencias.havia} {resultadoPendencias.havia === 1 ? 'cobrança foi' : 'cobranças foram'} aprovadas (R$ {Number(resultadoPendencias.valor_cobrado).toFixed(2).replace('.', ',')}).
              <br />
              <strong style={{ color: '#ffaa00' }}>{resultadoPendencias.falhadas}</strong> ainda {resultadoPendencias.falhadas === 1 ? 'precisa' : 'precisam'} ser regularizada{resultadoPendencias.falhadas > 1 ? 's' : ''}.
            </div>
            <div style={{ background: '#0a0a0a', border: '1px solid #ffaa0033', borderRadius: 10, padding: '0.75rem 1rem', fontSize: 13, color: '#ffaa00' }}>
              Sua conta continua bloqueada. Tente outro cartão.
            </div>
          </div>
        )}

        {/* SUCESSO — PENDÊNCIAS FALHARAM TODAS */}
        {sucesso && pendenciasFalharam && (
          <div style={{ ...card, marginBottom: '1.5rem', borderColor: '#ff4444', background: '#1a0000', textAlign: 'center' as const }}>
            <div style={{ fontSize: 40, marginBottom: '0.5rem' }}>🚫</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: '0.75rem', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>
              CARTÃO RECUSADO PARA COBRANÇA
            </div>
            <div style={{ fontSize: 14, color: '#ddd', lineHeight: 1.7, marginBottom: '1rem' }}>
              O cartão foi cadastrado, mas a cobrança da pendência de <strong>R$ {Number(resultadoPendencias.havia * 99).toFixed(2).replace('.', ',')}</strong> não foi aprovada.
            </div>
            <div style={{ background: '#0a0000', border: '1px solid #ff444433', borderRadius: 10, padding: '0.75rem 1rem', fontSize: 13, color: '#ff4444' }}>
              Tente outro cartão para regularizar e desbloquear sua conta.
            </div>
          </div>
        )}

        {/* SUCESSO — sem pendências (caso normal de primeiro cadastro) */}
        {sucesso && !resultadoPendencias?.havia && (
          <div style={{ ...card, marginBottom: '1.5rem', borderColor: ACCENT, background: `${ACCENT}10`, textAlign: 'center' as const }}>
            <div style={{ fontSize: 40, marginBottom: '0.5rem' }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>Cartão cadastrado com sucesso!</div>
            <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>
              Nada foi cobrado. Seu cartão fica registrado de forma segura pela Pagar.me.
            </div>
          </div>
        )}

        {/* Explicação (antes de cadastrar) */}
        {!sucesso && (
          <div style={{ ...card, marginBottom: '1.5rem', background: '#0d0d0d' }}>
            <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.7 }}>
              <strong style={{ color: '#fff' }}>🔒 Nenhum valor será cobrado agora.</strong><br/>
              Seu cartão fica registrado de forma segura na Pagar.me. Em caso de falta sem cancelamento prévio ou cobrança de multa contratual, o valor será debitado deste cartão.
            </div>
          </div>
        )}

        {/* Formulário */}
        {!sucesso && (
          <div style={card}>
            <form onSubmit={salvar}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* CPF — aparece só quando o cadastro está sem CPF válido (ou a API pediu) */}
                {mostrarCampoCpf && (
                  <div>
                    <label style={labelStyle}>CPF</label>
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={e => setCpf(formatarCpf(e.target.value))} />
                    <div style={{ fontSize: 12, color: '#888', marginTop: 6, lineHeight: 1.5 }}>
                      Seu cadastro está sem CPF. Informe-o para validar o cartão.
                    </div>
                  </div>
                )}

                <div>
                  <label style={labelStyle}>Número do cartão</label>
                  <input style={inputStyle} type="text" inputMode="numeric" placeholder="0000 0000 0000 0000" value={numero} onChange={e => setNumero(formatarCartao(e.target.value))} />
                </div>
                <div>
                  <label style={labelStyle}>Nome impresso no cartão</label>
                  <input style={inputStyle} type="text" placeholder="NOME SOBRENOME" value={nome} onChange={e => setNome(e.target.value.toUpperCase())} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Mês</label>
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="MM" maxLength={2} value={mes} onChange={e => setMes(e.target.value.replace(/\D/g, ''))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Ano</label>
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="AAAA" maxLength={4} value={ano} onChange={e => setAno(e.target.value.replace(/\D/g, ''))} />
                  </div>
                  <div>
                    <label style={labelStyle}>CVV</label>
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="000" maxLength={4} value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, ''))} />
                  </div>
                </div>

                {erro && <div style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 8, padding: '0.7rem 1rem', fontSize: 13, color: ACCENT }}>{erro}</div>}

                <button type="submit" disabled={salvando} className="btn-primary-h"
                  style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 700, fontSize: 15, cursor: salvando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: salvando ? 0.7 : 1, marginTop: '0.5rem' }}>
                  {salvando ? 'Validando cartão...' : (cartaoSalvo ? 'Substituir cartão →' : 'Cadastrar cartão →')}
                </button>

                <div style={{ fontSize: 11, color: '#444', textAlign: 'center' as const, marginTop: '0.5rem', lineHeight: 1.6 }}>
                  🔒 Validação segura via Pagar.me · Nenhum valor será cobrado
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Botões após sucesso */}
        {sucesso && (
          <>
            {pendenciasResolvidas || !resultadoPendencias?.havia ? (
              <button onClick={() => router.push('/agendar')} className="btn-verde-h"
                style={{ width: '100%', background: VERDE, color: '#000', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Agendar Treino →
              </button>
            ) : (
              <button onClick={() => { setSucesso(false); setResultadoPendencias(null) }} className="btn-primary-h"
                style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Tentar outro cartão →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
