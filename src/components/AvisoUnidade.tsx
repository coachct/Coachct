'use client'
import { useEffect, useState } from 'react'

const ACCENT = '#ff2d9b'
const PINHEIROS_ID = '166a683d-5fe6-4177-8fd6-53deb70b428e'

// ── Liga/desliga global do aviso ──────────────────────────────
// Para REMOVER o aviso depois: trocar AVISO_ATIVO para false e dar deploy.
// Vale para a faixa (AvisoUnidade) E para o popup (AvisoPopupPinheiros).
const AVISO_ATIVO = false
const AVISO_TEXTO = 'Atenção Just Club Pinheiros, novos horários na manhã, a partir de 06/07'
// ──────────────────────────────────────────────────────────────
// Chave do localStorage que marca que o cliente já viu o popup uma vez.
// Mudar o sufixo (v1 → v2) faz o popup reaparecer para todos.
const POPUP_STORAGE_KEY = 'aviso_pinheiros_horarios_v1'

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

/**
 * Popup (modal central) que aparece UMA ÚNICA VEZ por cliente, ao entrar no
 * calendário da JustClub Pinheiros (`/aulas?unidade=<pinheiros>`).
 * - Só dispara quando `unidadeId` for Pinheiros.
 * - Marca em localStorage que já foi visto → não reaparece (mesmo navegador).
 *   Limpar cache / outro dispositivo → vê de novo (sem tabela no banco).
 */
export function AvisoPopupPinheiros({ unidadeId }: { unidadeId?: string }) {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!AVISO_ATIVO || unidadeId !== PINHEIROS_ID) return
    let jaViu = false
    try { jaViu = localStorage.getItem(POPUP_STORAGE_KEY) === '1' } catch {}
    if (!jaViu) setAberto(true)
  }, [unidadeId])

  function fechar() {
    try { localStorage.setItem(POPUP_STORAGE_KEY, '1') } catch {}
    setAberto(false)
  }

  if (!AVISO_ATIVO || !aberto) return null

  return (
    <div
      onClick={fechar}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#141414',
          border: `1.5px solid ${ACCENT}`,
          borderRadius: 16,
          maxWidth: 420,
          width: '100%',
          padding: '32px 28px 28px',
          textAlign: 'center',
          position: 'relative',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <button
          onClick={fechar}
          aria-label="Fechar aviso"
          style={{
            position: 'absolute',
            right: 12,
            top: 10,
            background: 'transparent',
            border: 'none',
            color: '#777',
            fontSize: 22,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 4,
          }}
        >×</button>
        <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 14 }}>⚠</div>
        <div style={{ color: ACCENT, fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          Just Club Pinheiros
        </div>
        <div style={{ color: '#fff', fontSize: 17, fontWeight: 600, lineHeight: 1.4, marginBottom: 24 }}>
          {AVISO_TEXTO}
        </div>
        <button
          onClick={fechar}
          style={{
            background: ACCENT,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '12px 32px',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >Entendi</button>
      </div>
    </div>
  )
}
