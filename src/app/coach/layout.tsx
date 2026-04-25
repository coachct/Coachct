import SidebarLayout from '@/components/layout/SidebarLayout'

const nav = [
  { label: 'Painel', href: '/coach/painel' },
  { label: 'Alunos', href: '/coach/alunos' },
  { label: 'Registrar aula', href: '/coach/treino' },
  { label: 'Histórico', href: '/coach/historico' },
]

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return <SidebarLayout navItems={nav} role="coach">{children}</SidebarLayout>
}
