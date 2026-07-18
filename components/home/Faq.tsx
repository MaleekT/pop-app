import Link from 'next/link'
import { Reveal } from '@/components/home/Reveal'

// Native <details>/<summary> rather than a div plus useState. The browser gives correct semantics,
// keyboard handling and expanded state for free; the old hand-rolled accordion announced nothing.
//
// Every answer maps to something checked in the contracts or the engines:
//   1 hour window            Pop.sol:13 CHALLENGE_WINDOW
//   30 day dispute timeout   Pop.sol:14 + :196-202 (refunds both sides)
//   markets: no window       PredictMarket.sol:23 CHALLENGE_WINDOW = 0
//   void refunds everything  PredictMarket.sol:230-246 claimRefund
//   draw / push voids        lib/markets/engines/sports.ts:76, :85
//   parlay 10% / 2.5x / 15x  Parlay.sol:29, :38-45

const mono = 'var(--font-mono)'

// Five questions, deliberately. The mode-by-mode comparison lives in the Three Ways to Play section
// above, so it is not repeated here; the rest fold the facts that were previously their own entries
// (parlay house, draw and void handling, the challenge window) into the answer they belong to.
const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is POP?',
    a: 'POP runs three games on the same rails: pooled prediction markets, 1v1 bets between two people, and parlays. You stake USDC, and an automated agent settles the result from public data rather than human judgment. It runs on Arc testnet.',
  },
  {
    q: 'How are results settled, and what if I disagree?',
    a: 'At the close time an automated agent reads the public source the market is bound to, prices from CoinGecko and fixtures from api-sports.io and TheSportsDB, then proposes the outcome on-chain by comparing values with plain code. On a 1v1 you get a 1 hour challenge window; challenging opens a dispute where both sides vote, and if you never agree either side can reclaim their stake after the 30 day timeout. Markets settle with no challenge window. If a fixture is postponed or a two-way market ends in a draw, the market is voided and every stake is refunded in full.',
  },
  {
    q: 'Can my payout change after I bet?',
    a: 'On a market, yes. Markets are parimutuel, so your share is decided by how the pool looks when betting closes, not by how it looked when you backed a side. More money joining your side means a smaller slice each, which is why a market payout is always shown as provisional. A parlay is the opposite: its multiplier is locked the moment you buy. A 1v1 is simply the two stakes combined.',
  },
  {
    q: 'Is my money safe, and is there a house?',
    a: 'Your funds sit in the contract, never with us, and the resolver cannot take fees or send them to any other address. A 1v1 can only pay one of the two participants, and a market pays the winning side out of its own pool. Markets and 1v1 bets take no cut at all. The one exception is parlays, which pay from a house pool that keeps a 10% edge, with any single leg capped at 2.5x and the largest ticket 15x across five legs. The owner can seed a market to get it started, but seeding only adds to the prize pot and never touches the pools the odds are calculated from, so it cannot move the odds or take a side.',
  },
  {
    q: 'Which networks and tokens are supported?',
    a: 'POP runs on Arc testnet and settles in USDC, which is also the gas token on Arc. Testnet only, so no real funds are at risk today.',
  },
]

export function Faq() {
  return (
    <section id="faq" style={{ borderTop: '1px solid var(--color-pop-surface-2)' }}>
      <div className="faq-grid" style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 32px' }}>
        <Reveal className="faq-aside">
          <div style={{ fontFamily: mono, color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 14 }}>FAQ</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 3.6vw, 3rem)', margin: '0 0 20px', letterSpacing: '0.02em', lineHeight: 0.98 }}>
            COMMON QUESTIONS
          </h2>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--color-pop-muted)', maxWidth: 300, margin: '0 0 22px' }}>
            How the three games differ, what happens to your money, and where the odds come from.
          </p>
          <a href="https://x.com/_pop_arc" target="_blank" rel="noopener noreferrer" className="hero-cta hero-cta-secondary" style={{ display: 'inline-block' }}>
            Ask on X ↗
          </a>
        </Reveal>

        <Reveal delay={120} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map(({ q, a }) => (
            <details key={q} className="faq-item">
              <summary className="faq-summary">
                {q}
                <span className="faq-plus" aria-hidden="true">+</span>
              </summary>
              <p className="faq-answer">{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

export function ClosingCta() {
  return (
    <section style={{ borderTop: '1px solid var(--color-pop-surface-2)' }}>
      <Reveal style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 32px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2.25rem, 5.5vw, 4.5rem)', lineHeight: 0.92, letterSpacing: '0.02em', margin: '0 0 24px' }}>
          <span style={{ display: 'block', color: 'var(--color-pop-text)' }}>READY TO CALL</span>
          <span style={{ display: 'block', color: 'var(--color-pop-accent)' }}>A REAL ONE?</span>
        </h2>
        <p style={{ color: 'var(--color-pop-muted)', fontSize: '1rem', lineHeight: 1.7, margin: '0 auto 28px', maxWidth: 460 }}>
          Back a live market in a couple of clicks, or send a friend a bet they have to answer.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/predict" className="hero-cta hero-cta-primary">Explore markets ↗</Link>
          <Link href="/new" className="hero-cta hero-cta-secondary">Challenge a friend ↗</Link>
        </div>
      </Reveal>
    </section>
  )
}
