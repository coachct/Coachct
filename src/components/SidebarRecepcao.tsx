'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Calendar, Users, LogOut, Zap } from 'lucide-react'

const ACCENT = '#ff2d9b'
const CYAN   = '#00e5ff'

const NAV_CT = [
  { href: '/recepcao/agenda',   label: 'Agenda CT', icon: Calendar },
  { href: '/recepcao/clientes', label: 'Clientes',  icon: Users },
]
const NAV_CLUB = [
  { href: '/recepcao/club', label: 'Aulas Club', icon: Zap },
]

export default function SidebarRecepcao() {
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function sair() {
    await supabase.auth.signOut()
    router.push('/equipe')
  }

  function NavItem({ href, label, icon: Icon, cor = ACCENT }: { href: string; label: string; icon: any; cor?: string }) {
    const ativo = pathname === href || pathname.startsWith(href + '/')
    return (
      <button onClick={() => router.push(href)}
        style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10,
          background: ativo ? `${cor}20` : 'transparent', border:'none', cursor:'pointer',
          width:'100%', transition:'background .15s' }}>
        <Icon size={18} color={ativo ? cor : '#ffffff55'} />
        <span style={{ fontSize:13, fontWeight:500, color: ativo ? cor : '#ffffff66', fontFamily:"'DM Sans', sans-serif" }}>
          {label}
        </span>
        {ativo && <div style={{ marginLeft:'auto', width:6, height:6, borderRadius:'50%', background: cor }} />}
      </button>
    )
  }

  return (
    <div style={{ width:200, background:'#0f0f1a', display:'flex', flexDirection:'column',
      position:'fixed', top:0, left:0, bottom:0, zIndex:50 }}>

      <div style={{ padding:'24px 20px 20px', borderBottom:'1px solid #ffffff10' }}>
        <div style={{ fontFamily:"'Bebas Neue', sans-serif", fontSize:22, color:'#fff', letterSpacing:2 }}>
          JUST<span style={{ color: ACCENT }}>CT</span>
        </div>
        <div style={{ fontSize:11, color:'#ffffff44', marginTop:2 }}>Recepção</div>
      </div>

      <nav style={{ flex:1, padding:'16px 10px', display:'flex', flexDirection:'column', gap:4 }}>
        <div style={{ fontSize:9, color:'#ffffff22', letterSpacing:2, fontWeight:700, padding:'0 14px', marginBottom:4, marginTop:4 }}>JUST CT</div>
        {NAV_CT.map(item => <NavItem key={item.href} {...item} cor={ACCENT} />)}

        <div style={{ height:1, background:'#ffffff08', margin:'12px 8px' }} />
        <div style={{ fontSize:9, color:'#ffffff22', letterSpacing:2, fontWeight:700, padding:'0 14px', marginBottom:4 }}>JUSTCLUB</div>
        {NAV_CLUB.map(item => <NavItem key={item.href} {...item} cor={CYAN} />)}
      </nav>

      <div style={{ padding:'12px 10px', borderTop:'1px solid #ffffff10' }}>
        <button onClick={sair}
          style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10,
            background:'transparent', border:'none', cursor:'pointer', width:'100%' }}>
          <LogOut size={18} color="#ffffff33" />
          <span style={{ fontSize:13, color:'#ffffff44', fontFamily:"'DM Sans', sans-serif" }}>Sair</span>
        </button>
      </div>
    </div>
  )
}
