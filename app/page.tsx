'use client'

import { AppNav } from '@/components/AppNav'
import { useAccount } from 'wagmi'
import { PopCelebration } from '@/components/pop-celebration'
import { Hero } from '@/components/home/Hero'
import { TrustBands } from '@/components/home/TrustBands'
import { ThreeModes } from '@/components/home/ThreeModes'
import { HowItWorks } from '@/components/home/HowItWorks'
import { MarketsBento } from '@/components/home/MarketsBento'
import { Fairness } from '@/components/home/Fairness'
import { About } from '@/components/home/About'
import { Faq, ClosingCta } from '@/components/home/Faq'

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { address } = useAccount()

  return (
    <>
      <PopCelebration userAddress={address} />

      <AppNav />

      <Hero />

      <TrustBands />

      <ThreeModes />

      <HowItWorks />

      <MarketsBento />

      <Fairness />

      <About />

      <Faq />

      <ClosingCta />
    </>
  )
}


