import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { exigirAdmin, supabaseAdmin } from '@/lib/api-admin'
import {
  htmlEmailCarrinho, textoEmailCarrinho, assuntoEmailCarrinho, primeiroNomeCarrinho,
  type DadosEmailCarrinho, type EtapaCarrinho,
} from '@/lib/email/carrinho'

// Manda UM e-mail de teste do carrinho abandonado, pro endereço que o admin
// digitar, na etapa escolhida (abriu / pix_nao_pago / cartao_recusado).
//
// Não grava nada: nem email_disparos, nem carrinho_emails. Serve pra ver a arte
// e a copy chegando numa caixa de entrada de verdade antes de ligar o disparo.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://justclub.com.br'

const ETAPAS: EtapaCarrinho[] = ['abriu', 'pix_nao_pago', 'cartao_recusado']

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

    const etapa: EtapaCarrinho = ETAPAS.includes(body.etapa) ? body.etapa : 'abriu'

    const { data: campanha } = await supabase
      .from('email_campanhas').select('remetente').eq('campanha', 'carrinho_abandonado').maybeSingle()
    const remetente = (campanha?.remetente as string) || 'Just Club & CT <nao-responda@justclubct.com.br>'

    // Se o e-mail for de um cliente, usa o primeiro nome dele — o teste mostra
    // a saudação do jeito que vai sair.
    const { data: cliente } = await supabase
      .from('clientes').select('nome').ilike('email', para).limit(1).maybeSingle()

    // Produto de exemplo: o mais barato do catálogo ativo, só pra a arte ter um
    // nome e um valor de verdade. Sem produto, cai num exemplo fixo.
    const { data: produto } = await supabase
      .from('produtos')
      .select('id, nome, valor, unidade_id')
      .eq('ativo', true)
      .order('valor', { ascending: true })
      .limit(1)
      .maybeSingle()

    let unidadeNome: string | null = null
    if (produto?.unidade_id) {
      const { data: un } = await supabase
        .from('unidades').select('nome').eq('id', produto.unidade_id).maybeSingle()
      unidadeNome = (un?.nome as string) || null
    }

    const dados: DadosEmailCarrinho = {
      nome: primeiroNomeCarrinho(cliente?.nome),
      etapa,
      produtoNome: (produto?.nome as string) || 'Treino Avulso',
      valor: Number(produto?.valor ?? 64.9),
      unidadeNome,
      linkCheckout: produto?.id
        ? `${BASE_URL}/comprar/checkout?produto=${produto.id}&utm_source=email&utm_medium=teste&utm_campaign=carrinho_abandonado`
        : `${BASE_URL}/comprar`,
      linkDescadastro: `${BASE_URL}/descadastro?t=teste`,
    }

    const resend = new Resend(chaveResend)
    const { data, error } = await resend.emails.send({
      from: remetente,
      to: para,
      subject: `[TESTE] ${assuntoEmailCarrinho(etapa)}`,
      html: htmlEmailCarrinho(dados),
      text: textoEmailCarrinho(dados),
    })

    if (error) {
      console.error('Falha no e-mail de teste do carrinho abandonado:', error)
      return NextResponse.json({ error: error.message || 'O Resend recusou o envio.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, id: (data as any)?.id || null, para, etapa })
  } catch (err) {
    console.error('Erro inesperado em /api/carrinho-abandonado/teste:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
