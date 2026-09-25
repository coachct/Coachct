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

  const barraUso = o.total ? (
    <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 14, padding: '0.75rem 1rem', marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#888' }}>Check-ins do {parceiro} este mês</div>
      <div style={{ height: 6, background: '#222', borderRadius: 3, overflow: 'hidden', margin: '6px 0 4px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: alerta ? AMARELO : '#888' }} />
      </div>
      <div style={{ fontSize: 12, color: alerta ? AMARELO : '#aaa' }}>
        {o.usados} de {o.total} usados{alerta ? ` · restam ${restam}` : ''}
      </div>
    </div>
  ) : null

  // ── 2 · Passou de 70% ──
  if (alerta) {
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        {barraUso}
        <div style={{ background: '#12000a', border: `1.5px solid ${ACCENT}`, borderRadius: 14, padding: '1rem 1.1rem' }}>
          <div style={{ ...bebas, fontSize: 20, color: '#fff', lineHeight: 1.1, marginBottom: 6 }}>SEUS CHECK-INS DO APP ESTÃO SE ESGOTANDO</div>
          <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
            Olha, o uso dos check-ins que você tem direito com seu app está se esgotando. Mas você sabia que pode ter créditos extras e, o melhor, ainda ganhar os benefícios de ser um cliente PRO?
          </div>
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
    <div style={{ marginBottom: '1.5rem' }}>
      {barraUso}
      <div style={{ background: '#12000a', border: `1.5px solid ${ACCENT}55`, borderRadius: 14, padding: '1rem 1.1rem' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: ACCENT }}>// exclusivo para quem treina pelo app</div>
        <div style={{ ...bebas, fontSize: 22, color: '#fff', margin: '6px 0 4px' }}>SEJA APP COACH CT PRO</div>
        <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.45 }}>Continue com seu {parceiro} e ganhe +4 treinos por mês e os benefícios PRO.</div>
        <div style={{ marginTop: 6 }}>
          <Item icone="✓">Escolha seu coach</Item>
          <Item icone="◷">Agende com 14 dias de antecedência</Item>
          <Item icone="✕">Cancele até 3h antes</Item>
        </div>
        <div style={{ fontSize: 12, color: '#888', margin: '10px 0' }}>3x de R$ 299 · trimestral</div>
        <button onClick={irParaCompra} style={btn}>Conhecer o App PRO</button>
      </div>
    </div>
  )
}
