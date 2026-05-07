export type Role = 'admin' | 'coach' | 'coordenadora' | 'recepcao' | 'cliente'

export interface Perfil {
  id: string
  nome: string
  role: Role
  ativo: boolean
  criado_em: string
}

export interface Coach {
  id: string
  user_id: string | null
  nome: string
  cpf: string
  email: string
  contrato: 'CLT' | 'PJ' | 'Autônomo'
  salario_fixo: number
  adicional_por_aula: number
  valor_cliente_aula: number
  ativo: boolean
  criado_em: string
}

export interface CoachHorario {
  id: string
  coach_id: string
  dia_semana: number // 0=Dom..6=Sab
  hora: number
  ativo: boolean
}

export interface Categoria {
  id: string
  nome: string
  ordem: number
}

export interface Exercicio {
  id: string
  categoria_id: string
  nome: string
  numero_maquina: string | null
  series_padrao: number
  reps_padrao: string
  descanso_segundos: number
  observacoes: string | null
  ativo: boolean
  criado_em: string
  categorias?: Categoria
}

export interface Treino {
  id: string
  nome: string
  descricao: string | null
  mes: number
  ano: number
  publicado: boolean
  criado_em: string
  atualizado_em: string
  treino_exercicios?: TreinoExercicio[]
}

export interface TreinoExercicio {
  id: string
  treino_id: string
  exercicio_id: string
  ordem: number
  series_override: number | null
  reps_override: string | null
  descanso_override: number | null
  observacoes_override: string | null
  exercicios?: Exercicio
}

export interface Aluno {
  id: string
  nome: string
  cpf: string
  telefone: string | null
  data_nascimento: string | null
  observacoes: string | null
  ativo: boolean
  cadastrado_por: string | null
  criado_em: string
  atualizado_em: string
}

export interface Aula {
  id: string
  coach_id: string
  aluno_id: string
  treino_id: string | null
  horario_agendado: string
  iniciada_em: string | null
  finalizada_em: string | null
  observacoes: string | null
  status: 'em_andamento' | 'finalizada' | 'cancelada'
  criado_em: string
  coaches?: Coach
  alunos?: Aluno
  treinos?: Treino
}

export interface RegistroCarga {
  id: string
  aula_id: string
  exercicio_id: string
  maquina: string | null
  carga_kg: number | null
  reps_realizadas: string | null
  observacoes: string | null
  salvo_em: string
  exercicios?: Exercicio
}

export interface HistoricoMaquina {
  exercicio_id: string
  maquina: string | null
  aluno_id: string
  aluno_nome: string
  carga_kg: number | null
  reps_realizadas: string | null
  data_aula: string
  coach_id: string
}

// Métricas calculadas
export interface CoachMetrics {
  coach: Coach
  aulas_mes: number
  slots_disponiveis: number
  ocupacao_pct: number
  custo_fixo: number
  custo_variavel: number
  custo_total: number
  faturamento: number
  margem: number
  margem_pct: number
  breakeven_aulas: number
  breakeven_atingido: boolean
}
