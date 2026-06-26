import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setClassVisibility } from '@/lib/wellhub/booking-api'

export const runtime = 'nodejs'

// Kill switch da integração Wellhub por unidade (+ "pausar tudo").
//
// Roda no server porque (a) chamar a Booking API exporia o WELLHUB_API_KEY no
// client e (b) o update de unidades passa por service role. O ESTADO é o que o
// worker de sync e o webhook de booking consultam — mudar o estado já é um kill
// switch funcional; esconder as classes no app é efeito extra (só tem o que
// esconder quando já houver classes publicadas em wellhub_class_map).

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer '))
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

    const { data: perfil } = await supabase.from('perfis').select('id, role').eq('id', user.id).maybeSingle()
    if (!perfil || !['admin', 'coordenadora'].includes(perfil.role))
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()
    const { unidade_id, estado, pausar_tudo } = body

    // ── Pausar tudo: toda unidade ATIVA vira pausada de uma vez ──
    if (pausar_tudo) {
      const { data: ativas } = await supabase
        .from('unidades').select('id, wellhub_gym_id').eq('wellhub_estado', 'ativo')
      await supabase.from('unidades').update({ wellhub_estado: 'pausado' }).eq('wellhub_estado', 'ativo')
      for (const u of (ativas || [])) await esconderClasses(supabase, u.wellhub_gym_id)
      return NextResponse.json({ sucesso: true, pausadas: (ativas || []).length })
    }

    // ── Estado por unidade (toggle ativo <-> pausado) ──
    if (!unidade_id || !['ativo', 'pausado'].includes(estado))
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

    const { data: unidade } = await supabase
      .from('unidades').select('id, wellhub_gym_id').eq('id', unidade_id).maybeSingle()
    if (!unidade) return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 })

    await supabase.from('unidades').update({ wellhub_estado: estado }).eq('id', unidade_id)

    if (estado === 'pausado') {
      await esconderClasses(supabase, unidade.wellhub_gym_id)
    } else {
      // retomar: mostra as classes de novo e reenfileira as ocorrências futuras (resync do pool)
      await mostrarClasses(supabase, unidade.wellhub_gym_id)
      await reenfileirarFuturas(supabase, unidade_id)
    }

    return NextResponse.json({ sucesso: true, estado })
  } catch (err: any) {
    console.error('Erro em /api/admin/wellhub-estado:', err)
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 })
  }
}

async function esconderClasses(supabase: any, gymId: string | null) {
  if (!gymId) return
  const { data: classes } = await supabase.from('wellhub_class_map').select('wellhub_class_id').eq('gym_id', gymId)
  for (const c of (classes || [])) await setClassVisibility(gymId, c.wellhub_class_id, false)
}

async function mostrarClasses(supabase: any, gymId: string | null) {
  if (!gymId) return
  const { data: classes } = await supabase.from('wellhub_class_map').select('wellhub_class_id').eq('gym_id', gymId)
  for (const c of (classes || [])) await setClassVisibility(gymId, c.wellhub_class_id, true)
}

// Reenfileira todas as ocorrências futuras da unidade pro worker reempurrar a
// capacidade — usado ao RETOMAR, pra ressincronizar o que ficou parado na pausa.
async function reenfileirarFuturas(supabase: any, unidadeId: string) {
  const hoje = new Date().toISOString().slice(0, 10)
  const { data: aulas } = await supabase.from('club_aulas').select('id').eq('unidade_id', unidadeId)
  const aulaIds = (aulas || []).map((a: any) => a.id)
  if (!aulaIds.length) return
  const { data: ocs } = await supabase.from('club_ocorrencias').select('id').in('aula_id', aulaIds).gte('data', hoje)
  const rows = (ocs || []).map((o: any) => ({ ocorrencia_id: o.id, enfileirado_em: new Date().toISOString() }))
  if (rows.length) await supabase.from('wellhub_slot_sync_queue').upsert(rows, { onConflict: 'ocorrencia_id' })
}
