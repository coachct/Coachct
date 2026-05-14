'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { dashboardDoRole, Role } from '@/lib/auth-redirect'
import SidebarRecepcao from '@/components/SidebarRecepcao'

const ROLES_PERMITIDOS: Role[] = ['recepcao']

export default function RecepcaoLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push('/equipe')
      return
    }
    if (perfil && perfil.role && !ROLES_PERMITIDOS.includes(perfil.role as Role)) {
      router.push(dashboardDoRole(perfil.role))
    }
  }, [user, perfil, loading])

  if (loading || !user || !perfil || !ROLES_PERMITIDOS.includes(perfil.role as Role)) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f0f1a' }}>
        <div style={{
          width: 32, height: 32,
          border: '4px solid #ff2d9b',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f3f4f6' }}>
      <SidebarRecepcao />
      <div style={{ marginLeft: 200, flex: 1, minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  )
}
