'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const ACCENT = '#ff2d9b'
const CYAN = '#00e5ff'

function HalterSVG({ estado }: { estado: 'livre' | 'ocupado' | 'meu' }) {
  const cor = estado === 'ocupado' ? '#333' : estado === 'meu' ? CYAN : ACCENT
  const opacity = estado === 'ocupado' ? 0.3 : 1
  return (
    <svg width="36" height="36" viewBox="0 0 48 28" style={{ opacity, flexShrink: 0 }}>
      <rect x="15" y="11.5" width="18" height="5" rx="2" fill={cor} />
      <rect x="2" y="5" width="5" height="18" rx="3" fill={cor} />
      <rect x="8" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="36" y="7.5" width="4" height="13" rx="2" fill={cor} />
      <rect x="41" y="5" width="5" height="18" rx="3" fill={cor} />
    </svg>
  )
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HORARIOS_DEMO = [
  { hora: '06:00', total: 4, ocupados: 2 },
  { hora: '07:00', total: 3, ocupados: 3 },
  { hora: '08:00', total: 5, ocupados: 1 },
  { hora: '09:00', total: 4, ocupados: 4 },
  { hora: '17:00', total: 3, ocupados: 0 },
  { hora: '18:00', total: 5, ocupados: 3 },
  { hora: '19:00', total: 4, ocupados: 2 },
]

export default function LandingPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const [diaSel, setDiaSel] = useState(0)
  const [periodo, setPeriodo] = useState<'todos' | 'manha' | 'tarde' | 'noite'>('todos')

  useEffect(() => {
    if (!loading && perfil) {
      if (perfil.role === 'admin') router.push('/admin/dashboard')
      else if (perfil.role === 'coach') router.push('/coach/painel')
      else if (perfil.role === 'coordenadora') router.push('/ju/biblioteca')
      else if (perfil.role === 'recepcao') router.push('/recepcao/agenda')
      else if (perfil.role === 'cliente') router.push('/minha-conta')
    }
  }, [perfil, loading])

  const dias = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d
  })

  const horariosFiltrados = HORARIOS_DEMO.filter(h => {
    const hr = parseInt(h.hora)
    if (periodo === 'manha') return hr < 12
    if (periodo === 'tarde') return hr >= 12 && hr < 18
    if (periodo === 'noite') return hr >= 18
    return true
  })

  const s: Record<string, any> = {
    page: { background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" },
    nav: { position: 'fixed' as const, top: 0, left: 0, right: 0, zIndex: 50, padding: '0 2rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#08080895', backdropFilter: 'blur(16px)', borderBottom: '1px solid #1a1a1a' },
    logo: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: '#fff', letterSpacing: 2 },
    navLinks: { display: 'flex', gap: '2rem', alignItems: 'center' },
    navLink: { color: '#555', fontSize: 13, fontWeight: 500, cursor: 'pointer', textDecoration: 'none', transition: 'color .2s' },
    navCta: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '0.45rem 1.25rem', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
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
        .nav-link-h:hover { color: ${ACCENT} !important; }
        .btn-ghost-h:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        .plano-card-h { transition: all .25s; }
        .plano-card-h:hover { border-color: ${ACCENT} !important; transform: translateY(-4px); }
        .dia-btn-h { transition: all .2s; cursor: pointer; }
        .dia-btn-h:hover { border-color: ${ACCENT} !important; }
        .slot-row-h { transition: all .2s; }
        .slot-row-h:hover { border-color: ${ACCENT} !important; background: #ff2d9b08 !important; cursor: pointer; }
        .periodo-btn-h { transition: all .15s; cursor: pointer; }
        .feature-h { transition: all .2s; }
        .feature-h:hover { border-color: ${ACCENT} !important; }
        @media (max-width: 768px) {
          .nav-links-d { display: none !important; }
          .hero-title-r { font-size: 36px !important; }
          .stats-r { gap: 1.5rem !important; }
          .grid3-r { grid-template-columns: 1fr !important; }
          .grid2-r { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* NAV */}
      <nav style={s.nav}>
        <div style={s.logo}>JUST<span style={{ color: ACCENT }}>CT</span></div>
        <div className="nav-links-d" style={s.navLinks}>
          <a href="#coach-ct" className="nav-link-h" style={s.navLink}>Coach CT</a>
          <a href="#planos" className="nav-link-h" style={s.navLink}>Planos</a>
          <a href="#agenda" className="nav-link-h" style={s.navLink}>Agenda</a>
          <a href="#localizacao" className="nav-link-h" style={s.navLink}>Localização</a>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => router.push('/login')} className="nav-link-h"
            style={{ ...s.navLink, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Entrar
          </button>
          <button onClick={() => router.push('/cadastro')} style={s.navCta}>Agendar agora</button>
        </div>
      </nav>

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
            <button onClick={() => router.push('/cadastro')} style={s.btnPrimary}>Agendar Coach CT →</button>
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

        {/* ✅ Texto explicativo */}
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

      {/* PLANOS */}
      <div id="planos" style={s.section}>
        <div style={s.sTag}>// musculação livre</div>
        <div style={s.sTitle}>ESCOLHA SEU PLANO</div>
        <div style={{ ...s.sSub, marginBottom: '3rem' }}>Acesso ao espaço de musculação equipado e ambiente premium.</div>
        <div className="grid3-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          {[
            { nome: 'Diária', preco: 'R$ 64', cents: ',90', periodo: 'por visita', desc: 'Acesso único sem compromisso. Coach CT avulso disponível por R$ 79,90.', destaque: false },
            { nome: 'Mensal', preco: 'R$ 199', cents: ',90', periodo: 'por mês', desc: 'Acesso ilimitado à musculação. Coach CT com desconto especial para mensalistas.', destaque: true },
            { nome: 'Wellhub / TotalPass', preco: 'Check-in', cents: '', periodo: 'pelo app', desc: 'Diamond e TP6 já incluem acesso e sessões Coach CT. Mais fácil impossível.', destaque: false },
          ].map((p, i) => (
            <div key={i} className="plano-card-h" style={{ background: '#111', border: `1px solid ${p.destaque ? ACCENT : '#222'}`, borderRadius: 16, padding: '2rem', position: 'relative', overflow: 'hidden' }}>
              {p.destaque && <div style={{ position: 'absolute', top: 12, right: -16, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.25rem 2.5rem', transform: 'rotate(15deg)', letterSpacing: 1 }}>MAIS POPULAR</div>}
              <div style={{ fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: 2, color: '#555', marginBottom: '0.5rem' }}>{p.nome}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: '#fff', lineHeight: 1 }}>
                {p.preco}<span style={{ fontSize: 24 }}>{p.cents}</span>
              </div>
              <div style={{ fontSize: 12, color: '#555', marginBottom: '1rem' }}>{p.periodo}</div>
              <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.divider} />

      {/* AGENDA DEMO */}
      <div id="agenda" style={{ ...s.section, paddingBottom: '8rem' }}>
        <div style={s.sTag}>// agende agora</div>
        <div style={s.sTitle}>ESCOLHA SEU<br />HORÁRIO</div>
        <div style={{ ...s.sSub, marginBottom: '3rem' }}>Veja as vagas disponíveis e reserve seu Coach CT. Cada halter representa uma vaga.</div>

        <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: 10, paddingBottom: 8 }}>
            {dias.map((d, i) => {
              const isHoje = i === 0
              const isSel = i === diaSel
              return (
                <div key={i} className="dia-btn-h" onClick={() => setDiaSel(i)}
                  style={{ flexShrink: 0, width: 72, padding: '0.75rem 0.5rem', borderRadius: 10, border: `1.5px solid ${isSel ? ACCENT : '#222'}`, background: isSel ? `${ACCENT}15` : 'transparent', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 2, color: isSel ? ACCENT : '#555', fontWeight: 600, marginBottom: 4 }}>
                    {isHoje ? 'HOJE' : DIAS_SEMANA[d.getDay()]}
                  </div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: isSel ? '#fff' : '#888', lineHeight: 1 }}>{d.getDate()}</div>
                  <div style={{ fontSize: 10, color: isSel ? ACCENT : '#444', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                    {d.toLocaleDateString('pt-BR', { month: 'short' })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' as const }}>
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'manha', label: '🌅 Manhã' },
            { key: 'tarde', label: '☀️ Tarde' },
            { key: 'noite', label: '🌙 Noite' },
          ].map(p => (
            <button key={p.key} className="periodo-btn-h" onClick={() => setPeriodo(p.key as any)}
              style={{ padding: '0.35rem 1rem', borderRadius: 20, border: `1px solid ${periodo === p.key ? ACCENT : '#333'}`, background: periodo === p.key ? `${ACCENT}20` : 'transparent', color: periodo === p.key ? ACCENT : '#555', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ maxWidth: 700 }}>
          {horariosFiltrados.map((h, i) => {
            const livres = h.total - h.ocupados
            const lotado = livres === 0
            return (
              <div key={i} className="slot-row-h" onClick={() => router.push('/cadastro')}
                style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1rem 1.25rem', borderRadius: 12, border: '1px solid #222', background: '#111', marginBottom: 8, opacity: lotado ? 0.5 : 1 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 500, color: '#fff', width: 58, flexShrink: 0 }}>{h.hora}</div>
                <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center', flexWrap: 'wrap' as const }}>
                  {Array.from({ length: h.total }).map((_, vi) => (
                    <HalterSVG key={vi} estado={vi < h.ocupados ? 'ocupado' : 'livre'} />
                  ))}
                </div>
                <div style={{ flexShrink: 0, minWidth: 80, textAlign: 'right' as const }}>
                  <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: lotado ? '#ff4444' : livres <= 2 ? '#ffaa00' : ACCENT, fontWeight: 600 }}>
                    {lotado ? 'LOTADO' : livres === 1 ? '1 VAGA' : `${livres} VAGAS`}
                  </div>
                  {!lotado && (
                    <button onClick={e => { e.stopPropagation(); router.push('/cadastro') }}
                      style={{ marginTop: 4, background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                      Reservar
                    </button>
                  )}
                  {lotado && (
                    <button onClick={e => { e.stopPropagation(); router.push('/cadastro') }}
                      style={{ marginTop: 4, background: 'transparent', color: '#ffaa00', border: '1px solid #ffaa00', borderRadius: 6, padding: '0.3rem 0.75rem', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                      Fila
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <div style={{ textAlign: 'center' as const, marginTop: '2rem' }}>
            <button onClick={() => router.push('/cadastro')} style={s.btnPrimary}>
              Criar conta e reservar →
            </button>
          </div>
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
              { icon: '🕐', title: 'Horários', desc: 'Segunda a domingo, das 05:30 às 21:00' },
              { icon: '🚇', title: 'Como chegar', desc: 'Próximo à estação Vila Olímpia do Metrô' },
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
          </div>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, overflow: 'hidden', aspectRatio: '4/3' }}>
            <iframe
              src="https://maps.google.com/maps?q=Rua+Fiandeiras+392+Vila+Olimpia+Sao+Paulo&output=embed"
              width="100%" height="100%" style={{ border: 'none' }} loading="lazy"
            />
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '1rem' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#fff', letterSpacing: 2 }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div style={{ fontSize: 12, color: '#444' }}>© 2025 Just CT — Serious Training. Todos os direitos reservados.</div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <span onClick={() => router.push('/login')} style={{ fontSize: 12, color: '#555', cursor: 'pointer' }}>Entrar</span>
          <span onClick={() => router.push('/cadastro')} style={{ fontSize: 12, color: ACCENT, cursor: 'pointer' }}>Criar conta</span>
        </div>
      </footer>
    </div>
  )
}
