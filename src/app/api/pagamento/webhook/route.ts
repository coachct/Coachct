import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Por enquanto: só loga o que chegou
    console.log('==== WEBHOOK PAGAR.ME RECEBIDO ====')
    console.log('Tipo do evento:', body?.type)
    console.log('ID do evento:', body?.id)
    console.log('==================================')
    
    // Responde 200 pra Pagar.me parar de retentar
    return NextResponse.json({ ok: true })
    
  } catch (err: any) {
    console.error('Erro no webhook:', err)
    return NextResponse.json({ error: 'Erro' }, { status: 500 })
  }
}
