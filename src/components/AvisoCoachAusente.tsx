'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { coachesLivresNoHorario } from '@/lib/coach-pro'

// Aviso de coach ausente (férias/ausência/encerramento lançados depois do agendamento).
// O banco já tirou o coach do agendamento (coach_ausente_id guarda quem era); aqui o
// cliente escolhe outro coach livre no horário ou deixa sem coach. Falha não derruba a tela.

const AMARELO = '#ffaa00'
const VERDE   = '#2ddd8b'

export default function AvisoCoachAusente({ agendamentos, onResolvido }: { agendamentos: any[]; onResolvido: () => void | Promise<void> }) {
  const supabase = createClient()
  const pendentes = (agendamentos || []).filter(a => a?.coach_ausente_id && ['agendado', 'confirmado'].includes(a.status))
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [coaches, setCoaches] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  if (pendentes.length === 0) return null

  async function abrir(ag: any) {
    if (abertoId === ag.id) { setAbertoId(null); return }
    setAbertoId(ag.id); setErro('')
    await carregarCoaches(ag)
  }

  async function carregarCoaches(ag: any) {
    setCoaches([]); setCarregando(true)
    try {
      const lista = await coachesLivresNoHorario(supabase, ag.unidade_id, ag.data, (ag.horario || '').slice(0, 5))
      setCoaches(lista)
    } catch { setCoaches([]) }
    setCarregando(false)
  }

  async function resolver(ag: any, coachId: string | null) {
    setSalvando(true); setErro('')
    const { data, error } = await supabase.rpc('resolver_coach_ausente_cliente', { p_agendamento_id: ag.id, p_coach_id: coachId })
    setSalvando(false)
    if (error || !(data as any)?.ok) {
      setErro((data as any)?.erro === 'COACH_INDISPONIVEL' ? 'Esse coach acabou de ficar indisponível. Escolha outro.' : 'Não foi possível salvar agora. Tente de novo.')
      if ((data as any)?.erro === 'COACH_INDISPONIVEL') await carregarCoaches(ag)
      return
    }
    setAbertoId(null)
    await onResolvido()
  }

  const btn = { background: 'transparent', borderRadius: 8, padding: '0.4rem 0.75rem', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" } as const

  return (
    <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pendentes.map(ag => {
        const d = new Date(ag.data + 'T12:00:00')
        const dataTxt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
        const hora = (ag.horario || '').slice(0, 5)
        const aberto = abertoId === ag.id
        return (
          <div key={ag.id} style={{ background: `${AMARELO}10`, border: `1px solid ${AMARELO}55`, borderRadius: 12, padding: '0.9rem 1rem' }}>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginBottom: 4 }}>⚠️ Coach indisponível no seu treino</div>
            <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
              O coach {ag.coach_ausente_nome || 'que você escolheu'} não poderá comparecer no seu treino de {dataTxt} às {hora}
              {ag.unidades?.nome ? ` (${ag.unidades.nome})` : ''}. Seu agendamento continua confirmado. Escolha outro coach ou deixe sem coach escolhido.
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <button disabled={salvando} onClick={() => abrir(ag)} style={{ ...btn, border: `1px solid ${VERDE}66`, color: VERDE }}>
                {aberto ? 'Fechar' : 'Escolher outro coach'}
              </button>
              <button disabled={salvando} onClick={() => resolver(ag, null)} style={{ ...btn, border: '1px solid #333', color: '#999' }}>
                Deixar sem coach
              </button>
            </div>
            {aberto && (
              <div style={{ marginTop: 10 }}>
                {carregando ? (
                  <div style={{ fontSize: 12, color: '#777' }}>Carregando coaches…</div>
                ) : coaches.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#777' }}>Nenhum outro coach livre nesse horário. Você pode deixar sem coach escolhido.</div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {coaches.map(c => (
                      <button key={c.id} disabled={salvando} onClick={() => resolver(ag, c.id)} style={{ ...btn, border: '1px solid #2a2a2a', color: '#fff', background: '#151515' }}>
                        {c.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {erro && (aberto || abertoId === null) && <div style={{ fontSize: 12, color: '#ff7777', marginTop: 8 }}>{erro}</div>}
          </div>
        )
      })}
    </div>
  )
}
