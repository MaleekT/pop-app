// Bankroll knobs for the Predict section: how much the curator seeds into each market,
// and the parlay house-pool refill band. USDC has 6 decimals (1_000_000n = 1 USDC).
// Amounts are deliberately small: the seed recirculates (reclaimed on resolve/void) and
// the house recycles losing-parlay stakes, so a modest owner-wallet buffer sustains both.

export const SEED_PER_OUTCOME = 1_000_000n // 1 USDC seeded on each market outcome

export const HOUSE_FLOOR = 10_000_000n  // top up the parlay house when available < 10 USDC
export const HOUSE_TARGET = 25_000_000n // ...back up to 25 USDC

// Only reclaim from markets that resolved within this window. The on-chain `claimed` flag
// is the real dedup; this just caps how many terminal markets each run inspects.
export const RECLAIM_WINDOW_DAYS = 45
