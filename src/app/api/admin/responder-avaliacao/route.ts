// src/app/api/admin/responder-avaliacao/route.ts
//
// Resposta MANUAL da equipe a um comentário deixado pelo aluno na avaliação de
// aula (tela /admin/avaliacoes). Salva a resposta na própria avaliação e
// enfileira um e-mail para o aluno reaproveitando o processador de notificações
// já existente (notificacoes_pendentes → cron /api/processar-notificacoes).
//
// Isolada em rota própria, à prova de falha e sem tocar no fluxo de avaliação
// do aluno: se o e-mail não puder ser enfileirado, a resposta continua salva e
// devolvemos um aviso — nunca derruba a operação.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tipoLabel(t: string | null): string {
  if (t === 'ct') return 'Coach CT'
  if (t === 'lift') return 'Lift'
  if (t === 'lift_for_girls') return 'Lift for Girls'
  if (t === 'running_funcional') return 'Running + Funcional'
  return 'aula'
}

export async function POST(req: NextRequest) {
  try {
    // Auth: Bearer token do usuário logado + checagem de papel.
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer '))
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

    const { data: perfil } = await supabase.from('perfis').select('id, role').eq('id', user.id).maybeSingle()
    if (!perfil || !['admin', 'coordenadora'].includes(perfil.role))
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    // Payload
    const body = await req.json()
    const avaliacaoId = String(body?.avaliacao_id ?? '').trim()
    const resposta = String(body?.resposta ?? '').trim()
    if (!avaliacaoId) return NextResponse.json({ error: 'Avaliação não informada' }, { status: 400 })
    if (!resposta) return NextResponse.json({ error: 'Escreva a resposta antes de enviar.' }, { status: 400 })
    if (resposta.length > 2000) return NextResponse.json({ error: 'Resposta muito longa (máx. 2000).' }, { status: 400 })

    // Carrega a avaliação (dados para o e-mail e destino do aluno)
    const { data: aval, error: errAval } = await supabase
      .from('avaliacoes_aula')
      .select('id, cliente_id, unidade_id, tipo_aula, data_aula, horario, comentario, clientes(nome, email)')
      .eq('id', avaliacaoId)
      .maybeSingle()

    if (errAval) return NextResponse.json({ error: 'Erro ao buscar avaliação: ' + errAval.message }, { status: 500 })
    if (!aval) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    // Salva a resposta na avaliação (fonte da verdade — sempre grava primeiro)
    const { error: errUpd } = await supabase
      .from('avaliacoes_aula')
      .update({
        resposta,
        resposta_em: new Date().toISOString(),
        respondido_por: perfil.id,
      })
      .eq('id', avaliacaoId)

    if (errUpd) return NextResponse.json({ error: 'Erro ao salvar resposta: ' + errUpd.message }, { status: 500 })

    // Enfileira o e-mail para o aluno (best-effort — não derruba se falhar)
    const cliente = (aval as any).clientes as { nome: string | null; email: string | null } | null
    let aviso: string | null = null

    if (!cliente?.email) {
      aviso = 'Resposta salva, mas o aluno não tem e-mail cadastrado — o e-mail não foi enviado.'
    } else {
      // mensagem carrega a resposta + o contexto da aula/comentário original,
      // que o template resposta_avaliacao usa para montar o e-mail.
      const mensagem = JSON.stringify({
        resposta,
        comentario_original: aval.comentario || null,
        aula: tipoLabel(aval.tipo_aula),
        data_aula: aval.data_aula || null,
        horario: aval.horario || null,
      })

      const { error: errNotif } = await supabase.from('notificacoes_pendentes').insert({
        cliente_id: aval.cliente_id,
        tipo: 'resposta_avaliacao',
        canal: 'email',
        destino: cliente.email,
        mensagem,
        unidade_id: aval.unidade_id,
        status: 'pendente',
      })

      if (errNotif) aviso = 'Resposta salva, mas houve erro ao enfileirar o e-mail: ' + errNotif.message
    }

    return NextResponse.json({ ok: true, aviso })
  } catch (e: any) {
    return NextResponse.json({ error: 'Erro inesperado: ' + (e?.message || String(e)) }, { status: 500 })
  }
}
