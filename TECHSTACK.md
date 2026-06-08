# POP — Technical Stack Reference

> This document is the single source of truth for POP's current functional tech stack.
> Read this before adding any new feature to avoid breaking existing integrations.
> Last updated: 2026-05-31

---

## 1. Project Identity

| Item | Value |
|------|-------|
| App name | Pop |
| Description | 1v1 friend-betting app with AI-proposed resolution |
| Network | Arc Testnet (Chain ID: `5042002`) |
| Live URL | https://pop-arc.vercel.app |
| GitHub | https://github.com/MaleekT/pop-app |
| Local path | `C:\Users\HP\Desktop\POP\pop` |

---

## 2. Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.2.6 | App Router, SSR, API routes |
| React | 19.2.4 | UI framework |
| TypeScript | ^5 | Type safety |
| Tailwind CSS | ^4 | Utility styling (tokens in `app/globals.css` via `@theme`) |
| Framer Motion | ^12.39.0 | Animations (New Bet page stagger, card hover lift) |
| wagmi | ^2.19.5 | Blockchain wallet hooks |
| viem | ^2.49.3 | Low-level EVM interactions, ABI encoding, event parsing |
| @rainbow-me/rainbowkit | ^2.2.11 | Wallet connect UI |
| @tanstack/react-query | ^5.100.10 | Server state management |
| canvas-confetti | ^1.9.4 | Win celebration animation |

### Font system
- Heading: Bebas Neue (`--font-heading`)
- Body/Mono: Space Grotesk (`--font-body`, `--font-mono`)

### Design tokens (defined in `app/globals.css`)
```
--color-pop-bg:        #0B0B0F
--color-pop-surface:   #15151C
--color-pop-surface-2: #1F1F28
--color-pop-text:      #F5F5F7
--color-pop-muted:     #A1A1AA
--color-pop-accent:    #D7FF1E   ← primary CTA / winnings
--color-pop-locked:    #FF3DA1
--color-pop-pending:   #FBBF24
--color-pop-win:       #22C55E
--color-pop-danger:    #EF4444
```

---

## 3. Blockchain Stack

| Item | Value |
|------|-------|
| Chain | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Native gas token | USDC (treated as 18 decimals for gas) |
| Stake/escrow token | USDC ERC-20 (**6 decimals** — critical) |
| USDC contract | `0x3600000000000000000000000000000000000000` |
| Pop contract (v3, active) | `0x18A067EE5cE4BA06a332834F041265390E4E84Cd` |
| Contract framework | Foundry (Solidity ^0.8.24, OpenZeppelin) |

### CRITICAL: USDC decimal rule
All stake/escrow values use **6 decimals**.
```ts
parseUnits('1', 6)    // = 1000000n  ✅ correct
parseUnits('1', 18)   // catastrophically wrong ❌
```
Every USDC value shown to users goes through `<UsdcAmount amount={bigint} />` → `formatUnits(value, 6)`.

### Smart contract: Pop.sol
Located at `contracts/src/Pop.sol`. Key constants:
```
CHALLENGE_WINDOW    = 3600 seconds (1 hour)
RESOLUTION_TIMEOUT  = 30 days
```
Status enum order (must stay in sync with frontend `CONTRACT_STATUS` array):
```
0=Pending, 1=Locked, 2=Proposed, 3=Resolved,
4=Disputed, 5=Cancelled, 6=Expired, 7=Open, 8=Voided
```

### Contract deployment history
| Label | Address | Status |
|-------|---------|--------|
| v1 (abandoned) | `0xa85d117afc00ddc9f8bd90b88dd6d4c9c47015d6` | Dead |
| DeployTest | `0x8708855dc4dbf383120aa71615e8789378fd29b8` | Test only |
| v2 (old) | `0xc745d8294d0d3e2ecd2791b8310c200d65bd5445` | Dead |
| **v3 (active)** | `0x18A067EE5cE4BA06a332834F041265390E4E84Cd` | **Current** |

> Every time the contract is redeployed, update `NEXT_PUBLIC_POP_CONTRACT` in `.env.local`
> and in Vercel environment variables. The DB's `contract_address` column scopes all bets
> to their contract — so old data is never affected by a redeploy.

---

## 4. Backend / Database

### Supabase
| Item | Value |
|------|-------|
| Provider | Supabase (hosted Postgres) |
| Project ref | `kapwqctankchspdldrpy` |
| Client | `@supabase/supabase-js` ^2.105.4 |
| Access | Server-side only via `lib/supabase.ts` — service role key never reaches browser |

### Database schema

**`bets` table**
```sql
id              bigserial primary key
on_chain_id     text        not null
contract_address text       not null          ← scopes bet to its contract deployment
creator         text        not null
opponent        text        not null          ← empty string for open/lobby bets until claimed
stake           text        not null          ← raw bigint string (USDC 6 decimals)
definition_text text        not null
definition_hash text        not null          ← keccak256(definition_text), verified server-side
template_key    text        not null
params          jsonb       not null default '{}'
resolve_at      timestamptz not null
claim_deadline  timestamptz null              ← only for Open/lobby bets
status          text        not null default 'Pending'
proposed_winner text        null
evidence        jsonb       null
created_at      timestamptz not null default now()

UNIQUE (on_chain_id, contract_address)        ← composite key, not just on_chain_id
```

**`bet_invites` table**
```sql
id              uuid primary key default gen_random_uuid()
creator         text not null
template_key    text not null
params          jsonb not null
definition_text text not null
definition_hash text not null
resolve_at      timestamptz not null
join_deadline   timestamptz not null
stake           text not null
pending_opponent text null
status          text not null default 'open'  ← 'open' | 'claimed' | 'cancelled'
created_at      timestamptz not null default now()
```

### Migrations (all applied)
```
001_create_bets.sql
002_create_invites.sql
003_add_claim_deadline.sql
004_add_contract_address.sql    ← added contract_address, replaced unique constraint
```

---

## 5. API Routes

All routes live in `app/api/`. Supabase writes are server-side only.

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/bets` | GET | Fetch bets for a wallet address (scoped to active contract) | None |
| `/api/bets` | POST | Save new bet to DB after on-chain creation | None |
| `/api/bets/[id]` | GET | Fetch single bet by on_chain_id (scoped to active contract) | None |
| `/api/bets/[id]` | PATCH | Update bet status and/or opponent address | None |
| `/api/lobby` | GET | Fetch open bets waiting for claimers (scoped to active contract) | None |
| `/api/invites` | POST | Create a shareable invite link | None |
| `/api/invites/[code]` | GET | Fetch invite by code | None |
| `/api/profile` | GET | Fetch user profile/handle | None |
| `/api/crypto/price` | GET | Fetch current price from CoinGecko | None |
| `/api/sports/search` | GET | Search fixtures via TheSportsDB / API-Football | None |
| `/api/cron/resolve` | GET | Run the resolver engine (settle due bets) | Bearer `CRON_SECRET` |
| `/api/demo/accept` | POST | House wallet accepts a demo bet on-chain | Internal |
| `/api/demo/house-address` | GET | Returns house wallet address | None |

---

## 6. External APIs

### CoinGecko (crypto price resolution)
- **Plan:** Free Demo tier
- **Endpoint:** `GET https://api.coingecko.com/api/v3/simple/price?ids={coin}&vs_currencies=usd`
- **Also used client-side:** `https://api.coingecko.com/api/v3/search?query={q}` for coin autocomplete
- **Rate limit:** ~30 calls/min, 10,000/month
- **Env var:** `COINGECKO_API_KEY` (optional — free public endpoint works without it)
- **Used by:** `lib/engines/crypto-price.ts`, `app/api/crypto/price/route.ts`

### TheSportsDB (sports resolution — primary)
- **Plan:** Free (API key `3` = free test key)
- **Endpoint:** `GET https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id={eventId}`
- **Fixture ID prefix:** `tsdb:` (e.g. `tsdb:2470477`)
- **Status values that mean finished:** `Match Finished`, `FT`, `AOT`, `AET`, `PEN`
- **Status values that void bet:** `Postponed`, `Cancelled`, `Abandoned`, `Deleted`
- **No API key required in env** — key `3` is embedded in the URL
- **Used by:** `lib/engines/sports.ts`

### API-Football (sports resolution — fallback)
- **Plan:** Free tier
- **Endpoints:**
  - Football: `GET https://v3.football.api-sports.io/fixtures?id={id}`
  - Basketball: `GET https://v1.basketball.api-sports.io/games?id={id}`
- **Header:** `x-apisports-key: {API_FOOTBALL_KEY}`
- **Env var:** `API_FOOTBALL_KEY`
- **Used for:** Legacy bets and national team fixtures not covered by TheSportsDB
- **Used by:** `lib/engines/sports.ts`

### YouTube Data API v3 (YouTube resolution)
- **Plan:** Free (10,000 quota units/day)
- **Endpoints:**
  - Video views: `videos.list?part=statistics&id={videoId}`
  - Channel subs: `channels.list?part=statistics&id={channelId}`
- **Env var:** `YOUTUBE_API_KEY`
- **Used by:** `lib/engines/youtube.ts`

---

## 7. Bet Templates

Six templates, displayed in this order on the New Bet page:

| Order | Key | Title | Resolution engine |
|-------|-----|-------|-------------------|
| 1 | `crypto_price_above` | Crypto price above | CoinGecko |
| 2 | `crypto_price_below` | Crypto price below | CoinGecko |
| 3 | `sports_winner` | Sports match winner | TheSportsDB / API-Football |
| 4 | `sports_score` | Sports score over/under | TheSportsDB / API-Football |
| 5 | `youtube_views` | YouTube video views | YouTube Data API v3 |
| 6 | `youtube_subs` | YouTube channel subscribers | YouTube Data API v3 |

Defined in `lib/templates.ts`. To add a new template:
1. Add a new `TemplateKey` union type
2. Add a `Template` object to `TEMPLATES`
3. Add a resolver engine in `lib/engines/`
4. Register the engine in `lib/resolver.ts` → `getEngine()`
5. Add to `PICK_ORDER` array in `app/new/page.tsx`
6. Add card metadata to `CARD_META` in `app/new/page.tsx`

---

## 8. Resolver Engine

The resolver runs on a cron schedule and settles bets automatically.

### How it works
1. Cron triggers `GET /api/cron/resolve` with `Authorization: Bearer {CRON_SECRET}`
2. Resolver queries DB for all `Locked` bets where `resolve_at <= now` AND `contract_address = current contract`
3. For each bet, calls the appropriate engine (crypto/sports/youtube)
4. Engine returns: `{ pending: true }` (retry later) | `{ winner, rawValue, sourceUrl }` | `{ voided: true }`
5. On success: calls `proposeResolution(betId, winnerAddress, evidenceHash)` on-chain
6. Updates DB status to `Proposed` with evidence

### Cron schedule
- **Vercel cron:** `0 0 * * *` (daily at midnight UTC — Hobby plan limitation)
- **cron-job.org:** Every 5 minutes → `https://pop-arc.vercel.app/api/cron/resolve` with Bearer token
- Both are in place; cron-job.org provides the actual frequent resolution

### Key constraint
The resolver wallet address (`RESOLVER_PRIVATE_KEY`) **must match** the `resolver` address the smart contract was deployed with. If they don't match, `proposeResolution` will always revert.

---

## 9. Bet Lifecycle

```
Created (Pending/Open)
    ↓ opponent accepts / lobby claimed
Locked  ←── resolver runs here after resolveAt
    ↓ resolver calls proposeResolution
Proposed
    ↓ challenge window (1 hour) passes with no dispute
Resolved  ←── winner calls finalize() to collect pot
    OR
    ↓ participant challenges within 1 hour
Disputed
    ↓ both parties vote same winner
Resolved
    OR
    ↓ 30 days pass with no resolution (RESOLUTION_TIMEOUT)
Expired   ←── both get refund via claimExpired()
```

**Special statuses:**
- `Cancelled` — creator cancels a Pending bet
- `Voided` — match postponed/cancelled; stakes returned
- `Open` — lobby bet waiting for a claimer

---

## 10. Critical Implementation Details

These are non-obvious decisions that must NOT be changed without understanding the impact:

### contract_address scoping
Every bet in the DB has a `contract_address` column. The unique constraint is `(on_chain_id, contract_address)` — NOT just `on_chain_id`. This prevents ID collisions when the contract is redeployed (redeploying resets on-chain IDs to 1). **All DB queries in API routes filter by `process.env.NEXT_PUBLIC_POP_CONTRACT`.**

### opponent field for lobby bets
Open/lobby bets are created with `opponent = ''`. When a user claims a lobby bet on-chain, the PATCH call to `/api/bets/[id]` includes `{ status: 'Locked', opponent: claimerAddress }`. This writes the claimer's address into the DB so My Bets query (`.or('creator.eq.X,opponent.eq.X')`) can find the bet for both parties.

### definition_hash verification
When a bet is created, the server re-computes `keccak256(toHex(definition_text))` and verifies it matches the `definition_hash` submitted. This prevents tampered bet definitions. On the bet detail page, the same check runs client-side against the on-chain hash.

### Claim refund button timing
The "Claim refund (resolver timed out)" button in `app/bet/[id]/page.tsx` only appears when `acceptedAt + 30 days` has passed — matching the contract's `RESOLUTION_TIMEOUT`. It does NOT appear just because `resolveAt` has passed. This prevents showing a button that would revert on-chain with `TooEarly`.

### All datetime inputs are UTC
The `asUTC()` helper in `app/new/page.tsx` appends `:00Z` to datetime-local input values before converting to Date objects. This ensures all times are treated as UTC regardless of the user's local timezone.

### Demo mode (house wallet)
The `/demo` page creates bets against a house wallet (`HOUSE_PRIVATE_KEY`). The house wallet and resolver wallet use the same private key in the current testnet setup. The demo accept endpoint upserts (not inserts) to handle retries gracefully.

---

## 11. Environment Variables

All secrets live in `.env.local` (excluded from git). Must also be set in Vercel dashboard.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_ARC_TESTNET_RPC` | Yes | Arc Testnet RPC URL |
| `NEXT_PUBLIC_POP_CONTRACT` | Yes | Active Pop contract address |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Yes | WalletConnect project ID |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `RESOLVER_PRIVATE_KEY` | Yes | Must match `resolver` arg used at contract deploy |
| `HOUSE_PRIVATE_KEY` | Yes | Demo mode house wallet |
| `DEPLOYER_PRIVATE_KEY` | Yes | Foundry deploy only |
| `CRON_SECRET` | Yes | Bearer token for `/api/cron/resolve` |
| `API_FOOTBALL_KEY` | Yes | API-Football key for sports resolution |
| `COINGECKO_API_KEY` | No | CoinGecko Demo key (free public endpoint works without) |
| `YOUTUBE_API_KEY` | No | Required for YouTube bet resolution |

---

## 12. File Structure (key files)

```
pop/
├── app/
│   ├── page.tsx                    ← Homepage (uses AppNav, no inline nav)
│   ├── new/page.tsx                ← New Bet (template picker + form + confirm steps)
│   ├── my/page.tsx                 ← My Bets dashboard
│   ├── bet/[id]/page.tsx           ← Bet detail + all actions
│   ├── lobby/page.tsx              ← Open bets lobby
│   ├── demo/page.tsx               ← Demo vs house
│   ├── invite/[code]/page.tsx      ← Invite acceptance page
│   ├── settings/page.tsx           ← User profile/handle settings
│   ├── globals.css                 ← Design tokens + global styles
│   └── api/
│       ├── bets/route.ts           ← GET + POST bets
│       ├── bets/[id]/route.ts      ← GET + PATCH single bet
│       ├── lobby/route.ts          ← GET open bets
│       ├── invites/route.ts        ← POST invite
│       ├── invites/[code]/route.ts ← GET invite
│       ├── profile/route.ts        ← GET/POST profile
│       ├── crypto/price/route.ts   ← GET live price
│       ├── sports/search/route.ts  ← GET fixture search
│       ├── cron/resolve/route.ts   ← GET resolver trigger
│       ├── demo/accept/route.ts    ← POST house accepts demo bet
│       └── demo/house-address/route.ts
├── components/
│   ├── AppNav.tsx                  ← THE single navbar (used on every page)
│   ├── Logo.tsx
│   ├── StatusBadge.tsx
│   ├── UsdcAmount.tsx
│   ├── TxLink.tsx
│   ├── Countdown.tsx
│   ├── pop-celebration.tsx         ← Confetti on win
│   └── providers.tsx               ← wagmi + RainbowKit + React Query setup
├── lib/
│   ├── contracts.ts                ← POP_CONTRACT, USDC address, ABIs
│   ├── templates.ts                ← 6 bet templates
│   ├── resolver.ts                 ← Main resolver logic
│   ├── supabase.ts                 ← Server-side Supabase client
│   ├── db.types.ts                 ← TypeScript types for DB rows
│   ├── arc.ts                      ← viem publicClient for Arc
│   └── engines/
│       ├── crypto-price.ts         ← CoinGecko resolution
│       ├── sports.ts               ← TheSportsDB + API-Football resolution
│       ├── youtube.ts              ← YouTube Data API resolution
│       └── types.ts                ← Shared engine types
├── contracts/
│   ├── src/Pop.sol                 ← Smart contract
│   ├── test/Pop.t.sol              ← Foundry tests
│   ├── script/Deploy.s.sol         ← Deploy script
│   └── broadcast/                  ← Deployment receipts (public, no secrets)
├── supabase/migrations/            ← SQL migration files (001–004)
├── vercel.json                     ← Cron: daily at midnight UTC
└── public/                         ← Static assets
```

---

## 13. Infrastructure

| Service | Purpose | Notes |
|---------|---------|-------|
| Vercel | Hosting + deployment | Auto-deploys on push to `master`; Hobby plan |
| GitHub | Source control | https://github.com/MaleekT/pop-app; public repo |
| Supabase | Database | Hosted Postgres; project ref `kapwqctankchspdldrpy` |
| cron-job.org | Frequent resolver trigger | Every 5 minutes; free plan; URL: `https://pop-arc.vercel.app/api/cron/resolve` |
| Arc Testnet | Blockchain | All on-chain activity; testnet only |

---

## 14. What NOT to Do

- **Never use `parseUnits(x, 18)` for USDC** — always use 6 decimals
- **Never query bets without `contract_address` filter** — will return dead bets from old contracts
- **Never hardcode the contract address** — always read from `process.env.NEXT_PUBLIC_POP_CONTRACT`
- **Never put secrets in `NEXT_PUBLIC_*` variables** — those are exposed to the browser
- **Never change the `CONTRACT_STATUS` array order** — it maps directly to the Solidity enum
- **Never call `proposeResolution` with an address that isn't `creator` or `opponent`** — contract will revert
- **Never write a new bet without `definition_hash`** — on-chain tamper detection depends on it
- **Never add an LLM to the resolution decision path** — resolution must be deterministic code only
