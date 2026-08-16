import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Unifica dois cadastros de cliente duplicados.
// Move todo o histórico do duplicado para o cadastro que fica, guarda snapshot
// para auditoria e apaga o duplicado — tudo dentro da função SQL (transação única).
export async function POST(req: NextRequest) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
    if (!serviceKey) {
      return NextResponse.json({ error: 'Acesso ao banco não configurado' }, { status: 500 })
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Autenticação: só admin ────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: userData, error: errUser } = await admin.auth.getUser(token)
    if (errUser || !userData?.user) {
      return NextResponse.json({ error: 'Sessão inválida. Recarregue a página.' }, { status: 401 })
    }

    const { data: perfil } = await admin
      .from('perfis').select('role').eq('id', userData.user.id).maybeSingle()

    if (!perfil || !['admin', 'coordenadora'].includes(perfil.role)) {
      return NextResponse.json({ error: 'Só o admin pode unificar cadastros.' }, { status: 403 })
    }

    // ── Alvos ────────────────────────────────────────────────────────────────
    const { manter_id, remover_id } = await req.json()
    if (!manter_id || !remover_id) {
      return NextResponse.json({ error: 'Informe os dois cadastros.' }, { status: 400 })
    }
    if (manter_id === remover_id) {
      return NextResponse.json({ error: 'Os dois cadastros são o mesmo.' }, { status: 400 })
    }

    const { data: antes } = await admin
      .from('clientes').select('id, nome, email, cpf').in('id', [manter_id, remover_id])
    if (!antes || antes.length !== 2) {
      return NextResponse.json({ error: 'Um dos cadastros não foi encontrado.' }, { status: 404 })
    }

    const { data, error } = await admin.rpc('unificar_clientes', {
      p_manter: manter_id,
      p_remover: remover_id,
      p_feito_por: userData.user.id,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const movidos = (data as any)?.movidos || {}
    const total = Object.values(movidos).reduce((s: number, n: any) => s + Number(n || 0), 0)

    return NextResponse.json({
      ok: true,
      movidos,
      total_registros: total,
      cliente: (data as any)?.cliente || null,
      removido: antes.find(c => c.id === remover_id) || null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}
