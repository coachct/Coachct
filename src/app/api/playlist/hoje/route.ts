// POST /api/playlist/hoje  { pin }
// Página dos coaches: confere o PIN e devolve a playlist de Lift e Running de hoje.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/api-admin'
import { hojeSP } from '@/lib/tempo'
import { conferirPin, playlistsDoDia } from '@/lib/playlist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const sb = supabaseAdmin()
    const erroPin = await conferirPin(sb, body?.pin)
    if (erroPin) return NextResponse.json({ error: erroPin }, { status: 401 })
    return NextResponse.json(await playlistsDoDia(sb, hojeSP()))
  } catch (err: any) {
    console.error('Erro em POST /api/playlist/hoje:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
