'use client'
// Página explicativa do Running & Hybrid (JustClub Vila Olímpia).
// ESBOÇO para o Ricardo revisar: textos são sugestão a partir do que ele passou (24/11).
import Link from 'next/link'
import { Footprints, Dumbbell, Flame, Trophy, CalendarDays, Timer, Ticket, SlidersHorizontal } from 'lucide-react'
import SiteHeader from '@/components/SiteHeader'

const LIMA = '#d4f53c'
const VO = '05eeab3e-5eae-4140-bc3a-1c1d56ac95be'

const PRA_QUEM = [
  { Icone: Footprints, titulo: 'Quem nunca treinou', sub: 'Todos os níveis são bem-vindos' },
  { Icone: Dumbbell, titulo: 'Corredores que querem ficar mais fortes', sub: '' },
  { Icone: Flame, titulo: 'Quem quer ser desafiado', sub: '' },
  { Icone: Trophy, titulo: 'Quem mira uma prova de Hyrox', sub: '' },
]

const EQUIPAMENTOS = [
  { nome: 'Esteira', desc: 'A base de tudo. Corrida entre cada estação.' },
  { nome: 'SkiErg', desc: 'Puxada de braços e core, em alta intensidade.' },
  { nome: 'Remo', desc: 'Corpo inteiro: pernas, costas e fôlego.' },
  { nome: 'Sled', desc: 'Empurrar e puxar carga. Força pura.' },
  { nome: 'Wall ball', desc: 'Agachamento + arremesso no alvo.' },
  { nome: 'Sandbag', desc: 'Carregar, levantar e avançar com carga instável.' },
]

const COMO_FUNCIONA = [
  { Icone: CalendarDays, titulo: 'Seg · Qui · Dom', desc: 'Todas as aulas do dia são Running & Hybrid. Nos outros dias, segue o nosso Running Funcional tradicional.' },
  { Icone: Timer, titulo: '50 minutos', desc: 'A mesma duração das aulas que você já conhece.' },
  { Icone: Ticket, titulo: 'Reserve só a vaga', desc: 'Não precisa escolher posição: garantiu a vaga, é só chegar.' },
  { Icone: SlidersHorizontal, titulo: 'No seu ritmo', desc: 'Intensidade e carga ficam com você, do iniciante ao avançado.' },
]

export default function RunningHybridPage() {
  return (
    <div className="rh-page">
      <style>{`
        .rh-page { background: #080808; min-height: 100vh; color: #f0f0f0; font-family: 'DM Sans', sans-serif; }
        .rh-wrap { max-width: 1100px; margin: 0 auto; padding: 0 2.5rem; }
        .rh-tag { font-family: 'DM Mono', monospace; font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: ${LIMA}; margin-bottom: 1rem; }
        .rh-h1 { font-family: 'Bebas Neue', sans-serif; font-size: clamp(44px, 6vw, 76px); line-height: .95; letter-spacing: 1px; color: #fff; }
        .rh-h2 { font-family: 'Bebas Neue', sans-serif; font-size: clamp(34px, 4vw, 52px); line-height: 1; letter-spacing: 1px; color: #fff; text-align: center; margin-bottom: 3rem; }
        .rh-lead { font-size: 18px; line-height: 1.7; color: #c8c8c8; max-width: 760px; }
        .rh-lead b { color: #fff; font-weight: 600; }
        .rh-lead + .rh-lead { margin-top: 1rem; }
        .rh-slogan { font-family: 'Bebas Neue', sans-serif; font-size: clamp(22px, 2.6vw, 32px); letter-spacing: 3px; color: ${LIMA}; margin-top: .75rem; }
        .rh-destaque { font-family: 'Bebas Neue', sans-serif; font-size: clamp(30px, 3.6vw, 44px); line-height: 1.05; color: #fff; margin: 2.5rem 0 1.25rem; letter-spacing: .5px; }
        .rh-h3 { font-family: 'Bebas Neue', sans-serif; font-size: clamp(30px, 3.4vw, 42px); line-height: 1.05; letter-spacing: .5px; color: #fff; margin: 3.25rem 0 1.25rem; }
        .rh-sec { padding: 5.5rem 0; border-top: 1px solid #1a1a1a; }
        .rh-grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2rem; }
        .rh-quem { text-align: center; }
        .rh-quem-ic { color: ${LIMA}; margin: 0 auto 1.25rem; }
        .rh-quem-t { font-family: 'Bebas Neue', sans-serif; font-size: 28px; line-height: 1.05; letter-spacing: .5px; color: #fff; }
        .rh-quem-s { font-size: 13px; color: #9a9a9a; margin-top: .5rem; text-transform: uppercase; letter-spacing: 1px; }
        .rh-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
        .rh-eq { background: #101010; border: 1px solid #222; border-radius: 16px; padding: 1.5rem; }
        .rh-eq-n { font-family: 'Bebas Neue', sans-serif; font-size: 30px; letter-spacing: .5px; color: ${LIMA}; }
        .rh-eq-d { font-size: 14px; color: #a8a8a8; margin-top: .25rem; line-height: 1.5; }
        .rh-nota { text-align: center; color: #c8c8c8; font-size: 16px; margin-top: 2rem; }
        .rh-dna { display: grid; grid-template-columns: auto 1fr; gap: 3rem; align-items: center; }
        .rh-km { font-family: 'Bebas Neue', sans-serif; font-size: clamp(110px, 16vw, 190px); line-height: .85; color: ${LIMA}; }
        .rh-km small { display: block; font-size: .2em; letter-spacing: 3px; color: #9a9a9a; margin-top: .5rem; }
        .rh-dna-t { font-family: 'Bebas Neue', sans-serif; font-size: clamp(34px, 4vw, 52px); line-height: 1; color: #fff; margin-bottom: 1rem; }
        .rh-como { background: #101010; border: 1px solid #222; border-radius: 16px; padding: 1.75rem 1.5rem; }
        .rh-como-ic { color: ${LIMA}; margin-bottom: 1rem; }
        .rh-como-t { font-family: 'Bebas Neue', sans-serif; font-size: 30px; letter-spacing: .5px; color: #fff; }
        .rh-como-d { font-size: 14px; color: #a8a8a8; margin-top: .4rem; line-height: 1.55; }
        .rh-cta { display: inline-block; background: ${LIMA}; color: #0b0b0b; border-radius: 999px; padding: 1rem 2.25rem; font-weight: 700; font-size: 16px; text-decoration: none; transition: opacity .2s; }
        .rh-cta:hover { opacity: .85; }
        .rh-cta-g { display: inline-block; border: 1.5px solid #333; color: #f0f0f0; border-radius: 999px; padding: 1rem 2.25rem; font-weight: 600; font-size: 16px; text-decoration: none; transition: border-color .2s; }
        .rh-cta-g:hover { border-color: ${LIMA}; color: ${LIMA}; }
        @media (max-width: 860px) {
          .rh-wrap { padding: 0 1.25rem; }
          .rh-sec { padding: 4rem 0; }
          .rh-grid4 { grid-template-columns: 1fr 1fr; gap: 2.5rem 1rem; }
          .rh-grid3 { grid-template-columns: 1fr 1fr; }
          .rh-dna { grid-template-columns: 1fr; gap: 1.5rem; text-align: center; }
          .rh-quem-t { font-size: 22px; }
          .rh-lead { font-size: 16px; }
          .rh-grid-como { grid-template-columns: 1fr; gap: 1rem; }
        }
      `}</style>

      <SiteHeader />

      {/* 1. Abertura: imagem + o que é */}
      <div className="rh-wrap" style={{ paddingTop: 96 }}>
        <img src="/running-hybrid-em-breve-v2.webp" alt="Running & Hybrid" width={1448} height={1086}
          style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 20, border: '1px solid #222' }} />
        {/* Texto do Ricardo (24/11), verbatim */}
        <div style={{ padding: '4rem 0 5rem' }}>
          <h1 className="rh-h1">RUNNING &amp; <span style={{ color: LIMA }}>HYBRID</span></h1>
          <div className="rh-slogan">CORRIDA. FORÇA. RESISTÊNCIA. PERFORMANCE.</div>

          <p className="rh-destaque">Muito além da corrida. Muito além do funcional.</p>
          <p className="rh-lead">
            O universo do treinamento híbrido ganhou projeção mundial com o crescimento do HYROX, uma competição criada na Alemanha, em 2017, que trouxe uma nova maneira de desafiar os limites do condicionamento físico.
          </p>

          <h2 className="rh-h3">Mas afinal, o que é HYROX?</h2>
          <p className="rh-lead">
            Diferentemente do que muita gente imagina, HYROX não é um método de treinamento, mas uma competição fitness que combina corrida e exercícios funcionais em um formato padronizado: são 8 km de corrida intercalados com 8 estações de exercícios, incluindo SkiErg, sled push, sled pull, remo, farmer&apos;s carry e wall balls.
          </p>

          <h2 className="rh-h3">MAS O QUE É TREINAMENTO HÍBRIDO?</h2>
          <p className="rh-lead">É a combinação de diferentes capacidades físicas em uma mesma proposta de treinamento.</p>
          <p className="rh-lead">
            De um lado, a corrida desenvolve resistência cardiovascular, capacidade aeróbica e eficiência de movimento. Do outro, os exercícios funcionais trabalham força, potência, resistência muscular e coordenação.
          </p>
          <p className="rh-lead">
            O resultado é um treinamento completo e dinâmico, que desafia o corpo de diferentes maneiras e desenvolve uma preparação física mais ampla.
          </p>
          <p className="rh-lead"><b>E não, você não precisa ser atleta ou ter o objetivo de competir para fazer parte desse universo.</b></p>

          <h2 className="rh-h3">CONHEÇA O RUNNING &amp; <span style={{ color: LIMA }}>HYBRID</span> DA JUST CLUB</h2>
          <p className="rh-lead">Criamos uma experiência que une o melhor da corrida e do treinamento funcional em uma única modalidade.</p>
          <p className="rh-lead">
            Uma combinação de corrida, estações de força e exercícios de resistência, com estímulos variados, intensidade e desafios progressivos.
          </p>
          <p className="rh-lead">
            Aqui, cada treino é uma oportunidade de superar limites, desenvolver novas capacidades e descobrir até onde você pode chegar.
          </p>
          <p className="rh-lead">
            Você pode treinar por performance, condicionamento ou simplesmente pelo prazer de se desafiar, e queimar calorias.
          </p>
        </div>
      </div>

      {/* 2. Pra quem é (cards no estilo da referência) */}
      <section className="rh-sec">
        <div className="rh-wrap">
          <h2 className="rh-h2">Quem treina no Running &amp; Hybrid</h2>
          <div className="rh-grid4">
            {PRA_QUEM.map(({ Icone, titulo, sub }) => (
              <div key={titulo} className="rh-quem">
                <Icone size={64} strokeWidth={1.75} className="rh-quem-ic" />
                <div className="rh-quem-t">{titulo}</div>
                {sub && <div className="rh-quem-s">{sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Equipamentos */}
      <section className="rh-sec">
        <div className="rh-wrap">
          <h2 className="rh-h2">O que tem no funcional</h2>
          <div className="rh-grid3">
            {EQUIPAMENTOS.map(e => (
              <div key={e.nome} className="rh-eq">
                <div className="rh-eq-n">{e.nome}</div>
                <div className="rh-eq-d">{e.desc}</div>
              </div>
            ))}
          </div>
          <p className="rh-nota">Cada treino do dia é um mix diferente entre eles, <b style={{ color: '#fff' }}>sempre intervalado com corrida</b>.</p>
        </div>
      </section>

      {/* 4. DNA de corrida: destaque de "mais corrida" (sem o 8 KM gigante) */}
      <section className="rh-sec" style={{ textAlign: 'center' }}>
        <div className="rh-wrap">
          <div className="rh-dna-t">Aqui o híbrido tem <span style={{ color: LIMA }}>mais corrida</span>.</div>
          <p className="rh-lead" style={{ margin: '0 auto' }}>
            A Just nasceu correndo. Por isso o nosso treino híbrido tem sempre mais corrida do que outros centros de treino híbrido.
            Se um dia você quiser encarar uma prova de HYROX, <b>vai estar pronto</b>.
          </p>
        </div>
      </section>

      {/* 5. Como funciona */}
      <section className="rh-sec">
        <div className="rh-wrap">
          <h2 className="rh-h2">Como funciona</h2>
          <div className="rh-grid4 rh-grid-como">
            {COMO_FUNCIONA.map(({ Icone, titulo, desc }) => (
              <div key={titulo} className="rh-como">
                <Icone size={30} strokeWidth={1.75} className="rh-como-ic" />
                <div className="rh-como-t">{titulo}</div>
                <div className="rh-como-d">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Chamada final */}
      <section className="rh-sec" style={{ textAlign: 'center' }}>
        <div className="rh-wrap">
          <h2 className="rh-h2" style={{ marginBottom: '2rem' }}>Bora correr <span style={{ color: LIMA }}>e ficar mais forte</span>?</h2>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href={`/aulas?unidade=${VO}`} className="rh-cta">Ver a grade da Vila Olímpia</Link>
            <Link href="/comprar" className="rh-cta-g">Ver os pacotes</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
