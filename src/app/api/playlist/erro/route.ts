// POST /api/playlist/erro  { pin, modalidade, playlist_id }
// A sugestão do dia não abre no app: inativa essa playlist (sai de todas as
// sugestões) e sorteia outra na hora. Só vale pra playlist que veio de sugestão.
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
    const playlistId = String(body?.playlist_id || '')
    if (!['lift', 'running'].includes(modalidade) || !playlistId) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }
    const sb = supabaseAdmin()
    const erroPin = await conferirPin(sb, body?.pin)
    if (erroPin) return NextResponse.json({ error: erroPin }, { status: 401 })

    const { error } = await sb.rpc('playlist_sugestao_erro', { p_modalidade: modalidade, p_playlist_id: playlistId })
    if (error) {
      console.error('Erro na RPC playlist_sugestao_erro:', error)
      return NextResponse.json({ error: 'Não foi possível gerar outra' }, { status: 500 })
    }
    return NextResponse.json(await playlistsDoDia(sb, hojeSP()))
  } catch (err: any) {
    console.error('Erro em POST /api/playlist/erro:', err)
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 })
  }
}
