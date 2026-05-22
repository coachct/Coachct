import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CORS: iDFace pode mandar de qualquer origem da rede local
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders() })
}

// Helper: extrai parâmetros do request (pode vir como JSON, form-urlencoded ou query string)
async function extrairParams(req: NextRequest): Promise<Record<string, any>> {
  const params: Record<string, any> = {}

  // 1. Query string
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v
  })

  // 2. Body (tenta JSON, depois form-urlencoded)
  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json()
      Object.assign(params, body)
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text()
      const formParams = new URLSearchParams(text)
      formParams.forEach((v, k) => {
        params[k] = v
      })
    }
  } catch {
    // Ignora erro de parse (body vazio ou octet-stream)
  }

  return params
}

// Resposta padrão de NEGAR acesso
function negarAcesso(motivo: string) {
  return NextResponse.json({
    result: {
      event: 5, // Access Denied
      message: motivo,
    },
  }, { headers: corsHeaders() })
}

// Resposta padrão de LIBERAR acesso
function liberarAcesso(userId: number, userName: string, mensagem: string) {
  return NextResponse.json({
    result: {
      event: 7, // Access Granted
      user_id: userId,
      user_name: userName,
      user_image: false,
      portal_id: 1,
      message: mensagem,
      actions: [
        { action: 'door', parameters: 'door=1' },
      ],
    },
  }, { headers: corsHeaders() })
}

// === LÓGICA DE AUTORIZAÇÃO ===
async function verificarAcesso(cpf: string): Promise<{ ok: boolean; motivo: string; clienteId?: string; nome?: string }> {
  // 1. Busca o cliente pelo CPF
  const { data: cliente } = await supabase
    .from('clientes')
    .select('id, nome, bloqueado')
    .eq('cpf', cpf)
    .maybeSingle()

  if (!cliente) {
    return { ok: false, motivo: 'Cliente não encontrado no sistema.' }
  }

  if (cliente.bloqueado) {
    return { ok: false, motivo: 'Cliente bloqueado.' }
  }

  const hoje = new Date().toISOString().split('T')[0]

  // 2. Verifica se é funcionário (admin, coach, recepcao, coordenadora)
  const { data: perfil } = await supabase
    .from('perfis')
    .select('role')
    .eq('id', cliente.id) // Tenta linkar pelo cliente_id (não é o caso comum)
    .maybeSingle()

  // Outra forma: perfis ligados via user_id
  const { data: clienteComUser } = await supabase
    .from('clientes')
    .select('user_id')
    .eq('id', cliente.id)
    .maybeSingle()

  if (clienteComUser?.user_id) {
    const { data: perfilUser } = await supabase
      .from('perfis')
      .select('role')
      .eq('id', clienteComUser.user_id)
      .maybeSingle()

    if (perfilUser && ['admin', 'coach', 'recepcao', 'coordenadora'].includes(perfilUser.role)) {
      return { ok: true, motivo: 'Funcionário', clienteId: cliente.id, nome: cliente.nome }
    }
  }

  // 3. Verifica planos ativos do cliente
  const { data: planos } = await supabase
    .from('cliente_planos')
    .select(`
      id, ativo, inicio, fim, aceite_pendente,
      produtos(subtipo, nome)
    `)
    .eq('cliente_id', cliente.id)
    .eq('ativo', true)

  if (!planos || planos.length === 0) {
    return { ok: false, motivo: 'Sem plano ativo.' }
  }

  // 3a. Plano Just CT (acesso) — vigente?
  const planoAcesso = planos.find((p: any) => {
    if (!p.produtos || p.produtos.subtipo !== 'acesso') return false
    if (p.aceite_pendente) return false
    if (!p.fim) return true // sem data fim = vigente
    return p.fim >= hoje
  })
  if (planoAcesso) {
    return { ok: true, motivo: 'Plano Just CT ativo', clienteId: cliente.id, nome: cliente.nome }
  }

  // 3b. Coach CT Pro — vigente?
  const planoPro = planos.find((p: any) => {
    if (!p.produtos || p.produtos.subtipo !== 'coach_ct_pro') return false
    if (p.aceite_pendente) return false
    if (!p.fim) return true
    return p.fim >= hoje
  })
  if (planoPro) {
    return { ok: true, motivo: 'Coach CT Pro ativo', clienteId: cliente.id, nome: cliente.nome }
  }

  // 3c. Diária avulsa — vigente nos últimos 30 dias?
  const planoDiaria = planos.find((p: any) => {
    if (!p.produtos || p.produtos.subtipo !== 'credito') return false
    if (p.aceite_pendente) return false
    if (!p.fim) return false
    return p.fim >= hoje
  })
  if (planoDiaria) {
    return { ok: true, motivo: 'Diária avulsa ativa', clienteId: cliente.id, nome: cliente.nome }
  }

  return { ok: false, motivo: 'Sem plano vigente.' }
}

// === HANDLERS ===
export async function POST(req: NextRequest, { params }: { params: { endpoint: string } }) {
  const endpoint = params.endpoint
  const body = await extrairParams(req)

  console.log('[iDFace] POST', endpoint, body)

  // device_is_alive: ping a cada minuto — sempre 200 OK vazio
  if (endpoint === 'device_is_alive.fcgi') {
    return new NextResponse('', { status: 200, headers: corsHeaders() })
  }

  // session_is_valid: validação inicial — sempre 200 OK
  if (endpoint === 'session_is_valid.fcgi') {
    return NextResponse.json({ session_is_valid: true }, { headers: corsHeaders() })
  }

  // new_user_identified: pessoa apareceu na câmera, identificada localmente
  if (endpoint === 'new_user_identified.fcgi') {
    const userId = body.user_id
    const userName = body.user_name || ''

    if (!userId) {
      return negarAcesso('ID de usuário não recebido.')
    }

    // O user_id do iDFace está no formato numérico. Precisamos linkar com o CPF (registration)
    // Vamos buscar o user no iDFace via API pra pegar o "registration" (CPF)?
    // Não — mais simples: o user_id no iDFace é gerado pelo dispositivo. O CPF está em "registration".
    // Mas no payload do new_user_identified vem só o user_id numérico do dispositivo.
    // Precisamos manter uma mapa user_id->cpf, OU usar o user_name (que cadastramos como nome do cliente).

    // Por enquanto, vou buscar pelo NOME do usuário (que foi salvo igual ao nome do cliente).
    // Se isso falhar muito, depois criamos uma tabela de mapeamento idface_user_id -> cpf.

    if (!userName) {
      return negarAcesso('Usuário sem identificação.')
    }

    const { data: cliente } = await supabase
      .from('clientes')
      .select('cpf')
      .ilike('nome', userName.trim())
      .maybeSingle()

    if (!cliente?.cpf) {
      return negarAcesso(`Cliente "${userName}" não encontrado.`)
    }

    const result = await verificarAcesso(cliente.cpf)

    if (result.ok) {
      return liberarAcesso(userId, result.nome || userName, result.motivo)
    } else {
      return negarAcesso(result.motivo)
    }
  }

  // Outros endpoints (new_biometric_image, new_card, etc) — responde negando
  return negarAcesso('Tipo de identificação não suportado.')
}

export async function GET(req: NextRequest, { params }: { params: { endpoint: string } }) {
  const endpoint = params.endpoint
  console.log('[iDFace] GET', endpoint)

  // user_get_image: iDFace pede a foto de um user — não vamos servir (já está local)
  if (endpoint === 'user_get_image.fcgi') {
    return new NextResponse('', { status: 404, headers: corsHeaders() })
  }

  return new NextResponse('', { status: 200, headers: corsHeaders() })
}
