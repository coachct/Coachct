import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'

// Muda o teto por rodada e o status (pausar/retomar) de uma campanha.
//
// Existe porque email_campanhas só tem policy de SELECT: escrever direto do
// navegador é recusado pelo banco, e em silêncio. Toda escrita passa por aqui,
// com service_role e checagem de admin.
export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Banco não configurado no servidor' }, { status: 500 })
    }

    const supabase = supabaseAdmin()
    const { erro: erroAuth } = await exigirAdmin(req, supabase)
    if (erroAuth) return erroAuth

    const body = await req.json()
    const id = String(body.campanha_id || '').trim()
    if (!id) return NextResponse.json({ error: 'campanha_id é obrigatório' }, { status: 400 })

    // Devolve pra fila quem ficou marcado como erro. Falha de lote costuma ser
    // do ambiente (chave sem permissão no domínio, limite do Resend, rede) e
    // não da pessoa — sem isso, esse povo ficava fora do disparo pra sempre.
    if (body.reenfileirar_erros) {
      const { count, error } = await supabase
        .from('email_disparos')
        .update({ status: 'pendente', erro: null, enviado_em: null, resend_id: null },
                { count: 'exact' })
        .eq('campanha_id', id).eq('status', 'erro')

      if (error) {
        console.error('Erro ao reenfileirar:', error)
        return NextResponse.json({ error: 'Não consegui devolver pra fila' }, { status: 500 })
      }
      await supabase.from('email_campanhas').update({ status: 'rascunho' })
        .eq('id', id).eq('status', 'concluida')

      return NextResponse.json({ ok: true, reenfileirados: count || 0 })
    }

    const mudancas: Record<string, any> = {}

    if (body.teto_por_rodada !== undefined) {
      const teto = Number(body.teto_por_rodada)
      if (!Number.isInteger(teto) || teto < 1 || teto > 20000) {
        return NextResponse.json({ error: 'O teto tem que ser um número inteiro entre 1 e 20000.' }, { status: 400 })
      }
      mudancas.teto_por_rodada = teto
    }

    if (body.status !== undefined) {
      const status = String(body.status)
      // 'concluida' quem marca é a rotina de envio, quando a fila zera.
      if (!['enviando', 'pausada'].includes(status)) {
        return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
      }
      mudancas.status = status
    }

    if (Object.keys(mudancas).length === 0) {
      return NextResponse.json({ error: 'Nada para mudar' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('email_campanhas').update(mudancas).eq('id', id).select().single()

    if (error) {
      console.error('Erro ao ajustar campanha:', error)
      return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, campanha: data })
  } catch (err) {
    console.error('Erro inesperado em /api/email-campanha/ajustar:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
