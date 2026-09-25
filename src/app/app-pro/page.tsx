'use client'
// Página de compra do App Coach CT PRO (layout 4 aprovado pelo Ricardo em
// 24/09/2026). Só para quem treina Coach CT pelo app — quem decide é a RPC
// app_pro_oferta; a API de pagamento confere de novo antes de cobrar.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import SiteHeader from '@/components/SiteHeader'
import { carregarAppProOferta, registrarEventoAppPro, APP_PRO_PRODUTO_ID, type AppProOferta } from '@/lib/appPro'

const ACCENT = '#ff2d9b'

const LINHAS: { label: string; app: string; pro: string; appApagado?: boolean }[] = [
  { label: 'Treinos/mês', app: '8 ou 10', pro: '+4 extras' },
  { label: 'Antecedência', app: '7 dias', pro: '14 dias' },
  { label: 'Cancelamento', app: '12h', pro: '3h' },
  { label: 'Escolher coach', app: '✗', pro: '✓', appApagado: true },
  { label: 'Fila de espera', app: 'normal', pro: 'prioridade' },
]

export default function AppProPage() {
  const router = useRouter()
  const supabase = createClient()
  const { user, perfil, loading: loadingAuth } = useAuth()
  const [oferta, setOferta] = useState<AppProOferta | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (loadingAuth) return
    if (!user) { router.push(`/login?redirect=${encodeURIComponent('/app-pro')}`); return }
    if (!perfil) return
    ;(async () => {
      const { data: cli } = await supabase.from('clientes').select('id').eq('user_id', perfil.id).maybeSingle()
      const o = cli?.id ? await carregarAppProOferta(supabase, cli.id) : null
      setOferta(o)
      setCarregando(false)
      if (o?.pode_comprar) registrarEventoAppPro(supabase, 'visto', 'pagina')
    })()
  }, [loadingAuth, user?.id, perfil?.id])

  function comprar() {
    registrarEventoAppPro(supabase, 'clique', 'pagina')
    router.push(`/comprar/checkout?produto=${APP_PRO_PRODUTO_ID}`)
  }

  const linha: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', padding: '0.7rem 1rem', borderTop: '1px solid #1a1a1a', fontSize: 13 }
  const bebas: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#f0f0f0', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
      <SiteHeader />

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '96px 1rem 3rem' }}>
        {carregando ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div style={{ width: 32, height: 32, border: `4px solid ${ACCENT}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !oferta?.pode_comprar ? (
          <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 14, padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ ...bebas, fontSize: 22, color: '#fff', marginBottom: 6 }}>APP COACH CT PRO</div>
            <div style={{ fontSize: 14, color: '#aaa', lineHeight: 1.6, marginBottom: '1rem' }}>
              {oferta?.tem_app_pro
                ? 'Você já tem o App Coach CT PRO ativo.'
                : 'Este plano é exclusivo para quem treina no Coach CT pelo Wellhub ou TotalPass.'}
            </div>
            <button onClick={() => router.push('/minha-conta')} style={{ background: 'transparent', color: '#fff', border: '1px solid #333', borderRadius: 12, padding: '0.7rem 1.25rem', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Voltar para minha conta
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: ACCENT }}>// app coach ct pro</div>
            <div style={{ ...bebas, fontSize: 40, color: '#fff', lineHeight: 1, margin: '8px 0' }}>SEU APP + O MELHOR DO PRO</div>
            <div style={{ fontSize: 14, color: '#999', marginBottom: '1.25rem' }}>Você continua com seu Wellhub ou TotalPass. O PRO soma.</div>

            <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ ...linha, borderTop: 'none', background: '#0f0f0f' }}>
                <span />
                <span style={{ ...bebas, fontSize: 16, color: '#888' }}>SÓ O APP</span>
                <span style={{ ...bebas, fontSize: 16, color: ACCENT }}>APP + PRO</span>
              </div>
              {LINHAS.map(l => (
                <div key={l.label} style={linha}>
                  <span style={{ color: '#aaa' }}>{l.label}</span>
                  <span style={{ color: l.appApagado ? '#444' : '#888' }}>{l.app}</span>
                  <span style={{ color: ACCENT }}>{l.pro}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', margin: '1.5rem 0 4px' }}>
              <span style={{ ...bebas, fontSize: 44, color: '#fff' }}>3X R$ 299</span>
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: '#777', marginBottom: '1rem' }}>
              R$ 897 no trimestre · 12 créditos na hora, acumulam nos 3 meses
            </div>
            <button onClick={comprar} style={{ width: '100%', background: ACCENT, color: '#fff', border: 'none', borderRadius: 12, padding: '0.9rem', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Comprar App PRO
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: '#555', marginTop: 8 }}>PIX ou cartão · ativação imediata</div>
          </>
        )}
      </div>
    </div>
  )
}
