import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/hooks/useAuth'
import WhatsAppButton from '@/components/WhatsAppButton'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Just Club & CT - The End Of Boring Gyms',
  description: 'Personal ou treino coletivo: duas escolhas, um só resultado. Coach CT, Lift e Running em Vila Olímpia e Pinheiros.',
  // Atalho na tela de início do iPhone: nome "Just" e abre em tela cheia (sem a barra do Safari).
  // O ícone vem de src/app/apple-icon.png (o Next gera o <link> sozinho).
  appleWebApp: {
    capable: true,
    title: 'Just',
    statusBarStyle: 'black',
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <WhatsAppButton />
        </AuthProvider>
      </body>
    </html>
  )
}
