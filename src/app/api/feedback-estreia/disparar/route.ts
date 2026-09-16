import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import { randomBytes } from 'crypto'
import { hojeSP } from '@/lib/tempo'
import {
  htmlEmailEstreia, textoEmailEstreia, assuntoEmailEstreia, primeiroNomeEstreia,
  type DadosEmailEstreia, type Modalidade, type Periodo,
} from '@/lib/email/estreia'

// Feedback de estreia, 48h depois da PRIMEIRA presença no Club.
//
// 52% de quem estreia nunca volta e hoje não existe um único registro do
// motivo. Este cron é o que transforma isso em série histórica contínua,
// começando pelo próximo estreante.
//
// Roda uma vez por dia (13:00 UTC = 10:00 em SP) e pega as estreias de D-2.
//
// Chamadas aceitas:
//   - cron da Vercel: GET com Authorization: Bearer CRON_SECRET
//   - admin logado:   POST com Authorization: Bearer <token do usuário>
//     (aceita { data: 'YYYY-MM-DD' } e { simular: true } pra conferir a fila)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://justclub.com.br'
const CRON_SECRET = process.env.CRON_SECRET
const CAMPANHA_ID = process.env.FEEDBACK_ESTREIA_CAMPANHA_ID || ''
const POR_LOTE = 100 // teto do endpoint de lote do Resend

/** 'YYYY-MM-DD' de n dias atrás, a partir de uma data 'YYYY-MM-DD'. */
function menosDias(data: string, n: number): string {
  const [y, m, d] = data.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) - n * 86400000)
  return t.toISOString().slice(0, 10)
}

/** Quantos dias separam duas datas 'YYYY-MM-DD' (a - b). */
function difDias(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

/** 'sábado', 'terça-feira'. Formatado em UTC porque a data já é a data local. */
function diaDaSemana(data: string): string {
  const [y, m, d] = data.split('-').map(Number)
  try {
    return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)))
      .toLowerCase()
  } catch { return '' }
}

/** '10:00:00' -> '10h'; '18:30:00' -> '18h30'. */
function horaBonita(horario: string): string {
  const [h, m] = String(horario || '').split(':')
  if (!h) return ''
  return m && m !== '00' ? `${Number(h)}h${m}` : `${Number(h)}h`
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type Candidato = {
  reserva_id: string
  cliente_id: string
  cliente_nome: string
  email: string
  tipo_credito: string
  data_estreia: string
  horario: string
  unidade_id: string
  unidade_nome: string
  modalidade: Modalidade
  grupo_muscular: string | null
  coach_nome: string | null
  coach_genero: 'f' | 'm' | null
  periodo: Periodo
  ja_recebeu: boolean
  descadastrado: boolean
  bloqueado: boolean
  tem_reserva_futura: boolean
}

async function disparar(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Banco não configurado no servidor' }, { status: 500 })
  }

  const supabase = supabaseAdmin()

  // Cron entra pelo segredo; pessoa entra como admin. Nada acontece antes disso.
  const auth = req.headers.get('authorization') || ''
  const ehCron = !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`
  if (!ehCron) {
    const { erro: erroAuth } = await exigirAdmin(req, supabase)
    if (erroAuth) return erroAuth
  }

  if (!CAMPANHA_ID) {
    return NextResponse.json({ error: 'Falta a FEEDBACK_ESTREIA_CAMPANHA_ID no servidor' }, { status: 500 })
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({} as any)) : ({} as any)

  // Freio de mão do rollback: basta pausar a campanha no banco pra parar tudo,
  // sem deploy.
  const { data: campanha } = await supabase
    .from('email_campanhas').select('id, status, remetente').eq('id', CAMPANHA_ID).maybeSingle()

  if (!campanha) {
    return NextResponse.json({ error: 'Campanha de feedback não encontrada' }, { status: 404 })
  }
  if (campanha.status !== 'recorrente') {
    console.log('[feedback-estreia] campanha não está recorrente, nada a fazer:', campanha.status)
    return NextResponse.json({ ok: true, pausada: true, enviados: 0 })
  }

  const hoje = hojeSP()
  const data = String(body.data || '').match(/^\d{4}-\d{2}-\d{2}$/)
    ? String(body.data)
    : menosDias(hoje, 2)

  // A dor de pico é entre 24 e 48h e a piada morre no quarto dia. Job atrasado
  // não manda nada — melhor não mandar do que mandar fora de hora.
  const atraso = difDias(hoje, data)
  if (atraso > 3) {
    console.log(`[feedback-estreia] fora da janela: estreia ${data}, hoje ${hoje} (${atraso} dias). Pulado.`)
    return NextResponse.json({ ok: true, fora_da_janela: true, data, enviados: 0 })
  }

  const chaveResend = process.env.RESEND_API_KEY_MARKETING || process.env.RESEND_API_KEY
  if (!chaveResend) {
    return NextResponse.json(
      { error: 'Falta a RESEND_API_KEY_MARKETING no servidor (chave do Resend com acesso ao domínio da campanha).' },
      { status: 500 }
    )
  }

  const { data: linhas, error: errRpc } = await supabase
    .rpc('feedback_estreia_candidatos', { p_data: data })

  if (errRpc) {
    console.error('[feedback-estreia] erro ao buscar candidatos:', errRpc)
    return NextResponse.json({ error: 'Erro ao buscar estreantes: ' + errRpc.message }, { status: 500 })
  }

  const candidatos = (linhas || []) as Candidato[]

  // Supressões, nesta ordem. Contadas pra conferir a fila depois.
  const pulados = { ja_recebeu: 0, descadastrado: 0, sem_email: 0, reserva_futura: 0, bloqueado: 0 }
  const aprovados: Candidato[] = []

  for (const c of candidatos) {
    if (c.ja_recebeu) { pulados.ja_recebeu++; continue }
    if (c.descadastrado) { pulados.descadastrado++; continue }
    if (!c.email || !EMAIL_VALIDO.test(c.email.trim())) { pulados.sem_email++; continue }
    // Quem já remarcou não pode receber "o que te faria voltar": passa a
    // impressão de que ninguém olhou. Pular, não adaptar.
    if (c.tem_reserva_futura) { pulados.reserva_futura++; continue }
    if (c.bloqueado) { pulados.bloqueado++; continue }
    aprovados.push(c)
  }

  const resumo = {
    ok: true,
    data,
    estreantes: candidatos.length,
    aprovados: aprovados.length,
    pulados,
  }

  if (body.simular) {
    return NextResponse.json({
      ...resumo,
      simulacao: true,
      fila: aprovados.map(a => ({
        nome: a.cliente_nome, email: a.email, modalidade: a.modalidade,
        grupo: a.grupo_muscular, periodo: a.periodo, horario: a.horario,
        coach: a.coach_nome, unidade: a.unidade_nome,
      })),
    })
  }

  if (aprovados.length === 0) {
    return NextResponse.json({ ...resumo, enviados: 0 })
  }

  // ── Grava antes de mandar: token, disparo e a linha de feedback ─────────────
  type Pronto = { c: Candidato; token: string; disparoId: string; feedbackId: string }
  const prontos: Pronto[] = []

  for (const c of aprovados) {
    // 32 hex minúsculos: é o formato que o /api/descadastro valida.
    const token = randomBytes(16).toString('hex')

    const { data: disparo, error: errDisparo } = await supabase
      .from('email_disparos')
      .insert({
        campanha_id: CAMPANHA_ID,
        cliente_id: c.cliente_id,
        email: c.email.trim(),
        token,
        status: 'pendente',
      })
      .select('id')
      .single()

    if (errDisparo || !disparo) {
      // Acontece quando o e-mail já tem disparo nesta campanha (dois cadastros
      // com o mesmo e-mail). Sem drama: pula essa pessoa e segue a fila.
      console.error('[feedback-estreia] não gravou o disparo de', c.email, errDisparo?.message)
      continue
    }

    const { data: fb, error: errFb } = await supabase
      .from('feedback_estreia')
      .insert({
        token,
        disparo_id: disparo.id,
        cliente_id: c.cliente_id,
        reserva_id: c.reserva_id,
        unidade_id: c.unidade_id,
        data_estreia: c.data_estreia,
        horario: c.horario,
        modalidade: c.modalidade,
        grupo_muscular: c.grupo_muscular,
        coach_nome: c.coach_nome,
        periodo: c.periodo,
        tipo_credito: c.tipo_credito,
      })
      .select('id')
      .single()

    if (errFb || !fb) {
      // Índice único por cliente: se chegou aqui é corrida entre duas rodadas.
      // Marca o disparo como pulado pra não sair e-mail sem lugar pra responder.
      console.error('[feedback-estreia] não gravou o feedback de', c.email, errFb?.message)
      await supabase.from('email_disparos')
        .update({ status: 'pulado', erro: 'feedback_estreia duplicado' }).eq('id', disparo.id)
      continue
    }

    prontos.push({ c, token, disparoId: disparo.id, feedbackId: fb.id })
  }

  // ── Envia em lotes de 100 ──────────────────────────────────────────────────
  const resend = new Resend(chaveResend)
  let enviados = 0
  let erros = 0

  for (let i = 0; i < prontos.length; i += POR_LOTE) {
    const lote = prontos.slice(i, i + POR_LOTE)

    const mensagens = lote.map(p => {
      const dados: DadosEmailEstreia = {
        nome: primeiroNomeEstreia(p.c.cliente_nome),
        modalidade: p.c.modalidade,
        grupoMuscular: p.c.grupo_muscular,
        periodo: p.c.periodo,
        diaSemana: diaDaSemana(p.c.data_estreia),
        horario: horaBonita(p.c.horario),
        coachNome: primeiroNomeEstreia(p.c.coach_nome),
        coachGenero: p.c.coach_genero,
        unidadeNome: p.c.unidade_nome,
        linkFeedback: `${BASE_URL}/feedback/${p.token}`,
        linkDescadastro: `${BASE_URL}/descadastro?t=${p.token}`,
      }
      return {
        from: campanha.remetente as string,
        to: p.c.email.trim(),
        subject: assuntoEmailEstreia(p.c.modalidade),
        html: htmlEmailEstreia(dados),
        text: textoEmailEstreia(dados),
        // Descadastro em um clique no cabeçalho: a pessoa sai sem marcar como
        // spam, que é o que derruba a reputação do domínio. Aqui vai a URL da
        // API (o Gmail faz POST), não a da página.
        headers: {
          'List-Unsubscribe': `<${BASE_URL}/api/descadastro?t=${p.token}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
    })

    const { data: resposta, error: errLote } = await resend.batch.send(mensagens)

    if (errLote) {
      // A linha de feedback_estreia FICA, sem enviado_em: é justamente esse o
      // sinal de que houve falha. Não reenvia sozinho.
      console.error('[feedback-estreia] falha no lote do Resend:', errLote)
      await supabase.from('email_disparos')
        .update({
          status: 'erro',
          erro: (errLote.message || 'erro do Resend').slice(0, 300),
          enviado_em: new Date().toISOString(),
        })
        .in('id', lote.map(l => l.disparoId))
      erros += lote.length
      continue
    }

    // A resposta vem na mesma ordem do que foi mandado.
    const idsResend: any[] = (resposta as any)?.data || []
    const agora = new Date().toISOString()
    await Promise.all(lote.flatMap((p, idx) => [
      supabase.from('email_disparos').update({
        status: 'enviado',
        resend_id: idsResend[idx]?.id || null,
        enviado_em: agora,
      }).eq('id', p.disparoId),
      supabase.from('feedback_estreia').update({ enviado_em: agora }).eq('id', p.feedbackId),
    ]))
    enviados += lote.length
  }

  console.log(`[feedback-estreia] ${data}: ${candidatos.length} estreantes, ${enviados} enviados, ${erros} com erro`, pulados)
  return NextResponse.json({ ...resumo, enviados, erros })
}

export async function GET(req: NextRequest) {
  try {
    return await disparar(req)
  } catch (err: any) {
    console.error('Erro inesperado em /api/feedback-estreia/disparar:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    return await disparar(req)
  } catch (err: any) {
    console.error('Erro inesperado em /api/feedback-estreia/disparar:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
