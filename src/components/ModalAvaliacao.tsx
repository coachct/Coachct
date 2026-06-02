'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'

const ACCENT = '#ff2d9b'

function tipoLabel(t: string | null): string {
  if (t === 'ct') return 'Coach CT'
  if (t === 'lift') return 'Lift'
  if (t === 'lift_for_girls') return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return 'Aula'
}

function dataBR(d: string): string {
  // d = 'YYYY-MM-DD' — parse local, nunca toISOString
  const [, m, dia] = (d || '').split('-')
  return dia && m ? `${dia}/${m}` : d
}

function Estrelas({ valor, onChange }: { valor: number | null; onChange: (v: number | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const ativa = valor != null && n <= valor
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(valor === n ? null : n)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              fontSize: 26, lineHeight: 1, color: ativa ? ACCENT : '#3a3a3a',
              transition: 'color .15s', fontFamily: 'inherit',
            }}
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
          >
            ★
          </button>
        )
      })}
    </div>
  )
}

export default function ModalAvaliacao() {
  const { perfil, loading } = useAuth()
  const supabase = createClient()

  const [montado, setMontado] = useState(false)
  const [pendente, setPendente] = useState<any>(null)
  const [aberto, setAberto] = useState(false)
  const [carregado, setCarregado] = useState(false)

  const [notaAula, setNotaAula] = useState<number | null>(null)
  const [notaProf, setNotaProf] = useState<number | null>(null)
  const [notaMusica, setNotaMusica] = useState<number | null>(null)
  const [notaAmb, setNotaAmb] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { setMontado(true) }, [])

  useEffect(() => {
    if (loading || carregado) return
    if (perfil?.role !== 'cliente') { setCarregado(true); return }
    buscarPendente()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, perfil?.role])

  async function token(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  }

  async function buscarPendente() {
    setCarregado(true)
    try {
      const t = await token()
      if (!t) return
      const res = await fetch('/api/cliente/avaliar-aula', {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data?.pendente) { setPendente(data.pendente); setAberto(true) }
    } catch { /* silencioso — não atrapalha a navegação */ }
  }

  async function enviarAcao(payload: any) {
    setErro('')
    setEnviando(true)
    try {
      const t = await token()
      if (!t) { setAberto(false); return }
      const res = await fetch('/api/cliente/avaliar-aula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErro(d?.error || 'Erro ao salvar. Tente novamente.')
        setEnviando(false)
        return
      }
      setAberto(false)
    } catch {
      setErro('Erro ao salvar. Tente novamente.')
      setEnviando(false)
    }
  }

  function avaliar() {
    enviarAcao({
      action: 'avaliar',
      origem: pendente.origem,
      referencia_id: pendente.referencia_id,
      nota_aula: notaAula, nota_professor: notaProf,
      nota_musica: notaMusica, nota_ambiente: notaAmb,
      comentario: comentario.trim() || null,
    })
  }

  function dispensar() {
    enviarAcao({ action: 'dispensar', origem: pendente.origem, referencia_id: pendente.referencia_id })
  }

  function optout() {
    enviarAcao({ action: 'optout' })
  }

  if (!montado || !aberto || !pendente) return null

  const temAlgo = notaAula != null || notaProf != null || notaMusica != null || notaAmb != null || comentario.trim().length > 0

  const linhaCategoria = (label: string, valor: number | null, set: (v: number | null) => void) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <span style={{ fontSize: 14, color: '#ddd', fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
      <Estrelas valor={valor} onChange={set} />
    </div>
  )

  const overlay = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.82)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 420, background: '#0e0e0e',
          border: '1px solid #1f1f1f', borderRadius: 16, padding: '1.6rem 1.5rem',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h2 style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 1,
          color: '#fff', margin: 0, lineHeight: 1.1,
        }}>
          NOS AJUDE A MELHORAR CADA VEZ MAIS A <span style={{ color: ACCENT }}>JUST</span>
        </h2>

        <p style={{ fontSize: 13, color: '#888', margin: '8px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
          Sua última aula · {tipoLabel(pendente.tipo_aula)} · {pendente.unidade_nome} · {dataBR(pendente.data_aula)}
          {pendente.horario ? ` às ${pendente.horario}` : ''}
          {pendente.coach_nome ? ` · com ${String(pendente.coach_nome).split(' ')[0]}` : ''}
        </p>

        <div style={{ margin: '1.4rem 0 0.4rem' }}>
          {linhaCategoria('Aula', notaAula, setNotaAula)}
          {linhaCategoria('Professor', notaProf, setNotaProf)}
          {linhaCategoria('Música', notaMusica, setNotaMusica)}
          {linhaCategoria('Ambiente', notaAmb, setNotaAmb)}
        </div>

        <textarea
          value={comentario}
          onChange={e => setComentario(e.target.value)}
          placeholder="Comentário (opcional)"
          maxLength={1000}
          rows={3}
          style={{
            width: '100%', marginTop: 8, background: '#080808', color: '#fff',
            border: '1px solid #262626', borderRadius: 10, padding: '10px 12px',
            fontSize: 14, fontFamily: "'DM Sans', sans-serif", resize: 'vertical', outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {erro && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#ff7a7a', fontFamily: "'DM Sans', sans-serif" }}>{erro}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={dispensar}
            disabled={enviando}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, cursor: enviando ? 'default' : 'pointer',
              background: 'transparent', border: '1px solid #2e2e2e', color: '#aaa',
              fontSize: 14, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
            }}
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={avaliar}
            disabled={enviando || !temAlgo}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              cursor: enviando || !temAlgo ? 'default' : 'pointer',
              background: temAlgo ? ACCENT : '#3a1730', border: 'none',
              color: temAlgo ? '#fff' : '#7a5a6e',
              fontSize: 14, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
            }}
          >
            {enviando ? 'Enviando…' : 'Enviar avaliação'}
          </button>
        </div>

        <button
          type="button"
          onClick={optout}
          disabled={enviando}
          style={{
            display: 'block', margin: '14px auto 0', background: 'none', border: 'none',
            color: '#5a5a5a', fontSize: 12, cursor: enviando ? 'default' : 'pointer',
            textDecoration: 'underline', fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Não quero avaliar aulas
        </button>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
