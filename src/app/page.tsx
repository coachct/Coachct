'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function HomePage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!perfil) { router.push('/login'); return }

    if (perfil.role === 'admin') router.push('/admin/dashboard')
    else if (perfil.role === 'coach') router.push('/coach/painel')
    else if (perfil.role === 'coordenadora') router.push('/ju/biblioteca')
    else if (perfil.role === 'recepcao') router.push('/recepcao/agenda')
    else if (perfil.role === 'cliente') router.push('/minha-conta')
    else router.push('/login')
  }, [perfil, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
