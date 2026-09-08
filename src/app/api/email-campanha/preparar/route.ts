import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'

// Cria a campanha e monta a fila de destinatários. NÃO envia nada — separar as
// duas coisas é de propósito: dá pra conferir o tamanho da fila e a arte antes
// de qualquer e-mail sair.
export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Banco não configurado no servidor' }, { status: 500 })
    }

    const supabase = supabaseAdmin()
    const { erro: erroAuth, userId } = await exigirAdmin(req, supabase)
    if (erroAuth) return erroAuth

    const body = await req.json()
    const nome      = String(body.nome || '').trim()
    const assunto   = String(body.assunto || '').trim()
    const remetente = String(body.remetente || '').trim()
    const link      = String(body.link || '').trim()

    if (!nome || !assunto || !remetente || !link) {
      return NextResponse.json(
        { error: 'Informe nome, assunto, remetente e link.' }, { status: 400 }
      )
    }
    if (!/^https:\/\//.test(link)) {
      return NextResponse.json({ error: 'O link precisa começar com https://' }, { status: 400 })
    }

    const teto = Number(body.teto_por_rodada)
    const teto_por_rodada = Number.isInteger(teto) && teto > 0 && teto <= 5000 ? teto : 200

    const { data: campanhaRow, error: errCamp } = await supabase
      .from('email_campanhas')
      .insert({
        nome,
        assunto,
        remetente,
        link,
        campanha: String(body.campanha || '').trim() || null,
        template: String(body.template || 'summer_mode').trim(),
        teto_por_rodada,
        status: 'rascunho',
        criado_por: userId,
      })
      .select()
      .single()

    if (errCamp || !campanhaRow) {
      console.error('Erro ao criar campanha de e-mail:', errCamp)
      return NextResponse.json({ error: 'Erro ao criar a campanha' }, { status: 500 })
    }

    // A fila é montada dentro do banco: são 44 mil clientes, não faz sentido
    // trazer isso pro servidor só pra devolver.
    const { data: total, error: errFila } = await supabase
      .rpc('preparar_disparo_campanha', { p_campanha_id: campanhaRow.id })

    if (errFila) {
      console.error('Erro ao montar a fila:', errFila)
      return NextResponse.json({ error: 'Campanha criada, mas a fila falhou: ' + errFila.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, campanha_id: campanhaRow.id, destinatarios: total ?? 0 })
  } catch (err: any) {
    console.error('Erro inesperado em /api/email-campanha/preparar:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
