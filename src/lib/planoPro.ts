// Coach CT Pro ativo — vale para os 3 planos tipo 'coach_ct_pro' (Trimestral,
// Semestral e App Coach CT PRO). Quem tem, cancela treino do CT livre até 3h
// antes, sem exigir fila, em QUALQUER treino (inclusive agendado com crédito
// Wellhub/TotalPass — o App PRO é complemento do app, não substituto).
import type { SupabaseClient } from '@supabase/supabase-js'

/** Hoje em São Paulo (YYYY-MM-DD). */
function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** A partir das linhas de cliente_planos com o join planos_disponiveis(tipo). */
export function temPlanoProAtivo(cliPlanos: any[], hoje: string = hojeSP()): boolean {
  return (cliPlanos || []).some((cp: any) =>
    cp?.ativo &&
    cp?.planos_disponiveis?.tipo === 'coach_ct_pro' &&
    (!cp.fim || String(cp.fim) >= hoje),
  )
}

/** Consulta o banco (uso no servidor/WhatsApp). Em erro, devolve false (regra normal). */
export async function clienteTemPlanoPro(supabase: SupabaseClient, clienteId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('cliente_planos')
    .select('ativo, fim, planos_disponiveis!inner(tipo)')
    .eq('cliente_id', clienteId)
    .eq('ativo', true)
    .eq('planos_disponiveis.tipo', 'coach_ct_pro')
  if (error) return false
  return temPlanoProAtivo(data || [])
}
