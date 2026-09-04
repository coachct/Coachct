'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Compra de CRÉDITO EXTRA DE AULA (apps parceiros — Wellhub/TotalPass)
//
// Painel inline usado em /agendar e /minha-conta. Em /agendar ele abre POR CIMA
// do modal de reserva de propósito: o horário escolhido continua na tela, então
// a pessoa compra e volta pra confirmar sem perder o slot.
//
// Só cartão de crédito aqui — mesmo padrão do /comprar/checkout. PIX e dinheiro
// continuam pelo balcão da recepção.
//
// Os produtos vêm prontos do RPC credito_extra_status (já filtrados para os apps
// que ESTE cliente tem ativos nesta unidade). O componente não consulta produtos.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'

const ACCENT  = '#ff2d9b'
const AMARELO = '#ffaa00'
const VERDE   = '#2ddd8b'

export type ProdutoCreditoExtra = {
  id: string
  nome: string
  valor: number
  creditos: number
  por_credito: number
  max_parcelas: number
  descricao: string | null
}

export type CreditoExtraStatus = {
  exige: boolean
  modo: 'off' | 'aviso' | 'obrigatorio'
  em_teste: boolean
  saldo: number
  valor: number | null
  desde: string | null
  aviso: string | null
  mostra_aviso: boolean
  produtos: ProdutoCreditoExtra[]
}

const QTD_MAX = 20

export function formatarValorBRL(v: number) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
}

function formatarCPF(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatarCartao(v: string) {
  return v.replace(/\D/g, '').slice(0, 16)
    .replace(/(\d{4})(\d)/, '$1 $2')
    .replace(/(\d{4})(\d)/, '$1 $2')
    .replace(/(\d{4})(\d)/, '$1 $2')
}

export default function CompraCreditoExtra({
  aberto,
  status,
  cliente,
  onFechar,
  onComprado,
  titulo = 'CRÉDITO DE AULA',
  subtitulo,
}: {
  aberto: boolean
  status: CreditoExtraStatus | null
  cliente: any
  onFechar: () => void
  onComprado: (creditosComprados: number) => void | Promise<void>
  titulo?: string
  subtitulo?: string
}) {
  const produtos = useMemo(() => status?.produtos || [], [status])
  // O avulso é o produto de 1 crédito. É ele que ganha seletor de quantidade.
  const avulso  = useMemo(() => produtos.find(p => p.creditos === 1) || null, [produtos])
  const pacotes = useMemo(() => produtos.filter(p => p.creditos > 1), [produtos])

  const [produtoId, setProdutoId] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [parcelas, setParcelas] = useState(1)

  const [cpf, setCpf] = useState('')
  const [mostrarCpf, setMostrarCpf] = useState(false)

  const [cartaoNumero, setCartaoNumero] = useState('')
  const [cartaoNome, setCartaoNome] = useState('')
  const [cartaoMes, setCartaoMes] = useState('')
  const [cartaoAno, setCartaoAno] = useState('')
  const [cartaoCvv, setCartaoCvv] = useState('')

  const [pagando, setPagando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState<{ creditos: number } | null>(null)

  // Ao abrir: começa limpo, com o avulso pré-selecionado.
  useEffect(() => {
    if (!aberto) return
    setProdutoId(avulso?.id || produtos[0]?.id || '')
    setQuantidade(1)
    setParcelas(1)
    setErro('')
    setSucesso(null)
    setCartaoNumero(''); setCartaoNome(''); setCartaoMes(''); setCartaoAno(''); setCartaoCvv('')
    setCpf('')
    setMostrarCpf(false)
  }, [aberto, avulso?.id, produtos.length])

  const produto = produtos.find(p => p.id === produtoId) || null
  const ehAvulso = !!produto && produto.creditos === 1
  const qtd = ehAvulso ? quantidade : 1
  const valorTotal = produto ? produto.valor * qtd : 0
  const creditosTotal = produto ? produto.creditos * qtd : 0
  const maxParcelas = produto?.max_parcelas || 1

  // Trocar produto reseta quantidade e parcelas (evita 5x de um pacote sem querer)
  function selecionarProduto(id: string) {
    setProdutoId(id)
    setQuantidade(1)
    setParcelas(1)
    setErro('')
  }

  // ── Sugestão de troca pelo pacote ─────────────────────────────────────────
  // Quando o total do avulso já encosta no preço de um pacote que dá MAIS
  // créditos, oferecemos a troca. "Encostar" = a diferença cabe em 1 crédito
  // avulso — é aí que a conta deixa de fazer sentido pra pessoa.
  const sugestao = useMemo(() => {
    if (!produto || !ehAvulso || qtd < 2) return null
    const candidatos = pacotes
      .filter(p => p.creditos > creditosTotal)
      .map(p => ({ pacote: p, diff: p.valor - valorTotal }))
      .filter(c => c.diff <= produto.valor)
      .sort((a, b) => a.diff - b.diff)
    return candidatos[0] || null
  }, [produto, ehAvulso, qtd, pacotes, creditosTotal, valorTotal])

  const cpfCadastro = (cliente?.cpf || '').replace(/\D/g, '')
  const precisaCpf = cpfCadastro.length !== 11 || mostrarCpf

  async function pagar() {
    if (!produto || !cliente?.id) return
    setErro('')
    if (precisaCpf && cpf.replace(/\D/g, '').length !== 11) { setErro('Informe seu CPF para concluir a compra.'); return }
    if (cartaoNumero.replace(/\s/g, '').length < 16) { setErro('Número do cartão inválido.'); return }
    if (!cartaoNome.trim()) { setErro('Digite o nome impresso no cartão.'); return }
    if (!cartaoMes || !cartaoAno) { setErro('Digite a validade do cartão.'); return }
    if (cartaoCvv.length < 3) { setErro('CVV inválido.'); return }

    setPagando(true)
    try {
      const payload: any = {
        produto_id: produto.id,
        cliente_id: cliente.id,
        metodo: 'cartao_credito',
        parcelas,
        quantidade: qtd,
        cartao: {
          numero: cartaoNumero.replace(/\s/g, ''),
          nome: cartaoNome,
          cvv: cartaoCvv,
          mes: cartaoMes,
          ano: cartaoAno,
        },
      }
      if (precisaCpf) payload.cpf = cpf.replace(/\D/g, '')

      const res = await fetch('/api/pagamento/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.precisa_cpf) setMostrarCpf(true)
        setErro(data.detalhes || data.error || 'Erro ao processar pagamento.')
        setPagando(false)
        return
      }
      if (!data.cartao?.aprovado) {
        setErro(data.cartao?.motivo || 'Cartão recusado. Verifique os dados ou tente outro cartão.')
        setPagando(false)
        return
      }
      setSucesso({ creditos: creditosTotal })
      setPagando(false)
      await onComprado(creditosTotal)
    } catch {
      setErro('Erro de conexão. Tente novamente.')
      setPagando(false)
    }
  }

  if (!aberto || !status) return null

  const inputStyle: any = {
    width: '100%', background: '#080808', border: '1px solid #333', borderRadius: 10,
    padding: '0.7rem 0.9rem', color: '#fff', fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
  }
  const labelStyle: any = {
    fontSize: 11, color: '#555', display: 'block', marginBottom: 5,
    textTransform: 'uppercase', letterSpacing: 1,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000e6', zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: '#111', border: `1.5px solid ${ACCENT}44`, borderRadius: 20, width: '100%', maxWidth: 460, padding: '1.5rem', maxHeight: '92vh', overflowY: 'auto' }}>

        {sucesso ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: '0.75rem' }}>✅</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: VERDE, letterSpacing: 1, marginBottom: 6 }}>
              PAGAMENTO APROVADO
            </div>
            <div style={{ fontSize: 14, color: '#bbb', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              {sucesso.creditos === 1
                ? '1 crédito de aula liberado na sua conta.'
                : `${sucesso.creditos} créditos de aula liberados na sua conta.`}
              {' '}Eles não expiram.
            </div>
            <button onClick={onFechar}
              style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Continuar →
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: 1 }}>{titulo}</div>
              <button onClick={onFechar} style={{ background: 'none', border: 'none', color: '#555', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: '#777', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              {subtitulo || 'Para treinar com o Coach CT usando o check-in do seu app parceiro, você precisa de 1 crédito de aula por treino.'}
            </div>

            <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 10, padding: '0.65rem 0.9rem', marginBottom: '1.25rem', fontSize: 13, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Seu saldo hoje</span>
              <span style={{ color: status.saldo > 0 ? VERDE : AMARELO, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                {status.saldo} crédito{status.saldo === 1 ? '' : 's'}
              </span>
            </div>

            {produtos.length === 0 ? (
              <div style={{ background: '#1a1000', border: `1px solid ${AMARELO}44`, borderRadius: 10, padding: '1rem', fontSize: 13, color: AMARELO, lineHeight: 1.6 }}>
                Não há créditos de aula à venda para o seu plano no momento. Fale com a recepção do Just CT.
              </div>
            ) : (
              <>
                {/* ── Produtos ── */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={labelStyle}>O que você quer comprar</div>
                  {produtos.map(p => {
                    const sel = produtoId === p.id
                    return (
                      <div key={p.id} onClick={() => selecionarProduto(p.id)}
                        style={{ border: `1.5px solid ${sel ? ACCENT : '#2a2a2a'}`, background: sel ? `${ACCENT}12` : 'transparent', borderRadius: 10, padding: '0.75rem 0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 8, transition: 'all .15s' }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${sel ? ACCENT : '#444'}`, background: sel ? ACCENT : 'transparent', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: sel ? '#fff' : '#999' }}>{p.nome}</div>
                          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                            {p.creditos === 1 ? '1 crédito' : `${p.creditos} créditos · ${formatarValorBRL(p.por_credito)} cada`} · sem validade
                          </div>
                        </div>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: sel ? '#fff' : '#666', whiteSpace: 'nowrap' }}>
                          {formatarValorBRL(p.valor)}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ── Quantidade (só no avulso) ── */}
                {ehAvulso && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={labelStyle}>Quantos créditos</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => setQuantidade(q => Math.max(1, q - 1))} disabled={qtd <= 1}
                        style={{ width: 40, height: 40, borderRadius: 10, border: '1.5px solid #333', background: 'transparent', color: qtd <= 1 ? '#333' : '#fff', fontSize: 20, cursor: qtd <= 1 ? 'default' : 'pointer', flexShrink: 0 }}>−</button>
                      <div style={{ flex: 1, textAlign: 'center', fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, color: '#fff', lineHeight: 1 }}>{qtd}</div>
                      <button onClick={() => setQuantidade(q => Math.min(QTD_MAX, q + 1))} disabled={qtd >= QTD_MAX}
                        style={{ width: 40, height: 40, borderRadius: 10, border: '1.5px solid #333', background: 'transparent', color: qtd >= QTD_MAX ? '#333' : '#fff', fontSize: 20, cursor: qtd >= QTD_MAX ? 'default' : 'pointer', flexShrink: 0 }}>+</button>
                    </div>
                  </div>
                )}

                {/* ── Sugestão de troca pelo pacote ── */}
                {sugestao && (
                  <div onClick={() => selecionarProduto(sugestao.pacote.id)}
                    style={{ background: `${AMARELO}12`, border: `1px solid ${AMARELO}55`, borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1.25rem', cursor: 'pointer' }}>
                    <div style={{ fontSize: 13, color: AMARELO, fontWeight: 700, marginBottom: 4 }}>💡 Vale mais a pena o pacote</div>
                    <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
                      {sugestao.diff > 0
                        ? <>Por <strong style={{ color: '#fff' }}>{formatarValorBRL(sugestao.diff)}</strong> a mais você leva <strong style={{ color: '#fff' }}>{sugestao.pacote.creditos} créditos</strong> — o mês inteiro.</>
                        : <>O <strong style={{ color: '#fff' }}>{sugestao.pacote.nome}</strong> sai <strong style={{ color: '#fff' }}>{formatarValorBRL(Math.abs(sugestao.diff))} mais barato</strong> e ainda dá <strong style={{ color: '#fff' }}>{sugestao.pacote.creditos} créditos</strong>.</>}
                    </div>
                    <div style={{ fontSize: 12, color: AMARELO, marginTop: 6, textDecoration: 'underline' }}>Trocar pelo {sugestao.pacote.nome} →</div>
                  </div>
                )}

                {/* ── Dados que faltam no cadastro ── */}
                {precisaCpf && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={labelStyle}>CPF</label>
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="000.000.000-00"
                      value={cpf} onChange={e => setCpf(formatarCPF(e.target.value))} />
                    <div style={{ fontSize: 12, color: '#777', marginTop: 5 }}>Seu cadastro está sem CPF. Ele é exigido pelo pagamento.</div>
                  </div>
                )}

                {/* ── Cartão ── */}
                <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={labelStyle}>Cartão de crédito</div>
                  <div>
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="0000 0000 0000 0000"
                      value={cartaoNumero} onChange={e => setCartaoNumero(formatarCartao(e.target.value))} />
                  </div>
                  <div>
                    <input style={inputStyle} type="text" placeholder="NOME IMPRESSO NO CARTÃO"
                      value={cartaoNome} onChange={e => setCartaoNome(e.target.value.toUpperCase())} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="MM" maxLength={2}
                      value={cartaoMes} onChange={e => setCartaoMes(e.target.value.replace(/\D/g, ''))} />
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="AAAA" maxLength={4}
                      value={cartaoAno} onChange={e => setCartaoAno(e.target.value.replace(/\D/g, ''))} />
                    <input style={inputStyle} type="text" inputMode="numeric" placeholder="CVV" maxLength={4}
                      value={cartaoCvv} onChange={e => setCartaoCvv(e.target.value.replace(/\D/g, ''))} />
                  </div>
                </div>

                {/* ── Parcelamento ── */}
                {maxParcelas > 1 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={labelStyle}>Parcelamento</div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(maxParcelas, 3)}, 1fr)`, gap: 8 }}>
                      {Array.from({ length: maxParcelas }, (_, i) => i + 1).map(n => (
                        <button key={n} type="button" onClick={() => setParcelas(n)}
                          style={{ padding: '0.6rem 0.4rem', background: parcelas === n ? `${ACCENT}15` : '#080808', border: `1.5px solid ${parcelas === n ? ACCENT : '#2a2a2a'}`, borderRadius: 8, cursor: 'pointer', textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: parcelas === n ? '#fff' : '#888' }}>{n}x</div>
                          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{formatarValorBRL(valorTotal / n)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Total ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.9rem 0', borderTop: '1px solid #222', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: 14, color: '#aaa' }}>Total</div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                      {creditosTotal} crédito{creditosTotal === 1 ? '' : 's'} de aula
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, color: '#fff', lineHeight: 1 }}>{formatarValorBRL(valorTotal)}</div>
                    {parcelas > 1 && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>em {parcelas}x de {formatarValorBRL(valorTotal / parcelas)}</div>}
                  </div>
                </div>

                {erro && (
                  <div style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 8, padding: '0.7rem 1rem', fontSize: 13, color: ACCENT, marginBottom: '1rem', lineHeight: 1.5 }}>{erro}</div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={onFechar} disabled={pagando}
                    style={{ flex: 1, background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.85rem', color: '#888', fontSize: 14, cursor: pagando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    Cancelar
                  </button>
                  <button onClick={pagar} disabled={pagando || !produto}
                    style={{ flex: 2, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.85rem', fontWeight: 700, fontSize: 15, cursor: pagando ? 'default' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: pagando ? 0.7 : 1 }}>
                    {pagando ? 'Processando...' : `Pagar ${formatarValorBRL(valorTotal)} →`}
                  </button>
                </div>

                <div style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: '0.9rem', lineHeight: 1.6 }}>
                  🔒 Pagamento processado pela Pagar.me · Crédito de aula não expira<br />
                  Prefere PIX ou dinheiro? Compre na recepção do Just CT.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
