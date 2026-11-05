'use client'
// Oferta do App Coach CT PRO (layouts aprovados pelo Ricardo em 24/09/2026).
//  onde='conta'   → card fixo (1); vira o card chamativo (2) ao passar de 70% do
//                   mês; renovação (5) quando os créditos do App PRO acabam.
//  onde='agendar' → aviso (3) só quando os check-ins do app do mês acabaram.
// Quem vê o quê vem da RPC app_pro_oferta. Sem dado, nada aparece.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { carregarAppProOferta, registrarEventoAppPro, NOME_PARCEIRO, type AppProOferta, type LocalOferta } from '@/lib/appPro'

const ACCENT = '#ff2d9b'
const AMARELO = '#ffaa00'
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const bebas: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }
const btn: React.CSSProperties = { width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '0.8rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }

function Item({ icone, children }: { icone: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, color: '#ccc', margin: '7px 0', lineHeight: 1.35 }}>
      <span style={{ color: ACCENT, width: 16, flexShrink: 0, textAlign: 'center' }}>{icone}</span>{children}
    </div>
  )
}

export default function AppProCard({ clienteId, onde, ocultarAvisoEsgotado = false }: {
  clienteId: string
  onde: 'conta' | 'agendar'
  /** /agendar já mostra "Sem créditos disponíveis" — não repetir a caixa vermelha. */
  ocultarAvisoEsgotado?: boolean
}) {
  const router = useRouter()
  const supabase = createClient()
  const [o, setO] = useState<AppProOferta | null>(null)
  const vistoRef = useRef<string | null>(null)

  useEffect(() => {
    let vivo = true
    carregarAppProOferta(supabase, clienteId).then(d => { if (vivo) setO(d) })
    return () => { vivo = false }
  }, [clienteId])

  const local: LocalOferta | null = !o ? null
    : onde === 'agendar' ? (o.mostrar_oferta && o.nivel === 'esgotado' ? 'agendar' : null)
    : o.mostrar_renovacao ? 'renovacao'
    : o.mostrar_oferta ? (o.nivel === 'normal' ? 'conta' : 'conta_70')
    : null

  useEffect(() => {
    if (!local || vistoRef.current === local) return
    vistoRef.current = local
    registrarEventoAppPro(supabase, 'visto', local)
  }, [local])

  if (!o || !local) return null

  const parceiro = o.parceiro ? NOME_PARCEIRO[o.parceiro] : 'app'
  const irParaCompra = () => {
    registrarEventoAppPro(supabase, 'clique', local)
    router.push('/app-pro')
  }

  // ── 5 · Renovação ──
  if (local === 'renovacao') {
    return (
      <div style={{ background: '#111', border: `1.5px solid ${ACCENT}55`, borderRadius: 14, padding: '1rem 1.1rem', marginBottom: '1.5rem' }}>
        <div style={{ ...bebas, fontSize: 18, color: '#fff' }}>SEUS CRÉDITOS DO APP PRO ACABARAM</div>
        <div style={{ fontSize: 13, color: '#aaa', margin: '2px 0 10px', lineHeight: 1.45 }}>
          Renove para manter os benefícios e ganhar mais 12 créditos.
        </div>
        <button onClick={irParaCompra} style={{ ...btn, width: 'auto', padding: '0.6rem 1.2rem' }}>Renovar App PRO</button>
      </div>
    )
  }

  // ── 3 · /agendar: check-ins do app acabaram ──
  if (local === 'agendar') {
    const hoje = new Date()
    const proxMes = MESES[(hoje.getMonth() + 1) % 12]
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        {!ocultarAvisoEsgotado && (
          <div style={{ background: '#150000', border: '1.5px solid #ff444455', borderRadius: 14, padding: '0.8rem 1rem', marginBottom: 12 }}>
            <div style={{ ...bebas, fontSize: 17, color: '#ff6b6b' }}>VOCÊ USOU OS {o.total} CHECK-INS DO {parceiro.toUpperCase()}</div>
            <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.45 }}>Seus check-ins voltam no dia 1º de {proxMes}.</div>
          </div>
        )}
        <div style={{ background: '#12000a', border: `1.5px solid ${ACCENT}55`, borderRadius: 14, padding: '1rem 1.1rem' }}>
          <div style={{ ...bebas, fontSize: 20, color: '#fff', lineHeight: 1.1, marginBottom: 6 }}>TREINE HOJE COM O APP PRO</div>
          <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.45 }}>Ative agora e receba 12 créditos na hora — dá pra agendar este treino em seguida.</div>
          <div style={{ marginTop: 8 }}>
            <Item icone="+">+4 treinos por mês, por 3 meses</Item>
            <Item icone="★">Todos os benefícios PRO</Item>
          </div>
          <div style={{ fontSize: 12, color: '#888', margin: '10px 0' }}>3x de R$ 299</div>
          <button onClick={irParaCompra} style={btn}>Ativar App PRO</button>
        </div>
      </div>
    )
  }

  const pct = o.total ? Math.min(100, Math.round((o.usados / o.total) * 100)) : 0
  const restam = o.total ? Math.max(0, o.total - o.usados) : 0
  const alerta = local === 'conta_70'

  // Layout de 05/11/2026 em /minha-conta: fundo escuro, rosa só na borda,
  // selo, número grande, barra e botão. A barra de uso fica DENTRO do card.
  const cardConta: React.CSSProperties = { background: '#151515', border: `1px solid ${ACCENT}66`, borderRadius: 16, padding: '1.1rem 1.1rem' }
  const selo: React.CSSProperties = { display: 'inline-block', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: ACCENT, border: `1px solid ${ACCENT}55`, borderRadius: 999, padding: '3px 9px' }
  const numeroGrande = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '12px 0 4px' }}>
      <span style={{ ...bebas, fontSize: 38, color: ACCENT, lineHeight: 1 }}>+4</span>
      <span style={{ fontSize: 14, color: '#eee' }}>treinos por mês</span>
    </div>
  )

  // ── 2 · Passou de 70% ──
  if (alerta) {
    return (
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={cardConta}>
          <div style={{ ...bebas, fontSize: 21, color: '#fff', lineHeight: 1.1, marginBottom: 8 }}>SEUS CHECK-INS DO APP ESTÃO SE ESGOTANDO</div>
          <div style={{ fontSize: 13, color: '#cfcfcf', lineHeight: 1.5 }}>
            Olha, o uso dos check-ins que você tem direito com seu app está se esgotando. Mas você sabia que pode ter créditos extras e, o melhor, ainda ganhar os benefícios de ser um cliente PRO?
          </div>
          {o.total ? (
            <>
              <div style={{ height: 5, background: '#2a2a2a', borderRadius: 3, overflow: 'hidden', margin: '10px 0 4px' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: ACCENT }} />
              </div>
              <div style={{ fontSize: 11.5, color: '#999' }}>{o.usados} de {o.total} check-ins do {parceiro} usados · restam {restam}</div>
            </>
          ) : null}
          <div style={{ marginTop: 10 }}>
            <Item icone="+">+4 treinos Coach CT por mês</Item>
            <Item icone="✓">Escolha seu coach</Item>
            <Item icone="◷">14 dias de antecedência (app: 7)</Item>
            <Item icone="✕">Cancele até 3h antes (app: 12h)</Item>
            <Item icone="↑">Prioridade na fila de espera</Item>
          </div>
          <div style={{ fontSize: 12, color: '#888', margin: '10px 0' }}>3x de R$ 299 · você mantém seu {parceiro}</div>
          <button onClick={irParaCompra} style={btn}>Quero ser PRO</button>
        </div>
      </div>
    )
  }

  // ── 1 · Card fixo ──
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={cardConta}>
        <span style={selo}>Exclusivo para quem treina pelo app</span>
        <div style={{ ...bebas, fontSize: 22, color: '#fff', margin: '10px 0 4px' }}>SEJA APP COACH CT PRO</div>
        <div style={{ fontSize: 13, color: '#cfcfcf', lineHeight: 1.5 }}>Continue com seu {parceiro} e ganhe +4 treinos por mês e os benefícios PRO.</div>
        {numeroGrande}
        <Item icone="✓">Escolha seu coach</Item>
        <Item icone="✓">Agende com 14 dias de antecedência</Item>
        <Item icone="✓">Cancele até 3h antes</Item>
        <div style={{ fontSize: 12, color: '#999', margin: '10px 0' }}>3x de R$ 299 · trimestral</div>
        <button onClick={irParaCompra} style={btn}>Conhecer o App PRO →</button>
      </div>
    </div>
  )
}
