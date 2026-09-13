// Playlists do dia do Club — acesso da página dos coaches (/playlist).
// Os coaches do Club não têm login no sistema: entram com um PIN único que o
// Ricardo define em admin/playlists. As rotas usam service role depois do PIN.
import { SupabaseClient } from '@supabase/supabase-js'

export type ItemPlaylist = { nome: string; link: string | null; observacao: string | null }
export type DiaPlaylist = { data: string; lift: ItemPlaylist | null; running: ItemPlaylist | null }

/** null = PIN confere; senão, a mensagem de erro. */
export async function conferirPin(sb: SupabaseClient, pin: unknown): Promise<string | null> {
  const { data } = await sb.from('playlist_config').select('pin').eq('id', 1).maybeSingle()
  if (!data?.pin) return 'PIN ainda não configurado'
  if (String(pin ?? '').trim() !== data.pin) {
    await new Promise(r => setTimeout(r, 600)) // freia tentativa em sequência
    return 'PIN incorreto'
  }
  return null
}

export async function playlistsDoDia(sb: SupabaseClient, data: string): Promise<DiaPlaylist> {
  const { data: rows } = await sb
    .from('playlist_dia')
    .select('modalidade, observacao, playlists(nome, link)')
    .eq('data', data)
  const item = (m: string): ItemPlaylist | null => {
    const r: any = (rows || []).find((x: any) => x.modalidade === m)
    return r?.playlists ? { nome: r.playlists.nome, link: r.playlists.link, observacao: r.observacao } : null
  }
  return { data, lift: item('lift'), running: item('running') }
}
