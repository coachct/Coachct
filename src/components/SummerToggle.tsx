'use client'

const ACCENT = '#ff2d9b'

// Toggle do Summer Mode — CSS puro, sem imagem. Aparece em três lugares
// (banner da home, cabeçalho da seção em /comprar e hero da landing), por isso
// mora aqui e não colado em cada página.
//
// ON  → pílula rosa com glow, knob branco à direita.
// OFF → pílula apagada (cinza), knob à esquerda, sem glow.
// `onToggle` é opcional: só a landing usa o toggle como controle de verdade;
// nos outros lugares ele é decorativo e não recebe foco nem cursor de clique.
export default function SummerToggle({
  on = true,
  height = 34,
  onToggle,
  ariaLabel = 'Summer Mode',
}: {
  on?: boolean
  height?: number
  onToggle?: () => void
  ariaLabel?: string
}) {
  const h        = height
  const w        = Math.round(h * 1.85)
  const pad      = Math.max(3, Math.round(h * 0.12))
  const knob     = h - pad * 2
  const clicavel = typeof onToggle === 'function'

  const pilula: React.CSSProperties = {
    position: 'relative',
    width: w,
    height: h,
    borderRadius: h,
    background: on ? ACCENT : '#232323',
    border: `1px solid ${on ? ACCENT : '#333'}`,
    boxShadow: on ? `0 0 ${Math.round(h * 1.8)}px ${ACCENT}66` : 'none',
    transition: 'all .3s ease',
    flexShrink: 0,
    padding: 0,
    cursor: clicavel ? 'pointer' : 'default',
    display: 'inline-block',
    verticalAlign: 'middle',
  }

  const bolinha: React.CSSProperties = {
    position: 'absolute',
    top: pad,
    left: on ? w - knob - pad : pad,
    width: knob,
    height: knob,
    borderRadius: '50%',
    background: on ? '#fff' : '#777',
    transition: 'all .3s ease',
  }

  if (!clicavel) {
    return (
      <span style={pilula} aria-hidden="true">
        <span style={bolinha} />
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      style={pilula}
    >
      <span style={bolinha} />
    </button>
  )
}
