import SidebarLayout from '@/components/layout/SidebarLayout'

const nav = [
  { label: 'Biblioteca de exercícios', href: '/ju/biblioteca' },
  { label: 'Biblioteca de treinos', href: '/ju/montar' },
  { label: 'Treinos do mês', href: '/ju/treinos' },
  { label: 'Treinos híbridos', href: '/ju/hibrido' },
  { label: 'Calendário híbrido', href: '/ju/hibrido/calendario' },
  { label: 'Trocar senha', href: '/trocar-senha' },
]

export default function JuLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout navItems={nav} role="admin" rolesPermitidos={['admin', 'coordenadora']}>
      {children}
    </SidebarLayout>
  )
}
