// Atualiza uma linha de notas_fiscais a partir da própria NFE.io (fonte da verdade).
// Usado pela tela ("Atualizar status"), pelo cancelamento e pelo webhook — o
// webhook só avisa que algo mudou; o status sempre vem de uma consulta à API,
// então entrega duplicada ou payload forjado não grava nada que a NFE.io não confirme.

import { SupabaseClient } from '@supabase/supabase-js'
import { nfeioConsultar, statusDoFlow } from './nfeio'

export async function sincronizarNota(
  supabase: SupabaseClient,
  nota: { id: string; status: string; company_id_nfeio: string; nfeio_invoice_id: string | null }
): Promise<{ id: string; status: string; erro?: string }> {
  if (!nota.nfeio_invoice_id) return { id: nota.id, status: nota.status }

  let inv: any
  try {
    inv = await nfeioConsultar(nota.company_id_nfeio, nota.nfeio_invoice_id)
  } catch (e: any) {
    return { id: nota.id, status: nota.status, erro: e?.message || 'Falha ao consultar a NFE.io' }
  }

  const novo = statusDoFlow(inv?.flowStatus, nota.status)
  const upd: Record<string, any> = {}
  if (novo && novo !== nota.status) upd.status = novo
  if (inv?.number) upd.numero_nota = String(inv.number)
  if (novo === 'erro') upd.mensagem_erro = inv?.flowMessage || 'Emissão recusada pela prefeitura'
  if (novo === 'emitida') upd.mensagem_erro = inv?.flowStatus === 'CancelFailed'
    ? `Cancelamento recusado: ${inv?.flowMessage || 'sem detalhe'}`
    : null
  if (novo === 'cancelada') upd.cancelada_em = inv?.cancelledOn || new Date().toISOString()

  if (Object.keys(upd).length) {
    await supabase.from('notas_fiscais').update(upd).eq('id', nota.id)
  }
  return { id: nota.id, status: upd.status || nota.status }
}
