# POP Predict — Phase 8 Regression + Merge Checklist

> Final gate before merging `feat/predict` into `master`. The merge is approval-gated:
> nothing merges without explicit sign-off. Last updated: 2026-07-11.

## 1. Automated / code checks (done)

These were verified during the Phase 8 consolidated review and need no manual action.

- [x] **Golden rule — PvP core untouched.** `git diff origin/master...feat/predict` changes
  none of: `contracts/src/Pop.sol`, `lib/resolver.ts`, `lib/engines/**`,
  `app/api/cron/resolve/route.ts`, `app/new/**`, `app/bet/**`, `lib/contracts.ts`,
  migrations `001`–`004`. The only pre-existing shared files touched are the four flagged
  Phase 7 UI touches: `components/AppNav.tsx`, `app/my/page.tsx`, `app/page.tsx`,
  `app/layout.tsx` (all additive; the 1v1 view is unchanged).
- [x] **Clean merge.** `git rev-list --left-right --count origin/master...feat/predict` = `0  36`:
  master has zero commits not already in `feat/predict`, so the merge is a conflict-free
  fast-forward.
- [x] **Crons authenticated.** `resolve-markets`, `curate-markets`, `settle-parlays` each
  reject any request without `Authorization: Bearer <CRON_SECRET>` (401).
- [x] **No hardcoded secrets** in the new Predict code; addresses/keys come from env.
- [x] **Contracts:** `forge test` = 101 passed / 0 failed (72 PredictMarket + 29 Parlay),
  including instant-resolution same-block finalize.

### Known low-severity items (accepted for testnet)

- **Same-block challenge race (7a).** With `challenge()` kept as `>` and `CHALLENGE_WINDOW = 0`,
  a participant could challenge in the exact block of the proposal, forcing owner arbitration
  instead of instant settlement. Practically impossible on a single-operator testnet, no fund
  loss. To fully disable for a future mainnet, change `challenge` to `>=` (neuters the
  arbitration tests).
- **Unauthenticated mirror routes.** `POST /api/markets` and `POST /api/parlays` are open by
  the on-chain-is-truth design (the DB is a read-model; funds and claims live on-chain and the
  resolver reconciles from chain). Fine for testnet; add existence validation before a mainnet.

## 2. Prerequisite before manual regression

The preview must point at the **new** Phase 7a contracts:

- [ ] Vercel Preview env `NEXT_PUBLIC_PREDICT_MARKET_CONTRACT` = `0x61e7F29d445A9D859dE5760c14caAa7B9DD29511`
- [ ] Vercel Preview env `NEXT_PUBLIC_PARLAY_CONTRACT` = `0x8Ac4E6F879Fc58c054d859E5f39cf7eb90c17c29`
- [ ] Redeploy the preview (the `NEXT_PUBLIC_*` values are inlined at build time)
- [ ] Point the four cron-job.org jobs at the current preview URL (they read the same env)

## 3. Manual preview regression (do on the branch preview)

### PvP (must be unchanged)
- [ ] `/lobby` lists open bets; create a 1v1 bet from `/new`; accept + resolve a bet as before.
- [ ] `/my` shows the 1v1 bets list with its stats + Active/Resolved/Disputed tabs, exactly as before.
- [ ] Invite-link bet flow (from master) still works.

### Predict — markets
- [ ] `/predict` lists markets; the Status and Type (crypto/sports/social) filters both work.
- [ ] Open a market: deposit on one side (approve + deposit), position locks to that side.
- [ ] **Instant resolution:** after a market's close time, one resolver run flips it straight to
  **Settled** (no lingering "Resolving"/"Proposed" for an hour). The result banner shows the
  winning outcome; the winner sees Claim, claims successfully; a loser sees the settled banner,
  no button.
- [ ] A voided market shows **Cancelled** + refund, and Claim refund works.
- [ ] Owner controls (edit/remove) appear only on an un-pooled market.

### Predict — parlays
- [ ] `/parlay` builds a slip across 2+ open markets; the combined multiplier quotes live.
- [ ] Buy a ticket (approve + buyTicket); it appears under your tickets and in Activity.
- [ ] Once every leg is terminal, the ticket settles (auto via cron or the Settle button) to
  Won / Lost / Refunded correctly, paid from the house pool.

### Curator + crons
- [ ] Trigger `curate-markets`: fresh markets appear on the new contract, **World Cup fixtures
  first** (e.g. France vs Spain), alongside crypto.
- [ ] `resolve-markets`, `settle-parlays`, and the PvP `resolve` crons each return JSON 200 with
  the Bearer + protection-bypass headers.

### Navigation + chrome
- [ ] Top nav = Home · Lobby · Predict · Activity; Predict stays lit on `/parlay`.
- [ ] Predict sub-nav (Markets | Parlays) on both pages.
- [ ] `/activity` = 1v1 Bets | Predictions | Parlays, each with stats + Active/Resolved sub-tabs;
  tab labels have no counts.
- [ ] One footer on every page with the real POP logo; no double footer on home. (Discord/X
  links are intentionally empty until real URLs are supplied.)
- [ ] `/predict/my` redirects to `/activity`.

## 4. Merge (APPROVAL-GATED)

- [ ] User gives explicit sign-off to merge in this session.
- [ ] Merge `feat/predict` into `master` (clean fast-forward).
- [ ] After merge: set both `NEXT_PUBLIC_*_CONTRACT` in Vercel **Production** scope + repoint the
  four cron-job.org jobs to production (`https://pop-arc.vercel.app/...`).
- [ ] Supply real Discord/X footer URLs.
