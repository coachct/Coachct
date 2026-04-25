import { cn } from '@/lib/utils'

// ---- KPI Card ----
export function KpiCard({ label, value, sub, subColor }: {
  label: string; value: string; sub?: string; subColor?: string
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      {sub && <div className={cn('text-xs mt-1', subColor || 'text-gray-400')}>{sub}</div>}
    </div>
  )
}

// ---- OccBar ----
export function OccBar({ pct, className }: { pct: number; className?: string }) {
  const color = pct >= 65 ? 'bg-primary-400' : pct >= 44 ? 'bg-warning-400' : 'bg-danger-400'
  return (
    <div className={cn('h-1.5 rounded-full bg-gray-100 overflow-hidden', className)}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

// ---- Badge ----
export function Badge({ children, variant = 'gray' }: {
  children: React.ReactNode
  variant?: 'green' | 'amber' | 'red' | 'blue' | 'gray'
}) {
  const variants = {
    green: 'badge-green', amber: 'badge-amber', red: 'badge-red',
    blue: 'badge-blue', gray: 'badge-gray'
  }
  return <span className={cn('badge', variants[variant])}>{children}</span>
}

// ---- Avatar ----
export function Avatar({ name, size = 'md', color = 'teal' }: {
  name: string; size?: 'sm' | 'md' | 'lg'; color?: string
}) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base' }
  return (
    <div className={cn('rounded-full flex items-center justify-center font-medium flex-shrink-0 bg-primary-100 text-primary-800', sizes[size])}>
      {name.slice(0,2).toUpperCase()}
    </div>
  )
}

// ---- Section Title ----
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-gray-900">{children}</h2>
      {action}
    </div>
  )
}

// ---- Empty State ----
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 text-sm text-gray-400">{message}</div>
  )
}

// ---- Spinner ----
export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-7 h-7 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ---- Insight box ----
export function Insight({ children, variant = 'amber' }: {
  children: React.ReactNode; variant?: 'amber' | 'green' | 'red'
}) {
  const styles = {
    amber: 'border-warning-400 bg-warning-50/30 text-gray-800',
    green: 'border-primary-400 bg-primary-50/30 text-gray-800',
    red:   'border-danger-400 bg-danger-50/30 text-gray-800',
  }
  return (
    <div className={cn('border-l-4 rounded-r-lg px-3 py-2 text-sm mb-2', styles[variant])}>
      {children}
    </div>
  )
}

// ---- Page Header ----
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ---- Autosave indicator ----
export function AutosaveBar({ status }: { status: 'idle' | 'saving' | 'saved' }) {
  if (status === 'idle') return null
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-4',
      status === 'saving' ? 'bg-warning-50 text-warning-800' : 'bg-primary-50 text-primary-800'
    )}>
      <span className={cn('w-2 h-2 rounded-full', status === 'saving' ? 'bg-warning-400 animate-pulse' : 'bg-primary-400')} />
      {status === 'saving' ? 'Salvando...' : 'Salvo automaticamente'}
    </div>
  )
}
