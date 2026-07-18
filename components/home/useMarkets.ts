'use client'

import { useEffect, useState } from 'react'
import type { MarketRow } from '@/lib/markets/db.types'

// One board fetch shared by every homepage section that needs it (hero card, ticker, bento, stats).
// Without this each section fetched /api/markets itself, which meant four calls per page load and
// four copies of the "what counts as open" rule. One definition, one request.
//
// Note the cache and in-flight promise are only ever touched from inside an effect, so they stay
// client-side and never leak between server renders.

const TTL_MS = 30_000
const POLL_MS = 60_000

let cache: { at: number; data: MarketRow[] } | null = null
let inFlight: Promise<MarketRow[]> | null = null

function fetchMarkets(force = false): Promise<MarketRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.data)
  if (inFlight) return inFlight

  inFlight = fetch('/api/markets')
    .then((r) => {
      // A 500 still returns parseable JSON ({ error }), and treating that as an empty board would
      // publish "0 open markets" as if it were a fact. A failed read has to stay a failure.
      if (!r.ok) throw new Error(`/api/markets responded ${r.status}`)
      return r.json()
    })
    .then((data: unknown) => {
      if (!Array.isArray(data)) throw new Error('/api/markets did not return a list')
      const list = data as MarketRow[]
      cache = { at: Date.now(), data: list }
      return list
    })
    .finally(() => { inFlight = null })

  return inFlight
}

export interface MarketsState {
  /** null until the first response lands. */
  markets: MarketRow[] | null
  failed: boolean
}

// Every market for the live contract, all statuses. Consumers derive what they need.
export function useMarkets(): MarketsState {
  const [state, setState] = useState<MarketsState>({ markets: null, failed: false })

  useEffect(() => {
    let cancelled = false

    const load = (force: boolean) => {
      fetchMarkets(force)
        .then((list) => { if (!cancelled) setState({ markets: list, failed: false }) })
        // Keep whatever is on screen and flag the failure; consumers render "—" rather than a zero.
        .catch(() => { if (!cancelled) setState((s) => ({ markets: s.markets, failed: true })) })
    }

    load(false)
    const timer = setInterval(() => load(true), POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  return state
}

// Open = still accepting bets: mirrored as Pending AND not yet past its close time. Parsed once per
// row so a NaN resolve_at drops out instead of poisoning the sort.
export function openSorted(markets: MarketRow[] | null): MarketRow[] {
  if (!markets) return []
  const now = Date.now()
  return markets
    .map((m) => ({ m, resolveMs: new Date(m.resolve_at).getTime() }))
    .filter(({ m, resolveMs }) => m.status === 'Pending' && resolveMs > now)
    .sort((a, b) => a.resolveMs - b.resolveMs)
    .map(({ m }) => m)
}
