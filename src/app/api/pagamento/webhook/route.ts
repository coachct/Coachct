import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    // ===== ETAPA 2: VALIDAÇÃO BASIC AUTH =====
    const authHeader = req.headers.get('authorization') || ''
    const base64 = authHeader.replace('Basic ', '')
    const decoded = Buffer.from(base64, 'base64').toString('utf-8')
    const [user, pass] = decoded.split(':')

    const expectedUser = process.env.PAGARME_WEBHOOK_USER
    const expectedPass = process.env.PAGARME_WEBHOOK_PASS

    if (!user || !pass || user !== expectedUser || pass !== expectedPass) {
      console.warn('==== WEBHOOK: AUTENTICAÇÃO REJEITADA ====')
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    // =========================================

    const body = await req.json()

    console.log('==== WEBHOOK PAGAR.ME RECEBIDO ====')
    console.log('Tipo do evento:', body?.type)
    console.log('ID do evento:', body?.id)
    console.log('Autenticação: OK')
    console.log('==================================')

    return NextResponse.json({ ok: true })

  } catch (err: any) {
    console.error('Erro no webhook:', err)
    return NextResponse.json({ error: 'Erro' }, { status: 500 })
  }
}
