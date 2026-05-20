'use client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import SiteHeader from '@/components/SiteHeader'

const ACCENT = '#ff2d9b'

export default function LandingPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()

  const isCliente = perfil?.role === 'cliente'
  const isLogado = !!perfil

  const s: Record<string, any> = {
    page: { background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" },
    section: { padding: '6rem 2.5rem', maxWidth: 1100, margin: '0 auto' },
    sTag: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' },
    sTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 3.5vw, 48px)', color: '#fff', lineHeight: 1.05, marginBottom: '1rem' },
    sSub: { color: '#666', fontSize: 16, maxWidth: 560, lineHeight: 1.7 },
    divider: { borderTop: '1px solid #1a1a1a' },
    btnPrimary: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.9rem 2rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
    btnGhost: { background: 'transparent', color: '#f0f0f0', border: '1.5px solid #333', borderRadius: 8, padding: '0.9rem 2rem', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
    btnComprarCard: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '0.75rem 1.25rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', marginTop: '1.25rem', transition: 'opacity .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
    btnComprarCardGhost: { background: 'transparent', color: ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 8, padding: '0.75rem 1.25rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", width: '100%', marginTop: '1.25rem', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
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
        .plano-card-h { transition: all .25s; }
        .plano-card-h:hover { border-color: ${ACCENT} !important; transform: translateY(-4px); }
        .feature-h { transition: all .2s; }
        .feature-h:hover { border-color: ${ACCENT} !important; }
        .maps-btn:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .btn-comprar-card-h:hover { opacity: 0.85; }
        .btn-comprar-card-ghost-h:hover { background: ${ACCENT} !important; color: #fff !important; }
        .pro-card-h { transition: all .25s; }
        .pro-card-h:hover { border-color: ${ACCENT} !important; transform: translateY(-4px); }
        .pro-cta-h:hover { opacity: 0.85; }
        .pro-cta-ghost-h:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        @media (max-width: 768px) {
          .nav-links-d { display: none !important; }
          .hero-title-r { font-size: 36px !important; }
          .stats-r { gap: 1.5rem !important; }
          .grid3-r { grid-template-columns: 1fr !important; }
          .grid2-r { grid-template-columns: 1fr !important; }
          .pro-grid-r { grid-template-columns: 1fr !important; }
          .pro-hero-r { grid-template-columns: 1fr !important; }
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

      {/* COACH CT */}
      <div id="coach-ct" style={s.section}>
        <div style={s.sTag}>// o diferencial</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${ACCENT}15`, border: `1px solid ${ACCENT}30`, borderRadius: 20, padding: '0.35rem 1rem', fontSize: 12, color: ACCENT, fontWeight: 600, marginBottom: '1.5rem' }}>
          ⚡ COACH CT
        </div>
        <div style={s.sTitle}>PERSONAL QUANDO VOCÊ QUISER</div>
        <div style={{ fontSize: 16, color: '#888', maxWidth: 680, lineHeight: 1.8, marginBottom: '3rem' }}>
          Agende um horário e, ao chegar no CT, um dos nossos Coaches irá te acompanhar em formato personal — sim, 1×1.
          Escolha um dos grupos musculares que ele lhe oferecer. Ah, e um detalhe:{' '}
          <strong style={{ color: '#fff' }}>todos os treinos do Coach CT são montados pela nossa coordenadora Ju Hitomi</strong>,
          então fiquem tranquilos que será intenso. Os treinos possuem até 1h de duração, e você sentirá a real diferença
          de treinar com alguém dedicado 100% a você.
        </div>
        <div className="grid3-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          {[
            { icon: '📅', title: 'Agendamento flexível', desc: 'Escolha o dia e horário que encaixam na sua rotina. Sem mensalidade de personal, sem compromisso fixo.' },
            { icon: '🎯', title: '1×1 de verdade', desc: 'Um coach. Um aluno. Atenção total durante toda a sessão — sem divisão de atenção.' },
            { icon: '📲', title: 'Wellhub e TotalPass', desc: 'Wellhub Diamond e TotalPass TP6 têm direito a sessões Coach CT com check-in pelo app. Sem custo extra.' },
          ].map((f, i) => (
            <div key={i} className="feature-h" style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
              <div style={{ width: 40, height: 40, background: `${ACCENT}15`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: '1rem' }}>{f.icon}</div>
              <div style={{ fontWeight: 600, color: '#fff', marginBottom: '0.5rem', fontSize: 15 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.divider} />

      {/* COACH CT PRO */}
      <div id="coach-ct-pro" style={{ ...s.section, paddingBottom: '4rem' }}>

        {/* Frase de abertura */}
        <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>
          // próximo nível
        </div>
        <div style={{ fontSize: 'clamp(14px, 1.5vw, 18px)', color: '#666', fontStyle: 'italic', marginBottom: '1rem', maxWidth: 600, lineHeight: 1.6 }}>
          "Existe o padrão. E existe o que poucos acessam."
        </div>

        {/* Headline */}
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(48px, 6vw, 80px)', color: '#fff', lineHeight: 1, marginBottom: '3rem', letterSpacing: 2 }}>
          COACH CT <span style={{ color: ACCENT }}>PRO</span>
        </div>

        {/* Hero — foto + texto */}
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
            <img src="/pro-hero.jpg" alt="Coach CT Pro" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #080808cc 0%, transparent 50%)' }} />
          </div>
        </div>

        {/* Cards de benefícios */}
        <div className="pro-grid-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>

          {/* Card Ju Hitomi */}
          <div className="pro-card-h" style={{ background: `linear-gradient(135deg, #1a0010 0%, #0d0008 100%)`, border: `1.5px solid ${ACCENT}44`, borderRadius: 16, padding: '1.5rem', position: 'relative' as const, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, left: 0, height: 120, overflow: 'hidden' }}>
              <img src="/ju-pro.jpg" alt="Ju Hitomi" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', opacity: 0.4 }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, #1a0010 100%)' }} />
            </div>
            <div style={{ position: 'relative', paddingTop: 80 }}>
              <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 6, fontFamily: "'DM Mono', monospace" }}>by</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 1, lineHeight: 1.1, marginBottom: 8 }}>JU HITOMI</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6 }}>Todos os treinos do Coach CT Pro são elaborados por ela. Intensidade e método — garantidos.</div>
            </div>
          </div>

          {/* Card 14 dias */}
          <div className="pro-card-h" style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: ACCENT, lineHeight: 1, marginBottom: 4 }}>14</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>DIAS DE JANELA</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>Agende com até 2 semanas de antecedência. Wellhub e TotalPass ficam com 7. Você escolhe primeiro.</div>
          </div>

          {/* Card escolha do coach */}
          <div className="pro-card-h" style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: ACCENT, lineHeight: 1, marginBottom: 4 }}>1×1</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>ESCOLHA DO COACH</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>Escolha o coach que vai te acompanhar no momento do agendamento. Sem surpresa na chegada.</div>
          </div>

          {/* Card 3x semana */}
          <div className="pro-card-h" style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: ACCENT, lineHeight: 1, marginBottom: 4 }}>3×</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>POR SEMANA</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>Diamond treina 2x. TP6 treina 2,5x. Pro treina 3x. A frequência que realmente transforma.</div>
          </div>

        </div>
      </div>

      <div style={s.divider} />

      {/* ESPAÇO */}
      <div id="espaco" style={{ ...s.section, paddingBottom: '4rem' }}>
        <div style={s.sTag}>// musculação livre</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 4vw, 52px)', color: '#fff', lineHeight: 1.05, marginBottom: '1rem' }}>
          QUER TREINAR SOZINHO?<br />SEM PROBLEMAS.
        </div>
        <div style={{ fontSize: 16, color: '#666', maxWidth: 600, lineHeight: 1.7, marginBottom: '2.5rem' }}>
          Olha as máquinas que te esperam. Equipamentos premium, ambiente inspirador e espaço de sobra para você treinar no seu ritmo.
        </div>
        <div className="grid2-r" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '3rem' }}>
          <div style={{ borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9' }}>
            <img src="/foto capa CT.jpg" alt="Leg Zone Just CT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ borderRadius: 16, overflow: 'hidden', aspectRatio: '16/9' }}>
            <img src="/Imagem Treino Sala CT.jpg" alt="Sala Just CT" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>
        <div className="grid3-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontSize: 28, marginBottom: '1rem' }}>🏋️</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: '0.75rem', letterSpacing: 1 }}>EQUIPAMENTOS PREMIUM</div>
            <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>Máquinas de última geração, halteres completos e espaço planejado para o seu melhor desempenho. A Leg Zone é só um dos destaques.</div>
          </div>
          <div style={{ background: '#111', border: `1px solid ${ACCENT}`, borderRadius: 16, padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, background: ACCENT, fontSize: 10, fontWeight: 700, padding: '0.2rem 1rem', letterSpacing: 1, color: '#fff' }}>ACEITO AQUI</div>
            <div style={{ fontSize: 28, marginBottom: '1rem' }}>📲</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: '0.75rem', letterSpacing: 1 }}>WELLHUB & TOTALPASS</div>
            <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
              <strong style={{ color: '#fff' }}>Wellhub Gold+</strong> e superiores e <strong style={{ color: '#fff' }}>TotalPass TP4</strong> e superiores têm acesso liberado à musculação. Check-in direto pelo app na recepção.
            </div>
          </div>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontSize: 28, marginBottom: '1rem' }}>✨</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', marginBottom: '0.75rem', letterSpacing: 1 }}>O AMBIENTE INSPIRA</div>
            <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>De Vila Olímpia para o mundo. Um espaço pensado nos mínimos detalhes — da iluminação aos grafites — para você querer voltar sempre.</div>
          </div>
        </div>
      </div>

      <div style={s.divider} />

      {/* PLANOS */}
      <div id="planos" style={s.section}>
        <div style={s.sTag}>// planos</div>
        <div style={s.sTitle}>ESCOLHA SEU PLANO</div>
        <div style={{ ...s.sSub, marginBottom: '1rem' }}>Acesso ilimitado ao espaço de musculação premium em Vila Olímpia.</div>
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '3rem', display: 'flex', flexWrap: 'wrap' as const, gap: '1.5rem' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' as const }}>Wellhub</div>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
              <span style={{ color: '#fff', fontWeight: 600 }}>Gold+</span> e superiores → Musculação livre<br />
              <span style={{ color: '#fff', fontWeight: 600 }}>Diamond</span> → Musculação livre + sessões Coach CT
            </div>
          </div>
          <div style={{ width: 1, background: '#222', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' as const }}>TotalPass</div>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
              <span style={{ color: '#fff', fontWeight: 600 }}>TP4</span> e superiores → Musculação livre<br />
              <span style={{ color: '#fff', fontWeight: 600 }}>TP6</span> → Musculação livre + sessões Coach CT
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#555', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>Acesso ao espaço</div>
        <div className="grid3-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
          {[
            { nome: 'Mensal', preco: 'R$ 499', cents: ',00', periodo: '/mês · 2 meses fidelidade', desc: 'Acesso ilimitado ao CT. Cobrança automática todo mês. Cancelamento com 30 dias de antecedência.', destaque: false, comprar: false },
            { nome: 'Semestral', preco: 'R$ 399', cents: ',00', periodo: '/mês · 6x R$399', desc: 'Plano ilimitado por 6 meses. Válido somente para o titular. Não permite cancelamento após uso ou 7 dias da compra.', destaque: true, comprar: true, slug: 'semestral' },
            { nome: 'Anual', preco: 'R$ 349', cents: ',00', periodo: '/mês · média (total R$4.188)', desc: 'Plano ilimitado por 12 meses. Melhor custo-benefício. Não permite cancelamento após uso ou 7 dias da compra.', destaque: false, comprar: true, slug: 'anual' },
          ].map((p, i) => (
            <div key={i} className="plano-card-h" style={{ background: '#111', border: `1px solid ${p.destaque ? ACCENT : '#222'}`, borderRadius: 16, padding: '2rem', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {p.destaque && <div style={{ position: 'absolute', top: 12, right: -16, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.25rem 2.5rem', transform: 'rotate(15deg)', letterSpacing: 1 }}>MAIS POPULAR</div>}
              <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#555', marginBottom: '0.5rem' }}>{p.nome}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
                {p.preco}<span style={{ fontSize: 24 }}>{p.cents}</span>
              </div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: '1rem' }}>{p.periodo}</div>
              <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6, flex: 1 }}>{p.desc}</div>
              {p.comprar ? (
                <button onClick={() => router.push(`/comprar?produto=${p.slug}`)} className={p.destaque ? 'btn-comprar-card-h' : 'btn-comprar-card-ghost-h'} style={p.destaque ? s.btnComprarCard : s.btnComprarCardGhost}>
                  Comprar agora →
                </button>
              ) : (
                <div style={{ marginTop: '1.25rem', padding: '0.75rem', textAlign: 'center', color: '#444', fontSize: 12, border: '1px dashed #222', borderRadius: 8 }}>
                  Em breve · contrate na recepção
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#555', marginBottom: '1rem', fontFamily: "'DM Mono', monospace" }}>Créditos avulsos</div>
        <div className="grid2-r" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {[
            { nome: 'Coach CT', preco: 'R$ 79', cents: ',90', periodo: '/treino · válido 30 dias', desc: 'Crédito exclusivo para agendamento do Coach CT. Necessário ter acesso ao CT via plano ou app parceiro.', destaque: true, slug: 'coach-ct-avulso' },
            { nome: 'Treino Avulso', preco: 'R$ 64', cents: ',90', periodo: '/treino · válido 30 dias', desc: 'Acesso único ao espaço de musculação. Não inclui acompanhamento de coach.', destaque: false, slug: 'diaria-avulsa' },
          ].map((p, i) => (
            <div key={i} className="plano-card-h" style={{ background: '#111', border: `1px solid ${p.destaque ? ACCENT : '#222'}`, borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#555', marginBottom: '0.5rem' }}>{p.nome}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
                {p.preco}<span style={{ fontSize: 24 }}>{p.cents}</span>
              </div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: '1rem' }}>{p.periodo}</div>
              <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6, flex: 1 }}>{p.desc}</div>
              <button onClick={() => router.push(`/comprar?produto=${p.slug}`)} className={p.destaque ? 'btn-comprar-card-h' : 'btn-comprar-card-ghost-h'} style={p.destaque ? s.btnComprarCard : s.btnComprarCardGhost}>
                Comprar agora →
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={s.divider} />

      {/* LOCALIZAÇÃO */}
      <div id="localizacao" style={s.section}>
        <div style={s.sTag}>// onde estamos</div>
        <div style={s.sTitle}>VILA OLÍMPIA<br />SÃO PAULO</div>
        <div className="grid2-r" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', marginTop: '2rem', alignItems: 'start' }}>
          <div>
            {[
              { icon: '📍', title: 'Endereço', desc: 'Rua Fiandeiras, 392 — Vila Olímpia, São Paulo' },
              { icon: '🕐', title: 'Seg a Sex', desc: '05:30 às 21:00' },
              { icon: '🕐', title: 'Sáb, Dom e Feriados', desc: '08:00 às 13:00' },
              { icon: '📲', title: 'Wellhub e TotalPass', desc: 'Faça check-in pelo app parceiro na recepção' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ width: 40, height: 40, background: `${ACCENT}15`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{item.icon}</div>
                <div>
                  <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4, fontSize: 15 }}>{item.title}</div>
                  <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </div>
            ))}
            <a href="https://maps.google.com/?q=Rua+Fiandeiras+392+Vila+Olimpia+Sao+Paulo" target="_blank" rel="noopener noreferrer">
              <button className="maps-btn" style={{ marginTop: '0.5rem', background: 'transparent', border: '1px solid #333', borderRadius: 8, padding: '0.6rem 1.25rem', color: '#888', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 8 }}>
                📍 Abrir no Google Maps →
              </button>
            </a>
          </div>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, overflow: 'hidden', aspectRatio: '4/3' }}>
            <iframe
              src="https://maps.google.com/maps?q=Rua+Fiandeiras+392+Vila+Olimpia+Sao+Paulo&output=embed"
              width="100%" height="100%" style={{ border: 'none' }} loading="lazy"
            />
          </div>
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
