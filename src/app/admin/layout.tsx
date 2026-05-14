import SidebarLayout from '@/components/layout/SidebarLayout'

const nav = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Agenda', href: '/admin/agenda' },
  { label: 'Clientes', href: '/admin/clientes' },
  { label: 'Unidades', href: '/admin/unidades' },
  { label: 'Planos', href: '/admin/planos' },
  { label: 'Produtos', href: '/admin/produtos' },
  { label: 'Permissões', href: '/admin/permissoes' },
  { label: 'Faturamento & Margem', href: '/admin/financeiro' },
  { label: 'Coaches', href: '/admin/coaches' },
  { label: 'Escala', href: '/admin/escala' },
  { label: 'Custo × Retorno', href: '/admin/relatorios/custo' },
  { label: 'Pagamentos', href: '/admin/relatorios/pagamentos' },
  { label: 'Horários populares', href: '/admin/horarios' },
  { label: 'Frequência de alunos', href: '/admin/relatorios/frequencia' },
  { label: 'Biblioteca de exercícios', href: '/ju/biblioteca' },
  { label: 'Biblioteca de treinos', href: '/ju/montar' },
  { label: 'Treinos do mês', href: '/ju/treinos' },
  { label: 'Trocar senha', href: '/trocar-senha' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout navItems={nav} role="admin" rolesPermitidos={['admin', 'coordenadora']}>
      {children}
    </SidebarLayout>
  )
}
