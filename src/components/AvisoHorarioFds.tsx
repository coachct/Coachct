'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

// Popup do novo horário de fim de semana/feriado do Just CT (aprovado pelo Ricardo).
// Aparece uma vez em qualquer página do site; ao fechar, grava no localStorage
// e não volta naquele navegador. Sai do ar sozinho depois do último dia.
const ACCENT = '#ff2d9b'
const STORAGE_KEY = 'aviso_horario_fds_ct_v1'
const ULTIMO_DIA = '2026-10-23' // fica no ar até sexta, 23/10 (inclusive)

// Mesmas áreas internas que o botão do WhatsApp esconde (equipe).
const OCULTAR_EM = ['/admin', '/coach', '/recepcao', '/ju', '/totem', '/playlist']

function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export default function AvisoHorarioFds() {
  const pathname = usePathname() || ''
  const [aberto, setAberto] = useState(false)
  const oculto = OCULTAR_EM.some((p) => pathname === p || pathname.startsWith(p + '/'))

  useEffect(() => {
    if (oculto || hojeSP() > ULTIMO_DIA) return
    let jaViu = false
    try { jaViu = localStorage.getItem(STORAGE_KEY) === '1' } catch {}
    if (!jaViu) setAberto(true)
  }, [oculto])

  function fechar() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    setAberto(false)
  }

  if (oculto || !aberto) return null

  const linha = (dia: string, hora: string, ultima = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: ultima ? 'none' : '1px solid #2a2a2a' }}>
      <span style={{ color: '#aaa', fontSize: 15 }}>{dia}</span>
      <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{hora}</span>
    </div>
  )

  return (
    <div
      onClick={fechar}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Novo horário de fim de semana e feriados"
        style={{
          background: '#141414', border: `1.5px solid ${ACCENT}`, borderRadius: 16,
          maxWidth: 400, width: '100%', padding: '32px 28px 28px', textAlign: 'center',
          position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <button
          onClick={fechar}
          aria-label="Fechar aviso"
          style={{ position: 'absolute', right: 12, top: 10, background: 'transparent', border: 'none', color: '#777', fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 4 }}
        >×</button>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
        <div style={{ color: ACCENT, fontSize: 20, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', margin: '12px 0 8px' }}>
          Just CT
        </div>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 600, lineHeight: 1.4, marginBottom: 14 }}>
          Novo horário de fim de semana e feriados
        </div>
        <div style={{ display: 'inline-block', background: `${ACCENT}22`, border: `1px solid ${ACCENT}`, color: ACCENT, borderRadius: 999, padding: '6px 18px', fontSize: 16, fontWeight: 600, marginBottom: 18 }}>
          A partir de 17/10
        </div>
        <div style={{ background: '#1c1c1c', border: '1px solid #2a2a2a', borderRadius: 12, padding: '14px 16px', marginBottom: 24, textAlign: 'left' }}>
          {linha('Sábado', '08h às 15h')}
          {linha('Domingo e feriados', '09h às 14h', true)}
        </div>
        <button
          onClick={fechar}
          style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 36px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
        >Entendi</button>
      </div>
    </div>
  )
}
