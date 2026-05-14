// Centraliza para onde cada role deve ir após login,
// e também o redirect quando alguém acessa rota errada.

export type Role = 'cliente' | 'admin' | 'coach' | 'coordenadora' | 'recepcao'

export function dashboardDoRole(role: string | null | undefined): string {
  switch (role) {
    case 'cliente':
      return '/minha-conta'
    case 'admin':
      return '/admin'
    case 'coordenadora':
      return '/admin' // coordenadora compartilha o dashboard do admin
    case 'coach':
      return '/coach'
    case 'recepcao':
      return '/recepcao'
    default:
      return '/'
  }
}

// Helper: verifica se um role tem permissão para acessar uma rota
export function podeAcessar(role: string | null | undefined, rolesPermitidos: Role[]): boolean {
  if (!role) return false
  return rolesPermitidos.includes(role as Role)
}
