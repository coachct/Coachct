import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'

// Cria a campanha e monta a fila de destinatários — em LOTES.
//
// Montar os 44 mil de uma vez leva ~21s e estoura o tempo da chamada: a
// campanha nascia e a fila ficava vazia. Agora cada chamada grava uma fatia e
// devolve o cursor; quem chama repete até acabar, mostrando o progresso.
//
// Duas formas de chamar:
//   { nome, assunto, remetente, link, ... }        -> cria a campanha e grava o 1º lote
//   { campanha_id, depois_de }                     -> grava o lote seguinte
//
// NÃO envia e-mail nenhum. O envio é outra rota.
const POR_LOTE = 8000

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Banco não configurado no servidor' }, { status: 500 })
    }

    const supabase = supabaseAdmin()
    const { erro: erroAuth, userId } = await exigirAdmin(req, supabase)
    if (erroAuth) return erroAuth

    const body = await req.json()

    // ── Continuação: só grava o próximo lote de uma campanha que já existe
    const continuar = String(body.campanha_id || '').trim()
    if (continuar) {
      const depoisDe = Number(body.depois_de) || 0
      const { data, error } = await supabase.rpc('preparar_disparo_campanha', {
        p_campanha_id: continuar, p_depois_de: depoisDe, p_limite: POR_LOTE,
      })
      if (error) {
        console.error('Erro ao montar lote da fila:', error)
        return NextResponse.json({ error: 'Erro ao montar a fila: ' + error.message }, { status: 500 })
      }
      const linha = Array.isArray(data) ? data[0] : data
      return NextResponse.json({
        ok: true,
        campanha_id: continuar,
        inseridos: linha?.inseridos ?? 0,
        ultimo_ord: linha?.ultimo_ord ?? null,
        acabou: !linha?.ultimo_ord,
      })
    }

    // ── Campanha nova
    const nome      = String(body.nome || '').trim()
    const assunto   = String(body.assunto || '').trim()
    const remetente = String(body.remetente || '').trim()
    const link      = String(body.link || '').trim()

    if (!nome || !assunto || !remetente || !link) {
      return NextResponse.json({ error: 'Informe nome, assunto, remetente e link.' }, { status: 400 })
    }
    if (!/^https:\/\//.test(link)) {
      return NextResponse.json({ error: 'O link precisa começar com https://' }, { status: 400 })
    }

    const teto = Number(body.teto_por_rodada)
    const teto_por_rodada = Number.isInteger(teto) && teto > 0 && teto <= 20000 ? teto : 500

    const { data: campanhaRow, error: errCamp } = await supabase
      .from('email_campanhas')
      .insert({
        nome, assunto, remetente, link,
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

    const { data, error: errFila } = await supabase.rpc('preparar_disparo_campanha', {
      p_campanha_id: campanhaRow.id, p_depois_de: 0, p_limite: POR_LOTE,
    })

    if (errFila) {
      console.error('Erro ao montar a fila:', errFila)
      return NextResponse.json(
        { error: 'Campanha criada, mas a fila falhou: ' + errFila.message }, { status: 500 }
      )
    }

    const linha = Array.isArray(data) ? data[0] : data
    return NextResponse.json({
      ok: true,
      campanha_id: campanhaRow.id,
      inseridos: linha?.inseridos ?? 0,
      ultimo_ord: linha?.ultimo_ord ?? null,
      acabou: !linha?.ultimo_ord,
    })
  } catch (err: any) {
    console.error('Erro inesperado em /api/email-campanha/preparar:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
