'use client'
import SidebarLayout from '@/components/layout/SidebarLayout'
import { Dumbbell, Footprints, Users, ShoppingCart, BarChart3, UserCog, BookOpen, Settings } from 'lucide-react'
const nav = [
  {
    label: 'Coach CT',
    icon: Dumbbell,
    children: [
      { label: 'Calendário Coach CT', href: '/admin/agenda' },
      { label: 'Escala Coach CT',     href: '/admin/escala' },
      { label: 'Horários populares',  href: '/admin/horarios' },
    ],
  },
  {
    label: 'JustClub',
    icon: Footprints,
    children: [
      { label: 'Cadastrar Aulas',  href: '/admin/justclub' },
      { label: 'Calendário Club',  href: '/admin/justclub/calendario' },
      { label: 'Escala Club',      href: '/admin/justclub/escala-club' },
      { label: 'Mapa de Posições', href: '/admin/posicoes' },
    ],
  },
  {
    label: 'Clientes',
    icon: Users,
    children: [
      { label: 'Clientes',            href: '/admin/clientes' },
      { label: 'Importar Clientes',   href: '/admin/importar' },
      { label: 'Frequência de alunos', href: '/admin/relatorios/frequencia' },
      { label: 'Cobrança No-Show',    href: '/admin/cobranca-noshow' },
    ],
  },
  {
    label: 'Comercial',
    icon: ShoppingCart,
    children: [
      { label: 'Vendas',   href: '/admin/vendas' },
      { label: 'Planos',   href: '/admin/planos' },
      { label: 'Produtos', href: '/admin/produtos' },
    ],
  },
  {
    label: 'Financeiro & Relatórios',
    icon: BarChart3,
    children: [
      { label: 'Faturamento & Margem', href: '/admin/financeiro' },
      { label: 'Pagamentos',           href: '/admin/relatorios/pagamentos' },
      { label: 'Custo × Retorno',      href: '/admin/relatorios/custo' },
      { label: 'Analytics de Coaches', href: '/admin/analytics' },
    ],
  },
  {
    label: 'Coaches',
    icon: UserCog,
    children: [
      { label: 'Coaches',       href: '/admin/coaches' },
      { label: 'Pagto Coaches', href: '/admin/relatorios/pagamentos-coaches' },
    ],
  },
  {
    label: 'Treinos (Ju)',
    icon: BookOpen,
    children: [
      { label: 'Biblioteca de exercícios', href: '/ju/biblioteca' },
      { label: 'Biblioteca de treinos',    href: '/ju/montar' },
      { label: 'Treinos do mês',           href: '/ju/treinos' },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings,
    children: [
      { label: 'Unidades',    href: '/admin/unidades' },
      { label: 'Permissões',  href: '/admin/permissoes' },
      { label: 'Trocar senha', href: '/trocar-senha' },
    ],
  },
]
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout navItems={nav} role="admin" rolesPermitidos={['admin', 'coordenadora']}>
      {children}
    </SidebarLayout>
  )
}
