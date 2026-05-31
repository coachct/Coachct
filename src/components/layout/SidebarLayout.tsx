'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Menu, X, LogOut, Home, ChevronDown } from 'lucide-react'
import { dashboardDoRole, Role } from '@/lib/auth-redirect'

interface NavItem {
  label: string
  href?: string
  icon?: React.ElementType
  children?: NavItem[]
}

interface SidebarLayoutProps {
  children: React.ReactNode
  navItems: NavItem[]
  role: 'admin' | 'coach' | 'coordenadora' | 'recepcao'
  rolesPermitidos: Role[]
}

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  coach: 'Coach',
  coordenadora: 'Coordenadora',
  recepcao: 'Recepção',
}
const roleColor: Record<string, string> = {
  admin: 'bg-primary-400',
  coach: 'bg-blue-500',
  coordenadora: 'bg-purple-500',
  recepcao: 'bg-green-500',
}
const homeHref: Record<string, string> = {
  admin: '/admin/dashboard',
  coach: '/coach/painel',
  coordenadora: '/ju/biblioteca',
  recepcao: '/recepcao/agenda',
}

export default function SidebarLayout({ children, navItems, role, rolesPermitidos }: SidebarLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, perfil, signOut, loading } = useAuth()
  const [open, setOpen] = useState(false)

  function rotaAtiva(href?: string) {
    if (!href) return false
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Abre por padrão o grupo que contém a rota atual
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const ativos: string[] = []
    for (const it of navItems) {
      if (it.children?.some(c => rotaAtiva(c.href))) ativos.push(it.label)
    }
    return ativos
  })
  function toggleGroup(label: string) {
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
  }

  // PROTEÇÃO DE ROTA
  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push('/equipe')
      return
    }
    if (perfil && perfil.role && !rolesPermitidos.includes(perfil.role as Role)) {
      router.push(dashboardDoRole(perfil.role))
    }
  }, [user, perfil, loading, rolesPermitidos])

  async function handleSignOut() {
    await signOut()
    window.location.href = '/equipe'
  }

  const home = homeHref[role] || '/'

  // Loader enquanto valida — evita flash de tela errada
  if (loading || !user || !perfil || !rolesPermitidos.includes(perfil.role as Role)) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Link "folha" — usado para itens sem submenu (e pelos perfis que mandam lista plana)
  const NavLeaf = ({ item }: { item: NavItem }) => {
    const Icon = item.icon
    return (
      <Link
        href={item.href || '#'}
        onClick={() => setOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
          rotaAtiva(item.href)
            ? 'bg-primary-50 text-primary-800 font-medium border-l-2 border-primary-400 rounded-l-none'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        {Icon && <Icon size={15} className="flex-shrink-0" />}
        {item.label}
      </Link>
    )
  }

  // Grupo — cabeçalho com ícone e fonte maior + subitens recolhíveis
  const NavGroup = ({ item }: { item: NavItem }) => {
    const Icon = item.icon
    const filhos = item.children || []
    const isOpen = openGroups.includes(item.label)
    const filhoAtivo = filhos.some(c => rotaAtiva(c.href))
    return (
      <div>
        <button
          onClick={() => toggleGroup(item.label)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-semibold transition-colors',
            filhoAtivo ? 'text-primary-800' : 'text-gray-700 hover:bg-gray-50'
          )}
        >
          {Icon && <Icon size={17} className="flex-shrink-0" />}
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown size={14} className={cn('flex-shrink-0 text-gray-400 transition-transform', isOpen ? '' : '-rotate-90')} />
        </button>
        {isOpen && (
          <div className="mt-0.5 mb-1.5 space-y-0.5">
            {filhos.map(c => (
              <Link
                key={c.href}
                href={c.href || '#'}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 pl-11 pr-3 py-2 rounded-lg text-[13px] transition-colors',
                  rotaAtiva(c.href)
                    ? 'bg-primary-50 text-primary-800 font-medium border-l-2 border-primary-400 rounded-l-none'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  const NavLinks = () => (
    <nav className="px-2 py-4 space-y-0.5">
      <Link
        href={home}
        onClick={() => setOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors mb-2 border-b border-gray-100 pb-3',
          pathname === home
            ? 'bg-primary-50 text-primary-800 font-medium border-l-2 border-primary-400 rounded-l-none'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        <Home size={14} className="flex-shrink-0" />
        Dashboard
      </Link>
      {navItems.filter(item => item.href !== home).map(item => (
        item.children && item.children.length > 0
          ? <NavGroup key={item.label} item={item} />
          : <NavLeaf key={item.href || item.label} item={item} />
      ))}
    </nav>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="hidden md:flex w-56 flex-col bg-white border-r border-gray-100 shrink-0 h-screen">
        <div className="px-4 py-4 border-b border-gray-100 shrink-0">
          <Link href={home} className="text-primary-800 font-semibold text-sm tracking-wider hover:text-primary-600 transition-colors">
            ● COACH CT
          </Link>
          <div className="flex items-center gap-2 mt-3">
            <span className={cn('w-2 h-2 rounded-full', roleColor[role])} />
            <span className="text-xs text-gray-500">{roleLabel[role]}</span>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="p-3 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-medium text-primary-800">
              {perfil?.nome?.slice(0,2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">{perfil?.nome}</div>
            </div>
            <button onClick={handleSignOut} className="p-1 text-gray-400 hover:text-gray-700" title="Sair">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-primary-900 h-14 flex items-center justify-between px-4">
        <Link href={home} className="text-primary-200 font-semibold text-sm tracking-wider flex items-center gap-2">
          <Home size={16} />
          ● COACH CT
        </Link>
        <button onClick={() => setOpen(!open)} className="text-primary-200 p-1">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="relative w-64 bg-white flex flex-col h-full shadow-xl">
            <div className="px-4 py-4 border-b border-gray-100 mt-14 shrink-0">
              <div className="text-xs text-gray-500">{roleLabel[role]} · {perfil?.nome}</div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <NavLinks />
            </div>
            <div className="p-4 border-t border-gray-100 shrink-0 bg-white">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg py-3 text-sm font-medium transition-colors"
              >
                <LogOut size={14} /> Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="max-w-5xl mx-auto p-4 md:p-6 pb-24 md:pb-6">
          {children}
        </div>
      </main>
    </div>
  )
}
