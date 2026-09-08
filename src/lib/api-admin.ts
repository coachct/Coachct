import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Confere que quem está chamando a rota é admin de verdade.
//
// As rotas de admin mais antigas não checam nada — dependem de a tela estar
// atrás do guard de role. Para disparo de e-mail em massa isso não serve: uma
// rota aberta aqui é alguém mandando 44 mil e-mails pelo nosso domínio e
// queimando a reputação de vez. Aqui o token do usuário é validado no
// servidor e o papel é lido do banco.
// Devolve { erro, userId }: erro preenchido = barrou. Formato simples de
// propósito — o projeto roda com strict:false, e aí o TypeScript não estreita
// união discriminada, então `{ok:true}|{ok:false}` não compila no chamador.
export async function exigirAdmin(
  req: NextRequest,
  supabase: SupabaseClient
): Promise<{ erro: NextResponse | null; userId: string }> {
  const cabecalho = req.headers.get('authorization') || ''
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : ''

  if (!token) {
    return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }), userId: '' }
  }

  const { data: userData, error: errUser } = await supabase.auth.getUser(token)
  if (errUser || !userData?.user) {
    return { erro: NextResponse.json({ error: 'Sessão inválida' }, { status: 401 }), userId: '' }
  }

  const { data: perfil } = await supabase
    .from('perfis').select('role').eq('id', userData.user.id).maybeSingle()

  if (perfil?.role !== 'admin') {
    return { erro: NextResponse.json({ error: 'Apenas admin' }, { status: 403 }), userId: '' }
  }

  return { erro: null, userId: userData.user.id }
}

/** Cliente com service_role. Só em rota de servidor. */
export function supabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
