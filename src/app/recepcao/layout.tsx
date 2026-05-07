'use client'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Calendar, Users, LogOut } from 'lucide-react'

const NAV = [
  { href: '/recepcao/agenda',   label: 'Agenda',   icon: Calendar },
  { href: '/recepcao/clientes', label: 'Clientes', icon: Users },
]

export default function RecepcaoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function sair() {
    await supabase.auth.signOut()
    router.push('/equipe')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f4f6' }}>

      {/* Sidebar */}
      <div style={{
        width: 200,
        background: '#0f0f1a',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #ffffff10' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: 2 }}>
            JUST<span style={{ color: '#ff2d9b' }}>CT</span>
          </div>
          <div style={{ fontSize: 11, color: '#ffffff44', marginTop: 2 }}>Recepção</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map(item => {
            const ativo = pathname === item.href
            const Icon = item.icon
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: ativo ? '#ff2d9b20' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'background .15s',
                }}
              >
                <Icon size={18} color={ativo ? '#ff2d9b' : '#ffffff55'} />
                <span style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: ativo ? '#ff2d9b' : '#ffffff66',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {item.label}
                </span>
                {ativo && (
                  <div style={{
                    marginLeft: 'auto',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#ff2d9b',
                  }} />
                )}
              </button>
            )
          })}
        </nav>

        {/* Sair */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid #ffffff10' }}>
          <button
            onClick={sair}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            <LogOut size={18} color="#ffffff33" />
            <span style={{ fontSize: 13, color: '#ffffff44', fontFamily: "'DM Sans', sans-serif" }}>Sair</span>
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ marginLeft: 200, flex: 1, minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  )
}
