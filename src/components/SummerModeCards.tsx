'use client'
import { dataBR, reais, RODAPE_REGRAS } from '@/lib/summer'

const ACCENT = '#ff2d9b'

// Os dois cards do Summer Mode. Mesmo componente em /comprar e em /summer-mode —
// muda só o texto (curto no /comprar, longo na landing) e o destino do link de
// regras. Card do pacote maior (o de 30) leva o destaque e, no mobile, vem
// primeiro: a decisão que a campanha quer é o projeto inteiro.

// Textos longos da landing (canvas aprovado). O "chapéu" substitui a tag
// "summer mode" no topo do card quando a variante é a longa.
const TEXTO_LONGO: Record<number, { chapeu: string; texto: string }> = {
  15: {
    chapeu: 'pra dar um gás extra',
    texto:
      'Treina com a gente pelos apps parceiros? Com o modo ON você tem treinos além do check-in, ' +
      'pra usar quando quiser. Ainda não treina? É a porta de entrada pro projeto. ' +
      'Quinze treinos, no ritmo que couber na sua semana.',
  },
  30: {
    chapeu: 'pra ir com tudo',
    texto:
      'Trinta treinos pra usar do jeito que você quiser: espaçados até março ou concentrados agora, ' +
      'misturando Lift, Running e musculação livre. Quanto mais você usa, mais rápido chega no bônus. ' +
      'Sem desculpa, sem plano B.',
  },
}

export default function SummerModeCards({
  produtos,
  variante = 'curto',
  onComprar,
  encerrado = false,
  linkRegras = '/summer-mode#regras',
  rodape = true,
}: {
  produtos: any[]
  variante?: 'curto' | 'longo'
  onComprar: (id: string) => void
  encerrado?: boolean
  linkRegras?: string
  rodape?: boolean
}) {
  if (!produtos.length) return null

  // Menor primeiro no desktop; no mobile o CSS inverte (o destaque vai pro topo).
  const lista = [...produtos].sort(
    (a, b) => Number(a.creditos_por_venda || 0) - Number(b.creditos_por_venda || 0)
  )

  return (
    <>
      <style>{`
        .sm-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
        .sm-card { transition: all .25s; }
        .sm-card:hover { transform: translateY(-4px); }
        .sm-btn:hover { opacity: .85; }
        @media (max-width: 900px) {
          .sm-grid { grid-template-columns: 1fr !important; }
          .sm-destaque { order: -1; }
        }
      `}</style>

      <div className="sm-grid">
        {lista.map(p => {
          const creditos = Number(p.creditos_por_venda) || 1
          const total    = Number(p.valor)
          const parc     = Number(p.max_parcelas) || 1
          const porCred  = total / creditos
          const bonus    = Number(p.bonus_creditos) || 0
          const destaque = creditos >= 30
          const longo    = TEXTO_LONGO[creditos]
          const chapeu   = (variante === 'longo' && longo) ? longo.chapeu : 'summer mode'

          return (
            <div
              key={p.id}
              className={`sm-card${destaque ? ' sm-destaque' : ''}`}
              style={{
                position: 'relative',
                background: destaque ? 'linear-gradient(135deg,#111 0%,#1a0a14 100%)' : '#111',
                border: `1.5px solid ${destaque ? ACCENT : '#2a2a2a'}`,
                borderRadius: 16,
                padding: '1.75rem',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: ACCENT, fontFamily: "'DM Mono', monospace" }}>
                  {chapeu}
                </div>
                {destaque && (
                  <div style={{
                    background: ACCENT, color: '#fff', fontSize: 9, fontWeight: 700,
                    padding: '0.3rem 0.75rem', borderRadius: 20, letterSpacing: 1.2,
                    fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap',
                  }}>PROJETO INTEIRO</div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', lineHeight: 1, marginBottom: '0.85rem' }}>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(60px,7vw,72px)', color: '#fff', lineHeight: 1 }}>{creditos}</span>
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#fff', letterSpacing: 2 }}>TREINOS</span>
              </div>

              <div style={{ fontSize: 14, color: '#999', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                {variante === 'longo' && longo ? longo.texto : (p.descricao || '')}
              </div>

              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(44px,5vw,52px)', color: '#fff', lineHeight: 1 }}>
                {reais(total)}
              </div>
              <div style={{ fontSize: 12, color: '#777', marginBottom: '1.25rem', fontFamily: "'DM Mono', monospace" }}>
                {parc > 1 ? `ou ${parc}x de ${reais(total / parc)} · ` : ''}{reais(porCred)} por treino
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.75rem', flex: 1 }}>
                {[
                  { texto: 'Clubs + musculação livre do CT', forte: false },
                  { texto: `Válido até ${dataBR(p.validade_fixa)}`, forte: false },
                  bonus > 0 ? { texto: `Completou os ${creditos} até 31/12? Ganha +${bonus}.`, forte: true } : null,
                ].filter(Boolean).map((b: any, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                    <span style={{ color: ACCENT, fontSize: 13, flexShrink: 0, lineHeight: 1.5 }}>✓</span>
                    <span style={{ fontSize: 13, color: b.forte ? '#fff' : '#ddd', fontWeight: b.forte ? 700 : 400, lineHeight: 1.5 }}>
                      {b.texto}
                    </span>
                  </div>
                ))}
              </div>

              {encerrado ? (
                <div style={{ background: '#1a1a1a', color: '#666', border: '1px solid #2a2a2a', borderRadius: 10, padding: '0.9rem', fontSize: 14, textAlign: 'center', fontWeight: 600 }}>
                  Summer Mode encerrado
                </div>
              ) : (
                <button
                  onClick={() => onComprar(p.id)}
                  className="sm-btn"
                  style={{
                    background: destaque ? ACCENT : 'transparent',
                    color: destaque ? '#fff' : ACCENT,
                    border: destaque ? 'none' : `1.5px solid ${ACCENT}`,
                    borderRadius: 10, padding: '0.9rem', fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', letterSpacing: 0.5,
                  }}
                >
                  COMPRAR AGORA →
                </button>
              )}

              <a href={linkRegras} style={{ display: 'block', textAlign: 'center', marginTop: '0.85rem', fontSize: 12, color: '#666', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                entenda as regras
              </a>
            </div>
          )
        })}
      </div>

      {rodape && (
        <div style={{ marginTop: '1.5rem', fontSize: 11, color: '#555', fontFamily: "'DM Mono', monospace", lineHeight: 1.8 }}>
          {RODAPE_REGRAS}
        </div>
      )}
    </>
  )
}
