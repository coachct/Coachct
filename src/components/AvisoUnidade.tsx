'use client'
import { useState } from 'react'

const ACCENT = '#ff2d9b'
const PINHEIROS_ID = '166a683d-5fe6-4177-8fd6-53deb70b428e'

// ── Liga/desliga global do aviso ──────────────────────────────
// Para REMOVER o aviso depois: trocar AVISO_ATIVO para false e dar deploy.
const AVISO_ATIVO = true
const AVISO_TEXTO = 'Atenção Just Club Pinheiros, novos horários na manhã, a partir de 06/07'
// ──────────────────────────────────────────────────────────────

/**
 * Faixa de aviso (full-width, abaixo do header fixo de 64px).
 * - Sem `unidadeId` (capa) → mostra sempre.
 * - Com `unidadeId` → mostra só quando for Pinheiros.
 * Dispensável no × (estado local; reaparece em reload — ok p/ aviso temporário).
 */
export default function AvisoUnidade({ unidadeId }: { unidadeId?: string }) {
  const [fechado, setFechado] = useState(false)

  const deveMostrar = !unidadeId || unidadeId === PINHEIROS_ID
  if (!AVISO_ATIVO || !deveMostrar || fechado) return null

  return (
    <div style={{ paddingTop: 64, background: '#080808' }}>
      <div style={{
        background: ACCENT,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '12px 48px',
        position: 'relative',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 14,
        fontWeight: 600,
        textAlign: 'center',
        lineHeight: 1.3,
      }}>
        <span style={{ flexShrink: 0, fontSize: 16 }}>⚠</span>
        <span>{AVISO_TEXTO}</span>
        <button
          onClick={() => setFechado(true)}
          aria-label="Fechar aviso"
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 4,
          }}
        >×</button>
      </div>
    </div>
  )
}
