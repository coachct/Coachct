import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Grava um evento do funil de campanha. Chamada pelo navegador, sem login.
//
// Escreve com a service_role de propósito: a tabela campanha_eventos não tem
// policy de INSERT, então ninguém consegue escrever nela direto pelo cliente.
// Aqui a gente valida o que entra e corta o que não interessa.
//
// Nada de IP, nada de user-agent: o que identifica é um id de sessão anônimo
// gerado no navegador. Se a pessoa comprar, a venda amarra o resto.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVENTOS = ['visita', 'clique_banner', 'ver_pacotes', 'checkout', 'compra']

// Corta texto solto que chega do navegador: evita lixo e campo gigante no banco.
function texto(v: any, max = 200): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function uuid(v: any): string | null {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const evento = texto(body.evento, 30)
    const sessao_id = texto(body.sessao_id, 80)
    if (!evento || !EVENTOS.includes(evento) || !sessao_id) {
      return NextResponse.json({ ok: false }, { status: 204 })
    }

    const dispositivo = body.dispositivo === 'mobile' ? 'mobile'
                      : body.dispositivo === 'desktop' ? 'desktop' : null

    await supabase.from('campanha_eventos').insert({
      sessao_id,
      evento,
      campanha:     texto(body.campanha, 40),
      pagina:       texto(body.pagina, 120),
      utm_source:   texto(body.utm_source, 60),
      utm_medium:   texto(body.utm_medium, 60),
      utm_campaign: texto(body.utm_campaign, 60),
      utm_content:  texto(body.utm_content, 60),
      referrer:     texto(body.referrer, 300),
      dispositivo,
      cliente_id:   uuid(body.cliente_id),
      produto_id:   uuid(body.produto_id),
    })

    return NextResponse.json({ ok: true })
  } catch {
    // Rastreio nunca devolve erro pro navegador: se falhar, falha calado.
    return NextResponse.json({ ok: false }, { status: 204 })
  }
}
