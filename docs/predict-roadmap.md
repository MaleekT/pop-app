# POP Predict — Build Roadmap

> Living roadmap for the Predict section (prediction markets + parlays) on `feat/predict`.
> Everything is additive to the untouched PvP 1v1 app; the only shared file touched across
> the whole build is `components/AppNav.tsx`. Arc Testnet only, zero real cost.
> Last updated: 2026-07-10.

## ✅ Done (Phases 0–6)

| # | Phase | Status |
|---|-------|--------|
| 0 | Scaffolding | ✅ |
| 1 | `PredictMarket.sol` (parimutuel) + Arc deploy + 72 Foundry tests | ✅ deployed `0x305f…ef67` |
| 2 | Markets off-chain: engines, resolver, cron, API (migration 006) | ✅ |
| 3 | Predict UI: list/detail, deposit/claim/refund, owner-gated create | ✅ |
| 4 | `Parlay.sol` (locked multiplier) + Arc deploy + 29 Foundry tests | ✅ deployed `0xcd69…d78a` |
| 5 | Parlay off-chain + UI (migration 007) | ✅ |
| 6 | Autonomous **crypto** curator + parlay auto-settle cron + vitest | ✅ |

---

## 🔨 Phase 6b — Market quality, liquidity & owner controls

The fixes and features surfaced during live testing. All additive, PvP untouched. Each unit
is committed + Vercel-verified (READY) + `/code-review`'d, and the memory file is updated after each.

### 6b.1 — Curator market diversity
- **Goal:** kill the all-Bitcoin board.
- Spread generation across **BTC/ETH/SOL**, mix **above/below**, across **24h/3d/7d**; per-coin
  balance so every run diversifies instead of filling one coin first.
- **Files:** `lib/markets/curator.ts`, `lib/markets/curator-config.ts` (+ tests).
- **Verify:** trigger the curate cron → a varied board on `/predict`.

### 6b.2 — Seed liquidity + capital recycling (the bankroll loop)
- **Goal:** real parlay odds (fix the always-50x) + a self-sustaining owner-wallet float, no
  manual faucet grind.
- Curator **seeds a small amount on every outcome** of each new market → no empty pools → the
  parlay multiplier grows gradually with legs (capped 50x).
- **Auto-reclaim** the owner's seed on resolve (`claim`) / void (`claimRefund`) back to the wallet.
- **House auto-topup**: cron funds the parlay house pool from the owner wallet when it dips below a floor.
- **Files:** `curator.ts` (seed step), a maintenance/reclaim module + cron wiring, config.
- **Verify:** new market has non-empty pools; a 2-leg parlay quotes ~4x not 50x; a resolved market
  returns its seed to the owner wallet.
- **Note:** faucet API auto-refill is NOT included — Circle gates `/v1/faucet/drips` behind a mainnet
  account upgrade. The recycling loop above makes a one-time ~30–50 USDC buffer self-sustaining, so the
  only residual manual step is an occasional public-faucet top-up (10 USDC/24h), rarely needed.

### 6b.3 — Sports curation
- **Goal:** auto-create upcoming match markets, not just crypto.
- Followed-teams config → reuse `/api/sports/search` for upcoming fixtures → create `sports_winner`
  markets (home/away/draw), seeded like crypto, dedup by fixture ID. YouTube stays manual (editorial).
- **Files:** `curator-config.ts` (followed teams), `curator.ts` (sports path).
- **Verify:** the curate cron creates football/basketball markets.

### 6b.4 — Predict form parity
- **Goal:** owner market-creation as easy as the bet form.
- Copy the bet-form widgets into **Predict-owned** components: sport **Football/Basketball toggle**,
  **live fixture autocomplete** (auto-fills teams/date), **coin search + live price**. No plain-text typing.
- **Files:** new `components/predict/*` widgets, wired into `app/predict/new/page.tsx`. PvP bet file untouched.
- **Verify:** typing "Spain" shows the fixture dropdown; sport is a toggle.

### 6b.5 — Owner-only market management
- **Goal:** remove/fix curated markets you don't like — but only before anyone has pooled in.
- **Delete** = owner-gated action → `voidMarket` on-chain (only when zero deposits **and** no parlay
  references) → hide in DB.
- **Edit** = remove the empty market + recreate (on-chain state is immutable) via a pre-filled create form.
- **Files:** owner-gated UI on `app/predict/[id]` + void action + guards.
- **Verify:** owner sees Remove on an empty market; blocked once pooled.

---

## 🚀 Phase 7 — Hardening, polish & merge
- Full regression across markets + parlays + curator + all crons.
- Security / edge pass (owner gating, cron auth, void/settle races).
- Demo polish (empty states, copy).
- Update docs + memory.
- **Merge `feat/predict` → `master`** — gated on user preview + approval.

---

## Rules applied to every 6b/7 unit
- **Additive only** — PvP logic never touched (the only shared file remains `AppNav`).
- **Commit + push per unit**; the Vercel build must go **READY** (local `node_modules` is broken, so
  Vercel is the compile gate).
- **`/code-review` per unit**; fix real findings.
- **Memory updated** after each.

**Suggested build order:** 6b.1 → 6b.2 → 6b.3 → 6b.4 → 6b.5 → Phase 7 (adjustable).
