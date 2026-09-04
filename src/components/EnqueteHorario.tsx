'use client'
import type { EnqueteHorario as Enquete } from '@/lib/enquete-horario'

const CYAN = '#00e5ff'

// Caixinha da enquete de horário dentro do modal de confirmação de reserva.
// Usada no /aulas (Lift) e no /mapa (Running) — o visual tem que ser o mesmo nos dois.
export default function EnqueteHorario({ enquete, valor, onChange }: {
  enquete: Enquete
  valor: string
  onChange: (valor: string) => void
}) {
  return (
    <div style={{ background:'#0a1520', border:`1px solid ${CYAN}33`, borderRadius:12, padding:'1rem 1.1rem', marginBottom:'1.25rem' }}>
      <div style={{ fontSize:13, fontWeight:700, color:CYAN, marginBottom:4 }}>💬 Ajude-nos a melhorar ainda mais a Just</div>
      <div style={{ fontSize:13, color:'#bbb', lineHeight:1.5, marginBottom:12 }}>{enquete.pergunta}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {enquete.opcoes.map(op => {
          const sel = valor === op.valor
          return (
            <div key={op.valor} onClick={() => onChange(op.valor)}
              style={{ border:`1.5px solid ${sel?CYAN:'#1f2a33'}`, background:sel?`${CYAN}15`:'transparent', borderRadius:9, padding:'0.6rem 0.85rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.65rem', transition:'all .15s' }}>
              <div style={{ width:15, height:15, borderRadius:'50%', border:`2px solid ${sel?CYAN:'#39434d'}`, background:sel?CYAN:'transparent', flexShrink:0 }}/>
              <span style={{ fontSize:13, color:sel?'#fff':'#8b97a3' }}>{op.label}</span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize:11, color:'#4a5761', marginTop:10, lineHeight:1.5 }}>
        Escolha uma opção para confirmar a reserva. Você responde uma única vez — depois disso não perguntamos mais.
      </div>
    </div>
  )
}
