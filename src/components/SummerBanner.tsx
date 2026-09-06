'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import SummerToggle from './SummerToggle'
import { CAMPANHA_SUMMER, dentroDaJanela, dataCurta, reais } from '@/lib/summer'

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

  const resumo = lista
    .map(p => `${p.creditos_por_venda} treinos · ${reais(Number(p.valor))}${p.bonus_creditos ? ` · +${p.bonus_creditos} bônus` : ''}`)
    .join('  |  ') + (maxParcelas > 1 ? ` · em até ${maxParcelas}x` : '')

  return (
    <div className="smb-wrap" onClick={() => router.push('/summer-mode')}>
      <style>{`
        .smb-wrap {
          max-width: 1100px; margin: 0 auto; padding: 2.5rem 2.5rem 0;
          cursor: pointer;
        }
        .smb-card {
          background: linear-gradient(135deg, #111 0%, #1a0a14 100%);
          border: 1.5px solid ${ACCENT}55; border-radius: 20px;
          padding: 2rem 2.25rem; transition: all .25s;
        }
        .smb-wrap:hover .smb-card { border-color: ${ACCENT}; box-shadow: 0 12px 40px -12px ${ACCENT}55; }
        .smb-tag {
          font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 2px;
          text-transform: uppercase; color: ${ACCENT}; margin-bottom: 1.25rem;
        }
        .smb-modo {
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          font-family: 'Bebas Neue', sans-serif; letter-spacing: 2px; line-height: 1;
          font-size: clamp(34px, 5vw, 52px); color: #fff; margin-bottom: 0.35rem;
        }
        .smb-on { color: ${ACCENT}; text-shadow: 0 0 30px ${ACCENT}88; }
        .smb-days {
          font-family: 'Bebas Neue', sans-serif; font-size: clamp(18px, 2.4vw, 26px);
          color: #fff; letter-spacing: 6px; margin-bottom: 1.5rem;
        }
        .smb-preco {
          font-family: 'Bebas Neue', sans-serif; font-size: clamp(26px, 3.4vw, 38px);
          line-height: 1.1; letter-spacing: 1px; margin-bottom: 1.75rem;
        }
        .smb-cta {
          background: ${ACCENT}; color: #fff; border: none; border-radius: 10px;
          padding: 0.9rem 2.25rem; font-weight: 700; font-size: 15px; cursor: pointer;
          font-family: 'DM Sans', sans-serif; letter-spacing: 0.5px; transition: opacity .2s;
        }
        .smb-cta:hover { opacity: .85; }
        .smb-resumo {
          font-family: 'DM Mono', monospace; font-size: 11px; color: #666;
          margin-top: 1.25rem; line-height: 1.8;
        }
        @media (max-width: 768px) {
          .smb-wrap { padding: 2rem 1.25rem 0; }
          .smb-card { padding: 1.5rem 1.25rem; border-radius: 16px; }
          .smb-cta  { width: 100%; }
          .smb-days { letter-spacing: 4px; }
        }
      `}</style>

      <div className="smb-card">
        <div className="smb-tag">// dia do cliente · {dataCurta(inicio)} → {dataCurta(fim)}</div>

        <div className="smb-modo">
          <span>SUMMER MODE:</span>
          <SummerToggle on height={34} />
          <span className="smb-on">ON</span>
        </div>

        <div className="smb-days">100 DAYS TO GO</div>

        <div className="smb-preco">
          <span style={{ color: ACCENT }}>TREINOS A PARTIR DE {reais(menorPorTreino)}</span><br />
          <span style={{ color: '#fff' }}>PRA DAR INÍCIO AO SEU PROJETO VERÃO.</span>
        </div>

        <button
          className="smb-cta"
          onClick={e => { e.stopPropagation(); router.push('/summer-mode') }}
        >
          SABER MAIS →
        </button>

        <div className="smb-resumo">{resumo}</div>
      </div>
    </div>
  )
}
