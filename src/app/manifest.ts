import type { MetadataRoute } from 'next'

// Atalho na tela de início (iPhone/Android): nome "Just", abre em tela cheia como app.
// Sem start_url: o atalho abre na página em que foi salvo (admin salva do admin, cliente do site).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Just Club & CT',
    short_name: 'Just',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
