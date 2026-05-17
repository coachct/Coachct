'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const ACCENT = '#ff2d9b'

type Etapa = 'auth' | 'login' | 'cadastro' | 'pagamento' | 'processando'
type MetodoPagamento = 'pix' | 'cartao'

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}

function CheckoutContent() {
  const router = useRouter()
  const supabase = createClient()
  const { perfil, signIn } = useAuth()
  const searchParams = useSearchParams()
  const produtoId = searchParams.get('produto')

  const [produto, setProduto] = useState<any>(null)
  const [cliente, setCliente] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [etapa, setEtapa] = useState<Etapa>('auth')
  const [metodo, setMetodo] = useState<MetodoPagamento>('pix')
  const [parcelas, setParcelas] = useState(1)
  const [erro, setErro] = useState('')
  const [usarCartaoSalvo, setUsarCartaoSalvo] = useState(true)

  // PIX
  const [pixQrCode, setPixQrCode] = useState('')
  const [pixQrCodeUrl, setPixQrCodeUrl] = useState('')

  // Cartão
  const [cartaoNumero, setCartaoNumero] = useState('')
  const [cartaoNome, setCartaoNome] = useState('')
  const [cartaoCvv, setCartaoCvv] = useState('')
  const [cartaoMes, setCartaoMes] = useState('')
  const [cartaoAno, setCartaoAno] = useState('')

  // Login inline
  const [emailLogin, setEmailLogin] = useState('')
  const [senhaLogin, setSenhaLogin] = useState('')
  const [loadingLogin, setLoadingLogin] = useState(false)

  // Cadastro inline
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [emailCadastro, setEmailCadastro] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [loadingCadastro, setLoadingCadastro] = useState(false)

  useEffect(() => {
    if (!produtoId) { router.push('/comprar'); return }
    carregarProduto()
  }, [produtoId])

  useEffect(() => {
    if (perfil?.role === 'cliente') {
      carregarCliente()
    } else if (perfil && ['admin', 'coach', 'coordenadora', 'recepcao'].includes(perfil.role as string)) {
      setErro('Apenas clientes podem realizar compras pelo site. Use a aba "Vender produto" no painel.')
    }
  }, [perfil])

  async function carregarProduto() {
    setLoading(true)
    const { data } = await supabase
      .from('produtos')
      .select('*, unidades(nome)')
      .eq('id', produtoId)
      .eq('ativo', true)
      .maybeSingle()
    setProduto(data)
    setLoading(false)
  }

  async function carregarCliente() {
    if (!perfil) return
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('user_id', perfil.id)
      .maybeSingle()
    if (data) {
      setCliente(data)
      // Se tem cartão salvo, começa com cartão selecionado
      if (data.pagarme_card_id) {
        setMetodo('cartao')
        setUsarCartaoSalvo(true)
      }
      setEtapa('pagamento')
    }
  }

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

  function formatarCartao(v: string) {
    return v.replace(/\D/g, '').slice(0, 16)
      .replace(/(\d{4})(\d)/, '$1 $2')
      .replace(/(\d{4})(\d)/, '$1 $2')
      .replace(/(\d{4})(\d)/, '$1 $2')
  }

  function labelBandeira(brand: string) {
    const b = (brand || '').toLowerCase()
    if (b === 'visa') return '💳 Visa'
    if (b === 'mastercard') return '💳 Mastercard'
    if (b === 'amex') return '💳 Amex'
    if (b === 'elo') return '💳 Elo'
    return '💳 Cartão'
  }

  async function fazerLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoadingLogin(true)
    const { error } = await signIn(emailLogin, senhaLogin)
    if (error) {
      setErro('Email ou senha incorretos.')
      setLoadingLogin(false)
    }
  }

  async function fazerCadastro(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!nome.trim() || nome.trim().split(' ').length < 2) { setErro('Digite seu nome completo.'); return }
    if (cpf.replace(/\D/g, '').length < 11) { setErro('CPF inválido.'); return }
    if (telefone.replace(/\D/g, '').length < 10) { setErro('Telefone inválido.'); return }
    if (!emailCadastro.trim()) { setErro('Preencha o email.'); return }
    if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (senha !== senha2) { setErro('As senhas não coincidem.'); return }

    setLoadingCadastro(true)
    const cpfLimpo = cpf.replace(/\D/g, '')

    const { data: cpfExiste } = await supabase.from('clientes').select('id').eq('cpf', cpfLimpo).maybeSingle()
    if (cpfExiste) { setErro('Este CPF já está cadastrado. Faça login.'); setLoadingCadastro(false); return }

    const { data: emailExiste } = await supabase.from('clientes').select('id').ilike('email', emailCadastro.trim()).maybeSingle()
    if (emailExiste) { setErro('Este email já está cadastrado. Faça login.'); setLoadingCadastro(false); return }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: emailCadastro,
      password: senha,
      options: { data: { nome } }
    })

    if (authError || !authData.user) {
      setErro(authError?.message === 'User already registered' ? 'Este email já está cadastrado.' : 'Erro ao criar conta.')
      setLoadingCadastro(false)
      return
    }

    const userId = authData.user.id
    await supabase.from('perfis').upsert({ id: userId, nome: nome.trim(), role: 'cliente', ativo: true })
    const { error: clienteError } = await supabase.from('clientes').insert({
      user_id: userId, nome: nome.trim(), cpf: cpfLimpo,
      telefone: telefone.replace(/\D/g, ''), whatsapp: telefone.replace(/\D/g, ''),
      email: emailCadastro.trim(), notificacao_preferida: 'whatsapp', bloqueado: false, ativo: true,
    })

    if (clienteError) { setErro('Erro ao finalizar cadastro.'); setLoadingCadastro(false); return }
    setLoadingCadastro(false)
  }

  async function confirmarPagamento() {
    setErro('')

    if (metodo === 'cartao' && !usarCartaoSalvo) {
      if (cartaoNumero.replace(/\s/g, '').length < 16) { setErro('Número do cartão inválido.'); return }
      if (!cartaoNome.trim()) { setErro('Digite o nome impresso no cartão.'); return }
      if (!cartaoMes || !cartaoAno) { setErro('Digite a validade do cartão.'); return }
      if (cartaoCvv.length < 3) { setErro('CVV inválido.'); return }
    }

    setEtapa('processando')

    try {
      const payload: any = {
        produto_id: produtoId,
        cliente_id: cliente.id,
        metodo: metodo === 'cartao' ? 'cartao_credito' : 'pix',
        parcelas,
        usar_cartao_salvo: metodo === 'cartao' && usarCartaoSalvo && !!cliente.pagarme_card_id,
      }

      if (metodo === 'cartao' && !usarCartaoSalvo) {
        payload.cartao = {
          numero: cartaoNumero.replace(/\s/g, ''),
          nome: cartaoNome,
          cvv: cartaoCvv,
          mes: cartaoMes,
          ano: cartaoAno,
        }
      }

      const res = await fetch('/api/pagamento/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setErro(data.detalhes || data.error || 'Erro ao processar pagamento.')
        setEtapa('pagamento')
        return
      }

      if (metodo === 'cartao' && data.cartao?.aprovado) {
        router.push(`/comprar/sucesso?produto=${produtoId}&metodo=cartao&pagamento=${data.pagamento_id}`)
        return
      }

      if (metodo === 'cartao' && !data.cartao?.aprovado) {
        setErro(data.cartao?.motivo || 'Cartão recusado. Verifique os dados ou tente outro cartão.')
        setEtapa('pagamento')
        return
      }

      if (metodo === 'pix' && data.pix?.qr_code) {
        setPixQrCode(data.pix.qr_code)
        setPixQrCodeUrl(data.pix.qr_code_url)
        setEtapa('pagamento')
        return
      }

      setErro('Não foi possível gerar o PIX. Tente novamente ou use cartão de crédito.')
      setEtapa('pagamento')

    } catch (err) {
      setErro('Erro de conexão. Tente novamente.')
      setEtapa('pagamento')
    }
  }

  function formatarValor(v: number) {
    return `R$ ${v.toFixed(2).replace('.', ',')}`
  }

  function calcularParcela(valor: number, n: number) {
    return valor / n
  }

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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (!produto) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: 'center' as const }}>
        <div style={{ fontSize: 48, marginBottom: '1rem' }}>❌</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Produto não encontrado.</div>
        <button onClick={() => router.push('/comprar')}
          style={{ marginTop: '1.5rem', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.75rem 1.5rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
          ← Voltar pra lista
        </button>
      </div>
    </div>
  )

  const valor = Number(produto.valor)
  const maxParcelas = produto.max_parcelas || 1
  const temCartaoSalvo = !!(cliente?.pagarme_card_id)

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        input:focus { outline: none; border-color: ${ACCENT} !important; }
        .btn-primary-h:hover { opacity: 0.85; }
        .btn-ghost-h:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .metodo-card-h { transition: all .2s; }
        .parcela-btn-h:hover { border-color: ${ACCENT}80 !important; }
      `}</style>

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a' }}>
        <div onClick={() => router.push('/')} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#fff', letterSpacing: 2, cursor: 'pointer' }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <button onClick={() => router.push('/comprar')} className="btn-ghost-h"
          style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '0.45rem 1rem', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
          ← Voltar
        </button>
      </nav>

      <div style={{ paddingTop: 100, padding: '100px 1.5rem 4rem', maxWidth: 540, margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '0.5rem' }}>// checkout</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#fff', lineHeight: 1.05 }}>CONFIRME SEU PEDIDO</div>
        </div>

        {/* RESUMO DO PEDIDO */}
        <div style={{ ...card, marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#555', marginBottom: '0.75rem', fontFamily: "'DM Mono', monospace" }}>Seu pedido</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{produto.nome}</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
                {produto.subtipo === 'acesso' ? `Acesso ilimitado ao Just CT por ${produto.dias_validade} dias` : `1 crédito · válido por ${produto.dias_validade || 30} dias`}
              </div>
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', lineHeight: 1, whiteSpace: 'nowrap' as const }}>
              {formatarValor(valor)}
            </div>
          </div>
        </div>

        {/* ETAPA: AUTH */}
        {etapa === 'auth' && !perfil && (
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>Para continuar, precisamos te identificar</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: '1.5rem', lineHeight: 1.6 }}>Vamos vincular essa compra à sua conta. Demora 1 minuto.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button onClick={() => { setEtapa('cadastro'); setErro('') }} className="btn-primary-h"
                style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Criar minha conta →
              </button>
              <button onClick={() => { setEtapa('login'); setErro('') }} className="btn-ghost-h"
                style={{ background: 'transparent', color: '#aaa', border: '1.5px solid #333', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                Já tenho conta · Entrar
              </button>
            </div>
          </div>
        )}

        {/* ETAPA: LOGIN */}
        {etapa === 'login' && !perfil && (
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: '1.5rem' }}>Entrar na sua conta</div>
            <form onSubmit={fazerLogin}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Email</label>
                <input type="email" placeholder="seu@email.com" value={emailLogin} onChange={e => setEmailLogin(e.target.value)} required style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={labelStyle}>Senha</label>
                <input type="password" placeholder="••••••••" value={senhaLogin} onChange={e => setSenhaLogin(e.target.value)} required style={inputStyle} />
              </div>
              {erro && <div style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>{erro}</div>}
              <button type="submit" disabled={loadingLogin} className="btn-primary-h"
                style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: loadingLogin ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: loadingLogin ? 0.7 : 1 }}>
                {loadingLogin ? 'Entrando...' : 'Entrar →'}
              </button>
              <div style={{ textAlign: 'center' as const, marginTop: '1rem' }}>
                <span style={{ fontSize: 13, color: '#555' }}>Não tem conta? </span>
                <span onClick={() => { setEtapa('cadastro'); setErro('') }} style={{ fontSize: 13, color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>Criar agora</span>
              </div>
            </form>
          </div>
        )}

        {/* ETAPA: CADASTRO */}
        {etapa === 'cadastro' && !perfil && (
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: '1.5rem' }}>Criar conta</div>
            <form onSubmit={fazerCadastro}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div><label style={labelStyle}>Nome completo *</label><input style={inputStyle} type="text" placeholder="Seu nome completo" value={nome} onChange={e => setNome(e.target.value)} /></div>
                <div><label style={labelStyle}>CPF *</label><input style={inputStyle} type="text" placeholder="000.000.000-00" value={cpf} onChange={e => setCpf(formatarCPF(e.target.value))} /></div>
                <div><label style={labelStyle}>Telefone / WhatsApp *</label><input style={inputStyle} type="text" placeholder="(11) 99999-9999" value={telefone} onChange={e => setTelefone(formatarTel(e.target.value))} /></div>
                <div><label style={labelStyle}>Email *</label><input style={inputStyle} type="email" placeholder="seu@email.com" value={emailCadastro} onChange={e => setEmailCadastro(e.target.value)} /></div>
                <div><label style={labelStyle}>Senha *</label><input style={inputStyle} type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} /></div>
                <div><label style={labelStyle}>Confirmar senha *</label><input style={inputStyle} type="password" placeholder="Repita a senha" value={senha2} onChange={e => setSenha2(e.target.value)} /></div>
                {erro && <div style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, color: ACCENT }}>{erro}</div>}
                <button type="submit" disabled={loadingCadastro} className="btn-primary-h"
                  style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 600, fontSize: 15, cursor: loadingCadastro ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: loadingCadastro ? 0.7 : 1, marginTop: '0.5rem' }}>
                  {loadingCadastro ? 'Criando conta...' : 'Criar conta e continuar →'}
                </button>
                <div style={{ textAlign: 'center' as const }}>
                  <span style={{ fontSize: 13, color: '#555' }}>Já tem conta? </span>
                  <span onClick={() => { setEtapa('login'); setErro('') }} style={{ fontSize: 13, color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>Entrar</span>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* ETAPA: PAGAMENTO */}
        {etapa === 'pagamento' && cliente && (
          <>
            {/* Dados do cliente */}
            <div style={{ ...card, marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#555', marginBottom: '0.5rem', fontFamily: "'DM Mono', monospace" }}>Cliente</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{cliente.nome}</div>
                  <div style={{ fontSize: 13, color: '#888' }}>{cliente.email}</div>
                </div>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#22c55e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>✓</div>
              </div>
            </div>

            {/* PIX QR Code */}
            {metodo === 'pix' && pixQrCode && (
              <div style={{ ...card, marginBottom: '1.5rem', textAlign: 'center' as const }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#555', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>PIX gerado</div>
                {pixQrCodeUrl && <img src={pixQrCodeUrl} alt="QR Code PIX" style={{ width: 180, height: 180, margin: '0 auto 1rem', display: 'block' }} />}
                <div style={{ fontSize: 12, color: '#666', marginBottom: '1rem' }}>Ou copie o código abaixo:</div>
                <div style={{ background: '#080808', border: '1px solid #333', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#aaa', wordBreak: 'break-all' as const, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>
                  {pixQrCode}
                </div>
                <button onClick={() => navigator.clipboard.writeText(pixQrCode)} className="btn-ghost-h"
                  style={{ background: 'transparent', color: '#aaa', border: '1px solid #333', borderRadius: 8, padding: '0.6rem 1.5rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                  Copiar código PIX
                </button>
                <div style={{ fontSize: 12, color: '#555', marginTop: '1rem' }}>Após o pagamento, seu crédito será liberado automaticamente.</div>
              </div>
            )}

            {/* Método de pagamento */}
            {!pixQrCode && (
              <div style={{ ...card, marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#555', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>Forma de pagamento</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { key: 'pix' as MetodoPagamento, label: 'PIX', icon: '⚡', desc: 'Aprovação imediata · sem taxas' },
                    { key: 'cartao' as MetodoPagamento, label: 'Cartão de crédito', icon: '💳', desc: maxParcelas > 1 ? `À vista ou em até ${maxParcelas}x` : 'À vista' },
                  ].map(m => (
                    <div key={m.key} onClick={() => { setMetodo(m.key); setParcelas(1); setErro(''); if (m.key === 'cartao' && temCartaoSalvo) setUsarCartaoSalvo(true) }} className="metodo-card-h"
                      style={{ border: `1.5px solid ${metodo === m.key ? ACCENT : '#333'}`, background: metodo === m.key ? `${ACCENT}10` : 'transparent', borderRadius: 10, padding: '0.85rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: 22 }}>{m.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: metodo === m.key ? '#fff' : '#888' }}>{m.label}</div>
                        <div style={{ fontSize: 12, color: '#555', marginTop: 1 }}>{m.desc}</div>
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${metodo === m.key ? ACCENT : '#444'}`, background: metodo === m.key ? ACCENT : 'transparent', flexShrink: 0 }} />
                    </div>
                  ))}
                </div>

                {/* Cartão salvo */}
                {metodo === 'cartao' && temCartaoSalvo && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 1, color: '#555', marginBottom: '0.75rem' }}>Cartão salvo</div>
                    <div onClick={() => setUsarCartaoSalvo(true)}
                      style={{ border: `1.5px solid ${usarCartaoSalvo ? ACCENT : '#333'}`, background: usarCartaoSalvo ? `${ACCENT}10` : 'transparent', borderRadius: 10, padding: '0.85rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8 }}>
                      <span style={{ fontSize: 20 }}>💳</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: usarCartaoSalvo ? '#fff' : '#888' }}>
                          {labelBandeira(cliente.pagarme_card_brand)} · **** {cliente.pagarme_card_last4}
                        </div>
                        <div style={{ fontSize: 12, color: '#555', marginTop: 1 }}>Cartão salvo</div>
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${usarCartaoSalvo ? ACCENT : '#444'}`, background: usarCartaoSalvo ? ACCENT : 'transparent', flexShrink: 0 }} />
                    </div>
                    <div onClick={() => setUsarCartaoSalvo(false)}
                      style={{ border: `1.5px solid ${!usarCartaoSalvo ? ACCENT : '#333'}`, background: !usarCartaoSalvo ? `${ACCENT}10` : 'transparent', borderRadius: 10, padding: '0.85rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: 20 }}>➕</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: !usarCartaoSalvo ? '#fff' : '#888' }}>Usar outro cartão</div>
                        <div style={{ fontSize: 12, color: '#555', marginTop: 1 }}>Digitar dados de um novo cartão</div>
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${!usarCartaoSalvo ? ACCENT : '#444'}`, background: !usarCartaoSalvo ? ACCENT : 'transparent', flexShrink: 0 }} />
                    </div>
                  </div>
                )}

                {/* Campos do cartão novo */}
                {metodo === 'cartao' && !usarCartaoSalvo && (
                  <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>Número do cartão</label>
                      <input style={inputStyle} type="text" placeholder="0000 0000 0000 0000" value={cartaoNumero} onChange={e => setCartaoNumero(formatarCartao(e.target.value))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Nome impresso no cartão</label>
                      <input style={inputStyle} type="text" placeholder="NOME SOBRENOME" value={cartaoNome} onChange={e => setCartaoNome(e.target.value.toUpperCase())} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Mês</label>
                        <input style={inputStyle} type="text" placeholder="MM" maxLength={2} value={cartaoMes} onChange={e => setCartaoMes(e.target.value.replace(/\D/g, ''))} />
                      </div>
                      <div>
                        <label style={labelStyle}>Ano</label>
                        <input style={inputStyle} type="text" placeholder="AAAA" maxLength={4} value={cartaoAno} onChange={e => setCartaoAno(e.target.value.replace(/\D/g, ''))} />
                      </div>
                      <div>
                        <label style={labelStyle}>CVV</label>
                        <input style={inputStyle} type="text" placeholder="000" maxLength={4} value={cartaoCvv} onChange={e => setCartaoCvv(e.target.value.replace(/\D/g, ''))} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Parcelas */}
                {metodo === 'cartao' && maxParcelas > 1 && (
                  <div style={{ marginTop: '1.25rem' }}>
                    <label style={labelStyle}>Parcelamento</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                      {Array.from({ length: maxParcelas }, (_, i) => i + 1).map(n => (
                        <button key={n} type="button" onClick={() => setParcelas(n)} className="parcela-btn-h"
                          style={{ padding: '0.65rem 0.5rem', background: parcelas === n ? `${ACCENT}15` : '#080808', border: `1.5px solid ${parcelas === n ? ACCENT : '#333'}`, borderRadius: 8, cursor: 'pointer', textAlign: 'center' as const, fontFamily: "'DM Sans', sans-serif" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: parcelas === n ? '#fff' : '#888' }}>{n}x</div>
                          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{formatarValor(calcularParcela(valor, n))}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total */}
                <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#aaa' }}>Total</span>
                  <div style={{ textAlign: 'right' as const }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', lineHeight: 1 }}>{formatarValor(valor)}</div>
                    {metodo === 'cartao' && parcelas > 1 && (
                      <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>em {parcelas}x de {formatarValor(calcularParcela(valor, parcelas))}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {erro && <div style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 8, padding: '0.8rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem' }}>{erro}</div>}

            {!pixQrCode && (
              <button onClick={confirmarPagamento} className="btn-primary-h"
                style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                {metodo === 'pix' ? 'Gerar PIX →' : `Pagar ${formatarValor(valor)} →`}
              </button>
            )}

            <div style={{ fontSize: 11, color: '#444', textAlign: 'center' as const, marginTop: '1rem', lineHeight: 1.6 }}>
              🔒 Pagamento processado pela Pagar.me · Seus dados estão protegidos
            </div>
          </>
        )}

        {/* ETAPA: PROCESSANDO */}
        {etapa === 'processando' && (
          <div style={{ ...card, textAlign: 'center' as const, padding: '3rem 2rem' }}>
            <div style={{ width: 48, height: 48, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1.5rem' }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Processando pagamento...</div>
            <div style={{ fontSize: 13, color: '#666' }}>Aguarde, estamos confirmando com o Pagar.me.</div>
          </div>
        )}

      </div>
    </div>
  )
}
