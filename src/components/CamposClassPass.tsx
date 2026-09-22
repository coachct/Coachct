'use client'

// Campos da conta proxy da ClassPass: ela reserva por vários clientes deles,
// então cada reserva guarda o nome do cliente e o Reservation ID da ClassPass.
// Os dois são obrigatórios (validar com classPassFaltando antes de gravar).

export type DadosClassPass = { nome: string; reservaId: string }

export const CLASSPASS_VAZIO: DadosClassPass = { nome: '', reservaId: '' }

export function classPassFaltando(d: DadosClassPass): string {
  if (!d.nome.trim()) return 'Informe o nome do cliente.'
  if (!d.reservaId.trim()) return 'Informe o Reservation ID da ClassPass.'
  return ''
}

export function classPassPayload(d: DadosClassPass) {
  return { classpass_nome: d.nome.trim(), classpass_reserva_id: d.reservaId.trim() }
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 8,
  padding: '0.7rem', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
}

export default function CamposClassPass({ valor, onChange }: { valor: DadosClassPass; onChange: (v: DadosClassPass) => void }) {
  return (
    <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={labelStyle}>Nome do cliente</div>
        <input value={valor.nome} onChange={(e) => onChange({ ...valor, nome: e.target.value })}
          placeholder="Nome e sobrenome" autoComplete="off" style={inputStyle} />
      </div>
      <div>
        <div style={labelStyle}>Reservation ID</div>
        <input value={valor.reservaId} onChange={(e) => onChange({ ...valor, reservaId: e.target.value })}
          placeholder="Ex.: 6c984ee68f14475aad8aa75e721297f6" autoComplete="off" spellCheck={false}
          style={{ ...inputStyle, fontFamily: "'DM Mono', monospace", fontSize: 13 }} />
      </div>
    </div>
  )
}
