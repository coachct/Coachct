'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { TEXTO_TERMO_WELLHUB_TOTALPASS, VERSAO_TERMO_WELLHUB_TOTALPASS } from '@/lib/contratos/termo-wellhub-totalpass'

const ACCENT = '#ff2d9b'

function AceitePageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [dados, setDados] = useState<any>(null)
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [scrollLido, setScrollLido] = useState(false)
  const [checkboxLi, setCheckboxLi] = useState(false)

  useEffect(() => {
    if (!token) {
      setErro('Link inválido. Solicite um novo link à recepção da Just CT.')
      setLoading(false)
      return
    }
    carregarToken()
  }, [token])

  async function carregarToken() {
    setLoading(true)
    const { data: plano, error } = await supabase
      .from('cliente_planos')
      .select(`
        id, ativo, aceite_pendente, token_expira_em,
        cliente:clientes (id, nome, cpf, email),
        plano:plano_id (nome, subtipo)
      `)
      .eq('token_aceite', token)
      .maybeSingle()

    if (error || !plano) {
      setErro('Link inválido ou já utilizado. Solicite um novo link à recepção da Just CT.')
      setLoading(false)
      return
    }

    if (!plano.aceite_pendente) {
      setErro('Este termo já foi aceito anteriormente.')
      setLoading(false)
      return
    }

    if (plano.token_expira_em && new Date(plano.token_expira_em) < new Date()) {
      setErro('Este link expirou. Solicite um novo link à recepção da Just CT.')
      setLoading(false)
      return
    }

    setDados(plano)
    setLoading(false)
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const lido = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    if (lido && !scrollLido) setScrollLido(true)
  }

  async function aceitar() {
    if (!dados) return
    const nomeCliente = (dados.cliente as any)?.nome?.trim().toLowerCase() || ''
    const nomeInput = nomeDigitado.trim().toLowerCase()

    if (nomeInput.length < 3) {
      setErro('Digite seu nome completo.')
      return
    }
    if (nomeInput !== nomeCliente) {
      setErro('O nome digitado não confere com o cadastro. Confirme seu nome completo exatamente como foi cadastrado.')
      return
    }

    setEnviando(true)
    setErro(null)

    try {
      const tipoPlano = (dados.plano as any)?.subtipo?.includes('totalpass') ? 'totalpass' : 'wellhub'

      // Insere o aceite
      const { error: errAceite } = await supabase.from('termos_aceites').insert({
        cliente_id: (dados.cliente as any).id,
        cliente_plano_id: dados.id,
        tipo_plano: tipoPlano,
        nome_digitado: nomeDigitado.trim(),
        cpf_confirmado: (dados.cliente as any).cpf,
        user_agent: navigator.userAgent,
        modo_aceite: 'link_email',
        versao_contrato: VERSAO_TERMO_WELLHUB_TOTALPASS,
        texto_contrato: TEXTO_TERMO_WELLHUB_TOTALPASS,
      })

      if (errAceite) throw errAceite

      // Atualiza o plano: limpa pendência e token
      const { error: errPlano } = await supabase
        .from('cliente_planos')
        .update({
          aceite_pendente: false,
          token_aceite: null,
          token_expira_em: null,
        })
        .eq('id', dados.id)

      if (errPlano) throw errPlano

      setSucesso(true)
    } catch (e: any) {
      console.error(e)
      setErro('Não foi possível registrar o aceite. Tente novamente ou entre em contato com a recepção.')
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (sucesso) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${ACCENT}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', fontSize: 36 }}>✓</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#fff', letterSpacing: 1, marginBottom: '1rem' }}>TERMO ACEITO</div>
          <div style={{ fontSize: 15, color: '#888', lineHeight: 1.7, marginBottom: '2rem' }}>
            Seu aceite foi registrado com sucesso. Você já pode utilizar normalmente todos os serviços contratados via Wellhub/TotalPass na Just CT.
          </div>
          <button onClick={() => router.push('/')} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.9rem 2rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Voltar para o início
          </button>
        </div>
      </div>
    )
  }

  if (erro && !dados) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#3a1010', border: '2px solid #ff4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', fontSize: 36, color: '#ff6666' }}>!</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: '#fff', letterSpacing: 1, marginBottom: '1rem' }}>LINK INVÁLIDO</div>
          <div style={{ fontSize: 15, color: '#888', lineHeight: 1.7, marginBottom: '2rem' }}>{erro}</div>
          <button onClick={() => router.push('/')} style={{ background: 'transparent', color: '#aaa', border: '1.5px solid #333', borderRadius: 8, padding: '0.9rem 2rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Voltar para o início
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif", padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#fff', letterSpacing: 3, marginBottom: 8 }}>
            JUST<span style={{ color: ACCENT }}>CT</span>
          </div>
          <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace" }}>// termo de adesão</div>
        </div>

        {/* Card principal */}
        <div style={{ background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 16, overflow: 'hidden' }}>

          {/* Identificação do cliente */}
          <div style={{ padding: '1.5rem 2rem', background: '#0a0a0a', borderBottom: '1px solid #1e1e1e' }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' as const, letterSpacing: 2, marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>cliente</div>
            <div style={{ fontSize: 17, color: '#fff', fontWeight: 600 }}>{(dados.cliente as any)?.nome}</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
              CPF: {(dados.cliente as any)?.cpf} · Plano: {(dados.plano as any)?.nome}
            </div>
          </div>

          {/* Texto do contrato */}
          <div onScroll={handleScroll} style={{ maxHeight: 480, overflow: 'auto', padding: '2rem', fontSize: 14, color: '#aaa', lineHeight: 1.8, whiteSpace: 'pre-wrap' as const }}>
            {TEXTO_TERMO_WELLHUB_TOTALPASS}
          </div>

          {!scrollLido && (
            <div style={{ padding: '0.75rem 2rem', background: `${ACCENT}10`, borderTop: `1px solid ${ACCENT}30`, fontSize: 12, color: ACCENT, textAlign: 'center' as const }}>
              ↓ role até o final para liberar o aceite
            </div>
          )}

          {/* Aceite */}
          <div style={{ padding: '2rem', borderTop: '1px solid #1e1e1e' }}>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: scrollLido ? 'pointer' : 'not-allowed', marginBottom: '1.5rem', opacity: scrollLido ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={checkboxLi}
                onChange={e => setCheckboxLi(e.target.checked)}
                disabled={!scrollLido}
                style={{ marginTop: 3, width: 18, height: 18, accentColor: ACCENT, cursor: scrollLido ? 'pointer' : 'not-allowed' }}
              />
              <span style={{ fontSize: 14, color: '#ccc', lineHeight: 1.6 }}>
                Declaro que li e concordo integralmente com todas as cláusulas deste Termo de Adesão Wellhub / TotalPass.
              </span>
            </label>

            <label style={{ display: 'block', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>
                Digite seu nome completo para assinar
              </div>
              <input
                type="text"
                value={nomeDigitado}
                onChange={e => setNomeDigitado(e.target.value)}
                disabled={!checkboxLi || !scrollLido}
                placeholder={(dados.cliente as any)?.nome || 'Nome completo'}
                style={{
                  width: '100%',
                  background: '#080808',
                  border: '1.5px solid #2a2a2a',
                  borderRadius: 8,
                  padding: '0.85rem 1rem',
                  fontSize: 15,
                  color: '#fff',
                  fontFamily: "'DM Sans', sans-serif",
                  outline: 'none',
                  opacity: (checkboxLi && scrollLido) ? 1 : 0.5,
                }}
              />
            </label>

            {erro && (
              <div style={{ background: '#3a1010', border: '1px solid #ff4444', borderRadius: 8, padding: '0.85rem 1rem', fontSize: 13, color: '#ff8888', marginBottom: '1.5rem' }}>
                {erro}
              </div>
            )}

            <button
              onClick={aceitar}
              disabled={!scrollLido || !checkboxLi || !nomeDigitado.trim() || enviando}
              style={{
                width: '100%',
                background: (scrollLido && checkboxLi && nomeDigitado.trim() && !enviando) ? ACCENT : '#2a2a2a',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '1rem',
                fontWeight: 700,
                fontSize: 15,
                cursor: (scrollLido && checkboxLi && nomeDigitado.trim() && !enviando) ? 'pointer' : 'not-allowed',
                fontFamily: "'DM Sans', sans-serif",
                letterSpacing: 0.5,
                transition: 'opacity .2s',
              }}
            >
              {enviando ? 'REGISTRANDO ACEITE...' : 'ACEITAR TERMO E ATIVAR'}
            </button>

            <div style={{ fontSize: 11, color: '#555', marginTop: '1rem', textAlign: 'center' as const, lineHeight: 1.6 }}>
              Ao clicar em "Aceitar Termo e Ativar" você concorda com todos os itens descritos acima.<br />
              Seu aceite será registrado com data, hora e dispositivo de origem.
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#444', marginTop: '2rem' }}>
          © {new Date().getFullYear()} Just CT — Serious Training
        </div>
      </div>
    </div>
  )
}

export default function AceiteTermoPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#080808' }} />}>
      <AceitePageContent />
    </Suspense>
  )
}
