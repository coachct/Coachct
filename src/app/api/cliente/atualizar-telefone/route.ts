import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PAGARME_API_URL = 'https://api.pagar.me/core/v5'
const PAGARME_API_KEY = process.env.PAGARME_API_KEY!

function getAuthHeader() {
  const credentials = Buffer.from(`${PAGARME_API_KEY}:`).toString('base64')
  return `Basic ${credentials}`
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: { user }, error: errAuth } = await supabase.auth.getUser(token)
    if (errAuth || !user) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data: cliente, error: errCliente } = await supabase
      .from('clientes').select('*').eq('user_id', user.id).maybeSingle()
    if (errCliente || !cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    const body = await req.json()
    const telLimpo = String(body?.telefone || '').replace(/\D/g, '')

    // DDD (2) + número (8 fixo ou 9 celular) = 10 ou 11 dígitos
    if (telLimpo.length < 10 || telLimpo.length > 11) {
      return NextResponse.json({ error: 'Telefone inválido. Informe DDD + número (10 ou 11 dígitos).' }, { status: 400 })
    }

    // 1) Grava o telefone no cadastro (resolve de vez para próximas operações)
    const { error: errUpdate } = await supabase
      .from('clientes').update({ telefone: telLimpo }).eq('id', cliente.id)
    if (errUpdate) {
      console.error('Erro ao gravar telefone do cliente:', errUpdate)
      return NextResponse.json({ error: 'Erro ao salvar telefone. Tente novamente.' }, { status: 500 })
    }

    // 2) Se já existe customer no Pagar.me, atualiza o objeto phones via PUT
    //    (cobre o caso de quem cadastrou cartão antes, com customer sem telefone)
    const customerId = cliente.pagarme_customer_id
    let pagarmeAtualizado = false

    if (customerId) {
      const phonesPayload = {
        phones: {
          mobile_phone: {
            country_code: '55',
            area_code: telLimpo.slice(0, 2),
            number: telLimpo.slice(2),
          }
        }
      }

      const resp = await fetch(`${PAGARME_API_URL}/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(phonesPayload),
      })
      const respData = await resp.json()

      pagarmeAtualizado = resp.ok

      await supabase.from('cartoes_log').insert({
        cliente_id: cliente.id,
        operacao: 'atualizar_telefone',
        pagarme_customer_id: customerId,
        sucesso: resp.ok,
        motivo: resp.ok ? 'Telefone atualizado no customer Pagar.me' : null,
        erro: resp.ok ? null : (respData?.message || 'Erro ao atualizar telefone no Pagar.me'),
        request_payload: phonesPayload,
        response_payload: respData,
        operado_por: user.id,
      })

      if (!resp.ok) {
        console.error('Erro ao atualizar telefone no Pagar.me:', JSON.stringify(respData, null, 2))
        // Telefone já foi salvo no banco; informamos a falha do PUT para retry/monitoramento
        return NextResponse.json({
          error: 'Telefone salvo, mas houve um erro ao atualizar na operadora. Tente novamente em instantes.',
          telefone: telLimpo,
        }, { status: 400 })
      }
    }

    return NextResponse.json({ ok: true, telefone: telLimpo, pagarme_atualizado: pagarmeAtualizado })

  } catch (err: any) {
    console.error('Erro inesperado em /api/cliente/atualizar-telefone:', err)
    return NextResponse.json({ error: 'Erro inesperado: ' + (err.message || 'desconhecido') }, { status: 500 })
  }
}
