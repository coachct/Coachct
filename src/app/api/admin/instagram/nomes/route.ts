// src/app/api/admin/instagram/nomes/route.ts
//
// Resolve nome/@usuário dos clientes do Instagram (que só vêm como IGSID).
// Usa a User Profile API do Instagram, cacheando em instagram_perfis para não
// reconsultar. Admin/coordenadora. Retorna { igsid: { nome, username } }.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const V = 'v21.0'
const MAX_FETCH = 40 // teto de buscas novas por chamada (evita timeout)

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer '))
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
    const { data: perfil } = await supabase.from('perfis').select('role').eq('id', user.id).maybeSingle()
    if (!perfil || !['admin', 'coordenadora'].includes(perfil.role))
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    // IGSIDs presentes nas conversas (amostra recente).
    const { data: msgs } = await supabase
      .from('instagram_mensagens')
      .select('igsid')
      .order('criado_em', { ascending: false })
      .limit(3000)
    const igsids = Array.from(new Set((msgs || []).map((m: any) => m.igsid)))

    // Perfis já cacheados.
    const { data: cache } = await supabase.from('instagram_perfis').select('igsid, username, nome')
    const mapa: Record<string, { nome: string | null; username: string | null }> = {}
    for (const p of (cache || [])) mapa[(p as any).igsid] = { nome: (p as any).nome, username: (p as any).username }

    // Busca os que faltam (com teto), via Instagram User Profile API.
    const igToken = process.env.INSTAGRAM_TOKEN
    const faltam = igsids.filter((id) => !(id in mapa)).slice(0, MAX_FETCH)
    if (igToken) {
      for (const igsid of faltam) {
        try {
          const url = `https://graph.instagram.com/${V}/${igsid}?fields=name,username&access_token=${encodeURIComponent(igToken)}`
          const resp = await fetch(url, { cache: 'no-store' })
          const data = await resp.json().catch(() => ({}))
          const nome = data?.name ?? null
          const username = data?.username ?? null
          mapa[igsid] = { nome, username }
          // cacheia (mesmo se vier nulo, pra não martelar a API; atualiza_em marca a tentativa)
          await supabase.from('instagram_perfis').upsert(
            { igsid, nome, username, atualizado_em: new Date().toISOString() },
            { onConflict: 'igsid' },
          )
        } catch {
          // ignora falha individual; tenta de novo numa próxima carga
        }
      }
    }

    return NextResponse.json({ nomes: mapa })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
