import type { Metadata } from 'next'
import { Bebas_Neue, Space_Grotesk } from 'next/font/google'
import { Providers } from '@/components/providers'
import { Footer } from '@/components/Footer'
import './globals.css'

const bebasNeue = Bebas_Neue({
  variable: '--font-bebas',
  subsets: ['latin'],
  weight: '400',
})

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'POP — Settle bets with friends. Instantly.',
  description: 'Private peer-to-peer bets settled automatically. Stake USDC, let the agent call it, collect in seconds.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0B0B0F] text-[#F5F5F7]">
        <Providers>{children}</Providers>
        <Footer />
      </body>
    </html>
  )
}
