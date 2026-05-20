'use client'
import { useRouter } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'

const ACCENT = '#ff2d9b'

export default function CoachCtProPage() {
  const router = useRouter()

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .beneficio-card:hover { border-color: ${ACCENT} !important; }
        .faq-item:hover { border-color: #333 !important; }
        .btn-pro-h:hover { opacity: 0.85; }
        .btn-ghost-pro-h:hover { border-color: ${ACCENT} !important; color: ${ACCENT} !important; }
        @media (max-width: 768px) {
          .hero-grid-r { grid-template-columns: 1fr !important; }
          .beneficios-grid-r { grid-template-columns: 1fr !important; }
          .comparativo-grid-r { grid-template-columns: 1fr !important; }
          .precos-grid-r { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <SiteHeader />

      {/* ─── 1. HERO ─── */}
      <div style={{ position: 'relative', paddingTop: 64, minHeight: '90vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/hero.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #080808f0 55%, #08080860 100%)', zIndex: 1 }} />
        <div style={{ position: 'relative', zIndex: 2, padding: '6rem 2.5rem', maxWidth: 1100, margin: '0 auto', width: '100%' }}>

          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1.5rem' }}>
            // coach ct · nível seguinte
          </div>

          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(56px, 8vw, 110px)', color: '#fff', lineHeight: 0.95, marginBottom: '1.5rem', letterSpacing: 2 }}>
            COACH CT<br /><span style={{ color: ACCENT }}>PRO</span>
          </div>

          <div style={{ fontSize: 'clamp(16px, 1.8vw, 22px)', color: '#aaa', fontStyle: 'italic', marginBottom: '2rem', maxWidth: 560, lineHeight: 1.6 }}>
            "Se o atual já parece luxo, isso aqui é praticamente irresponsável."
          </div>

          <div style={{ fontSize: 16, color: '#777', maxWidth: 520, lineHeight: 1.8, marginBottom: '3rem' }}>
            Feito para quem treina a sério. Não é o mais barato — e não foi feito pra ser.
            É o plano de quem já entendeu que <strong style={{ color: '#fff' }}>frequência, consistência e método</strong> não são opcionais.
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/comprar')}
              className="btn-pro-h"
              style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '1rem 2.5rem', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'opacity .2s' }}>
              Quero o Pro →
            </button>
            <button onClick={() => router.push('/agendar')}
              className="btn-ghost-pro-h"
              style={{ background: 'transparent', color: '#aaa', border: '1.5px solid #444', borderRadius: 8, padding: '1rem 2rem', fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
              Ver a grade →
            </button>
          </div>
        </div>
      </div>

      {/* ─── 2. FAIXA JU HITOMI ─── */}
      <div style={{ position: 'relative', overflow: 'hidden', borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/foto capa CT.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 30%', zIndex: 0 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #080808f5 50%, #08080844 100%)', zIndex: 1 }} />
        <div style={{ position: 'relative', zIndex: 2, padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>
              // quem está por trás
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(36px, 5vw, 64px)', color: '#fff', lineHeight: 1, marginBottom: '1.5rem', letterSpacing: 2 }}>
              TREINOS BY<br /><span style={{ color: ACCENT }}>JU HITOMI</span>
            </div>
            <div style={{ fontSize: 16, color: '#888', lineHeight: 1.9, marginBottom: '1.5rem' }}>
              Todos os protocolos do Coach CT Pro são criados e atualizados mensalmente pela Ju.
              Não é uma planilha genérica — é metodologia desenvolvida para quem frequenta o CT de verdade,
              com progressão real e grupos musculares que se complementam ao longo do mês.
            </div>
            <div style={{ fontSize: 15, color: '#666', lineHeight: 1.7, fontStyle: 'italic' }}>
              "Intensidade não é opcional. Método também não."
            </div>
          </div>
        </div>
      </div>

      {/* ─── 3. BENEFÍCIOS DETALHADOS ─── */}
      <div style={{ padding: '6rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>
          // o que muda de verdade
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 4vw, 52px)', color: '#fff', lineHeight: 1.05, marginBottom: '0.75rem' }}>
          TUDO QUE O PADRÃO<br />NÃO ENTREGA
        </div>
        <div style={{ fontSize: 16, color: '#555', maxWidth: 560, lineHeight: 1.7, marginBottom: '4rem' }}>
          Não estamos dizendo que o outro é comum. Esse aqui que exagerou mesmo.
        </div>

        <div className="beneficios-grid-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
          {[
            {
              num: '01',
              titulo: '14 DIAS DE JANELA',
              sub: 'Você agenda antes de todo mundo.',
              desc: 'Clientes Wellhub e TotalPass têm 7 dias para agendar. Você tem 14. Isso significa que enquanto eles ainda estão tentando encaixar um horário, você já está com o treino confirmado para a semana que vem — com o coach que escolheu.',
            },
            {
              num: '02',
              titulo: 'ESCOLHA DO COACH',
              sub: 'Sem surpresa na chegada.',
              desc: 'No Coach CT padrão, o coach é definido na recepção. No Pro, você escolhe no momento do agendamento. Construir afinidade com o coach muda completamente a qualidade do treino — e você merece ter esse controle.',
            },
            {
              num: '03',
              titulo: '3 TREINOS POR SEMANA',
              sub: 'A frequência que transforma.',
              desc: 'Wellhub Diamond chega a 2 treinos por semana. TotalPass TP6 a 2,5. O Coach CT Pro entrega 3 — com créditos suficientes para você não falhar nenhuma semana do semestre. Frequência é o único ingrediente que não tem substituto.',
            },
            {
              num: '04',
              titulo: 'OPEN GYM INCLUÍDO',
              sub: 'Acesso ao CT além das sessões.',
              desc: 'Além das sessões com coach, o plano inclui acesso ao espaço de musculação. Você treina com acompanhamento 3x por semana e ainda pode usar o CT nos outros dias no seu ritmo. Tudo no mesmo plano.',
            },
            {
              num: '05',
              titulo: 'CANCELAMENTO ATÉ 3H',
              sub: 'Flexibilidade de verdade.',
              desc: 'Imprevisto acontece. No Coach CT Pro você pode cancelar com até 3 horas de antecedência sem perder o crédito. Seu ritmo de vida não precisa ser perfeito — o plano se adapta.',
            },
            {
              num: '06',
              titulo: 'CRÉDITOS CUMULATIVOS',
              sub: 'O que não usou não perde.',
              desc: 'Diferente dos planos mensais dos apps parceiros, seus créditos Pro não expiram com a virada do mês. O saldo acumula ao longo de todo o semestre ou trimestre — sem pressão, sem desperdício.',
            },
          ].map((b, i) => (
            <div key={i} className="beneficio-card"
              style={{ background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 16, padding: '2rem', transition: 'border-color .2s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, color: `${ACCENT}33`, lineHeight: 1, flexShrink: 0, letterSpacing: 1 }}>{b.num}</div>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 1, marginBottom: 4 }}>{b.titulo}</div>
                  <div style={{ fontSize: 13, color: ACCENT, fontWeight: 600, marginBottom: 12 }}>{b.sub}</div>
                  <div style={{ fontSize: 14, color: '#666', lineHeight: 1.8 }}>{b.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 4. COMPARATIVO ─── */}
      <div style={{ background: '#050505', borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a', padding: '6rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>
            // lado a lado
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 4vw, 52px)', color: '#fff', lineHeight: 1.05, marginBottom: '0.75rem' }}>
            VOCÊ VS O RESTO
          </div>
          <div style={{ fontSize: 16, color: '#555', marginBottom: '4rem', lineHeight: 1.6 }}>
            Há uma diferença entre ter acesso… e ter prioridade.
          </div>

          <div className="comparativo-grid-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            {[
              {
                label: 'Wellhub Diamond',
                cor: '#9b59b6',
                icon: '💜',
                items: [
                  { label: 'Sessões/semana', val: '2×', destaque: false },
                  { label: 'Janela de agendamento', val: '7 dias', destaque: false },
                  { label: 'Escolha do coach', val: '✗', negativo: true },
                  { label: 'Créditos cumulativos', val: '✗', negativo: true },
                  { label: 'Open Gym', val: '✓', destaque: false },
                ],
              },
              {
                label: 'TotalPass TP6',
                cor: '#2980b9',
                icon: '🔵',
                items: [
                  { label: 'Sessões/semana', val: '2,5×', destaque: false },
                  { label: 'Janela de agendamento', val: '7 dias', destaque: false },
                  { label: 'Escolha do coach', val: '✗', negativo: true },
                  { label: 'Créditos cumulativos', val: '✗', negativo: true },
                  { label: 'Open Gym', val: '✓', destaque: false },
                ],
              },
              {
                label: 'Coach CT Pro',
                cor: ACCENT,
                icon: '🏆',
                destaque: true,
                items: [
                  { label: 'Sessões/semana', val: '3×', destaque: true },
                  { label: 'Janela de agendamento', val: '14 dias', destaque: true },
                  { label: 'Escolha do coach', val: '✓', destaque: true },
                  { label: 'Créditos cumulativos', val: '✓', destaque: true },
                  { label: 'Open Gym', val: '✓', destaque: true },
                ],
              },
            ].map((col, i) => (
              <div key={i} style={{
                background: col.destaque ? `linear-gradient(135deg, #1a0010 0%, #0d0008 100%)` : '#0f0f0f',
                border: `1.5px solid ${col.destaque ? col.cor : '#1e1e1e'}`,
                borderRadius: 16,
                padding: '2rem',
                position: 'relative' as const,
                overflow: 'hidden',
              }}>
                {col.destaque && (
                  <div style={{ position: 'absolute', top: 16, right: -30, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.25rem 3rem', transform: 'rotate(38deg)', letterSpacing: 1.5, fontFamily: "'DM Mono', monospace" }}>
                    VOCÊ
                  </div>
                )}
                <div style={{ fontSize: 22, marginBottom: 8 }}>{col.icon}</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: col.destaque ? '#fff' : '#888', letterSpacing: 1, marginBottom: '1.5rem' }}>{col.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {col.items.map((item, j) => (
                    <div key={j} style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: '1rem' }}>
                      <div style={{ fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: item.negativo ? '#333' : item.destaque ? ACCENT : '#fff', letterSpacing: 1 }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── 5. PREÇOS E CTA ─── */}
      <div style={{ padding: '6rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>
          // escolha seu plano
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 4vw, 52px)', color: '#fff', lineHeight: 1.05, marginBottom: '0.75rem' }}>
          O UPGRADE COMEÇA<br />QUANDO O "JÁ ESTÁ ÓTIMO"<br />DEIXA DE SER SUFICIENTE
        </div>
        <div style={{ fontSize: 16, color: '#555', marginBottom: '4rem', lineHeight: 1.6, maxWidth: 560 }}>
          Dois formatos. Nenhum deles é pra todo mundo — e isso é exatamente o ponto.
        </div>

        <div className="precos-grid-r" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
          {[
            {
              tag: 'OFERTA LANÇAMENTO',
              nome: 'SEMESTRAL',
              sub: 'Fundador',
              riscado: 'R$ 1.199/mês',
              mensal: 'R$ 999',
              total: 'R$ 5.994 em 6x',
              creditos: '72 sessões · 6 meses',
              destaque: true,
              vagas: '20 vagas',
            },
            {
              tag: null,
              nome: 'TRIMESTRAL',
              sub: null,
              riscado: null,
              mensal: 'R$ 1.499',
              total: 'R$ 4.497 em 3x',
              creditos: '36 sessões · 3 meses',
              destaque: false,
              vagas: null,
            },
          ].map((p, i) => (
            <div key={i} style={{
              background: p.destaque ? `linear-gradient(135deg, #1a0010 0%, #0d0008 100%)` : '#0f0f0f',
              border: `1.5px solid ${p.destaque ? ACCENT : '#222'}`,
              borderRadius: 20,
              padding: '2.5rem',
              position: 'relative' as const,
              overflow: 'hidden',
            }}>
              {p.tag && (
                <div style={{ position: 'absolute', top: 20, right: -36, background: ACCENT, color: '#fff', fontSize: 10, fontWeight: 700, padding: '0.3rem 3.5rem', transform: 'rotate(38deg)', letterSpacing: 1.5, fontFamily: "'DM Mono', monospace" }}>
                  {p.tag}
                </div>
              )}
              <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>
                coach ct pro
              </div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: '#fff', letterSpacing: 2, lineHeight: 1, marginBottom: p.sub ? 4 : 16 }}>
                {p.nome}
              </div>
              {p.sub && (
                <div style={{ fontSize: 12, color: '#555', marginBottom: 16, fontStyle: 'italic' }}>{p.sub}</div>
              )}
              {p.riscado && (
                <div style={{ fontSize: 14, color: '#444', textDecoration: 'line-through', marginBottom: 6 }}>{p.riscado}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, color: '#fff', lineHeight: 1 }}>{p.mensal}</div>
                <div style={{ fontSize: 16, color: '#666' }}>/mês</div>
              </div>
              <div style={{ fontSize: 13, color: '#555', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>{p.total}</div>
              <div style={{ fontSize: 13, color: '#888', marginBottom: p.vagas ? 8 : 24 }}>{p.creditos}</div>
              {p.vagas && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 20, padding: '0.3rem 0.85rem', fontSize: 11, color: ACCENT, fontWeight: 600, marginBottom: 24 }}>
                  ⚡ {p.vagas} — oferta limitada
                </div>
              )}
              <button onClick={() => router.push('/comprar')} className="btn-pro-h"
                style={{ width: '100%', background: p.destaque ? ACCENT : 'transparent', color: p.destaque ? '#fff' : ACCENT, border: p.destaque ? 'none' : `1.5px solid ${ACCENT}`, borderRadius: 10, padding: '1rem', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'opacity .2s', letterSpacing: 0.5 }}>
                COMPRAR AGORA →
              </button>
            </div>
          ))}
        </div>

        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: '1.25rem 1.5rem', fontSize: 13, color: '#555', lineHeight: 1.8, textAlign: 'center' as const }}>
          Pagamento via PIX ou Cartão de crédito · Ativação imediata após confirmação · Suporte via WhatsApp
        </div>
      </div>

      {/* ─── 6. FAQ ─── */}
      <div style={{ background: '#050505', borderTop: '1px solid #1a1a1a', padding: '6rem 2.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: ACCENT, fontFamily: "'DM Mono', monospace", marginBottom: '1rem' }}>
            // dúvidas
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 4vw, 48px)', color: '#fff', lineHeight: 1.05, marginBottom: '3rem' }}>
            PERGUNTAS DIRETAS,<br />RESPOSTAS TAMBÉM
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              {
                p: 'Preciso cancelar meu plano Wellhub ou TotalPass para assinar o Pro?',
                r: 'Sim. A compra do Coach CT Pro desativa automaticamente seu plano de agregador na Just CT. Os dois planos não podem coexistir — o Pro substitui o anterior.',
              },
              {
                p: 'O que acontece se eu não usar todos os créditos no mês?',
                r: 'Nada. Os créditos do Pro são cumulativos ao longo de todo o período contratado — semestre ou trimestre. Se você treinar menos em um mês, o saldo fica disponível para os próximos.',
              },
              {
                p: 'Posso escolher o mesmo coach sempre?',
                r: 'Sim, desde que ele esteja disponível no horário que você escolher. A escolha é feita no momento do agendamento — não há garantia de exclusividade de coach, mas você tem total controle sobre quem seleciona.',
              },
              {
                p: 'E se eu precisar cancelar uma sessão com menos de 3 horas?',
                r: 'Cancelamentos com menos de 3 horas de antecedência não são permitidos e o crédito não é devolvido. Por isso a janela de 14 dias existe — para que você planeje com antecedência e não perca sessão.',
              },
            ].map((faq, i) => (
              <div key={i} className="faq-item"
                style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: '1.5rem 2rem', transition: 'border-color .2s' }}>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 15, marginBottom: 12, lineHeight: 1.5 }}>{faq.p}</div>
                <div style={{ fontSize: 14, color: '#666', lineHeight: 1.8 }}>{faq.r}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '4rem', textAlign: 'center' as const }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(28px, 3vw, 40px)', color: '#fff', marginBottom: '1rem' }}>
              AINDA COM DÚVIDA?
            </div>
            <div style={{ fontSize: 15, color: '#555', marginBottom: '2rem' }}>
              Fala com a gente. Sem enrolação.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/comprar')} className="btn-pro-h"
                style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '1rem 2.5rem', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'opacity .2s' }}>
                Quero o Pro →
              </button>
              <button onClick={() => router.push('/')} className="btn-ghost-pro-h"
                style={{ background: 'transparent', color: '#aaa', border: '1.5px solid #333', borderRadius: 8, padding: '1rem 2rem', fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all .2s' }}>
                ← Voltar pra home
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #1a1a1a', padding: '2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '1rem' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#fff', letterSpacing: 2 }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div style={{ fontSize: 12, color: '#444' }}>© 2025 Just CT — Serious Training. Todos os direitos reservados.</div>
        <span onClick={() => router.push('/')} style={{ fontSize: 12, color: '#555', cursor: 'pointer' }}>← Home</span>
      </footer>
    </div>
  )
}
