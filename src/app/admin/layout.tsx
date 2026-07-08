'use client'
import SidebarLayout from '@/components/layout/SidebarLayout'
import { Dumbbell, Footprints, Clock, Users, ShoppingCart, BarChart3, UserCog, BookOpen, Settings, MessageCircle, Instagram } from 'lucide-react'
const nav = [
  {
    label: 'Coach CT',
    icon: Dumbbell,
    children: [
      { label: 'Calendário Coach CT', href: '/admin/agenda' },
      { label: 'Escala Coach CT',     href: '/admin/escala' },
      { label: 'Horários populares',  href: '/admin/horarios' },
      { label: 'Musculação Livre',    href: '/admin/musculacao-livre' },
      { label: 'Relatório Coach CT',  href: '/admin/relatorios/coach-ct' },
    ],
  },
  {
    label: 'JustClub',
    icon: Footprints,
    children: [
      { label: 'Cadastrar Aulas',  href: '/admin/justclub' },
      { label: 'Calendário Club',  href: '/admin/justclub/calendario' },
      { label: 'Escala Club',      href: '/admin/justclub/escala-club' },
      { label: 'Relatório Club',   href: '/admin/justclub/relatorio' },
      { label: 'Reservas TotalPass', href: '/admin/justclub/reservas-totalpass' },
      { label: 'Reservas Wellhub', href: '/admin/justclub/reservas-wellhub' },
      { label: 'Mapa de Posições', href: '/admin/posicoes' },
    ],
  },
  {
    label: 'Fila de espera',
    icon: Clock,
    children: [
      { label: 'Fila de espera', href: '/admin/fila-espera' },
    ],
  },
  {
    label: 'Clientes',
    icon: Users,
    children: [
      { label: 'Clientes',            href: '/admin/clientes' },
      { label: 'Importar Clientes',   href: '/admin/importar' },
      { label: 'Frequência de alunos', href: '/admin/relatorios/frequencia' },
      { label: 'Clientes sem treinar', href: '/admin/relatorios/inativos' },
      { label: 'Avaliações de aula',  href: '/admin/avaliacoes' },
      { label: 'Cobrança No-Show',    href: '/admin/cobranca-noshow' },
    ],
  },
  {
    label: 'WhatsApp',
    icon: MessageCircle,
    children: [
      { label: 'Conversas', href: '/admin/conversas' },
    ],
  },
  {
    label: 'Instagram',
    icon: Instagram,
    children: [
      { label: 'Conversas', href: '/admin/conversas-instagram' },
    ],
  },
  {
    label: 'Comercial',
    icon: ShoppingCart,
    children: [
      { label: 'Vendas',   href: '/admin/vendas' },
      { label: 'Planos',   href: '/admin/planos' },
      { label: 'Produtos', href: '/admin/produtos' },
      { label: 'Cupons',   href: '/admin/cupons' },
    ],
  },
  {
    label: 'Financeiro & Relatórios',
    icon: BarChart3,
    children: [
      { label: 'Visão Geral',          href: '/admin/financeiro' },
      { label: 'Receitas',             href: '/admin/financeiro/receitas' },
      { label: 'Valores check-in',     href: '/admin/financeiro/valores-checkin' },
      { label: 'Check-ins Apps',       href: '/admin/financeiro/checkins-wellhub' },
      { label: 'Contas a Pagar',       href: '/admin/financeiro/contas-a-pagar' },
      { label: 'Recorrentes',          href: '/admin/financeiro/recorrentes' },
      { label: 'Funcionários',         href: '/admin/financeiro/funcionarios' },
      { label: 'Fornecedores',         href: '/admin/financeiro/fornecedores' },
      { label: 'Pagamentos',           href: '/admin/relatorios/pagamentos' },
      { label: 'Custo × Retorno',      href: '/admin/relatorios/custo' },
      { label: 'Custo × Retorno · Club', href: '/admin/relatorios/custo-club' },
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
