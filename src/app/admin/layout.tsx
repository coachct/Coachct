import SidebarLayout from '@/components/layout/SidebarLayout'
const nav = [
  { label: 'Dashboard',               href: '/admin/dashboard' },
  { label: 'Calendário Coach CT',     href: '/admin/agenda' },
  { label: 'Clientes',                href: '/admin/clientes' },
  { label: 'Cobrança No-Show',        href: '/admin/cobranca-noshow' },
  { label: 'Unidades',                href: '/admin/unidades' },
  { label: 'Planos',                  href: '/admin/planos' },
  { label: 'Produtos',                href: '/admin/produtos' },
  { label: 'Vendas Online',           href: '/admin/vendas' },
  { label: 'Permissões',              href: '/admin/permissoes' },
  { label: 'Faturamento & Margem',    href: '/admin/financeiro' },
  { label: 'Coaches',                 href: '/admin/coaches' },
  { label: 'Escala Coach CT',         href: '/admin/escala' },
  { label: '─ JustClub',             href: '/admin/justclub' },
  { label: 'Calendário Club',         href: '/admin/justclub/calendario' },
  { label: 'Escala Club',             href: '/admin/justclub/escala-club' },
  { label: 'Mapa de Posições',        href: '/admin/posicoes' },
  { label: 'Importar Clientes',       href: '/admin/importar' },
  { label: 'Analytics de Coaches',   href: '/admin/analytics' },
  { label: 'Custo × Retorno',        href: '/admin/relatorios/custo' },
  { label: 'Pagamentos',             href: '/admin/relatorios/pagamentos' },
  { label: 'Pagto Coaches',          href: '/admin/relatorios/pagamentos-coaches' },
  { label: 'Horários populares',     href: '/admin/horarios' },
  { label: 'Frequência de alunos',   href: '/admin/relatorios/frequencia' },
  { label: 'Biblioteca de exercícios', href: '/ju/biblioteca' },
  { label: 'Biblioteca de treinos',  href: '/ju/montar' },
  { label: 'Treinos do mês',         href: '/ju/treinos' },
  { label: 'Trocar senha',           href: '/trocar-senha' },
]
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout navItems={nav} role="admin" rolesPermitidos={['admin', 'coordenadora']}>
      {children}
    </SidebarLayout>
  )
}
