'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'
import SummerToggle from '@/components/SummerToggle'
import SummerModeCards from '@/components/SummerModeCards'
import {
  CAMPANHA_SUMMER, dentroDaJanela, dataBR,
  IDEIA_TITULO, IDEIA_TEXTO,
  BONUS_TITULO, BONUS_PASSOS,
  REGRAS_TITULO, REGRAS,
} from '@/lib/summer'

const ACCENT = '#ff2d9b'

// Landing da campanha Summer Mode. Pública: visitante vê tudo sem login — quem
// trata login/cadastro é o checkout, como no resto do site.
//
// A página continua existindo depois de 30/09 (links antigos, print, story):
// fora da janela o hero mostra OFF e os botões de compra viram "Summer Mode
// encerrado", desabilitados.
export default function SummerModePage() {
  const router = useRouter()
  const supabase = createClient()

  const [produtos, setProdutos] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [on, setOn]             = useState(true)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data } = await supabase
      .from('produtos')
      .select('*')
      .eq('campanha', CAMPANHA_SUMMER)
      .eq('ativo', true)
      .eq('visivel_site', true)
      .order('valor', { ascending: true })
    const lista = data || []
    setProdutos(lista)
    // Campanha fora do ar: o hero já abre desligado.
    if (!lista.some(p => dentroDaJanela(p))) setOn(false)
    setLoading(false)
  }

  function irParaCheckout(id: string) { router.push(`/comprar/checkout?produto=${id}`) }

  const naJanela  = produtos.filter(p => dentroDaJanela(p))
  const encerrado = !loading && naJanela.length === 0
  // Fora da janela ainda mostramos os cards (a página é referência da campanha),
  // só que sem botão de compra.
  const cards     = naJanela.length > 0 ? naJanela : produtos
  const validade  = dataBR(cards[0]?.validade_fixa)

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        html { scroll-behavior: smooth; }
        .sm-anchor { scroll-margin-top: 88px; }
        .sm-sec { padding: 5rem 2.5rem; max-width: 1100px; margin: 0 auto; }
        .sm-tag { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 3px;
                  text-transform: uppercase; color: ${ACCENT}; margin-bottom: 1rem; }
        .sm-h2 { font-family: 'Bebas Neue', sans-serif; font-size: clamp(30px, 4.2vw, 52px);
                 color: #fff; line-height: 1.05; letter-spacing: 1px; margin-bottom: 1.25rem; }
        .sm-p { font-size: 16px; color: #999; line-height: 1.9; max-width: 720px; }
        .sm-btn-primary { background: ${ACCENT}; color: #fff; border: none; border-radius: 10px;
          padding: 1rem 2.25rem; font-weight: 700; font-size: 15px; cursor: pointer;
          font-family: 'DM Sans', sans-serif; letter-spacing: .5px; transition: opacity .2s; }
        .sm-btn-primary:hover { opacity: .85; }
        .sm-btn-ghost { background: transparent; color: #aaa; border: 1.5px solid #333;
          border-radius: 10px; padding: 1rem 2.25rem; font-weight: 600; font-size: 15px;
          cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all .2s; }
        .sm-btn-ghost:hover { border-color: ${ACCENT}; color: ${ACCENT}; }
        .sm-passos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
        .sm-regras { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem 2rem; }
        @media (max-width: 900px) {
          .sm-sec { padding: 3.5rem 1.25rem; }
          .sm-passos { grid-template-columns: 1fr; }
          .sm-regras { grid-template-columns: 1fr; }
        }
      `}</style>

      <SiteHeader />

      {/* ══ 1. HERO ══ */}
      <div style={{ paddingTop: 64 }}>
        <div className="sm-sec" style={{ paddingTop: '5rem', paddingBottom: '3rem', textAlign: 'center' }}>
          <div className="sm-tag">// campanha summer mode</div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            flexWrap: 'wrap', fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
            fontSize: 'clamp(38px, 7vw, 84px)', letterSpacing: 2, color: '#fff', marginBottom: '1rem',
          }}>
            <span>SUMMER MODE:</span>
            <SummerToggle
              on={on}
              height={44}
              onToggle={() => setOn(v => !v)}
              ariaLabel="Ligar ou desligar o Summer Mode"
            />
            <span style={{ color: on ? ACCENT : '#666', textShadow: on ? `0 0 40px ${ACCENT}88` : 'none', transition: 'all .3s' }}>
              {on ? 'ON' : 'OFF'}
            </span>
          </div>

          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(20px, 3vw, 32px)',
            color: '#fff', letterSpacing: 6, marginBottom: '1.5rem',
          }}>
            {on ? '100 DAYS TO GO' : 'ARE YOU IN?'}
          </div>

          {!on && (
            <div style={{ fontSize: 16, color: '#888', lineHeight: 1.8, maxWidth: 540, margin: '0 auto 2rem' }}>
              Desligado tudo bem, sem julgamento. Mas o verão vem de qualquer jeito.
              Toca no botão e a gente conversa.
            </div>
          )}

          {on && (
            <div style={{ fontSize: 16, color: '#888', lineHeight: 1.8, maxWidth: 560, margin: '0 auto 2rem' }}>
              Dois pacotes de treinos pra usar em qualquer JustClub e na musculação livre do Just CT
              {validade ? `, com validade até ${validade}` : ''}. Zerou até 31/12? Ganha treino de bônus.
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#pacotes"><button className="sm-btn-primary">VER PACOTES →</button></a>
            <a href="#regras"><button className="sm-btn-ghost">Ler as regras</button></a>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #1a1a1a' }} />

      {/* ══ 2. A IDEIA ══ */}
      <div className="sm-sec">
        <div className="sm-tag">// a ideia</div>
        <div className="sm-h2">{IDEIA_TITULO}</div>
        <div className="sm-p">{IDEIA_TEXTO}</div>
      </div>

      <div style={{ borderTop: '1px solid #1a1a1a' }} />

      {/* ══ 3. PACOTES ══ */}
      <div id="pacotes" className="sm-sec sm-anchor">
        <div className="sm-tag">// os pacotes</div>
        <div className="sm-h2">DOIS PACOTES. UMA DECISÃO: SUMMER ON.</div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
            <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ marginTop: '2rem' }}>
            <SummerModeCards
              produtos={cards}
              variante="longo"
              onComprar={irParaCheckout}
              encerrado={encerrado}
              linkRegras="#regras"
            />
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #1a1a1a' }} />

      {/* ══ 4. O BÔNUS ══ */}
      <div className="sm-sec">
        <div className="sm-tag">// o bônus</div>
        <div className="sm-h2">{BONUS_TITULO}</div>

        <div className="sm-passos" style={{ marginTop: '2.5rem' }}>
          {BONUS_PASSOS.map(p => (
            <div key={p.num} style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.75rem 1.5rem' }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: ACCENT, letterSpacing: 2, marginBottom: '0.75rem' }}>{p.num}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: 1.5, marginBottom: '0.65rem' }}>{p.titulo}</div>
              <div style={{ fontSize: 14, color: '#888', lineHeight: 1.7 }}>{p.texto}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid #1a1a1a' }} />

      {/* ══ 5. REGRAS ══ */}
      <div id="regras" className="sm-sec sm-anchor">
        <div className="sm-tag">// as regras</div>
        <div className="sm-h2">{REGRAS_TITULO}</div>

        <div className="sm-regras" style={{ marginTop: '2rem' }}>
          {REGRAS.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: ACCENT, flexShrink: 0, marginTop: 3, letterSpacing: 1 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div style={{ fontSize: 14, color: '#999', lineHeight: 1.75 }}>{r}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ 6. CTA FINAL ══ */}
      <div className="sm-sec" style={{ textAlign: 'center', paddingTop: '4rem', paddingBottom: '7rem' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap',
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 5vw, 60px)',
          letterSpacing: 2, color: '#fff', lineHeight: 1, marginBottom: '2rem',
        }}>
          <span>SUMMER MODE:</span>
          <SummerToggle on height={34} />
          <span style={{ color: ACCENT, textShadow: `0 0 30px ${ACCENT}88` }}>ON</span>
        </div>
        {encerrado ? (
          <div style={{ fontSize: 15, color: '#666' }}>
            A janela de venda do Summer Mode está encerrada. Os pacotes normais seguem em{' '}
            <span onClick={() => router.push('/comprar')} style={{ color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>planos e pacotes</span>.
          </div>
        ) : (
          <a href="#pacotes"><button className="sm-btn-primary">VER PACOTES →</button></a>
        )}
      </div>

      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#fff', letterSpacing: 2 }}>JUST<span style={{ color: ACCENT }}>CT</span></div>
        <div style={{ fontSize: 12, color: '#666' }}>© 2025 Just CT — Serious Training</div>
        <span onClick={() => router.push('/comprar')} style={{ fontSize: 12, color: '#999', cursor: 'pointer' }}>Ver todos os planos →</span>
      </footer>
    </div>
  )
}
