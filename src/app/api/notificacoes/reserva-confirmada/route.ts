import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { emailReservaConfirmada, enderecoUnidade } from '@/lib/email/templates'

export const runtime = 'nodejs'

const REMETENTE = 'Just Club & CT <nao-responda@justct.com.br>'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://coach-ct.vercel.app'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const MODALIDADE: Record<string, string> = {
  lift: 'Lift',
  lift_for_girls: 'Lift for Girls',
  running_funcional: 'Running + Funcional',
}

function formatarData(dataStr?: string | null): string {
  if (!dataStr) return ''
  try {
    return new Date(dataStr + 'T12:00:00').toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
  } catch {
    return dataStr
  }
}

/**
 * Dispara o email de confirmação de reserva (Club) ou agendamento (CT).
 * Chamado em fire-and-forget logo após a reserva — por isso é tolerante a
 * falhas (sempre responde 200 quando a autorização é válida; nunca trava a UX).
 * Exige o token do cliente e confirma que a reserva pertence a ele.
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, motivo: 'env_ausente' })
    }

    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token)
    if (errAuth || !user) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data: cliente } = await supabase
      .from('clientes').select('id, nome, email').eq('user_id', user.id).maybeSingle()
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const tipo: 'club' | 'ct' = body?.tipo === 'ct' ? 'ct' : 'club'

    // Sem email cadastrado: não há o que enviar (segue sem erro).
    if (!cliente.email) return NextResponse.json({ ok: false, motivo: 'sem_email' })

    let payload: Parameters<typeof emailReservaConfirmada>[0] | null = null

    if (tipo === 'club') {
      const reservaId = body?.reservaId
      if (!reservaId) return NextResponse.json({ error: 'reservaId ausente' }, { status: 400 })

      const { data: r } = await supabase
        .from('club_reservas')
        .select('id, cliente_id, posicao, club_ocorrencias(data, club_aulas(tipo, horario, unidade_id, unidades(nome, endereco)))')
        .eq('id', reservaId)
        .maybeSingle()

      // Confirma posse da reserva antes de enviar qualquer coisa.
      if (!r || r.cliente_id !== cliente.id) {
        return NextResponse.json({ error: 'Reserva não encontrada' }, { status: 404 })
      }

      const oc: any = r.club_ocorrencias
      const aula: any = oc?.club_aulas
      const uni: any = aula?.unidades
      const isRunning = aula?.tipo === 'running_funcional'

      payload = {
        tipo: 'club',
        nomeCliente: cliente.nome,
        faixa: MODALIDADE[aula?.tipo] || 'Aula',
        data: formatarData(oc?.data),
        horario: (aula?.horario || '').slice(0, 5),
        unidade: uni?.nome || 'JustClub',
        endereco: enderecoUnidade(uni?.nome, uni?.endereco),
        posicao: isRunning ? (r.posicao || null) : null,
        baseUrl: BASE_URL,
      }
    } else {
      const agendamentoId = body?.agendamentoId
      if (!agendamentoId) return NextResponse.json({ error: 'agendamentoId ausente' }, { status: 400 })

      const { data: a } = await supabase
        .from('agendamentos')
        .select('id, cliente_id, data, horario, tipo_credito, coaches(nome), unidades(nome, endereco)')
        .eq('id', agendamentoId)
        .maybeSingle()

      if (!a || a.cliente_id !== cliente.id) {
        return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 })
      }

      const uni: any = a.unidades
      const coach: any = a.coaches
      // Coach só aparece para o plano Coach CT Pro (único com coach escolhido na reserva).
      const ehPro = String(a.tipo_credito || '').startsWith('coach_ct_pro_')

      payload = {
        tipo: 'ct',
        nomeCliente: cliente.nome,
        faixa: 'Personal · Coach CT',
        data: formatarData(a.data),
        horario: (a.horario || '').slice(0, 5),
        unidade: uni?.nome || 'Just CT',
        endereco: enderecoUnidade(uni?.nome, uni?.endereco),
        coach: ehPro ? (coach?.nome || null) : null,
        baseUrl: BASE_URL,
      }
    }

    const { subject, html } = emailReservaConfirmada(payload)
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: errEmail } = await resend.emails.send({
      from: REMETENTE, to: cliente.email, subject, html,
    })

    if (errEmail) {
      console.error('[reserva-confirmada] falha no Resend:', errEmail.message)
      return NextResponse.json({ ok: false, motivo: 'resend_erro' })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[reserva-confirmada] erro inesperado:', err?.message || err)
    return NextResponse.json({ ok: false, motivo: 'excecao' })
  }
}
