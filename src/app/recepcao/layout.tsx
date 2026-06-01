'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { dashboardDoRole, Role } from '@/lib/auth-redirect'
import SidebarRecepcao from '@/components/SidebarRecepcao'
import { Menu } from 'lucide-react'

const ROLES_PERMITIDOS: Role[] = ['recepcao']
const ACCENT = '#ff2d9b'

export default function RecepcaoLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil, loading } = useAuth()
  const router = useRouter()
  const [menuAberto, setMenuAberto] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!user) { router.push('/equipe'); return }
    if (perfil && perfil.role && !ROLES_PERMITIDOS.includes(perfil.role as Role)) {
      router.push(dashboardDoRole(perfil.role))
    }
  }, [user, perfil, loading])

  if (loading || !user || !perfil || !ROLES_PERMITIDOS.includes(perfil.role as Role)) {
    return (
      <div style={{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center', background:'#0f0f1a' }}>
        <div style={{ width:32, height:32, border:'4px solid #ff2d9b', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#f3f4f6' }}>
      <style>{`
        .recepcao-sidebar { transform: translateX(-100%); transition: transform .25s ease; }
        .recepcao-sidebar.aberto { transform: translateX(0); }
        .recepcao-topbar { display: flex; }
        .recepcao-overlay { display: none; }
        .recepcao-overlay.aberto { display: block; }
        .recepcao-content { margin-left: 0; padding-top: 52px; }
        @media (min-width: 768px) {
          .recepcao-sidebar { transform: translateX(0) !important; }
          .recepcao-topbar { display: none !important; }
          .recepcao-overlay { display: none !important; }
          .recepcao-content { margin-left: 200px; padding-top: 0; }
        }
      `}</style>

      {/* Barra fina (somente mobile) */}
      <div className="recepcao-topbar" style={{
        position:'fixed', top:0, left:0, right:0, height:52, zIndex:40,
        background:'#0f0f1a', borderBottom:'1px solid #ffffff10',
        alignItems:'center', gap:12, padding:'0 16px' }}>
        <button onClick={() => setMenuAberto(true)} aria-label="Abrir menu"
          style={{ background:'transparent', border:'none', cursor:'pointer', padding:4, display:'flex' }}>
          <Menu size={22} color="#fff" />
        </button>
        <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:18, color:'#fff', letterSpacing:2 }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
          <span style={{ fontSize:11, color:'#ffffff44', marginLeft:8, fontFamily:"'DM Sans', sans-serif", letterSpacing:0 }}>Recepção</span>
        </div>
      </div>

      {/* Overlay (somente mobile, quando aberto) */}
      <div className={`recepcao-overlay${menuAberto ? ' aberto' : ''}`}
        onClick={() => setMenuAberto(false)}
        style={{ position:'fixed', inset:0, background:'#00000066', zIndex:45 }} />

      <SidebarRecepcao open={menuAberto} onClose={() => setMenuAberto(false)} />

      <div className="recepcao-content" style={{ flex:1, minHeight:'100vh' }}>
        {children}
      </div>
    </div>
  )
}
