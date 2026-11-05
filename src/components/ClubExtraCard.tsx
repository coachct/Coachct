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
  const [unidadeNome, setUnidadeNome] = useState<string | null>(null)
  const vistoRef = useRef(false)

  useEffect(() => {
    let vivo = true
    carregarClubExtraOferta(supabase, clienteId).then(d => { if (vivo) setO(d) })
    return () => { vivo = false }
  }, [clienteId])

  // Nome da Club para a frase de uso. Se falhar, a frase sai sem a unidade.
  useEffect(() => {
    if (!o?.unidade_id) return
    let vivo = true
    supabase.from('unidades').select('nome').eq('id', o.unidade_id).maybeSingle()
      .then(({ data }) => { if (vivo && data?.nome) setUnidadeNome(data.nome) })
    return () => { vivo = false }
  }, [o?.unidade_id])

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

  const comprar = () => {
    registrarEventoAppPro(supabase, 'clique', local)
    router.push(`/comprar/checkout?produto=${CLUB_EXTRA_PRODUTO_ID}`)
  }

  // Layout de 05/11/2026: fundo escuro, rosa só na borda, número, barra e botão.
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ background: '#151515', border: `1px solid ${ACCENT}66`, borderRadius: 16, padding: '1.1rem 1.1rem' }}>
        <div style={{ ...bebas, fontSize: 21, color: '#fff', lineHeight: 1.1, marginBottom: 8 }}>
          {mesAtual ? 'SEUS CHECK-INS DO APP ESTÃO SE ESGOTANDO' : 'VOCÊ É DAS QUE MAIS TREINAM NO CLUB'}
        </div>
        {mesAtual && total > 0 ? (
          <>
            <div style={{ fontSize: 13, color: '#cfcfcf', lineHeight: 1.5 }}>
              Você já usou <strong style={{ color: '#fff' }}>{usados} de {total}</strong> treinos do {parceiro}{unidadeNome ? ` no ${unidadeNome}` : ''} este mês.
            </div>
            <div style={{ height: 5, background: '#2a2a2a', borderRadius: 3, overflow: 'hidden', margin: '8px 0 2px' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: ACCENT }} />
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#cfcfcf', lineHeight: 1.5 }}>
            No mês passado você usou quase todos os check-ins do seu app. Para não ficar sem treinar, você pode ter créditos extras com um valor exclusivo para quem treina com a gente com frequência.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
          <span style={{ ...bebas, fontSize: 38, color: ACCENT, lineHeight: 1 }}>4</span>
          <span style={{ fontSize: 14, color: '#eee' }}>treinos extras</span>
          <span style={{ marginLeft: 'auto', ...bebas, fontSize: 22, color: '#fff' }}>R$ 99,90</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#999', textAlign: 'right', marginBottom: 6 }}>à vista · você mantém seu {parceiro}</div>
        <Item icone="✓">Não utiliza seu check in do dia</Item>
        <Item icone="✓">Use na Vila Olímpia ou em Pinheiros</Item>
        <Item icone="◷">Válidos por 30 dias</Item>
        <button onClick={comprar} style={{ ...btn, marginTop: 10 }}>Comprar →</button>
      </div>
    </div>
  )
}
