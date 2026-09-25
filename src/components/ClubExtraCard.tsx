'use client'
// Card do Check ins Extra for Clubs em /minha-conta (texto aprovado pelo Ricardo
// em 25/09/2026). Só aparece para quem a RPC club_extra_oferta libera:
//  mes_atual    → barra de uso + "estão se esgotando"
//  mes_anterior → sem barra, título do mês passado
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { NOME_PARCEIRO, registrarEventoAppPro, type LocalOferta } from '@/lib/appPro'
import { carregarClubExtraOferta, CLUB_EXTRA_PRODUTO_ID, type ClubExtraOferta } from '@/lib/clubExtra'

const ACCENT = '#ff2d9b'
const AMARELO = '#ffaa00'

const bebas: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }
const btn: React.CSSProperties = { width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '0.8rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }

function Item({ icone, children }: { icone: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, color: '#ccc', margin: '7px 0', lineHeight: 1.35 }}>
      <span style={{ color: ACCENT, width: 16, flexShrink: 0, textAlign: 'center' }}>{icone}</span>{children}
    </div>
  )
}

export default function ClubExtraCard({ clienteId }: { clienteId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [o, setO] = useState<ClubExtraOferta | null>(null)
  const vistoRef = useRef(false)

  useEffect(() => {
    let vivo = true
    carregarClubExtraOferta(supabase, clienteId).then(d => { if (vivo) setO(d) })
    return () => { vivo = false }
  }, [clienteId])

  const local: LocalOferta | null = o?.mostrar ? (o.nivel === 'mes_atual' ? 'club_70' : 'club_mes_anterior') : null

  useEffect(() => {
    if (!local || vistoRef.current) return
    vistoRef.current = true
    registrarEventoAppPro(supabase, 'visto', local)
  }, [local])

  if (!o || !local) return null

  const parceiro = o.parceiro ? NOME_PARCEIRO[o.parceiro] : 'app'
  const mesAtual = o.nivel === 'mes_atual'
  const total = o.total || 0
  const usados = o.usados || 0
  const pct = total ? Math.min(100, Math.round((usados / total) * 100)) : 0
  const restam = Math.max(0, total - usados)

  const comprar = () => {
    registrarEventoAppPro(supabase, 'clique', local)
    router.push(`/comprar/checkout?produto=${CLUB_EXTRA_PRODUTO_ID}`)
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {mesAtual && total > 0 && (
        <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 14, padding: '0.75rem 1rem', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#888' }}>Check-ins do {parceiro} este mês</div>
          <div style={{ height: 6, background: '#222', borderRadius: 3, overflow: 'hidden', margin: '6px 0 4px' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: AMARELO }} />
          </div>
          <div style={{ fontSize: 12, color: AMARELO }}>{usados} de {total} usados · restam {restam}</div>
        </div>
      )}
      <div style={{ background: '#12000a', border: `1.5px solid ${ACCENT}`, borderRadius: 14, padding: '1rem 1.1rem' }}>
        <div style={{ ...bebas, fontSize: 20, color: '#fff', lineHeight: 1.1, marginBottom: 6 }}>
          {mesAtual ? 'SEUS CHECK-INS DO APP ESTÃO SE ESGOTANDO' : 'VOCÊ É DAS QUE MAIS TREINAM NO CLUB'}
        </div>
        <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
          {mesAtual
            ? 'Olha, o uso dos check-ins que você tem direito com seu app está se esgotando. Mas você sabia que pode ter créditos extras com um valor exclusivo para quem treina com a gente com frequência?'
            : 'No mês passado você usou quase todos os check-ins do seu app. Para não ficar sem treinar, você pode ter créditos extras com um valor exclusivo para quem treina com a gente com frequência.'}
        </div>
        <div style={{ marginTop: 10 }}>
          <Item icone="+">4 treinos extras no Club</Item>
          <Item icone="✓">Use na Vila Olímpia ou em Pinheiros</Item>
          <Item icone="◷">Válidos por 30 dias</Item>
        </div>
        <div style={{ fontSize: 12, color: '#888', margin: '10px 0' }}>R$ 99,90 à vista · você mantém seu {parceiro}</div>
        <button onClick={comprar} style={btn}>Quero 4 check-ins extras</button>
      </div>
    </div>
  )
}
