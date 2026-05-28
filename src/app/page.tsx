'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'

const ACCENT = '#ff2d9b'

// Dados fixos por tipo de unidade (endereço, horários, aulas)
// O id real vem do banco; aqui só mapeamos pelo nome.
const DADOS_UNIDADES: Record<string, {
  endereco: string
  horariosFixos: { semana: string; fds: string } | null
  aulas: string
  bairro: string
}> = {
  'Just CT': {
    endereco: 'Rua Fiandeiras, 392 — Vila Olímpia, São Paulo',
    bairro: 'Vila Olímpia',
    horariosFixos: { semana: 'Seg a Sex · 05:30 às 21:00', fds: 'Sáb, Dom e Feriados · 08:00 às 13:00' },
    aulas: 'Coach CT · Musculação livre',
  },
  'JustClub Vila Olímpia': {
    endereco: 'Av. Dr. Cardoso de Melo, 1337 — Vila Olímpia, São Paulo',
    bairro: 'Vila Olímpia',
    horariosFixos: null,
    aulas: 'Lift · Lift for Girls · Running + Funcional',
  },
  'JustClub Pinheiros': {
    endereco: 'Rua Deputado Lacerda Franco, 342 — Pinheiros, São Paulo',
    bairro: 'Pinheiros',
    horariosFixos: null,
    aulas: 'Lift · Lift for Girls · Running + Funcional',
  },
}

export default function LandingPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const isCliente = perfil?.role === 'cliente'
  const isLogado = !!perfil

  const [unidades, setUnidades] = useState<any[]>([])

  useEffect(() => {
    async function carregarUnidades() {
      const { data } = await supabase
        .from('unidades')
        .select('id, nome, tipo')
        .order('tipo', { ascending: true })
        .order('nome', { ascending: true })
      // Ordem fixa: Just CT primeiro, depois JustClub Vila Olímpia, depois Pinheiros
      const ord = ['Just CT', 'JustClub Vila Olímpia', 'JustClub Pinheiros']
      const lista = (data || []).slice().sort((a: any, b: any) => {
        const ia = ord.indexOf(a.nome); const ib = ord.indexOf(b.nome)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
      setUnidades(lista)
    }
    carregarUnidades()
  }, [])

  const s: Record<string, any> = {
    page: { background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" },
    section: { padding: '6rem 2.5rem', maxWidth: 1100, margin: '0 auto' },
    sTag: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' },
    sTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 3.5vw, 48px)', color: '#fff', lineHeight: 1.05, marginBottom: '1rem' },
    sSub: { color: '#666', fontSize: 16, maxWidth: 560, lineHeight: 1.7 },
    divider: { borderTop: '1px solid #1a1a1a' },
    btnPrimary: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.9rem 2rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
    btnGhost: { background: 'transparent', color: '#f0f0f0', border: '1.5px solid #333', borderRadius: 8, padding: '0.9rem 2rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  }

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={s.page}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg) } }
        .btn-ghost-h:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .feature-h { transition: all .2s; }
        .feature-h:hover { border-color: ${ACCENT} !important; }
        .maps-btn:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .pro-card-h { transition: all .25s; }
        .pro-card-h:hover { border-color: ${ACCENT} !important; transform: translateY(-4px); }
        .pro-cta-h:hover { opacity: 0.85; }
        .pro-cta-ghost-h:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .planos-spoiler-h { transition: all .25s; cursor: pointer; }
        .planos-spoiler-h:hover { border-color: ${ACCENT}55 !important; }
        .planos-spoiler-h:hover .planos-cta-arrow { color: ${ACCENT} !important; transform: translateX(4px); }
        .planos-cta-arrow { transition: all .2s; display: inline-block; }
        .unidade-card-h { transition: all .25s; }
        .unidade-card-h:hover { border-color: ${ACCENT}55 !important; transform: translateY(-3px); }
        @media (max-width: 768px) {
          .nav-links-d { display: none !important; }
          .hero-title-r { font-size: 36px !important; }
          .stats-r { gap: 1.5rem !important; }
          .grid3-r { grid-template-columns: 1fr !important; }
          .grid2-r { grid-template-columns: 1fr !important; }
          .pro-grid-r { grid-template-columns: 1fr 1fr !important; }
          .pro-hero-r { grid-template-columns: 1fr !important; }
          .planos-spoiler-grid-r { grid-template-columns: 1fr !important; }
          .unidades-grid-r { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <SiteHeader />

      {/* HERO */}
      <div style={{ position: 'relative', paddingTop: 64, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/hero.jpg)', backgroundSize: 'cover', backgroundPosition: 'center top', zIndex: 0 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #080808ee 50%, #08080888 100%)', zIndex: 1 }} />
        <div style={{ position: 'relative', zIndex: 2, padding: '6rem 2.5rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: ACCENT, marginBottom: '1.5rem', fontFamily: "'DM Mono', monospace" }}>
            // Vila Olímpia · São Paulo
          </div>
          <div className="hero-title-r" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 4vw, 58px)', lineHeight: 1.05, color: '#fff', marginBottom: '1.5rem', maxWidth: 700 }}>
            O AMBIENTE FAZ A DIFERENÇA,<br />O COACH CT AINDA MAIS<span style={{ color: ACCENT }}>!</span>
          </div>
          <div style={{ fontSize: 18, color: '#aaa', maxWidth: 560, marginBottom: '2.5rem', lineHeight: 1.7 }}>
            Do equipamento ao atendimento, o padrão é diferente em tudo. Musculação com máquinas premium e o{' '}
            <strong style={{ color: '#fff' }}>Coach CT</strong> — seu personal exclusivo, agendado no horário que você escolher, focado só em você.
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/agendar')} style={s.btnPrimary}>Agendar Treino →</button>
            <a href="#coach-ct"><button className="btn-ghost-h" style={s.btnGhost}>Como funciona</button></a>
          </div>
          <div className="stats-r" style={{ display: 'flex', gap: '3rem', marginTop: '4rem', flexWrap: 'wrap' }}>
            {[
              { val: '1×1', label: 'Personal exclusivo' },
              { val: '100%', label: 'Horário flexível' },
              { val: 'Vila\nOlímpia', label: 'Rua Fiandeiras, 392' },
            ].map((s2, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${ACCENT}`, paddingLeft: '1rem' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: i === 2 ? 28 : 40, color: '#fff', lineHeight: 1, whiteSpace: 'pre-line' }}>{s2.val}</div>
                <div style={{ fontSize: 12, color: '#555' }}>{s2.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={s.divider} />

      {/* COACH CT — banner único (personal 1×1 + musculação livre) */}
      <div id="coach-ct" style={s.section}>
        <div style={s.sTag}>// o diferencial coach ct</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${ACCENT}15`, border: `1px solid ${ACCENT}30`, borderRadius: 20, padding: '0.35rem 1rem', fontSize: 12, color: ACCENT, fontWeight: 600, marginBottom: '1.5rem' }}>
          ⚡ COACH CT
        </div>
        <div style={s.sTitle}>
          PERSONAL QUANDO VOCÊ QUISER.<br />OU TREINE SOZINHO, COMO PREFERIR.
        </div>
        <div style={{ fontSize: 16, color: '#888', maxWidth: 700, lineHeight: 1.8, marginBottom: '2.5rem' }}>
          No Just CT você escolhe como treinar. Agende um horário e treine em formato <strong style={{ color: '#fff' }}>personal 1×1</strong> com um dos nossos Coaches, ou venha quando quiser para a <strong style={{ color: '#fff' }}>musculação livre</strong> e treine no seu ritmo. Os dois formatos com máquinas premium e ambiente pensado nos mínimos detalhes.
        </div>

        {/* Duas fotos da academia */}
        <div className="grid2-r" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2.5rem' }}>
          <div style={{ borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9' }}>
            <img src="/foto capa CT.jpg" alt="Leg Zone Just CT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9' }}>
            <img src="/Imagem Treino Sala CT.jpg" alt="Sala Just CT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        {/* 3 cards — os dois formatos + assinatura Ju */}
        <div className="grid3-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          <div className="feature-h" style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ width: 40, height: 40, background: `${ACCENT}15`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: '1rem' }}>🎯</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: '0.5rem', letterSpacing: 1 }}>1×1 COM COACH CT</div>
            <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
              Agendamento flexível, um coach dedicado só a você. Escolha o dia e horário que encaixam na sua rotina, sem mensalidade de personal e sem compromisso fixo.
            </div>
          </div>
          <div className="feature-h" style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ width: 40, height: 40, background: `${ACCENT}15`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: '1rem' }}>🏋️</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: '0.5rem', letterSpacing: 1 }}>MUSCULAÇÃO LIVRE</div>
            <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
              Quer treinar sozinho? Sem problemas. Equipamentos premium, halteres completos e espaço de sobra para você treinar no seu ritmo, quando quiser.
            </div>
          </div>
          <div className="feature-h" style={{ background: `linear-gradient(135deg, ${ACCENT}12 0%, #111 100%)`, border: `1.5px solid ${ACCENT}55`, borderRadius: 16, padding: '1.5rem', position: 'relative' as const, overflow: 'hidden' as const }}>
            <div style={{ position: 'absolute' as const, top: 0, right: 0, background: ACCENT, fontSize: 10, fontWeight: 700, padding: '0.2rem 1rem', letterSpacing: 1, color: '#fff' }}>ASSINATURA</div>
            <div style={{ width: 40, height: 40, background: `${ACCENT}25`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: '1rem' }}>💡</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: '0.5rem', letterSpacing: 1 }}>TREINOS BY JU HITOMI</div>
            <div style={{ fontSize: 14, color: '#aaa', lineHeight: 1.6 }}>
              Todos os treinos do Coach CT são montados pela nossa coordenadora <strong style={{ color: '#fff' }}>Ju Hitomi</strong>. Sessões de até 1h com intensidade garantida e método pensado pra resultado real.
            </div>
          </div>
        </div>
      </div>

      <div style={s.divider} />

      {/* COACH CT PRO */}
      <div id="coach-ct-pro" style={{ ...s.section, paddingBottom: '4rem' }}>
        <div style={s.sTag}>// próximo nível</div>
        <div style={{ fontSize: 'clamp(14px, 1.5vw, 18px)', color: '#666', fontStyle: 'italic', marginBottom: '1rem', maxWidth: 600, lineHeight: 1.6 }}>
          "Existe o padrão. E existe o que poucos acessam."
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(48px, 6vw, 80px)', color: '#fff', lineHeight: 1, marginBottom: '3rem', letterSpacing: 2 }}>
          COACH CT <span style={{ color: ACCENT }}>PRO</span>
        </div>
        <div className="pro-hero-r" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', marginBottom: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, color: '#aaa', lineHeight: 1.9, marginBottom: '2rem' }}>
              O Coach CT já é diferente. O Pro é o que acontece quando você decide parar de encaixar o treino na sua agenda — e começa a construir a agenda em torno do treino.
              <br /><br />
              <strong style={{ color: '#fff' }}>Janela de 14 dias. Escolha do coach. Prioridade na fila.</strong> Tudo o que o plano padrão não entrega porque não foi feito pra quem leva isso a sério.
              <br /><br />
              Mas claro — continuar no básico também é uma opção.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
              <button onClick={() => router.push('/coach-ct-pro')} className="pro-cta-h"
                style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.9rem 2rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'opacity .2s' }}>
                Conhecer o Pro →
              </button>
              <button onClick={() => router.push('/comprar')} className="pro-cta-ghost-h"
                style={{ background: 'transparent', color: '#aaa', border: '1.5px solid #333', borderRadius: 8, padding: '0.9rem 2rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
                Ver planos
              </button>
            </div>
          </div>
          <div style={{ borderRadius: 20, overflow: 'hidden', aspectRatio: '4/5', position: 'relative' as const }}>
            <img src="/hero.jpg" alt="Coach CT Pro" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #080808cc 0%, transparent 50%)' }} />
          </div>
        </div>
        <div className="pro-grid-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div className="pro-card-h" style={{ background: `linear-gradient(135deg, #1a0010 0%, #0d0008 100%)`, border: `1.5px solid ${ACCENT}44`, borderRadius: 16, padding: '1.5rem', position: 'relative' as const, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 120, overflow: 'hidden' }}>
              <img src="/foto capa CT.jpg" alt="Ju Hitomi" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', opacity: 0.4 }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, #1a0010 100%)' }} />
            </div>
            <div style={{ position: 'relative', paddingTop: 80 }}>
              <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: "'DM Mono', monospace" }}>by</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 1, lineHeight: 1.1, marginBottom: 8 }}>JU HITOMI</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6 }}>Todos os treinos do Coach CT Pro são elaborados por ela. Intensidade e método — garantidos.</div>
            </div>
          </div>
          <div className="pro-card-h" style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: ACCENT, lineHeight: 1, marginBottom: 4 }}>14</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>DIAS DE JANELA</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>Agende com até 2 semanas de antecedência. Wellhub e TotalPass ficam com 7. Você escolhe primeiro.</div>
          </div>
          <div className="pro-card-h" style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: ACCENT, lineHeight: 1, marginBottom: 4 }}>1×1</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>ESCOLHA DO COACH</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>Escolha o coach que vai te acompanhar no momento do agendamento. Sem surpresa na chegada.</div>
          </div>
          <div className="pro-card-h" style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: ACCENT, lineHeight: 1, marginBottom: 4 }}>3×</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>POR SEMANA</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>Diamond treina 2x. TP6 treina 2,5x. Pro treina 3x. A frequência que realmente transforma.</div>
          </div>
        </div>
      </div>

      <div style={s.divider} />

      <div style={s.divider} />

      {/* PLANOS — bloco compacto (spoiler clicável → /comprar) */}
      <div id="planos" style={s.section}>
        <div style={s.sTag}>// planos</div>
        <div style={s.sTitle}>ESCOLHA SEU PLANO</div>
        <div style={{ ...s.sSub, marginBottom: '2rem' }}>
          Planos próprios e apps parceiros aceitos nas três unidades — Just CT, JustClub Vila Olímpia e JustClub Pinheiros.
        </div>

        <div onClick={() => router.push('/comprar')} className="planos-spoiler-h"
          style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem 1.75rem' }}>

          <div className="planos-spoiler-grid-r" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>

            {/* Planos Just Club & CT — destaque */}
            <div style={{ background: `linear-gradient(135deg, ${ACCENT}18 0%, ${ACCENT}05 100%)`, border: `2px solid ${ACCENT}`, borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between', boxShadow: `0 0 24px -10px ${ACCENT}55` }}>
              <div>
                <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' as const, fontFamily: "'DM Mono', monospace" }}>
                  ⚡ Planos Just Club & CT
                </div>
                <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
                  Mensal · Semestral · Anual · <strong style={{ color: '#fff' }}>Coach CT Pro</strong> · Créditos avulsos
                </div>
              </div>
              <div style={{ fontSize: 12, color: ACCENT, fontWeight: 700, marginTop: 12, fontFamily: "'DM Sans', sans-serif" }}>
                Ver detalhes <span className="planos-cta-arrow">→</span>
              </div>
            </div>

            {/* Wellhub */}
            <div>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' as const, fontFamily: "'DM Mono', monospace" }}>
                💜 Wellhub
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7, fontSize: 13, color: '#888', lineHeight: 1.5 }}>
                <div><span style={{ color: '#aaa' }}>Just CT</span> <span style={{ color: '#555' }}>(musculação)</span> → <span style={{ color: '#fff', fontWeight: 600 }}>Gold+</span></div>
                <div><span style={{ color: '#aaa' }}>Just CT</span> <span style={{ color: '#555' }}>(Coach CT)</span> → <span style={{ color: '#fff', fontWeight: 600 }}>Diamond</span></div>
                <div><span style={{ color: '#aaa' }}>JustClub Vila Olímpia</span> → <span style={{ color: '#fff', fontWeight: 600 }}>Gold</span></div>
                <div><span style={{ color: '#aaa' }}>JustClub Pinheiros</span> → <span style={{ color: '#fff', fontWeight: 600 }}>Gold</span></div>
              </div>
            </div>

            {/* TotalPass */}
            <div>
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' as const, fontFamily: "'DM Mono', monospace" }}>
                🔵 TotalPass
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7, fontSize: 13, color: '#888', lineHeight: 1.5 }}>
                <div><span style={{ color: '#aaa' }}>Just CT</span> <span style={{ color: '#555' }}>(musculação)</span> → <span style={{ color: '#fff', fontWeight: 600 }}>TP4</span></div>
                <div><span style={{ color: '#aaa' }}>Just CT</span> <span style={{ color: '#555' }}>(Coach CT)</span> → <span style={{ color: '#fff', fontWeight: 600 }}>TP6</span></div>
                <div><span style={{ color: '#aaa' }}>JustClub Vila Olímpia</span> → <span style={{ color: '#fff', fontWeight: 600 }}>TP3</span></div>
                <div><span style={{ color: '#aaa' }}>JustClub Pinheiros</span> → <span style={{ color: '#fff', fontWeight: 600 }}>TP3</span></div>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #1a1a1a', marginTop: '1.5rem', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 12 }}>
            <div style={{ fontSize: 12, color: '#555' }}>
              Todos os planos e detalhes de cada modalidade na página de compras.
            </div>
            <button onClick={(e) => { e.stopPropagation(); router.push('/comprar') }}
              style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem 1.75rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5, transition: 'opacity .2s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}>
              Planos →
            </button>
          </div>

        </div>
      </div>

      <div style={s.divider} />

      {/* UNIDADES — 3 cards */}
      <div id="localizacao" style={s.section}>
        <div style={s.sTag}>// onde estamos</div>
        <div style={s.sTitle}>NOSSAS UNIDADES</div>
        <div style={{ ...s.sSub, marginBottom: '2.5rem' }}>
          São Paulo · três endereços, três experiências.
        </div>

        <div className="unidades-grid-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
          {unidades.map((u: any) => {
            const dados = DADOS_UNIDADES[u.nome]
            if (!dados) return null
            const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(dados.endereco)}`
            return (
              <div key={u.id} className="unidade-card-h"
                style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>

                {/* Nome + bairro */}
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#fff', letterSpacing: 1, lineHeight: 1.1 }}>
                    {u.nome.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{dados.bairro}</div>
                </div>

                {/* Aulas oferecidas — faixa discreta */}
                <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 11, color: '#888', letterSpacing: 0.3 }}>
                  {dados.aulas}
                </div>

                {/* Endereço */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 14, flexShrink: 0 }}>📍</div>
                  <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>{dados.endereco}</div>
                </div>

                {/* Horários: fixos no CT, link de calendário nas Clubs */}
                {dados.horariosFixos ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 14, flexShrink: 0 }}>🕐</div>
                    <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>
                      {dados.horariosFixos.semana}<br />
                      {dados.horariosFixos.fds}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 14, flexShrink: 0 }}>🕐</div>
                    <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5 }}>
                      Funciona nos horários das aulas.<br />
                      <span onClick={() => router.push(`/aulas?unidade=${u.id}`)}
                        style={{ color: ACCENT, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                        Ver calendário de aulas →
                      </span>
                    </div>
                  </div>
                )}

                {/* Apps aceitos */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <span style={{ background: '#1a0f1f', border: '1px solid #2a1a35', borderRadius: 20, padding: '4px 10px', fontSize: 11, color: '#bb88dd', fontWeight: 600 }}>💜 Wellhub</span>
                  <span style={{ background: '#0a1a1f', border: '1px solid #1a2a35', borderRadius: 20, padding: '4px 10px', fontSize: 11, color: '#5ab', fontWeight: 600 }}>🔵 TotalPass</span>
                </div>

                {/* Espaçador pra empurrar botões pro fim */}
                <div style={{ flex: 1 }} />

                {/* Botão Como chegar */}
                <a href={mapsHref} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                  <button className="maps-btn" style={{ width: '100%', background: 'transparent', border: '1px solid #333', borderRadius: 10, padding: '0.7rem', color: '#aaa', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
                    📍 Como chegar
                  </button>
                </a>
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA FINAL */}
      <div style={{ ...s.section, paddingTop: '4rem', paddingBottom: '8rem', textAlign: 'center' as const }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 3.5vw, 44px)', color: '#fff', lineHeight: 1.05, marginBottom: '1rem' }}>
          PRONTO PARA TREINAR?
        </div>
        <div style={{ ...s.sSub, margin: '0 auto 2rem' }}>
          {isCliente ? 'Você já está dentro. Bora marcar seu próximo treino.' : 'Crie sua conta em menos de 1 minuto e agende seu primeiro treino.'}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/agendar')} style={s.btnPrimary}>Agendar Treino →</button>
          <button onClick={() => router.push('/comprar')} className="btn-ghost-h" style={s.btnGhost}>Ver Planos e Comprar</button>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '1rem' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#fff', letterSpacing: 2 }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div style={{ fontSize: 12, color: '#444' }}>© 2025 Just CT — Serious Training. Todos os direitos reservados.</div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {isCliente ? (
            <span onClick={() => router.push('/minha-conta')} style={{ fontSize: 12, color: ACCENT, cursor: 'pointer' }}>Minha conta</span>
          ) : isLogado ? (
            <span onClick={() => router.push('/')} style={{ fontSize: 12, color: ACCENT, cursor: 'pointer' }}>Início</span>
          ) : (
            <>
              <span onClick={() => router.push('/login')} style={{ fontSize: 12, color: '#555', cursor: 'pointer' }}>Login</span>
              <span onClick={() => router.push('/cadastro')} style={{ fontSize: 12, color: ACCENT, cursor: 'pointer' }}>Criar conta</span>
            </>
          )}
        </div>
      </footer>
    </div>
  )
}
