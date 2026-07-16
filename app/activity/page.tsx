'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AppNav } from '@/components/AppNav'
import { BetsList } from '@/components/BetsList'
import { MarketCard } from '@/components/predict/MarketCard'
import { ParlayTicketCard } from '@/components/predict/ParlayTicketCard'
import { StatChip, StatRow } from '@/components/StatChip'
import { SubTabs } from '@/components/SubTabs'
import type { BetRow } from '@/lib/db.types'
import type { MarketRow, ParlayRow } from '@/lib/markets/db.types'

type Tab = '1v1' | 'predictions' | 'parlays'
type SubFilter = 'active' | 'resolved'
type PositionRow = MarketRow & { outcomeIndex: number }

const TABS: Tab[] = ['1v1', 'predictions', 'parlays']
const SUB_FILTERS: SubFilter[] = ['active', 'resolved']

// Unknown or absent values fall back to the old defaults, so a hand-edited URL degrades to the
// landing view rather than rendering an empty tab.
const parseTab = (v: string | null): Tab => (TABS.includes(v as Tab) ? (v as Tab) : '1v1')
const parseSub = (v: string | null): SubFilter => (SUB_FILTERS.includes(v as SubFilter) ? (v as SubFilter) : 'active')

export default function ActivityPage() {
  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 96px' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2.25rem, 4.5vw, 3.25rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
          ACTIVITY
        </h1>
        <div style={{ width: 48, height: 3, background: 'var(--color-pop-accent)', borderRadius: 99, marginBottom: 14 }} />
        <p style={{ color: 'var(--color-pop-muted)', margin: '0 0 28px', maxWidth: 560 }}>
          Everything you have staked, in one place — your 1v1 bets, market predictions, and parlay tickets.
        </p>

        {/* Reading useSearchParams opts a client subtree out of static prerender, and the App Router
            fails the build outright without a boundary around it. The shell above stays outside, so it
            still prerenders and the tabs are all that wait on the URL. */}
        <Suspense fallback={<p style={{ color: 'var(--color-pop-muted)' }}>Loading…</p>}>
          <ActivityBody />
        </Suspense>
      </main>
    </>
  )
}

function ActivityBody() {
  const { address, isConnected } = useAccount()
  const router = useRouter()
  const searchParams = useSearchParams()

  // The open tab lives in the URL, not in state. Held in state it was lost on every remount, so Back
  // out of a position dropped the user on 1v1 Bets rather than the tab they opened it from.
  const tab = parseTab(searchParams.get('tab'))
  const sub = parseSub(searchParams.get('sub'))

  const [bets, setBets] = useState<BetRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [tickets, setTickets] = useState<ParlayRow[]>([])
  const [loading, setLoading] = useState(true)

  // replace(), never push(): a tab is a view of one page, not a place. Pushing would stack an entry
  // per click, so Back out of a market would rewind through tabs instead of leaving Activity.
  const go = (next: { tab?: Tab; sub?: SubFilter }) =>
    router.replace(`/activity?tab=${next.tab ?? tab}&sub=${next.sub ?? sub}`, { scroll: false })

  useEffect(() => {
    if (!address) {
      setBets([])
      setPositions([])
      setTickets([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    Promise.all([
      fetch(`/api/bets?address=${encodeURIComponent(address)}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/api/positions?bettor=${encodeURIComponent(address)}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/parlays?bettor=${encodeURIComponent(address)}`).then((r) => r.json()).catch(() => []),
    ]).then(([b, m, t]) => {
      if (!active) return
      setBets(Array.isArray(b) ? b : [])
      setPositions(Array.isArray(m) ? m : [])
      setTickets(Array.isArray(t) ? t : [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [address])

  const tabs: [Tab, string][] = [
    ['1v1', '1v1 Bets'],
    ['predictions', 'Predictions'],
    ['parlays', 'Parlays'],
  ]

  // A prediction wins when the market resolved to the outcome the wallet backed.
  const predWon = positions.filter((p) => p.status === 'Resolved' && p.resolved_outcome === p.outcomeIndex).length
  const predLost = positions.filter((p) => p.status === 'Resolved' && p.resolved_outcome != null && p.resolved_outcome !== p.outcomeIndex).length
  const predVoided = positions.filter((p) => p.status === 'Voided').length
  const parWon = tickets.filter((t) => t.status === 'Won').length
  const parLost = tickets.filter((t) => t.status === 'Lost').length
  const parRefunded = tickets.filter((t) => t.status === 'Refunded').length

  // Sub-tab filtering: Active = still open/awaiting resolution; Resolved = terminal.
  const shownPositions = positions.filter((p) =>
    sub === 'resolved' ? p.status === 'Resolved' || p.status === 'Voided' : p.status !== 'Resolved' && p.status !== 'Voided',
  )
  const shownTickets = tickets.filter((t) => (sub === 'resolved' ? t.status !== 'Open' : t.status === 'Open'))

  if (!isConnected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
        <p style={{ color: 'var(--color-pop-muted)', margin: 0 }}>Connect your wallet to see your bets, positions, and tickets.</p>
        <ConnectButton />
      </div>
    )
  }

  return (
    <>
      <div role="tablist" aria-label="Activity" style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go({ tab: key })}
              style={{
                padding: '7px 16px', borderRadius: 'var(--radius-pill)', border: '1px solid',
                borderColor: active ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)',
                background: active ? 'rgba(215,255,30,0.08)' : 'var(--color-pop-surface)',
                color: active ? 'var(--color-pop-accent)' : 'var(--color-pop-muted)',
                fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {tab === '1v1' ? (
        loading ? (
          <p style={{ color: 'var(--color-pop-muted)' }}>Loading…</p>
        ) : bets.length === 0 ? (
          <EmptyState
            text="No 1v1 bets yet"
            sub="Challenge a friend to a peer-to-peer bet and it will show up here."
            href="/new"
            cta="Create a bet →"
          />
        ) : (
          <BetsList bets={bets} address={address} loading={loading} />
        )
      ) : tab === 'predictions' ? (
        loading ? (
          <p style={{ color: 'var(--color-pop-muted)' }}>Loading…</p>
        ) : positions.length === 0 ? (
          <EmptyState
            text="No market positions yet"
            sub="Back an outcome on a prediction market and it will show up here."
            href="/predict"
            cta="Browse markets →"
          />
        ) : (
          <>
            <StatRow>
              <StatChip label="Positions" value={positions.length} />
              <StatChip label="Won" value={predWon} variant="accent" />
              <StatChip label="Lost" value={predLost} variant="danger" />
              {predVoided > 0 && <StatChip label="Voided" value={predVoided} variant="muted" />}
            </StatRow>
            <SubTabs
              tabs={[{ key: 'active', label: 'Active' }, { key: 'resolved', label: 'Resolved' }]}
              active={sub}
              onSelect={(k) => go({ sub: k as SubFilter })}
            />
            {shownPositions.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-pop-muted)' }}>No {sub} predictions.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {shownPositions.map((m) => (
                  <MarketCard
                    key={`${m.contract_address}-${m.on_chain_id}`}
                    market={m}
                    // Checking a position you hold is an Activity job, so it keeps an Activity URL.
                    href={`/activity/market/${m.on_chain_id}`}
                    showStatus
                    backedOutcome={m.outcomeIndex}
                  />
                ))}
              </div>
            )}
          </>
        )
      ) : loading ? (
        <p style={{ color: 'var(--color-pop-muted)' }}>Loading…</p>
      ) : tickets.length === 0 ? (
        <EmptyState
          text="No parlay tickets yet"
          sub="Build a slip on the Parlay page and your tickets will show up here."
          href="/parlay"
          cta="Build a slip →"
        />
      ) : (
        <>
          <StatRow>
            <StatChip label="Tickets" value={tickets.length} />
            <StatChip label="Won" value={parWon} variant="accent" />
            <StatChip label="Lost" value={parLost} variant="danger" />
            {parRefunded > 0 && <StatChip label="Refunded" value={parRefunded} variant="muted" />}
          </StatRow>
          <SubTabs
            tabs={[{ key: 'active', label: 'Active' }, { key: 'resolved', label: 'Resolved' }]}
            active={sub}
            onSelect={(k) => go({ sub: k as SubFilter })}
          />
          {shownTickets.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-pop-muted)' }}>No {sub} tickets.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {shownTickets.map((t) => (
                <ParlayTicketCard
                  key={t.on_chain_id}
                  ticket={t}
                  // Reviewing a ticket you hold is an Activity job, so it keeps an Activity URL.
                  href={`/activity/parlay/${t.on_chain_id}`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

function EmptyState({ text, sub, href, cta }: { text: string; sub: string; href: string; cta: string }) {
  return (
    <div style={{ background: 'var(--color-pop-surface)', border: '1px dashed var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: '56px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--color-pop-text)', fontWeight: 600, margin: '0 0 6px' }}>{text}</p>
      <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.9rem', margin: '0 0 16px' }}>{sub}</p>
      <Link href={href} style={{ color: 'var(--color-pop-accent)', textDecoration: 'underline', fontSize: '0.9rem', fontWeight: 600 }}>{cta}</Link>
    </div>
  )
}
