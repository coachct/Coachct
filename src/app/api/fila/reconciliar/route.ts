// Reconciliação da fila de espera do Coach CT.
//
// POR QUE EXISTE: a fila só era promovida por EVENTO — cancelamento de
// agendamento (trigger on_agendamento_cancelado) e desbloqueio de vaga
// (desbloquear_vagas_parcial). Vaga que nasce de outro jeito não tinha
// ninguém pra chamar: coach entrando na grade, coach voltando de férias,
// horário reativado. Nesses casos a vaga fica órfã pra sempre — foi assim
// que 3 clientes ficaram na fila com vaga aberta ao lado.
//
// O QUE FAZ: varre os slots futuros que têm gente aguardando e, enquanto
// vagas_livres_ct() acusar vaga, promove o próximo da fila. Toda a lógica
// mora na RPC reconciliar_fila_ct(); aqui é só o gatilho do cron.
//
// SEGURO POR CONSTRUÇÃO: sem vaga livre não faz nada (idempotente). A
// promoção passa pelo mesmo processar_fila_espera de sempre, então respeita
// ordem de chegada, prazo de 3h, cliente bloqueado, saldo e duplicata — e o
// aviso ao cliente sai pelo caminho normal (notificacoes_pendentes).
//
// Chamado por cron da Vercel (GET com Authorization: Bearer CRON_SECRET).
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceSupabase } from '@/lib/whatsapp/consultas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || ''
const REMETENTE = 'Just Club & CT <nao-responda@justct.com.br>'
// Aviso interno: só sai quando o cron REALMENTE promoveu alguém, porque isso
// significa que uma vaga ficou órfã — sintoma de mudança de grade sem gatilho.
const ALERTA_EMAIL = process.env.FILA_RECONCILIA_EMAIL || 'ricardopelosini@gmail.com'

type Promovido = { cliente: string; data: string; horario: string; unidade: string }

async function avisarEquipe(promovidos: Promovido[]) {
  if (!process.env.RESEND_API_KEY) return
  const resend = new Resend(process.env.RESEND_API_KEY as string)
  const linhas = promovidos
    .map(p => `<li><strong>${p.cliente}</strong> — ${p.unidade}, ${p.data} às ${p.horario}</li>`)
    .join('')
  await resend.emails.send({
    from: REMETENTE,
    to: ALERTA_EMAIL,
    subject: `Fila Coach CT: ${promovidos.length} vaga(s) órfã(s) preenchida(s)`,
    html: `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.6;">
        <h2>Fila de espera reconciliada</h2>
        <p>A varredura achou vaga aberta com gente na fila e confirmou automaticamente:</p>
        <ul>${linhas}</ul>
        <p>O cliente já foi avisado pelo canal de preferência dele.</p>
        <p style="color:#888;font-size:13px;">Vaga órfã costuma vir de mudança na grade
        (coach novo no horário, volta de férias, horário reativado) — esses caminhos não
        disparam a promoção sozinhos, por isso esta varredura existe.</p>
      </div>`,
  })
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'falta env SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  try {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase.rpc('reconciliar_fila_ct')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const promovidos: Promovido[] = (data as any)?.detalhe || []
    if (promovidos.length > 0) {
      // Falha no aviso interno nunca derruba a reconciliação: quem importa
      // (o cliente) já foi confirmado e notificado.
      try { await avisarEquipe(promovidos) } catch { /* segue o jogo */ }
    }
    return NextResponse.json({ ok: true, ...(data as any) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'erro' }, { status: 500 })
  }
}
