import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/api-admin'

// Grava a resposta do feedback de estreia. Público, sem login: o token do
// e-mail é a credencial — o mesmo token do descadastro.
//
// São DOIS POSTs no fluxo normal: a carinha clicada no e-mail (nota) e depois a
// múltipla escolha na landing (motivo + comentário). Por isso o update é
// parcial e a sobrescrita é permitida por 24h a partir da PRIMEIRA resposta —
// passou disso, a pessoa já respondeu e a série histórica não muda mais.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const JANELA_MS = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  // Resposta sempre igual, inclusive pra token que não existe: ninguém
  // descobre por aqui quais tokens são válidos.
  const ok = NextResponse.json({ ok: true })

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return ok

    const body = await req.json().catch(() => ({} as any))
    const token = String(body.token || '').trim()
    if (!/^[0-9a-f]{32}$/i.test(token)) return ok

    const supabase = supabaseAdmin()
    const { data: linha } = await supabase
      .from('feedback_estreia')
      .select('id, respondido_em')
      .eq('token', token)
      .maybeSingle()

    if (!linha) return ok

    if (linha.respondido_em) {
      const desde = Date.now() - new Date(linha.respondido_em).getTime()
      if (desde > JANELA_MS) return ok
    }

    const update: Record<string, any> = {}

    const nota = Number(body.nota)
    if (Number.isInteger(nota) && nota >= 1 && nota <= 5) update.nota = nota

    const motivo = String(body.motivo ?? '').trim()
    if (motivo) update.motivo = motivo.slice(0, 200)

    const comentario = String(body.comentario ?? '').trim()
    if (comentario) update.comentario = comentario.slice(0, 1000)

    if (Object.keys(update).length === 0) return ok

    // respondido_em marca a PRIMEIRA resposta e não é reescrito: é o que
    // ancora a janela de 24h.
    if (!linha.respondido_em) update.respondido_em = new Date().toISOString()

    await supabase.from('feedback_estreia').update(update).eq('id', linha.id)
    return ok
  } catch (err) {
    console.error('Erro em /api/feedback-estreia/responder:', err)
    return ok
  }
}
