# POP Predict — Autonomous Market Curator (Option B) — Spec

> Status: Spec only. Not built. Testnet, zero real cost.
> Purpose: keep open markets always available so the app is never empty and the owner never has to manually create markets daily.
> Last updated: 2026-07-07

## 1. Problem and goal

**Problem:** market creation is owner-only (curated). Today that means the owner must manually create markets every day, and whenever markets conclude, or the app runs dry with nothing to predict on. That is stressful and unreliable.

**Goal:** a scheduled job that automatically keeps a target number of open markets alive per category, so users always have something to bet on, and the owner does nothing day to day.

**Non-goals (explicitly out of scope):**
- No fee/revenue logic (separate decision).
- No fully permissionless user market creation (that is a different feature).
- No YouTube auto-markets (picking a video/channel is editorial, not automatable).
- No change to resolution, claims, or PvP.

## 2. Why this is safe (the key point)

The curator introduces **no new trust surface**. It reuses the **owner = resolver = deployer** wallet, which is **already** signing on-chain transactions autonomously every 5 minutes (the resolver cron calls `proposeOutcome` / `finalize` / `voidMarket` unattended right now). `createMarket` is `onlyOwner`, and that owner key already runs server-side. Having the same trusted key also call `createMarket` on a schedule is one more authorized action by a wallet that is already automated, not a new category of risk.

Market creation is also **deterministic** (pick a template, a resolve time, and reasonable params), which is exactly the kind of task that is safe to automate. It is not a subjective judgment call.

The private key never touches the browser. It lives only in the server-side cron env, exactly like `RESOLVER_PRIVATE_KEY` today.

## 3. Architecture (fully additive)

New files only. Nothing existing is modified except adding one env var and one cron-job.org trigger.

```
lib/markets/curator.ts            # the curation engine (generate + create + mirror)
lib/markets/curator-config.ts     # tunable knobs (coins, bands, horizons, targets, leagues)
app/api/cron/curate-markets/route.ts   # GET, Bearer CRON_SECRET, calls runCurator()
```

- Runs on its **own** cron-job.org trigger (e.g. every 6 hours), separate from `/api/cron/resolve-markets`. A bug in the curator cannot affect resolution or PvP.
- Reuses `RESOLVER_PRIVATE_KEY` (= owner) for `createMarket`, `PREDICT_MARKET_CONTRACT`, the markets Supabase client, and the existing engines/templates. No new secrets.
- Per created market it does the same two steps the manual `/predict/new` flow does, but server-side in one place: `createMarket(definitionHash, resolveAt, outcomeCount)` on-chain (owner wallet), parse the `MarketCreated` id, then insert the `markets` row.

## 4. Curation logic

### Each run
1. Read current open markets from the DB (`status = Pending`, active contract).
2. Count open markets per category.
3. For each category below its target, generate new market specs, skipping any that duplicate an existing open market.
4. Create up to a per-run cap (rate limit), then stop.

### Crypto (fully automatable, the MVP of the curator)
- Needs no new data. Uses CoinGecko (already integrated) for the current price.
- Config: an allowlist of coins (e.g. `bitcoin`, `ethereum`, `solana`), a set of bands (e.g. `above +5%`, `above +10%`, `below -5%`), and horizons (e.g. `24h`, `3d`, `7d`).
- For each (coin, band, horizon) not already live: fetch current price, compute `target = round(price × (1 ± band))`, set `resolveAt = now + horizon`, `template_key = crypto_price_above|below`, `outcomes = ["Yes","No"]`, build the definition text + hash, create.
- Deterministic and self-contained.

### Sports (automatable, a bit more work)
- Uses the existing `/api/sports/search` (TheSportsDB / API-Football) that already powers the manual bet form.
- Config: a set of leagues/teams to follow. The curator queries upcoming fixtures for those, and for each not-yet-listed fixture creates a `sports_winner` 3-way market with `resolveAt = kickoff + 3h`.
- Dedup by `fixtureId`.
- Slightly more involved than crypto because it depends on fixture discovery, so crypto ships first, sports second.

### YouTube (excluded)
- Choosing which video/channel to make a market on is editorial. Left manual or dropped from the rotation.

## 5. Config knobs (in `curator-config.ts`)

- `TARGET_OPEN.crypto`, `TARGET_OPEN.sports` (how many open markets to keep per category).
- `MAX_CREATES_PER_RUN` (rate limit, e.g. 3).
- `CRYPTO_COINS`, `PRICE_BANDS`, `HORIZONS`.
- `SPORTS_LEAGUES` / follow list.
- All plain constants, no redeploy needed to tune.

## 6. Safety and cost

- **Rate limited:** hard cap on markets created per run, so a bug or a bad config cannot spam the chain or the DB.
- **Idempotent / dedup:** never recreates a market that matches an existing open one.
- **Isolated:** its own cron route and module; failures cannot touch resolution or PvP.
- **Bounded gas:** the owner wallet needs a small ongoing USDC balance for `createMarket` gas. The curator should skip creation (and log) if the owner balance is below a floor, so it never gets stuck or drains the wallet.
- **Free tier only:** CoinGecko + TheSportsDB free tiers, cron-job.org free plan. No paid dependency, no risk to the zero-cost constraint.

## 7. Testing

- Unit tests (vitest, mocked) on the generation logic: given a price / fixture set, it produces the correct params, definition text, hash, resolve times, and correctly skips duplicates and respects the per-run cap.
- Integration: a manual/triggered run creates markets on-chain + DB on testnet, then the existing resolver settles them end to end.

## 8. Phase placement — when this gets built

Recommended sequence (pending your confirm):

- **Phase 5 (next): Parlay off-chain + UI.** The headline edge feature. Can be built and tested against manually created markets.
- **NEW Phase 6: Autonomous curator (this spec).** Makes the app self-sustaining. Crypto first, sports second.
- **Phase 7: Hardening.** Markets-engine unit tests, demo polish, final regression, merge `feat/predict` to `master`.

Alternative: if having always-on markets matters more during parlay testing (parlays need several open markets to bet across), the curator could be pulled **before** Phase 5. Your call.

## 9. Open decisions for you

1. Which coins, bands, and horizons for crypto (the defaults above are a starting point).
2. Which leagues/teams to follow for sports, or defer sports to a later pass and ship crypto-only first.
3. Target open-market counts per category and cron frequency.
4. Confirm the phase placement (Phase 6 vs pulled before Phase 5).
