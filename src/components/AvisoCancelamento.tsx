'use client'

/**
 * Aviso de cancelamento do modal de reserva das Clubs.
 *
 * - Plano parceiro (Wellhub/TotalPass): mantém o texto de sempre, com a multa de no-show.
 * - Crédito direto da Just (avulso / pacote): não tem multa — a consequência de não
 *   cancelar até 12h antes é o crédito ser consumido. O aviso deixa isso explícito.
 */
export default function AvisoCancelamento({
  tipoCredito,
  mostrarExcecaoFila = false,
}: {
  tipoCredito: string
  mostrarExcecaoFila?: boolean
}) {
  const ehParceiro = /^(wellhub|totalpass)/i.test(tipoCredito || '')
  const ehCreditoJust = !!tipoCredito && !ehParceiro

  const caixa = { background:'#0a0a0a', border:'1px solid #1a1a1a', borderRadius:10, padding:'0.75rem 1rem',
    marginBottom:'1.25rem', fontSize:12, color:'#444', lineHeight:1.7 } as const

  if (ehCreditoJust) {
    return (
      <div style={caixa}>
        ⚠️ Cancelamento em <strong style={{ color:'#666' }}>até 12hr</strong> o crédito volta para você, após esse prazo <strong style={{ color:'#999' }}>o crédito será consumido</strong> em caso de falta.
      </div>
    )
  }

  return (
    <div style={caixa}>
      ⚠️ Cancelamento gratuito <strong style={{ color:'#666' }}>até 12h antes</strong>.
      {mostrarExcecaoFila && ' Com fila de espera, prazo reduz para 3h.'} Falta ou não realização do check-in gera no-show de <strong style={{ color:'#666' }}>R$ 49,90</strong>.
    </div>
  )
}
