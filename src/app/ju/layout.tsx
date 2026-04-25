import SidebarLayout from '@/components/layout/SidebarLayout'

const nav = [
  { label: 'Biblioteca de exercícios', href: '/ju/biblioteca' },
  { label: 'Montar treinos', href: '/ju/montar' },
  { label: 'Treinos do mês', href: '/ju/treinos' },
]

export default function JuLayout({ children }: { children: React.ReactNode }) {
  return <SidebarLayout navItems={nav} role="coordenadora">{children}</SidebarLayout>
}
