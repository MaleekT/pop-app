# POP - PRD: "Predict" Section (Prediction Market + Parlay)

> Status: Draft for build. Testnet only. Zero real cost.
> Branch: `feat/predict` (cut from `master`).
> Golden rule: PvP is never touched. Predict is fully additive.
> Last updated: 2026-07-07

---

## 0. Summary

Add a second section to POP called **Predict**, sitting beside the existing PvP section in the nav. Predict has two products:

1. **Prediction markets** open to many participants, run as **pooled (parimutuel)** markets.
2. **Parlays** that bundle 2 or more market legs into one ticket at a **locked, multiplied payout**. This is the edge over Polymarket, which has no native parlay.

Everything ships on Arc Testnet at zero real cost using the existing free stack (Next.js, Foundry, Supabase free tier, Vercel Hobby, cron-job.org free plan, CoinGecko / TheSportsDB / API-Football / YouTube free tiers).

### Decisions locked into this PRD

| Question | Decision |
|----------|----------|
| Market mechanism | Pooled / parimutuel for single markets. Self-funding, no house, no solvency risk. |
| Parlay mechanism | Fixed multiplier locked at purchase, computed on-chain from each leg's live pool odds, capped, paid from a testnet house pool seeded with free faucet USDC. |
| Sports data | Reuse the existing TheSportsDB / API-Football data path and the `home_win / away_win / draw` logic, via a **zero-touch copy** into a new markets engine (existing `lib/engines/sports.ts` stays byte-for-byte the same). |
| Crypto oracle | Keep CoinGecko for Phase 1. Pyth is a confirmed later upgrade (Pyth is live on Arc testnet as Circle's default oracle; Chainlink Data Feeds are also on Arc). |
| Branch | `feat/predict` off `master`. Nothing reaches `master` until Predict is proven working. |

---

## 1. Verification of the existing codebase (read this session, not assumed)

Confirmed by reading the real source, so the additive plan rests on facts:

- **`contracts/src/Pop.sol`** is a registry contract: `mapping(uint256 => Bet) public bets`. One `Bet` struct fuses escrow (creator, opponent, stake) and resolution (status, proposedWinner, evidenceHash, creatorVote, opponentVote).
- **The 2-party constraint is hard-coded in contract logic.** `proposeResolution` reverts `InvalidWinner()` unless `winner == b.creator || winner == b.opponent` (Pop.sol line 125). `voteWinner` needs both named parties to agree. This is why "outcome" cannot be bolted onto the existing struct and needs its own contract.
- **`resolver` is `immutable`, set at deploy** (Pop.sol line 12). The new contracts can be deployed with the same resolver EOA without touching this binding.
- **Constants:** `CHALLENGE_WINDOW = 1 hours`, `RESOLUTION_TIMEOUT = 30 days`, `MIN_CLAIM_TO_RESOLVE_GAP = 2 hours`. All per-bet (`proposedAt`, `acceptedAt` live on the struct).
- **Resolution is deterministic code, not AI.** `lib/engines/*` hit CoinGecko, TheSportsDB / API-Football, and YouTube Data API v3. `TECHSTACK.md` line 423: "Never add an LLM to the resolution decision path." (The "AI-proposed resolution" wording elsewhere in the docs is marketing only.)
- **Engines are already outcome-shaped.** `lib/engines/sports.ts` computes `computeActualOutcome(homeScore, awayScore): 'home_win' | 'away_win' | 'draw'` (line 71) before mapping to a winner address. `lib/engines/crypto-price.ts` computes a plain boolean before mapping. The 1v1 collapse is only the last step. Note: `computeActualOutcome` and the fetch helpers are **module-private** (not exported).
- **Off-chain mirrors on-chain.** One flat `bets` table carries `proposed_winner`, `evidence`, `status` on the row. No separate outcome table exists.
- **One resolver, one cron.** `lib/resolver.ts` -> `getEngine()` routes by template prefix; `app/api/cron/resolve/route.ts` is a single GET guarded by `Bearer CRON_SECRET`.
- **Generic presentational components exist and are safe to reuse:** `UsdcAmount`, `TxLink`, `Countdown`, `StatusBadge` (plus `Logo`, `pop-celebration`).
- **Minor drift from the brief:** migrations are `001` to `005` (005 is profiles), not `001` to `004`. Not material.

---

## 2. Principles and constraints

1. **Additive only.** No edits to `Pop.sol`, the `bets` table, `lib/resolver.ts`, `lib/engines/*`, `app/api/cron/resolve/route.ts`, `app/new/page.tsx`, or `app/bet/[id]/page.tsx`.
2. **Two honest shared-file touches** (flagged, not hidden). See section 9.
3. **Zero real cost.** Free tiers only. Any risk to this is flagged in-line.
4. **Testnet only.** Faucet USDC. The parlay house pool is free testnet USDC.
5. **Code quality:** many small files (200 to 400 lines typical, 800 max), immutable data patterns, explicit types on exported functions, no comments unless the "why" is non-obvious, USDC always 6 decimals.
6. **PvP keeps running untouched** the entire time.

---

## 3. Architecture at a glance

```
                          ┌─────────────────────────── PvP (UNTOUCHED) ──────────────────────────┐
                          │  Pop.sol   bets table   lib/resolver.ts   /api/cron/resolve           │
                          │  lib/engines/*   app/new   app/bet/[id]                                │
                          └───────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────── Predict (NEW, ADDITIVE) ─────────────────────────────────────┐
  │                                                                                                        │
  │  On-chain (Foundry)          Off-chain (TypeScript)              Frontend (Next.js)                    │
  │  ─────────────────           ──────────────────────              ──────────────────                    │
  │  PredictMarket.sol   ◀──────  lib/markets/resolver.ts   ◀──────  app/predict/  (list, detail, new, my) │
  │  Parlay.sol          ◀──────  lib/markets/engines/*     ◀──────  app/parlay/   (build, ticket)         │
  │       ▲                       /api/cron/resolve-markets          components/predict/*                  │
  │       │                       /api/markets/*  /api/parlays/*     lib/predict/contracts.ts (new)        │
  │  same resolver EOA            (separate cron, separate module)   reuse UsdcAmount/TxLink/Countdown/...  │
  │                                                                                                        │
  │  DB: markets, market_positions, parlays  (migrations 006, 007)                                         │
  └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Full isolation: new contracts, new tables, new engines, new resolver, new cron, new routes, new contract-config file. The only shared files touched are `components/AppNav.tsx` (one nav link) and, optionally, nothing else.

---

## 4. Product model

### 4.1 Prediction market (pooled / parimutuel)

- A market is one proposition with 2 or 3 named outcomes (indexed `0..n-1`), for example:
  - `crypto_price_above`: `[Yes, No]`
  - `sports_winner` (3-way): `[Home, Away, Draw]`
  - `sports_score`: `[Over, Under]`
  - `youtube_views`: `[Yes, No]`
- Participants deposit testnet USDC into the outcome they back. The contract holds all deposits.
- "Live odds/price" is purely the pool ratio: for outcome `i`, implied probability is `pool[i] / totalPot`. It is informational and moves until resolution.
- At `resolveAt`, the markets resolver proposes the winning outcome index (deterministic engine). After the challenge window passes with no challenge, the market finalizes.
- **Payout is pull-based.** Each winner calls `claim` and receives `stake_i * totalPot / pool[winningOutcome]`. Losers get nothing. No on-chain loop over winners.
- **No house money.** The pot pays itself. Zero solvency risk.

**Edge rules (specified so they are not discovered late):**
- If the winning outcome pool is `0` (nobody backed the correct side), the market **voids** and everyone refunds their own stake. There is no fair distribution otherwise.
- Single-sided market that wins: everyone just gets their stake back (share equals stake). Consistent with the pot math.
- Rounding dust from integer division stays in the contract and is negligible on testnet; documented, not swept in Phase 1.
- Betting cutoff is `resolveAt`. No deposits after it.

### 4.2 Parlay (locked multiplier, testnet house pool)

- A ticket references 2 or more market legs, each with a picked outcome index and one stake.
- **Multiplier is computed on-chain at purchase** from each leg's live parimutuel odds, then capped and locked onto the ticket:
  - leg odds (scaled) = `totalPot * ODDS_SCALE / pool[pickedOutcome]`, floored at `1x`, and if `pool[pickedOutcome] == 0` it uses the cap.
  - combined = product of leg odds, capped at `MAX_MULTIPLIER`.
- Stake goes into the `Parlay` contract. Payout on a full win is `stake * lockedMultiplier / ODDS_SCALE`, paid from the **house pool**.
- **Settlement waits for every leg to reach a terminal state**, meaning each referenced market is either `Resolved` (finished its own challenge window) or `Voided`. A leg still `Pending`, `Proposed`, or `Challenged` blocks settlement until it becomes terminal.
  - Any referenced market **Voided**: ticket **Refunded** (stake returned, reservation released). Checked first, so a void never hangs the ticket.
  - Else all legs match their pick: ticket **Won**, pays `stake * lockedMultiplier / ODDS_SCALE`.
  - Else (all terminal, at least one mismatch): ticket **Lost**, stake moves into the house pool, reservation released.
- **House pool** is a balance the `Parlay` contract holds, seeded by the owner with free faucet USDC (`fundHouse`). Losing stakes flow into it.
- **Solvency is guaranteed by reservation at purchase.** `buyTicket` computes the payout and reserves the house's marginal liability (`payout - stake`, always >= 0 since the multiplier is >= 1x) against an available balance of `houseBalance - totalReserved`. If it cannot be covered, the purchase reverts with `InsufficientHouse`. Stakes are held separately and never used to back other tickets. Because the liability is reserved up front, `settle` can always pay a win. On testnet the pool is free faucet USDC, so this costs nothing real.
- Payout goes to a single recipient (the bettor), so a direct transfer is fine (no loop).

**Honest tradeoff:** the parlay house pool is a funded, semi-trusted element, unlike the self-funding single-market pool. Fine and free on testnet. A real mainnet would need a bankroll or a more advanced design. Out of scope for Phase 1.

---

## 5. Data model (new tables, new migrations)

New migration files, parallel to `bets`, never a column added to it.

### 5.1 `006_create_markets.sql`

```sql
create table markets (
  id               bigserial primary key,
  on_chain_id      text        not null,
  contract_address text        not null,          -- PredictMarket address
  category         text        not null,          -- 'crypto' | 'sports' | 'youtube'
  template_key     text        not null,          -- reuses the 6 template keys
  params           jsonb       not null default '{}',
  outcomes         jsonb       not null,          -- ["Home","Away","Draw"] etc, index-aligned
  definition_text  text        not null,
  definition_hash  text        not null,          -- keccak256(toHex(definition_text)), verified server-side
  resolve_at       timestamptz not null,
  status           text        not null default 'Pending',  -- Pending|Proposed|Challenged|Resolved|Voided
  resolved_outcome int         null,              -- winning outcome index, null until resolved
  evidence         jsonb       null,
  created_at       timestamptz not null default now(),
  unique (on_chain_id, contract_address)
);

create table market_positions (
  id            bigserial primary key,
  market_id     bigint      not null references markets(id) on delete cascade,
  bettor        text        not null,
  outcome_index int         not null,
  amount        text        not null,             -- raw bigint string, USDC 6 decimals
  tx_hash       text        null,
  created_at    timestamptz not null default now()
);

create index market_positions_market_idx on market_positions(market_id);
create index market_positions_bettor_idx on market_positions(bettor);
```

### 5.2 `007_create_parlays.sql`

```sql
create table parlays (
  id                bigserial primary key,
  on_chain_id       text        not null,
  contract_address  text        not null,          -- Parlay address
  bettor            text        not null,
  stake             text        not null,          -- raw bigint string
  locked_multiplier text        not null,          -- scaled by ODDS_SCALE, bigint string
  legs              jsonb       not null,          -- [{ marketOnChainId, outcomeIndex }]
  status            text        not null default 'Open',  -- Open|Won|Lost|Refunded
  created_at        timestamptz not null default now(),
  unique (on_chain_id, contract_address)
);
```

On-chain is the source of truth. These tables are the fast read model for the UI, exactly like `bets` mirrors `Pop.sol`.

---

## 6. Smart contracts (new, own deploy)

Style follows `Pop.sol`: `SafeERC20`, `ReentrancyGuard`, custom errors, immutable `resolver`, registry mapping. Kept small and single-responsibility.

### 6.1 `contracts/src/predict/PredictMarket.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PredictMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20  public immutable USDC;
    address public immutable resolver;    // same EOA as Pop.sol resolver, bound at deploy
    address public immutable owner;       // creates markets (curated demo)

    uint256 public constant CHALLENGE_WINDOW = 1 hours;

    enum Status { Pending, Proposed, Challenged, Resolved, Voided }

    struct Market {
        bytes32 definitionHash;
        uint64  resolveAt;
        uint64  proposedAt;
        uint8   outcomeCount;
        uint8   resolvedOutcome;   // valid once status == Resolved
        Status  status;
        bytes32 evidenceHash;
    }

    uint256 public nextId;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(uint8 => uint256)) public pool;              // marketId => outcome => total
    mapping(uint256 => uint256) public totalPot;                           // marketId => sum of pools
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public staked; // per user
    mapping(uint256 => mapping(address => bool)) public claimed;

    // events + errors omitted here for brevity, defined in full file

    function createMarket(bytes32 definitionHash, uint64 resolveAt, uint8 outcomeCount)
        external returns (uint256 id);          // owner only, 2 <= outcomeCount <= 3

    function deposit(uint256 id, uint8 outcome, uint128 amount)
        external nonReentrant;                  // Pending only, before resolveAt, pulls USDC

    function proposeOutcome(uint256 id, uint8 outcome, bytes32 evidenceHash)
        external nonReentrant;                  // resolver only, after resolveAt

    function challenge(uint256 id) external nonReentrant;   // participant, within window
    function finalize(uint256 id) external nonReentrant;    // after window, no challenge
    function claim(uint256 id) external nonReentrant;       // pull-based pro-rata payout
    function voidMarket(uint256 id, bytes32 evidenceHash) external nonReentrant; // resolver
    function claimRefund(uint256 id) external nonReentrant; // pull-based refund on void

    // views used by Parlay
    function poolInfo(uint256 id, uint8 outcome)
        external view returns (uint256 sidePool, uint256 pot);

    function resultOf(uint256 id)
        external view returns (Status status, uint8 resolvedOutcome);
}
```

Claim math (pull-based): `payout = staked[id][winning][msg.sender] * totalPot[id] / pool[id][winning]`.

### 6.2 `contracts/src/predict/Parlay.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { PredictMarket } from "./PredictMarket.sol";

contract Parlay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20         public immutable USDC;
    PredictMarket  public immutable market;
    address        public immutable owner;      // funds the house pool

    uint256 public constant ODDS_SCALE = 1e6;           // 1.000000x
    uint256 public constant MAX_MULTIPLIER = 50 * ODDS_SCALE;
    uint256 public constant MIN_LEGS = 2;

    enum Status { Open, Won, Lost, Refunded }

    struct Leg { uint256 marketId; uint8 outcome; }

    struct Ticket {
        address bettor;
        uint128 stake;
        uint256 lockedMultiplier;   // scaled by ODDS_SCALE
        Status  status;
    }

    uint256 public nextId;
    uint256 public houseBalance;    // owner-seeded, absorbs losing stakes
    uint256 public totalReserved;   // sum of open tickets' house liability
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => Leg[]) public legs;

    error InsufficientHouse();

    function fundHouse(uint128 amount) external nonReentrant;   // owner seeds free faucet USDC

    // reverts InsufficientHouse unless houseAvailable() covers (payout - stake)
    function buyTicket(Leg[] calldata picks, uint128 stake)
        external nonReentrant returns (uint256 id);            // computes, caps, locks, reserves

    function settle(uint256 id) external nonReentrant;         // once every leg is terminal

    function quote(Leg[] calldata picks) external view returns (uint256 multiplier); // UI preview
    function houseAvailable() external view returns (uint256); // houseBalance - totalReserved
}
```

Multiplier fold (view + purchase, identical math):

```solidity
uint256 acc = ODDS_SCALE;
for (uint256 i; i < picks.length; ++i) {
    (uint256 sidePool, uint256 pot) = market.poolInfo(picks[i].marketId, picks[i].outcome);
    uint256 legOdds = sidePool == 0 ? MAX_MULTIPLIER : (pot * ODDS_SCALE) / sidePool;
    if (legOdds < ODDS_SCALE) legOdds = ODDS_SCALE;   // never below 1x
    acc = (acc * legOdds) / ODDS_SCALE;
}
if (acc > MAX_MULTIPLIER) acc = MAX_MULTIPLIER;
```

Settlement accounting (reservation makes it always solvent):
- **Won:** transfer `payout = stake * lockedMultiplier / ODDS_SCALE` to the bettor; release the reservation.
- **Lost:** move `stake` into `houseBalance`; release the reservation.
- **Refunded (any leg voided):** return `stake` to the bettor; release the reservation.

Because `payout - stake` is reserved at purchase, the house always holds enough to pay a win, so `settle` never reverts for lack of funds.

---

## 7. Off-chain resolution (new engines, new resolver, new cron)

New folder `lib/markets/`. Existing `lib/engines/*` and `lib/resolver.ts` are never edited.

### 7.1 `lib/markets/engines/types.ts`

The result carries an **outcome index**, not a winner address. This is the core shape difference from PvP.

```typescript
export type MarketResolveResult =
  | { pending: true }
  | { pending: false; voided: true; evidence: MarketEvidence }
  | { pending: false; voided: false; outcomeIndex: number; rawValue: string; sourceUrl: string; fetchedAt: string }

export interface MarketEvidence {
  sourceUrl: string
  rawStatus: string
  fetchedAt: string
}

export interface MarketResolveInput {
  templateKey: string
  params: Record<string, string>
  outcomeCount: number
}
```

### 7.2 Engines

- `lib/markets/engines/crypto-price.ts` calls the same CoinGecko `simple/price` endpoint, returns `outcomeIndex` (`0 = Yes/above`, `1 = No`) plus `rawValue`.
- `lib/markets/engines/sports.ts` is a **zero-touch copy** of the fetch + `computeActualOutcome` logic from `lib/engines/sports.ts`, returning `outcomeIndex` (`0 = Home`, `1 = Away`, `2 = Draw`) or the over/under index. Existing PvP sports engine stays byte-for-byte identical.
- `lib/markets/engines/youtube.ts` copies the YouTube fetch, returns Yes/No index.

Rationale for copy over export: absolute isolation of PvP. The alternative (add `export` to the two private helpers in `lib/engines/sports.ts`) is a one-word additive change that cannot break existing callers, and is available if we later prefer DRY over isolation. Phase 1 chooses isolation.

### 7.3 `lib/markets/resolver.ts`

Mirrors the PvP resolver shape but writes an outcome index, not a winner:

```typescript
export async function runMarketResolver(): Promise<MarketResolverResult> {
  // 1. verify RESOLVER_PRIVATE_KEY matches PredictMarket.resolver() on-chain
  // 2. query markets where status = 'Pending' and resolve_at <= now
  //    and contract_address = NEXT_PUBLIC_PREDICT_MARKET_CONTRACT
  // 3. per market: engine.resolve(...) -> pending | voided | { outcomeIndex }
  // 4. voided  -> voidMarket(id, evidenceHash),   DB status 'Voided'
  //    resolved -> proposeOutcome(id, outcomeIndex, evidenceHash), DB status 'Proposed'
}
```

### 7.4 Cron routes (new, separate triggers)

`app/api/cron/resolve-markets/route.ts`: GET, `Bearer CRON_SECRET`, its own cron-job.org trigger (every 5 minutes), fully separate from `/api/cron/resolve`. A bug here cannot touch the PvP resolver. Each run does three passes:

1. **Propose:** markets with status `Pending` and `resolve_at <= now` -> engine -> `proposeOutcome` (status `Proposed`) or `voidMarket` (status `Voided`).
2. **Finalize:** markets with status `Proposed`, past their challenge window (`proposedAt + CHALLENGE_WINDOW < now`) and not `Challenged` -> call `finalize()` -> status `Resolved`. `finalize()` is permissionless on-chain; the cron drives it for reliability.
3. **Settle parlays:** tickets whose every leg is terminal (`Resolved` or `Voided`) -> `settle()`. Also exposed as a user "Settle" button.

**Challenged markets (Phase 1):** the resolver skips a `Challenged` market. On testnet the owner arbitrates it (re-propose the correct outcome, or void). A parlay with a `Challenged` leg simply waits until that leg becomes terminal. Full multi-party dispute is deferred to a later phase.

---

## 8. Frontend (new routes only, plus one nav link)

Reuse the generic components (`UsdcAmount`, `TxLink`, `Countdown`, `StatusBadge`). New feature components live under `components/predict/`.

New contract config in a **new file** `lib/predict/contracts.ts` (addresses + ABIs), so `lib/contracts.ts` is never touched.

```
app/
  predict/
    page.tsx            # market list (Predict tab landing)
    [id]/page.tsx       # market detail: pools, live odds, deposit, evidence
    new/page.tsx        # create market (owner-gated in UI; contract enforces)
    my/page.tsx         # my positions + claim
  parlay/
    page.tsx            # build a parlay: pick legs, live combined multiplier, buy
    [id]/page.tsx       # ticket detail + settle
  api/
    markets/route.ts        # GET list, POST mirror after on-chain create
    markets/[id]/route.ts   # GET one, PATCH status/outcome
    markets/[id]/positions/route.ts  # GET/POST positions
    parlays/route.ts        # GET list, POST mirror after on-chain buy
    parlays/[id]/route.ts   # GET one, PATCH status

components/
  predict/
    MarketCard.tsx
    OddsBar.tsx            # pool ratio visual
    DepositPanel.tsx
    ParlaySlip.tsx        # running legs + combined multiplier
    OutcomePicker.tsx
    ClaimButton.tsx
```

API responses use the consistent envelope (`success`, `data`, `error`, `meta`) per house patterns. All USDC values render through `UsdcAmount` (6 decimals).

---

## 9. Flagged shared-file touches (the only non zero-touch points)

Called out explicitly rather than edited silently:

1. **`components/AppNav.tsx`** gets one new link to `/predict`. This is the single navbar used on every page, so the Predict tab cannot appear without it. Additive link, very low risk, but it is a shared file.
2. **`lib/engines/sports.ts`** is only touched if we later choose the DRY reuse option (add `export` to `computeActualOutcome` and the fetch helper). Phase 1 chooses the zero-touch copy, so this file is not touched at all.

No other shared file is edited. New contract addresses and ABIs go in `lib/predict/contracts.ts`, not `lib/contracts.ts`.

---

## 10. Environment and infrastructure (additive)

New env vars (Vercel + local), nothing existing changed:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_PREDICT_MARKET_CONTRACT` | Deployed PredictMarket address |
| `NEXT_PUBLIC_PARLAY_CONTRACT` | Deployed Parlay address |

Reused as-is: `RESOLVER_PRIVATE_KEY` (same EOA, authorized on the new contracts at deploy), `CRON_SECRET`, `SUPABASE_*`, `NEXT_PUBLIC_ARC_TESTNET_RPC`, `COINGECKO_API_KEY`, `API_FOOTBALL_KEY`, `YOUTUBE_API_KEY`.

New cron-job.org job: `GET https://<app>/api/cron/resolve-markets` every 5 minutes with the same Bearer token. Existing `/api/cron/resolve` job is untouched.

Zero-cost check: all free tiers. The parlay house pool is faucet USDC. No paid dependency introduced. **No risk to the zero-cost constraint.**

---

## 11. Phased delivery

Each phase ends green (build passes, PvP unaffected) and is independently demoable.

### Phase 0 - Branch and scaffold
- Cut `feat/predict` from `master`. Commit this PRD.
- Create empty folders: `contracts/src/predict/`, `lib/markets/engines/`, `lib/predict/`, `app/predict/`, `app/parlay/`, `components/predict/`.
- Add new env var placeholders to `.env.example`.
- Exit: `next build` green, no PvP file changed.

### Phase 1 - PredictMarket contract
- Implement `PredictMarket.sol` (deposit, propose, challenge, finalize, claim, void, refund, `poolInfo`).
- Foundry tests: pro-rata claim, void-refund, zero-winning-pool void, only-resolver propose, challenge window, deposit-after-cutoff revert. Target 80%+ coverage.
- Deploy to Arc testnet with `resolver` = existing resolver EOA, `owner` = deployer.
- Record address in `.env` and `lib/predict/contracts.ts`.

### Phase 2 - Markets off-chain
- Migration `006_create_markets.sql`.
- `lib/markets/engines/*` (copy crypto/sports/youtube, output outcome index) + `types.ts`.
- `lib/markets/resolver.ts` + `app/api/cron/resolve-markets/route.ts`.
- `app/api/markets/*` CRUD with envelope + `definition_hash` verification.
- Wire cron-job.org.
- Exit: create a market (script/owner), deposit from 2 wallets, resolver proposes, finalize, both claim correctly.

### Phase 3 - Predict frontend (single markets live)
- `app/predict/` pages + `components/predict/*`, reusing generic components.
- Add the Predict link to `AppNav.tsx` (flagged touch #1).
- Verify in preview: list, deposit, live odds, resolve, claim.
- Exit: single markets fully usable end to end.

### Phase 4 - Parlay contract
- Implement `Parlay.sol` (on-chain multiplier fold + cap, house pool, settle).
- Foundry tests: quote vs buy multiplier equality, reservation math, all-win payout, any-loss retain, void-leg refund, settle-blocked-until-every-leg-terminal, `buyTicket` reverts `InsufficientHouse` when the pool cannot cover the reserve. 80%+ coverage.
- Deploy, `fundHouse` with faucet USDC.

### Phase 5 - Parlay off-chain + frontend
- Migration `007_create_parlays.sql`.
- `app/api/parlays/*`, settlement pass in cron, "Settle" button.
- `app/parlay/` pages: slip, live combined multiplier, buy, ticket detail, settle.
- Exit: build a 2-leg parlay, both legs resolve, ticket pays or retains correctly.

### Phase 6 - Hardening and demo polish
- Edge cases: empty/single-sided pools, dust rounding, challenged markets, void propagation into parlays.
- Coverage pass to 80%+ across contracts and engine logic.
- Seed a small set of demo markets; write a short demo script (deposit -> resolve -> claim -> parlay).
- Merge `feat/predict` into `master` only after PvP regression is confirmed untouched.

### Phase 7 - Later, explicitly out of scope now
- Pyth on-chain crypto resolution (Arc-native, trust-minimized upgrade).
- Position exit / secondary market before resolution.
- Mainnet parlay bankroll or advanced pricing.

---

## 12. Testing

- **Contracts (Foundry):** unit tests per function, plus the edge rules in sections 4.1 and 4.2. 80%+ coverage before deploy.
- **Engines (TypeScript):** unit tests on the copied fetch/parse logic with mocked API responses (finished, pending, voided, malformed).
- **Resolver:** integration test with a mocked chain + Supabase for propose/void paths.
- **Frontend:** Playwright happy paths (create, deposit, claim, build parlay, settle) at key breakpoints; verify PvP pages still render unchanged.
- **Regression gate:** a checklist confirming every protected PvP file is byte-for-byte unchanged (git diff scoped to the protected paths must be empty except `AppNav.tsx`).

---

## 13. Definition of done

- Predict appears as a second nav section beside PvP.
- Single pooled markets: create, deposit, resolve deterministically, finalize, claim pro-rata, void-refund all working on Arc testnet.
- Parlays: build 2+ legs, on-chain locked multiplier, all-or-nothing settlement after every leg fully resolves, payout from the testnet house pool.
- PvP contract, table, resolver, cron, and pages unchanged (only `AppNav.tsx` edited).
- All free tier. No paid dependency. No secrets in `NEXT_PUBLIC_*`.
- 80%+ contract coverage. Demo script ready.

---

## 14. Open items to confirm before or during build

1. **Market creation:** owner-curated (recommended for a clean demo) vs fully permissionless. This PRD assumes owner-curated with open participation.
2. **`MAX_MULTIPLIER` cap value** (default 50x) and **`MIN_LEGS`** (default 2).
3. **Challenged-market handling in Phase 1:** owner arbitrates on testnet (re-propose or void), per section 7.4. Confirm this is acceptable versus building a fuller dispute flow now.
4. **Parlay settlement trigger:** cron auto-settle plus a manual "Settle" button (both included) vs manual only.

None of these block Phase 0 to Phase 3.
