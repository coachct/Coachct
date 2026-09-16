'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const ACCENT = '#ff2d9b'

// Landing do feedback de estreia. Página de CLIENTE: nada de coach, equipe ou
// admin aqui. 90% abre no celular, então tudo empilhado e botão grande.
//
// Dois caminhos, e o tom muda entre eles: quem clicou 3-5 leva a pergunta
// descontraída; quem clicou 1 ou 2 leva a versão séria. Se a pessoa se
// machucou ou achou pesado demais, manter o sarcasmo duas telas depois
// envelhece muito mal.

const CARINHAS = [
  { n: 1, emoji: '😖' },
  { n: 2, emoji: '😕' },
  { n: 3, emoji: '🙂' },
  { n: 4, emoji: '😄' },
  { n: 5, emoji: '🔥' },
]

// As três primeiras não são genéricas por acaso: distância, horário
// incompatível e acompanhante são justamente as hipóteses que o banco não
// consegue testar sozinho.
const OPCOES_BOM = [
  'Já marquei, relaxa',
  'Só consigo em fim de semana',
  'O horário que eu quero não existe na grade',
  'O horário que eu quero vive lotado',
  'É longe pra mim',
  'Vim acompanhando alguém',
  'Ainda estou decidindo',
]

const OPCOES_RUIM = [
  'A aula foi puxada demais',
  'Foi fácil demais',
  'Não curti o formato',
  'Turma cheia demais',
  'Deslocamento',
  'Atendimento',
  'Outra coisa',
]

export default function FeedbackPage({ params }: { params: { token: string } }) {
  return (
    <Suspense fallback={null}>
      <Conteudo token={params.token} />
    </Suspense>
  )
}

function Conteudo({ token }: { token: string }) {
  const notaDaUrl = Number(useSearchParams().get('n'))
  const inicial = Number.isInteger(notaDaUrl) && notaDaUrl >= 1 && notaDaUrl <= 5 ? notaDaUrl : null

  const [nota, setNota] = useState<number | null>(inicial)
  const [etapa, setEtapa] = useState<'carinhas' | 'pergunta' | 'fim'>(inicial ? 'pergunta' : 'carinhas')
  const [motivo, setMotivo] = useState('')
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const gravouInicial = useRef(false)

  async function gravar(dados: Record<string, any>) {
    try {
      await fetch('/api/feedback-estreia/responder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...dados }),
      })
    } catch { /* a resposta já foi dada na tela; não vale travar por rede */ }
  }

  // Quem chegou pela carinha do e-mail já respondeu: grava na hora.
  useEffect(() => {
    if (inicial && !gravouInicial.current) {
      gravouInicial.current = true
      gravar({ nota: inicial })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicial])

  function escolherCarinha(n: number) {
    setNota(n)
    setEtapa('pergunta')
    gravar({ nota: n })
  }

  async function enviar() {
    setEnviando(true)
    await gravar({ motivo, comentario })
    setEnviando(false)
    setEtapa('fim')
  }

  const ruim = nota !== null && nota <= 2
  const opcoes = ruim ? OPCOES_RUIM : OPCOES_BOM

  return (
    <div style={{
      background: '#080808', minHeight: '100vh', color: '#f0f0f0',
      fontFamily: "'DM Sans', sans-serif", display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .btn:hover { opacity: .85; }
        .op:hover { border-color: #444; }
        textarea::placeholder { color: #555; }
      `}</style>

      <div style={{
        background: '#111', border: '1px solid #222', borderRadius: 20,
        padding: '2rem 1.5rem', maxWidth: 460, width: '100%',
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2,
          color: '#fff', marginBottom: '1.5rem', textAlign: 'center',
        }}>
          JUST CLUB &amp; <span style={{ color: ACCENT }}>CT</span>
        </div>

        {etapa === 'carinhas' && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: '0.5rem', textAlign: 'center' }}>
              E aí, como foi?
            </div>
            <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6, marginBottom: '1.5rem', textAlign: 'center' }}>
              É um clique. Um só.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              {CARINHAS.map(c => (
                <button key={c.n} onClick={() => escolherCarinha(c.n)} className="btn"
                  aria-label={`Nota ${c.n}`}
                  style={{
                    flex: 1, background: '#1a1a1a', border: '1px solid #262626',
                    borderRadius: 14, padding: '0.85rem 0', fontSize: 28,
                    cursor: 'pointer', lineHeight: 1,
                  }}>
                  {c.emoji}
                </button>
              ))}
            </div>
          </>
        )}

        {etapa === 'pergunta' && (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: '1.25rem', lineHeight: 1.45 }}>
              {ruim ? 'Sem filtro: o que não rolou?' : 'Boa. E o que ainda não te fez marcar o próximo?'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.25rem' }}>
              {opcoes.map(o => (
                <button key={o} onClick={() => setMotivo(o)} className="op"
                  style={{
                    width: '100%', textAlign: 'left', background: motivo === o ? '#2a0f1e' : '#1a1a1a',
                    border: `1px solid ${motivo === o ? ACCENT : '#262626'}`,
                    borderRadius: 12, padding: '0.85rem 1rem', fontSize: 15,
                    color: motivo === o ? '#fff' : '#ccc', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                  {o}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 13, color: '#888', marginBottom: '0.5rem' }}>
              {ruim ? 'Conta o que aconteceu. A gente lê.' : 'Quer detonar com detalhes? Manda ver'}
            </div>
            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value.slice(0, 1000))}
              rows={4}
              style={{
                width: '100%', background: '#0d0d0d', border: '1px solid #262626',
                borderRadius: 12, padding: '0.8rem', color: '#eee', fontSize: 15,
                fontFamily: "'DM Sans', sans-serif", resize: 'vertical', marginBottom: '1.25rem',
              }}
            />

            <button onClick={enviar} disabled={enviando} className="btn"
              style={{
                width: '100%', background: ACCENT, color: '#fff', border: 'none',
                borderRadius: 10, padding: '0.95rem', fontWeight: 700, fontSize: 15,
                cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.7 : 1,
                fontFamily: "'DM Sans', sans-serif",
              }}>
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
          </>
        )}

        {etapa === 'fim' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: '0.75rem' }}>
              Valeu.
            </div>
            <div style={{ fontSize: 14, color: '#999', lineHeight: 1.7 }}>
              Anotado. A gente lê tudo.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
