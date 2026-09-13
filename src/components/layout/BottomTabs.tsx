'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Users, BarChart3, Dumbbell, Footprints, Menu } from 'lucide-react'

// Abas fixas do rodapé no MOBILE. Não repetem os atalhos da dashboard;
// a dashboard volta pelo "Just Club & CT" do header.
// "Mais" reabre o drawer com o menu completo (nada do menu atual se perde).
const TABS = [
  { label: 'Clientes',           href: '/admin/clientes',            icon: Users },
  { label: 'Financeiro',         href: '/admin/financeiro',          icon: BarChart3 },
  { label: 'Relatório CT',       href: '/admin/relatorios/coach-ct', icon: Dumbbell },
  { label: 'Relatório Club',     href: '/admin/justclub/relatorio',  icon: Footprints },
]

export default function BottomTabs({ onMore, menuAberto }: { onMore: () => void; menuAberto: boolean }) {
  const pathname = usePathname()

  function ativo(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {TABS.map(t => {
          const Icon = t.icon
          const on = !menuAberto && ativo(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-0.5 py-2.5 min-h-[56px] transition-colors',
                on ? 'text-[#ff2d9b]' : 'text-gray-400 active:text-gray-600'
              )}
            >
              <Icon size={20} className="flex-shrink-0" />
              <span className={cn('text-[10px] leading-tight text-center', on && 'font-semibold')}>{t.label}</span>
            </Link>
          )
        })}
        <button
          onClick={onMore}
          className={cn(
            'flex flex-col items-center justify-center gap-1 px-0.5 py-2.5 min-h-[56px] transition-colors',
            menuAberto ? 'text-[#ff2d9b]' : 'text-gray-400 active:text-gray-600'
          )}
        >
          <Menu size={20} className="flex-shrink-0" />
          <span className={cn('text-[10px] leading-tight text-center', menuAberto && 'font-semibold')}>Mais</span>
        </button>
      </div>
    </nav>
  )
}
