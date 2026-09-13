// POST /api/playlist/sugerir  { pin, modalidade: 'lift' | 'running' }
// Dia sem playlist: o coach aperta "Sugestão do dia". A RPC sorteia e grava —
// fica fixa no dia, então quem abrir depois (qualquer unidade) vê a mesma.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/api-admin'
import { hojeSP } from '@/lib/tempo'
import { conferirPin, playlistsDoDia } from '@/lib/playlist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const modalidade = String(body?.modalidade || '')
    if (!['lift', 'running'].includes(modalidade)) {
      return NextResponse.json({ error: 'Modalidade inválida' }, { status: 400 })
    }
    const sb = supabaseAdmin()
    const erroPin = await conferirPin(sb, body?.pin)
    if (erroPin) return NextResponse.json({ error: erroPin }, { status: 401 })

    const { error } = await sb.rpc('playlist_sugerir', { p_modalidade: modalidade })
    if (error) {
      console.error('Erro na RPC playlist_sugerir:', error)
      return NextResponse.json({ error: 'Não foi possível gerar a sugestão' }, { status: 500 })
    }
    return NextResponse.json(await playlistsDoDia(sb, hojeSP()))
  } catch (err: any) {
    console.error('Erro em POST /api/playlist/sugerir:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
