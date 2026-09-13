import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Playlist do dia · Just Club',
}

export default function PlaylistLayout({ children }: { children: React.ReactNode }) {
  return children
}
