import { Space_Grotesk } from 'next/font/google'

// Tela da TV da sala (teste da fase 1): tela cheia, sem menu.
const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-grotesk' })

export default function HibridoTvLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${grotesk.variable} min-h-screen bg-black text-[#f2f2f4]`} style={{ colorScheme: 'dark' }}>
      {children}
    </div>
  )
}
