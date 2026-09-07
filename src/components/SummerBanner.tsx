'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import SummerToggle from './SummerToggle'
import {
  CAMPANHA_SUMMER, dentroDaJanela, dataCurta, reais,
  BANNER_TAG_PREFIXO, BANNER_TITULO, BANNER_DAYS, BANNER_PRECO_2, BANNER_CTA,
} from '@/lib/summer'

const ACCENT = '#ff2d9b'

// Banner do Summer Mode na home. Some sozinho fora da janela de venda
// (venda_inicio / venda_fim dos produtos da campanha) — quem manda é a data,
// não o deploy. Sem produto na janela, não renderiza nada e a home fica
// exatamente como era.
export default function SummerBanner() {
  const router = useRouter()
  const supabase = createClient()
  const [produtos, setProdutos] = useState<any[]>([])

  useEffect(() => {
    let vivo = true
    async function carregar() {
      const { data } = await supabase
        .from('produtos')
        .select('id, nome, valor, creditos_por_venda, max_parcelas, bonus_creditos, venda_inicio, venda_fim')
        .eq('campanha', CAMPANHA_SUMMER)
        .eq('ativo', true)
        .eq('visivel_site', true)
      if (vivo) setProdutos((data || []).filter(p => dentroDaJanela(p)))
    }
    carregar()
    return () => { vivo = false }
  }, [])

  if (!produtos.length) return null

  const lista = [...produtos].sort(
    (a, b) => Number(a.creditos_por_venda || 0) - Number(b.creditos_por_venda || 0)
  )

  const menorPorTreino = Math.min(
    ...lista.map(p => Number(p.valor) / (Number(p.creditos_por_venda) || 1))
  )
  const maxParcelas = Math.max(...lista.map(p => Number(p.max_parcelas) || 1))
  const inicio = lista[0]?.venda_inicio
  const fim    = lista[0]?.venda_fim

  // Uma linha por pacote; a menção às parcelas fecha a última.
  const linhas = lista.map((p, i) => {
    const base = `${p.creditos_por_venda} treinos · ${reais(Number(p.valor))}${p.bonus_creditos ? ` · +${p.bonus_creditos} bônus` : ''}`
    const ultima = i === lista.length - 1
    return ultima && maxParcelas > 1 ? `${base} · em até ${maxParcelas}x` : base
  })

  return (
    <div className="smb-wrap" onClick={() => router.push('/summer-mode')}>
      <style>{`
        .smb-wrap { max-width: 1100px; margin: 0 auto; padding: 2.5rem 2.5rem 0; cursor: pointer; }
        .smb-card {
          background: linear-gradient(135deg, #111 0%, #1a0a14 100%);
          border: 1.5px solid ${ACCENT}55; border-radius: 20px;
          padding: 2.5rem 2.25rem; transition: all .25s; text-align: center;
        }
        .smb-wrap:hover .smb-card { border-color: ${ACCENT}; box-shadow: 0 12px 40px -12px ${ACCENT}55; }
        .smb-tag {
          font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 2px;
          text-transform: uppercase; color: ${ACCENT}; margin-bottom: 1.5rem;
        }
        .smb-titulo {
          font-family: 'Bebas Neue', sans-serif; letter-spacing: 2px; line-height: 1;
          font-size: clamp(38px, 6vw, 60px); color: #fff; margin-bottom: 0.75rem;
        }
        .smb-switch {
          display: flex; align-items: center; justify-content: center; gap: 14px;
          margin-bottom: 1rem;
        }
        .smb-off {
          font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 2px;
          color: #555; text-transform: uppercase;
        }
        .smb-on {
          font-family: 'Bebas Neue', sans-serif; font-size: clamp(38px, 6vw, 60px);
          letter-spacing: 2px; line-height: 1; color: ${ACCENT}; text-shadow: 0 0 30px ${ACCENT}88;
        }
        .smb-days {
          font-family: 'Bebas Neue', sans-serif; font-size: clamp(18px, 2.4vw, 26px);
          color: #fff; letter-spacing: 6px; margin-bottom: 1.75rem;
        }
        .smb-preco {
          font-family: 'Bebas Neue', sans-serif; font-size: clamp(26px, 3.4vw, 38px);
          line-height: 1.15; letter-spacing: 1px; margin-bottom: 1.75rem;
        }
        .smb-cta {
          background: ${ACCENT}; color: #fff; border: none; border-radius: 10px;
          padding: 0.9rem 2.25rem; font-weight: 700; font-size: 15px; cursor: pointer;
          font-family: 'DM Sans', sans-serif; letter-spacing: 0.5px; transition: opacity .2s;
        }
        .smb-cta:hover { opacity: .85; }
        .smb-resumo {
          font-family: 'DM Mono', monospace; font-size: 11px; color: #666;
          margin-top: 1.5rem; line-height: 1.9;
        }
        @media (max-width: 768px) {
          .smb-wrap { padding: 2rem 1.25rem 0; }
          .smb-card { padding: 2rem 1.25rem; border-radius: 16px; }
          .smb-cta  { width: 100%; }
          .smb-days { letter-spacing: 4px; }
        }
      `}</style>

      <div className="smb-card">
        <div className="smb-tag">{BANNER_TAG_PREFIXO} · {dataCurta(inicio)} → {dataCurta(fim)}</div>

        <div className="smb-titulo">{BANNER_TITULO}</div>

        <div className="smb-switch">
          <span className="smb-off">OFF</span>
          <SummerToggle on height={44} />
          <span className="smb-on">ON</span>
        </div>

        <div className="smb-days">{BANNER_DAYS}</div>

        <div className="smb-preco">
          <span style={{ color: ACCENT }}>TREINOS A PARTIR DE {reais(menorPorTreino)}</span><br />
          <span style={{ color: '#fff' }}>{BANNER_PRECO_2}</span>
        </div>

        <button
          className="smb-cta"
          onClick={e => { e.stopPropagation(); router.push('/summer-mode') }}
        >
          {BANNER_CTA}
        </button>

        <div className="smb-resumo">
          {linhas.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  )
}
