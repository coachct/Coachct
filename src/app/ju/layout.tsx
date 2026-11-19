import SidebarLayout from '@/components/layout/SidebarLayout'

const nav = [
  { label: 'Biblioteca de exercícios', href: '/ju/biblioteca' },
  { label: 'Biblioteca de treinos', href: '/ju/montar' },
  { label: 'Treinos do mês', href: '/ju/treinos' },
  // Categoria própria do Running & Hybrid, separada dos treinos da musculação
  {
    label: 'Running & Hybrid',
    children: [
      { label: 'Treinos', href: '/ju/hibrido' },
      { label: 'Calendário', href: '/ju/hibrido/calendario' },
      // 'TV da sala' (/hibrido-tv) entra junto com a fase 2
    ],
  },
  { label: 'Trocar senha', href: '/trocar-senha' },
]

export default function JuLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout navItems={nav} role="admin" rolesPermitidos={['admin', 'coordenadora']}>
      {children}
    </SidebarLayout>
  )
}
