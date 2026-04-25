import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Coach, CoachMetrics } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmt(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function fmtDec(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value)
}

export function fmtCPF(cpf: string): string {
  const n = cpf.replace(/\D/g, '')
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function maskCPF(cpf: string): string {
  const clean = cpf.replace(/\D/g, '')
  return `***.${clean.slice(3, 6)}.${clean.slice(6, 9)}-**`
}

export function calcCoachMetrics(
  coach: Coach,
  aulasMes: number,
  slotsDisponiveis: number
): CoachMetrics {
  const custoFixo = coach.salario_fixo
  const custoVariavel = coach.adicional_por_aula * aulasMes
  const custoTotal = custoFixo + custoVariavel
  const faturamento = coach.valor_cliente_aula * aulasMes
  const margem = faturamento - custoTotal
  const margemPct = faturamento > 0 ? (margem / faturamento) * 100 : 0
  const margemUnit = coach.valor_cliente_aula - coach.adicional_por_aula
  const breakevenAulas = margemUnit > 0 ? Math.ceil(custoFixo / margemUnit) : Infinity
  const ocupacaoPct = slotsDisponiveis > 0 ? Math.round((aulasMes / slotsDisponiveis) * 100) : 0

  return {
    coach,
    aulas_mes: aulasMes,
    slots_disponiveis: slotsDisponiveis,
    ocupacao_pct: ocupacaoPct,
    custo_fixo: custoFixo,
    custo_variavel: custoVariavel,
    custo_total: custoTotal,
    faturamento,
    margem,
    margem_pct: margemPct,
    breakeven_aulas: breakevenAulas,
    breakeven_atingido: aulasMes >= breakevenAulas,
  }
}

export function perfLabel(ocupacaoPct: number): { txt: string; color: string } {
  if (ocupacaoPct >= 65) return { txt: 'Ótimo', color: 'green' }
  if (ocupacaoPct >= 44) return { txt: 'Médio', color: 'amber' }
  return { txt: 'Baixo', color: 'red' }
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const HORARIOS = [
  '05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00',
  '12:30','13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30','19:00',
  '19:30','20:00'
]
