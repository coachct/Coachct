// src/app/api/ju/hibrido/montar/route.ts
//
// POST { texto, faixa, duracao_seg }: a Ju/admin descreve o treino híbrido em texto livre e o
// Claude devolve o esqueleto no formato do editor (abertura, blocos, estações, rodízio).
// Nada é gravado aqui — o rascunho volta para o editor, onde a pessoa confere e salva.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { montarTreino } from '@/lib/hibrido-montar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function autenticar(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  const { data: perfil } = await supabase.from('perfis').select('role').eq('id', user.id).maybeSingle()
  if (!perfil || !['admin', 'coordenadora', 'coach'].includes(perfil.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  return null
}

export async function POST(req: NextRequest) {
  const negado = await autenticar(req)
  if (negado) return negado
  const body = await req.json().catch(() => ({}))
  // modo 'ajustar': vem o treino que está na tela e o texto é só o que mudar
  const atual = body.modo === 'ajustar' && body.atual && Array.isArray(body.atual.blocos) ? body.atual : null
  const r = await montarTreino(String(body.texto || ''), { faixa: Number(body.faixa), duracao_seg: Number(body.duracao_seg) }, atual)
  return NextResponse.json(r.body, { status: r.status })
}
