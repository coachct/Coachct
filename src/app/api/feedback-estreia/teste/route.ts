import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import {
  htmlEmailEstreia, textoEmailEstreia, assuntoEmailEstreia, primeiroNomeEstreia,
  type DadosEmailEstreia, type Modalidade, type Periodo,
} from '@/lib/email/estreia'

// Manda UM e-mail de teste do feedback de estreia, pro endereço que o admin
// digitar, na combinação escolhida (modalidade × período × grupo muscular).
//
// Não grava nada: nem email_disparos, nem feedback_estreia. Serve pra ver a
// arte e a copy chegando numa caixa de entrada de verdade.
//
// Mesma chave e mesmo remetente do disparo real. A linha de contexto usa dados
// de exemplo; o link das carinhas abre a landing de verdade com token de teste
// (a resposta não grava em lugar nenhum).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://justclub.com.br'
const CAMPANHA_ID = process.env.FEEDBACK_ESTREIA_CAMPANHA_ID || ''

const GRUPOS = ['Inferiores', 'Superiores', 'Glúteos & Abs', 'Full Body', 'HIIT & ABS', 'HIIT & Full Body']

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Banco não configurado no servidor' }, { status: 500 })
    }

    const supabase = supabaseAdmin()
    const { erro: erroAuth } = await exigirAdmin(req, supabase)
    if (erroAuth) return erroAuth

    const chaveResend = process.env.RESEND_API_KEY_MARKETING || process.env.RESEND_API_KEY
    if (!chaveResend) {
      return NextResponse.json({ error: 'Falta a RESEND_API_KEY_MARKETING no servidor.' }, { status: 500 })
    }

    const body = await req.json().catch(() => ({} as any))
    const para = String(body.email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) {
      return NextResponse.json({ error: 'Digite um e-mail válido para o teste.' }, { status: 400 })
    }

    const modalidade: Modalidade = body.modalidade === 'running' ? 'running' : 'lift'
    const periodo: Periodo = body.periodo === 'fds' ? 'fds' : 'semana'
    const grupo = GRUPOS.includes(body.grupo) ? String(body.grupo) : 'Full Body'

    const { data: campanha } = await supabase
      .from('email_campanhas').select('remetente').eq('id', CAMPANHA_ID).maybeSingle()
    const remetente = (campanha?.remetente as string) || 'Just Club & CT <nao-responda@justct.com.br>'

    // Se o e-mail for de um cliente, usa o primeiro nome dele — o teste mostra
    // a saudação do jeito que vai sair.
    const { data: cliente } = await supabase
      .from('clientes').select('nome').ilike('email', para).limit(1).maybeSingle()

    // Contexto de exemplo, coerente com a grade: semana 19h30; fds Running 10h
    // e Lift 10h15.
    const dados: DadosEmailEstreia = {
      nome: primeiroNomeEstreia(cliente?.nome),
      modalidade,
      grupoMuscular: grupo,
      periodo,
      diaSemana: periodo === 'fds' ? 'sábado' : 'terça-feira',
      horario: periodo === 'fds' ? (modalidade === 'running' ? '10h' : '10h15') : '19h30',
      coachNome: 'Gracy',
      coachGenero: 'f',
      unidadeNome: 'JustClub Vila Olímpia',
      linkFeedback: `${BASE_URL}/feedback/teste`,
      linkDescadastro: `${BASE_URL}/descadastro?t=teste`,
    }

    const resend = new Resend(chaveResend)
    const { data, error } = await resend.emails.send({
      from: remetente,
      to: para,
      subject: `[TESTE] ${assuntoEmailEstreia(modalidade)}`,
      html: htmlEmailEstreia(dados),
      text: textoEmailEstreia(dados),
    })

    if (error) {
      console.error('Falha no e-mail de teste do feedback de estreia:', error)
      return NextResponse.json({ error: error.message || 'O Resend recusou o envio.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, id: (data as any)?.id || null, para })
  } catch (err) {
    console.error('Erro inesperado em /api/feedback-estreia/teste:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
