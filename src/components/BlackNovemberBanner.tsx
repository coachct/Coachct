'use client'
import { useRouter } from 'next/navigation'
import { rastrear } from '@/lib/rastreio'
import {
  CAMPANHA_BF, bfNoAr, BANNER_BN_TAG, BANNER_BN_POR_AI, BANNER_BN_ETIQUETA,
  BANNER_BN_JUST, BANNER_BN_REAL, BANNER_BN_REAL_2, BANNER_BN_APOIO, BANNER_BN_CTA,
} from '@/lib/blackFriday'

const ROSA = '#c46a94'

// Banner da Black November na home. Some sozinho depois de 30/11 (data, não
// deploy). O banner inteiro leva pro /comprar, onde a seção da campanha está
// no topo.
export default function BlackNovemberBanner() {
  const router = useRouter()
  if (!bfNoAr()) return null

  function ir() {
    rastrear('clique_banner', { campanha: CAMPANHA_BF })
    router.push('/comprar')
  }

  return (
    <div className="bnb-wrap" onClick={ir}>
      <style>{`
        .bnb-wrap { max-width: 1100px; margin: 0 auto; padding: 2.5rem 2.5rem 0; cursor: pointer; }
        .bnb-card {
          background: #0b0b0b; border: 1px solid #262626; border-radius: 20px;
          padding: 2.5rem 2.5rem; transition: border-color .25s, transform .25s;
        }
        .bnb-wrap:hover .bnb-card { border-color: ${ROSA}; transform: translateY(-3px); }
        .bnb-tag {
          font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 2px;
          text-transform: uppercase; color: ${ROSA}; margin-bottom: 1.75rem;
        }
        .bnb-linha { display: flex; align-items: center; gap: 2.5rem; flex-wrap: wrap; }
        .bnb-porai { transform: rotate(-3deg); }
        .bnb-porai-rot {
          font-family: 'Bebas Neue', sans-serif; font-size: clamp(22px, 2.6vw, 30px);
          letter-spacing: 2px; color: #888; margin-bottom: 0.5rem;
        }
        .bnb-etiqueta {
          border: 1.5px dashed #555; border-radius: 10px; padding: 1rem 1.4rem;
          font-family: 'DM Mono', monospace; font-size: clamp(14px, 1.6vw, 18px); color: #999;
        }
        .bnb-just {
          flex: 1; min-width: 260px;
          font-family: 'Bebas Neue', sans-serif; font-size: clamp(40px, 5.6vw, 64px);
          letter-spacing: 2px; line-height: 1; color: #fff;
        }
        .bnb-apoio { font-size: 16px; color: #bbb; margin: 1.75rem 0 1.5rem; line-height: 1.6; font-family: 'DM Sans', sans-serif; }
        .bnb-cta {
          background: #fff; color: #111; border: none; border-radius: 10px;
          padding: 0.9rem 2rem; font-weight: 700; font-size: 15px; cursor: pointer;
          font-family: 'DM Sans', sans-serif; transition: opacity .2s;
        }
        .bnb-cta:hover { opacity: .85; }
        @media (max-width: 768px) {
          .bnb-wrap { padding: 2rem 1.25rem 0; }
          .bnb-card { padding: 2rem 1.25rem; border-radius: 16px; }
          .bnb-linha { gap: 1.5rem; }
          .bnb-cta { width: 100%; }
        }
      `}</style>

      <div className="bnb-card">
        <div className="bnb-tag">{BANNER_BN_TAG}</div>

        <div className="bnb-linha">
          <div className="bnb-porai">
            <div className="bnb-porai-rot">{BANNER_BN_POR_AI}</div>
            <div className="bnb-etiqueta">{BANNER_BN_ETIQUETA}</div>
          </div>
          <div className="bnb-just">
            {BANNER_BN_JUST}<br />
            <span style={{ color: ROSA }}>{BANNER_BN_REAL}<br />{BANNER_BN_REAL_2}</span>
          </div>
        </div>

        <div className="bnb-apoio">{BANNER_BN_APOIO}</div>

        <button className="bnb-cta" onClick={e => { e.stopPropagation(); ir() }}>
          {BANNER_BN_CTA}
        </button>
      </div>
    </div>
  )
}
