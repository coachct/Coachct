import { Space_Grotesk } from 'next/font/google'

// Visual escuro do esboço aprovado ("Montagem de Treino Híbrido — esboço"), só nas telas do híbrido.
const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-grotesk' })

export default function HibridoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${grotesk.variable} -m-4 md:-m-6 min-h-full bg-[#0e0e11] text-[#f2f2f4] text-sm leading-normal [&_option]:bg-[#18181c] [&_option]:text-[#f2f2f4] px-4 md:px-6 pt-8 pb-16`}
      style={{ colorScheme: 'dark' }}
    >
      {children}
    </div>
  )
}
