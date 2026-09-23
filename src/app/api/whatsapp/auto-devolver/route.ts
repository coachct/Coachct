// Auto-devolver ao assistente: conversas "assumidas" (modo_humano) que a equipe não
// respondeu há X horas voltam sozinhas pro assistente — pra não ficarem mudas pra sempre
// (conversa assumida e esquecida = bot não responde). Roda por cron da Vercel.
// O webhook também faz isso na hora que o cliente manda mensagem; este cron limpa as
// que ficaram paradas sem nova mensagem.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/whatsapp/consultas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || ''
const STALE_H = parseInt(process.env.WHATSAPP_HUMANO_STALE_H || '3', 10) || 3

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const supabase = createServiceSupabase()
    // Conversas assumidas (não aguardando escalação): candidatas.
    const { data: presas } = await supabase
      .from('whatsapp_controle')
      .select('telefone')
      .eq('modo_humano', true)
      .eq('aguardando_humano', false)
    const lista = (presas as any[]) || []
    const corte = Date.now() - STALE_H * 3_600_000
    let devolvidas = 0
    for (const c of lista) {
      const { data: m } = await supabase
        .from('whatsapp_mensagens')
        .select('criado_em')
        .eq('telefone', c.telefone)
        .eq('role', 'assistant')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      const ult = (m as any)?.criado_em ? new Date((m as any).criado_em).getTime() : 0
      if (!ult || ult < corte) {
        await supabase
          .from('whatsapp_controle')
          .update({ modo_humano: false, aguardando_humano: false })
          .eq('telefone', c.telefone)
        devolvidas++
      }
    }
    return NextResponse.json({ ok: true, candidatas: lista.length, devolvidas, stale_h: STALE_H })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'erro' }, { status: 500 })
  }
}
