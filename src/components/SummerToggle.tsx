'use client'

const ACCENT = '#ff2d9b'

// Toggle do Summer Mode — CSS puro, sem imagem e SEM interação: é arte, em
// alusão a "ligar o modo". Não é controle, não muda nada na página. Aparece em
// três lugares (banner da home, cabeçalho da seção em /comprar e hero da
// landing), por isso mora aqui e não colado em cada página.
export default function SummerToggle({ height = 34 }: { height?: number }) {
  const h    = height
  const w    = Math.round(h * 1.85)
  const pad  = Math.max(3, Math.round(h * 0.12))
  const knob = h - pad * 2

  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-block',
        verticalAlign: 'middle',
        width: w,
        height: h,
        borderRadius: h,
        background: ACCENT,
        border: `1px solid ${ACCENT}`,
        boxShadow: `0 0 ${Math.round(h * 1.8)}px ${ACCENT}66`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: pad,
          left: w - knob - pad,
          width: knob,
          height: knob,
          borderRadius: '50%',
          background: '#fff',
        }}
      />
    </span>
  )
}
