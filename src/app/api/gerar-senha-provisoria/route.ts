import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function gerarSenhaAleatoria(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let senha = ''
  const cryptoArr = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(cryptoArr)
    for (let i = 0; i < 8; i++) {
      senha += chars[cryptoArr[i] % chars.length]
    }
  } else {
    for (let i = 0; i < 8; i++) {
      senha += chars[Math.floor(Math.random() * chars.length)]
    }
  }
  return senha
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Acesso ao banco não configurado' }, { status: 500 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ── Autenticação: exige token de sessão de quem chamou ──
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { data: userData, error: errUser } = await admin.auth.getUser(token)
    if (errUser || !userData?.user) {
      return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 })
    }

    const { data: perfil } = await admin
      .from('perfis')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (!perfil || !['admin', 'recepcao'].includes(perfil.role)) {
      return NextResponse.json({ error: 'Sem permissão para esta ação.' }, { status: 403 })
    }

    // ── Cliente alvo ──
    const { cliente_id } = await req.json()
    if (!cliente_id) {
      return NextResponse.json({ error: 'cliente_id é obrigatório' }, { status: 400 })
    }

    const { data: cliente, error: errCli } = await admin
      .from('clientes')
      .select('id, nome, email, cpf, user_id')
      .eq('id', cliente_id)
      .maybeSingle()

    if (errCli || !cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    const senhaProvisoria = gerarSenhaAleatoria()

    // ── Caso 1: cliente JÁ tem acesso → apenas redefine a senha ──
    if (cliente.user_id) {
      const { error: errUpd } = await admin.auth.admin.updateUserById(cliente.user_id, {
        password: senhaProvisoria,
      })
      if (errUpd) {
        return NextResponse.json({
          error: 'Erro ao redefinir a senha: ' + errUpd.message
        }, { status: 500 })
      }
      return NextResponse.json({
        sucesso: true,
        acao: 'senha_redefinida',
        senha_provisoria: senhaProvisoria,
        nome: cliente.nome,
        email: cliente.email || null,
      })
    }

    // ── Caso 2: cliente SEM acesso → cria o acesso ──
    if (!cliente.email) {
      return NextResponse.json({
        error: 'Cliente sem email cadastrado. Cadastre o email antes de criar o acesso.'
      }, { status: 400 })
    }

    const emailCliente = String(cliente.email).toLowerCase()

    const { data: listaUsers, error: errList } = await admin.auth.admin.listUsers()
    if (errList) {
      return NextResponse.json({
        error: 'Erro ao verificar email: ' + errList.message
      }, { status: 500 })
    }

    const jaUsado = ((listaUsers?.users as any[]) || []).find(
      (u: any) => String(u?.email || '').toLowerCase() === emailCliente
    )

    if (jaUsado) {
      return NextResponse.json({
        error: 'Já existe um usuário com este email, mas não vinculado a este cadastro. Verifique antes de prosseguir.'
      }, { status: 400 })
    }

    const { data: novoUser, error: errAuth } = await admin.auth.admin.createUser({
      email: cliente.email,
      password: senhaProvisoria,
      email_confirm: true,
      user_metadata: {
        nome: cliente.nome,
        cpf: cliente.cpf,
        role: 'cliente',
        criado_por_admin: true,
      },
    })

    if (errAuth || !novoUser?.user) {
      return NextResponse.json({
        error: 'Erro ao criar acesso: ' + (errAuth?.message || 'desconhecido')
      }, { status: 500 })
    }

    const { error: errLink } = await admin
      .from('clientes')
      .update({ user_id: novoUser.user.id })
      .eq('id', cliente.id)

    if (errLink) {
      await admin.auth.admin.deleteUser(novoUser.user.id)
      return NextResponse.json({
        error: 'Erro ao vincular acesso: ' + errLink.message
      }, { status: 500 })
    }

    return NextResponse.json({
      sucesso: true,
      acao: 'acesso_criado',
      senha_provisoria: senhaProvisoria,
      nome: cliente.nome,
      email: cliente.email,
    })

  } catch (e: any) {
    console.error('Erro na route /api/gerar-senha-provisoria:', e)
    return NextResponse.json({
      error: 'Erro interno: ' + (e.message || 'desconhecido')
    }, { status: 500 })
  }
}
